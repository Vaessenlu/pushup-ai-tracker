import type { Pose, Results as PoseResults } from '@mediapipe/pose';

export type PoseCallback = (results: PoseResults['poseLandmarks']) => void;

export class PoseDetectorBase {
  protected pose: Pose | null = null;
  protected initPromise: Promise<void>;
  protected onPoseResults: PoseCallback | null = null;
  protected isInitialized = false;
  private initializing = false;

  constructor() {
    this.initPromise = this.initPose();
  }

  protected async initPose() {
    if (this.initializing) return;
    this.initializing = true;
    try {
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
    } finally {
      this.initializing = false;
    }
  }

  protected handleResults(_landmarks: PoseResults['poseLandmarks']) {}

  setOnPoseResults(cb: PoseCallback) {
    this.onPoseResults = cb;
  }

  async detect(video: HTMLVideoElement) {
    try {
      await this.initPromise;
      if (!this.pose) return;
      await this.pose.send({ image: video });
    } catch (err) {
      console.error('Pose detection failed, reinitializing model', err);
      await this.restart();
    }
  }

  cleanup() {
    this.pose?.reset();
    // @ts-expect-error Mediapipe provides close in newer versions
    this.pose?.close?.();
    this.pose = null;
  }

  async restart() {
    this.cleanup();
    this.initPromise = this.initPose();
    await this.initPromise;
  }
}
