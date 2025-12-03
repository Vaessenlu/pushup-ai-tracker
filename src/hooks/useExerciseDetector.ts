import { useEffect, useRef, useState, useCallback } from 'react';
import { PushupDetector } from '@/lib/PushupDetector';
import { SquatDetector } from '@/lib/SquatDetector';
import { classifyPose } from '@/lib/classifyPose';
import type { ExerciseType } from '@/types/exercise';
import type { Results as PoseResults } from '@mediapipe/pose';

export function useExerciseDetector() {
  const pushupDetectorRef = useRef<PushupDetector | null>(null);
  const squatDetectorRef = useRef<SquatDetector | null>(null);
  const [poseResults, setPoseResults] = useState<PoseResults['poseLandmarks'] | null>(null);
  const [poseType, setPoseType] = useState<ExerciseType | 'unknown'>('unknown');
  const [pushupCount, setPushupCount] = useState(0);
  const [squatCount, setSquatCount] = useState(0);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    const detector = new PushupDetector();
    detector.setOnPoseResults((results) => {
      setPoseResults(results);
      setModelReady(true);
      setPoseType(classifyPose(results));
    });
    pushupDetectorRef.current = detector;
    const squat = new SquatDetector();
    squatDetectorRef.current = squat;
    return () => {
      detector.cleanup();
      squat.cleanup();
    };
  }, []);

  const detect = useCallback(async (video: HTMLVideoElement) => {
    const pushups = await pushupDetectorRef.current?.detect(video);
    const squats = await squatDetectorRef.current?.detect(video);
    if (typeof pushups === 'number') setPushupCount(pushups);
    if (typeof squats === 'number') setSquatCount(squats);
  }, []);

  const reset = useCallback(() => {
    pushupDetectorRef.current?.reset();
    squatDetectorRef.current?.reset();
    setPushupCount(0);
    setSquatCount(0);
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
