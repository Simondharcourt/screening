import logging
from app.worker.celery_app import celery_app
from app.services.scraper_service import WTTJScraper
from app.services.ft_scraper_service import FrancetravailScraper
from app.services.job_service import JobService
from app.schemas.jobs import JobPostingCreate

logger = logging.getLogger(__name__)

@celery_app.task(name="app.worker.tasks.fetch_wttj_jobs")
def fetch_wttj_jobs(query: str = "developpeur", nb_pages: int = 1):
    """Fetch jobs from Welcome to the Jungle via Algolia."""
    logger.info(f"Starting WTTJ job fetch: query='{query}', nb_pages={nb_pages}")
    raw_jobs = WTTJScraper.fetch_jobs(query=query, nb_pages=nb_pages)

    upserted_count = 0
    for tj in raw_jobs:
        external_id = str(tj.get("id") or "")
        if not external_id:
            continue
        job_data = JobPostingCreate(
            title=tj.get("title", "Poste inconnu"),
            description=tj.get("description", ""),
            questions=["Parlez-moi de votre parcours technique.", "Pourquoi postuler chez nous ?"]
        )
        JobService.upsert_scraped_job(job_data, source="wttj", external_id=external_id)
        upserted_count += 1

    logger.info(f"Finished WTTJ job fetch. Upserted {upserted_count} jobs.")
    return {"status": "success", "source": "wttj", "upserted": upserted_count}


@celery_app.task(name="app.worker.tasks.fetch_francetravail_jobs")
def fetch_francetravail_jobs(keywords: str = "developpeur", location: str = None, contract_type: str = None, nb_results: int = 50):
    """Fetch jobs from France Travail API."""
    logger.info(f"Starting France Travail job fetch: keywords='{keywords}'")
    raw_jobs = FrancetravailScraper.fetch_jobs(keywords=keywords, location=location, contract_type=contract_type, nb_results=nb_results)

    upserted_count = 0
    for fj in raw_jobs:
        external_id = fj.get("id")
        if not external_id:
            continue
        job_data = JobPostingCreate(
            title=fj.get("intitule", "Poste inconnu"),
            description=fj.get("description", ""),
            questions=["Quelles sont vos motivations pour ce poste ?"]
        )
        JobService.upsert_scraped_job(
            job_data,
            source="francetravail",
            external_id=external_id,
            expires_at=fj.get("expires_at"),
        )
        upserted_count += 1

    logger.info(f"Finished France Travail job fetch. Upserted {upserted_count} jobs.")
    return {"status": "success", "source": "francetravail", "upserted": upserted_count}


@celery_app.task(name="app.worker.tasks.cleanup_stale_jobs")
def cleanup_stale_jobs():
    """Mark as closed: jobs not seen in 7+ days, or whose expires_at has passed."""
    logger.info("Starting stale jobs cleanup...")
    total = 0
    for source in ("wttj", "francetravail"):
        closed = JobService.close_stale_jobs(source=source, stale_after_days=7)
        logger.info(f"Closed {closed} stale jobs from {source}")
        total += closed
    logger.info(f"Cleanup done. Total closed: {total}")
    return {"status": "success", "closed": total}
