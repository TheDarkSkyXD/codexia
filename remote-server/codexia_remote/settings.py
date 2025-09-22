from pydantic_settings import BaseSettings


class RemoteSettings(BaseSettings):
    """Environment configuration for the remote bridge."""

    remote_ws_url: str = "ws://127.0.0.1:7420/remote_ui_ws"
    remote_http_url: str = "http://127.0.0.1:7420"
    request_timeout: int = 30

    class Config:
        env_prefix = "CODEXIA_"


settings = RemoteSettings()
