import type { Results as PoseResults, NormalizedLandmark, NormalizedLandmarkList } from '@mediapipe/pose';
import { PoseDetectorBase } from './PoseDetectorBase';

export enum SquatState {
  Unknown,
  Up,
  Down,
}

export class SquatDetector extends PoseDetectorBase {
  private state: SquatState = SquatState.Unknown;
  private count = 0;
  private lastAvgAngle = 0;
  private landmarks: PoseResults['poseLandmarks'] | null = null;
  private upAngleThreshold = 160;
  private downAngleThreshold = 100;

  protected handleResults(landmarks: PoseResults['poseLandmarks']) {
    this.landmarks = landmarks;
    this.processLandmarks(landmarks);
  }

  async detect(video: HTMLVideoElement): Promise<number> {
    await super.detect(video);
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

  processLandmarks(l: NormalizedLandmarkList) {
    const leftHip = l[23];
    const rightHip = l[24];
    const leftKnee = l[25];
    const rightKnee = l[26];
    const leftAnkle = l[27];
    const rightAnkle = l[28];

    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return this.count;
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

    return this.count;
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
    super.cleanup();
  }
}

export type { PoseResults };
