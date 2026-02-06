import { useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, MonitorPlay, Eye, Video, ImageOff } from 'lucide-react';
import { findCameras, listVideoDevices, getCameraDevices, getCameraSnapshotUrl, getCameraStreamUrl } from '../api/robotApi';
import { getCommandStatus } from '../api/robotApi';
import type { CameraDevice } from '../api/robotApi';
import { InteractiveTerminal } from './InteractiveTerminal';
import { useInteractiveSession } from '../hooks/useInteractiveSession';

type PreviewMode = 'snapshot' | 'stream';

export const CameraPanel = () => {
  // Quick /dev/video* list
  const [videoDevices, setVideoDevices] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  // Camera devices (for preview)
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [camerasLoading, setCamerasLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('snapshot');
  const [snapshotTimestamps, setSnapshotTimestamps] = useState<Record<number, number>>({});
  const [failedDevices, setFailedDevices] = useState<Set<number>>(new Set());

  // lerobot-find-cameras session
  const [cameraSessionId, setCameraSessionId] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);

  const cameraSession = useInteractiveSession(cameraSessionId);

  // Load camera devices on mount
  const loadCameraDevices = useCallback(async () => {
    try {
      setCamerasLoading(true);
      setFailedDevices(new Set());
      const data = await getCameraDevices();
      setCameras(data.devices);
      // Initialize timestamps for snapshots
      const ts: Record<number, number> = {};
      data.devices.forEach((d) => { ts[d.index] = Date.now(); });
      setSnapshotTimestamps(ts);
    } catch (error) {
      console.error('Failed to load camera devices:', error);
    } finally {
      setCamerasLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCameraDevices();
  }, [loadCameraDevices]);

  const refreshSnapshot = (deviceIndex: number) => {
    setSnapshotTimestamps((prev) => ({ ...prev, [deviceIndex]: Date.now() }));
    setFailedDevices((prev) => {
      const next = new Set(prev);
      next.delete(deviceIndex);
      return next;
    });
  };

  const refreshAllSnapshots = () => {
    setFailedDevices(new Set());
    const ts: Record<number, number> = {};
    cameras.forEach((d) => { ts[d.index] = Date.now(); });
    setSnapshotTimestamps(ts);
  };

  const handleListVideoDevices = async () => {
    try {
      setVideoLoading(true);
      const response = await listVideoDevices();
      // Poll until done
      const pollResult = async (cmdId: string) => {
        const maxAttempts = 20;
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise((r) => setTimeout(r, 500));
          const status = await getCommandStatus(cmdId);
          if (status.status === 'completed' || status.status === 'failed') {
            setVideoDevices(status.output || status.error || 'No output');
            return;
          }
        }
        setVideoDevices('Timeout waiting for device list');
      };
      pollResult(response.command_id);
    } catch (error) {
      setVideoDevices('Error: ' + (error as Error).message);
    } finally {
      setVideoLoading(false);
    }
  };

  const handleFindCameras = async () => {
    try {
      setCameraLoading(true);
      const response = await findCameras();
      setCameraSessionId(response.session_id);
    } catch (error) {
      console.error('Failed to find cameras:', error);
      alert('Failed to start camera detection: ' + (error as Error).message);
    } finally {
      setCameraLoading(false);
    }
  };

  const handleResetCameraSearch = () => {
    setCameraSessionId(null);
  };

  return (
    <div className="card">
      <h2><Camera size={24} /> Camera Management</h2>

      {/* ─── Camera Preview ───────────────────────────────────── */}
      <div className="section">
        <h3><Eye size={18} /> Camera Preview</h3>
        <p className="section-desc">
          Live preview of each detected <code>/dev/video*</code> device.
          Not all video devices correspond to real cameras (some are metadata nodes).
        </p>

        <div className="camera-preview-controls">
          <button
            className="btn btn-primary"
            onClick={loadCameraDevices}
            disabled={camerasLoading}
          >
            <RefreshCw size={14} className={camerasLoading ? 'spin' : ''} />
            {camerasLoading ? 'Scanning...' : 'Detect Cameras'}
          </button>

          {cameras.length > 0 && (
            <>
              <div className="btn-group">
                <button
                  className={`btn btn-sm ${previewMode === 'snapshot' ? 'btn-active' : 'btn-secondary'}`}
                  onClick={() => setPreviewMode('snapshot')}
                  title="Single frame snapshots (click to refresh)"
                >
                  <Camera size={14} /> Snapshot
                </button>
                <button
                  className={`btn btn-sm ${previewMode === 'stream' ? 'btn-active' : 'btn-secondary'}`}
                  onClick={() => setPreviewMode('stream')}
                  title="Live MJPEG stream (higher bandwidth)"
                >
                  <Video size={14} /> Live Stream
                </button>
              </div>

              {previewMode === 'snapshot' && (
                <button className="btn btn-sm btn-secondary" onClick={refreshAllSnapshots}>
                  <RefreshCw size={14} /> Refresh All
                </button>
              )}
            </>
          )}
        </div>

        {cameras.length === 0 && !camerasLoading && (
          <div className="camera-no-devices">
            <ImageOff size={32} />
            <p>No video devices detected. Click <strong>Detect Cameras</strong> to scan.</p>
          </div>
        )}

        <div className="camera-grid">
          {cameras.map((cam) => (
            <div key={cam.index} className="camera-card">
              <div className="camera-card-header">
                <MonitorPlay size={16} />
                <span className="camera-card-title">{cam.path}</span>
                <span className="camera-card-badge">Index {cam.index}</span>
              </div>

              <div className="camera-card-preview">
                {failedDevices.has(cam.index) ? (
                  <div className="camera-preview-error">
                    <ImageOff size={24} />
                    <span>Cannot open this device</span>
                    <button className="btn btn-sm btn-secondary" onClick={() => refreshSnapshot(cam.index)}>
                      Retry
                    </button>
                  </div>
                ) : previewMode === 'snapshot' ? (
                  <img
                    src={getCameraSnapshotUrl(cam.index) + `&_t=${snapshotTimestamps[cam.index] || 0}`}
                    alt={`Preview ${cam.path}`}
                    className="camera-preview-img"
                    onClick={() => refreshSnapshot(cam.index)}
                    title="Click to refresh snapshot"
                    onError={() => setFailedDevices((prev) => new Set(prev).add(cam.index))}
                  />
                ) : (
                  <img
                    src={getCameraStreamUrl(cam.index, 10)}
                    alt={`Stream ${cam.path}`}
                    className="camera-preview-img"
                    onError={() => setFailedDevices((prev) => new Set(prev).add(cam.index))}
                  />
                )}
              </div>

              {previewMode === 'snapshot' && !failedDevices.has(cam.index) && (
                <button className="btn btn-sm btn-ghost" onClick={() => refreshSnapshot(cam.index)}>
                  <RefreshCw size={12} /> Refresh
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Quick video device list ──────────────────────────── */}
      <div className="section">
        <h3><MonitorPlay size={18} /> Video Devices (Raw)</h3>
        <p className="section-desc">Quick scan of <code>/dev/video*</code> devices connected to the system.</p>
        
        <button
          className="btn btn-primary"
          onClick={handleListVideoDevices}
          disabled={videoLoading}
        >
          <RefreshCw size={14} className={videoLoading ? 'spin' : ''} />
          {videoLoading ? 'Scanning...' : 'List Video Devices'}
        </button>

        {videoDevices && (
          <pre className="camera-output">{videoDevices}</pre>
        )}
      </div>

      {/* ─── lerobot-find-cameras ─────────────────────────────── */}
      <div className="section">
        <h3><Camera size={18} /> LeRobot Camera Detection</h3>
        <p className="section-desc">
          Uses <code>lerobot-find-cameras opencv</code> to detect cameras with OpenCV.
          This opens each camera to verify it works, so it may take several seconds.
        </p>

        {!cameraSession.session ? (
          <button
            className="btn btn-success"
            onClick={handleFindCameras}
            disabled={cameraLoading}
          >
            <Camera size={14} />
            {cameraLoading ? 'Starting...' : 'Find Cameras (OpenCV)'}
          </button>
        ) : cameraSession.isDone ? (
          <button className="btn btn-secondary" onClick={handleResetCameraSearch}>
            <RefreshCw size={14} /> Search Again
          </button>
        ) : null}

        <InteractiveTerminal
          session={cameraSession.session}
          isRunning={cameraSession.isRunning}
          isDone={cameraSession.isDone}
          onSendEnter={cameraSession.sendEnter}
          onCancel={cameraSession.cancel}
          title="Camera Detection"
        />
      </div>
    </div>
  );
};
