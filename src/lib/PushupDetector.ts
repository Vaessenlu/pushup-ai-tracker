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

  if (!leftShoulder || !leftElbow || !leftWrist || !rightShoulder || !rightElbow || !rightWrist) {
    return;
  }

  const legVisible = [
    leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle, leftFoot, rightFoot
  ].some((lm) => lm && (lm.visibility ?? 0) > PushupDetector.LEG_VISIBILITY_THRESHOLD);

  if (!legVisible) {
    this.framesBelowVisibility++;
    if (this.framesBelowVisibility > PushupDetector.LEG_MISSING_FRAMES) return;
  } else {
    this.framesBelowVisibility = 0;
  }

  const leftAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
  const rightAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
  const avgAngle = (leftAngle + rightAngle) / 2;

  const isUpFrame = avgAngle > 160 && legVisible;
  const isDownFrame = avgAngle < 100;

  if (isUpFrame) {
    this.consecutiveUpFrames++;
  } else {
    this.consecutiveUpFrames = 0;
  }

  switch (this.state) {
    case PushupState.WaitingForUp:
      if (isUpFrame && this.consecutiveUpFrames >= this.requiredUpFrames) {
        this.state = PushupState.Up;
        this.consecutiveUpFrames = 0;
      }
      break;
    case PushupState.Up:
      if (isDownFrame && legVisible) {
        this.state = PushupState.Down;
        this.legSeen = true;
      }
      break;
    case PushupState.Down:
      if (isUpFrame && this.consecutiveUpFrames >= this.requiredUpFrames) {
        this.state = PushupState.Up;
        if (this.legSeen) {
          this.count++;
        }
        this.legSeen = false;
        this.consecutiveUpFrames = 0;
      }
      break;
  }
}
