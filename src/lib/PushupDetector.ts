import type { Results as PoseResults, NormalizedLandmark, NormalizedLandmarkList } from '@mediapipe/pose';

export const POSE_LANDMARK_NAMES = [
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

export const UNIMPORTANT_LANDMARKS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  17, 18, 19, 20, 21, 22,
];

export enum PushupState {
  Unknown,
  Up,
  Down,
}

export class PushupDetector {
  private state: PushupState = PushupState.Unknown;
  private count = 0;
  private consecutiveUpFrames = 0;
  private requiredUpFrames: number;
  private upAngleThreshold = 160;
  private downAngleThreshold = 100;
  private lastAvgAngle = 0;
  private smoothedAngle = 0;
  private landmarks: PoseResults['poseLandmarks'] | null = null;

  constructor(requiredUpFrames = 3, upAngleThreshold = 160, downAngleThreshold = 100) {
    this.requiredUpFrames = requiredUpFrames;
    this.upAngleThreshold = upAngleThreshold;
    this.downAngleThreshold = downAngleThreshold;
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

  processLandmarks(landmarks: NormalizedLandmarkList) {
    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];

    if (!leftShoulder || !leftElbow || !leftWrist || !rightShoulder || !rightElbow || !rightWrist) {
      return this.count;
    }

    const leftAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgAngle = (leftAngle + rightAngle) / 2;

    this.smoothedAngle = this.smoothedAngle * 0.8 + avgAngle * 0.2;
    this.lastAvgAngle = this.smoothedAngle;

    const isUpFrame = leftAngle > this.upAngleThreshold && rightAngle > this.upAngleThreshold;
    const isDownFrame = leftAngle < this.downAngleThreshold && rightAngle < this.downAngleThreshold;

    if (isUpFrame) {
      this.consecutiveUpFrames++;
    } else {
      this.consecutiveUpFrames = 0;
    }

    switch (this.state) {
      case PushupState.Unknown: {
        this.state = isUpFrame ? PushupState.Up : PushupState.Down;
        this.consecutiveUpFrames = 0;
        break;
      }
      case PushupState.Up: {
        if (isDownFrame) {
          this.state = PushupState.Down;
        }
        break;
      }
      case PushupState.Down: {
        if (isUpFrame) {
          if (this.consecutiveUpFrames >= this.requiredUpFrames) {
            this.count++;
            this.state = PushupState.Up;
            this.consecutiveUpFrames = 0;
          }
        }
        break;
      }
    }

    return this.count;
  }

  reset() {
    this.count = 0;
    this.state = PushupState.Unknown;
    this.landmarks = null;
    this.lastAvgAngle = 0;
    this.smoothedAngle = 0;
    this.consecutiveUpFrames = 0;
  }

  getCount() {
    return this.count;
  }

  getState() {
    return this.state;
  }

  getLastAngle() {
    return this.lastAvgAngle;
  }

  getUpAngleThreshold() {
    return this.upAngleThreshold;
  }

  getDownAngleThreshold() {
    return this.downAngleThreshold;
  }

  getLandmarks() {
    return this.landmarks;
  }

  cleanup() {}
}

export type { PoseResults };
