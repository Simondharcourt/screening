import os
import logging

logger = logging.getLogger(__name__)


def init_langfuse() -> bool:
    """
    Initialize Langfuse for tracing. Maps LANGFUSE_BASE_URL → LANGFUSE_HOST if needed.
    Returns True if Langfuse is configured, False otherwise.
    """
    # Map LANGFUSE_BASE_URL → LANGFUSE_HOST (Langfuse v4 reads LANGFUSE_HOST)
    if not os.environ.get("LANGFUSE_HOST") and os.environ.get("LANGFUSE_BASE_URL"):
        os.environ["LANGFUSE_HOST"] = os.environ["LANGFUSE_BASE_URL"]

    if not os.environ.get("LANGFUSE_SECRET_KEY"):
        logger.info("Langfuse not configured (LANGFUSE_SECRET_KEY missing) — tracing disabled")
        return False

    try:
        from langfuse import get_client
        client = get_client()
        logger.info(f"Langfuse initialized → {os.environ.get('LANGFUSE_HOST', 'cloud.langfuse.com')}")
        return True
    except Exception as e:
        logger.warning(f"Langfuse init failed: {e}")
        return False
