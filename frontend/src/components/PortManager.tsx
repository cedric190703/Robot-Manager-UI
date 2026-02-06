import { useState } from 'react';
import {
  identifyPortStart,
  identifyPortDetect,
  identifyPortRefresh,
  chmodPort,
} from '../api/robotApi';
import { Search, Lock, Usb, Unplug, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { CommandStatus } from './CommandStatus';
import { useCommandStatus } from '../hooks/useCommandStatus';

interface PortManagerProps {
  onPortsDetected: (ports: Record<string, string>) => void;
}

type WizardStep = 'idle' | 'scanning' | 'waiting_disconnect' | 'detecting' | 'identified' | 'error';

interface IdentifiedArm {
  name: string;
  port: string;
}

export const PortManager = ({ onPortsDetected }: PortManagerProps) => {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [portsBefore, setPortsBefore] = useState<string[]>([]);
  const [currentArmName, setCurrentArmName] = useState('leader');
  const [identifiedArms, setIdentifiedArms] = useState<IdentifiedArm[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Chmod state
  const [chmodCommandId, setChmodCommandId] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState('/dev/ttyACM0');
  const [permissions, setPermissions] = useState('666');
  const { command: chmodCommand } = useCommandStatus(chmodCommandId);

  // Get the arm name for the current identification round
  const getNextArmName = () => {
    if (identifiedArms.length === 0) return 'leader';
    if (identifiedArms.length === 1) return 'follower';
    return `arm_${identifiedArms.length + 1}`;
  };

  // Step 1: Start scanning
  const handleStartScan = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      setStep('scanning');

      const response = await identifyPortStart();
      setSessionId(response.session_id);
      setPortsBefore(response.ports_before);
      setCurrentArmName(getNextArmName());
      setStatusMessage(response.message);
      setStep('waiting_disconnect');
    } catch (error) {
      setErrorMessage('Failed to scan ports: ' + (error as Error).message);
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: User has disconnected the arm, now detect
  const handleDetect = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setErrorMessage('');
      setStep('detecting');

      const response = await identifyPortDetect({
        session_id: sessionId,
        arm_name: currentArmName,
      });

      if (response.detected_port) {
        const newArm: IdentifiedArm = {
          name: currentArmName,
          port: response.detected_port,
        };
        const updatedArms = [...identifiedArms, newArm];
        setIdentifiedArms(updatedArms);
        setStatusMessage(response.message);
        setStep('identified');

        // Notify parent with the identified ports map
        const portsMap: Record<string, string> = {};
        updatedArms.forEach((arm) => {
          portsMap[arm.name] = arm.port;
        });
        onPortsDetected(portsMap);

        // Update selected port for chmod
        if (updatedArms.length === 1) {
          setSelectedPort(updatedArms[0].port);
        }
      } else {
        setErrorMessage(response.message);
        setStep('waiting_disconnect');
      }
    } catch (error) {
      setErrorMessage('Failed to detect port: ' + (error as Error).message);
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  // Identify another arm: reconnect → re-scan → wait for next disconnect
  const handleIdentifyNext = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setErrorMessage('');
      setStatusMessage('Re-scanning ports after reconnecting...');

      await identifyPortRefresh(sessionId);

      setCurrentArmName(identifiedArms.length === 1 ? 'follower' : `arm_${identifiedArms.length + 1}`);
      setStatusMessage('Ports re-scanned. Now disconnect the NEXT arm and click "Detect Port".');
      setStep('waiting_disconnect');
    } catch (error) {
      setErrorMessage('Failed to re-scan: ' + (error as Error).message);
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  // Reset everything
  const handleReset = () => {
    setStep('idle');
    setSessionId(null);
    setPortsBefore([]);
    setIdentifiedArms([]);
    setStatusMessage('');
    setErrorMessage('');
    setCurrentArmName('leader');
  };

  // Chmod handler
  const handleChmod = async () => {
    try {
      setLoading(true);
      const response = await chmodPort({ port: selectedPort, permissions });
      setChmodCommandId(response.command_id);
    } catch (error) {
      console.error('Failed to change permissions:', error);
      alert('Failed to change permissions: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const allPorts = identifiedArms.map((a) => a.port);

  return (
    <div className="card">
      <h2><Search size={24} /> Port Identification</h2>

      {/* Wizard Section */}
      <div className="section">
        <h3><Usb size={20} /> Identify Arm Ports</h3>
        <p className="section-description">
          This wizard identifies which USB port belongs to which arm by detecting disconnections —
          just like <code>lerobot-find-port</code>.
        </p>

        {/* Step indicators */}
        <div className="wizard-steps">
          <div className={`wizard-step ${step !== 'idle' ? 'active' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">Scan Ports</span>
          </div>
          <div className="wizard-arrow">→</div>
          <div className={`wizard-step ${step === 'waiting_disconnect' || step === 'detecting' ? 'active' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">Unplug Arm</span>
          </div>
          <div className="wizard-arrow">→</div>
          <div className={`wizard-step ${step === 'identified' ? 'active' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">Detected!</span>
          </div>
        </div>

        {/* Idle state */}
        {step === 'idle' && (
          <div className="wizard-action">
            <button className="btn btn-primary" onClick={handleStartScan} disabled={loading}>
              {loading ? 'Scanning...' : 'Start Port Identification'}
            </button>
          </div>
        )}

        {/* Waiting for user to disconnect */}
        {step === 'waiting_disconnect' && (
          <div className="wizard-action">
            <div className="wizard-prompt">
              <Unplug size={32} className="prompt-icon" />
              <div>
                <p className="prompt-title">
                  Disconnect the <strong>{currentArmName}</strong> arm's USB cable
                </p>
                <p className="prompt-subtitle">
                  {portsBefore.length} port(s) currently detected. Unplug the cable, then click below.
                </p>
              </div>
            </div>
            <button className="btn btn-warning" onClick={handleDetect} disabled={loading}>
              {loading ? 'Detecting...' : "I've Disconnected It — Detect Port"}
            </button>
          </div>
        )}

        {/* Port identified */}
        {step === 'identified' && (
          <div className="wizard-action">
            <div className="wizard-success">
              <CheckCircle size={24} />
              <span>{statusMessage}</span>
            </div>
            <div className="wizard-buttons">
              <button className="btn btn-primary" onClick={handleIdentifyNext} disabled={loading}>
                {loading ? 'Re-scanning...' : 'Identify Another Arm'}
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>
                <RotateCcw size={16} /> Start Over
              </button>
            </div>
          </div>
        )}

        {/* Error state */}
        {(step === 'error' || errorMessage) && errorMessage && (
          <div className="wizard-error">
            <AlertCircle size={20} />
            <span>{errorMessage}</span>
            {step === 'error' && (
              <button className="btn btn-secondary" onClick={handleReset} style={{ marginLeft: '1rem' }}>
                Try Again
              </button>
            )}
          </div>
        )}

        {/* Identified arms summary */}
        {identifiedArms.length > 0 && (
          <div className="detected-ports">
            <p><strong>Identified Arms:</strong></p>
            <div className="port-tags">
              {identifiedArms.map((arm) => (
                <span key={arm.name} className="port-tag">
                  <strong>{arm.name}</strong> → {arm.port}
                </span>
              ))}
            </div>
            <p className="port-hint">
              These ports have been automatically assigned to the Calibration and Teleoperation tabs.
            </p>
          </div>
        )}
      </div>

      {/* Chmod Section */}
      <div className="section">
        <h3><Lock size={20} /> Change Port Permissions</h3>
        <div className="form-group">
          <label>Port:</label>
          {allPorts.length > 0 ? (
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
            >
              {allPorts.map((port) => (
                <option key={port} value={port}>{port}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              placeholder="/dev/ttyACM0"
            />
          )}
        </div>

        <div className="form-group">
          <label>Permissions:</label>
          <input
            type="text"
            value={permissions}
            onChange={(e) => setPermissions(e.target.value)}
            placeholder="666"
          />
        </div>

        <button
          className="btn btn-warning"
          onClick={handleChmod}
          disabled={loading || !selectedPort}
        >
          Change Permissions
        </button>

        {chmodCommand && <CommandStatus command={chmodCommand} />}
      </div>
    </div>
  );
};
