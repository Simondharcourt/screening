from langchain_anthropic import ChatAnthropic
from app.core.config import settings

_RETRY = 6  # Anthropic SDK uses exponential backoff: ~1s, 2s, 4s, 8s, 16s, 32s


def get_llm(**kwargs) -> ChatAnthropic:
    """Return a ChatAnthropic instance using the primary model with retry on overload."""
    return ChatAnthropic(
        model=settings.LLM_MODEL,
        temperature=0,
        api_key=settings.ANTHROPIC_API_KEY,
        max_retries=_RETRY,
        **kwargs,
    )


def get_llm_fast(**kwargs) -> ChatAnthropic:
    """Return a ChatAnthropic instance using the fast/cheap model with retry on overload."""
    return ChatAnthropic(
        model=settings.LLM_MODEL_FAST,
        temperature=0,
        api_key=settings.ANTHROPIC_API_KEY,
        max_retries=_RETRY,
        **kwargs,
    )
