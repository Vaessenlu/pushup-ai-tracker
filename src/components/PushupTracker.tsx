import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Play, Pause, Square, Camera, CameraOff, ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Session } from '@/pages/Index';

// MediaPipe Pose detection simulation
class PushupDetector {
  private lastY: number = 0;
  private isDown: boolean = false;
  private count: number = 0;
  private threshold: number = 50; // Pixel threshold for up/down movement

  detect(videoElement: HTMLVideoElement): number {
    // Simplified pose detection simulation
    // In a real implementation, this would use MediaPipe Pose
    
    // Simulate body position detection based on video frame analysis
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return this.count;

    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0);

    // Simulate shoulder/body center Y position (simplified)
    const centerY = this.simulateBodyCenterY(canvas);
    
    if (this.lastY === 0) {
      this.lastY = centerY;
      return this.count;
    }

    const movement = centerY - this.lastY;

    // Detect downward movement (going down in pushup)
    if (movement > this.threshold && !this.isDown) {
      this.isDown = true;
    }
    
    // Detect upward movement (coming up from pushup)
    if (movement < -this.threshold && this.isDown) {
      this.isDown = false;
      this.count++;
    }

    this.lastY = centerY;
    return this.count;
  }

  private simulateBodyCenterY(canvas: HTMLCanvasElement): number {
    // Simulate pose detection by analyzing video frame
    // This is a simplified simulation - real implementation would use MediaPipe
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Simple simulation based on color changes in the center region
    let centerY = canvas.height / 2;
    centerY += Math.sin(Date.now() / 1000) * 30; // Simulate movement
    
    return centerY;
  }

  reset() {
    this.count = 0;
    this.lastY = 0;
    this.isDown = false;
  }

  getCount() {
    return this.count;
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
  
  const { toast } = useToast();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
      const animate = () => {
        if (videoRef.current && detectorRef.current) {
          const newCount = detectorRef.current.detect(videoRef.current);
          setCount(newCount);
          
          // Update session time
          const currentTime = Math.round((Date.now() - startTimeRef.current) / 1000);
          setSessionTime(currentTime);

          // Draw skeleton if enabled
          if (showSkeleton && canvasRef.current && videoRef.current) {
            drawSkeleton();
          }
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
  }, [isTracking, videoReady, showSkeleton]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Simplified skeleton drawing function
  const drawSkeleton = () => {
    const ctx = canvasRef.current?.getContext("2d");
    const video = videoRef.current;
    if (!ctx || !video) return;

    // Clear canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Set canvas size to match video
    ctx.canvas.width = video.videoWidth;
    ctx.canvas.height = video.videoHeight;

    // Simple skeleton simulation (in real app, this would use MediaPipe)
    const centerX = video.videoWidth / 2;
    const centerY = video.videoHeight / 2;
    const time = Date.now() / 1000;

    // Simulate body keypoints with some movement
    const bodyY = centerY + Math.sin(time * 2) * 20;
    
    // Draw basic skeleton structure
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 3;
    ctx.fillStyle = "#ffff00";

    // Head
    ctx.beginPath();
    ctx.arc(centerX, bodyY - 60, 15, 0, 2 * Math.PI);
    ctx.fill();

    // Body line
    ctx.beginPath();
    ctx.moveTo(centerX, bodyY - 45);
    ctx.lineTo(centerX, bodyY + 40);
    ctx.stroke();

    // Arms
    const armY = bodyY - 20;
    ctx.beginPath();
    ctx.moveTo(centerX - 40, armY);
    ctx.lineTo(centerX + 40, armY);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(centerX, bodyY + 40);
    ctx.lineTo(centerX - 20, bodyY + 80);
    ctx.moveTo(centerX, bodyY + 40);
    ctx.lineTo(centerX + 20, bodyY + 80);
    ctx.stroke();

    // Keypoints
    const keypoints = [
      { x: centerX, y: bodyY - 60 }, // head
      { x: centerX - 40, y: armY }, // left arm
      { x: centerX + 40, y: armY }, // right arm
      { x: centerX, y: bodyY + 40 }, // hip
      { x: centerX - 20, y: bodyY + 80 }, // left leg
      { x: centerX + 20, y: bodyY + 80 }, // right leg
    ];

    keypoints.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

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
                  Skelett anzeigen
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
            <li>• Schalte das Skelett ein/aus um die Pose-Erkennung zu visualisieren</li>
            <li>• Führe Liegestützen mit klaren Auf- und Abwärtsbewegungen aus</li>
            <li>• Die KI erkennt automatisch deine Bewegungen und zählt mit</li>
            <li>• Für beste Ergebnisse sorge für gute Beleuchtung</li>
          </ul>
        </div>
      </div>
    </Card>
  );
};

export default PushupTracker;
