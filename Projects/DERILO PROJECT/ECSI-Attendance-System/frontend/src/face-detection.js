import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let detectorPromise;

function getFaceDetector() {
  if (!detectorPromise) {
    detectorPromise = FilesetResolver.forVisionTasks(WASM_ROOT).then(vision =>
      FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      })
    );
  }
  return detectorPromise;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read camera frame'));
    image.src = dataUrl;
  });
}

// Detect presence only. Identity verification remains server-side.
window.detectFaceInFrame = async function detectFaceInFrame(frameDataUrl) {
  if (!frameDataUrl) return { ok: false, reason: 'no_video' };
  try {
    const [detector, image] = await Promise.all([getFaceDetector(), loadImage(frameDataUrl)]);
    const result = detector.detect(image);
    const faceCount = (result.detections || []).filter(detection =>
      Math.max(...(detection.categories || []).map(category => category.score || 0)) >= 0.5
    ).length;
    return faceCount > 0
      ? { ok: true, faceCount }
      : { ok: false, reason: 'no_face', faceCount: 0 };
  } catch (error) {
    console.error('Camera face detector failed:', error);
    return { ok: false, reason: 'detector_unavailable' };
  }
};
