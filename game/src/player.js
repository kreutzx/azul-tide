// AZUL TIDE — player.js
// Dario Luna: on-foot movement, sprinting, health, and getting in and out of
// cars. Stealing is simple and physical — a parked car unlocks the moment
// Dario reaches it; an occupied car has its driver pulled out onto the street
// (which raises state.alarm so nearby pedestrians scatter, and lets the later
// police system hook the same event via state.events).
//
// Player object:
//   { x, y, angle, speed, radius, health, maxHealth, mode: 'foot'|'car',
//     car: <car object|null>, walkPhase, dead }

import { driveCar } from './vehicles.js';

export const PLAYER_RADIUS = 11;
const WALK_SPEED = 128;
const SPRINT_SPEED = 208;
const ENTER_RANGE = 64;

export function createPlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    angle: -Math.PI / 2,
    speed: 0,
    radius: PLAYER_RADIUS,
    health: 100,
    maxHealth: 100,
    mode: 'foot',
    car: null,
    walkPhase: 0,
    dead: false,
  };
}

export function nearestCar(state, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.allVehicles()) {
    const dx = car.x - state.player.x;
    const dy = car.y - state.player.y;
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(state, car) {
  const player = state.player;
  const wasOccupied = car.driver === 'traffic';
  if (wasOccupied) {
    // The driver is pulled out and left standing by the door.
    const doorX = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
    const doorY = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
    state.events.push({ type: 'carjack', x: car.x, y: car.y, carId: car.id });
    state.alarm = { x: car.x, y: car.y, radius: 240, ttl: 2.5 };
    state.pendingDriverPed = { x: doorX, y: doorY };
    const ti = state.vehicles.traffic.indexOf(car);
    if (ti >= 0) state.vehicles.traffic.splice(ti, 1);
  } else {
    const pi = state.vehicles.parked.indexOf(car);
    if (pi >= 0) state.vehicles.parked.splice(pi, 1);
  }
  car.parked = false;
  car.driver = 'player';
  player.mode = 'car';
  player.car = car;
  state.vehicles.playerCar = car;
  state.events.push({ type: 'enter-car', x: car.x, y: car.y, carId: car.id, stolen: wasOccupied || true });
}

function exitCar(state) {
  const player = state.player;
  const car = player.car;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  // Step out on the left side of the car, nudged clear of walls.
  const sideX = car.x + Math.cos(car.angle - Math.PI / 2) * (car.width / 2 + 16);
  const sideY = car.y + Math.sin(car.angle - Math.PI / 2) * (car.width / 2 + 16);
  const probe = { x: sideX, y: sideY };
  state.city.collide(probe, player.radius);
  player.x = probe.x;
  player.y = probe.y;
  player.mode = 'foot';
  player.car = null;
  state.vehicles.playerCar = null;
  state.vehicles.parked.push(car);
  car.parked = true;
  state.events.push({ type: 'exit-car', x: car.x, y: car.y, carId: car.id });
}

export function damagePlayer(state, amount) {
  const player = state.player;
  if (player.dead) return;
  player.health = Math.max(0, player.health - amount);
  if (player.health <= 0) {
    player.dead = true;
    state.events.push({ type: 'player-dead', x: player.x, y: player.y });
  }
}

export function healPlayer(state, amount) {
  const player = state.player;
  player.health = Math.min(player.maxHealth, player.health + amount);
}

export function updatePlayer(state, dt) {
  const player = state.player;
  const input = state.input;
  if (player.dead) {
    player.speed = 0;
    return;
  }

  // Enter / exit is an edge-triggered E press in both modes.
  if (input.wasPressed('KeyE')) {
    if (player.mode === 'car') {
      exitCar(state);
    } else {
      const car = nearestCar(state, ENTER_RANGE);
      if (car) enterCar(state, car);
    }
  }

  if (player.mode === 'car' && player.car) {
    const car = player.car;
    driveCar(
      car,
      dt,
      { throttle: input.throttle(), steer: input.steer(), handbrake: input.handbrake },
      state.city,
    );
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = Math.abs(car.speed);
    // Hard crashes hurt.
    if (Math.abs(car.speed) > 4 && state.lastCarSpeed !== undefined) {
      const drop = state.lastCarSpeed - Math.abs(car.speed);
      if (drop > 190) damagePlayer(state, (drop - 190) * 0.06);
    }
    state.lastCarSpeed = Math.abs(car.speed);
    return;
  }

  // On foot.
  state.lastCarSpeed = 0;
  const mv = input.moveVector();
  const sprinting = input.sprint && (mv.x !== 0 || mv.y !== 0);
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
  if (mv.x !== 0 || mv.y !== 0) {
    player.angle = Math.atan2(mv.y, mv.x);
    player.speed = speed;
    player.walkPhase += dt * (sprinting ? 12 : 9);
    const probe = { x: player.x + mv.x * speed * dt, y: player.y + mv.y * speed * dt };
    state.city.collide(probe, player.radius);
    player.x = probe.x;
    player.y = probe.y;
  } else {
    player.speed = 0;
  }
  // Slow health regen on foot keeps long sessions forgiving; the mission and
  // police systems layer their own damage on top of damagePlayer().
  if (player.health > 0 && player.health < 40) {
    player.health = Math.min(40, player.health + dt * 1.2);
  }
}
