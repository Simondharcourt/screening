from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.services.vapi_service import VapiService
from app.services.job_service import JobService
from app.core.database import supabase
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vapi", tags=["Vapi Voice Integration"])

class CallTriggerRequest(BaseModel):
    phone_number: str

@router.post("/screenings/{screening_id}/call")
async def trigger_screening_call(screening_id: str, request: CallTriggerRequest):
    """
    Manually trigger an outbound call to a candidate.
    """
    # 1. Fetch Screening
    screen_resp = supabase.table("screenings").select("*, candidates(*), job_postings(*)").eq("id", screening_id).execute()
    if not screen_resp.data:
        raise HTTPException(status_code=404, detail="Screening not found")
        
    screening = screen_resp.data[0]
    candidate = screening.get("candidates")
    job = screening.get("job_postings")
    
    if not candidate or not job:
        raise HTTPException(status_code=400, detail="Incomplete screening, missing candidate or job relation")

    try:
        call_response = await VapiService.trigger_call(
            phone_number=request.phone_number,
            job_context=job,
            candidate_context=candidate,
            screening_id=screening_id
        )
        
        # Update database status immediately only AFTER Vapi successfully returns
        supabase.table("screenings").update({"call_status": "calling"}).eq("id", screening_id).execute()
        
        return {"status": "success", "call_details": call_response}
    except Exception as e:
        logger.error(f"Error triggering call: {e}")
        # Revert status explicitly if needed, but since we didn't update it yet we just throw
        supabase.table("screenings").update({"call_status": "failed"}).eq("id", screening_id).execute()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhook")
async def vapi_webhook(request: Request):
    """
    Receives real-time state updates from Vapi.ai (e.g. call started, ended, transcripts)
    """
    payload = await request.json()
    
    message = payload.get("message", {})
    message_type = message.get("type", "")
    
    call = message.get("call", {})
    # Vapi sends back the metadata we provided when creating the call
    metadata = call.get("metadata", {})
    screening_id = metadata.get("screening_id")
    
    if not screening_id:
        logger.warning(f"Webhook received without screening_id in metadata: {payload}")
        # Provide 200 explicitly so Vapi doesn't retry infinitely
        return {"status": "ignored"}

    if message_type == "status-update":
        new_status = message.get("status")
        logger.info(f"Screening {screening_id} status change to: {new_status}")
        
        # e.g., 'queued', 'ringing', 'in-progress', 'ended'
        if new_status:
            supabase.table("screenings").update({"call_status": new_status}).eq("id", screening_id).execute()
            
    elif message_type == "end-of-call-report":
        logger.info(f"Screening {screening_id} ended.")
        
        # Save the transcript
        transcript = message.get("transcript", "")
        
        supabase.table("screenings").update({
            "call_status": "completed",
            "transcript": transcript,
            "status": "interviewed" # Elevate overall pipeline status
        }).eq("id", screening_id).execute()
        
    else:
        # Ignore other event types for now
        pass

    return {"status": "success"}
