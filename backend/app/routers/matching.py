from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.services.job_service import JobService
from app.core.database import supabase
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from typing import Dict, Any, List
from app.core.config import settings
from app.services.jit_enrichment_service import JITEnrichmentService

router = APIRouter(prefix="/matching", tags=["Matching"])

class MatchScoreRequest(BaseModel):
    job_id: str
    candidate_id: str

class MatchScoreResponse(BaseModel):
    score: int = Field(description="Compatibility score between 0 and 100")
    justification: str = Field(description="Detailed explanation of the score, highlighting strengths and weaknesses.")

@router.post("/score", response_model=MatchScoreResponse)
def analyze_fit(request: MatchScoreRequest):
    """
    Takes a Job and a Candidate, and uses an LLM to generate a detailed compatibility score 
    and justification based on their profiles.
    Saves the compatibility score to the `screenings` table.
    """
    # 1. Fetch Job
    job = JobService.get_job(request.job_id)
    if not job:
         raise HTTPException(status_code=404, detail="Job not found")

    # 2. JIT enrichment: enrich if needed, mark closed if URL dead
    if not job.get("has_full_description") and job.get("external_url"):
        success = JITEnrichmentService.enrich_job(job["id"], job["external_url"])
        if not success:
            raise HTTPException(status_code=410, detail="Job offer is no longer available")
        job = JobService.get_job(request.job_id)  # reload with description_full

    # 3. Use description_full if available, fallback to description
    job_description = job.get("description_full") or job.get("description", "")

    # 4. Fetch Candidate
    cand_resp = supabase.table("candidates").select("*").eq("id", request.candidate_id).execute()
    if not cand_resp.data:
         raise HTTPException(status_code=404, detail="Candidate not found")
    candidate = cand_resp.data[0]

    # 3. Fetch Screening
    screen_resp = supabase.table("screenings").select("*") \
        .eq("job_posting_id", request.job_id) \
        .eq("candidate_id", request.candidate_id).execute()
    
    if not screen_resp.data:
         raise HTTPException(status_code=404, detail="Screening relation not found")
    screening_id = screen_resp.data[0]["id"]

    # 4. Prompt the LLM
    llm = ChatAnthropic(model=settings.LLM_MODEL, temperature=0, api_key=settings.ANTHROPIC_API_KEY)
    structured_llm = llm.with_structured_output(MatchScoreResponse)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Tu es un assistant RH expert chargé d'évaluer la compatibilité entre un candidat et une offre d'emploi."
                   "Retourne un score de 0 à 100 et une explication très claire et détaillée (en français)."),
        ("human", "L'offre d'emploi (Titre: {job_title}):\n{job_desc}\n\n"
                  "Questions de l'offre:\n{job_questions}\n\n"
                  "Profil du Candidat ({cand_name}):\n{cand_profile}\n\n"
                  "Analyse la compatibilité entre ce candidat et cette offre.")
    ])
    
    chain = prompt | structured_llm
    
    response: MatchScoreResponse = chain.invoke({
        "job_title": job["title"],
        "job_desc": job_description,
        "job_questions": "\n".join(job.get("questions", [])),
        "cand_name": candidate["name"],
        "cand_profile": candidate.get("profile_text", "")
    })
    
    # 5. Save the score in the database
    supabase.table("screenings").update({
        "compatibility_score": response.score
    }).eq("id", screening_id).execute()
    
    return response

@router.get("/job/{job_id}/recommendations")
def get_recommendations(job_id: str):
    """
    Uses pgvector to find the top identical candidates for a given job.
    Relies on the `match_candidates_for_job` RPC function in Supabase.
    """
    job = JobService.get_job(job_id)
    if not job or "embedding" not in job or not job["embedding"]:
         raise HTTPException(status_code=404, detail="Job or Job embedding not found")
         
    # Call the RPC function 
    # Must wait for schema to be deployed for this to work
    resp = supabase.rpc('match_candidates_for_job', {
        'query_embedding': job["embedding"],
        'match_job_id': job_id,
        'match_threshold': 0.0,
        'match_count': 10
    }).execute()
    
    return {"recommendations": resp.data if resp.data else []}
