export function drawCustomConnectors(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  connections: readonly [number, number][],
  color: string,
  lineWidth: number,
  canvas: HTMLCanvasElement,
  videoWidth: number,
  videoHeight: number
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  const scale = Math.max(canvas.width / videoWidth, canvas.height / videoHeight);
  const offsetX = (videoWidth * scale - canvas.width) / 2;
  const offsetY = (videoHeight * scale - canvas.height) / 2;

  connections.forEach(([a, b]) => {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) return;
    ctx.beginPath();
    ctx.moveTo(pa.x * videoWidth * scale - offsetX, pa.y * videoHeight * scale - offsetY);
    ctx.lineTo(pb.x * videoWidth * scale - offsetX, pb.y * videoHeight * scale - offsetY);
    ctx.stroke();
  });
}

export function drawCustomLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  color: string,
  radius: number,
  canvas: HTMLCanvasElement,
  videoWidth: number,
  videoHeight: number
) {
  ctx.fillStyle = color;

  const scale = Math.max(canvas.width / videoWidth, canvas.height / videoHeight);
  const offsetX = (videoWidth * scale - canvas.width) / 2;
  const offsetY = (videoHeight * scale - canvas.height) / 2;

  landmarks.forEach((lm) => {
    ctx.beginPath();
    ctx.arc(
      lm.x * videoWidth * scale - offsetX,
      lm.y * videoHeight * scale - offsetY,
      radius,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });
}
