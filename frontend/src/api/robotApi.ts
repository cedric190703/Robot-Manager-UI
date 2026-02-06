import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000');

const api = axios.create({
  baseURL: API_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface CommandResponse {
  command_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  command: string;
  output?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface IdentifyPortStartResponse {
  session_id: string;
  ports_before: string[];
  message: string;
}

export interface IdentifyPortDetectRequest {
  session_id: string;
  arm_name: string;
}

export interface IdentifyPortDetectResponse {
  session_id: string;
  arm_name: string;
  detected_port: string | null;
  ports_diff: string[];
  message: string;
}

export interface IdentifiedPortsResponse {
  ports: Record<string, string>; // { "leader": "/dev/ttyACM0", ... }
}

export interface ChmodRequest {
  port: string;
  permissions?: string;
}

export interface CalibrateRequest {
  robot_type: 'so100_leader' | 'so100_follower' | 'so101_leader' | 'so101_follower';
  port: string;
  robot_id: string;
  is_teleop: boolean;
}

export interface TeleoperateRequest {
  robot_type: 'so100_leader' | 'so100_follower' | 'so101_leader' | 'so101_follower';
  robot_port: string;
  robot_id: string;
  teleop_type: 'so100_leader' | 'so100_follower' | 'so101_leader' | 'so101_follower';
  teleop_port: string;
  teleop_id: string;
  fps?: number;
  display_data?: boolean;
}

// Interactive session (for calibrate/teleoperate)
export interface InteractiveSessionResponse {
  session_id: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  output: string;
  started_at?: string;
  completed_at?: string;
}

// API Functions
export const healthCheck = async () => {
  const response = await api.get('/health');
  return response.data;
};

// ─── Port Identification (guided flow) ───────────────────────────
export const identifyPortStart = async (): Promise<IdentifyPortStartResponse> => {
  const response = await api.post('/commands/identify-port/start');
  return response.data;
};

export const identifyPortDetect = async (data: IdentifyPortDetectRequest): Promise<IdentifyPortDetectResponse> => {
  const response = await api.post('/commands/identify-port/detect', data);
  return response.data;
};

export const identifyPortRefresh = async (sessionId: string) => {
  const response = await api.post(`/commands/identify-port/refresh?session_id=${sessionId}`);
  return response.data;
};

export const getIdentifiedPorts = async (): Promise<IdentifiedPortsResponse> => {
  const response = await api.get('/commands/identify-port/results');
  return response.data;
};

// ─── Legacy find-port (simple list) ──────────────────────────────
export const findPort = async (): Promise<CommandResponse> => {
  const response = await api.post('/commands/find-port');
  return response.data;
};

export const chmodPort = async (data: ChmodRequest): Promise<CommandResponse> => {
  const response = await api.post('/commands/chmod', data);
  return response.data;
};

// ─── Camera discovery ────────────────────────────────────────────
export const findCameras = async (): Promise<InteractiveSessionResponse> => {
  const response = await api.post('/commands/find-cameras');
  return response.data;
};

export const listVideoDevices = async (): Promise<CommandResponse> => {
  const response = await api.post('/commands/list-video-devices');
  return response.data;
};

export interface CameraDevice {
  index: number;
  path: string;
}

export const getCameraDevices = async (): Promise<{ devices: CameraDevice[] }> => {
  const response = await api.get('/commands/camera/devices');
  return response.data;
};

/**
 * Returns the URL for a camera snapshot (single JPEG frame).
 * Use as <img src={getCameraSnapshotUrl(0)} />
 */
export const getCameraSnapshotUrl = (deviceIndex: number): string => {
  return `${API_URL}/commands/camera/${deviceIndex}/snapshot?t=${Date.now()}`;
};

/**
 * Returns the URL for a live MJPEG stream.
 * Use as <img src={getCameraStreamUrl(0)} />
 */
export const getCameraStreamUrl = (deviceIndex: number, fps = 10): string => {
  return `${API_URL}/commands/camera/${deviceIndex}/stream?fps=${fps}`;
};

// ─── Interactive sessions (calibrate/teleoperate) ────────────────
export const calibrateRobot = async (data: CalibrateRequest): Promise<InteractiveSessionResponse> => {
  const response = await api.post('/commands/calibrate', data);
  return response.data;
};

export const teleoperateRobot = async (data: TeleoperateRequest): Promise<InteractiveSessionResponse> => {
  const response = await api.post('/commands/teleoperate', data);
  return response.data;
};

export const getInteractiveSession = async (sessionId: string): Promise<InteractiveSessionResponse> => {
  const response = await api.get(`/commands/interactive/${sessionId}`);
  return response.data;
};

export const sendEnterToSession = async (sessionId: string) => {
  const response = await api.post(`/commands/interactive/${sessionId}/enter`);
  return response.data;
};

export const sendInputToSession = async (sessionId: string, text: string) => {
  const response = await api.post(`/commands/interactive/${sessionId}/input`, { session_id: sessionId, text });
  return response.data;
};

export const cancelInteractiveSession = async (sessionId: string) => {
  const response = await api.delete(`/commands/interactive/${sessionId}`);
  return response.data;
};

// ─── Calibration management ──────────────────────────────────────
export const resetCalibration = async (robotId: string, calType: string = 'all'): Promise<CommandResponse> => {
  const response = await api.post(`/commands/reset-calibration?robot_id=${robotId}&cal_type=${calType}`);
  return response.data;
};

export const getCommandStatus = async (commandId: string): Promise<CommandResponse> => {
  const response = await api.get(`/commands/${commandId}`);
  return response.data;
};

export const listCommands = async (): Promise<CommandResponse[]> => {
  const response = await api.get('/commands');
  return response.data;
};

export const cancelCommand = async (commandId: string) => {
  const response = await api.delete(`/commands/${commandId}`);
  return response.data;
};

export const clearAllCommands = async () => {
  const response = await api.delete('/commands');
  return response.data;
};

export default api;