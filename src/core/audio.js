// Audio entièrement synthétisé (Web Audio) : moteur, pneus, vent, chocs, effets, radio procédurale.
const PROFILES = {
  i4: { div: 30, harm: [1, 0.6, 0.45, 0.3, 0.22, 0.15, 0.1, 0.07], sub: 0.05, dist: 1.5, bright: 1.0, gain: 0.9 },
  i4turbo: { div: 30, harm: [1, 0.55, 0.4, 0.3, 0.2, 0.14, 0.1, 0.08], sub: 0.08, dist: 2, bright: 1.1, gain: 0.95 },
  rally: { div: 30, harm: [1, 0.7, 0.5, 0.4, 0.3, 0.22, 0.16, 0.12], sub: 0.12, dist: 3, bright: 1.25, gain: 1 },
  boxer: { div: 30, harm: [1, 0.4, 0.5, 0.2, 0.3, 0.1, 0.12, 0.05], sub: 0.35, dist: 2.2, bright: 0.9, gain: 1 },
  diesel: { div: 20, harm: [1, 0.8, 0.5, 0.45, 0.3, 0.25, 0.2, 0.15], sub: 0.3, dist: 3.5, bright: 0.6, gain: 1.05, rough: 0.5 },
  v6: { div: 20, harm: [1, 0.5, 0.35, 0.3, 0.2, 0.12, 0.1, 0.06], sub: 0.15, dist: 1.8, bright: 1.05, gain: 0.95 },
  v8: { div: 15, harm: [1, 0.55, 0.45, 0.3, 0.2, 0.12, 0.08, 0.05], sub: 0.55, dist: 2.6, bright: 0.85, gain: 1.05 },
  v8muscle: { div: 15, harm: [1, 0.6, 0.5, 0.35, 0.22, 0.12, 0.08, 0.05], sub: 0.8, dist: 3.8, bright: 0.8, gain: 1.1, rough: 0.25 },
  v10: { div: 12, harm: [1, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15], sub: 0.2, dist: 2.2, bright: 1.35, gain: 0.95 },
  v12: { div: 10, harm: [1, 0.4, 0.35, 0.3, 0.26, 0.22, 0.18, 0.14, 0.1, 0.08], sub: 0.12, dist: 1.6, bright: 1.3, gain: 0.95 },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.5, sfx: 0.9 };
    this.radioStation = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.setVolumes(this.vol);
    // tampon de bruit blanc
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._makeLoops();
  }

  setVolumes(v) {
    this.vol = { ...this.vol, ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05);
  }

  noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random(); s.loopEnd = 2;
    return s;
  }

  _makeLoops() {
    const c = this.ctx;
    const mk = (type, freq, q) => {
      const src = this.noiseSrc();
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfx);
      src.start();
      return { f, g };
    };
    this.tire = mk('bandpass', 950, 7);
    this.tire2 = mk('bandpass', 2100, 9);
    this.gravel = mk('lowpass', 420, 0.7);
    this.crunch = mk('bandpass', 2600, 1.2);
    this.wind = mk('lowpass', 400, 0.5);
    this.water = mk('lowpass', 700, 0.8);
    this.nitroS = mk('highpass', 1800, 0.6);
    // klaxon
    this.horn = c.createGain(); this.horn.gain.value = 0;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2200;
    for (const f of [415, 523]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    hf.connect(this.horn).connect(this.sfx);
    // sirène
    this.siren = c.createGain(); this.siren.gain.value = 0;
    this.sirenOsc = c.createOscillator(); this.sirenOsc.type = 'sawtooth'; this.sirenOsc.frequency.value = 700;
    const sf = c.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2500;
    this.sirenOsc.connect(sf).connect(this.siren).connect(this.sfx); this.sirenOsc.start();
  }

  // ------------------------------------------------------------ moteur
  createEngine(profileName) {
    if (!this.ctx) return null;
    const c = this.ctx;
    const P = PROFILES[profileName] || PROFILES.i4;
    const real = new Float32Array(P.harm.length + 1), imag = new Float32Array(P.harm.length + 1);
    P.harm.forEach((a, i) => { imag[i + 1] = a; });
    const wave = c.createPeriodicWave(real, imag);
    const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
    o1.setPeriodicWave(wave); o2.setPeriodicWave(wave); o3.type = 'triangle';
    const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain();
    g1.gain.value = 0.5; g2.gain.value = 0.35; g3.gain.value = P.sub;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    const k = P.dist;
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * k) / Math.tanh(k); }
    shaper.curve = curve;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    const out = c.createGain(); out.gain.value = 0;
    // admission (bruit filtré)
    const ns = this.noiseSrc();
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 2;
    const ng = c.createGain(); ng.gain.value = 0;
    ns.connect(nf).connect(ng).connect(lp);
    // turbo
    const tOsc = c.createOscillator(); tOsc.type = 'sine';
    const tg = c.createGain(); tg.gain.value = 0;
    tOsc.connect(tg).connect(this.sfx);
    o1.connect(g1); o2.connect(g2); o3.connect(g3);
    g1.connect(shaper); g2.connect(shaper); g3.connect(shaper);
    shaper.connect(lp).connect(out).connect(this.sfx);
    o1.start(); o2.start(); o3.start(); ns.start(); tOsc.start();
    let lastThrottle = 0, boost = 0;
    const self = this;
    return {
      update(rpm, throttle, redline, turbo, dt) {
        const t = c.currentTime;
        const f = Math.max(20, rpm / P.div);
        const rough = P.rough ? 1 + (Math.random() - 0.5) * P.rough * 0.06 : 1;
        o1.frequency.setTargetAtTime(f * rough, t, 0.012);
        o2.frequency.setTargetAtTime(f * 1.006, t, 0.012);
        o3.frequency.setTargetAtTime(f * 0.5, t, 0.012);
        nf.frequency.setTargetAtTime(f * 3.2, t, 0.02);
        const rn = rpm / redline;
        lp.frequency.setTargetAtTime((500 + (2600 * throttle + 1400) * rn) * P.bright, t, 0.03);
        out.gain.setTargetAtTime((0.13 + throttle * 0.2 + rn * 0.1) * P.gain, t, 0.03);
        ng.gain.setTargetAtTime(0.05 + throttle * 0.12, t, 0.05);
        if (turbo) {
          boost += ((throttle > 0.5 ? rn : 0) - boost) * Math.min(1, dt * 2.5);
          tOsc.frequency.setTargetAtTime(1800 + boost * 4200, t, 0.05);
          tg.gain.setTargetAtTime(boost * 0.025, t, 0.05);
          if (lastThrottle > 0.7 && throttle < 0.2 && boost > 0.4) { self.blowoff(); boost = 0; }
        }
        lastThrottle = throttle;
      },
      stop() {
        const t = c.currentTime;
        out.gain.setTargetAtTime(0, t, 0.05); tg.gain.setTargetAtTime(0, t, 0.05);
        setTimeout(() => { for (const n of [o1, o2, o3, ns, tOsc]) try { n.stop(); } catch { /* */ } }, 400);
      },
    };
  }

  // ------------------------------------------------------------ ambiance continue
  updateAmbience({ skid = 0, gravel = 0, speed = 0, water = 0, nitro = false, horn = false, siren = false, sirenT = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tire.g.gain.setTargetAtTime(Math.min(0.5, Math.pow(skid, 1.4) * 0.45), t, 0.04);
    this.tire2.g.gain.setTargetAtTime(Math.min(0.2, Math.pow(skid, 1.6) * 0.15), t, 0.04);
    this.tire.f.frequency.setTargetAtTime(850 + Math.min(speed, 40) * 6, t, 0.1);
    this.gravel.g.gain.setTargetAtTime(Math.min(0.35, gravel * speed / 60), t, 0.08);
    this.crunch.g.gain.setTargetAtTime(Math.min(0.08, gravel * speed / 250), t, 0.08);
    const w = Math.min(1, speed / 75);
    this.wind.g.gain.setTargetAtTime(w * w * 0.32, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(250 + speed * 14, t, 0.1);
    this.water.g.gain.setTargetAtTime(water * 0.4, t, 0.1);
    this.nitroS.g.gain.setTargetAtTime(nitro ? 0.12 : 0, t, 0.05);
    this.horn.gain.setTargetAtTime(horn ? 0.22 : 0, t, 0.02);
    this.siren.gain.setTargetAtTime(siren ? 0.12 : 0, t, 0.05);
    if (siren) this.sirenOsc.frequency.setTargetAtTime(700 + 450 * (0.5 + 0.5 * Math.sin(sirenT * 2.4)), t, 0.03);
  }

  silenceAmbience() { this.updateAmbience({}); }

  // ------------------------------------------------------------ sons ponctuels
  _burst(dur, type, freq, gain, q = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc();
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t); s.stop(t + dur + 0.05);
  }

  impact(intensity) {
    if (!this.ctx) return;
    const a = Math.min(1, intensity / 15);
    this._burst(0.25 + a * 0.4, 'lowpass', 300 + a * 900, 0.3 + a * 0.6);
    if (intensity > 6) this._burst(0.15, 'bandpass', 3200, 0.15 * a, 2);
  }

  blowoff() { this._burst(0.35, 'bandpass', 2400, 0.18, 1.5); }
  backfire() { this._burst(0.08, 'lowpass', 600, 0.4); }
  splash() { this._burst(1.2, 'lowpass', 900, 0.6); }

  beep(freq = 880, dur = 0.12, type = 'square', gain = 0.15) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  }

  jingle(notes, step = 0.1, type = 'triangle', gain = 0.16) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    notes.forEach((n, i) => {
      const t = t0 + i * step;
      const o = c.createOscillator(); o.type = type; o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + step * 1.8);
      o.connect(g).connect(this.sfx); o.start(t); o.stop(t + step * 2);
    });
  }

  checkpoint() { this.jingle([76, 83], 0.07, 'square', 0.1); }
  success() { this.jingle([72, 76, 79, 84, 88], 0.09, 'triangle', 0.18); }
  fail() { this.jingle([64, 60, 55], 0.14, 'sawtooth', 0.1); }
  cash() { this.jingle([84, 88, 91], 0.05, 'square', 0.08); }
  click() { this.beep(1400, 0.03, 'square', 0.05); }

  // ------------------------------------------------------------ radio procédurale (gamme Hijaz)
  setRadio(station) {
    this.radioStation = station;
    if (!this.ctx) return;
    if (station === 0) { this._stopRadio(); return; }
    if (!this.radio) this._startRadio();
    this.radio.style = station;
  }

  _stopRadio() { if (this.radio) { clearInterval(this.radio.timer); this.radio = null; } }

  _startRadio() {
    const c = this.ctx;
    const r = { step: 0, next: c.currentTime + 0.1, style: 1, bar: 0, seed: 1 };
    const rnd = () => { r.seed = (r.seed * 16807) % 2147483647; return r.seed / 2147483647; };
    const hijaz = [0, 1, 4, 5, 7, 8, 10, 12];
    let melody = [];
    const newPhrase = () => { melody = []; for (let i = 0; i < 16; i++) melody.push(rnd() < 0.55 ? hijaz[Math.floor(rnd() * 8)] + (rnd() < 0.2 ? 12 : 0) : null); };
    newPhrase();
    const note = (t, midi, dur, type, gain, filt = 2000) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(f).connect(g).connect(this.musicBus); o.start(t); o.stop(t + dur + 0.05);
    };
    const perc = (t, freq, dur, gain, type = 'bandpass', q = 3) => {
      const s = this.noiseSrc();
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(g).connect(this.musicBus); s.start(t); s.stop(t + dur + 0.05);
    };
    const kick = (t) => {
      const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 0.35);
    };
    r.timer = setInterval(() => {
      const bpm = r.style === 1 ? 104 : 126;
      const sp = 60 / bpm / 4;
      while (r.next < c.currentTime + 0.25) {
        const t = r.next, s = r.step % 16;
        const root = 50 + (r.bar % 4 === 2 ? 5 : r.bar % 4 === 3 ? 7 : 0);
        // darbouka : dum (grave) / tek (aigu)
        if (r.style === 1) {
          if (s === 0 || s === 6 || s === 10) perc(t, 120, 0.25, 0.45, 'lowpass', 1);
          if (s === 4 || s === 12) perc(t, 2800, 0.08, 0.25);
          if (s % 2 === 1 && rnd() < 0.6) perc(t, 4200, 0.04, 0.1);
        } else {
          if (s % 4 === 0) kick(t);
          if (s === 4 || s === 12) perc(t, 1800, 0.18, 0.3, 'bandpass', 0.8);
          if (s % 2 === 0) perc(t, 7000, 0.03, 0.06, 'highpass', 0.5);
        }
        if (s % 4 === 0) note(t, root - 12, sp * 3.5, 'sawtooth', 0.12, 500);
        const m = melody[s];
        if (m !== null) note(t, root + 12 + m, sp * 2.2, r.style === 1 ? 'triangle' : 'square', r.style === 1 ? 0.09 : 0.05, r.style === 1 ? 3000 : 1800);
        r.step++;
        if (r.step % 16 === 0) { r.bar++; if (r.bar % 2 === 0) newPhrase(); }
        r.next += sp;
      }
    }, 60);
    this.radio = r;
  }
}
