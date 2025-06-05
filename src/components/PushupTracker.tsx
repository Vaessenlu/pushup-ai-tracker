import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Play, Pause, Square, Camera, CameraOff, ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Session } from '@/pages/Index';
import { Pose, POSE_CONNECTIONS, Results as PoseResults, NormalizedLandmark, NormalizedLandmarkList } from '@mediapipe/pose';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const POSE_LANDMARK_NAMES = [
  'NOSE',
  'LEFT_EYE_INNER',
  'LEFT_EYE',
  'LEFT_EYE_OUTER',
  'RIGHT_EYE_INNER',
  'RIGHT_EYE',
  'RIGHT_EYE_OUTER',
  'LEFT_EAR',
  'RIGHT_EAR',
  'MOUTH_LEFT',
  'MOUTH_RIGHT',
  'LEFT_SHOULDER',
  'RIGHT_SHOULDER',
  'LEFT_ELBOW',
  'RIGHT_ELBOW',
  'LEFT_WRIST',
  'RIGHT_WRIST',
  'LEFT_PINKY',
  'RIGHT_PINKY',
  'LEFT_INDEX',
  'RIGHT_INDEX',
  'LEFT_THUMB',
  'RIGHT_THUMB',
  'LEFT_HIP',
  'RIGHT_HIP',
  'LEFT_KNEE',
  'RIGHT_KNEE',
  'LEFT_ANKLE',
  'RIGHT_ANKLE',
  'LEFT_HEEL',
  'RIGHT_HEEL',
  'LEFT_FOOT_INDEX',
  'RIGHT_FOOT_INDEX'
];

// Enhanced PushupDetector with TensorFlow.js PoseNet
class PushupDetector {
  private pose: Pose;
  private isDown = false;
  private count = 0;
  private landmarks: PoseResults['poseLandmarks'] | null = null;
  private isInitialized = false;
  private onPoseResults: ((results: PoseResults['poseLandmarks']) => void) | null = null;

  constructor() {
    this.pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    this.pose.setOptions({
      modelComplexity: 0,
      smoothLandmarks: true,
      enableSegmentation: false,
      selfieMode: true,
    });

    this.pose.onResults((results) => {
      if (results.poseLandmarks) {
        if (!this.isInitialized) this.isInitialized = true;
        this.landmarks = results.poseLandmarks;
        this.processLandmarks(results.poseLandmarks);
        if (this.onPoseResults) {
          this.onPoseResults(results.poseLandmarks);
        }
      }
    });
  }

  setOnPoseResults(callback: (results: PoseResults['poseLandmarks']) => void) {
    this.onPoseResults = callback;
  }

  async detect(videoElement: HTMLVideoElement): Promise<number> {
    if (!this.isInitialized) {
      // attempt to process frame to trigger initialization
      await this.pose.send({ image: videoElement });
      return this.count;
    }

    await this.pose.send({ image: videoElement });
    return this.count;
  }

  private calculateAngle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAB = Math.hypot(ab.x, ab.y);
    const magCB = Math.hypot(cb.x, cb.y);
    const angle = Math.acos(dot / (magAB * magCB));
    return (angle * 180) / Math.PI;
  }

  private processLandmarks(landmarks: NormalizedLandmarkList) {
    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];

    if (!leftShoulder || !leftElbow || !leftWrist || !rightShoulder || !rightElbow || !rightWrist) {
      return;
    }

    const leftAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgAngle = (leftAngle + rightAngle) / 2;

    if (avgAngle < 100 && !this.isDown) {
      this.isDown = true;
    }

    if (avgAngle > 160 && this.isDown) {
      this.isDown = false;
      this.count++;
    }
  }

  reset() {
    this.count = 0;
    this.isDown = false;
    this.landmarks = null;
  }

  getCount() {
    return this.count;
  }

  getLandmarks() {
    return this.landmarks;
  }

  isReady() {
    return this.isInitialized;
  }

  cleanup() {
    this.pose.reset();
  }
}

interface PushupTrackerProps {
  onSessionComplete: (session: Omit<Session, 'id'>) => void;
  isTracking: boolean;
  setIsTracking: (tracking: boolean) => void;
}

