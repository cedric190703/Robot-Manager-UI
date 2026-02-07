"""API routes for application settings (HuggingFace credentials, etc.)."""

from fastapi import APIRouter

from app.models.schemas import HFSettings
from app.db.database import database

router = APIRouter()


@router.get("/hf", response_model=HFSettings)
async def get_hf_settings():
    """Get stored HuggingFace credentials."""
    username = database.get_state("hf_username") or ""
    token = database.get_state("hf_token") or ""
    return HFSettings(hf_username=username, hf_token=token)


@router.post("/hf", response_model=HFSettings)
async def save_hf_settings(data: HFSettings):
    """Save HuggingFace credentials (persisted in DB)."""
    if data.hf_username:
        database.set_state("hf_username", data.hf_username)
    if data.hf_token:
        database.set_state("hf_token", data.hf_token)
    return HFSettings(
        hf_username=database.get_state("hf_username") or "",
        hf_token=database.get_state("hf_token") or "",
    )


@router.delete("/hf")
async def clear_hf_settings():
    """Clear HuggingFace credentials."""
    database.delete_state("hf_username")
    database.delete_state("hf_token")
    return {"message": "HuggingFace settings cleared"}
