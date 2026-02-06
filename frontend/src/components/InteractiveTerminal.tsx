import { useEffect, useRef, useMemo } from 'react';
import type { InteractiveSessionResponse } from '../api/robotApi';
import { Terminal, Send, Square, CheckCircle, XCircle, Loader } from 'lucide-react';

// Only render the last N characters in the terminal to avoid DOM bloat
// when processes (like record_ranges_of_motion) flood output.
const MAX_DISPLAY_CHARS = 20_000;

interface InteractiveTerminalProps {
  session: InteractiveSessionResponse | null;
  isRunning: boolean;
  isDone: boolean;
  onSendEnter: () => void;
  onSendText?: (text: string) => void;
  onCancel: () => void;
  title?: string;
}

export const InteractiveTerminal = ({
  session,
  isRunning,
  isDone,
  onSendEnter,
  onCancel,
  title = 'Interactive Session',
}: InteractiveTerminalProps) => {
  const outputRef = useRef<HTMLPreElement>(null);

  // Truncate output for rendering performance
  const displayOutput = useMemo(() => {
    if (!session?.output) return '';
    if (session.output.length <= MAX_DISPLAY_CHARS) return session.output;
    return '… (earlier output truncated) …\n' + session.output.slice(-MAX_DISPLAY_CHARS);
  }, [session?.output]);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [displayOutput]);

  if (!session) return null;

  const getStatusBadge = () => {
    switch (session.status) {
      case 'running':
        return <span className="terminal-status running"><Loader size={14} className="spin" /> Running</span>;
      case 'completed':
        return <span className="terminal-status completed"><CheckCircle size={14} /> Completed</span>;
      case 'failed':
        return <span className="terminal-status failed"><XCircle size={14} /> Failed</span>;
      case 'cancelled':
        return <span className="terminal-status cancelled"><Square size={14} /> Cancelled</span>;
      default:
        return <span className="terminal-status pending"><Loader size={14} className="spin" /> Pending</span>;
    }
  };

  return (
    <div className="interactive-terminal">
      <div className="terminal-header">
        <div className="terminal-title">
          <Terminal size={16} />
          <span>{title}</span>
          {getStatusBadge()}
        </div>
        <div className="terminal-actions">
          {isRunning && (
            <>
              <button className="btn btn-terminal btn-enter" onClick={onSendEnter} title="Send Enter key to the process">
                <Send size={14} /> Send Enter
              </button>
              <button className="btn btn-terminal btn-cancel" onClick={onCancel} title="Cancel process">
                <Square size={14} /> Stop
              </button>
            </>
          )}
        </div>
      </div>

      <pre ref={outputRef} className="terminal-output">
        {displayOutput || (isRunning ? 'Waiting for output...' : 'No output.')}
      </pre>

      {isRunning && (
        <div className="terminal-hint">
          💡 When the process asks you to press Enter (e.g. "press ENTER"), click the <strong>Send Enter</strong> button above.
        </div>
      )}

      {isDone && (
        <div className={`terminal-result ${session.status}`}>
          {session.status === 'completed' && '✅ Process completed successfully.'}
          {session.status === 'failed' && '❌ Process failed. Check the output above for details.'}
          {session.status === 'cancelled' && '⏹️ Process was cancelled.'}
        </div>
      )}
    </div>
  );
};
