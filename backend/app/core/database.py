from supabase import create_client, Client
from app.core.config import settings

def get_supabase_client() -> Client:
    """
    Returns a configured Supabase client using settings.
    If the URL or Key is not configured, it will raise an error during client creation
    or when performing operations.
    """
    url: str = settings.SUPABASE_URL.rstrip('/')
    key: str = settings.SUPABASE_SERVICE_ROLE_KEY # Using service role for backend operations
    
    # We allow the app to boot without these during initial setup
    if not url or not key:
        print("WARNING: Supabase URL or Key is not set in environment variables.")
        # Returning a dummy client or handling this better might be needed for tests,
        # but for now, we'll let supabase-py throw an error if it's actually used.
        try:
           return create_client(url, key)
        except Exception as e:
           print(f"Error initializing Supabase client: {e}")
           return None

    return create_client(url, key)

# Create a singleton instance for easy import
supabase = get_supabase_client()
