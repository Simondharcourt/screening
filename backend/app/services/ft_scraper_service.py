import logging
import httpx
from datetime import datetime, timedelta
from typing import List, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class FrancetravailScraper:
    FRANCETRAVAIL_OAUTH_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
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
    def fetch_jobs(cls) -> List[Dict[str, Any]]:
        """Fetch the latest tech/developer jobs from France Travail"""
        token = cls._get_token()
        if not token:
            return []
            
        try:
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/json"
            }
            
            # Code ROME M1805 is often used for IT development, or we can search by keyword
            params = {
                "motsCles": "developpeur développeur software engineer react python",
                "sort": "1", # Sort by date descending
                "range": "0-49" # Support up to 150 items per call according to specs (range format 0-149)
            }
            
            response = httpx.get(
                cls.FRANCETRAVAIL_API_URL,
                headers=headers,
                params=params,
                timeout=10.0
            )
            
            if response.status_code == 200 or response.status_code == 206:
                data = response.json()
                jobs = data.get("resultats", [])
                logger.info(f"Successfully fetched {len(jobs)} from France Travail")
                return jobs
            else:
                logger.error(f"Failed to fetch FT jobs. Status {response.status_code}: {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error fetching FT jobs: {str(e)}")
            return []
