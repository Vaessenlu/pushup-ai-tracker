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
import { drawCustomConnectors, drawCustomLandmarks } from '@/lib/drawing';
import { POSE_CONNECTIONS } from '@/lib/poseConstants';
import { UNIMPORTANT_LANDMARKS, PushupState } from '@/lib/PushupDetector';
import { SquatState } from '@/lib/SquatDetector';
import { useCamera } from '@/hooks/useCamera';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { useExerciseDetector } from '@/hooks/useExerciseDetector';
import TrackingControls from '@/components/TrackingControls';
import type { NormalizedLandmark } from '@mediapipe/pose';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

  const {
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
  } = useCamera();
  const { sessionTime, start: startTimer, pause: pauseTimer, reset: resetTimer } = useSessionTimer();
  const {
    detect,
    poseResults,
    poseType,
    pushupCount: count,
    squatCount,
    modelReady,
    pushupDetectorRef,
    squatDetectorRef,
    reset,
  } = useExerciseDetector();

  const [status, setStatus] = useState<'ready' | 'tracking' | 'paused'>('ready');
  const [zoom, setZoom] = useState<number[]>([1]);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showRelevantPoints, setShowRelevantPoints] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [showAngles, setShowAngles] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [heightFeedback, setHeightFeedback] = useState('');
  
  const { toast } = useToast();

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (cameraEnabled && overlayRef.current && !document.fullscreenElement) {
      overlayRef.current
        .requestFullscreen()
        .catch((err) => console.error('Failed to enter fullscreen', err));
    }
  }, [cameraEnabled]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // detectors are handled by useExerciseDetector hook

  // Handle video metadata loaded
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      console.log('Video metadata loaded:', video.videoWidth, 'x', video.videoHeight);
      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      setVideoReady(true);
      
      if (canvasRef.current && overlayRef.current) {
        const rect = overlayRef.current.getBoundingClientRect();
        canvasRef.current.width = rect.width;
        canvasRef.current.height = rect.height;
        console.log('Canvas size set to:', rect.width, 'x', rect.height);
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


    reset();
    resetTimer();
    startTimer();
    setIsTracking(true);
    setStatus('tracking');
    
    toast({
      title: "Tracking gestartet",
      description: "Beginne mit deinen Liegestützen!",
    });
  }, [cameraEnabled, videoReady, modelReady, setIsTracking, toast, resetTimer, startTimer, reset]);

  const pauseTracking = useCallback(() => {
    pauseTimer();
    setIsTracking(false);
    setStatus('paused');
  }, [setIsTracking, pauseTimer]);

  const handleStart = useCallback(() => {
    if (status === 'paused') {
      setIsTracking(true);
      setStatus('tracking');
      startTimer();
    } else {
      startTracking();
    }
  }, [status, startTracking, setIsTracking, startTimer]);

  const handleDisableCamera = useCallback(() => {
    disableCamera();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsTracking(false);
    setStatus('ready');
  }, [disableCamera, setIsTracking]);

  const stopTracking = useCallback(async () => {
    pauseTimer();
    const duration = sessionTime;
    const avgTimePerRepPushup = count > 0 ? duration / count : 0;
    const avgTimePerRepSquat = squatCount > 0 ? duration / squatCount : 0;

    if (count > 0) {

      onSessionComplete({
        date: new Date(),
        count,
        duration,
        avgTimePerRep: avgTimePerRepPushup,
        exercise: 'pushup',
      });

      toast({
        title: "Session beendet!",
        description: `${count} Liegestützen in ${duration}s absolviert!`,
      });
    }

    if (squatCount > 0) {

      onSessionComplete({
        date: new Date(),
        count: squatCount,
        duration,
        avgTimePerRep: avgTimePerRepSquat,
        exercise: 'squat',
      });

      toast({
        title: 'Session beendet!',
        description: `${squatCount} Kniebeugen in ${duration}s absolviert!`,
      });
    }

    setIsTracking(false);
    setStatus('ready');
    reset();
    resetTimer();
  }, [count, squatCount, onSessionComplete, setIsTracking, toast, pauseTimer, resetTimer, sessionTime, reset]);

  // Animation loop for pose detection
  useEffect(() => {
    if (cameraEnabled && videoRef.current && videoReady && videoDimensions.width > 0) {
      const animate = async () => {
        if (videoRef.current) {
          await detect(videoRef.current);

          const type = poseType;
          if (type === 'pushup' && pushupDetectorRef.current) {
            const state = pushupDetectorRef.current.getState();
            const angle = pushupDetectorRef.current.getLastAngle();
            const upT = pushupDetectorRef.current.getUpAngleThreshold();
            const downT = pushupDetectorRef.current.getDownAngleThreshold();
            if (state === PushupState.Down) {
              setHeightFeedback(angle < downT ? 'Tief genug' : 'Tiefer');
            } else if (state === PushupState.Up) {
              setHeightFeedback(angle > upT ? 'Hoch genug' : 'Höher');
            } else {
              setHeightFeedback('');
            }
          } else if (type === 'squat' && squatDetectorRef.current) {
            const state = squatDetectorRef.current.getState();
            const angle = squatDetectorRef.current.getLastAngle();
            const upT = squatDetectorRef.current.getUpAngleThreshold();
            const downT = squatDetectorRef.current.getDownAngleThreshold();
            if (state === SquatState.Down) {
              setHeightFeedback(angle < downT ? 'Tief genug' : 'Tiefer');
            } else if (state === SquatState.Up) {
              setHeightFeedback(angle > upT ? 'Hoch genug' : 'Höher');
            } else {
              setHeightFeedback('');
            }
          } else {
            setHeightFeedback('');
          }
        }

        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameraEnabled, videoReady, videoDimensions, detect, poseType]);

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
      const pose = poseResults;
      if (pose && canvasRef.current && videoDimensions.width > 0) {
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const canvas = canvasRef.current;
        const { clientWidth, clientHeight } = canvas;
        if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
          canvas.width = clientWidth;
          canvas.height = clientHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const mirroredPose = pose.map((lm) => ({ ...lm, x: 1 - lm.x }));

        const connections = showRelevantPoints
          ? POSE_CONNECTIONS.filter(([a, b]) =>
              !UNIMPORTANT_LANDMARKS.includes(a) && !UNIMPORTANT_LANDMARKS.includes(b)
            )
          : POSE_CONNECTIONS;

        const landmarksToDraw = showRelevantPoints
          ? mirroredPose.filter((_, idx) => !UNIMPORTANT_LANDMARKS.includes(idx))
          : mirroredPose;

        const scale = Math.max(
          canvas.width / videoDimensions.width,
          canvas.height / videoDimensions.height
        );
        const offsetX = (videoDimensions.width * scale - canvas.width) / 2;
        const offsetY = (videoDimensions.height * scale - canvas.height) / 2;

        if (showLines) {
          drawCustomConnectors(
            ctx,
            mirroredPose,
            connections,
            '#00FF00',
            5,
            canvas,
            videoDimensions.width,
            videoDimensions.height
          );
        }
        drawCustomLandmarks(
          ctx,
          landmarksToDraw,
          '#00FF00',
          8,
          canvas,
          videoDimensions.width,
          videoDimensions.height
        );

        if (showAngles) {
          const calculateAngle = (
            a: NormalizedLandmark,
            b: NormalizedLandmark,
            c: NormalizedLandmark
          ) => {
            const ab = { x: a.x - b.x, y: a.y - b.y };
            const cb = { x: c.x - b.x, y: c.y - b.y };
            const dot = ab.x * cb.x + ab.y * cb.y;
            const magAB = Math.hypot(ab.x, ab.y);
            const magCB = Math.hypot(cb.x, cb.y);
            const angle = Math.acos(dot / (magAB * magCB));
            return (angle * 180) / Math.PI;
          };

          const leftAngle = calculateAngle(
            mirroredPose[11],
            mirroredPose[13],
            mirroredPose[15]
          );
          const rightAngle = calculateAngle(
            mirroredPose[12],
            mirroredPose[14],
            mirroredPose[16]
          );

          ctx.fillStyle = '#00FF00';
          ctx.font = '10px Arial';
          ctx.fillText(
            `${Math.round(leftAngle)}`,
            mirroredPose[13].x * videoDimensions.width * scale - offsetX + 4,
            mirroredPose[13].y * videoDimensions.height * scale - offsetY - 4
          );
          ctx.fillText(
            `${Math.round(rightAngle)}`,
            mirroredPose[14].x * videoDimensions.width * scale - offsetX + 4,
            mirroredPose[14].y * videoDimensions.height * scale - offsetY - 4
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
  }, [showSkeleton, videoDimensions, showRelevantPoints, showLines, showAngles, modelReady, poseResults]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      pushupDetectorRef.current?.cleanup();
      squatDetectorRef.current?.cleanup();
    };
  }, []);

  return (
    <Card className="p-6 bg-white shadow-xl">
      <div className="space-y-6">
        {/* Camera Section */}
        <div className="relative">
          <div
            ref={overlayRef}
            className={`bg-gray-900 overflow-hidden relative ${
              cameraEnabled
                ? 'fixed inset-0 z-50'
                : 'aspect-video rounded-lg max-w-xl mx-auto max-h-[50vh]'
            }`}
            style={cameraEnabled ? { width: viewport.width, height: viewport.height } : undefined}
          >
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
                  {poseType !== 'unknown' && (
                    <Badge variant="outline" className="bg-white/90">
                      Pose: {poseType === 'pushup' ? 'Liegestütz' : 'Kniebeuge'}
                    </Badge>
                  )}
                  {heightFeedback && (
                    <Badge variant="outline" className="bg-white/90">
                      {heightFeedback}
                    </Badge>
                  )}
                  {isTracking && (
                    <Badge variant="outline" className="bg-white/90">
                      Zeit: {formatTime(sessionTime)}
                    </Badge>
                  )}
                </div>

                {/* Count Display */}
                <div className="absolute top-4 right-4 space-y-2 text-right">
                  <div className="bg-gradient-to-r from-orange-500 to-pink-600 text-white px-6 py-1 rounded-full">
                    <span className="text-lg font-bold">{count} Pushups</span>
                  </div>
                  <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-1 rounded-full">
                    <span className="text-lg font-bold">{squatCount} Squats</span>
                  </div>
                </div>

                {/* Pose Controls */}
                <div className="absolute bottom-4 left-4 space-y-2 bg-black/60 p-3 rounded-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {showSkeleton ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      <span className="text-sm">Pose-Erkennung</span>
                    </div>
                    <Switch checked={showSkeleton} onCheckedChange={setShowSkeleton} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Slash className="h-4 w-4" />
                      <span className="text-sm">Relevante Punkte</span>
                    </div>
                    <Switch checked={showRelevantPoints} onCheckedChange={setShowRelevantPoints} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Slash className="h-4 w-4" />
                      <span className="text-sm">Linien</span>
                    </div>
                    <Switch checked={showLines} onCheckedChange={setShowLines} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Slash className="h-4 w-4" />
                      <span className="text-sm">Winkel</span>
                    </div>
                    <Switch checked={showAngles} onCheckedChange={setShowAngles} />
                  </div>
                </div>

                {/* Stop Button */}
                <Button
                  onClick={() => {
                    stopTracking();
                    disableCamera();
                  }}
                  variant="destructive"
                  className="absolute bottom-4 right-4 z-10"
                >
                  <Square className="h-4 w-4 mr-2" /> Stop
                </Button>
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
                onClick={handleDisableCamera}
              >
                <CameraOff className="h-4 w-4 mr-2" />
                Kamera aus
              </Button>

              {status === 'ready' && (!videoReady || !modelReady) && (
                <Button disabled variant="outline">
                  {!videoReady ? 'Video lädt...' : 'Model lädt...'}
                </Button>
              )}

              {videoReady && modelReady && (
                <TrackingControls
                  status={status}
                  onStart={handleStart}
                  onPause={pauseTracking}
                  onReset={stopTracking}
                />
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
            <li>• Grüne Punkte markieren erkannte Körperteile</li>
            <li>• Aktiviere "Relevante Punkte" um nur wichtige Bereiche zu sehen</li>
            <li>• Führe Liegestützen mit klaren Auf- und Abwärtsbewegungen aus</li>
            <li>• Strecke die Arme ganz durch, damit eine Wiederholung gewertet wird</li>
            <li>• Für beste Ergebnisse sorge für gute Beleuchtung und einen ruhigen Hintergrund</li>
          </ul>
        </div>
      </div>
    </Card>
  );
};

export default PushupTracker;