export const PushupTracker: React.FC<PushupTrackerProps> = ({
  onSessionComplete,
  isTracking,
  setIsTracking
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef(new PushupDetector());
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(0);

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [status, setStatus] = useState<'ready' | 'tracking' | 'paused'>('ready');
  const [videoReady, setVideoReady] = useState(false);
  const [count, setCount] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [zoom, setZoom] = useState([1]);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [poseResults, setPoseResults] = useState<PoseResults['poseLandmarks'] | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  
  const { toast } = useToast();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Set up pose results callback
  useEffect(() => {
    detectorRef.current.setOnPoseResults((results) => {
      console.log('Pose results received:', results ? results.length : 0);
      setPoseResults(results);
    });

    // Check if model is ready
    const checkModelReady = () => {
      if (detectorRef.current.isReady()) {
        setModelReady(true);
        console.log('Pose detection model ready');
      } else {
        setTimeout(checkModelReady, 1000);
      }
    };
    checkModelReady();
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

  const enableCamera = useCallback(async () => {
    try {
      console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });
      
      console.log('Camera stream obtained successfully');
      streamRef.current = stream;
      setCameraEnabled(true);
      
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
    setIsTracking(false);
    setStatus('ready');
  }, [setIsTracking]);

  const startTracking = useCallback(() => {
    if (!cameraEnabled || !videoReady || !modelReady) {
      toast({
        title: "System nicht bereit",
        description: "Bitte warte bis Kamera und Pose-Modell bereit sind.",
        variant: "destructive",
      });
      return;
    }

    detectorRef.current.reset();
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

  const stopTracking = useCallback(() => {
    const endTime = Date.now();
    const duration = Math.round((endTime - startTimeRef.current) / 1000);
    const avgTimePerRep = count > 0 ? duration / count : 0;

    if (count > 0) {
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
  }, [count, onSessionComplete, setIsTracking, toast]);

  // Animation loop for pose detection
  useEffect(() => {
    if ((isTracking || showSkeleton) && videoRef.current && videoReady && modelReady && videoDimensions.width > 0) {
      const animate = async () => {
        if (videoRef.current && detectorRef.current) {
          const newCount = await detectorRef.current.detect(videoRef.current);
          if (isTracking) {
            setCount(newCount);

            // Update session time
            const currentTime = Math.round((Date.now() - startTimeRef.current) / 1000);
            setSessionTime(currentTime);
          }
        }

        if (isTracking || showSkeleton) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };

      console.log('Starting pose detection animation loop');
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isTracking, showSkeleton, videoReady, modelReady, videoDimensions]);

  // Draw pose landmarks and connections on canvas
  useEffect(() => {
    if (showSkeleton && poseResults && canvasRef.current && videoDimensions.width > 0) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const canvas = canvasRef.current;

      if (canvas.width !== videoDimensions.width || canvas.height !== videoDimensions.height) {
        canvas.width = videoDimensions.width;
        canvas.height = videoDimensions.height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawConnectors(ctx, poseResults, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
      drawLandmarks(ctx, poseResults, { color: '#FF0000', lineWidth: 2 });

      poseResults.forEach((lm, idx) => {
        const x = lm.x * canvas.width;
        const y = lm.y * canvas.height;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px Arial';
        ctx.fillText(POSE_LANDMARK_NAMES[idx] || `${idx}`, x + 4, y - 4);
      });

      [11, 12].forEach(i => drawLandmarks(ctx, [poseResults[i]], { color: '#FF00FF', radius: 6 }));
      [23, 24].forEach(i => drawLandmarks(ctx, [poseResults[i]], { color: '#00FFFF', radius: 6 }));

      const avgConfidence = poseResults.reduce((sum, kp) => sum + (kp.visibility ?? 0.5), 0) / poseResults.length;

      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(5, 5, 220, 50);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`Confidence: ${(avgConfidence * 100).toFixed(1)}%`, 10, 25);
      ctx.fillText(`Model: ${modelReady ? 'Ready' : 'Loading...'}`, 10, 45);
    }
  }, [showSkeleton, poseResults, modelReady, videoDimensions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      detectorRef.current.cleanup();
    };
  }, []);

  return (
    <Card className="p-6 bg-white shadow-xl">
      <div className="space-y-6">
        {/* Camera Section */}
        <div className="relative">
          <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative">
            {cameraEnabled ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                  style={{ 
                    transform: `scale(${zoom[0]}) scaleX(-${zoom[0]})`,
                    transformOrigin: 'center center'
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  style={{ 
                    transform: `scale(${zoom[0]}) scaleX(-${zoom[0]})`,
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
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full">
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
          </div>
        )}

        {/* Main Controls */}
        <div className="flex items-center justify-center gap-4">
          {!cameraEnabled ? (
            <Button 
              onClick={enableCamera}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
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
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
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
                  onClick={() => {
                    const endTime = Date.now();
                    const duration = Math.round((endTime - startTimeRef.current) / 1000);
                    const avgTimePerRep = count > 0 ? duration / count : 0;

                    if (count > 0) {
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
                  }}
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
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
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
            <li>• Führe Liegestützen mit klaren Auf- und Abwärtsbewegungen aus</li>
            <li>• Für beste Ergebnisse sorge für gute Beleuchtung und einen ruhigen Hintergrund</li>
          </ul>
        </div>
      </div>
    </Card>
  );
};

export default PushupTracker;
