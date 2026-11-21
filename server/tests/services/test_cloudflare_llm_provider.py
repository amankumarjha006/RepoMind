import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest

from app.core.config import Settings
from app.services.llm.cloudflare import CloudflareLLMProvider, DEFAULT_CLOUDFLARE_LLM_MODEL
from app.services.llm.exceptions import (
    PermanentLLMError,
    TransientLLMError,
    ProviderUnavailableError,
)
from app.services.llm.factory import create_llm_provider


@pytest.fixture
def cf_provider():
    return CloudflareLLMProvider(
        account_id="test_acc_123",
        api_token="test_tok_456",
        model="@cf/meta/llama-3.1-8b-instruct",
    )


def test_missing_credentials_raises_permanent():
    with pytest.raises(PermanentLLMError) as exc:
        CloudflareLLMProvider(account_id=None, api_token="tok")
    assert "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be provided" in str(exc.value)

    with pytest.raises(PermanentLLMError) as exc2:
        CloudflareLLMProvider(account_id="acc", api_token=None)
    assert "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be provided" in str(exc2.value)


@pytest.mark.asyncio
async def test_generate_success(cf_provider):
    mock_resp = MagicMock(status_code=200, is_success=True)
    mock_resp.json.return_value = {
        "result": {"response": "Hello from Llama 3.1!"},
        "success": True,
        "errors": [],
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        result = await cf_provider.generate(
            prompt="Tell me a joke",
            system_instruction="You are a funny assistant",
        )

        assert result == "Hello from Llama 3.1!"
        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        assert kwargs["headers"]["Authorization"] == "Bearer test_tok_456"
        assert kwargs["json"]["messages"][0] == {"role": "system", "content": "You are a funny assistant"}
        assert kwargs["json"]["messages"][1] == {"role": "user", "content": "Tell me a joke"}
        assert kwargs["json"]["stream"] is False


@pytest.mark.asyncio
async def test_generate_result_as_text_or_list(cf_provider):
    # Test result as dict with 'text'
    mock_resp1 = MagicMock(status_code=200, is_success=True)
    mock_resp1.json.return_value = {"result": {"text": "Alternative key works"}}
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp1):
        res1 = await cf_provider.generate("Prompt")
        assert res1 == "Alternative key works"

    # Test result as string directly
    mock_resp2 = MagicMock(status_code=200, is_success=True)
    mock_resp2.json.return_value = {"result": "Direct string works"}
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp2):
        res2 = await cf_provider.generate("Prompt")
        assert res2 == "Direct string works"


@pytest.mark.asyncio
async def test_generate_transient_errors(cf_provider):
    for code in (429, 500, 502, 503, 504):
        mock_resp = MagicMock(status_code=code, is_success=False)
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
            with pytest.raises(TransientLLMError):
                await cf_provider.generate("Prompt")

    # Timeout
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=httpx.TimeoutException("timeout")):
        with pytest.raises(TransientLLMError):
            await cf_provider.generate("Prompt")

    # Network error
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=httpx.NetworkError("network down")):
        with pytest.raises(TransientLLMError):
            await cf_provider.generate("Prompt")


@pytest.mark.asyncio
async def test_generate_model_not_found_raises_provider_unavailable(cf_provider):
    mock_resp = MagicMock(status_code=404, is_success=False)
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        with pytest.raises(ProviderUnavailableError) as exc:
            await cf_provider.generate("Prompt")
        assert "unavailable" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_permanent_auth_and_malformed_errors(cf_provider):
    # 401 Unauthorized
    mock_resp401 = MagicMock(status_code=401, is_success=False, text="Invalid token")
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp401):
        with pytest.raises(PermanentLLMError):
            await cf_provider.generate("Prompt")

    # Empty response
    mock_resp_empty = MagicMock(status_code=200, is_success=True)
    mock_resp_empty.json.return_value = {"result": None, "errors": [{"message": "Rate limit / quota"}]}
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp_empty):
        with pytest.raises(PermanentLLMError):
            await cf_provider.generate("Prompt")


@pytest.mark.asyncio
async def test_stream_success(cf_provider):
    sse_lines = [
        'data: {"response": "Hello "}',
        "",
        'data: {"response": "world!"}',
        "",
        "data: [DONE]",
    ]

    class FakeStreamResponse:
        status_code = 200
        is_success = True

        async def aiter_lines(self):
            for l in sse_lines:
                yield l

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("httpx.AsyncClient.stream", return_value=FakeStreamResponse()):
        chunks = []
        async for chunk in cf_provider.stream("Prompt", "System instruction"):
            chunks.append(chunk)

        assert chunks == ["Hello ", "world!"]


@pytest.mark.asyncio
async def test_stream_transient_and_permanent_errors(cf_provider):
    class FakeErrorResponse:
        def __init__(self, status_code, is_success=False):
            self.status_code = status_code
            self.is_success = is_success

        async def aread(self):
            return b"error body"

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("httpx.AsyncClient.stream", return_value=FakeErrorResponse(503)):
        with pytest.raises(TransientLLMError):
            async for _ in cf_provider.stream("Prompt"):
                pass

    with patch("httpx.AsyncClient.stream", return_value=FakeErrorResponse(401)):
        with pytest.raises(PermanentLLMError):
            async for _ in cf_provider.stream("Prompt"):
                pass


@pytest.mark.asyncio
async def test_api_keys_never_in_exception_messages():
    secret_token = "SUPER_SECRET_CF_TOKEN_777"
    provider = CloudflareLLMProvider(
        account_id="acc_secret_888",
        api_token=secret_token,
    )

    mock_resp = MagicMock(status_code=401, is_success=False, text=f"Auth error with {secret_token}")
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        with pytest.raises(PermanentLLMError) as exc:
            await provider.generate("Prompt")
        assert secret_token not in str(exc.value)
        assert "[REDACTED]" in str(exc.value)


def test_factory_creates_cloudflare_when_requested():
    settings = Settings(
        LLM_PRIMARY_PROVIDER="cloudflare",
        LLM_FALLBACK_ENABLED=False,
        CLOUDFLARE_ACCOUNT_ID="cf_acc",
        CLOUDFLARE_API_TOKEN="cf_tok",
    )
    provider = create_llm_provider(settings)
    assert isinstance(provider, CloudflareLLMProvider)
    assert provider.account_id == "cf_acc"
    assert provider.api_token == "cf_tok"


def test_factory_auto_selects_cloudflare_when_gemini_key_missing():
    settings = Settings(
        LLM_PRIMARY_PROVIDER="gemini",
        GEMINI_API_KEY=None,
        LLM_FALLBACK_ENABLED=False,
        CLOUDFLARE_ACCOUNT_ID="cf_acc",
        CLOUDFLARE_API_TOKEN="cf_tok",
    )
    provider = create_llm_provider(settings)
    assert isinstance(provider, CloudflareLLMProvider)
    assert provider.account_id == "cf_acc"
    assert provider.api_token == "cf_tok"
