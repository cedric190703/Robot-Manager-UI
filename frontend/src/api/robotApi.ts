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

export const savePort = async (armName: string, portPath: string) => {
  const response = await api.post('/commands/identify-port/save', { arm_name: armName, port_path: portPath });
  return response.data;
};

export const deleteIdentifiedPort = async (armName: string) => {
  const response = await api.delete(`/commands/identify-port/${armName}`);
  return response.data;
};

export const clearAllPorts = async () => {
  const response = await api.delete('/commands/identify-port/all/clear');
  return response.data;
};

// ─── Calibration persistence ─────────────────────────────────────

export interface CalibrationRecord {
  id: string;
  arm_name: string;
  arm_role: string;  // 'teleop' | 'robot'
  robot_type: string;
  robot_id: string;
  port: string;
  cal_file?: string;
  status: string;
  calibrated_at: string;
  updated_at: string;
}

export interface CalibrationRecordCreate {
  arm_name: string;
  arm_role: string;
  robot_type: string;
  robot_id: string;
  port: string;
  cal_file?: string;
  status?: string;
}

export const listCalibrations = async (): Promise<CalibrationRecord[]> => {
  const response = await api.get('/commands/calibrations');
  return response.data;
};

export const saveCalibration = async (data: CalibrationRecordCreate): Promise<CalibrationRecord> => {
  const response = await api.post('/commands/calibrations', data);
  return response.data;
};

export const deleteCalibrationRecord = async (armRole: string, armName: string) => {
  const response = await api.delete(`/commands/calibrations/${armRole}/${armName}`);
  return response.data;
};

export const clearAllCalibrations = async () => {
  const response = await api.delete('/commands/calibrations/all/clear');
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

// ─── Recording types ─────────────────────────────────────────────

export interface CameraConfigData {
  name: string;
  type: string;
  index_or_path: string;
  width: number;
  height: number;
  fps: number;
}

export interface RecordingConfigCreate {
  name: string;
  description?: string;
  robot_type: string;
  robot_port: string;
  robot_id: string;
  cameras: CameraConfigData[];
  teleop_type?: string | null;
  teleop_port?: string | null;
  teleop_id?: string | null;
  policy_path?: string | null;
  policy_type?: string | null;
  policy_device?: string | null;
  repo_id: string;
  num_episodes: number;
  single_task: string;
  fps: number;
  episode_time_s: number;
  reset_time_s: number;
  display_data: boolean;
  play_sounds: boolean;
  push_to_hub: boolean;
}

export interface RecordingConfigResponse extends RecordingConfigCreate {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface DatasetResponse {
  id: string;
  config_id: string;
  repo_id: string;
  status: string;
  total_episodes: number;
  completed_episodes: number;
  single_task: string;
  created_at: string;
  updated_at: string;
}

export interface EpisodeResponse {
  id: number;
  dataset_id: string;
  episode_num: number;
  status: string;
  session_id?: string;
  started_at?: string;
  completed_at?: string;
  duration_s?: number;
  created_at: string;
}

export interface StartRecordingResponse {
  dataset_id: string;
  session_id: string;
  command: string;
  status: string;
  message: string;
}

// ─── Recording API ───────────────────────────────────────────────

export const createRecordingConfig = async (data: RecordingConfigCreate): Promise<RecordingConfigResponse> => {
  const response = await api.post('/recording/configs', data);
  return response.data;
};

export const listRecordingConfigs = async (): Promise<RecordingConfigResponse[]> => {
  const response = await api.get('/recording/configs');
  return response.data;
};

export const getRecordingConfig = async (configId: string): Promise<RecordingConfigResponse> => {
  const response = await api.get(`/recording/configs/${configId}`);
  return response.data;
};

export const updateRecordingConfig = async (configId: string, data: Partial<RecordingConfigCreate>): Promise<RecordingConfigResponse> => {
  const response = await api.put(`/recording/configs/${configId}`, data);
  return response.data;
};

export const deleteRecordingConfig = async (configId: string) => {
  const response = await api.delete(`/recording/configs/${configId}`);
  return response.data;
};

export const listDatasets = async (configId?: string): Promise<DatasetResponse[]> => {
  const params = configId ? { config_id: configId } : {};
  const response = await api.get('/recording/datasets', { params });
  return response.data;
};

export const getDataset = async (datasetId: string): Promise<DatasetResponse> => {
  const response = await api.get(`/recording/datasets/${datasetId}`);
  return response.data;
};

export const deleteDataset = async (datasetId: string) => {
  const response = await api.delete(`/recording/datasets/${datasetId}`);
  return response.data;
};

export const listEpisodes = async (datasetId: string): Promise<EpisodeResponse[]> => {
  const response = await api.get(`/recording/datasets/${datasetId}/episodes`);
  return response.data;
};

export const startRecording = async (configId: string): Promise<StartRecordingResponse> => {
  const response = await api.post('/recording/start', { config_id: configId });
  return response.data;
};

export const stopRecording = async (sessionId: string, datasetId?: string) => {
  const params = datasetId ? { dataset_id: datasetId } : {};
  const response = await api.post(`/recording/stop/${sessionId}`, null, { params });
  return response.data;
};

// ─── Replay / Train / Eval types ─────────────────────────────────

export interface ReplayRequest {
  robot_type: string;
  robot_port: string;
  robot_id: string;
  repo_id: string;
  episode: number;
}

export interface TrainRequest {
  policy_type: string;
  policy_device: string;
  policy_repo_id?: string;
  push_to_hub: boolean;
  dataset_repo_id: string;
  output_dir: string;
  steps: number;
}

export interface EvalRequest {
  policy_type: string;
  policy_device: string;
  policy_path: string;
  dataset_repo_id: string;
}

export interface GenericSessionResponse {
  session_id: string;
  command: string;
  status: string;
  message: string;
}

export interface HFSettings {
  hf_username: string;
  hf_token: string;
}

// ─── Replay / Train / Eval API ───────────────────────────────────

export const startReplay = async (data: ReplayRequest): Promise<GenericSessionResponse> => {
  const response = await api.post('/recording/replay/start', data);
  return response.data;
};

export const startTrain = async (data: TrainRequest): Promise<GenericSessionResponse> => {
  const response = await api.post('/recording/train/start', data);
  return response.data;
};

export const startEval = async (data: EvalRequest): Promise<GenericSessionResponse> => {
  const response = await api.post('/recording/eval/start', data);
  return response.data;
};

export const stopSession = async (sessionId: string) => {
  const response = await api.post(`/recording/session/stop/${sessionId}`);
  return response.data;
};

// ─── HuggingFace Settings ────────────────────────────────────────

export const getHFSettings = async (): Promise<HFSettings> => {
  const response = await api.get('/settings/hf');
  return response.data;
};

export const saveHFSettings = async (data: HFSettings): Promise<HFSettings> => {
  const response = await api.post('/settings/hf', data);
  return response.data;
};

export const clearHFSettings = async () => {
  const response = await api.delete('/settings/hf');
  return response.data;
};

export default api;