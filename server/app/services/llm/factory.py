from typing import List
from app.core.config import Settings
from app.services.llm.provider import LLMProvider
from app.services.llm.gemini import GeminiLLMProvider
from app.services.llm.openrouter import OpenRouterLLMProvider
from app.services.llm.cloudflare import CloudflareLLMProvider
from app.services.llm.fallback import FallbackLLMProvider

def create_llm_provider(settings: Settings) -> LLMProvider:
    """
    Creates the configured LLM provider chain.
    Supports primary providers: "gemini", "cloudflare", "openrouter".
    If primary is "gemini" but GEMINI_API_KEY is not set and Cloudflare credentials
    are available, automatically selects Cloudflare Workers AI.
    """
    primary_provider_name = (settings.LLM_PRIMARY_PROVIDER or "gemini").lower()

    # Determine if Cloudflare should be primary:
    # 1. Explicitly requested: LLM_PRIMARY_PROVIDER == "cloudflare"
    # 2. Auto-fallback: LLM_PRIMARY_PROVIDER == "gemini" and no GEMINI_API_KEY, but Cloudflare credentials present
    use_cloudflare_primary = False
    if primary_provider_name == "cloudflare":
        use_cloudflare_primary = True
    elif (
        primary_provider_name == "gemini"
        and not settings.GEMINI_API_KEY
        and settings.CLOUDFLARE_ACCOUNT_ID
        and settings.CLOUDFLARE_API_TOKEN
    ):
        use_cloudflare_primary = True

    if use_cloudflare_primary:
        primary = CloudflareLLMProvider(
            account_id=settings.CLOUDFLARE_ACCOUNT_ID,
            api_token=settings.CLOUDFLARE_API_TOKEN,
            model=settings.CLOUDFLARE_LLM_MODEL,
        )
        if not settings.LLM_FALLBACK_ENABLED:
            return primary

        providers: List[LLMProvider] = [primary]

        if settings.GEMINI_API_KEY:
            providers.append(
                GeminiLLMProvider(
                    api_key=settings.GEMINI_API_KEY,
                    model=settings.GEMINI_LLM_MODEL_PRIMARY,
                )
            )

        if settings.OPENROUTER_FALLBACK_MODEL and settings.OPENROUTER_API_KEY:
            providers.append(
                OpenRouterLLMProvider(
                    api_key=settings.OPENROUTER_API_KEY,
                    model=settings.OPENROUTER_FALLBACK_MODEL,
                )
            )

        return FallbackLLMProvider(providers=providers) if len(providers) > 1 else primary

    # Primary Gemini provider
    primary_gemini = GeminiLLMProvider(
        api_key=settings.GEMINI_API_KEY,
        model=settings.GEMINI_LLM_MODEL_PRIMARY
    )
    
    if not settings.LLM_FALLBACK_ENABLED:
        return primary_gemini
        
    providers: List[LLMProvider] = [primary_gemini]
    
    # Fallback 1 Gemini provider
    if settings.GEMINI_LLM_MODEL_FALLBACK_1:
        providers.append(GeminiLLMProvider(
            api_key=settings.GEMINI_API_KEY,
            model=settings.GEMINI_LLM_MODEL_FALLBACK_1
        ))
        
    # Fallback 2 Gemini provider
    if settings.GEMINI_LLM_MODEL_FALLBACK_2:
        providers.append(GeminiLLMProvider(
            api_key=settings.GEMINI_API_KEY,
            model=settings.GEMINI_LLM_MODEL_FALLBACK_2
        ))

    # Cloudflare fallback if configured as fallback provider or if credentials present
    if (
        settings.CLOUDFLARE_ACCOUNT_ID
        and settings.CLOUDFLARE_API_TOKEN
        and getattr(settings, "LLM_FALLBACK_PROVIDER", None) == "cloudflare"
    ):
        providers.append(
            CloudflareLLMProvider(
                account_id=settings.CLOUDFLARE_ACCOUNT_ID,
                api_token=settings.CLOUDFLARE_API_TOKEN,
                model=settings.CLOUDFLARE_LLM_MODEL,
            )
        )
        
    # OpenRouter final fallback
    if settings.OPENROUTER_FALLBACK_MODEL and settings.OPENROUTER_API_KEY:
        providers.append(OpenRouterLLMProvider(
            api_key=settings.OPENROUTER_API_KEY,
            model=settings.OPENROUTER_FALLBACK_MODEL
        ))
        
    return FallbackLLMProvider(providers=providers)
