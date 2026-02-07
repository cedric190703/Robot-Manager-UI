from fastapi import APIRouter, HTTPException
from typing import List, Optional

from app.models.schemas import (
    RecordingConfigCreate,
    RecordingConfigUpdate,
    RecordingConfigResponse,
    DatasetResponse,
    EpisodeResponse,
    StartRecordingRequest,
    StartRecordingResponse,
    ReplayRequest,
    TrainRequest,
    EvalRequest,
    GenericSessionResponse,
)
from app.services.recording_service import recording_service
from app.services.interactive_service import interactive_service

router = APIRouter()

# ─── Recording Configs ───────────────────────────────────────────────

@router.post("/configs", response_model=RecordingConfigResponse)
async def create_recording_config(data: RecordingConfigCreate):
    """Create a new recording configuration (saved to DB)."""
    config = recording_service.create_config(data)
    return RecordingConfigResponse(**config)


@router.get("/configs", response_model=List[RecordingConfigResponse])
async def list_recording_configs():
    """List all saved recording configurations."""
    configs = recording_service.list_configs()
    return [RecordingConfigResponse(**c) for c in configs]


@router.get("/configs/{config_id}", response_model=RecordingConfigResponse)
async def get_recording_config(config_id: str):
    """Get a single recording configuration by ID."""
    config = recording_service.get_config(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return RecordingConfigResponse(**config)


@router.put("/configs/{config_id}", response_model=RecordingConfigResponse)
async def update_recording_config(config_id: str, data: RecordingConfigUpdate):
    """Update an existing recording configuration."""
    existing = recording_service.get_config(config_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Config not found")
    updated = recording_service.update_config(config_id, data)
    return RecordingConfigResponse(**updated)


@router.delete("/configs/{config_id}")
async def delete_recording_config(config_id: str):
    """Delete a recording configuration and all its datasets/episodes."""
    if not recording_service.delete_config(config_id):
        raise HTTPException(status_code=404, detail="Config not found")
    return {"message": "Config deleted", "config_id": config_id}


# ─── Datasets ────────────────────────────────────────────────────────

@router.get("/datasets", response_model=List[DatasetResponse])
async def list_datasets(config_id: Optional[str] = None):
    """List all datasets, optionally filtered by config_id."""
    datasets = recording_service.list_datasets(config_id)
    return [DatasetResponse(**d) for d in datasets]


@router.get("/datasets/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(dataset_id: str):
    """Get a single dataset."""
    dataset = recording_service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return DatasetResponse(**dataset)


@router.delete("/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str):
    """Delete a dataset and all its episodes."""
    if not recording_service.delete_dataset(dataset_id):
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"message": "Dataset deleted", "dataset_id": dataset_id}


# ─── Episodes ────────────────────────────────────────────────────────

@router.get("/datasets/{dataset_id}/episodes", response_model=List[EpisodeResponse])
async def list_episodes(dataset_id: str):
    """List all episodes for a dataset."""
    episodes = recording_service.list_episodes(dataset_id)
    return [EpisodeResponse(**e) for e in episodes]


# ─── Start / stop recording ─────────────────────────────────────────

@router.post("/start", response_model=StartRecordingResponse)
async def start_recording(request: StartRecordingRequest):
    """
    Start a `lerobot-record` session from a saved config.
    Creates a dataset + episodes in DB, launches the interactive PTY session.
    """
    config = recording_service.get_config(request.config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    # Create dataset in DB
    dataset = recording_service.create_dataset(request.config_id)

    # Create episode placeholders
    for i in range(config["num_episodes"]):
        recording_service.create_episode(dataset["id"], i)

    # Build command and launch interactive session
    command = recording_service.build_record_command(config)
    session = interactive_service.start_session(command)

    # Mark dataset as recording
    recording_service.update_dataset_status(dataset["id"], "recording")

    return StartRecordingResponse(
        dataset_id=dataset["id"],
        session_id=session.session_id,
        command=command,
        status="recording",
        message=f"Recording started: {config['num_episodes']} episodes → {config['repo_id']}",
    )


@router.post("/stop/{session_id}")
async def stop_recording(session_id: str, dataset_id: Optional[str] = None):
    """Stop an active recording session. Optionally update dataset status."""
    session = interactive_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    interactive_service.cancel_session(session_id)

    if dataset_id:
        recording_service.update_dataset_status(dataset_id, "completed")

    return {"message": "Recording stopped", "session_id": session_id}


# ─── Replay ──────────────────────────────────────────────────────────

@router.post("/replay/start", response_model=GenericSessionResponse)
async def start_replay(data: ReplayRequest):
    """Start a `lerobot-replay` session."""
    command = recording_service.build_replay_command(data)
    session = interactive_service.start_session(command)
    return GenericSessionResponse(
        session_id=session.session_id,
        command=command,
        status="running",
        message=f"Replaying episode {data.episode} from {data.repo_id}",
    )


# ─── Train ───────────────────────────────────────────────────────────

@router.post("/train/start", response_model=GenericSessionResponse)
async def start_train(data: TrainRequest):
    """Start a `lerobot-train` session."""
    command = recording_service.build_train_command(data)
    session = interactive_service.start_session(command)
    return GenericSessionResponse(
        session_id=session.session_id,
        command=command,
        status="running",
        message=f"Training {data.policy_type} on {data.dataset_repo_id} for {data.steps} steps",
    )


# ─── Eval ────────────────────────────────────────────────────────────

@router.post("/eval/start", response_model=GenericSessionResponse)
async def start_eval(data: EvalRequest):
    """Start a `lerobot-eval` session."""
    command = recording_service.build_eval_command(data)
    session = interactive_service.start_session(command)
    return GenericSessionResponse(
        session_id=session.session_id,
        command=command,
        status="running",
        message=f"Evaluating {data.policy_type} from {data.policy_path}",
    )


# ─── Stop any session ───────────────────────────────────────────────

@router.post("/session/stop/{session_id}")
async def stop_session(session_id: str):
    """Stop any active interactive session (replay/train/eval)."""
    session = interactive_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    interactive_service.cancel_session(session_id)
    return {"message": "Session stopped", "session_id": session_id}