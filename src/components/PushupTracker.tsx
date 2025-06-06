import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Play,
  Pause,
  Square,
  Camera,
  CameraOff,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  Slash
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Session } from '@/pages/Index';

import type { Results as PoseResults, NormalizedLandmark, NormalizedLandmarkList } from '@mediapipe/pose';
let drawConnectors: typeof import('@mediapipe/drawing_utils').drawConnectors | undefined;
let drawLandmarks: typeof import('@mediapipe/drawing_utils').drawLandmarks | undefined;

// Load drawing utils dynamically to avoid tree-shaking issues
import('@mediapipe/drawing_utils/drawing_utils.js').then((mod: unknown) => {
  // Dynamic module may have different shapes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utils =
    m.drawingUtils ??
    m.default ??
    (globalThis as Record<string, unknown>).drawingUtils ??
    m;
  drawConnectors = utils.drawConnectors;
  drawLandmarks = utils.drawLandmarks;
});
import { POSE_CONNECTIONS } from '@/lib/poseConstants';
import {
  PushupDetector,
  POSE_LANDMARK_NAMES,
  UNIMPORTANT_LANDMARKS
} from '@/lib/PushupDetector';
import { supabase } from '@/lib/supabaseClient';
import {
  PushupDetector,
  POSE_LANDMARK_NAMES,
  UNIMPORTANT_LANDMARKS
} from '@/lib/PushupDetector';

interface PushupTrackerProps {
  onSessionComplete: (session: Omit<Session, 'id'>) => void;
  isTracking: boolean;
  setIsTracking: (tracking: boolean) => void;
  user?: { id: string } | null;
}

