from app.core.database import supabase
from app.schemas.jobs import JobPostingCreate, JobPostingUpdate
from app.services.embedding_service import EmbeddingService
from typing import List, Dict, Any
import uuid

class JobService:
    @staticmethod
    def create_job(job_data: JobPostingCreate, recruiter_id: str = None) -> Dict[str, Any]:
        data = job_data.model_dump()
        if recruiter_id:
            data["recruiter_id"] = recruiter_id
            
        # Generate semantic embedding for the job
        text_to_embed = f"{data['title']} {data.get('description', '')} {' '.join(data.get('questions', []))}"
        data['embedding'] = EmbeddingService.generate(text_to_embed)
            
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
        
        # Only recompute embedding if significant fields changed
        if any(k in data for k in ["title", "description", "questions"]):
            # We need the full record to make a good embedding if partial update
            curr = JobService.get_job(job_id)
            title = data.get("title", curr.get("title", ""))
            desc = data.get("description", curr.get("description", ""))
            qsts = data.get("questions", curr.get("questions", []))
            text_to_embed = f"{title} {desc} {' '.join(qsts)}"
            data['embedding'] = EmbeddingService.generate(text_to_embed)
            
        response = supabase.table("job_postings").update(data).eq("id", job_id).execute()
        return response.data[0] if response.data else None
