from app.models.schemas import (
    CalibrateRequest,
    TeleoperateRequest,
    ChmodRequest
)


class RobotService:
    """Service for robot-specific operations"""
    
    @staticmethod
    def build_find_port_command() -> str:
        """
        Build a non-interactive command to list available serial ports.
        The original lerobot-find-port is interactive (requires disconnect/reconnect),
        so we list all ttyACM/ttyUSB ports directly.
        """
        return "{ ls -1 /dev/ttyACM* /dev/ttyUSB* 2>/dev/null; } | sort -u || echo 'No serial ports found'"
    
    @staticmethod
    def build_find_cameras_command() -> str:
        """
        Build the command to find cameras using lerobot-find-cameras.
        Uses opencv backend by default. This command is non-interactive.
        """
        return "lerobot-find-cameras opencv"
    
    @staticmethod
    def build_list_video_devices_command() -> str:
        """
        Build a simple command to list /dev/video* devices without lerobot.
        Fast fallback if lerobot-find-cameras takes too long.
        """
        return (
            "echo '=== Video Devices ===' && "
            "ls -la /dev/video* 2>/dev/null || echo 'No /dev/video* devices found'"
        )

    @staticmethod
    def build_chmod_command(request: ChmodRequest) -> str:
        """Build the chmod command"""
        return f"chmod {request.permissions} {request.port}"
    
    @staticmethod
    def build_calibrate_command(request: CalibrateRequest) -> str:
        """Build the calibration command.
        
        Before running calibration, we remove any empty/corrupt calibration
        files that would cause JSON decode errors on subsequent runs.
        """
        prefix = "teleop" if request.is_teleop else "robot"
        
        # Determine the calibration file path to check for corruption
        if request.is_teleop:
            cal_type = "teleoperators"
            # Map robot type to directory name (so101_leader -> so_leader, so100_leader -> so_leader)
            type_dir = "so_leader" if "leader" in request.robot_type.value else "so_follower"
        else:
            cal_type = "robots"
            type_dir = "so_follower" if "follower" in request.robot_type.value else "so_leader"

        cal_path = f"$HOME/.cache/huggingface/lerobot/calibration/{cal_type}/{type_dir}/{request.robot_id}.json"

        # Pre-command: remove empty/corrupt calibration files so calibration starts fresh
        cleanup = (
            f'if [ -f "{cal_path}" ] && [ ! -s "{cal_path}" ]; then '
            f'echo "Removing empty calibration file: {cal_path}"; '
            f'rm -f "{cal_path}"; '
            f'fi && '
        )

        return (
            f"{cleanup}"
            f"lerobot-calibrate "
            f"--{prefix}.type={request.robot_type.value} "
            f"--{prefix}.port={request.port} "
            f"--{prefix}.id={request.robot_id}"
        )
    
    @staticmethod
    def build_teleoperate_command(request: TeleoperateRequest) -> str:
        """Build the teleoperation command.
        
        Before running, we verify calibration files exist and are non-empty,
        otherwise the draccus JSON parser will crash.
        """
        # Build the calibration file validation
        teleop_type_dir = "so_leader" if "leader" in request.teleop_type.value else "so_follower"
        robot_type_dir = "so_follower" if "follower" in request.robot_type.value else "so_leader"
        
        teleop_cal = f"$HOME/.cache/huggingface/lerobot/calibration/teleoperators/{teleop_type_dir}/{request.teleop_id}.json"
        robot_cal = f"$HOME/.cache/huggingface/lerobot/calibration/robots/{robot_type_dir}/{request.robot_id}.json"

        # Pre-check: validate calibration files
        validate = (
            f'for f in "{teleop_cal}" "{robot_cal}"; do '
            f'  if [ -f "$f" ] && [ ! -s "$f" ]; then '
            f'    echo "ERROR: Calibration file $f is empty. Please re-calibrate first."; '
            f'    rm -f "$f"; '
            f'    exit 1; '
            f'  fi; '
            f'done && '
        )

        command_parts = [
            "lerobot-teleoperate",
            f"--robot.type={request.robot_type.value}",
            f"--robot.port={request.robot_port}",
            f"--robot.id={request.robot_id}",
            f"--teleop.type={request.teleop_type.value}",
            f"--teleop.port={request.teleop_port}",
            f"--teleop.id={request.teleop_id}",
        ]
        
        if request.fps:
            command_parts.append(f"--fps={request.fps}")
        
        if request.display_data:
            command_parts.append("--display_data=true")
        
        return validate + " ".join(command_parts)

    @staticmethod
    def build_reset_calibration_command(robot_id: str, cal_type: str = "all") -> str:
        """Build command to remove calibration files so user can re-calibrate fresh."""
        base = "$HOME/.cache/huggingface/lerobot/calibration"
        if cal_type == "teleop":
            return f'rm -rf {base}/teleoperators/so_leader/{robot_id}.json && echo "Calibration reset for teleop {robot_id}"'
        elif cal_type == "robot":
            return f'rm -rf {base}/robots/so_follower/{robot_id}.json && echo "Calibration reset for robot {robot_id}"'
        else:
            return (
                f'rm -rf {base}/teleoperators/so_leader/{robot_id}.json '
                f'{base}/robots/so_follower/{robot_id}.json && '
                f'echo "All calibration files reset for {robot_id}"'
            )


# Singleton instance
robot_service = RobotService()