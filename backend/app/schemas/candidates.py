from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import uuid

class CandidateBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    profile_text: Optional[str] = None

class CandidateCreate(CandidateBase):
    job_posting_id: uuid.UUID # Needed for the first screening relation

class CandidateResponse(CandidateBase):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    cv_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Also returning the screening relation along with candidates for a specific job
class ScreeningResponse(BaseModel):
    id: uuid.UUID
    job_posting_id: uuid.UUID
    candidate_id: uuid.UUID
    status: str
    compatibility_score: Optional[int] = None
    performance_score: Optional[int] = None
    call_status: Optional[str] = "not_started"
    transcript: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class CandidateWithScreening(BaseModel):
    candidate: CandidateResponse
    screening: ScreeningResponse
