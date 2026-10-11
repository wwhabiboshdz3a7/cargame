// Effets visuels partagés : traces de pneus, particules (fumée, poussière, étincelles).
import * as THREE from 'three';
import { smokeSprite } from '../world/textures.js';

export class SkidMarks {
  constructor(scene, max = 4000) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.alpha = new Float32Array(max * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
      uniforms: { uColor: { value: new THREE.Color(0x111111) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA); }',
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.head = 0;
    this.last = new Map();
  }

  // ajoute un segment pour la roue `key`
  add(key, p, side, width, a) {
    const prev = this.last.get(key);
    this.last.set(key, { x: p.x, y: p.y, z: p.z, sx: side.x, sz: side.z, a });
    if (!prev) return;
    const d2 = (prev.x - p.x) ** 2 + (prev.z - p.z) ** 2;
    if (d2 < 0.04) { this.last.set(key, prev); return; }
    if (d2 > 9) return;
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const hw = width / 2;
    const P = this.pos, o = i * 12;
    P[o] = prev.x - prev.sx * hw; P[o + 1] = prev.y; P[o + 2] = prev.z - prev.sz * hw;
    P[o + 3] = prev.x + prev.sx * hw; P[o + 4] = prev.y; P[o + 5] = prev.z + prev.sz * hw;
    P[o + 6] = p.x - side.x * hw; P[o + 7] = p.y; P[o + 8] = p.z - side.z * hw;
    P[o + 9] = p.x + side.x * hw; P[o + 10] = p.y; P[o + 11] = p.z + side.z * hw;
    const A = this.alpha;
    A[i * 4] = A[i * 4 + 1] = prev.a * 0.7; A[i * 4 + 2] = A[i * 4 + 3] = a * 0.7;
    this.dirty = true;
  }

  cut(key) { this.last.delete(key); }

  update() {
    if (!this.dirty) return;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
    this.dirty = false;
  }

  clear() { this.alpha.fill(0); this.last.clear(); this.dirty = true; }
}

export class Particles {
  constructor(scene, max = 900) {
    this.max = max;
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.off = new Float32Array(max * 3);
    this.data = new Float32Array(max * 4); // size, alpha, rot, additive
    this.col = new Float32Array(max * 3);
    geo.setAttribute('iOff', new THREE.InstancedBufferAttribute(this.off, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iData', new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: smokeSprite() }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
      vertexShader: `
        attribute vec3 iOff; attribute vec4 iData; attribute vec3 iCol;
        varying vec2 vUv; varying float vA; varying vec3 vC; varying float vFog;
        uniform float fogDensity;
        void main(){
          vUv = uv; vA = iData.y; vC = iCol;
          vec4 mv = modelViewMatrix * vec4(iOff, 1.0);
          float c = cos(iData.z), s = sin(iData.z);
          vec2 p = mat2(c, -s, s, c) * position.xy * iData.x;
          mv.xy += p;
          float d = length(mv.xyz);
          vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 fogColor;
        varying vec2 vUv; varying float vA; varying vec3 vC; varying float vFog;
        void main(){
          vec4 t = texture2D(map, vUv);
          vec3 col = mix(vC, fogColor, vFog);
          gl_FragColor = vec4(col, t.a * vA);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.parts = [];
    this.addMat = this.mat.clone();
    this.addMat.blending = THREE.AdditiveBlending;
    this.sparks = new THREE.Mesh(geo.clone(), this.addMat);
    this.sparks.frustumCulled = false;
    this.sparkParts = [];
    this.soff = new Float32Array(300 * 3); this.sdata = new Float32Array(300 * 4); this.scol = new Float32Array(300 * 3);
    this.sparks.geometry.setAttribute('iOff', new THREE.InstancedBufferAttribute(this.soff, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks.geometry.setAttribute('iData', new THREE.InstancedBufferAttribute(this.sdata, 4).setUsage(THREE.DynamicDrawUsage));
    this.sparks.geometry.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.scol, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks.geometry.instanceCount = 0;
    scene.add(this.sparks);
  }

  emit(p, v, { size = 1.5, grow = 2.5, life = 2, color = [0.85, 0.85, 0.85], alpha = 0.5, spark = false } = {}) {
    const list = spark ? this.sparkParts : this.parts;
    const cap = spark ? 300 : this.max;
    if (list.length >= cap) list.shift();
    list.push({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, size, grow, life, t: 0, color, alpha, rot: Math.random() * 6.28, spark });
  }

  update(dt, scene) {
    if (scene.fog) { this.mat.uniforms.fogColor.value.copy(scene.fog.color); this.mat.uniforms.fogDensity.value = scene.fog.density; }
    const write = (list, off, data, col, mesh, drag, grav) => {
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const q = list[i];
        q.t += dt;
        if (q.t >= q.life) { list.splice(i, 1); continue; }
        q.vx *= 1 - drag * dt; q.vy = q.vy * (1 - drag * dt) + grav * dt; q.vz *= 1 - drag * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      }
      for (const q of list) {
        const k = q.t / q.life;
        off[n * 3] = q.x; off[n * 3 + 1] = q.y; off[n * 3 + 2] = q.z;
        data[n * 4] = q.size + q.grow * k * q.life * (q.spark ? 0 : 1);
        data[n * 4 + 1] = q.alpha * (q.spark ? 1 - k : Math.min(1, k * 6) * (1 - k));
        data[n * 4 + 2] = q.rot + k;
        col[n * 3] = q.color[0]; col[n * 3 + 1] = q.color[1]; col[n * 3 + 2] = q.color[2];
        n++;
      }
      mesh.geometry.instanceCount = n;
      mesh.geometry.attributes.iOff.needsUpdate = true;
      mesh.geometry.attributes.iData.needsUpdate = true;
      mesh.geometry.attributes.iCol.needsUpdate = true;
    };
    write(this.parts, this.off, this.data, this.col, this.mesh, 1.2, 0.6);
    write(this.sparkParts, this.soff, this.sdata, this.scol, this.sparks, 0.5, -9.8);
  }

  clear() { this.parts.length = 0; this.sparkParts.length = 0; }
}
