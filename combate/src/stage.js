// stage.js — Escenario, iluminacion, camara y efectos de impacto.

import * as THREE from 'three';
import { ARENA_X } from './fighter.js';

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090713);
    this.scene.fog = new THREE.Fog(0x090713, 12, 30);

    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
    this.camera.position.set(0, 1.85, 8.2);
    this.camTarget = new THREE.Vector3(0, 1.15, 0);
    this.shake = 0;

    this.buildLights();
    this.buildGround();
    this.buildBackdrop();
    this.buildSparks();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x8899ff, 0x161018, 0.55));

    const key = new THREE.DirectionalLight(0xfff0d0, 2.1);
    key.position.set(4.5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const d = 8;
    key.shadow.camera.left = -d; key.shadow.camera.right = d;
    key.shadow.camera.top = d; key.shadow.camera.bottom = -d;
    key.shadow.camera.near = 1; key.shadow.camera.far = 24;
    key.shadow.bias = -0.0015;
    this.scene.add(key);
    this.key = key;

    const rim = new THREE.DirectionalLight(0x4fd8ff, 1.1);
    rim.position.set(-6, 4, -5);
    this.scene.add(rim);

    const fill = new THREE.PointLight(0xff5a3c, 1.4, 18, 2);
    fill.position.set(0, 3.2, -3);
    this.scene.add(fill);
    this.fill = fill;
  }

  buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 24),
      new THREE.MeshStandardMaterial({ color: 0x21202b, roughness: 0.92, metalness: 0.05 }));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.scene.add(g);

    // Marcas del ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ARENA_X + 0.4, ARENA_X + 0.62, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd75a, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);

    const grid = new THREE.GridHelper(40, 40, 0x3a3550, 0x2a2740);
    grid.position.y = 0.005;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);
  }

  buildBackdrop() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x191527, roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 0.6), wallMat);
    back.position.set(0, 4, -5.2);
    back.receiveShadow = true;
    this.scene.add(back);

    // Ventanas y neones del fondo
    const neonColors = [0xff3b6b, 0x3bffd1, 0xffd75a, 0x8a5bff];
    for (let i = 0; i < 26; i++) {
      const w = 0.35 + Math.random() * 0.5;
      const h = 0.5 + Math.random() * 0.8;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: neonColors[(Math.random() * neonColors.length) | 0],
          transparent: true, opacity: 0.18 + Math.random() * 0.5,
        }));
      m.position.set(-13 + Math.random() * 26, 1.2 + Math.random() * 5.6, -4.85);
      this.scene.add(m);
    }

    // Bidones a los lados
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x543a2a, roughness: 0.8, metalness: 0.25 });
    for (const x of [-7.4, -6.4, 7.2, 8.1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14), barrelMat);
      b.position.set(x, 0.52, -2.4 + Math.random() * 1.6);
      b.castShadow = true; b.receiveShadow = true;
      this.scene.add(b);
    }
  }

  buildSparks() {
    const N = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe08a, size: 0.11, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.sparkPts = new THREE.Points(geo, mat);
    this.sparkPts.frustumCulled = false;
    this.scene.add(this.sparkPts);
    this.sparks = Array.from({ length: N }, () => ({
      life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(),
    }));
    this.sparkIdx = 0;
  }

  /** Chispas en un impacto. */
  burst(point, color = 0xffe08a, count = 14, power = 3.2) {
    this.sparkPts.material.color.setHex(color);
    for (let i = 0; i < count; i++) {
      const s = this.sparks[this.sparkIdx];
      this.sparkIdx = (this.sparkIdx + 1) % this.sparks.length;
      s.life = 0.28 + Math.random() * 0.22;
      s.p.copy(point);
      s.v.set((Math.random() - 0.5) * power, Math.random() * power * 0.8, (Math.random() - 0.5) * power * 0.6);
    }
  }

  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

  update(dt, a, b) {
    // Camara: enmarca a los dos luchadores.
    const mid = (a.pos.x + b.pos.x) / 2;
    const sep = Math.abs(a.pos.x - b.pos.x);
    const dist = THREE.MathUtils.clamp(6.6 + sep * 0.58, 6.6, 11.0);
    const height = 1.7 + sep * 0.05;

    this.camTarget.lerp(new THREE.Vector3(mid * 0.85, 1.12, 0), 1 - Math.exp(-dt * 6));
    const want = new THREE.Vector3(mid * 0.62, height, dist);
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 5));

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 3.2);
      const s = this.shake * 0.16;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camTarget);

    this.updateSparks(dt);
    this.fill.intensity = 1.2 + Math.sin(performance.now() * 0.002) * 0.25;
  }

  updateSparks(dt) {
    const arr = this.sparkPts.geometry.attributes.position.array;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 14 * dt;
        s.p.addScaledVector(s.v, dt);
        arr[i * 3] = s.p.x; arr[i * 3 + 1] = s.p.y; arr[i * 3 + 2] = s.p.z;
      } else {
        arr[i * 3 + 1] = -100;
      }
    }
    this.sparkPts.geometry.attributes.position.needsUpdate = true;
  }

  /** Camara de escaparate: encuadra a un solo luchador, girando despacio. */
  focus(dt, fighter) {
    // Encuadre entero: a 38° de campo y 4.4 m caben los 1.75 m con aire.
    const t = performance.now() * 0.00018;
    const want = new THREE.Vector3(
      fighter.pos.x + Math.sin(t) * 1.9,
      1.35,
      4.4 - Math.cos(t) * 0.5);
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 3));
    this.camTarget.lerp(new THREE.Vector3(fighter.pos.x, 0.95, 0), 1 - Math.exp(-dt * 4));
    this.camera.lookAt(this.camTarget);
    this.updateSparks(dt);
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
