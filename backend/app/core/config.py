from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:3000"
    
    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    
    # Vapi Settings
    VAPI_API_KEY: str = ""
    VAPI_PHONE_NUMBER_ID: str = ""
    WEBHOOK_URL: str = ""
    
    # LLM Settings
    LLM_MODEL: str = "claude-sonnet-4-6"

    # Scraping & Worker
    REDIS_URL: str = "redis://localhost:6379/0"
    SCRAPINGBEE_API_KEY: str = ""
    FRANCETRAVAIL_CLIENT_ID: str = ""
    FRANCETRAVAIL_CLIENT_SECRET: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )

settings = Settings()
