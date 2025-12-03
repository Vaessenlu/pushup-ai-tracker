import type { NormalizedLandmark } from '@mediapipe/pose';
import type { ExerciseType } from '@/types/exercise';

export function classifyPose(landmarks: NormalizedLandmark[] | null): ExerciseType | 'unknown' {
  if (!landmarks) return 'unknown';
  const ls = landmarks[11];
  const rs = landmarks[12];
  const lh = landmarks[23];
  const rh = landmarks[24];
  if (!ls || !rs || !lh || !rh) return 'unknown';
  const shoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const hip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const vertical = Math.abs(hip.y - shoulder.y);
  const horizontal = Math.abs(hip.x - shoulder.x);
  if (vertical > horizontal * 1.2) return 'squat';
  if (horizontal > vertical * 1.2) return 'pushup';
  return 'unknown';
}
