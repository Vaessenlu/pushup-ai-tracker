declare module '@mediapipe/drawing_utils/drawing_utils.js' {
  export * from '@mediapipe/drawing_utils';
  const drawingUtils: {
    drawConnectors: typeof import('@mediapipe/drawing_utils').drawConnectors;
    drawLandmarks: typeof import('@mediapipe/drawing_utils').drawLandmarks;
    drawRectangle: typeof import('@mediapipe/drawing_utils').drawRectangle;
    clamp: typeof import('@mediapipe/drawing_utils').clamp;
    lerp: typeof import('@mediapipe/drawing_utils').lerp;
  };
  export default drawingUtils;
}
