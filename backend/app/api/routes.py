from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import Response, StreamingResponse
from typing import List

from app.models.schemas import (
    CommandResponse,
    CommandStatus,
    FindPortRequest,
    ChmodRequest,
    CalibrateRequest,
    TeleoperateRequest,
    IdentifyPortDetectRequest,
    IdentifyPortStartResponse,
    IdentifyPortDetectResponse,
    IdentifiedPortsResponse,
    InteractiveSessionResponse,
    InteractiveInputRequest
)
from app.services.command_service import command_service
from app.services.robot_service import robot_service
from app.services.port_service import port_service
from app.services.interactive_service import interactive_service
from app.services.camera_service import camera_service

router = APIRouter()


# ─── Port Identification (guided multi-step flow) ────────────────────

@router.post("/identify-port/start", response_model=IdentifyPortStartResponse)
async def identify_port_start():
    """
    Step 1: Snapshot current ports.
    Call this, then ask the user to DISCONNECT one arm.
    """
    session_id, ports_before = port_service.start_session()
    return IdentifyPortStartResponse(
        session_id=session_id,
        ports_before=ports_before,
        message="Ports scanned. Now disconnect ONE arm's USB cable and click 'Detect Port'."
    )


@router.post("/identify-port/detect", response_model=IdentifyPortDetectResponse)
async def identify_port_detect(request: IdentifyPortDetectRequest):
    """
    Step 2: Scan ports again and diff to identify which port was removed.
    """
    detected_port, ports_diff, message = port_service.detect_port(
        request.session_id, request.arm_name
    )
    return IdentifyPortDetectResponse(
        session_id=request.session_id,
        arm_name=request.arm_name,
        detected_port=detected_port,
        ports_diff=ports_diff,
        message=message
    )


@router.post("/identify-port/refresh")
async def identify_port_refresh(session_id: str):
    """Re-scan ports and update session snapshot (call after reconnecting an arm)."""
    ports = port_service.refresh_session(session_id)
    return {"session_id": session_id, "ports": ports, "message": "Snapshot updated."}


@router.get("/identify-port/results", response_model=IdentifiedPortsResponse)
async def get_identified_ports():
    """Get all identified arm → port mappings."""
    return IdentifiedPortsResponse(ports=port_service.get_identified_ports())


# ─── Legacy find-port (simple port listing) ──────────────────────────

@router.post("/find-port", response_model=CommandResponse)
async def find_port(background_tasks: BackgroundTasks):
    """Find available robot serial ports (non-interactive, simple list)"""
    command = robot_service.build_find_port_command()
    command_id = command_service.create_command_entry(command)
    
    background_tasks.add_task(
        command_service.execute_command_async,
        command_id,
        command,
        False,  # use_sudo
        False   # use_conda
    )
    
    return CommandResponse(
        command_id=command_id,
        status=CommandStatus.PENDING,
        command=command
    )


# ─── Camera discovery ────────────────────────────────────────────────

@router.post("/find-cameras", response_model=InteractiveSessionResponse)
async def find_cameras():
    """Discover cameras using lerobot-find-cameras opencv (interactive, may take a few seconds)"""
    command = robot_service.build_find_cameras_command()
    session = interactive_service.start_session(command)
    return InteractiveSessionResponse(**session.to_dict())


@router.post("/list-video-devices", response_model=CommandResponse)
async def list_video_devices(background_tasks: BackgroundTasks):
    """Quick list of /dev/video* devices"""
    command = robot_service.build_list_video_devices_command()
    command_id = command_service.create_command_entry(command)

    background_tasks.add_task(
        command_service.execute_command_async,
        command_id,
        command,
        False,
        False
    )

    return CommandResponse(
        command_id=command_id,
        status=CommandStatus.PENDING,
        command=command
    )


@router.get("/camera/devices")
async def get_camera_devices():
    """Return list of available /dev/video* device indices"""
    indices = camera_service.list_video_device_indices()
    return {"devices": [{"index": i, "path": f"/dev/video{i}"} for i in indices]}


@router.get("/camera/{device_index}/snapshot")
async def camera_snapshot(device_index: int):
    """Capture a single JPEG frame from /dev/video<device_index>"""
    jpeg_bytes = camera_service.capture_snapshot(device_index)
    if jpeg_bytes is None:
        raise HTTPException(
            status_code=503,
            detail=f"Could not capture from /dev/video{device_index}. Device may be busy or missing."
        )
    return Response(content=jpeg_bytes, media_type="image/jpeg")


