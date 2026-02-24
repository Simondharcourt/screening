from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import List, Optional
from app.schemas.candidates import CandidateCreate, CandidateResponse, CandidateWithScreening
from app.services.candidate_service import CandidateService
import uuid
import json

router = APIRouter(prefix="/candidates", tags=["Candidates"])

@router.post("/", response_model=CandidateWithScreening)
async def create_candidate(
    job_posting_id: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    phone: Optional[str] = Form(None),
    profile_text: Optional[str] = Form(None),
    cv: Optional[UploadFile] = File(None)
):
    try:
        # Create candidate structure
        candidate_data = CandidateCreate(
            job_posting_id=uuid.UUID(job_posting_id),
            name=name,
            email=email,
            phone=phone,
            profile_text=profile_text
        )
        
        cv_url = None
        if cv:
            file_bytes = await cv.read()
            cv_path = CandidateService.upload_cv(file_bytes, cv.filename, cv.content_type)
            # Fetch signed url immediately or return raw path (storing raw path is safer for DB)
            cv_url = cv_path
            
        result = CandidateService.create_candidate_with_screening(candidate_data, cv_url)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/by-job/{job_id}")
async def get_candidates_for_job(job_id: str):
    try:
         results = CandidateService.get_candidates_for_job(job_id)
         
         # For any result with a cv_url path, potentially replace it with a valid signed url 
         # before sending it to the frontend
         for res in results:
             c = res.get("candidate", {})
             if c.get("cv_url"):
                 try:
                     c["cv_url"] = CandidateService.get_cv_url(c["cv_url"])
                 except Exception:
                     pass # Fallback to path
         
         return results
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
