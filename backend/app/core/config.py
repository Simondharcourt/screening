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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )

settings = Settings()
