import logging
import httpx
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from app.core.config import settings

FT_OFFER_VALIDITY_DAYS = 30  # Close FT offers not updated in 30 days

logger = logging.getLogger(__name__)

class FrancetravailScraper:
    FRANCETRAVAIL_OAUTH_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire"
    FRANCETRAVAIL_API_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"
    
    _access_token = None
    _token_expiry = None

    @classmethod
    def _get_token(cls) -> str:
        """Fetch or refresh the France Travail OAuth2 token"""
        now = datetime.now()
        if cls._access_token and cls._token_expiry and now < cls._token_expiry:
            return cls._access_token
            
        if not settings.FRANCETRAVAIL_CLIENT_ID or not settings.FRANCETRAVAIL_CLIENT_SECRET:
            logger.error("France Travail credentials missing in settings.")
            return None
            
        try:
            # According to France Travail docs, it requires client_credentials grant type
            data = {
                "grant_type": "client_credentials",
                "client_id": settings.FRANCETRAVAIL_CLIENT_ID,
                "client_secret": settings.FRANCETRAVAIL_CLIENT_SECRET,
                "scope": "api_offresdemploiv2 o2dsoffre" # Typical scopes
            }
            
            response = httpx.post(
                cls.FRANCETRAVAIL_OAUTH_URL,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code == 200:
                res_json = response.json()
                cls._access_token = res_json.get("access_token")
                expires_in = res_json.get("expires_in", 1499) # Usually 25 mins
                # Subtract 1 minute just to be safe before expiry
                cls._token_expiry = now + timedelta(seconds=expires_in - 60)
                logger.info("Successfully fetched France Travail access token.")
                return cls._access_token
            else:
                logger.error(f"Failed to fetch FT token. Status {response.status_code}: {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error fetching FT token: {str(e)}")
            return None

    @classmethod
    def fetch_jobs(
        cls,
        keywords: str = "developpeur",
        location: str = None,
        contract_type: str = None,
        nb_results: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Fetch jobs from France Travail API.
        - keywords: mots-clés de recherche
        - location: code département (ex: '75') ou commune INSEE
        - contract_type: CDI, CDD, MIS, SAI, LIB...
        - nb_results: nombre de résultats (max 150 par appel)
        """
        token = cls._get_token()
        if not token:
            return []

        nb_results = min(nb_results, 150)

        try:
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/json"
            }

            params = {
                "motsCles": keywords,
                "sort": "1",
                "range": f"0-{nb_results - 1}",
            }
            if location:
                params["departement"] = location
            if contract_type:
                params["typeContrat"] = contract_type.upper()

            response = httpx.get(
                cls.FRANCETRAVAIL_API_URL,
                headers=headers,
                params=params,
                timeout=10.0
            )

            if response.status_code in (200, 206):
                jobs = response.json().get("resultats", [])
                # Attach expires_at from dateActualisation + FT_OFFER_VALIDITY_DAYS
                for job in jobs:
                    date_actu = job.get("dateActualisation") or job.get("dateCreation")
                    if date_actu:
                        try:
                            dt = datetime.fromisoformat(date_actu.replace("Z", "+00:00"))
                            job["expires_at"] = (dt + timedelta(days=FT_OFFER_VALIDITY_DAYS)).isoformat()
                        except ValueError:
                            pass
                logger.info(f"France Travail fetched {len(jobs)} jobs (keywords='{keywords}')")
                return jobs
            else:
                logger.error(f"FT API error {response.status_code}: {response.text}")
                return []

        except Exception as e:
            logger.error(f"Error fetching FT jobs: {e}")
            return []
