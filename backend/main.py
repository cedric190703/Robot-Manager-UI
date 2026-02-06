"""
Root entry point for Robot Manager Backend.
Imports the FastAPI app from the modular app package.
"""
from app.main import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

