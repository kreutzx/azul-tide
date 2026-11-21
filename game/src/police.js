// AZUL TIDE — police.js
// The Port Azul police: a wanted system (0-5 stars) with patrol pursuit cars,
// roadblocks at three stars, a helicopter at four, and a line-of-sight model
// that lets a careful driver break contact, EVADE, and watch the stars decay.
//
// This system owns state.wanted and exposes state.data.pursuit as one of
// 'PURSUIT' | 'EVADING' | 'EVADED' for the HUD. Police cars live in
// state.data.police.cars (not in the traffic list) and are drawn here with the
// shared drawCar renderer. Crimes arrive through state.events (carjack),
// state.data.gunfireAt (combat), car-health drops (collisions) and direct
// raiseWanted() calls from missions.

import { drawCar } from './render.js';
import { driveCar, makeCar } from './vehicles.js';
import { damagePlayer } from './player.js';
import { setMode } from './main.js';

const POLICE_COLORS = ['#22354f', '#1d2f47', '#263d5c'];
let policeSeq = 1;

export function raiseWanted(state, amount, reason) {
  const before = state.wanted;
  state.wanted = Math.max(0, Math.min(5, state.wanted + amount));
  if (state.wanted > before) {
    const pd = ensurePolice(state);
    pd.lastCrimeAt = state.time;
    pd.crimeReason = reason || pd.crimeReason;
    if (state.wanted >= 1 && pd.state === 'EVADED') pd.state = 'PURSUIT';
  }
}

function ensurePolice(state) {
  if (!state.data.police) {
    state.data.police = {
      cars: [],
      heli: null,
      roadblocks: [],
      state: 'EVADED',
      evadeT: 0,
      decayT: 0,
      spawnT: 0,
      heliSpawnT: 0,
      roadblockT: 0,
      bustT: 0,
      crimeCooldown: 0,
      lastCrimeAt: -99,
      crimeReason: '',
      lastPlayerCarHealth: 100,
      gunfireSeenAt: -99,
    };
    state.data.pursuit = 'EVADED';
  }
  return state.data.police;
}

function makePoliceCar(state, x, y, angle) {
  const car = makeCar('sedan', x, y, angle, state.rng);
  car.color = POLICE_COLORS[policeSeq % POLICE_COLORS.length];
  policeSeq += 1;
  car.isPolice = true;
  car.driver = 'police';
  car.health = 130;
  car.targetSpeed = 380;
  return car;
}

function spawnPointNear(state, minDist, maxDist) {
  const p = state.player;
  for (let tries = 0; tries < 12; tries++) {
    const rp = state.city.randomRoadPoint(state.rng);
    const dx = rp.x - p.x;
    const dy = rp.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= minDist && d <= maxDist) return rp;
  }
  const road = state.city.nearestRoadPoint(p.x, p.y);
  return { x: road.x + 480, y: road.y, axis: road.axis, line: road.line };
}

function spawnPoliceCar(state, pd) {
  const p = state.player;
  const rp = spawnPointNear(state, 430, 760);
  const angle = Math.atan2(p.y - rp.y, p.x - rp.x);
  const car = makePoliceCar(state, rp.x, rp.y, angle);
  car.speed = 120;
  pd.cars.push(car);
  return car;
}

// Exposed for the screenshot staging system: build a roadblock right now.
export function spawnRoadblock(state) {
  const pd = ensurePolice(state);
  const p = state.player;
  const heading = p.mode === 'car' && p.car ? p.car.angle : p.angle;
  const aheadX = p.x + Math.cos(heading) * 430;
  const aheadY = p.y + Math.sin(heading) * 430;
  const road = state.city.nearestRoadPoint(aheadX, aheadY);
  const block = { x: road.x, y: road.y, axis: road.axis, cars: [], barriers: [], ttl: 40 };
  const perp = road.axis === 'v' ? 0 : Math.PI / 2;
  for (let i = -1; i <= 1; i++) {
    const off = i * 44;
    const bx = road.axis === 'v' ? road.x : road.x + off;
    const by = road.axis === 'v' ? road.y + off : road.y;
    const car = makePoliceCar(state, bx, by, perp);
    car.parked = true;
    car.speed = 0;
    car.roadblock = true;
    block.cars.push(car);
    pd.cars.push(car);
  }
  for (let i = -2; i <= 2; i++) {
    const off = i * 30;
    block.barriers.push({
      x: road.axis === 'v' ? road.x + 26 : road.x + off,
      y: road.axis === 'v' ? road.y + off : road.y + 26,
      angle: perp,
    });
  }
  pd.roadblocks.push(block);
  return block;
}

function losClear(state, fromX, fromY) {
  const p = state.player;
  const dx = p.x - fromX;
  const dy = p.y - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist > 560) return false;
  const steps = Math.max(2, Math.floor(dist / 42));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sx = fromX + dx * t;
    const sy = fromY + dy * t;
    if (state.city.isSolid(sx, sy) && !state.city.isRoad(sx, sy)) return false;
  }
  return true;
}

function playerHidden(state) {
  if (state.data.hidden) return true;
  if (state.data.inSafehouse) return true;
  const p = state.player;
  for (const loc of state.city.locations) {
    if (loc.kind !== 'garage') continue;
    const dx = p.x - loc.x;
    const dy = p.y - loc.y;
    if (dx * dx + dy * dy < 55 * 55) return true;
  }
  return false;
}

function steerToward(state, car, tx, ty, dt, topSpeed) {
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.9));
  let throttle = 0;
  if (dist > 46) throttle = Math.abs(diff) > 2.2 ? -0.4 : 1;
  else if (dist > 20) throttle = 0.35;
  else throttle = car.speed > 14 ? -0.7 : 0;
  if (car.speed > topSpeed) throttle = Math.min(throttle, -0.3);
  driveCar(car, dt, { throttle, steer, handbrake: Math.abs(diff) > 1.4 && car.speed > 160 }, state.city);
  return dist;
}

function updatePoliceCar(state, pd, car, dt) {
  if (car.roadblock) {
    car.speed = 0;
    return;
  }
  const p = state.player;
  // Aim at a point just ahead of the player to cut corners and block.
  const lead = Math.min(90, Math.abs(p.speed || 0) * 0.35);
  const tx = p.x + Math.cos(p.angle) * lead * 0.4;
  const ty = p.y + Math.sin(p.angle) * lead * 0.4;
  const dist = steerToward(state, car, tx, ty, dt, 400);
  // Ramming pressure: a close police car nudges the player's car and, on
  // foot, crowds Dario so the bust timer can build.
  const pc = state.vehicles.playerCar;
  if (pc && dist < (car.radius + pc.radius) * 0.85) {
    pc.health = Math.max(0, pc.health - 4 * dt);
    car.speed *= 0.92;
  }
  if (car.health <= 0) {
    car.dead = true;
    if (state.data.audioQueue) state.data.audioQueue.push('explosion');
    state.events.push({ type: 'police-down', x: car.x, y: car.y, carId: car.id });
  }
}

function updateHelicopter(state, pd, dt) {
  if (state.wanted >= 4) {
    if (!pd.heli) {
      const p = state.player;
      pd.heli = { x: p.x - 420, y: p.y - 300, angle: 0, spotX: p.x, spotY: p.y, spawnT: 4 };
    }
    const heli = pd.heli;
    const p = state.player;
    const tx = p.x + Math.cos(p.angle) * 60;
    const ty = p.y + Math.sin(p.angle) * 60;
    const dx = tx - heli.x;
    const dy = ty - heli.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = 265;
    if (d > 26) {
      heli.x += (dx / d) * speed * dt;
      heli.y += (dy / d) * speed * dt;
      heli.angle = Math.atan2(dy, dx);
    }
    heli.spotX += (p.x - heli.spotX) * Math.min(1, dt * 2.4);
    heli.spotY += (p.y - heli.spotY) * Math.min(1, dt * 2.4);
    // The helicopter directs ground units: periodically call in a fresh car.
    heli.spawnT -= dt;
    if (heli.spawnT <= 0) {
      heli.spawnT = 6.5;
      if (pd.cars.filter((c) => !c.roadblock).length < 9) spawnPoliceCar(state, pd);
    }
  } else if (pd.heli) {
    // Heat dropped: the helicopter peels away and is gone.
    pd.heli.x += Math.cos(pd.heli.angle) * 320 * dt;
    pd.heli.y += Math.sin(pd.heli.angle) * 320 * dt;
    const dx = pd.heli.x - state.player.x;
    const dy = pd.heli.y - state.player.y;
    if (dx * dx + dy * dy > 1100 * 1100) pd.heli = null;
  }
}

function processCrimes(state, pd, dt) {
  pd.crimeCooldown = Math.max(0, pd.crimeCooldown - dt);
  for (const ev of state.events) {
    if (ev.type === 'carjack' && pd.crimeCooldown <= 0) {
      raiseWanted(state, 1, 'carjack');
      pd.crimeCooldown = 2.5;
    }
  }
  if (state.data.gunfireAt && state.data.gunfireAt !== pd.gunfireSeenAt) {
    pd.gunfireSeenAt = state.data.gunfireAt;
    if (pd.crimeCooldown <= 0) {
      raiseWanted(state, 1, 'gunfire');
      pd.crimeCooldown = 4;
    }
  }
  if (state.data.crimeQueue && state.data.crimeQueue.length) {
    for (const crime of state.data.crimeQueue) {
      if (crime === 'hit-and-run' || crime === 'assault' || crime === 'murder') {
        raiseWanted(state, 1, crime);
      } else if (crime === 'grand-theft') {
        raiseWanted(state, 2, crime);
      }
    }
    state.data.crimeQueue.length = 0;
  }
  // Collision crime: a sudden drop in the player's car health reads as a
  // crash witnesses would report.
  const pc = state.vehicles.playerCar;
  const hp = pc ? pc.health : 100;
  if (pc && pd.lastPlayerCarHealth - hp > 12 && Math.abs(pc.speed) > 60 && pd.crimeCooldown <= 0) {
    raiseWanted(state, 1, 'collision');
    pd.crimeCooldown = 5;
  }
  pd.lastPlayerCarHealth = hp;
}

function updatePursuitState(state, pd, dt) {
  if (state.wanted <= 0) {
    pd.state = 'EVADED';
    state.data.pursuit = pd.state;
    return;
  }
  let seen = false;
  if (!playerHidden(state)) {
    for (const car of pd.cars) {
      if (car.dead) continue;
      if (losClear(state, car.x, car.y)) { seen = true; break; }
    }
    if (!seen && pd.heli && losClear(state, pd.heli.x, pd.heli.y)) seen = true;
  }
  if (seen) {
    pd.state = 'PURSUIT';
    pd.evadeT = Math.max(3.2, 7 - state.wanted * 0.6);
    pd.decayT = 0;
  } else if (pd.state === 'PURSUIT') {
    pd.state = 'EVADING';
  }
  if (pd.state === 'EVADING') {
    pd.evadeT -= dt;
    if (pd.evadeT <= 0) {
      pd.state = 'EVADED';
    }
  } else if (pd.state === 'EVADED') {
    pd.decayT += dt;
    if (pd.decayT > 3.6) {
      pd.decayT = 0;
      state.wanted = Math.max(0, state.wanted - 1);
      if (state.wanted === 0) {
        for (const car of pd.cars) car.leaving = true;
      }
    }
  }
  state.data.pursuit = pd.state;
}

function updateBust(state, pd, dt) {
  const p = state.player;
  const slowOrFoot = p.mode === 'foot' || Math.abs(p.car ? p.car.speed : 0) < 12;
  let closers = 0;
  if (slowOrFoot && state.wanted > 0) {
    for (const car of pd.cars) {
      if (car.dead || car.roadblock) continue;
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      if (dx * dx + dy * dy < 95 * 95) closers += 1;
    }
  }
  if (closers >= 2 || (closers >= 1 && p.mode === 'foot' && state.wanted >= 3)) {
    pd.bustT += dt;
    state.data.bustProgress = Math.min(1, pd.bustT / 3);
    if (pd.bustT >= 3) {
      state.data.busted = true;
      state.data.bustProgress = 0;
      pd.bustT = 0;
      setMode('gameover');
    }
  } else {
    pd.bustT = Math.max(0, pd.bustT - dt * 1.6);
    state.data.bustProgress = Math.min(1, pd.bustT / 3);
  }
}

function update(state, dt) {
  const pd = ensurePolice(state);
  state.data.spawnRoadblock = () => spawnRoadblock(state);
  processCrimes(state, pd, dt);

  const desired = [0, 2, 3, 4, 6, 8][state.wanted] || 0;
  pd.spawnT -= dt;
  const active = pd.cars.filter((c) => !c.roadblock && !c.dead && !c.leaving).length;
  if (state.wanted > 0 && pd.state !== 'EVADED' && active < desired && pd.spawnT <= 0) {
    pd.spawnT = 1.1;
    spawnPoliceCar(state, pd);
  }
  if (state.wanted === 0 && pd.spawnT <= 0) pd.spawnT = 0.4;

  // Roadblocks at three stars and up, re-formed as the chase moves on.
  pd.roadblockT -= dt;
  for (let i = pd.roadblocks.length - 1; i >= 0; i--) {
    const block = pd.roadblocks[i];
    block.ttl -= dt;
    const dx = block.x - state.player.x;
    const dy = block.y - state.player.y;
    if (block.ttl <= 0 || dx * dx + dy * dy > 720 * 720) {
      for (const car of block.cars) car.leaving = true;
      pd.roadblocks.splice(i, 1);
    }
  }
  if (state.wanted >= 3 && state.player.mode === 'car' && pd.roadblocks.length === 0 && pd.roadblockT <= 0) {
    spawnRoadblock(state);
    pd.roadblockT = 16;
  }

  updateHelicopter(state, pd, dt);

  for (let i = pd.cars.length - 1; i >= 0; i--) {
    const car = pd.cars[i];
    if (car.dead) {
      pd.cars.splice(i, 1);
      continue;
    }
    if (car.leaving) {
      steerToward(state, car, car.x + Math.cos(car.angle) * 500, car.y + Math.sin(car.angle) * 500, dt, 330);
      const dx = car.x - state.player.x;
      const dy = car.y - state.player.y;
      if (dx * dx + dy * dy > 900 * 900) pd.cars.splice(i, 1);
      continue;
    }
    updatePoliceCar(state, pd, car, dt);
  }

  updatePursuitState(state, pd, dt);
  updateBust(state, pd, dt);
  void damagePlayer;
}

function render(ctx, state, w, h) {
  const pd = state.data.police;
  if (!pd) return;
  const cam = state.camera;
  ctx.save();
  ctx.translate(w / 2 - cam.x, h / 2 - cam.y);

  // Roadblock barriers: striped barricades across the asphalt.
  for (const block of pd.roadblocks) {
    for (const b of block.barriers) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = '#e9c46a';
      ctx.fillRect(-16, -5, 32, 10);
      ctx.fillStyle = '#17323e';
      ctx.fillRect(-10, -5, 6, 10);
      ctx.fillRect(2, -5, 6, 10);
      ctx.restore();
    }
  }

  for (const car of pd.cars) drawCar(ctx, car);

  // Flashing light bars on every police car.
  const phase = Math.floor(state.time * 5) % 2;
  for (const car of pd.cars) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = phase === 0 ? '#ff5964' : '#3861ff';
    ctx.fillRect(-4, -8, 8, 7);
    ctx.fillStyle = phase === 0 ? '#3861ff' : '#ff5964';
    ctx.fillRect(-4, 1, 8, 7);
    ctx.restore();
  }

  // Helicopter: body, spinning rotor and a searchlight cone on the ground.
  if (pd.heli) {
    const heli = pd.heli;
    const grad = ctx.createRadialGradient(heli.spotX, heli.spotY, 8, heli.spotX, heli.spotY, 95);
    grad.addColorStop(0, 'rgba(255,244,180,0.42)');
    grad.addColorStop(1, 'rgba(255,244,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(heli.spotX, heli.spotY, 95, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,244,180,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(heli.spotX, heli.spotY, 62 + Math.sin(state.time * 6) * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,244,180,0.25)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(heli.x, heli.y);
    ctx.lineTo(heli.spotX, heli.spotY);
    ctx.stroke();

    ctx.save();
    ctx.translate(heli.x, heli.y);
    ctx.fillStyle = 'rgba(15,20,28,0.35)';
    ctx.beginPath();
    ctx.arc(7, 9, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(heli.angle);
    ctx.fillStyle = '#22354f';
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-44, -3, 20, 6);
    ctx.fillStyle = '#a8dadc';
    ctx.beginPath();
    ctx.ellipse(10, 0, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Rotor blur disc + blades.
    ctx.save();
    ctx.translate(heli.x, heli.y);
    ctx.strokeStyle = 'rgba(230,238,245,0.75)';
    ctx.lineWidth = 3;
    const ra = state.time * 31;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ra) * -38, Math.sin(ra) * -38);
    ctx.lineTo(Math.cos(ra) * 38, Math.sin(ra) * 38);
    ctx.moveTo(Math.cos(ra + Math.PI / 2) * -38, Math.sin(ra + Math.PI / 2) * -38);
    ctx.lineTo(Math.cos(ra + Math.PI / 2) * 38, Math.sin(ra + Math.PI / 2) * 38);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Bust progress ring around the player while officers close in.
  if (state.data.bustProgress > 0.02 && state.mode === 'playing') {
    const px = state.player.x - cam.x + w / 2;
    const py = state.player.y - cam.y + h / 2;
    ctx.strokeStyle = '#ff5964';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(px, py, 24, -Math.PI / 2, -Math.PI / 2 + state.data.bustProgress * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff5964';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', px, py - 32);
  }
}

export const policeSystem = { update, render };
