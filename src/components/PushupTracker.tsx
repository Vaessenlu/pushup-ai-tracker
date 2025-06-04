
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Play, Pause, Square, Camera, CameraOff, ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Session } from '@/pages/Index';
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// Enhanced PushupDetector with real MediaPipe integration
class PushupDetector {
  private lastShoulderY: number = 0;
  private lastHipY: number = 0;
  private isDown: boolean = false;
  private count: number = 0;
  private threshold: number = 0.05; // Normalized coordinate threshold
  private pose: Pose | null = null;
  private landmarks: any[] = [];
  private onPoseResults: ((results: any) => void) | null = null;

  constructor() {
    this.initializePose();
  }

  private async initializePose() {
    try {
      this.pose = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
      });

      this.pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.pose.onResults((results) => {
        this.processResults(results);
        if (this.onPoseResults) {
          this.onPoseResults(results);
        }
      });

      console.log('MediaPipe Pose initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MediaPipe Pose:', error);
    }
  }

  setOnPoseResults(callback: (results: any) => void) {
    this.onPoseResults = callback;
  }

  async detect(videoElement: HTMLVideoElement): Promise<number> {
    if (this.pose && videoElement.readyState >= 2) {
      try {
        await this.pose.send({ image: videoElement });
      } catch (error) {
        console.error('Pose detection error:', error);
      }
    }
    return this.count;
  }

  private processResults(results: any) {
    if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
      return;
    }

    this.landmarks = results.poseLandmarks;

    // Get key landmarks for pushup detection
    const leftShoulder = results.poseLandmarks[11];  // Left shoulder
    const rightShoulder = results.poseLandmarks[12]; // Right shoulder
    const leftHip = results.poseLandmarks[23];       // Left hip
    const rightHip = results.poseLandmarks[24];      // Right hip

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
      return;
    }

    // Calculate average shoulder and hip Y positions
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;

    // Check visibility (confidence)
    const shoulderVisibility = (leftShoulder.visibility + rightShoulder.visibility) / 2;
    const hipVisibility = (leftHip.visibility + rightHip.visibility) / 2;

    if (shoulderVisibility < 0.5 || hipVisibility < 0.5) {
      return; // Not enough confidence in pose detection
    }

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

  cleanup() {
    if (this.pose) {
      this.pose.close();
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
  const [poseResults, setPoseResults] = useState<any>(null);
  
  const { toast } = useToast();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Set up pose results callback
  useEffect(() => {
    detectorRef.current.setOnPoseResults((results) => {
      setPoseResults(results);
    });
  }, []);

  // Separate useEffect to handle video stream assignment
  useEffect(() => {
    if (streamRef.current && videoRef.current && cameraEnabled) {
      console.log('Assigning stream to video element...');
      
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      
      const handleLoadedMetadata = () => {
        console.log('Video metadata loaded, starting playback...');
        video.play()
          .then(() => {
            console.log('Video playback started successfully');
            setVideoReady(true);
            toast({
              title: "Kamera aktiviert",
              description: "Positioniere dich so, dass dein ganzer Körper sichtbar ist.",
            });
          })
          .catch((error) => {
            console.error('Video play failed:', error);
            setVideoReady(false);
          });
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      
      // If metadata is already loaded
      if (video.readyState >= 1) {
        handleLoadedMetadata();
      }

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [cameraEnabled, toast]);

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
    if (!cameraEnabled || !videoReady) {
      toast({
        title: "Kamera erforderlich",
        description: "Bitte aktiviere zuerst die Kamera und warte bis das Video geladen ist.",
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
  }, [cameraEnabled, videoReady, setIsTracking, toast]);

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
    if (isTracking && videoRef.current && videoReady) {
      const animate = async () => {
        if (videoRef.current && detectorRef.current) {
          const newCount = await detectorRef.current.detect(videoRef.current);
          setCount(newCount);
          
          // Update session time
          const currentTime = Math.round((Date.now() - startTimeRef.current) / 1000);
          setSessionTime(currentTime);
        }
        
        if (isTracking) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };
      
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isTracking, videoReady]);

  // Draw pose landmarks and connections on canvas
  useEffect(() => {
    if (showSkeleton && poseResults && canvasRef.current && videoRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Set canvas size to match video
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (poseResults.poseLandmarks && poseResults.poseLandmarks.length > 0) {
        // Draw pose connections (skeleton lines)
        drawConnectors(ctx, poseResults.poseLandmarks, POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 2
        });

        // Draw pose landmarks (key points)
        drawLandmarks(ctx, poseResults.poseLandmarks, {
          color: '#FF0000',
          radius: 4,
          fillColor: '#FFFF00'
        });

        // Draw key points for pushup detection with special colors
        const keyPoints = [
          { index: 11, color: '#FF00FF', label: 'L Shoulder' }, // Left shoulder
          { index: 12, color: '#FF00FF', label: 'R Shoulder' }, // Right shoulder
          { index: 23, color: '#00FFFF', label: 'L Hip' },      // Left hip
          { index: 24, color: '#00FFFF', label: 'R Hip' },      // Right hip
        ];

        keyPoints.forEach(point => {
          const landmark = poseResults.poseLandmarks[point.index];
          if (landmark && landmark.visibility > 0.5) {
            const x = landmark.x * canvas.width;
            const y = landmark.y * canvas.height;
            
            // Draw larger circle for key detection points
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = point.color;
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw label
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '12px Arial';
            ctx.fillText(point.label, x + 10, y - 10);
          }
        });

        // Draw confidence indicator
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px Arial';
        const avgConfidence = poseResults.poseLandmarks.reduce((sum: number, landmark: any) => 
          sum + (landmark.visibility || 0), 0) / poseResults.poseLandmarks.length;
        ctx.fillText(`Pose Confidence: ${(avgConfidence * 100).toFixed(1)}%`, 10, 30);
      }
    }
  }, [showSkeleton, poseResults]);

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
                    display: showSkeleton ? 'block' : 'none'
                  }}
                />
                {/* Status Overlay */}
                <div className="absolute top-4 left-4 space-y-2">
                  <Badge variant={status === 'tracking' ? 'default' : 'secondary'}>
                    {status === 'tracking' ? 'Tracking aktiv' : 
                     status === 'paused' ? 'Pausiert' : 'Bereit'}
                  </Badge>
                  <Badge variant="outline" className="bg-white/90">
                    Video: {videoReady ? 'Bereit' : 'Lädt...'}
                  </Badge>
                  {poseResults && poseResults.poseLandmarks && (
                    <Badge variant="outline" className="bg-white/90">
                      Pose: {poseResults.poseLandmarks.length > 0 ? 'Erkannt' : 'Nicht erkannt'}
                    </Badge>
                  )}
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
              
              {status === 'ready' && videoReady && (
                <Button 
                  onClick={startTracking}
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
              )}
              
              {status === 'ready' && !videoReady && (
                <Button 
                  disabled
                  variant="outline"
                >
                  Video lädt...
                </Button>
              )}
              
              {status === 'tracking' && (
                <Button 
                  onClick={pauseTracking}
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
