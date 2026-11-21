// AZUL TIDE — main.js
// Boot, the fixed-timestep loop and the game-state machine for Port Azul.
// This module is the integration surface for every later system (police,
// missions, progression, HUD, audio): they hook in through registerSystem()
// and read/write the single shared state object described below.
//
// === THE SHARED STATE (also exposed as window.__AZUL) ======================
//   state.mode      'title' | 'playing' | 'paused' | 'gameover'
//   state.time      seconds since boot (rendering / animation clock)
//   state.tick      fixed steps simulated since boot
//   state.seed      world seed from ?seed=<n> (default 1)
//   state.shot      value of ?shot=<name>, or null — staging hook for the
//                   screenshot builder; staging code may read it in an
//                   update hook and reposition the player / camera.
//   state.city      createCity(seed) result: districtAt / isRoad / collide...
//   state.rng       deterministic rng stream for gameplay spawns
//   state.input     Input instance (down / wasPressed / moveVector / ...)
//   state.camera    { x, y } world point at the centre of the screen
//   state.player    Dario: { x, y, angle, health, mode: 'foot'|'car', car }
//   state.vehicles  { parked: Car[], traffic: Car[], playerCar: Car|null }
//   state.peds      Ped[] (see pedestrians.js for the shape)
//   state.events    event objects pushed by gameplay ({ type, x, y, ... });
//                   systems may drain or peek each step — player.js pushes
//                   'enter-car', 'carjack', 'exit-car', 'player-dead'.
//   state.alarm     { x, y, radius, ttl } | null — danger point peds flee
//   state.money     cash on hand (progression system owns changes)
//   state.wanted    wanted level 0..5 (police system owns changes)
//   state.data      free-form bag for later systems' own persistent fields
//   state.allVehicles()  -> parked + traffic + playerCar in one array
//
// === SYSTEM HOOKS ==========================================================
//   registerSystem(name, { update(state, dt), render(ctx, state, w, h) })
// update hooks run once per fixed step, after the core simulation, only in
// 'playing' mode. render hooks run every frame after the world is drawn, in
// screen space (HUD, menus, minimap...). Systems run in registration order.

import { createCity, createRng } from './city.js';
import { createInput } from './input.js';
import { createPlayer, updatePlayer } from './player.js';
import { collideCars, maintainTraffic, spawnParkedCars, updateTrafficCar } from './vehicles.js';
import { makePed, maintainPedestrians, spawnPedestrians } from './pedestrians.js';
import { renderFrame } from './render.js';

export const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : 1;
const shot = params.get('shot');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const registeredSystems = [];

export function registerSystem(name, system) {
  registeredSystems.push({ name, update: system.update || null, render: system.render || null });
  return system;
}

export const state = {
  mode: shot ? 'playing' : 'title',
  time: 0,
  tick: 0,
  seed,
  shot,
  city: null,
  rng: createRng(seed * 31 + 7),
  input: null,
  camera: { x: 0, y: 0 },
  player: null,
  vehicles: { parked: [], traffic: [], playerCar: null },
  peds: [],
  events: [],
  alarm: null,
  pendingDriverPed: null,
  trafficTimer: 0,
  pedTimer: 0,
  lastCarSpeed: 0,
  money: 0,
  wanted: 0,
  data: {},
  systems: registeredSystems,
  allVehicles() {
    const all = [...this.vehicles.parked, ...this.vehicles.traffic];
    if (this.vehicles.playerCar) all.push(this.vehicles.playerCar);
    return all;
  },
};

export function setMode(mode) {
  state.mode = mode;
  if (statusEl) {
    statusEl.textContent =
      mode === 'title' ? 'AZUL TIDE. Press Enter to play.' :
      mode === 'paused' ? 'Paused.' :
      mode === 'gameover' ? 'Game over. Press R to try again.' : 'Playing.';
  }
}

export function resetGame() {
  const city = state.city;
  state.player = createPlayer(city.spawn);
  state.vehicles.parked = spawnParkedCars(city, state.rng, 34);
  state.vehicles.traffic = [];
  state.vehicles.playerCar = null;
  state.peds = spawnPedestrians(city, state.rng, 26);
  state.events.length = 0;
  state.alarm = null;
  state.pendingDriverPed = null;
  state.money = 0;
  state.wanted = 0;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  setMode('playing');
}

