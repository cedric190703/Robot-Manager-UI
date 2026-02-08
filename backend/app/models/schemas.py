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
    display_data: bool = Field(default=False, description="Requires a display server (X11/Wayland). Disabled by default in Docker.")


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


# ─── Persisted state schemas ─────────────────────────────────────

class SavePortRequest(BaseModel):
    """Request to manually save a port mapping"""
    arm_name: str = Field(..., example="leader")
    port_path: str = Field(..., example="/dev/ttyACM0")


class CalibrationRecordCreate(BaseModel):
    """Create a calibration record (saved after a successful calibration)"""
    arm_name: str = Field(..., example="leader")
    arm_role: str = Field(..., example="teleop", description="'teleop' or 'robot'")
    robot_type: str = Field(..., example="so101_leader")
    robot_id: str = Field(..., example="leader")
    port: str = Field(..., example="/dev/ttyACM0")
    cal_file: Optional[str] = Field(default=None, description="Path to calibration JSON file")
    status: str = Field(default="completed")


class CalibrationRecord(CalibrationRecordCreate):
    """Full calibration record (from DB)"""
    id: str
    calibrated_at: str
    updated_at: str


# ─── Recording / Dataset schemas ─────────────────────────────────────

class RecordingMode(str, Enum):
    """Mode of recording"""
    TELEOP = "teleop"       # Record with leader arm teleoperation
    POLICY = "policy"       # Record with a trained policy (inference)


class CameraConfig(BaseModel):
    """Configuration for a single camera used during recording"""
    name: str = Field(..., example="laptop", description="Unique camera label")
    type: str = Field(default="opencv", example="opencv")
    index_or_path: str = Field(..., example="0", description="Device index (e.g. '0') or path")
    width: int = Field(default=640)
    height: int = Field(default=480)
    fps: int = Field(default=30)


class RecordingConfigCreate(BaseModel):
    """Create a new recording configuration"""
    name: str = Field(..., example="Pick red cube config")
    description: str = Field(default="")
    # Robot
    robot_type: RobotType = Field(default=RobotType.SO100_FOLLOWER)
    robot_port: str = Field(..., example="/dev/ttyACM0")
    robot_id: str = Field(default="my_robot", example="black")
    # Cameras
    cameras: List[CameraConfig] = Field(default_factory=list)
    # Teleop (only for teleop mode)
    teleop_type: Optional[RobotType] = None
    teleop_port: Optional[str] = None
    teleop_id: Optional[str] = None
    # Policy (only for policy/inference mode)
    policy_path: Optional[str] = Field(default=None, example="my_username/act_policy")
    policy_type: Optional[str] = Field(default=None, example="act")
    policy_device: Optional[str] = Field(default=None, example="cuda")
    # Dataset
    repo_id: str = Field(..., example="my_username/my_dataset")
    num_episodes: int = Field(default=10, ge=1)
    single_task: str = Field(default="", example="Pick the red cube")
    fps: int = Field(default=30, ge=1, le=60)
    episode_time_s: int = Field(default=30, ge=1, description="Episode duration in seconds")
    reset_time_s: int = Field(default=10, ge=0, description="Reset time between episodes in seconds")
    display_data: bool = Field(default=False)
    play_sounds: bool = Field(default=False)
    push_to_hub: bool = Field(default=True)


class RecordingConfigUpdate(BaseModel):
    """Update an existing recording configuration (all fields optional)"""
    name: Optional[str] = None
    description: Optional[str] = None
    robot_type: Optional[RobotType] = None
    robot_port: Optional[str] = None
    robot_id: Optional[str] = None
    cameras: Optional[List[CameraConfig]] = None
    teleop_type: Optional[RobotType] = None
    teleop_port: Optional[str] = None
    teleop_id: Optional[str] = None
    policy_path: Optional[str] = None
    policy_type: Optional[str] = None
    policy_device: Optional[str] = None
    repo_id: Optional[str] = None
    num_episodes: Optional[int] = None
    single_task: Optional[str] = None
    fps: Optional[int] = None
    episode_time_s: Optional[int] = None
    reset_time_s: Optional[int] = None
    display_data: Optional[bool] = None
    play_sounds: Optional[bool] = None
    push_to_hub: Optional[bool] = None


class RecordingConfigResponse(BaseModel):
    """Response for a recording configuration"""
    id: str
    name: str
    description: str
    robot_type: str
    robot_port: str
    robot_id: str
    cameras: List[dict]
    teleop_type: Optional[str] = None
    teleop_port: Optional[str] = None
    teleop_id: Optional[str] = None
    policy_path: Optional[str] = None
    policy_type: Optional[str] = None
    policy_device: Optional[str] = None
    repo_id: str
    num_episodes: int
    single_task: str
    fps: int
    episode_time_s: int = 30
    reset_time_s: int = 10
    display_data: bool
    play_sounds: bool = False
    push_to_hub: bool = True
    created_at: str
    updated_at: str

    @property
    def mode(self) -> str:
        return "policy" if self.policy_path else "teleop"


