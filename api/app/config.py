from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_bearer_token: str = ""

    loads_csv_path: str = "../data/loads.csv"
    calls_json_path: str = "../data/calls.json"

    hr_base_url: str = "https://platform.happyrobot.ai/api/v2"
    happyrobot_api_key: str = ""
    # Empty hr_workflow_id is a sentinel: /v1/calls/active short-circuits to
    # status="unconfigured" without contacting HR.
    hr_workflow_id: str = ""

    log_level: str = "INFO"


settings = Settings()
