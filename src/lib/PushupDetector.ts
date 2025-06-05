// Pose detection and push-up counting logic
import {
  Pose,
  POSE_CONNECTIONS,
  Results as PoseResults,
  NormalizedLandmark,
  NormalizedLandmarkList
} from '@mediapipe/pose';

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

export class PushupDetector {
  private pose: Pose;
  private isDown = false;
  private count = 0;
  private legSeen = false;
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

    const legVisible = [
      leftHip,
      rightHip,
      leftKnee,
      rightKnee,
      leftAnkle,
      rightAnkle,
      leftFoot,
      rightFoot
    ].some((lm) => lm && (lm.visibility ?? 0) > 0.3);

    const leftAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgAngle = (leftAngle + rightAngle) / 2;

    if (avgAngle < 100 && !this.isDown) {
      if (legVisible) {
        this.isDown = true;
        this.legSeen = true;
      }
    }

    if (avgAngle > 160 && this.isDown) {
      this.isDown = false;
      if (this.legSeen) {
        this.count++;
      }
      this.legSeen = false;
    }
  }

  reset() {
    this.count = 0;
    this.isDown = false;
    this.legSeen = false;
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

export type { PoseResults };
export { POSE_CONNECTIONS } from '@mediapipe/pose';
