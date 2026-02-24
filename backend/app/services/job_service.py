from app.core.database import supabase
from app.schemas.jobs import JobPostingCreate, JobPostingUpdate
from typing import List, Dict, Any
import uuid

class JobService:
    @staticmethod
    def create_job(job_data: JobPostingCreate, recruiter_id: str = None) -> Dict[str, Any]:
        data = job_data.model_dump()
        if recruiter_id:
            data["recruiter_id"] = recruiter_id
            
        response = supabase.table("job_postings").insert(data).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_jobs(recruiter_id: str = None) -> List[Dict[str, Any]]:
        query = supabase.table("job_postings").select("*").order('created_at', desc=True)
        if recruiter_id:
            query = query.eq("recruiter_id", recruiter_id)
            
        response = query.execute()
        return response.data

    @staticmethod
    def get_job(job_id: str) -> Dict[str, Any]:
        response = supabase.table("job_postings").select("*").eq("id", job_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def update_job(job_id: str, job_update: JobPostingUpdate) -> Dict[str, Any]:
        data = job_update.model_dump(exclude_unset=True)
        response = supabase.table("job_postings").update(data).eq("id", job_id).execute()
        return response.data[0] if response.data else None