@router.get("/camera/{device_index}/stream")
async def camera_stream(device_index: int, fps: int = 10):
    """MJPEG live stream from /dev/video<device_index>.
    
    Embed in an <img> tag:  <img src="/commands/camera/0/stream" />
    """
    return StreamingResponse(
        camera_service.mjpeg_stream(device_index, fps=min(fps, 30)),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@router.post("/chmod", response_model=CommandResponse)
async def chmod_port(request: ChmodRequest, background_tasks: BackgroundTasks):
    """Change permissions on a port using chmod"""
    command = robot_service.build_chmod_command(request)
    command_id = command_service.create_command_entry(command)
    
    background_tasks.add_task(
        command_service.execute_command_async,
        command_id,
        command,
        True,   # use_sudo
        False   # use_conda (not needed for chmod)
    )
    
    return CommandResponse(
        command_id=command_id,
        status=CommandStatus.PENDING,
        command=f"sudo {command}"
    )


@router.post("/calibrate", response_model=InteractiveSessionResponse)
async def calibrate_robot(request: CalibrateRequest):
    """Start an interactive calibration session (uses PTY for input prompts)"""
    command = robot_service.build_calibrate_command(request)
    session = interactive_service.start_session(command)
    return InteractiveSessionResponse(**session.to_dict())


@router.post("/teleoperate", response_model=InteractiveSessionResponse)
async def teleoperate_robot(request: TeleoperateRequest):
    """Start an interactive teleoperation session (uses PTY)"""
    command = robot_service.build_teleoperate_command(request)
    session = interactive_service.start_session(command)
    return InteractiveSessionResponse(**session.to_dict())


@router.post("/reset-calibration")
async def reset_calibration(robot_id: str = "leader", cal_type: str = "all", background_tasks: BackgroundTasks = None):
    """Reset (delete) calibration files for a given robot_id. Useful when calibration is corrupt."""
    command = robot_service.build_reset_calibration_command(robot_id, cal_type)
    command_id = command_service.create_command_entry(command)
    
    background_tasks.add_task(
        command_service.execute_command_async,
        command_id,
        command,
        False,
        False
    )
    
    return CommandResponse(
        command_id=command_id,
        status=CommandStatus.PENDING,
        command=command
    )


# ─── Interactive session management ──────────────────────────────────

@router.get("/interactive/{session_id}", response_model=InteractiveSessionResponse)
async def get_interactive_session(session_id: str):
    """Get the current state and output of an interactive session"""
    session = interactive_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return InteractiveSessionResponse(**session.to_dict())


@router.post("/interactive/{session_id}/enter")
async def send_enter_to_session(session_id: str):
    """Send Enter key to an interactive session (e.g. confirm calibration step)"""
    session = interactive_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    success = interactive_service.send_enter(session_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to send input. Session may have ended.")
    
    return {"message": "Enter sent", "session_id": session_id}


@router.post("/interactive/{session_id}/input")
async def send_input_to_session(session_id: str, request: InteractiveInputRequest):
    """Send arbitrary text to an interactive session"""
    session = interactive_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    success = interactive_service.send_text(session_id, request.text)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to send input. Session may have ended.")
    
    return {"message": "Input sent", "session_id": session_id}


@router.delete("/interactive/{session_id}")
async def cancel_interactive_session(session_id: str):
    """Cancel/kill an interactive session"""
    success = interactive_service.cancel_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session cancelled", "session_id": session_id}


@router.get("/{command_id}", response_model=CommandResponse)
async def get_command_status(command_id: str):
    """Get the status of a command execution"""
    process_data = command_service.get_command_status(command_id)
    
    if not process_data:
        raise HTTPException(status_code=404, detail="Command not found")
    
    return CommandResponse(
        command_id=command_id,
        status=process_data["status"],
        command=process_data["command"],
        output=process_data["output"],
        error=process_data["error"],
        started_at=process_data["started_at"],
        completed_at=process_data["completed_at"]
    )


@router.get("/", response_model=List[CommandResponse])
async def list_commands():
    """List all commands and their status"""
    processes = command_service.get_all_commands()
    
    return [
        CommandResponse(
            command_id=cmd_id,
            status=data["status"],
            command=data["command"],
            output=data["output"],
            error=data["error"],
            started_at=data["started_at"],
            completed_at=data["completed_at"]
        )
        for cmd_id, data in processes.items()
    ]


@router.delete("/{command_id}")
async def cancel_command(command_id: str):
    """Cancel a running command (if possible)"""
    success = command_service.cancel_command(command_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Command not found")
    
    return {"message": "Command cancelled", "command_id": command_id}


@router.delete("/")
async def clear_all_commands():
    """Clear all command history"""
    command_service.clear_all_commands()
    return {"message": "All commands cleared"}