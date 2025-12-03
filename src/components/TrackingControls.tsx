import React from 'react';
import { Button } from '@/components/ui/button';

interface TrackingControlsProps {
  status: 'ready' | 'tracking' | 'paused';
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}

export const TrackingControls: React.FC<TrackingControlsProps> = ({ status, onStart, onPause, onReset }) => {
  return (
    <div className="flex gap-2">
      {status === 'ready' && <Button onClick={onStart}>Start</Button>}
      {status === 'tracking' && <Button onClick={onPause}>Pause</Button>}
      {status === 'paused' && (
        <>
          <Button onClick={onStart}>Fortsetzen</Button>
          <Button variant="destructive" onClick={onReset}>Stopp</Button>
        </>
      )}
    </div>
  );
};

export default TrackingControls;
