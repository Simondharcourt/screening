from fastapi import APIRouter, HTTPException, Depends
from typing import List, Any
from app.core.auth import AuthUser, get_current_candidate
from app.core.database import supabase
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/candidate", tags=["Candidate"])

class MyProfileResponse(BaseModel):
    id: str
    profile: dict[str, Any]
    onboarding_complete: bool
    cv_url: str | None

class ApplicationItem(BaseModel):
    id: str
    status: str
    call_status: str | None
    compatibility_score: int | None
    performance_score: int | None
    created_at: datetime
    job_postings: dict[str, Any] | None

@router.get("/me", response_model=MyProfileResponse)
def get_my_profile(user: AuthUser = Depends(get_current_candidate)):
    resp = supabase.table("candidates").select("id,profile,onboarding_complete,cv_url") \
        .eq("user_id", user.id).maybe_single().execute()
        
    if not resp.data:
        raise HTTPException(status_code=404, detail="No candidate profile found")
        
    return MyProfileResponse(**resp.data)

@router.get("/applications", response_model=List[ApplicationItem])
def get_my_applications(user: AuthUser = Depends(get_current_candidate)):
    cand = supabase.table("candidates").select("id").eq("user_id", user.id).maybe_single().execute()
    
    if not cand.data:
        return []
        
    resp = supabase.table("screenings") \
        .select("id,status,call_status,compatibility_score,performance_score,created_at,job_postings(id,title,source,external_url,status)") \
        .eq("candidate_id", cand.data["id"]) \
        .order("created_at", desc=True).execute()
        
    return [ApplicationItem(**item) for item in (resp.data or [])]
