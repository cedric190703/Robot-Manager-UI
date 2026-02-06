import { useState, useEffect } from 'react';
import type { CommandResponse } from '../api/robotApi';
import { listCommands, cancelCommand, clearAllCommands } from '../api/robotApi';
import { History, Trash2 } from 'lucide-react';
import { CommandStatus } from './CommandStatus';

export const CommandHistory = () => {
  const [commands, setCommands] = useState<CommandResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchCommands = async () => {
    try {
      setLoading(true);
      const data = await listCommands();
      setCommands(data.reverse()); // Show newest first
    } catch (error) {
      console.error('Failed to fetch commands:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommands();
    
    if (autoRefresh) {
      const interval = setInterval(fetchCommands, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const handleCancel = async (commandId: string) => {
    try {
      await cancelCommand(commandId);
      fetchCommands();
    } catch (error) {
      console.error('Failed to cancel command:', error);
      alert('Failed to cancel command: ' + (error as Error).message);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all command history?')) {
      return;
    }
    
    try {
      await clearAllCommands();
      setCommands([]);
    } catch (error) {
      console.error('Failed to clear commands:', error);
      alert('Failed to clear commands: ' + (error as Error).message);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2><History size={24} /> Command History</h2>
        <div className="header-actions">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto Refresh
          </label>
          <button
            className="btn btn-secondary"
            onClick={fetchCommands}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            className="btn btn-danger"
            onClick={handleClearAll}
            disabled={commands.length === 0}
          >
            <Trash2 size={16} /> Clear All
          </button>
        </div>
      </div>

      {commands.length === 0 ? (
        <div className="empty-state">
          <p>No commands executed yet</p>
        </div>
      ) : (
        <div className="commands-list">
          {commands.map((cmd) => (
            <CommandStatus
              key={cmd.command_id}
              command={cmd}
              onCancel={handleCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
};
