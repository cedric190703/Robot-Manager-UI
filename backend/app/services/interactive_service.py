import os
import pty
import select
import subprocess
import uuid
import threading
import signal
import time
from datetime import datetime
from typing import Dict, Optional


class InteractiveSession:
    """Manages an interactive PTY-based process session"""

    # Maximum output buffer size in characters (~50 KB).
    # record_ranges_of_motion prints a table every ~50ms – without a cap
    # the buffer grows unbounded and the JSON response becomes huge,
    # causing the frontend to lag.
    MAX_OUTPUT_CHARS = 50_000

    def __init__(self, session_id: str, command: str):
        self.session_id = session_id
        self.command = command
        self.output_buffer: str = ""
        self.status: str = "pending"  # pending, running, completed, failed, cancelled
        self.started_at: Optional[str] = None
        self.completed_at: Optional[str] = None
        self.master_fd: Optional[int] = None
        self.slave_fd: Optional[int] = None
        self.process: Optional[subprocess.Popen] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def start(self):
        """Start the interactive process with a PTY"""
        self.started_at = datetime.now().isoformat()
        self.status = "running"

        # Create a pseudo-terminal pair
        self.master_fd, self.slave_fd = pty.openpty()

        # Make the PTY behave like a real terminal for line-buffered input
        # This ensures Enter keypresses are delivered properly
        try:
            import termios
            attrs = termios.tcgetattr(self.slave_fd)
            # Enable canonical mode and echo so input() and readline work
            attrs[3] |= termios.ICANON | termios.ECHO
            # Set VEOF, VERASE, etc. for proper terminal behavior
            attrs[6][termios.VINTR] = b'\x03'    # Ctrl+C
            attrs[6][termios.VEOF] = b'\x04'     # Ctrl+D
            termios.tcsetattr(self.slave_fd, termios.TCSANOW, attrs)
        except Exception:
            pass  # Non-critical if this fails

        # Wrap with conda activation
        full_command = (
            f"source /opt/conda/etc/profile.d/conda.sh && "
            f"conda activate lerobot && "
            f"{self.command}"
        )

        # Use environment to ensure proper terminal behavior
        env = os.environ.copy()
        env["TERM"] = "xterm"
        env["COLUMNS"] = "120"
        env["LINES"] = "40"

        self.process = subprocess.Popen(
            ["bash", "-c", full_command],
            stdin=self.slave_fd,
            stdout=self.slave_fd,
            stderr=self.slave_fd,
            close_fds=True,
            preexec_fn=os.setsid,
            env=env,
        )

        # Close slave in parent process - the child owns it
        os.close(self.slave_fd)
        self.slave_fd = None

        # Start background reader thread
        self._reader_thread = threading.Thread(target=self._read_output, daemon=True)
        self._reader_thread.start()

    def _read_output(self):
        """Background thread that reads PTY output"""
        try:
            while True:
                if self.master_fd is None:
                    break
                ready, _, _ = select.select([self.master_fd], [], [], 0.5)
                if ready:
                    try:
                        data = os.read(self.master_fd, 4096)
                        if not data:
                            break
                        with self._lock:
                            self.output_buffer += data.decode("utf-8", errors="replace")
                            # Truncate to keep only the tail when buffer grows too large
                            if len(self.output_buffer) > self.MAX_OUTPUT_CHARS:
                                self.output_buffer = self.output_buffer[-self.MAX_OUTPUT_CHARS:]
                    except OSError:
                        break

                # Check if process has exited
                if self.process and self.process.poll() is not None:
                    # Read any remaining data with a small delay to ensure buffer is flushed
                    time.sleep(0.2)
                    try:
                        while True:
                            ready, _, _ = select.select([self.master_fd], [], [], 0.1)
                            if not ready:
                                break
                            data = os.read(self.master_fd, 4096)
                            if not data:
                                break
                            with self._lock:
                                self.output_buffer += data.decode("utf-8", errors="replace")
                                if len(self.output_buffer) > self.MAX_OUTPUT_CHARS:
                                    self.output_buffer = self.output_buffer[-self.MAX_OUTPUT_CHARS:]
                    except OSError:
                        pass
                    break
        finally:
            self._finish()

    def _finish(self):
        """Mark session as complete"""
        if self.process and self.process.poll() is not None:
            if self.status == "running":
                self.status = "completed" if self.process.returncode == 0 else "failed"
        elif self.status == "running":
            self.status = "completed"
        self.completed_at = datetime.now().isoformat()

    def send_input(self, text: str = "\n"):
        """Send input (e.g. Enter keypress) to the interactive process.
        
        For Enter key, we send \\r\\n to ensure the PTY processes it correctly
        across different terminal modes (canonical vs raw).
        """
        if self.master_fd is not None and self.status == "running":
            try:
                # For Enter, send \\n — the PTY translates as needed
                os.write(self.master_fd, text.encode())
                return True
            except OSError:
                return False
        return False

    def get_output(self) -> str:
        """Get the current output buffer"""
        with self._lock:
            return self.output_buffer

    def cancel(self):
        """Kill the interactive process"""
        self.status = "cancelled"
        if self.process and self.process.poll() is None:
            try:
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
            except (OSError, ProcessLookupError):
                pass
            # Give it a moment, then SIGKILL if still alive
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
                except (OSError, ProcessLookupError):
                    pass
        self._cleanup()

    def _cleanup(self):
        """Clean up file descriptors"""
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None
        self.completed_at = self.completed_at or datetime.now().isoformat()

    def to_dict(self) -> dict:
        """Serialize session state.
        
        Only returns the tail of the output to keep JSON responses snappy
        even when the underlying buffer is still large.
        """
        output = self.get_output()
        # Limit what we send to the frontend (30 KB)
        MAX_RESPONSE_CHARS = 30_000
        if len(output) > MAX_RESPONSE_CHARS:
            output = "… (output truncated) …\n" + output[-MAX_RESPONSE_CHARS:]
        return {
            "session_id": self.session_id,
            "command": self.command,
            "status": self.status,
            "output": output,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


class InteractiveService:
    """Service for managing interactive PTY-based command sessions"""

    def __init__(self):
        self.sessions: Dict[str, InteractiveSession] = {}

    def start_session(self, command: str) -> InteractiveSession:
        """Create and start a new interactive session"""
        session_id = str(uuid.uuid4())
        session = InteractiveSession(session_id, command)
        self.sessions[session_id] = session
        session.start()
        return session

    def get_session(self, session_id: str) -> Optional[InteractiveSession]:
        """Get a session by ID"""
        return self.sessions.get(session_id)

    def send_enter(self, session_id: str) -> bool:
        """Send Enter key to a session"""
        session = self.sessions.get(session_id)
        if session:
            return session.send_input("\n")
        return False

    def send_text(self, session_id: str, text: str) -> bool:
        """Send arbitrary text to a session"""
        session = self.sessions.get(session_id)
        if session:
            return session.send_input(text)
        return False

    def cancel_session(self, session_id: str) -> bool:
        """Cancel a running session"""
        session = self.sessions.get(session_id)
        if session:
            session.cancel()
            return True
        return False

    def clear_sessions(self):
        """Cancel and clear all sessions"""
        for session in self.sessions.values():
            if session.status == "running":
                session.cancel()
        self.sessions.clear()


# Singleton instance
interactive_service = InteractiveService()