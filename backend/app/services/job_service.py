from app.core.database import supabase
from app.schemas.jobs import JobPostingCreate, JobPostingUpdate
from app.services.embedding_service import EmbeddingService
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
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

    @staticmethod
    def upsert_scraped_job(
        job_data: JobPostingCreate,
        source: str,
        external_id: str,
        expires_at: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Upserts a job posting from an external source.
        - last_seen_at is always refreshed to now()
        - expires_at is set when the source provides freshness metadata (e.g. FT dateActualisation)
        """
        data = job_data.model_dump()
        data["source"] = source
        data["external_id"] = external_id
        data["status"] = "active"
        data["last_seen_at"] = datetime.now(timezone.utc).isoformat()
        if expires_at:
            data["expires_at"] = expires_at

        existing_resp = supabase.table("job_postings").select("*").eq("source", source).eq("external_id", external_id).execute()

        if existing_resp.data:
            existing = existing_resp.data[0]
            if existing.get("title") != data["title"] or existing.get("description") != data["description"]:
                text_to_embed = f"{data['title']} {data.get('description', '')} {' '.join(data.get('questions', []))}"
                data['embedding'] = EmbeddingService.generate(text_to_embed)
            else:
                data['embedding'] = existing.get('embedding')
            response = supabase.table("job_postings").update(data).eq("id", existing["id"]).execute()
        else:
            text_to_embed = f"{data['title']} {data.get('description', '')} {' '.join(data.get('questions', []))}"
            data['embedding'] = EmbeddingService.generate(text_to_embed)
            response = supabase.table("job_postings").insert(data).execute()

        return response.data[0] if response.data else None

    @staticmethod
    def close_stale_jobs(source: str, stale_after_days: int = 7) -> int:
        """
        Mark as 'closed' all active jobs from a source not seen in the last stale_after_days days,
        or whose expires_at is in the past.
        Returns the number of jobs closed.
        """
        now = datetime.now(timezone.utc).isoformat()
        stale_threshold = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        from datetime import timedelta
        stale_threshold = (datetime.now(timezone.utc) - timedelta(days=stale_after_days)).isoformat()

        # Close jobs not seen since stale_threshold
        resp1 = (
            supabase.table("job_postings")
            .update({"status": "closed"})
            .eq("source", source)
            .eq("status", "active")
            .lt("last_seen_at", stale_threshold)
            .execute()
        )

        # Close jobs whose expires_at has passed
        resp2 = (
            supabase.table("job_postings")
            .update({"status": "closed"})
            .eq("source", source)
            .eq("status", "active")
            .lt("expires_at", now)
            .not_.is_("expires_at", "null")
            .execute()
        )

        closed = len(resp1.data or []) + len(resp2.data or [])
        return closed

