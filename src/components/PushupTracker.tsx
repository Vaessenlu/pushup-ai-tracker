import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Play, Pause, Square, Camera, CameraOff, ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Session } from '@/pages/Index';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

// Enhanced PushupDetector with TensorFlow.js PoseNet
class PushupDetector {
  private lastShoulderY: number = 0;
  private lastHipY: number = 0;
  private isDown: boolean = false;
  private count: number = 0;
  private threshold: number = 0.05;
  private detector: poseDetection.PoseDetector | null = null;
  private isInitialized: boolean = false;
  private landmarks: any[] = [];
  private onPoseResults: ((results: any) => void) | null = null;

  constructor() {
    this.initializePose();
  }

  private async initializePose() {
    try {
      console.log('Initializing TensorFlow.js backend...');
      await tf.setBackend('webgl');
      await tf.ready();
      
      console.log('Creating pose detector...');
      const model = poseDetection.SupportedModels.PoseNet;
      const detectorConfig: poseDetection.PosenetModelConfig = {
        quantBytes: 4,
        architecture: 'MobileNetV1' as poseDetection.PoseNetArchitecture,
        outputStride: 16,
        inputResolution: { width: 640, height: 480 },
        multiplier: 0.75
      };
      
      this.detector = await poseDetection.createDetector(model, detectorConfig);
      this.isInitialized = true;
      console.log('TensorFlow.js PoseNet initialized successfully');
    } catch (error) {
      console.error('Failed to initialize TensorFlow.js PoseNet:', error);
      this.isInitialized = false;
    }
  }

  setOnPoseResults(callback: (results: any) => void) {
    this.onPoseResults = callback;
  }

  async detect(videoElement: HTMLVideoElement): Promise<number> {
    if (this.detector && this.isInitialized && videoElement.readyState >= 2) {
      // Check if video has valid dimensions
      if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        console.log('Video dimensions not ready yet');
        return this.count;
      }

      try {
        console.log('Detecting poses on video with dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
        const poses = await this.detector.estimatePoses(videoElement);
        console.log('Poses detected:', poses.length);
        this.processResults(poses);
        if (this.onPoseResults) {
          this.onPoseResults(poses);
        }
      } catch (error) {
        console.error('Pose detection error:', error);
        if ((error as Error).message && (error as Error).message.includes('roi width cannot be 0')) {
          console.warn('Reinitializing pose detector due to ROI error');
          await this.initializePose();
        }
      }
    }
    return this.count;
  }

  private processResults(poses: any[]) {
    if (!poses || poses.length === 0) {
      this.landmarks = [];
      return;
    }

    const pose = poses[0]; // Use first detected pose
    if (!pose.keypoints || pose.keypoints.length === 0) {
      this.landmarks = [];
      return;
    }

    this.landmarks = pose.keypoints;

    // Get key landmarks for pushup detection (PoseNet keypoint indices)
    const leftShoulder = pose.keypoints.find((kp: any) => kp.name === 'left_shoulder');
    const rightShoulder = pose.keypoints.find((kp: any) => kp.name === 'right_shoulder');
    const leftHip = pose.keypoints.find((kp: any) => kp.name === 'left_hip');
    const rightHip = pose.keypoints.find((kp: any) => kp.name === 'right_hip');

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
      return;
    }

    // Check confidence (score)
    const shoulderConfidence = (leftShoulder.score + rightShoulder.score) / 2;
    const hipConfidence = (leftHip.score + rightHip.score) / 2;

    if (shoulderConfidence < 0.3 || hipConfidence < 0.3) {
      return; // Not enough confidence in pose detection
    }

    // Calculate average shoulder and hip Y positions (normalized to video height)
    const videoHeight = 480; // Default height
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / (2 * videoHeight);
    const avgHipY = (leftHip.y + rightHip.y) / (2 * videoHeight);

    if (this.lastShoulderY === 0) {
      this.lastShoulderY = avgShoulderY;
      this.lastHipY = avgHipY;
      return;
    }

    // Calculate movement (positive = moving down, negative = moving up)
    const shoulderMovement = avgShoulderY - this.lastShoulderY;
    const hipMovement = avgHipY - this.lastHipY;
    const avgMovement = (shoulderMovement + hipMovement) / 2;

    // Detect downward movement (going down in pushup)
    if (avgMovement > this.threshold && !this.isDown) {
      this.isDown = true;
      console.log('Going down');
    }
    
