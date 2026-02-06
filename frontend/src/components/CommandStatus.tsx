import type { CommandResponse } from '../api/robotApi';
import { CheckCircle, XCircle, Clock, Loader, Ban } from 'lucide-react';

interface CommandStatusProps {
  command: CommandResponse;
  onCancel?: (commandId: string) => void;
}

export const CommandStatus = ({ command, onCancel }: CommandStatusProps) => {
  const getStatusIcon = () => {
    switch (command.status) {
      case 'completed':
        return <CheckCircle className="status-icon success" />;
      case 'failed':
        return <XCircle className="status-icon error" />;
      case 'running':
        return <Loader className="status-icon running" />;
      case 'pending':
        return <Clock className="status-icon pending" />;
      case 'cancelled':
        return <Ban className="status-icon cancelled" />;
    }
  };

  const getStatusClass = () => {
    return `status-badge status-${command.status}`;
  };

  return (
    <div className="command-status">
      <div className="command-header">
        <div className="command-info">
          {getStatusIcon()}
          <span className={getStatusClass()}>{command.status.toUpperCase()}</span>
        </div>
        {(command.status === 'pending' || command.status === 'running') && onCancel && (
          <button
            className="btn-cancel"
            onClick={() => onCancel(command.command_id)}
          >
            Cancel
          </button>
        )}
      </div>
      
      <div className="command-details">
        <div className="command-text">
          <strong>Command:</strong> <code>{command.command}</code>
        </div>
        
        {command.started_at && (
          <div className="command-meta">
            <strong>Started:</strong> {new Date(command.started_at).toLocaleString()}
          </div>
        )}
        
        {command.completed_at && (
          <div className="command-meta">
            <strong>Completed:</strong> {new Date(command.completed_at).toLocaleString()}
          </div>
        )}
        
        {command.output && (
          <div className="command-output">
            <strong>Output:</strong>
            <pre>{command.output}</pre>
          </div>
        )}
        
        {command.error && (
          <div className="command-error">
            <strong>Error:</strong>
            <pre>{command.error}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
