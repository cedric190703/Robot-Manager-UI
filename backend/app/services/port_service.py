import uuid
import subprocess
from typing import Dict, List, Optional, Tuple

from app.db.database import database


class PortIdentificationService:
    """
    Service that replicates the lerobot-find-port logic as a guided multi-step flow.
    
    Original flow (interactive CLI):
        1. List all ports
        2. User unplugs one arm
        3. List ports again
        4. Diff = the port that disappeared = that arm's port
    
    Our flow (non-interactive API):
        Step 1: POST /identify-port/start   → snapshots current ports
        Step 2: User unplugs arm via UI prompt
        Step 3: POST /identify-port/detect   → snapshots again, diffs, identifies the port
        Repeat for each arm.
    
    Identified ports are persisted in the database so they survive restarts.
    """

    def __init__(self):
        # Active identification sessions: session_id -> ports snapshot
        self.sessions: Dict[str, List[str]] = {}
        # Identified ports: arm_name -> port path  (in-memory cache, backed by DB)
        self.identified_ports: Dict[str, str] = {}

    def load_from_db(self):
        """Load previously identified ports from the database."""
        self.identified_ports = database.get_all_ports()

    def _scan_ports(self) -> List[str]:
        """Scan for serial ports (same logic as lerobot's find_available_ports)"""
        try:
            result = subprocess.run(
                ["find", "/dev", "-maxdepth", "1", "-name", "ttyACM*", "-o", "-name", "ttyUSB*"],
                capture_output=True, text=True, timeout=5
            )
            ports = sorted([
                line.strip() for line in result.stdout.strip().split('\n')
                if line.strip().startswith('/dev/')
            ])
            return ports
        except Exception:
            return []

    def start_session(self) -> Tuple[str, List[str]]:
        """
        Step 1: Take a snapshot of currently connected ports.
        Returns (session_id, ports_before)
        """
        session_id = str(uuid.uuid4())
        ports = self._scan_ports()
        self.sessions[session_id] = ports
        return session_id, ports

    def detect_port(self, session_id: str, arm_name: str) -> Tuple[Optional[str], List[str], str]:
        """
        Step 2: Scan ports again and diff with the snapshot to find which port was removed.
        
        Returns (detected_port, ports_diff, message)
        """
        if session_id not in self.sessions:
            return None, [], "Invalid session ID. Please start a new identification."

        ports_before = self.sessions[session_id]
        ports_after = self._scan_ports()

        # Ports that disappeared = the unplugged arm's port
        ports_diff = sorted(set(ports_before) - set(ports_after))

        if len(ports_diff) == 1:
            port = ports_diff[0]
            self.identified_ports[arm_name] = port
            # Persist to DB
            database.save_port(arm_name, port)
            message = f"Identified! The {arm_name} arm is on port {port}. You can reconnect it now."
            return port, ports_diff, message
        elif len(ports_diff) == 0:
            message = "No port change detected. Make sure you disconnected the USB cable and try again."
            return None, ports_diff, message
        else:
            message = f"Multiple ports changed ({', '.join(ports_diff)}). Please disconnect only one arm at a time."
            return None, ports_diff, message

    def refresh_session(self, session_id: str) -> List[str]:
        """Re-scan and update the session snapshot (e.g. after reconnecting an arm)"""
        ports = self._scan_ports()
        if session_id in self.sessions:
            self.sessions[session_id] = ports
        return ports

    def get_identified_ports(self) -> Dict[str, str]:
        """Get all identified port-to-arm mappings (from memory cache, backed by DB)"""
        return self.identified_ports.copy()

    def set_port(self, arm_name: str, port_path: str):
        """Manually set a port mapping (e.g. from the frontend)"""
        self.identified_ports[arm_name] = port_path
        database.save_port(arm_name, port_path)

    def remove_port(self, arm_name: str) -> bool:
        """Remove a specific port mapping"""
        self.identified_ports.pop(arm_name, None)
        return database.delete_port(arm_name)

    def clear_session(self, session_id: str):
        """Clean up a session"""
        self.sessions.pop(session_id, None)

    def clear_all(self):
        """Clear all sessions and identified ports (in-memory and DB)"""
        self.sessions.clear()
        self.identified_ports.clear()
        database.delete_all_ports()


# Singleton instance
port_service = PortIdentificationService()