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
        # Map WTTJ schema to our JobPostingCreate
        # Adapt keys based on actual Algolia/API structure of WTTJ
        external_id = str(tj.get("id") or tj.get("objectID") or "")
        if not external_id:
            continue
            
        title = tj.get("name") or tj.get("title", "Unknown Title")
        # WTTJ has rich descriptions but might be nested
        desc = tj.get("description", "")
        # Create minimal job
        job_data = JobPostingCreate(
            title=title,
            description=desc,
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
            
        title = fj.get("intitule", "Poste inconnu")
        desc = fj.get("description", "")
        
        job_data = JobPostingCreate(
            title=title,
            description=desc,
            questions=["Quelles sont vos motivations pour ce poste ?"]
        )
        
        JobService.upsert_scraped_job(job_data, source="francetravail", external_id=external_id)
        upserted_count += 1
        
    logger.info(f"Finished France Travail job fetch. Upserted {upserted_count} jobs.")
    return {"status": "success", "source": "francetravail", "upserted": upserted_count}
