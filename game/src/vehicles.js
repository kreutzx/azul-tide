// AZUL TIDE — vehicles.js
// Cars for Port Azul: six body types, arcade driving physics, parked cars and
// lane-following traffic AI. The player drives through the same physics as the
// traffic, so a stolen taxi handles exactly like a traffic taxi.
//
// Car object shape (shared by traffic, parked and the player's car):
//   { id, type, color, x, y, angle, speed, steerVis, width, length, radius,
//     parked, driver: 'traffic' | 'player' | null, health }
// Traffic cars additionally carry: { axis: 'v'|'h', dir: 1|-1, lane, targetSpeed }

import { H_ROADS, ROAD_W, V_ROADS, WORLD_H } from './city.js';

export const CAR_TYPES = {
  compact: { name: 'Compact', length: 52, width: 26, accel: 260, maxSpeed: 300, reverse: 110, grip: 5.2, colors: ['#e07a5f', '#81b29a', '#f2cc8f', '#a8dadc'] },
  sedan: { name: 'Sedan', length: 62, width: 28, accel: 240, maxSpeed: 330, reverse: 120, grip: 5.4, colors: ['#3d405b', '#5a6c7d', '#c0c5ce', '#7d8597'] },
  taxi: { name: 'Taxi', length: 62, width: 28, accel: 250, maxSpeed: 325, reverse: 120, grip: 5.4, colors: ['#f4d35e'] },
  van: { name: 'Van', length: 74, width: 32, accel: 190, maxSpeed: 270, reverse: 100, grip: 4.6, colors: ['#e9e9e9', '#90a8a0', '#b08968'] },
  truck: { name: 'Truck', length: 92, width: 34, accel: 160, maxSpeed: 240, reverse: 90, grip: 4.2, colors: ['#6c757d', '#8a817c', '#5f6c37'] },
  sports: { name: 'Sports', length: 60, width: 28, accel: 380, maxSpeed: 460, reverse: 140, grip: 6.4, colors: ['#ee6c4d', '#118ab2', '#ffd166', '#8338ec'] },
  muscle: { name: 'Muscle', length: 66, width: 30, accel: 340, maxSpeed: 420, reverse: 130, grip: 5.6, colors: ['#9d0208', '#370617', '#faa307', '#2a9d8f'] },
};

const TYPE_KEYS = Object.keys(CAR_TYPES);
let nextCarId = 1;

export function makeCar(typeKey, x, y, angle, rng) {
  const spec = CAR_TYPES[typeKey];
  const color = spec.colors[Math.floor(rng() * spec.colors.length)];
  return {
    id: nextCarId++,
    type: typeKey,
    color,
    x,
    y,
    angle,
    speed: 0,
    steerVis: 0,
    width: spec.width,
    length: spec.length,
    radius: spec.length / 2,
    parked: false,
    driver: null,
    health: 100,
    axis: 'v',
    dir: 1,
    lane: 0,
    targetSpeed: spec.maxSpeed * 0.45,
  };
}

// Spawn the parked-car population on parking lots and along street edges.
export function spawnParkedCars(city, rng, count) {
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard < count * 30) {
    guard++;
    let x;
    let y;
    let angle;
    if (city.lots.length && rng() < 0.55) {
      const lot = city.lots[Math.floor(rng() * city.lots.length)];
      x = lot.x + 20 + rng() * Math.max(10, lot.w - 40);
      y = lot.y + 20 + rng() * Math.max(10, lot.h - 40);
      angle = rng() < 0.5 ? 0 : Math.PI / 2;
    } else {
      const p = city.randomRoadPoint(rng);
      const off = ROAD_W / 2 - 16;
      if (p.axis === 'v') {
        x = p.line + (rng() < 0.5 ? -off : off);
        y = p.y;
        angle = Math.PI / 2;
      } else {
        x = p.x;
        y = p.line + (rng() < 0.5 ? -off : off);
        angle = 0;
      }
    }
    if (city.isSolid(x, y)) continue;
    const type = TYPE_KEYS[Math.floor(rng() * TYPE_KEYS.length)];
    const car = makeCar(type, x, y, angle, rng);
    car.parked = true;
    cars.push(car);
  }
  return cars;
}

