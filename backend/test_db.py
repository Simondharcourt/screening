import asyncio
import os
import httpx
from dotenv import load_dotenv

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

print("URL loaded:", url)
print("KEY loaded:", key[:10] + "...")

# Explicitly test via httpx to see if python network has an issue
resp = httpx.get(
    f"{url}/rest/v1/job_postings?select=*",
    headers={
        "apikey": key,
        "Authorization": f"Bearer {key}"
    }
)
print("HTTPX Response:", resp.status_code, resp.text)

from supabase import create_client
supabase = create_client(url, key)
try:
    res = supabase.table("job_postings").select("*").limit(1).execute()
    print("Supabase-py:", res)
except Exception as e:
    print("Supabase-py ERROR:", e)
