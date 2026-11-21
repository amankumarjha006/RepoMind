import json
import logging
from typing import AsyncGenerator, Optional
import httpx

from app.services.llm.exceptions import (
    LLMError,
    TransientLLMError,
    PermanentLLMError,
    ProviderUnavailableError,
)
from app.services.llm.provider import LLMProvider

logger = logging.getLogger(__name__)

DEFAULT_CLOUDFLARE_LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct"


class CloudflareLLMProvider(LLMProvider):
    """
    Implements the LLMProvider protocol using Cloudflare Workers AI REST API.
    Provides serverless LLM generation and streaming with edge-hosted open-weights models.
    """

    def __init__(
        self,
        account_id: Optional[str],
        api_token: Optional[str],
        model: str = DEFAULT_CLOUDFLARE_LLM_MODEL,
        max_tokens: int = 2048,
        timeout: float = 60.0,
    ):
        self.model = model
        self.max_tokens = max_tokens
        self.timeout = timeout

        if not account_id or not api_token:
            raise PermanentLLMError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be provided")

        self.account_id = account_id
        self.api_token = api_token
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.model}"

    def _sanitize_error(self, text: str) -> str:
        """Strip sensitive credentials from error strings."""
        if not text:
            return ""
        sanitized = text
        if self.api_token:
            sanitized = sanitized.replace(self.api_token, "[REDACTED]")
        if self.account_id:
            sanitized = sanitized.replace(self.account_id, "[REDACTED]")
        return sanitized

    async def generate(self, prompt: str, system_instruction: Optional[str] = None) -> str:
        """
        Generate text completion from Cloudflare Workers AI.
        """
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

        payload = {
            "messages": messages,
            "stream": False,
            "max_tokens": self.max_tokens,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.base_url,
                    json=payload,
                    headers=headers,
                    timeout=httpx.Timeout(self.timeout),
                )

            # Map status codes
            if response.status_code in (401, 403):
                raise PermanentLLMError(
                    f"Cloudflare Workers AI auth error {response.status_code}: {self._sanitize_error(response.text)}"
                )

            if response.status_code in (429, 500, 502, 503, 504):
                raise TransientLLMError(f"Cloudflare Workers AI transient error {response.status_code}")

            if response.status_code == 404:
                raise ProviderUnavailableError(f"Cloudflare Workers AI model {self.model} unavailable (404)")

            if not response.is_success:
                raise PermanentLLMError(
                    f"Cloudflare Workers AI permanent error {response.status_code}: {self._sanitize_error(response.text)}"
                )

            data = response.json()
            if not isinstance(data, dict):
                raise PermanentLLMError("Received non-dictionary JSON response from Cloudflare Workers AI")

            result = data.get("result")
            text = None
            if isinstance(result, dict):
                text = result.get("response") or result.get("text")
            elif isinstance(result, str):
                text = result
            elif isinstance(result, list) and result and isinstance(result[0], dict):
                text = result[0].get("response") or result[0].get("text")

            if not text:
                errors = data.get("errors")
                if errors:
                    raise PermanentLLMError(
                        f"Cloudflare Workers AI returned errors: {self._sanitize_error(str(errors))}"
                    )
                raise PermanentLLMError("Received empty or malformed response from Cloudflare Workers AI")

            return text

        except TransientLLMError:
            raise
        except PermanentLLMError:
            raise
        except httpx.TimeoutException as e:
            raise TransientLLMError(f"Cloudflare Workers AI timeout: {self._sanitize_error(str(e))}") from e
        except httpx.NetworkError as e:
            raise TransientLLMError(f"Cloudflare Workers AI network error: {self._sanitize_error(str(e))}") from e
        except Exception as e:
            raise PermanentLLMError(f"Cloudflare Workers AI unexpected error: {self._sanitize_error(str(e))}") from e

    async def stream(self, prompt: str, system_instruction: Optional[str] = None) -> AsyncGenerator[str, None]:
        """
        Stream text completion from Cloudflare Workers AI using Server-Sent Events.
        """
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

        payload = {
            "messages": messages,
            "stream": True,
            "max_tokens": self.max_tokens,
        }

        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    self.base_url,
                    json=payload,
                    headers=headers,
                    timeout=httpx.Timeout(self.timeout),
                ) as response:
                    if response.status_code in (401, 403):
                        error_bytes = await response.aread()
                        err_text = self._sanitize_error(error_bytes.decode("utf-8", errors="ignore"))
                        raise PermanentLLMError(f"Cloudflare Workers AI auth error {response.status_code}: {err_text}")

                    if response.status_code in (429, 500, 502, 503, 504):
                        raise TransientLLMError(f"Cloudflare Workers AI transient error {response.status_code}")

                    if response.status_code == 404:
                        raise ProviderUnavailableError(f"Cloudflare Workers AI model {self.model} unavailable (404)")

                    if not response.is_success:
                        error_bytes = await response.aread()
                        err_text = self._sanitize_error(error_bytes.decode("utf-8", errors="ignore"))
                        raise PermanentLLMError(f"Cloudflare Workers AI permanent error {response.status_code}: {err_text}")

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        line = line.strip()
                        if line.startswith("data:"):
                            data_str = line[5:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data_str)
                                content = chunk.get("response")
                                if content:
                                    yield content
                            except json.JSONDecodeError:
                                if data_str:
                                    yield data_str

        except TransientLLMError:
            raise
        except PermanentLLMError:
            raise
        except httpx.TimeoutException as e:
            raise TransientLLMError(f"Cloudflare Workers AI timeout: {self._sanitize_error(str(e))}") from e
        except httpx.NetworkError as e:
            raise TransientLLMError(f"Cloudflare Workers AI network error: {self._sanitize_error(str(e))}") from e
        except Exception as e:
            raise PermanentLLMError(f"Cloudflare Workers AI unexpected stream error: {self._sanitize_error(str(e))}") from e
