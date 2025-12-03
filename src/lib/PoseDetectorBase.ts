import type { Pose, Results as PoseResults } from '@mediapipe/pose';

export type PoseCallback = (results: PoseResults['poseLandmarks']) => void;

export class PoseDetectorBase {
  protected pose: Pose | null = null;
  protected initPromise: Promise<void>;
  protected onPoseResults: PoseCallback | null = null;
  protected isInitialized = false;

  constructor() {
    this.initPromise = this.initPose();
  }

  protected async initPose() {
    const mp = await import('@mediapipe/pose');
    const PoseCtor: typeof Pose =
      (mp as unknown as { Pose?: typeof Pose }).Pose ??
      (mp as { default?: { Pose: typeof Pose } }).default?.Pose ??
      (globalThis as unknown as { Pose?: typeof Pose }).Pose;
    if (!PoseCtor) {
      throw new Error('Failed to load Pose constructor from @mediapipe/pose');
    }
    this.pose = new PoseCtor({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    this.pose.setOptions({
      modelComplexity: 0,
      smoothLandmarks: true,
      enableSegmentation: false,
      selfieMode: false,
    });
    this.pose.onResults((results) => {
      if (results.poseLandmarks) {
        this.isInitialized = true;
        this.handleResults(results.poseLandmarks);
        if (this.onPoseResults) this.onPoseResults(results.poseLandmarks);
      }
    });
  }

  protected handleResults(_landmarks: PoseResults['poseLandmarks']) {}

  setOnPoseResults(cb: PoseCallback) {
    this.onPoseResults = cb;
  }

  async detect(video: HTMLVideoElement) {
    await this.initPromise;
    if (!this.pose) return;
    await this.pose.send({ image: video });
  }

  cleanup() {
    this.pose?.reset();
    this.pose = null;
  }
}
