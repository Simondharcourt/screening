import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_bytes: bytes) -> Optional[str]:
    """
    Extracts raw text from a PDF file.
    Returns None if extraction fails or file is not a valid PDF.
    """
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text.strip())
        full_text = "\n\n".join(pages)
        if not full_text.strip():
            logger.warning("PDF extracted but text is empty (may be image-based PDF)")
            return None
        logger.info(f"PDF extracted: {len(full_text)} chars, {len(reader.pages)} pages")
        return full_text[:12000]  # Cap at 12k chars — enough for any CV
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        return None
