import { useState, useEffect } from 'react';
import type { CalibrateRequest } from '../api/robotApi';
import { calibrateRobot, resetCalibration } from '../api/robotApi';
import { Target, Trash2 } from 'lucide-react';
import { InteractiveTerminal } from './InteractiveTerminal';
import { useInteractiveSession } from '../hooks/useInteractiveSession';

interface CalibrationPanelProps {
  identifiedPorts: Record<string, string>;
}

export const CalibrationPanel = ({ identifiedPorts }: CalibrationPanelProps) => {
  const [leaderSessionId, setLeaderSessionId] = useState<string | null>(null);
  const [followerSessionId, setFollowerSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [leaderConfig, setLeaderConfig] = useState({
    robot_type: 'so101_leader' as const,
    port: '/dev/ttyACM0',
    robot_id: 'leader',
  });

  const [followerConfig, setFollowerConfig] = useState({
    robot_type: 'so101_follower' as const,
    port: '/dev/ttyACM1',
    robot_id: 'follower',
  });

  // Auto-assign ports when identified
  useEffect(() => {
    if (identifiedPorts.leader) {
      setLeaderConfig((prev) => ({ ...prev, port: identifiedPorts.leader }));
    }
    if (identifiedPorts.follower) {
      setFollowerConfig((prev) => ({ ...prev, port: identifiedPorts.follower }));
    }
  }, [identifiedPorts]);

  const allPorts = Object.values(identifiedPorts);

  // Interactive session hooks
  const leaderSession = useInteractiveSession(leaderSessionId);
  const followerSession = useInteractiveSession(followerSessionId);

  const handleCalibrateLeader = async () => {
    try {
      setLoading(true);
      const request: CalibrateRequest = {
        ...leaderConfig,
        is_teleop: true,
      };
      const response = await calibrateRobot(request);
      setLeaderSessionId(response.session_id);
    } catch (error) {
      console.error('Failed to calibrate leader:', error);
      alert('Failed to calibrate leader: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCalibrateFollower = async () => {
    try {
      setLoading(true);
      const request: CalibrateRequest = {
        ...followerConfig,
        is_teleop: false,
      };
      const response = await calibrateRobot(request);
      setFollowerSessionId(response.session_id);
    } catch (error) {
      console.error('Failed to calibrate follower:', error);
      alert('Failed to calibrate follower: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetLeader = () => {
    setLeaderSessionId(null);
  };

  const handleResetFollower = () => {
    setFollowerSessionId(null);
  };

  const handleResetCalibration = async (robotId: string, calType: string) => {
    try {
      await resetCalibration(robotId, calType);
      alert(`Calibration files reset for ${robotId}. You can now re-calibrate.`);
    } catch (error) {
      alert('Failed to reset calibration: ' + (error as Error).message);
    }
  };

  return (
    <div className="card">
      <h2><Target size={24} /> Robot Calibration</h2>

      <div className="calibration-info">
        <p>
          Calibration is an <strong>interactive process</strong>. The robot will prompt you to:
        </p>
        <ol>
          <li>Optionally re-calibrate if calibration data already exists</li>
          <li>Move the arm to the middle of its range of motion, then press Enter</li>
          <li>Record the full range of motion, then press Enter when done</li>
        </ol>
        <p>Use the <strong>Send Enter</strong> button in the terminal below when prompted.</p>
      </div>

      <div className="calibration-grid">
        {/* Leader Calibration */}
        <div className="section">
          <h3>Leader Arm (Teleop)</h3>
          
          <div className="form-group">
            <label>Robot Type:</label>
            <select
              value={leaderConfig.robot_type}
              onChange={(e) => setLeaderConfig({
                ...leaderConfig,
                robot_type: e.target.value as any
              })}
              disabled={leaderSession.isRunning}
            >
              <option value="so100_leader">SO-100 Leader</option>
              <option value="so101_leader">SO-101 Leader</option>
            </select>
          </div>

          <div className="form-group">
            <label>Port:</label>
            {allPorts.length > 0 ? (
              <select
                value={leaderConfig.port}
                onChange={(e) => setLeaderConfig({
                  ...leaderConfig,
                  port: e.target.value
                })}
                disabled={leaderSession.isRunning}
              >
                {allPorts.map((port) => (
                  <option key={port} value={port}>{port}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={leaderConfig.port}
                onChange={(e) => setLeaderConfig({
                  ...leaderConfig,
                  port: e.target.value
                })}
                placeholder="/dev/ttyACM0"
                disabled={leaderSession.isRunning}
              />
            )}
          </div>

          <div className="form-group">
            <label>Robot ID:</label>
            <input
              type="text"
              value={leaderConfig.robot_id}
              onChange={(e) => setLeaderConfig({
                ...leaderConfig,
                robot_id: e.target.value
              })}
              placeholder="leader"
              disabled={leaderSession.isRunning}
            />
          </div>

          {!leaderSession.session ? (
            <div className="calibration-buttons">
              <button
                className="btn btn-primary"
                onClick={handleCalibrateLeader}
                disabled={loading}
              >
                {loading ? 'Starting...' : 'Calibrate Leader'}
              </button>
              <button
                className="btn btn-danger-outline"
                onClick={() => handleResetCalibration(leaderConfig.robot_id, 'teleop')}
                title="Delete corrupt calibration files and start fresh"
              >
                <Trash2 size={14} /> Reset Calibration
              </button>
            </div>
          ) : leaderSession.isDone ? (
            <button className="btn btn-secondary" onClick={handleResetLeader}>
              New Calibration
            </button>
          ) : null}

          <InteractiveTerminal
            session={leaderSession.session}
            isRunning={leaderSession.isRunning}
            isDone={leaderSession.isDone}
            onSendEnter={leaderSession.sendEnter}
            onCancel={leaderSession.cancel}
            title="Leader Calibration"
          />
        </div>

        {/* Follower Calibration */}
        <div className="section">
          <h3>Follower Arm (Robot)</h3>
          
          <div className="form-group">
            <label>Robot Type:</label>
            <select
              value={followerConfig.robot_type}
              onChange={(e) => setFollowerConfig({
                ...followerConfig,
                robot_type: e.target.value as any
              })}
              disabled={followerSession.isRunning}
            >
              <option value="so100_follower">SO-100 Follower</option>
              <option value="so101_follower">SO-101 Follower</option>
            </select>
          </div>

          <div className="form-group">
            <label>Port:</label>
            {allPorts.length > 0 ? (
              <select
                value={followerConfig.port}
                onChange={(e) => setFollowerConfig({
                  ...followerConfig,
                  port: e.target.value
                })}
                disabled={followerSession.isRunning}
              >
                {allPorts.map((port) => (
                  <option key={port} value={port}>{port}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={followerConfig.port}
                onChange={(e) => setFollowerConfig({
                  ...followerConfig,
                  port: e.target.value
                })}
                placeholder="/dev/ttyACM1"
                disabled={followerSession.isRunning}
              />
            )}
          </div>

          <div className="form-group">
            <label>Robot ID:</label>
            <input
              type="text"
              value={followerConfig.robot_id}
              onChange={(e) => setFollowerConfig({
                ...followerConfig,
                robot_id: e.target.value
              })}
              placeholder="follower"
              disabled={followerSession.isRunning}
            />
          </div>

          {!followerSession.session ? (
            <div className="calibration-buttons">
              <button
                className="btn btn-success"
                onClick={handleCalibrateFollower}
                disabled={loading}
              >
                {loading ? 'Starting...' : 'Calibrate Follower'}
              </button>
              <button
                className="btn btn-danger-outline"
                onClick={() => handleResetCalibration(followerConfig.robot_id, 'robot')}
                title="Delete corrupt calibration files and start fresh"
              >
                <Trash2 size={14} /> Reset Calibration
              </button>
            </div>
          ) : followerSession.isDone ? (
            <button className="btn btn-secondary" onClick={handleResetFollower}>
              New Calibration
            </button>
          ) : null}

          <InteractiveTerminal
            session={followerSession.session}
            isRunning={followerSession.isRunning}
            isDone={followerSession.isDone}
            onSendEnter={followerSession.sendEnter}
            onCancel={followerSession.cancel}
            title="Follower Calibration"
          />
        </div>
      </div>
    </div>
  );
};
