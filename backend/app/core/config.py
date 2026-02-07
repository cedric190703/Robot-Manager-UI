"""Application configuration"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""
    
    app_name: str = "Robot Manager API"
    app_version: str = "1.0.0"
    app_description: str = "Backend API for managing LeRobot commands"
    
    # API settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    # CORS settings
    cors_origins: list = ["*"]  # Configure for production
    cors_credentials: bool = True
    cors_methods: list = ["*"]
    cors_headers: list = ["*"]
    
    # Command execution settings
    default_command_timeout: int = 300  # 5 minutes
    use_sudo_by_default: bool = False
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()