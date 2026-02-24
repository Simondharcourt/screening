from app.core.database import supabase
from app.schemas.candidates import CandidateCreate
from typing import List, Dict, Any
import uuid

class CandidateService:
    @staticmethod
    def create_candidate_with_screening(candidate_data: CandidateCreate, cv_url: str = None) -> Dict[str, Any]:
        # 1. Insert candidate
        cand_data = candidate_data.model_dump(exclude={"job_posting_id"})
        if cv_url:
            cand_data["cv_url"] = cv_url
            
        cand_response = supabase.table("candidates").insert(cand_data).execute()
        if not cand_response.data:
            raise Exception("Failed to create candidate")
            
        candidate = cand_response.data[0]
        
        # 2. Insert screening relation
        screen_data = {
            "job_posting_id": str(candidate_data.job_posting_id),
            "candidate_id": candidate["id"],
            "status": "pending"
        }
        screen_response = supabase.table("screenings").insert(screen_data).execute()
        if not screen_response.data:
             # In a real robust system we'd rollback or use an RPC/Edge function for transaction
            raise Exception("Failed to create screening relation")
            
        return {
            "candidate": candidate,
            "screening": screen_response.data[0]
        }

    @staticmethod
    def get_candidates_for_job(job_id: str) -> List[Dict[str, Any]]:
        # Using Supabase foreign key joins to get candidates with their screening info
        response = supabase.table("screenings") \
            .select("*, candidates(*)") \
            .eq("job_posting_id", job_id) \
            .order('created_at', desc=True) \
            .execute()
            
        # Format for output to match CandidateWithScreening
        results = []
        for row in response.data:
            candidate = row.pop("candidates")
            results.append({
                "candidate": candidate,
                "screening": row
            })
        return results

    @staticmethod
    def upload_cv(file_bytes: bytes, filename: str, content_type: str) -> str:
        # Generate unique path to avoid collisions
        unique_path = f"{uuid.uuid4()}_{filename}"
        
        response = supabase.storage.from_("cvs").upload(
            path=unique_path,
            file=file_bytes,
            file_options={"content-type": content_type}
        )
        
        # In supabase-py, upload returns the path on success. 
        # We need to construct the public URL or authenticated URL.
        # Since our CVs bucket is currently private (per schema), we'll need to use signed URLs later
        # OR we just store the path and generate signed URL on demand.
        # Let's store the raw bucket path.
        return unique_path

    @staticmethod
    def get_cv_url(path: str) -> str:
        # Returns a signed URL valid for 1 hour
        response = supabase.storage.from_("cvs").create_signed_url(path, 3600)
        return response.get("signedURL")
