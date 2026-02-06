import { useEffect, useState, useCallback, useRef } from 'react';
import type { InteractiveSessionResponse } from '../api/robotApi';
import { getInteractiveSession, sendEnterToSession, sendInputToSession, cancelInteractiveSession } from '../api/robotApi';

export const useInteractiveSession = (sessionId: string | null, pollInterval = 500) => {
  const [session, setSession] = useState<InteractiveSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll session state
  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }

    const fetchSession = async () => {
      try {
        const data = await getInteractiveSession(sessionId);
        setSession(data);
        setError(null);

        // Stop polling if session is done
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch session');
      }
    };

    fetchSession();
    intervalRef.current = setInterval(fetchSession, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, pollInterval]);

  const sendEnter = useCallback(async () => {
    if (!sessionId) return;
    try {
      await sendEnterToSession(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send Enter');
    }
  }, [sessionId]);

  const sendText = useCallback(async (text: string) => {
    if (!sessionId) return;
    try {
      await sendInputToSession(sessionId, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send input');
    }
  }, [sessionId]);

  const cancel = useCallback(async () => {
    if (!sessionId) return;
    try {
      await cancelInteractiveSession(sessionId);
      // Immediately update local state
      setSession((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel session');
    }
  }, [sessionId]);

  const isRunning = session?.status === 'running' || session?.status === 'pending';
  const isDone = session?.status === 'completed' || session?.status === 'failed' || session?.status === 'cancelled';

  return { session, error, isRunning, isDone, sendEnter, sendText, cancel };
};
