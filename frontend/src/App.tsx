import { useState, useEffect, useCallback } from 'react';
import { Bot, Usb, History, Info, Camera, Workflow, Target, Gamepad2 } from 'lucide-react';
import { PortManager } from './components/PortManager';
import { CalibrationPanel } from './components/CalibrationPanel';
import { TeleoperationPanel } from './components/TeleoperationPanel';
import { CameraPanel } from './components/CameraPanel';
import { RecordingPanel } from './components/RecordingPanel';
import { CommandHistory } from './components/CommandHistory';
import { getIdentifiedPorts } from './api/robotApi';
import './App.css';

type TabType = 'ports' | 'cameras' | 'calibrate' | 'teleoperate' | 'recording' | 'history';

interface Tab {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  { id: 'ports', label: 'Ports', icon: <Usb size={16} /> },
  { id: 'cameras', label: 'Cameras', icon: <Camera size={16} /> },
  { id: 'calibrate', label: 'Calibration', icon: <Target size={16} /> },
  { id: 'teleoperate', label: 'Teleoperation', icon: <Gamepad2 size={16} /> },
  { id: 'recording', label: 'Pipeline', icon: <Workflow size={16} /> },
  { id: 'history', label: 'History', icon: <History size={16} /> },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('ports');
  const [isConnected, setIsConnected] = useState(false);
  const [identifiedPorts, setIdentifiedPorts] = useState<Record<string, string>>({});

  // Callback when ports are identified in PortManager (e.g. { leader: "/dev/ttyACM0", follower: "/dev/ttyACM1" })
  const handlePortsDetected = useCallback((ports: Record<string, string>) => {
    setIdentifiedPorts(ports);
  }, []);

  // Load persisted ports from DB on mount
  useEffect(() => {
    getIdentifiedPorts()
      .then((res) => {
        if (res.ports && Object.keys(res.ports).length > 0) {
          setIdentifiedPorts(res.ports);
        }
      })
      .catch(() => {
        // Backend not ready yet, will load on next health check
      });
  }, []);

  // Check backend connection
  useEffect(() => {
    const checkConnection = () => {
      fetch('http://localhost:8000/health')
        .then((res) => {
          setIsConnected(res.ok);
        })
        .catch(() => setIsConnected(false));
    };

    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'ports':
        return <PortManager onPortsDetected={handlePortsDetected} />;
      case 'cameras':
        return <CameraPanel />;
      case 'calibrate':
        return <CalibrationPanel identifiedPorts={identifiedPorts} />;
      case 'teleoperate':
        return <TeleoperationPanel identifiedPorts={identifiedPorts} />;
      case 'recording':
        return <RecordingPanel identifiedPorts={identifiedPorts} />;
      case 'history':
        return <CommandHistory />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <Bot size={24} />
            <h1>Robot Manager</h1>
          </div>
          <div className="connection-status">
            <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <div className="app-container">
        <div className="tabs-sidebar">
          <nav className="tabs-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>
          
          <div className="sidebar-footer">
            <div className="info-card">
              <Info size={16} />
              <div className="info-text">
                <strong>Quick Tips</strong>
                <p>Start with port discovery, then calibrate your robots before teleoperation.</p>
              </div>
            </div>
          </div>
        </div>

        <main className="tab-content">
          <div className="content-wrapper">
            {renderTabContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;