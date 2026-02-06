import { useState, useEffect } from 'react';
import type { TeleoperateRequest } from '../api/robotApi';
import { teleoperateRobot } from '../api/robotApi';
import { Play } from 'lucide-react';
import { InteractiveTerminal } from './InteractiveTerminal';
import { useInteractiveSession } from '../hooks/useInteractiveSession';

interface TeleoperationPanelProps {
  identifiedPorts: Record<string, string>;
}

export const TeleoperationPanel = ({ identifiedPorts }: TeleoperationPanelProps) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [config, setConfig] = useState<TeleoperateRequest>({
    robot_type: 'so101_follower',
    robot_port: '/dev/ttyACM1',
    robot_id: 'follower',
    teleop_type: 'so101_leader',
    teleop_port: '/dev/ttyACM0',
    teleop_id: 'leader',
    fps: 30,
    display_data: true,
  });

  // Auto-assign ports when identified by name
  useEffect(() => {
    const updates: Partial<TeleoperateRequest> = {};
    if (identifiedPorts.leader) {
      updates.teleop_port = identifiedPorts.leader;
    }
    if (identifiedPorts.follower) {
      updates.robot_port = identifiedPorts.follower;
    }
    if (Object.keys(updates).length > 0) {
      setConfig((prev) => ({ ...prev, ...updates }));
    }
  }, [identifiedPorts]);

  const allPorts = Object.values(identifiedPorts);

  // Interactive session hook
  const { session, isRunning, isDone, sendEnter, cancel } = useInteractiveSession(sessionId);

  const handleStartTeleoperation = async () => {
    try {
      setLoading(true);
      const response = await teleoperateRobot(config);
      setSessionId(response.session_id);
    } catch (error) {
      console.error('Failed to start teleoperation:', error);
      alert('Failed to start teleoperation: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSessionId(null);
  };

  return (
    <div className="card">
      <h2><Play size={24} /> Teleoperation Control</h2>

      <div className="teleoperation-grid">
        {/* Robot (Follower) Configuration */}
        <div className="section">
          <h3>Robot Configuration (Follower)</h3>
          
          <div className="form-group">
            <label>Robot Type:</label>
            <select
              value={config.robot_type}
              onChange={(e) => setConfig({
                ...config,
                robot_type: e.target.value as any
              })}
              disabled={isRunning}
            >
              <option value="so100_follower">SO-100 Follower</option>
              <option value="so101_follower">SO-101 Follower</option>
            </select>
          </div>

          <div className="form-group">
            <label>Robot Port:</label>
            {allPorts.length > 0 ? (
              <select
                value={config.robot_port}
                onChange={(e) => setConfig({
                  ...config,
                  robot_port: e.target.value
                })}
                disabled={isRunning}
              >
                {allPorts.map((port) => (
                  <option key={port} value={port}>{port}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={config.robot_port}
                onChange={(e) => setConfig({
                  ...config,
                  robot_port: e.target.value
                })}
                placeholder="/dev/ttyACM1"
                disabled={isRunning}
              />
            )}
          </div>

          <div className="form-group">
            <label>Robot ID:</label>
            <input
              type="text"
              value={config.robot_id}
              onChange={(e) => setConfig({
                ...config,
                robot_id: e.target.value
              })}
              placeholder="follower"
              disabled={isRunning}
            />
          </div>
        </div>

        {/* Teleop (Leader) Configuration */}
        <div className="section">
          <h3>Teleop Configuration (Leader)</h3>
          
          <div className="form-group">
            <label>Teleop Type:</label>
            <select
              value={config.teleop_type}
              onChange={(e) => setConfig({
                ...config,
                teleop_type: e.target.value as any
              })}
              disabled={isRunning}
            >
              <option value="so100_leader">SO-100 Leader</option>
              <option value="so101_leader">SO-101 Leader</option>
            </select>
          </div>

          <div className="form-group">
            <label>Teleop Port:</label>
            {allPorts.length > 0 ? (
              <select
                value={config.teleop_port}
                onChange={(e) => setConfig({
                  ...config,
                  teleop_port: e.target.value
                })}
                disabled={isRunning}
              >
                {allPorts.map((port) => (
                  <option key={port} value={port}>{port}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={config.teleop_port}
                onChange={(e) => setConfig({
                  ...config,
                  teleop_port: e.target.value
                })}
                placeholder="/dev/ttyACM0"
                disabled={isRunning}
              />
            )}
          </div>

          <div className="form-group">
            <label>Teleop ID:</label>
            <input
              type="text"
              value={config.teleop_id}
              onChange={(e) => setConfig({
                ...config,
                teleop_id: e.target.value
              })}
              placeholder="leader"
              disabled={isRunning}
            />
          </div>
        </div>
      </div>

      {/* Additional Settings */}
      <div className="section">
        <h3>Settings</h3>
        <div className="settings-grid">
          <div className="form-group">
            <label>FPS:</label>
            <input
              type="number"
              value={config.fps}
              onChange={(e) => setConfig({
                ...config,
                fps: parseInt(e.target.value)
              })}
              min="1"
              max="60"
              disabled={isRunning}
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={config.display_data}
                onChange={(e) => setConfig({
                  ...config,
                  display_data: e.target.checked
                })}
                disabled={isRunning}
              />
              Display Data
            </label>
          </div>
        </div>
      </div>

      {!session ? (
        <button
          className="btn btn-primary btn-large"
          onClick={handleStartTeleoperation}
          disabled={loading}
        >
          {loading ? 'Starting...' : 'Start Teleoperation'}
        </button>
      ) : isDone ? (
        <button className="btn btn-secondary btn-large" onClick={handleReset}>
          New Teleoperation
        </button>
      ) : null}

      <InteractiveTerminal
        session={session}
        isRunning={isRunning}
        isDone={isDone}
        onSendEnter={sendEnter}
        onCancel={cancel}
        title="Teleoperation"
      />
    </div>
  );
};
