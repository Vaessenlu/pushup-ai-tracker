import { useState, useRef, useCallback, useEffect } from 'react';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [cameraZoom, setCameraZoom] = useState<number[]>([1]);
  const [cameraZoomRange, setCameraZoomRange] = useState({ min: 0.5, max: 1 });
  const [cameraZoomSupported, setCameraZoomSupported] = useState(false);

  const enableCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setCameraEnabled(true);
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.();
      if (capabilities && 'zoom' in capabilities) {
        const { min, max } = capabilities.zoom as { min: number; max: number };
        setCameraZoomRange({ min, max });
        setCameraZoomSupported(true);
      }
    } catch (e) {
      console.error('Camera enable failed', e);
      setCameraEnabled(false);
    }
  }, []);

  const disableCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraEnabled(false);
    setVideoReady(false);
  }, []);

  useEffect(() => {
    if (!cameraZoomSupported) return;
    const track = streamRef.current?.getVideoTracks()[0];
    track?.applyConstraints?.({ advanced: [{ zoom: cameraZoom[0] }] });
  }, [cameraZoom, cameraZoomSupported]);

  return {
    videoRef,
    streamRef,
    cameraEnabled,
    videoReady,
    setVideoReady,
    enableCamera,
    disableCamera,
    cameraZoom,
    setCameraZoom,
    cameraZoomRange,
    cameraZoomSupported,
  } as const;
}