// One fixed simulation step (dt === STEP). Core systems only; registered
// systems run at the end so they always see a consistent world.
function step(dt) {
  state.tick += 1;
  state.time += dt;
  const input = state.input;

  if (state.alarm) {
    state.alarm.ttl -= dt;
    if (state.alarm.ttl <= 0) state.alarm = null;
  }

  updatePlayer(state, dt);

  // A driver pulled out of a carjacked car becomes a pedestrian.
  if (state.pendingDriverPed) {
    state.peds.push(makePed(state.pendingDriverPed.x, state.pendingDriverPed.y, state.rng));
    state.pendingDriverPed = null;
  }

  for (const car of state.vehicles.traffic) {
    updateTrafficCar(car, dt, state.city, state.allVehicles(), state.player.mode === 'foot' ? state.player : null, state.rng);
  }
  maintainTraffic(state, dt);
  collideCars(state.allVehicles());
  maintainPedestrians(state, dt);

  // Registered systems (police, missions, progression, audio...).
  for (const sys of registeredSystems) {
    if (sys.update) sys.update(state, dt);
  }

  // Camera: smooth follow of the player (or the player's car).
  const focus = state.player;
  const lerp = 1 - Math.pow(0.0015, dt);
  state.camera.x += (focus.x - state.camera.x) * lerp;
  state.camera.y += (focus.y - state.camera.y) * lerp;
  const hw = canvas.width / 2;
  const hh = canvas.height / 2;
  state.camera.x = Math.max(hw - 200, Math.min(state.city.width - hw + 700, state.camera.x));
  state.camera.y = Math.max(hh - 200, Math.min(state.city.height - hh + 200, state.camera.y));

  if (state.player.dead && state.mode === 'playing') setMode('gameover');

  input.consumePressed();
}

function handleModeKeys() {
  const input = state.input;
  if (state.mode === 'title') {
    if (input.wasPressed('Enter') || input.wasPressed('Space') || input.wasPressed('MouseLeft')) resetGame();
  } else if (state.mode === 'playing') {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) setMode('paused');
  } else if (state.mode === 'paused') {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP') || input.wasPressed('Enter')) {
      setMode('playing');
      input.consumePressed();
    }
  } else if (state.mode === 'gameover') {
    if (input.wasPressed('KeyR') || input.wasPressed('Enter')) resetGame();
  }
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function drawOverlay() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.textAlign = 'center';
  if (state.mode === 'title') {
    ctx.fillStyle = 'rgba(8,26,38,0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('AZUL TIDE', w / 2, h / 2 - 90);
    ctx.fillStyle = '#f4f1de';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('Port Azul. Dario Luna owes the Sombra syndicate one last run.', w / 2, h / 2 - 40);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillStyle = '#a8dadc';
    ctx.fillText('WASD drive & walk · E enter car · Shift sprint · Space handbrake · Esc pause', w / 2, h / 2 + 6);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Press ENTER to play', w / 2, h / 2 + 58);
  } else if (state.mode === 'paused') {
    ctx.fillStyle = 'rgba(8,26,38,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4f1de';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText('PAUSED', w / 2, h / 2);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Esc to resume', w / 2, h / 2 + 36);
  } else if (state.mode === 'gameover') {
    ctx.fillStyle = 'rgba(40,8,8,0.62)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ee6c4d';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText('WASTED', w / 2, h / 2 - 20);
    ctx.fillStyle = '#f4f1de';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('The tide takes Dario — this time. Press R to run it back.', w / 2, h / 2 + 24);
  }
}

let accumulator = 0;
let last = performance.now();
let framesPainted = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  state.time += 0; // time advances inside fixed steps; render uses state.time

  handleModeKeys();
  if (state.mode === 'playing') {
    accumulator += elapsed;
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
      if (state.mode !== 'playing') {
        accumulator = 0;
        break;
      }
    }
  } else {
    accumulator = 0;
    // Title screen still idles the world clock for water animation.
    if (state.mode === 'title') state.time += elapsed;
    state.input.consumePressed();
  }

  renderFrame(ctx, state, canvas.width, canvas.height);
  for (const sys of registeredSystems) {
    if (sys.render) sys.render(ctx, state, canvas.width, canvas.height);
  }
  drawOverlay();

  framesPainted += 1;
  if (shot && framesPainted >= 3) window.__shotReady = true;
}

function boot() {
  state.city = createCity(seed);
  state.input = createInput(canvas);
  state.player = createPlayer(state.city.spawn);
  state.vehicles.parked = spawnParkedCars(state.city, state.rng, 34);
  state.peds = spawnPedestrians(state.city, state.rng, 26);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') setMode('paused');
  });
  window.__AZUL = state;
  window.__AZUL_REGISTER = registerSystem;
  if (statusEl) statusEl.textContent = 'AZUL TIDE. Press Enter to play.';
  requestAnimationFrame(frame);
}

boot();

export { registeredSystems as systems };
