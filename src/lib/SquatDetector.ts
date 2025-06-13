// Pose detection and squat counting logic
import type {
  Pose,
  Results as PoseResults,
  NormalizedLandmark,
  NormalizedLandmarkList
} from '@mediapipe/pose';

export enum SquatState {
  Unknown,
  Up,
  Down,
}

export class SquatDetector {
  private pose: Pose | null = null;
  private initPromise: Promise<void>;
  private state: SquatState = SquatState.Unknown;
  private count = 0;
  private lastAvgAngle = 0;
  private landmarks: PoseResults['poseLandmarks'] | null = null;
  private isInitialized = false;
  private upAngleThreshold = 160;
  private downAngleThreshold = 100;

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

    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return;
    }

    const leftAngle = this.angle(leftHip, leftKnee, leftAnkle);
    const rightAngle = this.angle(rightHip, rightKnee, rightAnkle);
    const avg = (leftAngle + rightAngle) / 2;

    this.lastAvgAngle = avg;

    switch (this.state) {
      case SquatState.Unknown:
        this.state = avg > this.upAngleThreshold ? SquatState.Up : SquatState.Down;
        break;
      case SquatState.Up:
        if (avg < this.downAngleThreshold) {
          this.state = SquatState.Down;
        }
        break;
      case SquatState.Down:
        if (avg > this.upAngleThreshold) {
          this.state = SquatState.Up;
          this.count++;
        }
        break;
    }
  }

  reset() {
    this.count = 0;
    this.state = SquatState.Unknown;
    this.landmarks = null;
    this.lastAvgAngle = 0;
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
