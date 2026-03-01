from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid

class JobPostingBase(BaseModel):
    title: str
    description: str
    questions: Optional[List[str]] = []
    source: Optional[str] = "internal"
    status: Optional[str] = "draft"

class JobPostingCreate(JobPostingBase):
    pass

class JobPostingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    questions: Optional[List[str]] = None
    status: Optional[str] = None

class JobPostingResponse(JobPostingBase):
    id: uuid.UUID
    recruiter_id: Optional[uuid.UUID] = None
    external_id: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
