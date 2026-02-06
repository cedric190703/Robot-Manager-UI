from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from enum import Enum


class CommandStatus(str, Enum):
    """Status of command execution"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RobotType(str, Enum):
    """Types of robot arms"""
    SO100_LEADER = "so100_leader"
    SO100_FOLLOWER = "so100_follower"
    SO101_LEADER = "so101_leader"
    SO101_FOLLOWER = "so101_follower"


# Request Models
class FindPortRequest(BaseModel):
    """Request to find available robot ports"""
    pass


class IdentifyPortStartResponse(BaseModel):
    """Response from starting port identification (step 1: snapshot taken)"""
    session_id: str
    ports_before: List[str]
    message: str


class IdentifyPortDetectRequest(BaseModel):
    """Request to detect which port was removed (step 2)"""
    session_id: str
    arm_name: str = Field(default="unknown", example="leader", description="Name/label for this arm (e.g. 'leader', 'follower')")


class IdentifyPortDetectResponse(BaseModel):
    """Response from port detection (step 2: diff computed)"""
    session_id: str
    arm_name: str
    detected_port: Optional[str] = None
    ports_diff: List[str]
    message: str


class IdentifiedPortsResponse(BaseModel):
    """Response with all identified port-to-arm mappings"""
    ports: Dict[str, str]  # { "leader": "/dev/ttyACM0", "follower": "/dev/ttyACM1" }


class ChmodRequest(BaseModel):
    """Request to change port permissions"""
    port: str = Field(..., example="/dev/ttyACM0")
    permissions: str = Field(default="666", example="666")


class CalibrateRequest(BaseModel):
    """Request to calibrate a robot arm"""
    robot_type: RobotType
    port: str = Field(..., example="/dev/ttyACM0")
    robot_id: str = Field(..., example="leader")
    is_teleop: bool = Field(default=False, description="Is this for teleop device?")


class TeleoperateRequest(BaseModel):
    """Request to start teleoperation"""
    robot_type: RobotType
    robot_port: str = Field(..., example="/dev/ttyACM0")
    robot_id: str = Field(..., example="follower")
    teleop_type: RobotType
    teleop_port: str = Field(..., example="/dev/ttyACM1")
    teleop_id: str = Field(..., example="leader")
    fps: Optional[int] = Field(default=30, example=30)
    display_data: bool = Field(default=True)


class CommandResponse(BaseModel):
    """Response for command execution"""
    command_id: str
    status: CommandStatus
    command: str
    output: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


# Interactive session models (for calibrate/teleoperate)
class InteractiveSessionResponse(BaseModel):
    """Response for an interactive PTY session"""
    session_id: str
    command: str
    status: str
    output: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class InteractiveInputRequest(BaseModel):
    """Request to send input to an interactive session"""
    session_id: str
    text: str = Field(default="\n", description="Text to send (default: Enter key)")