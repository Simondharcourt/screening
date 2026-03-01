from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from app.schemas.jobs import JobPostingCreate, JobPostingResponse, JobPostingUpdate
from app.schemas.ai import JobGenerateRequest, JobGenerateResponse
from app.services.job_service import JobService
from app.agents.job_description_agent import job_description_agent
from app.worker.tasks import fetch_wttj_jobs, fetch_francetravail_jobs

router = APIRouter(prefix="/jobs", tags=["Jobs"])

@router.post("/generate", response_model=JobGenerateResponse)
async def generate_job_description(request: JobGenerateRequest):
    try:
        # The agent returns the final state dict
        result = job_description_agent.invoke({
            "title": request.title,
            "bullet_points": request.bullet_points
        })
        return JobGenerateResponse(
            description=result["description"],
            questions=result["questions"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.post("/", response_model=JobPostingResponse)
async def create_job(job: JobPostingCreate):
    # In a real app, recruiter_id would come from the verified token
    result = JobService.create_job(job)
    if not result:
        raise HTTPException(status_code=400, detail="Could not create job posting")
    return result

@router.get("/", response_model=List[JobPostingResponse])
async def get_jobs():
    results = JobService.get_jobs()
    return results

@router.get("/{job_id}", response_model=JobPostingResponse)
async def get_job(job_id: str):
    result = JobService.get_job(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return result

@router.put("/{job_id}", response_model=JobPostingResponse)
async def update_job(job_id: str, job: JobPostingUpdate):
    result = JobService.update_job(job_id, job)
    if not result:
        raise HTTPException(status_code=400, detail="Could not update job")
    return result

class WTTJScrapeRequest(BaseModel):
    query: str = "developpeur"
    nb_pages: int = 1

class FranceTravailScrapeRequest(BaseModel):
    keywords: str = "developpeur"
    location: str = None       # Code département ex: '75', '69', '13'
    contract_type: str = None  # CDI, CDD, MIS, SAI, LIB...
    nb_results: int = 50       # Max 150

@router.post("/scrape/wttj", tags=["Scraping"])
async def scrape_wttj(params: WTTJScrapeRequest = WTTJScrapeRequest()):
    """
    Scrape Welcome to the Jungle via Algolia (full job content, no ScrapingBee needed).
    - query: mot-clé (ex: 'react', 'data engineer', 'product manager')
    - nb_pages: pages à fetcher (50 offres/page)
    """
    task = fetch_wttj_jobs.delay(query=params.query, nb_pages=params.nb_pages)
    return {"message": "WTTJ scraping task queued", "task_id": task.id, "query": params.query, "nb_pages": params.nb_pages}

@router.post("/scrape/francetravail", tags=["Scraping"])
async def scrape_francetravail(params: FranceTravailScrapeRequest = FranceTravailScrapeRequest()):
    """
    Scrape France Travail via leur API officielle (OAuth2).
    - keywords: mots-clés (ex: 'python django', 'data scientist')
    - location: code département (ex: '75' pour Paris, '69' pour Lyon)
    - contract_type: CDI, CDD, MIS, SAI, LIB
    - nb_results: nombre d'offres (max 150)
    """
    task = fetch_francetravail_jobs.delay(
        keywords=params.keywords,
        location=params.location,
        contract_type=params.contract_type,
        nb_results=params.nb_results,
    )
    return {"message": "France Travail scraping task queued", "task_id": task.id, "keywords": params.keywords}

