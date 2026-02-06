import subprocess
import uuid
from datetime import datetime
from typing import Dict, Optional, Tuple

from app.models.schemas import CommandStatus


class CommandService:
    """Service for managing command execution"""
    
    def __init__(self):
        self.processes: Dict[str, dict] = {}
    
    def create_command_entry(self, command: str) -> str:
        """Create a new command entry in the processes store"""
        command_id = str(uuid.uuid4())
        self.processes[command_id] = {
            "command": command,
            "status": CommandStatus.PENDING,
            "output": None,
            "error": None,
            "started_at": None,
            "completed_at": None
        }
        return command_id
    
    def execute_command(self, command: str, use_sudo: bool = False, use_conda: bool = True) -> Tuple[int, str, str]:
        """
        Execute a shell command and return the result
        
        Args:
            command: The command to execute
            use_sudo: Whether to use sudo
            use_conda: Whether to activate conda lerobot environment
            
        Returns:
            Tuple of (return_code, stdout, stderr)
        """
        try:
            # Wrap command with conda activation if needed
            if use_conda and not use_sudo:
                # Use absolute path to conda since FastAPI runs outside conda
                command = (
                    f"bash -c 'source /opt/conda/etc/profile.d/conda.sh && "
                    f"conda activate lerobot && "
                    f"{command}'"
                )
            
            if use_sudo:
                command = f"sudo {command}"
            
            process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                executable='/bin/bash'
            )
            
            stdout, stderr = process.communicate()
            return process.returncode, stdout, stderr
        except Exception as e:
            return 1, "", str(e)
    
    async def execute_command_async(self, command_id: str, command: str, use_sudo: bool = False, use_conda: bool = True):
        """Execute a command asynchronously and store the result"""
        self.processes[command_id]["status"] = CommandStatus.RUNNING
        self.processes[command_id]["started_at"] = datetime.now().isoformat()
        
        try:
            returncode, stdout, stderr = self.execute_command(command, use_sudo, use_conda)
            
            if returncode == 0:
                self.processes[command_id]["status"] = CommandStatus.COMPLETED
                self.processes[command_id]["output"] = stdout
            else:
                self.processes[command_id]["status"] = CommandStatus.FAILED
                self.processes[command_id]["error"] = stderr
                
        except Exception as e:
            self.processes[command_id]["status"] = CommandStatus.FAILED
            self.processes[command_id]["error"] = str(e)
        
        self.processes[command_id]["completed_at"] = datetime.now().isoformat()
    
    def get_command_status(self, command_id: str) -> Optional[dict]:
        """Get the status of a command"""
        return self.processes.get(command_id)
    
    def get_all_commands(self) -> Dict[str, dict]:
        """Get all commands"""
        return self.processes
    
    def cancel_command(self, command_id: str) -> bool:
        """Cancel a running command"""
        if command_id in self.processes:
            if self.processes[command_id]["status"] == CommandStatus.RUNNING:
                self.processes[command_id]["status"] = CommandStatus.CANCELLED
                self.processes[command_id]["completed_at"] = datetime.now().isoformat()
            return True
        return False
    
    def clear_all_commands(self):
        """Clear all command history"""
        self.processes.clear()


# Singleton instance
command_service = CommandService()