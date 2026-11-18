import logging
from typing import List, Optional
import httpx
from app.services.embedding.provider import EmbeddingProvider
from app.services.indexing import EmbeddingError
from app.services.embedding.exceptions import (
    EmbeddingProviderError,
    EmbeddingProviderAuthError,
    EmbeddingProviderRateLimitError,
    EmbeddingProviderTimeoutError,
    EmbeddingProviderConnectionError,
    EmbeddingProviderServerError,
    EmbeddingProviderClientError,
)

logger = logging.getLogger(__name__)

DEFAULT_CLOUDFLARE_MODEL = "@cf/baai/bge-base-en-v1.5"


class CloudflareEmbeddingProvider(EmbeddingProvider):
    """
    Implements the EmbeddingProvider protocol using Cloudflare Workers AI REST API.
    Provides serverless GPU embeddings with zero local RAM footprint.
    """

    def __init__(
        self,
        account_id: str,
        api_token: str,
        model: str = DEFAULT_CLOUDFLARE_MODEL,
        dimension: int = 768,
        timeout: float = 30.0,
    ):
        self.account_id = account_id
        self.api_token = api_token
        self.model = model
        self.dimension = dimension
        self.timeout = timeout

    @property
    def active_model(self) -> str:
        return self.model

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        if not self.account_id or not self.api_token:
            raise EmbeddingError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be configured")

        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.model}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }
        payload = {"text": texts}

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, headers=headers, json=payload)
        except httpx.TimeoutException as e:
            raise EmbeddingProviderTimeoutError(f"Cloudflare Workers AI timeout: {e}") from e
        except httpx.RequestError as e:
            raise EmbeddingProviderConnectionError(f"Cloudflare Workers AI connection error: {e}") from e

        status_code = response.status_code
        if status_code == 429:
            retry_after = None
            retry_hdr = response.headers.get("Retry-After")
            if retry_hdr:
                try:
                    retry_after = float(retry_hdr)
                except (ValueError, TypeError):
                    pass
            raise EmbeddingProviderRateLimitError(
                f"Cloudflare Workers AI rate limited: {response.text}", retry_after
            ) from None
        elif status_code in (401, 403):
            raise EmbeddingProviderAuthError(
                f"Cloudflare Workers AI authentication failed ({status_code}): {response.text}"
            ) from None
        elif 400 <= status_code < 500:
            raise EmbeddingProviderClientError(
                f"Cloudflare Workers AI client error ({status_code}): {response.text}"
            ) from None
        elif status_code >= 500:
            raise EmbeddingProviderServerError(
                f"Cloudflare Workers AI server error ({status_code}): {response.text}"
            ) from None

        try:
            data = response.json()
        except Exception as e:
            raise EmbeddingProviderError(f"Cloudflare Workers AI invalid JSON response: {response.text}") from e

        if not data.get("success", False):
            errors = data.get("errors", [])
            err_msg = "; ".join([e.get("message", str(e)) for e in errors]) if errors else response.text
            raise EmbeddingProviderError(f"Cloudflare Workers AI error: {err_msg}")

        result = data.get("result", {})
        vectors = result.get("data", [])

        # Handle single float list normalization if returned without batch outer array
        if len(texts) == 1 and isinstance(vectors, list) and vectors and isinstance(vectors[0], (int, float)):
            vectors = [vectors]

        if not vectors or len(vectors) != len(texts):
            raise EmbeddingError(
                f"Cloudflare Workers AI returned {len(vectors) if vectors else 0} embeddings, expected {len(texts)}"
            )

        for vec in vectors:
            if len(vec) != self.dimension:
                raise EmbeddingError(
                    f"Cloudflare Workers AI vector dimension mismatch: expected {self.dimension}, got {len(vec)}"
                )

        return vectors
