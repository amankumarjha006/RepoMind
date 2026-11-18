import pytest
import httpx
from unittest.mock import MagicMock
from app.core.config import Settings
from app.services.embedding.cloudflare import CloudflareEmbeddingProvider, DEFAULT_CLOUDFLARE_MODEL
from app.services.embedding.factory import get_embedding_provider
from app.services.embedding.exceptions import (
    EmbeddingProviderAuthError,
    EmbeddingProviderRateLimitError,
    EmbeddingProviderServerError,
)
from app.services.indexing import EmbeddingError


def test_cloudflare_provider_init():
    provider = CloudflareEmbeddingProvider(
        account_id="test_acc",
        api_token="test_tok",
        model=DEFAULT_CLOUDFLARE_MODEL,
        dimension=768,
    )
    assert provider.account_id == "test_acc"
    assert provider.api_token == "test_tok"
    assert provider.model == "@cf/baai/bge-base-en-v1.5"
    assert provider.dimension == 768
    assert provider.active_model == "@cf/baai/bge-base-en-v1.5"


def test_cloudflare_provider_empty():
    provider = CloudflareEmbeddingProvider(account_id="acc", api_token="tok")
    assert provider.embed([]) == []


def test_cloudflare_provider_missing_credentials():
    provider = CloudflareEmbeddingProvider(account_id="", api_token="")
    with pytest.raises(EmbeddingError) as exc_info:
        provider.embed(["test"])
    assert "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be configured" in str(exc_info.value)


def test_cloudflare_provider_embed_success(monkeypatch):
    provider = CloudflareEmbeddingProvider(
        account_id="acc123",
        api_token="tok456",
        dimension=768,
    )

    mock_vec1 = [0.1] * 768
    mock_vec2 = [0.2] * 768

    def mock_post(url, headers, json):
        assert "acc123" in url
        assert headers["Authorization"] == "Bearer tok456"
        assert json["text"] == ["chunk one", "chunk two"]

        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "result": {"shape": [2, 768], "data": [mock_vec1, mock_vec2]},
            "success": True,
            "errors": [],
            "messages": [],
        }
        return mock_resp

    monkeypatch.setattr(httpx.Client, "post", lambda self, url, **kwargs: mock_post(url, kwargs["headers"], kwargs["json"]))

    vectors = provider.embed(["chunk one", "chunk two"])
    assert len(vectors) == 2
    assert len(vectors[0]) == 768
    assert len(vectors[1]) == 768
    assert vectors[0][0] == 0.1
    assert vectors[1][0] == 0.2


def test_cloudflare_provider_rate_limit_429(monkeypatch):
    provider = CloudflareEmbeddingProvider(account_id="acc", api_token="tok")

    def mock_post(*args, **kwargs):
        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 429
        mock_resp.headers = {"Retry-After": "15"}
        mock_resp.text = "Rate limit exceeded"
        return mock_resp

    monkeypatch.setattr(httpx.Client, "post", mock_post)

    with pytest.raises(EmbeddingProviderRateLimitError) as exc_info:
        provider.embed(["test text"])
    assert exc_info.value.retry_after == 15.0


def test_cloudflare_provider_auth_error_401(monkeypatch):
    provider = CloudflareEmbeddingProvider(account_id="acc", api_token="bad_tok")

    def mock_post(*args, **kwargs):
        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"
        return mock_resp

    monkeypatch.setattr(httpx.Client, "post", mock_post)

    with pytest.raises(EmbeddingProviderAuthError):
        provider.embed(["test text"])


def test_cloudflare_dimension_mismatch(monkeypatch):
    provider = CloudflareEmbeddingProvider(account_id="acc", api_token="tok", dimension=768)

    def mock_post(*args, **kwargs):
        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "result": {"shape": [1, 512], "data": [[0.5] * 512]},  # 512 instead of 768
            "success": True,
        }
        return mock_resp

    monkeypatch.setattr(httpx.Client, "post", mock_post)

    with pytest.raises(EmbeddingError) as exc_info:
        provider.embed(["test text"])
    assert "dimension mismatch" in str(exc_info.value)


def test_cloudflare_factory():
    settings = Settings(
        EMBEDDING_PROVIDER="cloudflare",
        CLOUDFLARE_ACCOUNT_ID="acc_test",
        CLOUDFLARE_API_TOKEN="tok_test",
        EMBEDDING_DIMENSION=768,
    )
    provider = get_embedding_provider(settings)
    assert isinstance(provider, CloudflareEmbeddingProvider)
    assert provider.model == "@cf/baai/bge-base-en-v1.5"
    assert provider.account_id == "acc_test"
    assert provider.api_token == "tok_test"

    # Singleton caching
    provider2 = get_embedding_provider(settings)
    assert provider is provider2
