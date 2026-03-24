import logging
import httpx
from typing import Optional
from app.core.config import settings
from app.core.database import supabase

logger = logging.getLogger(__name__)

SCRAPINGBEE_API_URL = "https://app.scrapingbee.com/api/v1/"


def _fetch_with_scrapling(url: str) -> Optional[str]:
    """Dev backend: Scrapling StealthyFetcher. Bypasses basic anti-bots on local/residential IP."""
    try:
        from scrapling.fetchers import StealthyFetcher
        page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
        if not page or page.status == 404:
            return None
        # WTTJ structures content in <section> elements — concat all with meaningful content
        sections = page.css("section")
        parts = [s.get_all_text(separator="\n").strip() for s in sections if len(s.get_all_text()) > 200]
        if parts:
            return "\n\n".join(parts)[:8000]
        # Fallback for other job board structures
        for selector in ("article", "main", "body"):
            elements = page.css(selector)
            if elements:
                return elements[0].get_all_text(separator="\n")[:8000]
        return page.get_all_text(separator="\n")[:8000]
    except ImportError:
        logger.error("Scrapling not installed. Run: uv add --dev scrapling && uv run patchright install chromium")
        return None
    except Exception as e:
        logger.error(f"Scrapling error for {url}: {e}")
        return None


def _fetch_with_scrapingbee(url: str) -> Optional[str]:
    """Prod backend: ScrapingBee API with residential proxies."""
    try:
        resp = httpx.get(
            SCRAPINGBEE_API_URL,
            params={
                "api_key": settings.SCRAPINGBEE_API_KEY,
                "url": url,
                "render_js": "false",
                "extract_rules": '{"description": {"selector": "main", "type": "text"}}',
            },
            timeout=20.0,
        )
        if resp.status_code == 404:
            return None
        if resp.status_code != 200:
            logger.warning(f"ScrapingBee non-200 for {url}: {resp.status_code}")
            return None
        return resp.json().get("description") or None
    except Exception as e:
        logger.error(f"ScrapingBee error for {url}: {e}")
        return None


class JITEnrichmentService:

    @classmethod
    def fetch_full_description(cls, url: str) -> Optional[str]:
        """
        Fetches the full job description from the job page URL.
        Backend selected automatically based on ENVIRONMENT:
          - development → Scrapling
          - production  → ScrapingBee
        """
        if not url:
            return None

        if settings.ENVIRONMENT == "production":
            if not settings.SCRAPINGBEE_API_KEY:
                logger.error("SCRAPINGBEE_API_KEY is not set but ENVIRONMENT=production. Cannot enrich.")
                return None
            return _fetch_with_scrapingbee(url)
        else:
            return _fetch_with_scrapling(url)

    @classmethod
    def enrich_job(cls, job_id: str, url: str) -> bool:
        """
        Fetches and saves the full description for a job.
        Marks status=closed if URL returns 404 or fetch fails.
        """
        full_desc = cls.fetch_full_description(url)

        if full_desc is None:
            supabase.table("job_postings").update({"status": "closed"}).eq("id", job_id).execute()
            logger.info(f"Marked job {job_id} as closed (URL unreachable: {url})")
            return False

        supabase.table("job_postings").update({
            "description_full": full_desc,
            "has_full_description": True,
        }).eq("id", job_id).execute()
        logger.info(f"Enriched job {job_id} ({len(full_desc)} chars) via {settings.ENVIRONMENT} backend")
        return True

    @classmethod
    def enrich_jobs_batch(cls, jobs: list[dict]) -> list[dict]:
        """
        For a list of job dicts (from pgvector top-N), enriches those missing full_description.
        Returns only jobs still active after enrichment.
        """
        enriched = []
        for job in jobs:
            if job.get("has_full_description"):
                enriched.append(job)
                continue

            url = job.get("external_url")
            if not url:
                enriched.append(job)
                continue

            success = cls.enrich_job(job["id"], url)
            if success:
                resp = supabase.table("job_postings").select("*").eq("id", job["id"]).execute()
                if resp.data:
                    enriched.append(resp.data[0])

        return enriched
