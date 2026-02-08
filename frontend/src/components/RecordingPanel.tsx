import { useState, useEffect, useCallback } from 'react';
import {
  Circle, Play, Square, Trash2, Plus, Save, Film, Brain, Repeat,
  ChevronDown, ChevronRight, Camera,
  GraduationCap, FlaskConical, Gamepad2, Key, Workflow, Database,
} from 'lucide-react';
import type {
  RecordingConfigCreate,
  RecordingConfigResponse,
  DatasetResponse,
  CameraConfigData,
  CameraDevice,
  ReplayRequest,
  TrainRequest,
  EvalRequest,
  HFSettings,
} from '../api/robotApi';
import {
  listRecordingConfigs,
  createRecordingConfig,
  deleteRecordingConfig,
  listDatasets,
  startRecording,
  startRecordingDirect,
  stopRecording,
  getCameraDevices,
  startReplay,
  startTrain,
  startEval,
  stopSession,
  getHFSettings,
  saveHFSettings,
} from '../api/robotApi';
import { InteractiveTerminal } from './InteractiveTerminal';
import { useInteractiveSession } from '../hooks/useInteractiveSession';

type SubTab = 'record' | 'replay' | 'train' | 'eval' | 'play_record' | 'settings';
type RecordingMode = 'teleop' | 'policy';

interface RecordingPanelProps {
  identifiedPorts: Record<string, string>;
}

const DEFAULT_CAMERA: CameraConfigData = {
  name: 'front', type: 'opencv', index_or_path: '0', width: 640, height: 480, fps: 30,
};

const emptyConfig = (mode: RecordingMode): RecordingConfigCreate => ({
  name: '', description: '',
  robot_type: 'so101_follower', robot_port: '/dev/ttyACM0', robot_id: 'follower',
  cameras: [],
  teleop_type: mode === 'teleop' ? 'so101_leader' : null,
  teleop_port: mode === 'teleop' ? '/dev/ttyACM1' : null,
  teleop_id: mode === 'teleop' ? 'leader' : null,
  policy_path: mode === 'policy' ? '' : null,
  policy_type: mode === 'policy' ? 'act' : null,
  policy_device: mode === 'policy' ? 'cuda' : null,
  repo_id: '', num_episodes: 10, single_task: '', fps: 30,
  episode_time_s: 30, reset_time_s: 10,
  display_data: false, play_sounds: false, push_to_hub: true,
});

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'record', label: 'Record', icon: <Circle size={14} /> },
  { id: 'replay', label: 'Replay', icon: <Repeat size={14} /> },
  { id: 'train', label: 'Train', icon: <GraduationCap size={14} /> },
  { id: 'eval', label: 'Evaluate', icon: <FlaskConical size={14} /> },
  { id: 'play_record', label: 'Play + Record', icon: <Gamepad2 size={14} /> },
  { id: 'settings', label: 'Settings', icon: <Key size={14} /> },
];

