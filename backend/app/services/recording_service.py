"""Service that builds lerobot commands and manages recording lifecycle."""

import uuid
from typing import Dict, Any, Optional, List

from app.db.database import database
from app.models.schemas import (
    RecordingConfigCreate,
    RecordingConfigUpdate
)


class RecordingService:
    """Orchestrates recording configs, datasets, and episodes with DB persistence."""

    # ── config helpers ───────────────────────────────────────────

    def create_config(self, data: RecordingConfigCreate) -> Dict[str, Any]:
        config_id = str(uuid.uuid4())
        row = {
            "id": config_id,
            "name": data.name,
            "description": data.description,
            "robot_type": data.robot_type.value,
            "robot_port": data.robot_port,
            "robot_id": data.robot_id,
            "cameras": [c.model_dump() for c in data.cameras],
            "teleop_type": data.teleop_type.value if data.teleop_type else None,
            "teleop_port": data.teleop_port,
            "teleop_id": data.teleop_id,
            "policy_path": data.policy_path,
            "policy_type": data.policy_type,
            "policy_device": data.policy_device,
            "repo_id": data.repo_id,
            "num_episodes": data.num_episodes,
            "single_task": data.single_task,
            "fps": data.fps,
            "episode_time_s": data.episode_time_s,
            "reset_time_s": data.reset_time_s,
            "display_data": 1 if data.display_data else 0,
            "play_sounds": 1 if data.play_sounds else 0,
            "push_to_hub": 1 if data.push_to_hub else 0,
        }
        return database.create_config(row)

    def get_config(self, config_id: str) -> Optional[Dict[str, Any]]:
        return database.get_config(config_id)

    def list_configs(self) -> List[Dict[str, Any]]:
        return database.list_configs()

    def update_config(self, config_id: str, data: RecordingConfigUpdate) -> Optional[Dict[str, Any]]:
        updates = data.model_dump(exclude_none=True)
        if "cameras" in updates:
            updates["cameras"] = [
                c if isinstance(c, dict) else c.model_dump()
                for c in updates["cameras"]
            ]
        if "robot_type" in updates:
            updates["robot_type"] = updates["robot_type"].value if hasattr(updates["robot_type"], "value") else updates["robot_type"]
        if "teleop_type" in updates and updates["teleop_type"] is not None:
            updates["teleop_type"] = updates["teleop_type"].value if hasattr(updates["teleop_type"], "value") else updates["teleop_type"]
        for bool_field in ("display_data", "play_sounds", "push_to_hub"):
            if bool_field in updates:
                updates[bool_field] = 1 if updates[bool_field] else 0
        if not updates:
            return self.get_config(config_id)
        return database.update_config(config_id, updates)

    def delete_config(self, config_id: str) -> bool:
        return database.delete_config(config_id)

    # ── dataset helpers ──────────────────────────────────────────

    def create_dataset(self, config_id: str) -> Dict[str, Any]:
        config = database.get_config(config_id)
        if config is None:
            raise ValueError(f"Config {config_id} not found")
        dataset_id = str(uuid.uuid4())
        row = {
            "id": dataset_id,
            "config_id": config_id,
            "repo_id": config["repo_id"],
            "status": "created",
            "total_episodes": config["num_episodes"],
            "completed_episodes": 0,
            "single_task": config["single_task"],
        }
        return database.create_dataset(row)

    def get_dataset(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        return database.get_dataset(dataset_id)

    def list_datasets(self, config_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return database.list_datasets(config_id)

    def update_dataset_status(self, dataset_id: str, status: str, completed_episodes: Optional[int] = None) -> Optional[Dict[str, Any]]:
        data: Dict[str, Any] = {"status": status}
        if completed_episodes is not None:
            data["completed_episodes"] = completed_episodes
        return database.update_dataset(dataset_id, data)

    def delete_dataset(self, dataset_id: str) -> bool:
        return database.delete_dataset(dataset_id)

    # ── episode helpers ──────────────────────────────────────────

    def create_episode(self, dataset_id: str, episode_num: int) -> Dict[str, Any]:
        row = {
            "dataset_id": dataset_id,
            "episode_num": episode_num,
            "status": "pending",
        }
        return database.create_episode(row)

    def list_episodes(self, dataset_id: str) -> List[Dict[str, Any]]:
        return database.list_episodes(dataset_id)

    def update_episode(self, episode_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return database.update_episode(episode_id, data)

    # ── command builder ──────────────────────────────────────────

    @staticmethod
    def _build_cameras_arg(cameras: List[dict]) -> str:
        """Build the --robot.cameras='{ ... }' argument from a list of camera dicts."""
        if not cameras:
            return ""
        parts = []
        for cam in cameras:
            name = cam.get("name", "cam")
            cam_type = cam.get("type", "opencv")
            index = cam.get("index_or_path", "0")
            w = cam.get("width", 640)
            h = cam.get("height", 480)
            fps = cam.get("fps", 30)
            parts.append(
                f"{name}: {{type: {cam_type}, index_or_path: {index}, width: {w}, height: {h}, fps: {fps}}}"
            )
        return '"{' + ", ".join(parts) + '}"'

    def build_record_command(self, config: Dict[str, Any], force_override: bool = False) -> str:
        """Build a full `lerobot-record` CLI command from a config dict."""
        pre_parts = []

        # If force_override, remove the existing dataset directory first
        if force_override and config.get("repo_id"):
            repo_id = config["repo_id"]
            # lerobot stores datasets under ~/.cache/huggingface/lerobot/<repo_id>
            dataset_path = f"$HOME/.cache/huggingface/lerobot/{repo_id}"
            pre_parts.append(
                f'if [ -d "{dataset_path}" ]; then '
                f'echo "Removing existing dataset at {dataset_path}"; '
                f'rm -rf "{dataset_path}"; '
                f'fi'
            )

        parts = ["lerobot-record"]

        # Robot
        parts.append(f"--robot.type={config['robot_type']}")
        parts.append(f"--robot.port={config['robot_port']}")
        parts.append(f"--robot.id={config['robot_id']}")

        # Cameras
        cameras_arg = self._build_cameras_arg(config.get("cameras", []))
        if cameras_arg:
            parts.append(f"--robot.cameras={cameras_arg}")

        # Teleop or policy
        if config.get("policy_path"):
            parts.append(f"--policy.path={config['policy_path']}")
            if config.get("policy_type"):
                parts.append(f"--policy.type={config['policy_type']}")
            if config.get("policy_device"):
                parts.append(f"--policy.device={config['policy_device']}")
        else:
            if config.get("teleop_type"):
                parts.append(f"--teleop.type={config['teleop_type']}")
            if config.get("teleop_port"):
                parts.append(f"--teleop.port={config['teleop_port']}")
            if config.get("teleop_id"):
                parts.append(f"--teleop.id={config['teleop_id']}")

        # Dataset
        parts.append(f"--dataset.repo_id={config['repo_id']}")
        parts.append(f"--dataset.num_episodes={config['num_episodes']}")
        if config.get("single_task"):
            parts.append(f'--dataset.single_task="{config["single_task"]}"')
        parts.append(f"--dataset.fps={config['fps']}")

        # Episode / reset timing
        episode_time = config.get("episode_time_s", 30)
        reset_time = config.get("reset_time_s", 10)
        parts.append(f"--dataset.episode_time_s={episode_time}")
        parts.append(f"--dataset.reset_time_s={reset_time}")

        # Push to hub
        push = config.get("push_to_hub", True)
        parts.append(f"--dataset.push_to_hub={'true' if push else 'false'}")

        # Display & sounds — force off in headless Docker
        import os
        has_display = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
        display = config.get("display_data", False) and has_display
        parts.append(f"--display_data={'true' if display else 'false'}")

        # play_sounds requires spd-say which isn't available in Docker
        import shutil
        has_spd_say = shutil.which("spd-say") is not None
        play_sounds = config.get("play_sounds", False) and has_spd_say
        parts.append(f"--play_sounds={'true' if play_sounds else 'false'}")

        command = " ".join(parts)
        if pre_parts:
            command = " && ".join(pre_parts) + " && " + command
        return command

    @staticmethod
    def build_replay_command(data) -> str:
        """Build a `lerobot-replay` CLI command."""
        parts = ["lerobot-replay"]
        parts.append(f"--robot.type={data.robot_type.value if hasattr(data.robot_type, 'value') else data.robot_type}")
        parts.append(f"--robot.port={data.robot_port}")
        parts.append(f"--robot.id={data.robot_id}")
        parts.append(f"--dataset.repo_id={data.repo_id}")
        parts.append(f"--dataset.episode={data.episode}")
        return " ".join(parts)

    @staticmethod
    def build_train_command(data) -> str:
        """Build a `lerobot-train` CLI command."""
        parts = ["lerobot-train"]
        parts.append(f"--policy.type={data.policy_type}")
        parts.append(f"--policy.device={data.policy_device}")
        if data.policy_repo_id:
            parts.append(f"--policy.repo_id={data.policy_repo_id}")
        parts.append(f"--policy.push_to_hub={'true' if data.push_to_hub else 'false'}")
        parts.append(f"--dataset.repo_id={data.dataset_repo_id}")
        parts.append(f"--output_dir={data.output_dir}")
        parts.append(f"--steps={data.steps}")
        return " ".join(parts)

    @staticmethod
    def build_eval_command(data) -> str:
        """Build a `lerobot-eval` CLI command."""
        parts = ["lerobot-eval"]
        parts.append(f"--policy.type={data.policy_type}")
        parts.append(f"--policy.device={data.policy_device}")
        parts.append(f"--policy.path={data.policy_path}")
        parts.append(f"--dataset.repo_id={data.dataset_repo_id}")
        return " ".join(parts)


# Singleton
recording_service = RecordingService()