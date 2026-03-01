import logging
import httpx
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class WTTJScraper:
    # WTTJ uses Algolia for their search — queryable directly with their public keys,
    # bypassing DataDome. The full job content (profile, missions, salary…) is in the hit.
    ALGOLIA_APP_ID = "CSEKHVMS53"
    ALGOLIA_API_KEY = "4bd8f6215d0cc52b26430765769e65a0"
    ALGOLIA_URL = f"https://{ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/*/queries"

    @classmethod
    def fetch_jobs(cls, query: str = "developpeur", nb_pages: int = 1) -> List[Dict[str, Any]]:
        """
        Fetch jobs from WTTJ via Algolia.
        - query: search keyword (default: 'developpeur')
        - nb_pages: number of pages to fetch (50 results/page)
        """
        headers = {
            "x-algolia-api-key": cls.ALGOLIA_API_KEY,
            "x-algolia-application-id": cls.ALGOLIA_APP_ID,
            "content-type": "application/json",
            "Origin": "https://www.welcometothejungle.com",
        }

        all_jobs: List[Dict[str, Any]] = []

        for page in range(nb_pages):
            payload = {
                "requests": [{
                    "indexName": "wttj_jobs_production_fr",
                    "params": f"query={query}&hitsPerPage=50&page={page}",
                }]
            }
            try:
                response = httpx.post(cls.ALGOLIA_URL, headers=headers, json=payload, timeout=10.0)
                if response.status_code != 200:
                    logger.error(f"Algolia page {page} returned {response.status_code}: {response.text}")
                    break

                hits = response.json().get("results", [])[0].get("hits", [])
                if not hits:
                    break

                logger.info(f"WTTJ Algolia page {page}: {len(hits)} hits")

                for j in hits:
                    ext_id = j.get("objectID")
                    if not ext_id:
                        continue

                    org = j.get("organization", {})
                    org_slug = org.get("slug", "")
                    slug = j.get("slug", "")
                    link = f"https://www.welcometothejungle.com/fr/companies/{org_slug}/jobs/{slug}"

                    # Build a rich description from all available fields
                    parts = []

                    summary = j.get("summary", "")
                    if summary:
                        parts.append(summary)

                    missions = j.get("key_missions", [])
                    if missions:
                        parts.append("## Missions\n" + "\n".join(f"- {m}" for m in missions))

                    profile = j.get("profile", "")
                    if profile:
                        parts.append("## Profil recherché\n" + profile)

                    # Metadata block for RAG context
                    meta = []
                    contract = j.get("contract_type", "")
                    if contract:
                        meta.append(f"Contrat: {contract}")
                    remote = j.get("remote", "")
                    if remote:
                        meta.append(f"Télétravail: {remote}")
                    offices = j.get("offices", [])
                    if offices:
                        city = offices[0].get("city", "")
                        if city:
                            meta.append(f"Localisation: {city}")
                    sal_min = j.get("salary_minimum")
                    sal_max = j.get("salary_maximum")
                    if sal_min and sal_max:
                        meta.append(f"Salaire: {int(sal_min)}–{int(sal_max)} €/an")
                    benefits = j.get("benefits", [])
                    if benefits:
                        meta.append(f"Avantages: {', '.join(benefits[:5])}")

                    if meta:
                        parts.append("## Informations\n" + "\n".join(meta))

                    parts.append(f"Source: {link}")

                    all_jobs.append({
                        "id": ext_id,
                        "title": j.get("name", "Poste inconnu"),
                        "description": "\n\n".join(parts),
                    })

            except Exception as e:
                logger.error(f"Error fetching WTTJ Algolia page {page}: {e}")
                break

        logger.info(f"WTTJ total fetched: {len(all_jobs)} jobs")
        return all_jobs