export const RecordingPanel = ({ identifiedPorts }: RecordingPanelProps) => {
  const [subTab, setSubTab] = useState<SubTab>('record');

  // Shared state
  const [configs, setConfigs] = useState<RecordingConfigResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [availableDevices, setAvailableDevices] = useState<CameraDevice[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  // HF settings
  const [hf, setHf] = useState<HFSettings>({ hf_username: '', hf_token: '' });
  const [hfSaving, setHfSaving] = useState(false);

  // Active session (shared across all tabs)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState('');
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const { session, isRunning, isDone, sendEnter, cancel } = useInteractiveSession(activeSessionId);

  const allPorts = Object.values(identifiedPorts);

  const refresh = useCallback(async () => {
    setLoadingConfigs(true);
    try {
      const [cfgs, ds, devs, hfData] = await Promise.all([
        listRecordingConfigs(),
        listDatasets(),
        getCameraDevices().catch(() => ({ devices: [] })),
        getHFSettings().catch(() => ({ hf_username: '', hf_token: '' })),
      ]);
      setConfigs(cfgs);
      setDatasets(ds);
      setAvailableDevices(devs.devices);
      setHf(hfData);
    } catch (e) {
      console.error('Failed to load recording data', e);
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleStopSession = async () => {
    if (!activeSessionId) return;
    try {
      if (activeDatasetId) {
        await stopRecording(activeSessionId, activeDatasetId);
      } else {
        await stopSession(activeSessionId);
      }
    } catch (e) { console.error(e); }
    setActiveSessionId(null);
    setActiveDatasetId(null);
    setActiveLabel('');
    refresh();
  };

  const handleReset = () => {
    setActiveSessionId(null);
    setActiveDatasetId(null);
    setActiveLabel('');
    refresh();
  };

  return (
    <div className="card">
      <h2><Workflow size={20} /> LeRobot Pipeline</h2>

      {/* Sub-tab bar */}
      <div className="recording-subtabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            className={`recording-subtab ${subTab === t.id ? 'active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {subTab === 'record' && (
        <RecordTab
          identifiedPorts={identifiedPorts} allPorts={allPorts}
          availableDevices={availableDevices} isRunning={isRunning}
          hfUsername={hf.hf_username}
          onStart={(sid, did) => { setActiveSessionId(sid); setActiveDatasetId(did); setActiveLabel('Recording Session'); }}
        />
      )}
      {subTab === 'replay' && (
        <ReplayTab identifiedPorts={identifiedPorts} allPorts={allPorts} isRunning={isRunning} hfUsername={hf.hf_username}
          onStart={(sid) => { setActiveSessionId(sid); setActiveDatasetId(null); setActiveLabel('Replay Session'); }}
        />
      )}
      {subTab === 'train' && (
        <TrainTab isRunning={isRunning} hfUsername={hf.hf_username}
          onStart={(sid) => { setActiveSessionId(sid); setActiveDatasetId(null); setActiveLabel('Training Session'); }}
        />
      )}
      {subTab === 'eval' && (
        <EvalTab isRunning={isRunning} hfUsername={hf.hf_username}
          onStart={(sid) => { setActiveSessionId(sid); setActiveDatasetId(null); setActiveLabel('Eval Session'); }}
        />
      )}
      {subTab === 'play_record' && (
        <PlayRecordTab identifiedPorts={identifiedPorts} allPorts={allPorts} availableDevices={availableDevices}
          isRunning={isRunning} hfUsername={hf.hf_username} configs={configs} refresh={refresh}
          onStart={(sid, did) => { setActiveSessionId(sid); setActiveDatasetId(did); setActiveLabel('Play + Record Session'); }}
        />
      )}
      {subTab === 'settings' && (
        <HFSettingsTab hf={hf} setHf={setHf} saving={hfSaving} setSaving={setHfSaving} />
      )}

      {/* Active session terminal (shared) */}
      {activeSessionId && (
        <div className="section" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <strong>{activeLabel}</strong>
            {isRunning && (
              <button className="btn btn-danger btn-sm" onClick={handleStopSession}><Square size={14} /> Stop</button>
            )}
            {isDone && (
              <button className="btn btn-secondary btn-sm" onClick={handleReset}>New Session</button>
            )}
          </div>
          <InteractiveTerminal session={session} isRunning={isRunning} isDone={isDone} onSendEnter={sendEnter} onCancel={cancel} title={activeLabel} />
        </div>
      )}
    </div>
  );
};

/* ================================================================
   RECORD TAB — Direct command runner (no configs)
   ================================================================ */
interface RecordTabProps {
  identifiedPorts: Record<string, string>; allPorts: string[];
  availableDevices: CameraDevice[]; isRunning: boolean; hfUsername: string;
  onStart: (sessionId: string, datasetId: string) => void;
}

const RecordTab = ({ identifiedPorts, allPorts, availableDevices, isRunning, hfUsername, onStart }: RecordTabProps) => {
  const [form, setForm] = useState<RecordingConfigCreate>(emptyConfig('teleop'));
  const [cameras, setCameras] = useState<CameraConfigData[]>([]);
  const [starting, setStarting] = useState(false);
  const [forceOverride, setForceOverride] = useState(false);

  useEffect(() => {
    const updates: Partial<RecordingConfigCreate> = {};
    if (identifiedPorts.follower) updates.robot_port = identifiedPorts.follower;
    if (identifiedPorts.leader) updates.teleop_port = identifiedPorts.leader;
    if (hfUsername && !form.repo_id) updates.repo_id = `${hfUsername}/`;
    if (Object.keys(updates).length) setForm(prev => ({ ...prev, ...updates }));
  }, [identifiedPorts, hfUsername]);

  const addCamera = () => setCameras(prev => [...prev, { ...DEFAULT_CAMERA, name: `cam${prev.length}` }]);
  const removeCamera = (idx: number) => setCameras(prev => prev.filter((_, i) => i !== idx));
  const updateCamera = (idx: number, field: keyof CameraConfigData, value: string | number) => {
    setCameras(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const handleStart = async () => {
    if (!form.repo_id) { alert('Please provide a Dataset Repo ID'); return; }
    setStarting(true);
    try {
      // Use the direct run endpoint (no config save needed)
      const payload = { ...form, cameras, force_override: forceOverride };
      const res = await startRecordingDirect(payload);
      onStart(res.session_id, res.dataset_id);
    } catch (e) { alert('Failed to start recording: ' + (e as Error).message); }
    finally { setStarting(false); }
  };

  return (
    <>
      <div className="section">
        <h3><Circle size={16} /> Record Episodes</h3>
        <p className="section-desc">Configure and run <code>lerobot-record</code> directly. No need to save a config first.</p>
        <div className="recording-form-grid">
          <div>
            <div className="form-group"><label>Robot Type</label>
              <select value={form.robot_type} onChange={e => setForm({ ...form, robot_type: e.target.value })} disabled={isRunning}>
                <option value="so100_follower">SO-100 Follower</option><option value="so101_follower">SO-101 Follower</option>
              </select>
            </div>
            <div className="form-group"><label>Robot Port</label>
              {allPorts.length > 0 ? (
                <select value={form.robot_port} onChange={e => setForm({ ...form, robot_port: e.target.value })} disabled={isRunning}>
                  {allPorts.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input value={form.robot_port} onChange={e => setForm({ ...form, robot_port: e.target.value })} placeholder="/dev/ttyACM0" disabled={isRunning} />
              )}
            </div>
            <div className="form-group"><label>Robot ID</label><input value={form.robot_id} onChange={e => setForm({ ...form, robot_id: e.target.value })} placeholder="follower" disabled={isRunning} /></div>
            <div className="form-group"><label>Teleop Type</label>
              <select value={form.teleop_type || ''} onChange={e => setForm({ ...form, teleop_type: e.target.value })} disabled={isRunning}>
                <option value="so100_leader">SO-100 Leader</option><option value="so101_leader">SO-101 Leader</option>
              </select>
            </div>
            <div className="form-group"><label>Teleop Port</label>
              {allPorts.length > 0 ? (
                <select value={form.teleop_port || ''} onChange={e => setForm({ ...form, teleop_port: e.target.value })} disabled={isRunning}>
                  {allPorts.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input value={form.teleop_port || ''} onChange={e => setForm({ ...form, teleop_port: e.target.value })} placeholder="/dev/ttyACM1" disabled={isRunning} />
              )}
            </div>
            <div className="form-group"><label>Teleop ID</label><input value={form.teleop_id || ''} onChange={e => setForm({ ...form, teleop_id: e.target.value })} placeholder="leader" disabled={isRunning} /></div>
          </div>
          <div>
            <div className="form-group"><label>Dataset Repo ID *</label><input value={form.repo_id} onChange={e => setForm({ ...form, repo_id: e.target.value })} placeholder={`${hfUsername || 'my_user'}/my_dataset`} disabled={isRunning} /></div>
            <div className="form-group"><label>Task Description</label><input value={form.single_task} onChange={e => setForm({ ...form, single_task: e.target.value })} placeholder="Pick the red cube" disabled={isRunning} /></div>
            <div className="settings-grid">
              <div className="form-group"><label>Episodes</label><input type="number" min={1} value={form.num_episodes} onChange={e => setForm({ ...form, num_episodes: parseInt(e.target.value) || 1 })} disabled={isRunning} /></div>
              <div className="form-group"><label>FPS</label><input type="number" min={1} max={60} value={form.fps} onChange={e => setForm({ ...form, fps: parseInt(e.target.value) || 30 })} disabled={isRunning} /></div>
              <div className="form-group"><label>Episode Time (s)</label><input type="number" min={1} value={form.episode_time_s} onChange={e => setForm({ ...form, episode_time_s: parseInt(e.target.value) || 30 })} disabled={isRunning} /></div>
              <div className="form-group"><label>Reset Time (s)</label><input type="number" min={0} value={form.reset_time_s} onChange={e => setForm({ ...form, reset_time_s: parseInt(e.target.value) || 0 })} disabled={isRunning} /></div>
            </div>
            <div className="settings-grid">
              <div className="form-group checkbox-group"><label><input type="checkbox" checked={forceOverride} onChange={e => setForceOverride(e.target.checked)} disabled={isRunning} /> Overwrite existing dataset</label></div>
              <div className="form-group checkbox-group"><label><input type="checkbox" checked={form.push_to_hub} onChange={e => setForm({ ...form, push_to_hub: e.target.checked })} disabled={isRunning} /> Push to Hub</label></div>
            </div>
          </div>
        </div>
      </div>
      <CameraSection cameras={cameras} availableDevices={availableDevices} isRunning={isRunning} addCamera={addCamera} removeCamera={removeCamera} updateCamera={updateCamera} />
      <button className="btn btn-success btn-large" onClick={handleStart} disabled={starting || isRunning}>
        <Circle size={16} /> {starting ? 'Starting...' : 'Start Recording'}
      </button>
    </>
  );
};

/* ================================================================
   REPLAY TAB
   ================================================================ */
const ReplayTab = ({ identifiedPorts, allPorts, isRunning, hfUsername, onStart }: {
  identifiedPorts: Record<string, string>; allPorts: string[]; isRunning: boolean; hfUsername: string;
  onStart: (sessionId: string) => void;
}) => {
  const [form, setForm] = useState<ReplayRequest>({
    robot_type: 'so101_follower', robot_port: '/dev/ttyACM0', robot_id: 'follower', repo_id: '', episode: 0,
  });
  useEffect(() => {
    if (identifiedPorts.follower) setForm(prev => ({ ...prev, robot_port: identifiedPorts.follower }));
  }, [identifiedPorts]);

  const handleStart = async () => {
    if (!form.repo_id) { alert('Please provide a dataset repo ID'); return; }
    try { const res = await startReplay(form); onStart(res.session_id); }
    catch (e) { alert('Failed to start replay: ' + (e as Error).message); }
  };

  return (
    <div className="section">
      <h3><Repeat size={16} /> Replay a Dataset Episode</h3>
      <p className="section-desc">Replay a recorded episode on the robot using <code>lerobot-replay</code>.</p>
      <div className="recording-form-grid">
        <div>
          <div className="form-group"><label>Robot Type</label>
            <select value={form.robot_type} onChange={e => setForm({ ...form, robot_type: e.target.value })} disabled={isRunning}>
              <option value="so100_follower">SO-100 Follower</option><option value="so101_follower">SO-101 Follower</option>
            </select>
          </div>
          <div className="form-group"><label>Robot Port</label>
            {allPorts.length > 0 ? (
              <select value={form.robot_port} onChange={e => setForm({ ...form, robot_port: e.target.value })} disabled={isRunning}>
                {allPorts.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (<input value={form.robot_port} onChange={e => setForm({ ...form, robot_port: e.target.value })} disabled={isRunning} />)}
          </div>
          <div className="form-group"><label>Robot ID</label><input value={form.robot_id} onChange={e => setForm({ ...form, robot_id: e.target.value })} disabled={isRunning} /></div>
        </div>
        <div>
          <div className="form-group"><label>Dataset Repo ID *</label><input value={form.repo_id} onChange={e => setForm({ ...form, repo_id: e.target.value })} placeholder={`${hfUsername || 'my_user'}/my_dataset`} disabled={isRunning} /></div>
          <div className="form-group"><label>Episode Index</label><input type="number" min={0} value={form.episode} onChange={e => setForm({ ...form, episode: parseInt(e.target.value) || 0 })} disabled={isRunning} /></div>
        </div>
      </div>
      <button className="btn btn-primary btn-large" onClick={handleStart} disabled={isRunning}><Play size={16} /> Start Replay</button>
    </div>
  );
};

/* ================================================================
   TRAIN TAB
   ================================================================ */
const TrainTab = ({ isRunning, hfUsername, onStart }: {
  isRunning: boolean; hfUsername: string; onStart: (sessionId: string) => void;
}) => {
  const [form, setForm] = useState<TrainRequest>({
    policy_type: 'act', policy_device: 'cuda', policy_repo_id: '',
    push_to_hub: false, dataset_repo_id: '', output_dir: 'outputs/bc', steps: 1000,
  });

  const handleStart = async () => {
    if (!form.dataset_repo_id) { alert('Please provide a dataset repo ID'); return; }
    try { const res = await startTrain(form); onStart(res.session_id); }
    catch (e) { alert('Failed to start training: ' + (e as Error).message); }
  };

  return (
    <div className="section">
      <h3><GraduationCap size={16} /> Train a Policy</h3>
      <p className="section-desc">Train a neural network policy on a recorded dataset using <code>lerobot-train</code>.</p>
      <div className="recording-form-grid">
        <div>
          <div className="form-group"><label>Policy Type</label>
            <select value={form.policy_type} onChange={e => setForm({ ...form, policy_type: e.target.value })} disabled={isRunning}>
              <option value="act">ACT</option><option value="diffusion">Diffusion</option><option value="pi0">Pi0</option><option value="pi0fast">Pi0 Fast</option><option value="smolvla">SmolVLA</option>
            </select>
          </div>
          <div className="form-group"><label>Device</label>
            <select value={form.policy_device} onChange={e => setForm({ ...form, policy_device: e.target.value })} disabled={isRunning}>
              <option value="cuda">CUDA (GPU)</option><option value="cpu">CPU</option><option value="mps">MPS (Apple)</option>
            </select>
          </div>
          <div className="form-group"><label>Checkpoint Repo ID</label><input value={form.policy_repo_id} onChange={e => setForm({ ...form, policy_repo_id: e.target.value })} placeholder={`${hfUsername || 'my_user'}/act_policy`} disabled={isRunning} /></div>
          <div className="form-group checkbox-group"><label><input type="checkbox" checked={form.push_to_hub} onChange={e => setForm({ ...form, push_to_hub: e.target.checked })} disabled={isRunning} /> Push to Hub</label></div>
        </div>
        <div>
          <div className="form-group"><label>Dataset Repo ID *</label><input value={form.dataset_repo_id} onChange={e => setForm({ ...form, dataset_repo_id: e.target.value })} placeholder={`${hfUsername || 'my_user'}/my_dataset`} disabled={isRunning} /></div>
          <div className="form-group"><label>Output Directory</label><input value={form.output_dir} onChange={e => setForm({ ...form, output_dir: e.target.value })} placeholder="outputs/bc" disabled={isRunning} /></div>
          <div className="form-group"><label>Training Steps</label><input type="number" min={1} value={form.steps} onChange={e => setForm({ ...form, steps: parseInt(e.target.value) || 1000 })} disabled={isRunning} /></div>
        </div>
      </div>
      <button className="btn btn-primary btn-large" onClick={handleStart} disabled={isRunning}><GraduationCap size={16} /> Start Training</button>
    </div>
  );
};

/* ================================================================
   EVAL TAB
   ================================================================ */
const EvalTab = ({ isRunning, hfUsername, onStart }: {
  isRunning: boolean; hfUsername: string; onStart: (sessionId: string) => void;
}) => {
  const [form, setForm] = useState<EvalRequest>({
    policy_type: 'act', policy_device: 'cuda', policy_path: 'outputs/bc', dataset_repo_id: '',
  });

  const handleStart = async () => {
    if (!form.policy_path || !form.dataset_repo_id) { alert('Please provide policy path and dataset repo ID'); return; }
    try { const res = await startEval(form); onStart(res.session_id); }
    catch (e) { alert('Failed to start eval: ' + (e as Error).message); }
  };

  return (
    <div className="section">
      <h3><FlaskConical size={16} /> Evaluate a Trained Policy</h3>
      <p className="section-desc">Evaluate a trained policy against a dataset using <code>lerobot-eval</code>.</p>
      <div className="recording-form-grid">
        <div>
          <div className="form-group"><label>Policy Type</label>
            <select value={form.policy_type} onChange={e => setForm({ ...form, policy_type: e.target.value })} disabled={isRunning}>
              <option value="act">ACT</option><option value="diffusion">Diffusion</option><option value="pi0">Pi0</option><option value="pi0fast">Pi0 Fast</option><option value="smolvla">SmolVLA</option>
            </select>
          </div>
          <div className="form-group"><label>Device</label>
            <select value={form.policy_device} onChange={e => setForm({ ...form, policy_device: e.target.value })} disabled={isRunning}>
              <option value="cuda">CUDA (GPU)</option><option value="cpu">CPU</option><option value="mps">MPS (Apple)</option>
            </select>
          </div>
        </div>
        <div>
          <div className="form-group"><label>Policy Path *</label><input value={form.policy_path} onChange={e => setForm({ ...form, policy_path: e.target.value })} placeholder="outputs/bc" disabled={isRunning} /><small className="form-hint">Local path or HF repo ID</small></div>
          <div className="form-group"><label>Dataset Repo ID *</label><input value={form.dataset_repo_id} onChange={e => setForm({ ...form, dataset_repo_id: e.target.value })} placeholder={`${hfUsername || 'my_user'}/my_dataset`} disabled={isRunning} /></div>
        </div>
      </div>
      <button className="btn btn-primary btn-large" onClick={handleStart} disabled={isRunning}><FlaskConical size={16} /> Start Evaluation</button>
    </div>
  );
};

/* ================================================================
   PLAY + RECORD TAB
   ================================================================ */
const PlayRecordTab = ({ identifiedPorts, allPorts, availableDevices, isRunning, hfUsername, configs, refresh, onStart }: {
  identifiedPorts: Record<string, string>; allPorts: string[]; availableDevices: CameraDevice[];
  isRunning: boolean; hfUsername: string; configs: RecordingConfigResponse[]; refresh: () => void;
  onStart: (sessionId: string, datasetId: string) => void;
}) => {
  const [form, setForm] = useState<RecordingConfigCreate>(emptyConfig('policy'));
  const [cameras, setCameras] = useState<CameraConfigData[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null);

  useEffect(() => {
    if (identifiedPorts.follower) setForm(prev => ({ ...prev, robot_port: identifiedPorts.follower }));
  }, [identifiedPorts]);

  const addCamera = () => setCameras(prev => [...prev, { ...DEFAULT_CAMERA, name: `cam${prev.length}` }]);
  const removeCamera = (idx: number) => setCameras(prev => prev.filter((_, i) => i !== idx));
  const updateCamera = (idx: number, field: keyof CameraConfigData, value: string | number) => {
    setCameras(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const handleSave = async () => {
    if (!form.name || !form.repo_id || !form.policy_path) { alert('Please provide config name, repo ID, and policy path'); return; }
    setSaving(true);
    try {
      await createRecordingConfig({ ...form, cameras });
      await refresh();
      setForm(emptyConfig('policy'));
      setCameras([]);
    } catch (e) { alert('Failed to save: ' + (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleStart = async (configId: string) => {
    try { const res = await startRecording(configId); onStart(res.session_id, res.dataset_id); }
    catch (e) { alert('Failed to start: ' + (e as Error).message); }
  };

  const handleDeleteConfig = async (id: string) => {
    if (!window.confirm('Delete this config?')) return;
    await deleteRecordingConfig(id);
    refresh();
  };

  const policyConfigs = configs.filter(c => !!c.policy_path);

  return (
    <>
      <div className="section">
        <h3><Gamepad2 size={16} /> Play Trained Policy + Record</h3>
        <p className="section-desc">Run a trained policy on the robot and record using <code>lerobot-record --policy.*</code>.</p>
        <div className="recording-form-grid">
          <div>
            <div className="form-group"><label>Config Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Eval recording config" disabled={isRunning} /></div>
            <div className="form-group"><label>Robot Type</label>
              <select value={form.robot_type} onChange={e => setForm({ ...form, robot_type: e.target.value })} disabled={isRunning}>
                <option value="so100_follower">SO-100 Follower</option><option value="so101_follower">SO-101 Follower</option>
              </select>
            </div>
            <div className="form-group"><label>Robot Port</label>
              {allPorts.length > 0 ? (
                <select value={form.robot_port} onChange={e => setForm({ ...form, robot_port: e.target.value })} disabled={isRunning}>
                  {allPorts.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (<input value={form.robot_port} onChange={e => setForm({ ...form, robot_port: e.target.value })} disabled={isRunning} />)}
            </div>
            <div className="form-group"><label>Robot ID</label><input value={form.robot_id} onChange={e => setForm({ ...form, robot_id: e.target.value })} disabled={isRunning} /></div>
          </div>
          <div>
            <div className="form-group"><label>Policy Path *</label><input value={form.policy_path || ''} onChange={e => setForm({ ...form, policy_path: e.target.value })} placeholder="outputs/bc" disabled={isRunning} /></div>
            <div className="form-group"><label>Policy Type</label>
              <select value={form.policy_type || 'act'} onChange={e => setForm({ ...form, policy_type: e.target.value })} disabled={isRunning}>
                <option value="act">ACT</option><option value="diffusion">Diffusion</option><option value="pi0">Pi0</option><option value="pi0fast">Pi0 Fast</option><option value="smolvla">SmolVLA</option>
              </select>
            </div>
            <div className="form-group"><label>Policy Device</label>
              <select value={form.policy_device || 'cuda'} onChange={e => setForm({ ...form, policy_device: e.target.value })} disabled={isRunning}>
                <option value="cuda">CUDA (GPU)</option><option value="cpu">CPU</option><option value="mps">MPS (Apple)</option>
              </select>
            </div>
            <div className="form-group"><label>Dataset Repo ID *</label><input value={form.repo_id} onChange={e => setForm({ ...form, repo_id: e.target.value })} placeholder={`${hfUsername || 'my_user'}/eval_dataset`} disabled={isRunning} /></div>
            <div className="form-group"><label>Task Description</label><input value={form.single_task} onChange={e => setForm({ ...form, single_task: e.target.value })} placeholder="Reach a target" disabled={isRunning} /></div>
            <div className="settings-grid">
              <div className="form-group"><label>Episodes</label><input type="number" min={1} value={form.num_episodes} onChange={e => setForm({ ...form, num_episodes: parseInt(e.target.value) || 1 })} disabled={isRunning} /></div>
              <div className="form-group"><label>Episode Time (s)</label><input type="number" min={1} value={form.episode_time_s} onChange={e => setForm({ ...form, episode_time_s: parseInt(e.target.value) || 30 })} disabled={isRunning} /></div>
            </div>
            <div className="settings-grid">
              <div className="form-group checkbox-group"><label><input type="checkbox" checked={form.display_data} onChange={e => setForm({ ...form, display_data: e.target.checked })} disabled={isRunning} /> Display Data</label></div>
              <div className="form-group checkbox-group"><label><input type="checkbox" checked={form.play_sounds} onChange={e => setForm({ ...form, play_sounds: e.target.checked })} disabled={isRunning} /> Play Sounds</label></div>
              <div className="form-group checkbox-group"><label><input type="checkbox" checked={form.push_to_hub} onChange={e => setForm({ ...form, push_to_hub: e.target.checked })} disabled={isRunning} /> Push to Hub</label></div>
            </div>
          </div>
        </div>
      </div>
      <CameraSection cameras={cameras} availableDevices={availableDevices} isRunning={isRunning} addCamera={addCamera} removeCamera={removeCamera} updateCamera={updateCamera} />
      <button className="btn btn-primary btn-large" onClick={handleSave} disabled={saving || isRunning}>
        <Save size={16} /> {saving ? 'Saving...' : 'Save Configuration'}
      </button>
      <div className="section" style={{ marginTop: 24 }}>
        <h3><Database size={16} /> Saved Policy Configs</h3>
        {policyConfigs.length === 0 && <p className="section-desc">No saved policy configurations yet.</p>}
        {policyConfigs.map(cfg => (
          <ConfigCard key={cfg.id} cfg={cfg} datasets={[]} isRunning={isRunning} expanded={expandedConfig === cfg.id}
            onToggle={() => setExpandedConfig(expandedConfig === cfg.id ? null : cfg.id)}
            onStart={() => handleStart(cfg.id)} onDelete={() => handleDeleteConfig(cfg.id)} onDeleteDataset={() => {}}
          />
        ))}
      </div>
    </>
  );
};

/* ================================================================
   HF SETTINGS TAB
   ================================================================ */
const HFSettingsTab = ({ hf, setHf, saving, setSaving }: {
  hf: HFSettings; setHf: (hf: HFSettings) => void; saving: boolean; setSaving: (v: boolean) => void;
}) => {
  const handleSave = async () => {
    setSaving(true);
    try { const saved = await saveHFSettings(hf); setHf(saved); }
    catch (e) { alert('Failed to save: ' + (e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <div className="section">
      <h3><Key size={16} /> HuggingFace Credentials</h3>
      <p className="section-desc">Store your HuggingFace username and access token. Used to auto-fill repo IDs and authenticate pushes.</p>
      <div className="recording-form-grid">
        <div>
          <div className="form-group"><label>HF Username</label><input value={hf.hf_username} onChange={e => setHf({ ...hf, hf_username: e.target.value })} placeholder="my_username" /></div>
          <div className="form-group"><label>HF Access Token</label><input type="password" value={hf.hf_token} onChange={e => setHf({ ...hf, hf_token: e.target.value })} placeholder="hf_xxxxxxxxxxxx" /></div>
        </div>
        <div>
          <p className="section-desc" style={{ marginTop: 8 }}>
            Get a token at <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">huggingface.co/settings/tokens</a>.
            Stored locally — never sent to third parties.
          </p>
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}</button>
    </div>
  );
};

/* ================================================================
   SHARED COMPONENTS
   ================================================================ */
const CameraSection = ({ cameras, availableDevices, isRunning, addCamera, removeCamera, updateCamera }: {
  cameras: CameraConfigData[]; availableDevices: CameraDevice[]; isRunning: boolean;
  addCamera: () => void; removeCamera: (idx: number) => void;
  updateCamera: (idx: number, field: keyof CameraConfigData, value: string | number) => void;
}) => (
  <div className="section">
    <h3><Camera size={16} /> Cameras</h3>
    <p className="section-desc">Add cameras to record. Leave empty for no camera.</p>
    {cameras.map((cam, idx) => (
      <div key={idx} className="camera-config-row">
        <div className="form-group"><label>Name</label><input value={cam.name} onChange={e => updateCamera(idx, 'name', e.target.value)} disabled={isRunning} /></div>
        <div className="form-group"><label>Type</label>
          <select value={cam.type} onChange={e => updateCamera(idx, 'type', e.target.value)} disabled={isRunning}>
            <option value="opencv">OpenCV</option><option value="intelrealsense">Intel RealSense</option>
          </select>
        </div>
        <div className="form-group"><label>Device</label>
          {availableDevices.length > 0 ? (
            <select value={cam.index_or_path} onChange={e => updateCamera(idx, 'index_or_path', e.target.value)} disabled={isRunning}>
              {availableDevices.map(d => (<option key={d.index} value={String(d.index)}>{d.path} (idx {d.index})</option>))}
            </select>
          ) : (<input value={cam.index_or_path} onChange={e => updateCamera(idx, 'index_or_path', e.target.value)} disabled={isRunning} />)}
        </div>
        <div className="form-group"><label>W×H</label>
          <div className="inline-inputs">
            <input type="number" value={cam.width} onChange={e => updateCamera(idx, 'width', parseInt(e.target.value) || 640)} disabled={isRunning} style={{ width: 70 }} />
            <span>×</span>
            <input type="number" value={cam.height} onChange={e => updateCamera(idx, 'height', parseInt(e.target.value) || 480)} disabled={isRunning} style={{ width: 70 }} />
          </div>
        </div>
        <div className="form-group"><label>FPS</label><input type="number" min={1} max={60} value={cam.fps} onChange={e => updateCamera(idx, 'fps', parseInt(e.target.value) || 30)} disabled={isRunning} style={{ width: 60 }} /></div>
        <button className="btn btn-danger btn-sm" onClick={() => removeCamera(idx)} disabled={isRunning} title="Remove camera"><Trash2 size={14} /></button>
      </div>
    ))}
    <button className="btn btn-secondary btn-sm" onClick={addCamera} disabled={isRunning}><Plus size={14} /> Add Camera</button>
  </div>
);

const ConfigCard = ({ cfg, datasets, isRunning, expanded, onToggle, onStart, onDelete, onDeleteDataset }: {
  cfg: RecordingConfigResponse; datasets: DatasetResponse[]; isRunning: boolean; expanded: boolean;
  onToggle: () => void; onStart: () => void; onDelete: () => void; onDeleteDataset: (id: string) => void;
}) => {
  const cfgDatasets = datasets.filter(d => d.config_id === cfg.id);
  const isPolicy = !!cfg.policy_path;
  return (
    <div className="recording-config-card">
      <div className="recording-config-header" onClick={onToggle}>
        <span className="recording-config-toggle">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="recording-config-name">{cfg.name}</span>
        <span className={`recording-mode-badge ${isPolicy ? 'policy' : 'teleop'}`}>
          {isPolicy ? <><Brain size={12} /> Policy</> : <><Film size={12} /> Teleop</>}
        </span>
        <span className="recording-config-repo">{cfg.repo_id}</span>
        <span className="recording-config-meta">{cfg.num_episodes} eps @ {cfg.fps} fps</span>
      </div>
      {expanded && (
        <div className="recording-config-details">
          {cfg.description && <p className="section-desc">{cfg.description}</p>}
          <div className="recording-detail-grid">
            <div><strong>Robot:</strong> {cfg.robot_type} on {cfg.robot_port} (id: {cfg.robot_id})</div>
            {isPolicy ? (
              <div><strong>Policy:</strong> {cfg.policy_path} ({cfg.policy_type || 'act'} / {cfg.policy_device || 'cuda'})</div>
            ) : (
              <div><strong>Teleop:</strong> {cfg.teleop_type} on {cfg.teleop_port} (id: {cfg.teleop_id})</div>
            )}
            <div><strong>Task:</strong> {cfg.single_task || '(none)'}</div>
            <div><strong>Timing:</strong> {cfg.episode_time_s}s episodes, {cfg.reset_time_s}s reset</div>
            <div><strong>Flags:</strong> display={String(cfg.display_data)}, sounds={String(cfg.play_sounds)}, push={String(cfg.push_to_hub)}</div>
            {cfg.cameras && cfg.cameras.length > 0 && (
              <div><strong>Cameras:</strong> {(cfg.cameras as CameraConfigData[]).map(c => `${c.name} (${c.type}:${c.index_or_path})`).join(', ')}</div>
            )}
          </div>
          <div className="recording-config-actions">
            <button className="btn btn-primary" onClick={onStart} disabled={isRunning}><Play size={14} /> Start</button>
            <button className="btn btn-danger btn-sm" onClick={onDelete} disabled={isRunning}><Trash2 size={14} /> Delete</button>
          </div>
          {cfgDatasets.length > 0 && (
            <div className="recording-datasets-list">
              <h4>Datasets ({cfgDatasets.length})</h4>
              {cfgDatasets.map(ds => (
                <div key={ds.id} className="recording-dataset-row">
                  <span className={`status-badge status-${ds.status}`}>{ds.status}</span>
                  <span>{ds.repo_id}</span>
                  <span>{ds.completed_episodes}/{ds.total_episodes} episodes</span>
                  <button className="btn btn-danger btn-sm" onClick={() => onDeleteDataset(ds.id)}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};