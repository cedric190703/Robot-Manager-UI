import { useEffect, useState } from 'react';
import type { CommandResponse } from '../api/robotApi';
import { getCommandStatus } from '../api/robotApi';

export const useCommandStatus = (commandId: string | null, interval = 2000) => {
  const [command, setCommand] = useState<CommandResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!commandId) return;

    const fetchStatus = async () => {
      try {
        setLoading(true);
        const data = await getCommandStatus(commandId);
        setCommand(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    
    // Only continue polling if command is pending or running
    if (command?.status === 'pending' || command?.status === 'running') {
      const intervalId = setInterval(fetchStatus, interval);
      return () => clearInterval(intervalId);
    }
  }, [commandId, interval, command?.status]);

  return { command, loading, error };
};
