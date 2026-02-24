import httpx
from typing import Dict, Any, Optional
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class VapiService:
    @staticmethod
    async def trigger_call(
        phone_number: str, 
        job_context: Dict[str, Any], 
        candidate_context: Dict[str, Any], 
        screening_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Triggers an outbound call via Vapi to the candidate's phone number.
        Injects the Job description, specific screening questions, and the candidate's profile context 
        into the Vapi assistant configuration dynamically.
        """
        if not getattr(settings, "VAPI_API_KEY", None):
            logger.error("VAPI_API_KEY is not set.")
            raise Exception("VAPI_API_KEY is missing")

        # Extract context
        job_title = job_context.get("title", "un poste")
        job_desc = job_context.get("description", "")
        questions = "\n".join(f"- {q}" for q in job_context.get("questions", []))
        candidate_name = candidate_context.get("name", "Candidat")
        candidate_profile = candidate_context.get("profile_text", "")

        # Dynamic System Prompt for Vapi Assistant
        system_prompt = f"""
        Tu es un recruteur expert travaillant pour l'entreprise. 
        Tu appelles le candidat nommé {candidate_name} pour un poste de {job_title}.
        
        Contexte de l'offre : {job_desc}
        Contexte du candidat : {candidate_profile}
        
        Ton objectif est de mener un court entretien de pré-qualification de 5 à 10 minutes maximum.
        Sois professionnel, chaleureux, et concis. Pose une question à la fois et attend la réponse.
        
        Voici les questions clés que tu DOIS poser durant l'appel (adapte ta formulation pour que ce soit naturel) :
        {questions}
        
        Une fois que tu as obtenu des réponses claires à toutes ces questions, remercie le candidat, 
        dis-lui que l'équipe recrutement reviendra vers lui rapidement, et termine l'appel.
        """

        headers = {
            "Authorization": f"Bearer {settings.VAPI_API_KEY}",
            "Content-Type": "application/json"
        }

        # NOTE: In production, you'd securely configure a real Phone Number ID in Vapi.
        # Check docs: https://docs.vapi.ai/api-reference/calls/create-call
        # We assume the user has a VAPI_PHONE_NUMBER_ID in settings if doing real PSTN calls,
        # otherwise for Web testing this might differ. We will use a typical PSTN payload.
        
        payload = {
            "name": f"Screening - {candidate_name}",
            "assistant": {
                "name": "Recruiter Voice AI",
                "model": {
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-latest",
                    "messages": [
                        {
                            "role": "system",
                            "content": system_prompt
                        }
                    ]
                },
                "voice": {
                    "provider": "11labs", # Can change to playht/openai
                    "voiceId": "eleven_multilingual_v2", # Sample
                },
                "firstMessage": f"Bonjour {candidate_name}, je suis l'assistant recrutement pour le poste de {job_title}. Est-ce que vous m'entendez bien et avez-vous 5 minutes pour échanger ?",
                "serverUrl": getattr(settings, "WEBHOOK_URL", "") # To receive webhook updates
            },
            "customer": {
                "number": phone_number,
                "name": candidate_name
            },
            # Metadata we can read back in the webhook to identify which screening this was
            "metadata": {
                "screening_id": screening_id
            }
        }
        
        # If the user put a phone number sid in the env, use it.
        phone_number_id = getattr(settings, "VAPI_PHONE_NUMBER_ID", None)
        if phone_number_id:
             payload["phoneNumberId"] = phone_number_id

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.vapi.ai/call/phone",
                headers=headers,
                json=payload,
                timeout=30.0
            )
            
            if response.status_code >= 400:
                logger.error(f"Vapi Error: {response.text}")
                raise Exception(f"Failed to trigger Vapi call: {response.status_code} - {response.text}")
                
            return response.json()
