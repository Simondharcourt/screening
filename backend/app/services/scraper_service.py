import logging
import httpx
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class WTTJScraper:
    # WTTJ uses Algolia for their search. We can query it directly using their public 
    # Application ID and Search-Only API Key, effectively bypassing DataDome.
    ALGOLIA_APP_ID = "CSEKHVMS53"
    ALGOLIA_API_KEY = "4bd8f6215d0cc52b26430765769e65a0"
    ALGOLIA_URL = f"https://{ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/*/queries"
    
    @classmethod
    def fetch_jobs(cls) -> List[Dict[str, Any]]:
        """Fetch the latest developer jobs from WTTJ's Algolia index"""
        logger.info(f"Using direct Algolia API to fetch WTTJ jobs")
        
        headers = {
            "x-algolia-api-key": cls.ALGOLIA_API_KEY,
            "x-algolia-application-id": cls.ALGOLIA_APP_ID,
            "content-type": "application/x-www-form-urlencoded",
            "Origin": "https://www.welcometothejungle.com",
            "Referer": "https://www.welcometothejungle.com/"
        }
        
        payload = {
            "requests": [
                {
                    "indexName": "wttj_jobs_production_fr",
                    # Querying for developer roles, top 50 recent hits
                    "params": "query=developpeur&hitsPerPage=50&page=0"
                }
            ]
        }
        
        try:
            response = httpx.post(cls.ALGOLIA_URL, headers=headers, json=payload, timeout=10.0)
            
            if response.status_code == 200:
                data = response.json()
                raw_hits = data.get("results", [])[0].get("hits", [])
                
                logger.info(f"Successfully fetched {len(raw_hits)} from WTTJ Algolia")
                
                # Normalize the Algolia payload into the expected Celery format
                normalized_jobs = []
                for j in raw_hits:
                    # Algolia hit 'objectID' maps to WTTJ's internal ID
                    ext_id = j.get("objectID")
                    if not ext_id:
                        continue
                        
                    title = j.get("name", "Poste inconnu")
                    company_name = j.get("organization", {}).get("name", "Inconnue")
                    slug = j.get("slug", "")
                    org_slug = j.get("organization", {}).get("slug", "")
                    
                    # WTTJ links are derived from the slug and org slug
                    link = f"https://www.welcometothejungle.com/fr/companies/{org_slug}/jobs/{slug}"
                    
                    normalized_jobs.append({
                        "id": ext_id,
                        "title": title,
                        "description": f"Entreprise: {company_name} - Voir l'offre détaillée sur: {link}" 
                    })
                    
                return normalized_jobs
            else:
                logger.error(f"Algolia returned status {response.status_code}: {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error fetching WTTJ Algolia jobs: {str(e)}")
            return []
