import { useState, useRef, useCallback } from 'react';

export function useSessionTimer() {
  const [sessionTime, setSessionTime] = useState(0);
  const startRef = useRef<number>(0);
  const frameRef = useRef<number>();

  const tick = useCallback(() => {
    setSessionTime(Math.floor((Date.now() - startRef.current) / 1000));
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    startRef.current = Date.now();
    frameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
  }, []);

  const reset = useCallback(() => {
    pause();
    setSessionTime(0);
  }, [pause]);

  return { sessionTime, start, pause, reset } as const;
}
