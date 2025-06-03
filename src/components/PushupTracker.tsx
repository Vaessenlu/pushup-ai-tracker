import React, { useRef, useState, useEffect } from "react";
import * as tf from "@tensorflow/tfjs";
import * as posedetection from "@tensorflow-models/pose-detection";

const videoWidth = 640;
const videoHeight = 480;

const PushupTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [pushups, setPushups] = useState(0);
  const [down, setDown] = useState(false); // warst du schon unten?
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tensorflow Backend fix für WebGL
  useEffect(() => {
    tf.setBackend("webgl").then(() => tf.ready());
  }, []);

  // Kamera aktivieren
  const enableCamera = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: videoWidth, height: videoHeight } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        await new Promise<void>((resolve) => {
          videoRef.current!.onloadeddata = () => resolve();
        });
        setCameraEnabled(true);
      }
    } catch (err) {
      setErrorMsg("Kamera konnte nicht aktiviert werden: " + (err as Error).message);
      setCameraEnabled(false);
    }
  };

  // Kamera deaktivieren
  const disableCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraEnabled(false);
    setFeedback("");
  };

  // Pose Detection Loop
  useEffect(() => {
    let detector: posedetection.PoseDetector | null = null;
    let animationId: number;

    async function runPoseDetection() {
      if (!videoRef.current || !canvasRef.current) return;

      detector = await posedetection.createDetector(posedetection.SupportedModels.MoveNet, {
        modelType: "singlepose_lightning",
      });

      async function poseDetectionFrame() {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

        const poses = await detector!.estimatePoses(videoRef.current);
        drawCanvas(poses);

        if (poses.length > 0) {
          const kp = poses[0].keypoints;
          // Finde Schultern & Ellenbogen (frontal)
          const leftShoulder = kp.find(p => p.name === "left_shoulder");
          const rightShoulder = kp.find(p => p.name === "right_shoulder");
          const leftElbow = kp.find(p => p.name === "left_elbow");
          const rightElbow = kp.find(p => p.name === "right_elbow");

          // Mittelwert für beide Seiten (macht robust)
          if (leftShoulder && rightShoulder && leftElbow && rightElbow) {
            const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
            const avgElbowY = (leftElbow.y + rightElbow.y) / 2;

            // Du bist tief genug, wenn Schulter UNTER Ellenbogen (Y-Achse im Canvas geht nach unten!)
            if (avgShoulderY > avgElbowY + 30) { // +30 als Puffer
              setFeedback("🟢 Tief genug! Jetzt hochdrücken!");
              if (!down) {
                setDown(true);
              }
            } else if (avgShoulderY < avgElbowY - 20) { // oben angekommen
              setFeedback("🔵 Hoch genug! Wieder runter.");
              if (down) {
                setDown(false);
                setPushups(count => count + 1);
              }
            } else {
              setFeedback("⬇️ Noch nicht tief genug.");
            }
          }
        }
        animationId = requestAnimationFrame(poseDetectionFrame);
      }
      poseDetectionFrame();
    }

    if (cameraEnabled) {
      runPoseDetection();
    }
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (detector) detector.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraEnabled]);

  // Skelett zeichnen
  function drawCanvas(poses: posedetection.Pose[]) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, videoWidth, videoHeight);

    // Orientierungslinie Ellenbogen
    if (poses.length > 0) {
      const kp = poses[0].keypoints;
      const leftElbow = kp.find(p => p.name === "left_elbow");
      const rightElbow = kp.find(p => p.name === "right_elbow");
      if (leftElbow && rightElbow) {
        ctx.strokeStyle = "lime";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(leftElbow.x, leftElbow.y);
        ctx.lineTo(rightElbow.x, rightElbow.y);
        ctx.stroke();
      }
    }

    // Keypoints und Skeleton
    for (const pose of poses) {
      // Alle Keypoints zeichnen
      for (const keypoint of pose.keypoints) {
        if (keypoint.score > 0.3) {
          ctx.beginPath();
          ctx.arc(keypoint.x, keypoint.y, 6, 0, 2 * Math.PI);
          ctx.fillStyle = "yellow";
          ctx.fill();
        }
      }
      // Verbindungen (Skeleton) zeichnen (einfaches Paar-Array)
      const edges: [string, string][] = [
        ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
        ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
        ["left_shoulder", "right_shoulder"],
        ["left_hip", "right_hip"],
        ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
        ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
        ["right_hip", "right_knee"], ["right_knee", "right_ankle"]
      ];
      ctx.strokeStyle = "#0ff";
      ctx.lineWidth = 3;
      for (const [a, b] of edges) {
        const kpA = pose.keypoints.find(kp => kp.name === a);
        const kpB = pose.keypoints.find(kp => kp.name === b);
        if (kpA && kpB && kpA.score > 0.3 && kpB.score > 0.3) {
          ctx.beginPath();
          ctx.moveTo(kpA.x, kpA.y);
          ctx.lineTo(kpB.x, kpB.y);
          ctx.stroke();
        }
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <h2 className="text-xl font-bold mb-2">Push-up Tracker</h2>
      <div className="flex gap-2">
        {!cameraEnabled ? (
          <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={enableCamera}>
            Kamera aktivieren
          </button>
        ) : (
          <button className="px-4 py-2 bg-gray-500 text-white rounded" onClick={disableCamera}>
            Kamera deaktivieren
          </button>
        )}
      </div>
      <div className="mb-2 font-semibold">Wiederholungen: {pushups}</div>
      <div className="mb-2 text-lg">{feedback}</div>
      {errorMsg && <div className="text-red-500">{errorMsg}</div>}
      <div className="relative" style={{ width: videoWidth, height: videoHeight }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          width={videoWidth}
          height={videoHeight}
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: videoWidth, height: videoHeight,
            zIndex: 1,
            borderRadius: 12
          }}
        />
        <canvas
          ref={canvasRef}
          width={videoWidth}
          height={videoHeight}
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: videoWidth, height: videoHeight,
            pointerEvents: "none",
            zIndex: 2
          }}
        />
      </div>
    </div>
  );
};

export default PushupTracker;