// Spawn one traffic car on a road, driving in a lane. dir/lane follow
// right-hand traffic: vertical roads run north on the west lane, south on the
// east lane; horizontal roads run east on the south lane, west on the north.
export function spawnTrafficCar(city, rng, nearX, nearY) {
  const p = city.randomRoadPoint(rng);
  const laneOff = ROAD_W / 4;
  const type = TYPE_KEYS[Math.floor(rng() * TYPE_KEYS.length)];
  let car;
  if (p.axis === 'v') {
    const dir = rng() < 0.5 ? 1 : -1; // 1 = southbound, -1 = northbound
    const x = p.line + (dir === 1 ? laneOff : -laneOff);
    car = makeCar(type, x, p.y, dir === 1 ? Math.PI / 2 : -Math.PI / 2, rng);
    car.axis = 'v';
    car.dir = dir;
    car.lane = x;
  } else {
    const dir = rng() < 0.5 ? 1 : -1; // 1 = eastbound, -1 = westbound
    const y = p.line + (dir === 1 ? laneOff : -laneOff);
    car = makeCar(type, p.x, y, dir === 1 ? 0 : Math.PI, rng);
    car.axis = 'h';
    car.dir = dir;
    car.lane = y;
  }
  car.driver = 'traffic';
  car.speed = car.targetSpeed * (0.7 + rng() * 0.3);
  void nearX;
  void nearY;
  return car;
}

// Shared arcade physics step. input = { throttle: -1..1, steer: -1..1, handbrake }
export function driveCar(car, dt, input, city) {
  const spec = CAR_TYPES[car.type];
  const prevX = car.x;
  const prevY = car.y;

  if (input.throttle > 0) {
    car.speed += spec.accel * input.throttle * dt;
  } else if (input.throttle < 0) {
    if (car.speed > 12) car.speed -= spec.accel * 1.7 * dt; // braking
    else car.speed += spec.accel * 0.55 * input.throttle * dt; // reversing
  } else {
    car.speed -= car.speed * 0.55 * dt; // engine drag
  }
  if (input.handbrake) car.speed -= car.speed * 2.4 * dt;

  const maxF = spec.maxSpeed;
  const maxR = -spec.reverse;
  if (car.speed > maxF) car.speed = maxF;
  if (car.speed < maxR) car.speed = maxR;
  if (Math.abs(car.speed) < 1.5 && input.throttle === 0) car.speed = 0;

  // Steering scales with speed and flips in reverse, like a real wheel.
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 90);
  const turnRate = input.steer * 2.1 * steerAuthority * (input.handbrake ? 1.5 : 1);
  if (car.speed !== 0) {
    car.angle += turnRate * dt * Math.sign(car.speed);
  }
  car.steerVis += (input.steer - car.steerVis) * Math.min(1, dt * 10);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Building / water / world collision: stop dead and take a scrape of damage.
  const probe = { x: car.x, y: car.y };
  const hit = city.collide(probe, car.width * 0.62);
  if (hit) {
    const impact = Math.abs(car.speed);
    car.x = probe.x;
    car.y = probe.y;
    if (impact > 130) car.health = Math.max(0, car.health - (impact - 130) * 0.05);
    car.speed *= -0.18;
    if (Math.abs(car.x - prevX) < 0.01 && Math.abs(car.y - prevY) < 0.01) car.speed = 0;
  }
  return hit;
}

// Car-vs-car soft collision: push overlapping cars apart and trade speed.
export function collideCars(cars) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = (a.radius + b.radius) * 0.72;
      const d2 = dx * dx + dy * dy;
      if (d2 > min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      if (!a.parked || a.driver) { a.x -= nx * push; a.y -= ny * push; }
      if (!b.parked || b.driver) { b.x += nx * push; b.y += ny * push; }
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 120) {
        a.health = Math.max(0, a.health - 3);
        b.health = Math.max(0, b.health - 3);
      }
      const avg = (a.speed + b.speed) / 2;
      if (a.driver) a.speed = avg * 0.7;
      if (b.driver) b.speed = avg * 0.7;
    }
  }
}

