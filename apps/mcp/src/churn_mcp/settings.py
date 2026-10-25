from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    churn_api_url: str = "http://api:8080"
    mcp_port: int = 8090
    mcp_api_timeout: float = 10.0
