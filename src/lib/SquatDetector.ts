// Pose detection and squat counting logic
import type {
  Pose,
  Results as PoseResults,
  NormalizedLandmark,
  NormalizedLandmarkList
} from '@mediapipe/pose';

export class SquatDetector {
  private pose: Pose | null = null;
  private initPromise: Promise<void>;
  private isDown = false;
  private count = 0;
  private landmarks: PoseResults['poseLandmarks'] | null = null;
  // keeps a rolling window of knee angles
  private angleHistory: number[] = [];
  // keeps a rolling window of torso orientation angles
  private torsoHistory: number[] = [];
  private framesBelowVisibility = 0;
  private downFrameCount = 0;
  private upFrameCount = 0;
  /**
   * Size of the smoothing window used for averaging angles.
   * Higher values give smoother results but introduce latency.
   */
  private static readonly ANGLE_WINDOW = 5;
  private static readonly DOWN_THRESHOLD = 100;
  private static readonly UP_THRESHOLD = 160;
  /** Minimum consecutive frames an angle must stay beyond a threshold. */
  private static readonly FRAME_COUNT_THRESHOLD = 3;
  private static readonly LEG_VISIBILITY_THRESHOLD = 0.3;
  /**
   * Number of consecutive frames legs must be invisible before the frame is
   * ignored to avoid false detections when the user leaves the frame.
   */
  private static readonly LEG_MISSING_FRAMES = 2;
  private static readonly ORIENTATION_CHANGE_THRESHOLD = 15; // degrees
  private isInitialized = false;

  constructor() {
    this.initPromise = this.initPose();
  }

  private async initPose() {
    const mp = await import('@mediapipe/pose');
    const PoseCtor: typeof Pose =
      (mp as unknown as { Pose?: typeof Pose }).Pose ??
      (mp as { default?: { Pose: typeof Pose } }).default?.Pose ??
      (globalThis as unknown as { Pose?: typeof Pose }).Pose;
    if (!PoseCtor) throw new Error('Failed to load Pose constructor');
    this.pose = new PoseCtor({
      locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`
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
      }
    });
  }

  async detect(video: HTMLVideoElement): Promise<number> {
    await this.initPromise;
    if (!this.pose) return this.count;
    if (!this.isInitialized) {
      await this.pose.send({ image: video });
      return this.count;
    }
    await this.pose.send({ image: video });
    return this.count;
  }

  private angle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAB = Math.hypot(ab.x, ab.y);
    const magCB = Math.hypot(cb.x, cb.y);
    return (Math.acos(dot / (magAB * magCB)) * 180) / Math.PI;
  }

  private processLandmarks(l: NormalizedLandmarkList) {
    const leftHip = l[23];
    const rightHip = l[24];
    const leftKnee = l[25];
    const rightKnee = l[26];
    const leftAnkle = l[27];
    const rightAnkle = l[28];
    const leftShoulder = l[11];
    const rightShoulder = l[12];
    const leftFoot = l[31];
    const rightFoot = l[32];

    if (
      !leftHip ||
      !rightHip ||
      !leftKnee ||
      !rightKnee ||
      !leftAnkle ||
      !rightAnkle ||
      !leftShoulder ||
      !rightShoulder
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
    ].some((lm) => lm && (lm.visibility ?? 0) > SquatDetector.LEG_VISIBILITY_THRESHOLD);

    if (!legVisible) {
      this.framesBelowVisibility++;
      if (this.framesBelowVisibility > SquatDetector.LEG_MISSING_FRAMES) {
        return;
      }
    } else {
      this.framesBelowVisibility = 0;
    }

    const shoulderMid = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2
    };
    const hipMid = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2
    };
    const torsoAngle =
      (Math.atan2(hipMid.y - shoulderMid.y, hipMid.x - shoulderMid.x) * 180) /
      Math.PI;

    const prevOrientation = this.torsoHistory[this.torsoHistory.length - 1];
    if (
      prevOrientation !== undefined &&
      Math.abs(torsoAngle - prevOrientation) >
        SquatDetector.ORIENTATION_CHANGE_THRESHOLD
    ) {
      return;
    }

    this.torsoHistory.push(torsoAngle);
    if (this.torsoHistory.length > SquatDetector.ANGLE_WINDOW) {
      this.torsoHistory.shift();
    }

    const leftAngle = this.angle(leftHip, leftKnee, leftAnkle);
    const rightAngle = this.angle(rightHip, rightKnee, rightAnkle);
    const avg = (leftAngle + rightAngle) / 2;

    this.angleHistory.push(avg);
    if (this.angleHistory.length > SquatDetector.ANGLE_WINDOW) {
      this.angleHistory.shift();
    }

    const smoothAngle =
      this.angleHistory.reduce((s, v) => s + v, 0) / this.angleHistory.length;

    if (smoothAngle < SquatDetector.DOWN_THRESHOLD) {
      this.downFrameCount++;
    } else {
      this.downFrameCount = 0;
    }

    if (smoothAngle > SquatDetector.UP_THRESHOLD) {
      this.upFrameCount++;
    } else {
      this.upFrameCount = 0;
    }

    if (
      this.downFrameCount >= SquatDetector.FRAME_COUNT_THRESHOLD &&
      !this.isDown &&
      legVisible
    ) {
      this.isDown = true;
    }

    if (
      this.upFrameCount >= SquatDetector.FRAME_COUNT_THRESHOLD &&
      this.isDown
    ) {
      this.isDown = false;
      this.count++;
    }
  }

  reset() {
    this.count = 0;
    this.isDown = false;
    this.landmarks = null;
    this.angleHistory = [];
    this.torsoHistory = [];
    this.framesBelowVisibility = 0;
    this.downFrameCount = 0;
    this.upFrameCount = 0;
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
    if (this.pose) {
      this.pose.reset();
    }
  }
}

export type { PoseResults };
