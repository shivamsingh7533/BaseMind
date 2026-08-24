from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    clerk_jwks_url: str = ""
    clerk_issuer: str = ""
    allowed_origins: str = ""
    upstash_redis_rest_url: str = ""
    upstash_redis_rest_token: str = ""
    gemini_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
