import glob
import io
import logging
import threading
import time
from typing import Optional, List, Iterator

logger = logging.getLogger(__name__)


class CameraService:
    def __init__(self):
        # Cache open VideoCapture objects keyed by device index
        self._captures: dict = {}
        self._lock = threading.Lock()

    # ─── Device discovery ─────────────────────────────────────────

    @staticmethod
    def list_video_device_indices() -> List[int]:
        """Return sorted list of /dev/video* indices present on the system."""
        indices = []
        for path in glob.glob("/dev/video*"):
            try:
                idx = int(path.replace("/dev/video", ""))
                indices.append(idx)
            except ValueError:
                continue
        indices.sort()
        return indices

    # ─── Snapshot (single JPEG frame) ─────────────────────────────

    def capture_snapshot(self, device_index: int) -> Optional[bytes]:
        """
        Capture a single frame from /dev/video<device_index> and
        return it as JPEG-encoded bytes. Returns None on failure.
        """
        try:
            import cv2
        except ImportError:
            logger.error("opencv-python-headless is not installed")
            return None

        cap = None
        try:
            cap = cv2.VideoCapture(device_index)
            if not cap.isOpened():
                logger.warning(f"Cannot open /dev/video{device_index}")
                return None

            # Read a few frames to let auto-exposure settle
            for _ in range(3):
                cap.read()

            ret, frame = cap.read()
            if not ret or frame is None:
                logger.warning(f"Failed to read frame from /dev/video{device_index}")
                return None

            # Encode as JPEG
            success, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not success:
                return None

            return buf.tobytes()

        except Exception as e:
            logger.error(f"Error capturing from /dev/video{device_index}: {e}")
            return None
        finally:
            if cap is not None:
                cap.release()

    # ─── MJPEG stream generator ───────────────────────────────────

    def mjpeg_stream(self, device_index: int, fps: int = 10) -> Iterator[bytes]:
        """
        Generator that yields multipart MJPEG frames for a
        StreamingResponse. Releases the camera when the client
        disconnects (generator is closed).
        """
        try:
            import cv2
        except ImportError:
            return

        cap = cv2.VideoCapture(device_index)
        if not cap.isOpened():
            return

        interval = 1.0 / fps
        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                success, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                if not success:
                    continue

                jpeg_bytes = buf.tobytes()
                # Multipart MJPEG boundary format
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(jpeg_bytes)).encode() + b"\r\n"
                    b"\r\n" + jpeg_bytes + b"\r\n"
                )

                time.sleep(interval)
        finally:
            cap.release()


# Singleton
camera_service = CameraService()