    // Detect upward movement (coming up from pushup)
    if (avgMovement < -this.threshold && this.isDown) {
      this.isDown = false;
      this.count++;
      console.log(`Pushup completed! Count: ${this.count}`);
    }

    this.lastShoulderY = avgShoulderY;
    this.lastHipY = avgHipY;
  }

  reset() {
    this.count = 0;
    this.lastShoulderY = 0;
    this.lastHipY = 0;
    this.isDown = false;
    this.landmarks = [];
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
    if (this.detector) {
      this.detector.dispose();
    }
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
  const [poseResults, setPoseResults] = useState<any[]>([]);
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
      console.log('Pose results received:', results.length);
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
    if (showSkeleton && poseResults && poseResults.length > 0 && canvasRef.current && videoDimensions.width > 0) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const canvas = canvasRef.current;
      
      // Ensure canvas has correct dimensions
      if (canvas.width !== videoDimensions.width || canvas.height !== videoDimensions.height) {
        canvas.width = videoDimensions.width;
        canvas.height = videoDimensions.height;
        console.log('Canvas resized to:', videoDimensions.width, 'x', videoDimensions.height);
      }

      // Clear canvas with semi-transparent background for visibility
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      console.log('Drawing poses:', poseResults.length);
      const pose = poseResults[0];
      if (pose && pose.keypoints && pose.keypoints.length > 0) {
        console.log('Drawing', pose.keypoints.length, 'keypoints');

        // Define pose connections (skeleton lines)
        const connections = [
          ['nose', 'left_eye'], ['nose', 'right_eye'],
          ['left_eye', 'left_ear'], ['right_eye', 'right_ear'],
          ['left_shoulder', 'right_shoulder'],
          ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
          ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
          ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
          ['left_hip', 'right_hip'],
          ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
          ['right_hip', 'right_knee'], ['right_knee', 'right_ankle']
        ];

        // Draw skeleton connections
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 3;
        connections.forEach(([pointA, pointB]) => {
          const keypointA = pose.keypoints.find((kp: any) => kp.name === pointA);
          const keypointB = pose.keypoints.find((kp: any) => kp.name === pointB);
          
          if (keypointA && keypointB && keypointA.score > 0.3 && keypointB.score > 0.3) {
            ctx.beginPath();
            ctx.moveTo(keypointA.x, keypointA.y);
            ctx.lineTo(keypointB.x, keypointB.y);
            ctx.stroke();
          }
        });

        // Draw all keypoints
        pose.keypoints.forEach((keypoint: any) => {
          if (keypoint.score > 0.3) {
            ctx.beginPath();
            ctx.arc(keypoint.x, keypoint.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#FF0000';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });

        // Highlight key points for pushup detection
        const keyPoints = [
          { name: 'left_shoulder', color: '#FF00FF', label: 'L Shoulder' },
          { name: 'right_shoulder', color: '#FF00FF', label: 'R Shoulder' },
          { name: 'left_hip', color: '#00FFFF', label: 'L Hip' },
          { name: 'right_hip', color: '#00FFFF', label: 'R Hip' },
        ];

        keyPoints.forEach(point => {
          const keypoint = pose.keypoints.find((kp: any) => kp.name === point.name);
          if (keypoint && keypoint.score > 0.3) {
            // Draw larger circle for key detection points
            ctx.beginPath();
            ctx.arc(keypoint.x, keypoint.y, 10, 0, 2 * Math.PI);
            ctx.fillStyle = point.color;
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw label with background
            ctx.fillStyle = '#000000';
            ctx.fillRect(keypoint.x + 12, keypoint.y - 20, 70, 20);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(point.label, keypoint.x + 15, keypoint.y - 5);
          }
        });

        // Draw confidence indicator with background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(5, 5, 250, 70);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Arial';
        const avgConfidence = pose.keypoints.reduce((sum: number, kp: any) => 
          sum + kp.score, 0) / pose.keypoints.length;
        ctx.fillText(`Pose Confidence: ${(avgConfidence * 100).toFixed(1)}%`, 10, 25);
        ctx.fillText(`Model: ${modelReady ? 'Ready' : 'Loading...'}`, 10, 45);
        ctx.fillText(`Keypoints: ${pose.keypoints.length}`, 10, 65);
        
        console.log('Pose drawn successfully with confidence:', (avgConfidence * 100).toFixed(1) + '%');
      }
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
                  {poseResults && poseResults.length > 0 && (
                    <Badge variant="outline" className="bg-green-100">
                      Pose: {poseResults[0]?.keypoints?.length || 0} Punkte erkannt
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
