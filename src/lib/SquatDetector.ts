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
  private smoothedLandmarks: PoseResults['poseLandmarks'] | null = null;
  private smoothingFactor = 0.8;
  private isInitialized = false;
  private upAngleThreshold = 160;
  private downAngleThreshold = 100;
  private consecutiveUpFrames = 0;
  private requiredUpFrames: number;

  constructor(requiredUpFrames = 3) {
    this.requiredUpFrames = requiredUpFrames;
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
      modelComplexity: 1,
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

  private smooth(lms: NormalizedLandmarkList) {
    if (!this.smoothedLandmarks) {
      this.smoothedLandmarks = lms.map((p) => ({ ...p }));
    } else {
      const a = this.smoothingFactor;
      for (let i = 0; i < lms.length; i++) {
        const prev = this.smoothedLandmarks[i];
        const cur = lms[i];
        prev.x = prev.x * a + cur.x * (1 - a);
        prev.y = prev.y * a + cur.y * (1 - a);
        prev.z = prev.z * a + cur.z * (1 - a);
        const prevVis = prev.visibility ?? 0.5;
        const curVis = cur.visibility ?? 0.5;
        prev.visibility = prevVis * a + curVis * (1 - a);
      }
    }
    return this.smoothedLandmarks;
  }

  private processLandmarks(l: NormalizedLandmarkList) {
    const smooth = this.smooth(l)!;
    this.landmarks = smooth;

    const leftHip = smooth[23];
    const rightHip = smooth[24];
    const leftKnee = smooth[25];
    const rightKnee = smooth[26];
    const leftAnkle = smooth[27];
    const rightAnkle = smooth[28];

    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return;
    }

    const leftAngle = this.angle(leftHip, leftKnee, leftAnkle);
    const rightAngle = this.angle(rightHip, rightKnee, rightAnkle);
    const avg = (leftAngle + rightAngle) / 2;

    this.lastAvgAngle = avg;

    const hipsAboveKnees = leftHip.y < leftKnee.y && rightHip.y < rightKnee.y;
    const hipsBelowKnees = leftHip.y > leftKnee.y && rightHip.y > rightKnee.y;
    const legsStraight =
      leftAngle > this.upAngleThreshold && rightAngle > this.upAngleThreshold;
    const isUpFrame = hipsAboveKnees && legsStraight;
    // Consider a down frame once the hips move below the knee line. This avoids
    // requiring a specific knee angle which previously caused missed reps.
    const isDownFrame = hipsBelowKnees;

    if (isUpFrame) {
      this.consecutiveUpFrames++;
    } else {
      this.consecutiveUpFrames = 0;
    }

    switch (this.state) {
      case SquatState.Unknown:
        this.state = isUpFrame ? SquatState.Up : SquatState.Down;
        this.consecutiveUpFrames = 0;
        break;
      case SquatState.Up:
        if (isDownFrame) {
          this.state = SquatState.Down;
        }
        break;
      case SquatState.Down:
        if (isUpFrame && this.consecutiveUpFrames >= this.requiredUpFrames) {
          this.state = SquatState.Up;
          this.count++;
          this.consecutiveUpFrames = 0;
        }
        break;
    }
  }

  reset() {
    this.count = 0;
    this.state = SquatState.Unknown;
    this.landmarks = null;
    this.smoothedLandmarks = null;
    this.lastAvgAngle = 0;
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
