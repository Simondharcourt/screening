from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.schemas.jobs import JobPostingCreate, JobPostingResponse, JobPostingUpdate
from app.schemas.ai import JobGenerateRequest, JobGenerateResponse
from app.services.job_service import JobService
from app.agents.job_description_agent import job_description_agent

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
