// Pose detection and push-up counting logic
import type {
  Pose,
  Results as PoseResults,
  NormalizedLandmark,
  NormalizedLandmarkList
} from '@mediapipe/pose';

type PoseInstance = Pose;

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

// Indices of landmarks not relevant for push-up detection (face & fingers)
export const UNIMPORTANT_LANDMARKS = [
  // face landmarks
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  // finger landmarks
  17, 18, 19, 20, 21, 22,
];

export enum PushupState {
  Unknown,
  Up,
  Down,
}

export class PushupDetector {
  private pose: PoseInstance | null = null;
  private initPromise: Promise<void>;
  private state: PushupState = PushupState.Unknown;
  private count = 0;
  private consecutiveUpFrames = 0;
  private requiredUpFrames: number;
  private upAngleThreshold = 160;
  private downAngleThreshold = 100;
  private lastAvgAngle = 0;
  private smoothedAngle = 0;
  private landmarks: PoseResults['poseLandmarks'] | null = null;
  private isInitialized = false;
  private onPoseResults: ((results: PoseResults['poseLandmarks']) => void) | null = null;

  constructor(
    requiredUpFrames = 3,
    upAngleThreshold = 160,
    downAngleThreshold = 100
  ) {
    this.requiredUpFrames = requiredUpFrames;
    this.upAngleThreshold = upAngleThreshold;
    this.downAngleThreshold = downAngleThreshold;
    this.initPromise = this.initPose();
  }

  private async initPose() {
    const mp = await import('@mediapipe/pose');
    // The package ships as a UMD bundle which doesn't always expose the
    // constructor via ESM exports.  Some bundlers return an empty module
    // object on dynamic import.  Fallback to the global `Pose` if necessary.
    const PoseCtor: typeof Pose =
      (mp as unknown as { Pose?: typeof Pose }).Pose ??
      (mp as { default?: { Pose: typeof Pose } }).default?.Pose ??
      (globalThis as unknown as { Pose?: typeof Pose }).Pose;
    if (!PoseCtor) {
      throw new Error('Failed to load Pose constructor from @mediapipe/pose');
    }
    this.pose = new PoseCtor({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    this.pose.setOptions({
      modelComplexity: 0,
      smoothLandmarks: true,
      enableSegmentation: false,
      selfieMode: false,
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
    await this.initPromise;
    if (!this.pose) return this.count;
    if (!this.isInitialized) {
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
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftFoot = landmarks[31];
    const rightFoot = landmarks[32];

    if (
      !leftShoulder ||
      !leftElbow ||
      !leftWrist ||
      !rightShoulder ||
      !rightElbow ||
      !rightWrist
    ) {
      return;
    }


    const leftAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgAngle = (leftAngle + rightAngle) / 2;

    // Apply simple smoothing to reduce jitter
    this.smoothedAngle = this.smoothedAngle * 0.8 + avgAngle * 0.2;
    this.lastAvgAngle = this.smoothedAngle;

    const shouldersAboveElbows =
      leftShoulder.y < leftElbow.y && rightShoulder.y < rightElbow.y;
    const shouldersBelowElbows =
      leftShoulder.y > leftElbow.y && rightShoulder.y > rightElbow.y;

    const armsStraight =
      leftAngle > this.upAngleThreshold && rightAngle > this.upAngleThreshold;
    const elbowsBentEnough =
      leftAngle < this.downAngleThreshold && rightAngle < this.downAngleThreshold;

    const isUpFrame = shouldersAboveElbows && armsStraight;
    const isDownFrame = shouldersBelowElbows && elbowsBentEnough;

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
        if (isUpFrame && this.consecutiveUpFrames >= this.requiredUpFrames) {
          this.state = PushupState.Up;
          this.count++;
          this.consecutiveUpFrames = 0;
        }
        break;
      }
    }
  }

  reset() {
    this.count = 0;
    this.state = PushupState.Unknown;
    this.consecutiveUpFrames = 0;
    this.landmarks = null;
    this.lastAvgAngle = 0;
    this.smoothedAngle = 0;
  }

  getCount() {
    return this.count;
  }

  getLandmarks() {
    return this.landmarks;
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

  isReady() {
    return this.isInitialized;
  }

  cleanup() {
    if (this.pose) {
      this.pose.reset();
    }
  }
}

export type { PoseResults };