class DatasetStatus(str, Enum):
    CREATED = "created"
    RECORDING = "recording"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class DatasetResponse(BaseModel):
    """Response for a dataset"""
    id: str
    config_id: str
    repo_id: str
    status: str
    total_episodes: int
    completed_episodes: int
    single_task: str
    created_at: str
    updated_at: str


class EpisodeStatus(str, Enum):
    PENDING = "pending"
    RECORDING = "recording"
    COMPLETED = "completed"
    FAILED = "failed"


class EpisodeResponse(BaseModel):
    """Response for an episode"""
    id: int
    dataset_id: str
    episode_num: int
    status: str
    session_id: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_s: Optional[float] = None
    created_at: str


class StartRecordingRequest(BaseModel):
    """Request to start a recording session from a saved config"""
    config_id: str


class DirectRecordRequest(BaseModel):
    """Request to start a recording session directly (no saved config needed)"""
    robot_type: RobotType = Field(default=RobotType.SO101_FOLLOWER)
    robot_port: str = Field(..., example="/dev/ttyACM0")
    robot_id: str = Field(default="follower", example="follower")
    cameras: List[CameraConfig] = Field(default_factory=list)
    teleop_type: Optional[RobotType] = Field(default=RobotType.SO101_LEADER)
    teleop_port: Optional[str] = Field(default=None, example="/dev/ttyACM1")
    teleop_id: Optional[str] = Field(default="leader", example="leader")
    policy_path: Optional[str] = None
    policy_type: Optional[str] = None
    policy_device: Optional[str] = None
    repo_id: str = Field(..., example="my_user/my_dataset")
    num_episodes: int = Field(default=10, ge=1)
    single_task: str = Field(default="", example="Pick the red cube")
    fps: int = Field(default=30, ge=1, le=60)
    episode_time_s: int = Field(default=30, ge=1)
    reset_time_s: int = Field(default=10, ge=0)
    display_data: bool = Field(default=False)
    play_sounds: bool = Field(default=False)
    push_to_hub: bool = Field(default=True)
    force_override: bool = Field(default=False, description="If true, remove existing dataset dir before recording")


class StartRecordingResponse(BaseModel):
    """Response when a recording session is started"""
    dataset_id: str
    session_id: str
    command: str
    status: str
    message: str


# ─── Replay request ──────────────────────────────────────────────────

class ReplayRequest(BaseModel):
    """Request to replay a dataset episode on the robot"""
    robot_type: RobotType = Field(default=RobotType.SO100_FOLLOWER)
    robot_port: str = Field(..., example="/dev/ttyACM0")
    robot_id: str = Field(default="my_robot", example="follower")
    repo_id: str = Field(..., example="my_user/my_dataset")
    episode: int = Field(default=0, ge=0, description="Episode index to replay")


# ─── Train request ───────────────────────────────────────────────────

class TrainRequest(BaseModel):
    """Request to train a policy on a dataset"""
    policy_type: str = Field(default="act", example="act")
    policy_device: str = Field(default="cuda", example="cuda")
    policy_repo_id: str = Field(default="", example="my_user/act_policy", description="HF repo for the checkpoint (optional)")
    push_to_hub: bool = Field(default=False)
    dataset_repo_id: str = Field(..., example="my_user/my_dataset")
    output_dir: str = Field(default="outputs/bc", example="outputs/bc")
    steps: int = Field(default=1000, ge=1)


# ─── Eval request ────────────────────────────────────────────────────

class EvalRequest(BaseModel):
    """Request to evaluate a trained policy"""
    policy_type: str = Field(default="act", example="act")
    policy_device: str = Field(default="cuda", example="cuda")
    policy_path: str = Field(..., example="outputs/bc", description="Local path or HF repo for the policy checkpoint")
    dataset_repo_id: str = Field(..., example="my_user/my_dataset")


# ─── HuggingFace settings ───────────────────────────────────────────

class HFSettings(BaseModel):
    """HuggingFace credentials"""
    hf_username: str = Field(default="", example="my_username")
    hf_token: str = Field(default="", example="hf_xxxxxxxxxxxx")


class GenericSessionResponse(BaseModel):
    """Response when an interactive session (replay/train/eval) is started"""
    session_id: str
    command: str
    status: str
    message: str