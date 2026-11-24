// AZUL TIDE — audio.js
// All-synthesized WebAudio for Port Azul: no audio files, no network. An
// engine hum that follows the player's car speed, a two-tone police siren
// while a pursuit is live, gunshot and explosion noise bursts, pickup and
// mission chimes, UI clicks, and three radio stations as looping note
// patterns (different scale, tempo and waveform each) while driving.
//
// The AudioContext is created lazily on the first real input gesture and
// every call is wrapped in try/catch, so headless runs and autoplay policies
// can never throw or log errors here.

let actx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let radioNextAt = 0;
let radioStep = 0;
let failed = false;

function ensureContext(state) {
  if (actx || failed) return actx;
  const input = state.input;
  const gestured = input && (input.anyKey || input.mouseDown);
  if (!gestured) return null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    actx = new AC();
    master = actx.createGain();
    master.gain.value = 0.5;
    master.connect(actx.destination);
    engineOsc = actx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = actx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = actx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    sirenOsc = actx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 700;
    sirenGain = actx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  } catch (err) {
    failed = true;
    actx = null;
  }
  return actx;
}

function tone(freq, dur, type, vol, slideTo, delay) {
  if (!actx || !master) return;
  try {
    const t0 = actx.currentTime + (delay || 0);
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol || 0.12, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (err) { /* audio is decorative; never break the game */ }
}

function noiseBurst(dur, vol, filterFreq, delay) {
  if (!actx || !master) return;
  try {
    const t0 = actx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buffer = actx.createBuffer(1, len, actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = actx.createBufferSource();
    src.buffer = buffer;
    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1800;
    const gain = actx.createGain();
    gain.gain.setValueAtTime(vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  } catch (err) { /* ignore */ }
}

function playCue(cue) {
  switch (cue) {
    case 'shot':
      noiseBurst(0.13, 0.32, 2600);
      tone(150, 0.09, 'square', 0.1, 60);
      break;
    case 'shot-far':
      noiseBurst(0.1, 0.1, 1400);
      break;
    case 'explosion':
      noiseBurst(0.55, 0.42, 500);
      tone(70, 0.5, 'sine', 0.3, 32);
      break;
    case 'thud':
      noiseBurst(0.08, 0.14, 700);
      break;
    case 'swing':
      noiseBurst(0.06, 0.05, 3200);
      break;
    case 'click':
      tone(880, 0.05, 'square', 0.06);
      break;
    case 'pickup':
      tone(660, 0.09, 'sine', 0.12);
      tone(990, 0.12, 'sine', 0.12, null, 0.07);
      break;
    case 'chime':
      tone(523, 0.12, 'triangle', 0.14);
      tone(784, 0.16, 'triangle', 0.14, null, 0.09);
      break;
    case 'complete':
      tone(523, 0.11, 'triangle', 0.15);
      tone(659, 0.11, 'triangle', 0.15, null, 0.1);
      tone(784, 0.2, 'triangle', 0.16, null, 0.2);
      break;
    case 'package':
      tone(1046, 0.08, 'sine', 0.13);
      tone(1318, 0.08, 'sine', 0.13, null, 0.06);
      tone(1568, 0.14, 'sine', 0.14, null, 0.12);
      break;
    case 'cash':
      tone(880, 0.06, 'square', 0.07);
      tone(1174, 0.1, 'square', 0.07, null, 0.05);
      break;
    case 'fail':
      tone(392, 0.16, 'triangle', 0.13);
      tone(311, 0.24, 'triangle', 0.13, null, 0.13);
      break;
    default:
      break;
  }
}

const STATION_PATTERNS = [
  { scale: [0, 2, 4, 7, 9], base: 262, step: 0.21, wave: 'triangle', bass: 131 },
  { scale: [0, 3, 5, 7, 10], base: 220, step: 0.16, wave: 'square', bass: 110 },
  { scale: [0, 1, 5, 6, 10], base: 196, step: 0.27, wave: 'sawtooth', bass: 98 },
];

function updateRadio(state) {
  if (!actx) return;
  const driving = state.player.mode === 'car';
  const radio = state.data.radio;
  if (!driving || !radio) return;
  const pat = STATION_PATTERNS[radio.index % STATION_PATTERNS.length];
  const now = actx.currentTime;
  if (now < radioNextAt) return;
  radioNextAt = now + pat.step;
  radioStep += 1;
  try {
    const degree = pat.scale[(radioStep * 2 + Math.floor(radioStep / 4)) % pat.scale.length];
    const octave = radioStep % 16 >= 12 ? 2 : 1;
    const freq = pat.base * Math.pow(2, degree / 12) * octave;
    tone(freq, pat.step * 0.92, pat.wave, 0.045);
    if (radioStep % 4 === 0) tone(pat.bass, pat.step * 2.4, 'sine', 0.06);
  } catch (err) { /* ignore */ }
}

function update(state) {
  ensureContext(state);
  // Drain the shared cue queue even without a context (cues are dropped,
  // never accumulated).
  const queue = state.data.audioQueue;
  if (queue && queue.length) {
    const cues = queue.splice(0, queue.length);
    if (actx) for (const cue of cues) playCue(cue);
  }
  if (!actx) return;
  try {
    if (actx.state === 'suspended') actx.resume();
    // Engine hum follows the player's car.
    const car = state.vehicles.playerCar;
    if (engineOsc && engineGain) {
      const speed = car && state.player.mode === 'car' ? Math.abs(car.speed) : 0;
      const target = speed > 4 ? 0.05 + Math.min(0.05, speed / 9000) : 0;
      engineGain.gain.setTargetAtTime(target, actx.currentTime, 0.09);
      engineOsc.frequency.setTargetAtTime(52 + speed * 0.42, actx.currentTime, 0.06);
    }
    // Two-tone siren while a pursuit is live.
    if (sirenOsc && sirenGain) {
      const hot = state.wanted > 0 && state.data.pursuit === 'PURSUIT';
      sirenGain.gain.setTargetAtTime(hot ? 0.028 : 0, actx.currentTime, 0.12);
      if (hot) {
        const toneFreq = Math.floor(state.time * 2.6) % 2 === 0 ? 660 : 880;
        sirenOsc.frequency.setTargetAtTime(toneFreq, actx.currentTime, 0.03);
      }
    }
  } catch (err) { /* ignore */ }
  updateRadio(state);
}

export const audioSystem = { update };