function nearestIntersection(car) {
  if (car.axis === 'v') {
    let best = null;
    let bestD = Infinity;
    for (const cy of H_ROADS) {
      const d = (cy - car.y) * car.dir;
      if (d > 0 && d < bestD) { bestD = d; best = cy; }
    }
    return best === null ? null : { line: best, dist: bestD };
  }
  let best = null;
  let bestD = Infinity;
  for (const cx of V_ROADS) {
    const d = (cx - car.x) * car.dir;
    if (d > 0 && d < bestD) { bestD = d; best = cx; }
  }
  return best === null ? null : { line: best, dist: bestD };
}

// Traffic AI: hold the lane, slow for whatever is ahead, and sometimes turn at
// intersections (which swaps the car's axis and lane to the crossing road).
export function updateTrafficCar(car, dt, city, allCars, playerPos, rng) {
  // Obstacle scan ahead.
  let blocked = false;
  let close = false;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const check = (ox, oy, orad) => {
    const dx = ox - car.x;
    const dy = oy - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 0) return;
    const side = Math.abs(dx * -fy + dy * fx);
    if (side > 26 + orad) return;
    if (ahead < 95) blocked = true;
    if (ahead < 170) close = true;
  };
  for (const other of allCars) {
    if (other === car) continue;
    check(other.x, other.y, other.width * 0.5);
  }
  if (playerPos) check(playerPos.x, playerPos.y, 10);

  let throttle = 0;
  if (blocked) throttle = car.speed > 20 ? -1 : 0;
  else if (close) throttle = car.speed > car.targetSpeed * 0.5 ? -0.4 : 0.15;
  else throttle = car.speed < car.targetSpeed ? 0.7 : 0;

  // Intersection turning.
  let steer = 0;
  const inter = nearestIntersection(car);
  if (inter && inter.dist < 26 && !car.turnCooldown) {
    if (rng() < 0.34) {
      const turnDir = rng() < 0.5 ? 1 : -1;
      if (car.axis === 'v') {
        // Turn onto the horizontal road: new dir along x.
        car.axis = 'h';
        car.dir = turnDir;
        car.y = inter.line + (turnDir === 1 ? ROAD_W / 4 : -ROAD_W / 4);
        car.lane = car.y;
        car.angle = turnDir === 1 ? 0 : Math.PI;
      } else {
        car.axis = 'v';
        car.dir = turnDir;
        car.x = inter.line + (turnDir === 1 ? ROAD_W / 4 : -ROAD_W / 4);
        car.lane = car.x;
        car.angle = turnDir === 1 ? Math.PI / 2 : -Math.PI / 2;
      }
      car.turnCooldown = 1.6;
    } else {
      car.turnCooldown = 0.9; // decided to go straight; don't re-roll instantly
    }
  }
  if (car.turnCooldown) car.turnCooldown = Math.max(0, car.turnCooldown - dt);

  // Lane keeping: nudge back toward the lane centre line.
  if (car.axis === 'v') {
    const off = car.lane - car.x;
    steer = Math.max(-0.4, Math.min(0.4, off * 0.02)) * (car.dir === 1 ? 1 : -1) * -1;
    // Angle should point along the road.
    const want = car.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    car.angle += (want - car.angle) * Math.min(1, dt * 3);
  } else {
    const off = car.lane - car.y;
    steer = Math.max(-0.4, Math.min(0.4, off * 0.02)) * (car.dir === 1 ? 1 : -1);
    const want = car.dir === 1 ? 0 : Math.PI;
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += diff * Math.min(1, dt * 3);
  }

  driveCar(car, dt, { throttle, steer, handbrake: false }, city);
  void WORLD_H;
}

// Keep the traffic population topped up near the player and culled far away.
export function maintainTraffic(state, dt) {
  const { city, rng } = state;
  const cars = state.vehicles.traffic;
  const px = state.player.x;
  const py = state.player.y;
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    const dx = c.x - px;
    const dy = c.y - py;
    if (dx * dx + dy * dy > 1500 * 1500) cars.splice(i, 1);
  }
  state.trafficTimer = (state.trafficTimer || 0) - dt;
  if (cars.length < 15 && state.trafficTimer <= 0) {
    state.trafficTimer = 0.5;
    const car = spawnTrafficCar(city, rng, px, py);
    const dx = car.x - px;
    const dy = car.y - py;
    if (dx * dx + dy * dy > 320 * 320) cars.push(car);
  }
}
