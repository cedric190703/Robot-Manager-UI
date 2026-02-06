from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from app.config.config import settings
from app.api.routes import router as commands_router


def create_application() -> FastAPI:
    """Create and configure the FastAPI application"""
    
    app = FastAPI(
        title=settings.app_name,
        description=settings.app_description,
        version=settings.app_version
    )
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_credentials,
        allow_methods=settings.cors_methods,
        allow_headers=settings.cors_headers,
    )
    
    # Include routers
    app.include_router(
        commands_router,
        prefix="/commands",
        tags=["commands"]
    )
    
    # Root endpoints
    @app.get("/")
    async def root():
        """Root endpoint"""
        return {
            "message": settings.app_name,
            "version": settings.app_version,
            "status": "running"
        }

    @app.get("/health")
    async def health_check():
        """Health check endpoint"""
        return {"status": "healthy", "timestamp": datetime.now().isoformat()}
    
    return app


app = create_application()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )