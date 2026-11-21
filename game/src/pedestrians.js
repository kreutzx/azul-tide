// AZUL TIDE — pedestrians.js
// The people of Port Azul. Pedestrians stroll the sidewalks, pause at kerbs,
// cross at intersections, chat in pairs, and run when danger gets close — a
// speeding car, a carjack in progress, or any "alarm" the later systems raise
// through state.alarm = { x, y, radius, ttl }.
//
// Ped object: { x, y, angle, speed, state: 'walk'|'wait'|'flee'|'chat',
//   color, skin, targetX, targetY, waitT, fleeT }

import { H_ROADS, ROAD_W, V_ROADS } from './city.js';

const SHIRTS = ['#e07a5f', '#81b29a', '#f2cc8f', '#a8dadc', '#f4f1de', '#ee6c4d', '#118ab2', '#ffd166'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export function makePed(x, y, rng) {
  return {
    x,
    y,
    angle: rng() * Math.PI * 2,
    speed: 0,
    state: 'walk',
    color: SHIRTS[Math.floor(rng() * SHIRTS.length)],
    skin: SKINS[Math.floor(rng() * SKINS.length)],
    targetX: x,
    targetY: y,
    waitT: 0,
    fleeT: 0,
    walkSpeed: 42 + rng() * 30,
    phase: rng() * Math.PI * 2,
  };
}

// Pick a new stroll target: another point along the same sidewalk, or across
// the street at a crossing.
function pickTarget(ped, city, rng) {
  const road = city.nearestRoadPoint(ped.x, ped.y);
  if (!road) {
    ped.targetX = ped.x + (rng() - 0.5) * 200;
    ped.targetY = ped.y + (rng() - 0.5) * 200;
    return;
  }
  const sideOff = ROAD_W / 2 + 14;
  if (road.axis === 'v') {
    const side = ped.x < road.line ? -sideOff : sideOff;
    if (rng() < 0.22) {
      // Cross the street.
      ped.targetX = road.line - side;
      ped.targetY = ped.y + (rng() - 0.5) * 60;
    } else {
      ped.targetX = road.line + side;
      ped.targetY = Math.max(30, Math.min(city.height - 30, ped.y + (rng() - 0.5) * 560));
    }
  } else {
    const side = ped.y < road.line ? -sideOff : sideOff;
    if (rng() < 0.22) {
      ped.targetY = road.line - side;
      ped.targetX = ped.x + (rng() - 0.5) * 60;
    } else {
      ped.targetY = road.line + side;
      ped.targetX = Math.max(30, Math.min(city.width - 30, ped.x + (rng() - 0.5) * 560));
    }
  }
}

export function spawnPedestrians(city, rng, count) {
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard < count * 40) {
    guard++;
    const p = city.randomRoadPoint(rng);
    const sideOff = ROAD_W / 2 + 14;
    let x;
    let y;
    if (p.axis === 'v') {
      x = p.line + (rng() < 0.5 ? -sideOff : sideOff);
      y = p.y;
    } else {
      x = p.x;
      y = p.line + (rng() < 0.5 ? -sideOff : sideOff);
    }
    if (city.isSolid(x, y)) continue;
    const ped = makePed(x, y, rng);
    pickTarget(ped, city, rng);
    peds.push(ped);
  }
  void V_ROADS;
  void H_ROADS;
  return peds;
}

export function updatePedestrian(ped, dt, state) {
  const { city, rng } = state;
  ped.phase += dt * (ped.state === 'flee' ? 13 : 7);

  // Danger check: alarm point, fast nearby cars, the player's car at speed.
  let danger = null;
  if (state.alarm && state.alarm.ttl > 0) {
    const dx = ped.x - state.alarm.x;
    const dy = ped.y - state.alarm.y;
    if (dx * dx + dy * dy < state.alarm.radius * state.alarm.radius) danger = state.alarm;
  }
  if (!danger) {
    for (const car of state.allVehicles()) {
      if (Math.abs(car.speed) < 150) continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      if (dx * dx + dy * dy < 110 * 110) {
        danger = car;
        break;
      }
    }
  }
  if (danger && ped.state !== 'flee') {
    ped.state = 'flee';
    ped.fleeT = 1.4 + rng() * 0.8;
    const dx = ped.x - danger.x;
    const dy = ped.y - danger.y;
    const d = Math.hypot(dx, dy) || 1;
    ped.targetX = ped.x + (dx / d) * 260;
    ped.targetY = ped.y + (dy / d) * 260;
  }

  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    if (ped.fleeT <= 0) {
      ped.state = 'walk';
      pickTarget(ped, city, rng);
    }
  } else if (ped.state === 'wait' || ped.state === 'chat') {
    ped.waitT -= dt;
    ped.speed = 0;
    if (ped.waitT <= 0) {
      ped.state = 'walk';
      pickTarget(ped, city, rng);
    }
    return;
  }

  // Walk toward the target.
  const dx = ped.targetX - ped.x;
  const dy = ped.targetY - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 8) {
    if (rng() < 0.3) {
      ped.state = rng() < 0.4 ? 'chat' : 'wait';
      ped.waitT = 0.8 + rng() * 2.4;
      ped.speed = 0;
      return;
    }
    pickTarget(ped, city, rng);
    return;
  }
  const speed = ped.state === 'flee' ? 168 : ped.walkSpeed;
  ped.speed = speed;
  ped.angle = Math.atan2(dy, dx);
  const stepX = (dx / dist) * speed * dt;
  const stepY = (dy / dist) * speed * dt;
  const probe = { x: ped.x + stepX, y: ped.y + stepY };
  const hit = city.collide(probe, 9);
  ped.x = probe.x;
  ped.y = probe.y;
  if (hit && ped.state !== 'flee') pickTarget(ped, city, rng);
}

// Keep a living crowd around the player; cull the far side of the city.
export function maintainPedestrians(state, dt) {
  const { city, rng } = state;
  const peds = state.peds;
  const px = state.player.x;
  const py = state.player.y;
  for (let i = peds.length - 1; i >= 0; i--) {
    const dx = peds[i].x - px;
    const dy = peds[i].y - py;
    if (dx * dx + dy * dy > 1400 * 1400) peds.splice(i, 1);
  }
  state.pedTimer = (state.pedTimer || 0) - dt;
  if (peds.length < 26 && state.pedTimer <= 0) {
    state.pedTimer = 0.4;
    const fresh = spawnPedestrians(city, rng, 1);
    for (const ped of fresh) {
      const dx = ped.x - px;
      const dy = ped.y - py;
      if (dx * dx + dy * dy > 380 * 380) peds.push(ped);
    }
  }
  for (const ped of peds) updatePedestrian(ped, dt, state);
}
