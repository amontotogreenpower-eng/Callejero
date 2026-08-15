// mocap.js — Captura de movimiento con MediaPipe Pose Landmarker.
//
// Entrega dos conjuntos de puntos por fotograma:
//   landmarks       -> normalizados a la imagen (0..1), utiles para dibujar
//   world           -> metros aprox., origen en el centro de la cadera
// El juego funciona igual sin camara: si algo falla se queda en modo teclado.

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const LM = {
  NOSE: 0, EYE_L: 2, EYE_R: 5, EAR_L: 7, EAR_R: 8,
  MOUTH_L: 9, MOUTH_R: 10,
  SHOULDER_L: 11, SHOULDER_R: 12,
  ELBOW_L: 13, ELBOW_R: 14,
  WRIST_L: 15, WRIST_R: 16,
  PINKY_L: 17, PINKY_R: 18,
  INDEX_L: 19, INDEX_R: 20,
  THUMB_L: 21, THUMB_R: 22,
  HIP_L: 23, HIP_R: 24,
  KNEE_L: 25, KNEE_R: 26,
  ANKLE_L: 27, ANKLE_R: 28,
  HEEL_L: 29, HEEL_R: 30,
  FOOT_L: 31, FOOT_R: 32,
};

// Pares para dibujar el esqueleto de vista previa.
export const CONNECTIONS = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30],
  [0, 11], [0, 12],
];

export class Mocap {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
    this.video = null;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.landmarks = null;   // Array<{x,y,z,visibility}> normalizados
    this.world = null;       // Array<{x,y,z,visibility}> en metros
    this.lastStamp = -1;
    this.fps = 0;
    this._lastT = 0;
    this.error = null;
  }

  get ready() { return this.running && !!this.world; }

  async start() {
    if (this.running) return true;
    this.error = null;
    try {
      this.onStatus('Pidiendo camara…');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });

      this.video = document.createElement('video');
      this.video.playsInline = true;
      this.video.muted = true;
      this.video.srcObject = this.stream;
      await this.video.play();

      this.onStatus('Cargando modelo de pose…');
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });

      this.running = true;
      this.onStatus('Captura activa');
      return true;
    } catch (err) {
      this.error = err;
      this.stop();
      this.onStatus('Sin captura: ' + (err && err.message ? err.message : err));
      return false;
    }
  }

  stop() {
    this.running = false;
    if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); this.stream = null; }
    if (this.landmarker) { try { this.landmarker.close(); } catch (_) { /* ignorar */ } this.landmarker = null; }
    if (this.video) { this.video.srcObject = null; this.video = null; }
    this.landmarks = null;
    this.world = null;
  }

  /** Llamar una vez por fotograma. Devuelve true si hay datos nuevos. */
  update() {
    if (!this.running || !this.landmarker || !this.video) return false;
    if (this.video.readyState < 2) return false;
    const t = this.video.currentTime;
    if (t === this.lastStamp) return false;
    this.lastStamp = t;

    let res;
    try {
      res = this.landmarker.detectForVideo(this.video, performance.now());
    } catch (err) {
      this.error = err;
      return false;
    }
    if (!res || !res.worldLandmarks || !res.worldLandmarks.length) {
      this.landmarks = null;
      this.world = null;
      return false;
    }
    this.world = res.worldLandmarks[0];
    this.landmarks = res.landmarks ? res.landmarks[0] : null;

    const now = performance.now();
    if (this._lastT) this.fps = 0.9 * this.fps + 0.1 * (1000 / Math.max(1, now - this._lastT));
    this._lastT = now;
    return true;
  }

  /** Dibuja la vista previa (video espejado + esqueleto) en un canvas 2D. */
  drawPreview(ctx, w, h) {
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // efecto espejo, mas natural para el jugador
    if (this.video && this.video.readyState >= 2) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, w, h);
    }
    const lm = this.landmarks;
    if (lm) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#39e6a8';
      ctx.beginPath();
      for (const [a, b] of CONNECTIONS) {
        const pa = lm[a], pb = lm[b];
        if (!pa || !pb) continue;
        ctx.moveTo(pa.x * w, pa.y * h);
        ctx.lineTo(pb.x * w, pb.y * h);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffd75a';
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
