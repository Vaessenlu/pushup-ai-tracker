import { useEffect, useRef, useState, useCallback } from 'react';
import { PushupDetector } from '@/lib/PushupDetector';
import { SquatDetector } from '@/lib/SquatDetector';
import { PoseDetectorBase } from '@/lib/PoseDetectorBase';
import { classifyPose } from '@/lib/classifyPose';
import type { ExerciseType } from '@/types/exercise';
import type { Results as PoseResults } from '@mediapipe/pose';

export function useExerciseDetector() {
  const poseDetectorRef = useRef<PoseDetectorBase | null>(null);
  const pushupDetectorRef = useRef<PushupDetector | null>(null);
  const squatDetectorRef = useRef<SquatDetector | null>(null);
  const [poseResults, setPoseResults] = useState<PoseResults['poseLandmarks'] | null>(null);
  const [poseType, setPoseType] = useState<ExerciseType | 'unknown'>('unknown');
  const [pushupCount, setPushupCount] = useState(0);
  const [squatCount, setSquatCount] = useState(0);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    const poseDetector = new PoseDetectorBase();
    poseDetectorRef.current = poseDetector;
    const pushup = new PushupDetector();
    const squat = new SquatDetector();
    pushupDetectorRef.current = pushup;
    squatDetectorRef.current = squat;

    poseDetector.setOnPoseResults((results) => {
      setPoseResults(results);
      setModelReady(true);
      setPoseType(classifyPose(results));
      setPushupCount(pushup.processLandmarks(results));
      setSquatCount(squat.processLandmarks(results));
    });

    return () => {
      poseDetector.cleanup();
    };
  }, []);

  const detect = useCallback(async (video: HTMLVideoElement) => {
    await poseDetectorRef.current?.detect(video);
  }, []);

  const reset = useCallback(() => {
    pushupDetectorRef.current?.reset();
    squatDetectorRef.current?.reset();
    setModelReady(false);
    setPoseType('unknown');
    setPushupCount(0);
    setSquatCount(0);
    poseDetectorRef.current?.restart().catch((err) => {
      console.error('Failed to restart pose detector', err);
    });
  }, []);

  return {
    detect,
    poseResults,
    poseType,
    pushupCount,
    squatCount,
    modelReady,
    pushupDetectorRef,
    squatDetectorRef,
    reset,
  } as const;
}
