from pydantic import BaseModel, Field
from typing import List

class JobGenerateRequest(BaseModel):
    title: str = Field(..., description="The title of the job opening")
    bullet_points: str = Field(..., description="Key points about the job, requirements, context, etc.")

class JobGenerateResponse(BaseModel):
    description: str
    questions: List[str]