export const PushupTracker: React.FC<PushupTrackerProps> = ({
  onSessionComplete,
  isTracking,
  setIsTracking,
  user,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<PushupDetector | null>(null);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(0);

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [status, setStatus] = useState<'ready' | 'tracking' | 'paused'>('ready');
  const [videoReady, setVideoReady] = useState(false);
  const [count, setCount] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [zoom, setZoom] = useState<number[]>([1]);
  const [cameraZoom, setCameraZoom] = useState<number[]>([1]);
  const [cameraZoomRange, setCameraZoomRange] = useState({ min: 0.5, max: 1 });
  const [cameraZoomSupported, setCameraZoomSupported] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [hideUnimportant, setHideUnimportant] = useState(false);
  const [poseResults, setPoseResults] = useState<PoseResults['poseLandmarks'] | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  
  const { toast } = useToast();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize pose detector
  useEffect(() => {
    const detector = new PushupDetector();
    detector.setOnPoseResults((results) => {
      setPoseResults(results);
      setModelReady(true);
    });
    detectorRef.current = detector;
    return () => {
      detector.cleanup();
    };
  }, []);

  // Handle video metadata loaded
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      console.log('Video metadata loaded:', video.videoWidth, 'x', video.videoHeight);
      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      setVideoReady(true);
      
      // Update canvas size immediately
      if (canvasRef.current) {
        canvasRef.current.width = video.videoWidth;
        canvasRef.current.height = video.videoHeight;
        console.log('Canvas size set to:', video.videoWidth, 'x', video.videoHeight);
      }
      
      toast({
        title: "Kamera aktiviert",
        description: "Positioniere dich so, dass dein ganzer Körper sichtbar ist.",
      });
    }
  }, [toast]);

  // Separate useEffect to handle video stream assignment
  useEffect(() => {
    if (streamRef.current && videoRef.current && cameraEnabled) {
      console.log('Assigning stream to video element...');
      
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      
      video.addEventListener('loadedmetadata', handleVideoLoadedMetadata);
      
      video.play()
        .then(() => {
          console.log('Video playback started successfully');
        })
        .catch((error) => {
          console.error('Video play failed:', error);
          setVideoReady(false);
        });

      return () => {
        video.removeEventListener('loadedmetadata', handleVideoLoadedMetadata);
      };
    }
  }, [cameraEnabled, handleVideoLoadedMetadata]);

  // Apply hardware camera zoom when changed
  useEffect(() => {
    if (!cameraZoomSupported) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      track
        .applyConstraints({ advanced: [{ zoom: cameraZoom[0] }] })
        .catch((err) => console.error('Applying camera zoom failed', err));
    }
  }, [cameraZoom, cameraZoomSupported]);

  const enableCamera = useCallback(async () => {
    try {
      console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });

      console.log('Camera stream obtained successfully');
      streamRef.current = stream;
      setCameraEnabled(true);

      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? (track.getCapabilities() as MediaTrackCapabilities) : undefined;
      if (caps && 'zoom' in caps) {
        setCameraZoomSupported(true);
        const settings = track.getSettings();
        const minZoom = Math.min(0.5, caps.zoom!.min!);
        setCameraZoomRange({ min: minZoom, max: caps.zoom!.max! });
        const initialZoom = typeof settings.zoom === 'number' ? settings.zoom : minZoom;
        setCameraZoom([initialZoom]);
        try {
          await track.applyConstraints({ advanced: [{ zoom: initialZoom }] });
        } catch (err) {
          console.error('Failed to apply initial zoom', err);
        }
      } else {
        setCameraZoomSupported(false);
      }

    } catch (error) {
      console.error('Camera access error:', error);
      setCameraEnabled(false);
      setVideoReady(false);
      streamRef.current = null;
      toast({
        title: "Kamera-Fehler",
        description: "Konnte nicht auf die Kamera zugreifen. Bitte Berechtigung erteilen.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const disableCamera = useCallback(() => {
    console.log('Disabling camera...');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Camera track stopped');
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraEnabled(false);
    setVideoReady(false);
    setCameraZoomSupported(false);
    setCameraZoom([1]);
    setCameraZoomRange({ min: 0.5, max: 1 });
    setIsTracking(false);
    setStatus('ready');
  }, [setIsTracking]);

  const startTracking = useCallback(() => {
    if (!cameraEnabled || !videoReady) {
      toast({
        title: "System nicht bereit",
        description: "Bitte warte bis die Kamera bereit ist.",
        variant: "destructive",
      });
      return;
    }

    if (!modelReady) {
      toast({
        title: "Modell initialisiert",
        description: "Das Pose-Modell wird mit dem ersten Frame geladen.",
      });
    }

    detectorRef.current?.reset();
    setCount(0);
    setSessionTime(0);
    startTimeRef.current = Date.now();
    setIsTracking(true);
    setStatus('tracking');
    
    toast({
      title: "Tracking gestartet",
      description: "Beginne mit deinen Liegestützen!",
    });
  }, [cameraEnabled, videoReady, modelReady, setIsTracking, toast]);

  const pauseTracking = useCallback(() => {
    setIsTracking(false);
    setStatus('paused');
  }, [setIsTracking]);

  const stopTracking = useCallback(async () => {
    const endTime = Date.now();
    const duration = Math.round((endTime - startTimeRef.current) / 1000);
    const avgTimePerRep = count > 0 ? duration / count : 0;

    if (count > 0) {
      if (user?.id) {
        try {
          await supabase.from('sessions').insert({
            user_id: user.id,
            count,
            duration,
          });
        } catch (e) {
          console.error('Supabase insert failed', e);
        }
      }

      onSessionComplete({
        date: new Date(),
        count,
        duration,
        avgTimePerRep,
      });

      toast({
        title: "Session beendet!",
        description: `${count} Liegestützen in ${duration}s absolviert!`,
      });
    }

    setIsTracking(false);
    setStatus('ready');
    setCount(0);
    setSessionTime(0);
  }, [count, onSessionComplete, setIsTracking, toast, user]);

  // Animation loop for pose detection
  useEffect(() => {
    if (cameraEnabled && videoRef.current && videoReady && videoDimensions.width > 0) {
      const animate = async () => {
        if (videoRef.current && detectorRef.current) {
          const newCount = await detectorRef.current.detect(videoRef.current);
          if (isTracking) {
            setCount(newCount);

            // Update session time only while tracking
            const currentTime = Math.round((Date.now() - startTimeRef.current) / 1000);
            setSessionTime(currentTime);
          }

          // Update pose results for skeleton drawing and model status
          setPoseResults(detectorRef.current.getLandmarks());
          setModelReady(detectorRef.current.isReady());
        }

        animationRef.current = requestAnimationFrame(animate);
      };

      console.log('Starting pose detection animation loop');
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameraEnabled, isTracking, videoReady, videoDimensions]);

  // Draw pose landmarks and connections on canvas
  useEffect(() => {
    if (!showSkeleton) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    let frameId: number;
    const draw = () => {
      const pose = detectorRef.current?.getLandmarks();
      if (pose && canvasRef.current && videoDimensions.width > 0) {
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const canvas = canvasRef.current;
        if (canvas.width !== videoDimensions.width || canvas.height !== videoDimensions.height) {
          canvas.width = videoDimensions.width;
          canvas.height = videoDimensions.height;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const mirroredPose = pose.map((lm) => ({ ...lm, x: 1 - lm.x }));

        const connections = hideUnimportant
          ? POSE_CONNECTIONS.filter(([a, b]) =>
              !UNIMPORTANT_LANDMARKS.includes(a) && !UNIMPORTANT_LANDMARKS.includes(b)
            )
          : POSE_CONNECTIONS;

        const landmarksToDraw = hideUnimportant
          ? mirroredPose.filter((_, idx) => !UNIMPORTANT_LANDMARKS.includes(idx))
          : mirroredPose;

        if (drawConnectors && drawLandmarks) {
          drawConnectors(ctx, mirroredPose, connections, {
            color: '#00FF00',
            lineWidth: 3,
          });
          drawLandmarks(ctx, landmarksToDraw, {
            color: '#FF0000',
            lineWidth: 2,
          });
        }

        mirroredPose.forEach((lm, idx) => {
          if (hideUnimportant && UNIMPORTANT_LANDMARKS.includes(idx)) return;
          const x = lm.x * canvas.width;
          const y = lm.y * canvas.height;
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '10px Arial';
          ctx.fillText(POSE_LANDMARK_NAMES[idx] || `${idx}`, x + 4, y - 4);
        });

        if (drawLandmarks) {
          [11, 12].forEach((i) =>
            drawLandmarks!(ctx, [mirroredPose[i]], { color: '#FF00FF', radius: 6 })
          );
          [23, 24].forEach((i) =>
            drawLandmarks!(ctx, [mirroredPose[i]], { color: '#00FFFF', radius: 6 })
          );
        }

        const avgConfidence = pose.reduce((sum, kp) => sum + (kp.visibility ?? 0.5), 0) / pose.length;

        const overlayY = canvas.height - 55;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(5, overlayY, 220, 50);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`Confidence: ${(avgConfidence * 100).toFixed(1)}%`, 10, overlayY + 20);
        ctx.fillText(`Model: ${modelReady ? 'Ready' : 'Loading...'}`, 10, overlayY + 40);
      } else if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [showSkeleton, videoDimensions, hideUnimportant, modelReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      detectorRef.current?.cleanup();
    };
  }, []);

  return (
    <Card className="p-6 bg-white shadow-xl">
      <div className="space-y-6">
        {/* Camera Section */}
        <div className="relative">
          <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative max-w-xl mx-auto max-h-[50vh]">
            {cameraEnabled ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform"
                  style={{
                    transform: `scale(${zoom[0]}) scaleX(-1)`,
                    transformOrigin: 'center center'
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  style={{
                    transform: `scale(${zoom[0]})`,
                    transformOrigin: 'center center',
                    display: showSkeleton ? 'block' : 'none',
                    border: showSkeleton ? '2px solid red' : 'none' // Debug border
                  }}
                />
                {/* Status Overlay */}
                <div className="absolute top-4 left-4 space-y-2">
                  <Badge variant={status === 'tracking' ? 'default' : 'secondary'}>
                    {status === 'tracking' ? 'Tracking aktiv' : 
                     status === 'paused' ? 'Pausiert' : 'Bereit'}
                  </Badge>
                  <Badge variant="outline" className="bg-white/90">
                    Video: {videoReady ? `${videoDimensions.width}x${videoDimensions.height}` : 'Lädt...'}
                  </Badge>
                  <Badge variant="outline" className="bg-white/90">
                    Model: {modelReady ? 'Bereit' : 'Lädt...'}
                  </Badge>
                  {poseResults && (
                    <Badge variant="outline" className="bg-green-100">
                      Pose: {poseResults.length} Punkte erkannt
                    </Badge>
                  )}
                  <Badge variant="outline" className="bg-white/90">
                    Skelett: {showSkeleton ? 'AN' : 'AUS'}
                  </Badge>
                  {isTracking && (
                    <Badge variant="outline" className="bg-white/90">
                      Zeit: {formatTime(sessionTime)}
                    </Badge>
                  )}
                </div>
                
                {/* Count Display */}
                <div className="absolute top-4 right-4">
                  <div className="bg-gradient-to-r from-orange-500 to-pink-600 text-white px-6 py-3 rounded-full">
                    <span className="text-3xl font-bold">{count}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-white">
                <div className="text-center">
                  <CameraOff className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Kamera nicht aktiviert</p>
                  <p className="text-sm opacity-75">Klicke auf "Kamera aktivieren" um zu beginnen</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Camera Controls */}
        {cameraEnabled && (
          <div className="space-y-4">
            {/* Zoom Control */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <ZoomOut className="h-4 w-4 text-gray-600" />
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Zoom: {zoom[0].toFixed(1)}x
                </label>
                <Slider
                  value={zoom}
                  onValueChange={setZoom}
                  max={3}
                  min={0.5}
                  step={0.1}
                  className="w-full"
                />
              </div>
              <ZoomIn className="h-4 w-4 text-gray-600" />
            </div>

            {cameraZoomSupported && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <ZoomOut className="h-4 w-4 text-gray-600" />
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Geräte-Zoom: {cameraZoom[0].toFixed(1)}x
                  </label>
                  <Slider
                    value={cameraZoom}
                    onValueChange={setCameraZoom}
                    max={cameraZoomRange.max}
                    min={cameraZoomRange.min}
                    step={0.1}
                    className="w-full"
                  />
                </div>
                <ZoomIn className="h-4 w-4 text-gray-600" />
              </div>
            )}

            {/* Skeleton Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                {showSkeleton ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                <label className="text-sm font-medium text-gray-700">
                  Pose-Erkennung anzeigen
                </label>
              </div>
              <Switch
                checked={showSkeleton}
                onCheckedChange={setShowSkeleton}
              />
            </div>

            {/* Hide Unimportant Points Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Slash className="h-4 w-4" />
                <label className="text-sm font-medium text-gray-700">
                  Unwichtige Punkte ausblenden
                </label>
              </div>
              <Switch
                checked={hideUnimportant}
                onCheckedChange={setHideUnimportant}
              />
            </div>
          </div>
        )}

        {/* Main Controls */}
        <div className="flex items-center justify-center gap-4">
          {!cameraEnabled ? (
            <Button 
              onClick={enableCamera}
              className="bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-600 hover:to-pink-700"
            >
              <Camera className="h-4 w-4 mr-2" />
              Kamera aktivieren
            </Button>
          ) : (
            <>
              <Button 
                variant="outline" 
                onClick={disableCamera}
              >
                <CameraOff className="h-4 w-4 mr-2" />
                Kamera aus
              </Button>
              
              {status === 'ready' && videoReady && modelReady && (
                <Button 
                  onClick={startTracking}
                  className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
              )}
              
              {status === 'ready' && (!videoReady || !modelReady) && (
                <Button 
                  disabled
                  variant="outline"
                >
                  {!videoReady ? 'Video lädt...' : 'Model lädt...'}
                </Button>
              )}
              
              {status === 'tracking' && (
                <Button 
                  onClick={() => {
                    setIsTracking(false);
                    setStatus('paused');
                  }}
                  variant="outline"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              )}
              
              {(status === 'tracking' || status === 'paused') && (
                <Button 
                  onClick={stopTracking}
                  variant="destructive"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              )}
              
              {status === 'paused' && (
                <Button 
                  onClick={() => {
                    setIsTracking(true);
                    setStatus('tracking');
                  }}
                  className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Fortsetzen
                </Button>
              )}
            </>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Anleitung:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Positioniere dich so, dass dein ganzer Körper sichtbar ist</li>
            <li>• Warte bis das Pose-Modell geladen ist (Status: "Model: Bereit")</li>
            <li>• Nutze den Zoom-Slider um die Kameraansicht anzupassen</li>
            <li>• Schalte die Pose-Erkennung ein um zu sehen was das System erkennt</li>
            <li>• Rote/gelbe Punkte zeigen erkannte Körperteile, grüne Linien das Skelett</li>
            <li>• Magenta Punkte = Schultern, Cyan Punkte = Hüfte (wichtig für Liegestützen)</li>
            <li>• Aktivere "Unwichtige Punkte ausblenden" um Gesicht und Finger zu verbergen</li>
            <li>• Gezählt wird nur, wenn mindestens ein Beinpunkt (Knie oder Fuß) sichtbar ist</li>
            <li>• Führe Liegestützen mit klaren Auf- und Abwärtsbewegungen aus</li>
            <li>• Für beste Ergebnisse sorge für gute Beleuchtung und einen ruhigen Hintergrund</li>
          </ul>
        </div>
      </div>
    </Card>
  );
};

export default PushupTracker;
