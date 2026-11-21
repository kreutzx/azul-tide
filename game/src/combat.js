// AZUL TIDE — combat.js
// Street combat for Port Azul: fists, a pistol, an SMG and a shotgun, aimed
// with the mouse and resolved as hitscan with per-weapon spread. Gunfire is
// loud — it raises state.alarm, stamps state.data.gunfireAt for the police,
// and earns wanted stars. Hostile pedestrians (Sombra thugs placed by the
// mission system, flagged ped.hostile) shoot back with damagePlayer().
//
// Weapon state lives in state.data.weapons so progression can save it and
// draw the weapon wheel:
//   { current, unlocked: {fists,pistol,smg,shotgun},
//     mag: {pistol,smg,shotgun}, reserve: {pistol,smg,shotgun} }

import { damagePlayer } from './player.js';

export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', damage: 16, range: 46, spread: 0.02, rate: 0.34, pellets: 1, magSize: 0, reserveMax: 0, auto: false, loud: 0 },
  pistol: { id: 'pistol', name: 'Pistol', damage: 34, range: 520, spread: 0.035, rate: 0.27, pellets: 1, magSize: 12, reserveMax: 120, auto: false, loud: 1 },
  smg: { id: 'smg', name: 'SMG', damage: 21, range: 470, spread: 0.085, rate: 0.09, pellets: 1, magSize: 30, reserveMax: 240, auto: true, loud: 1 },
  shotgun: { id: 'shotgun', name: 'Shotgun', damage: 15, range: 300, spread: 0.16, rate: 0.85, pellets: 7, magSize: 6, reserveMax: 48, auto: false, loud: 1 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

export function ensureWeapons(state) {
  if (!state.data.weapons) {
    state.data.weapons = {
      current: 'pistol',
      unlocked: { fists: true, pistol: true, smg: false, shotgun: false },
      mag: { pistol: 12, smg: 30, shotgun: 6 },
      reserve: { pistol: 60, smg: 90, shotgun: 18 },
    };
  }
  if (!state.data.combat) {
    state.data.combat = {
      cooldown: 0,
      reloadT: 0,
      triggerHeld: false,
      tracers: [],
      muzzleT: 0,
      muzzleAngle: 0,
      kills: 0,
      shotsFired: 0,
      fistSwingT: 0,
    };
  }
  return state.data.weapons;
}

function aimAngle(state) {
  const input = state.input;
  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 800;
  const px = state.player.x - state.camera.x + w / 2;
  const py = state.player.y - state.camera.y + h / 2;
  return Math.atan2(input.mouseY - py, input.mouseX - px);
}

function segmentHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const nx = x1 + dx * t;
  const ny = y1 + dy * t;
  const ddx = cx - nx;
  const ddy = cy - ny;
  return { hit: ddx * ddx + ddy * ddy <= r * r, dist: Math.sqrt(len2) * t };
}

function hurtPed(state, ped, damage, combat) {
  if (ped.health === undefined) ped.health = 42;
  ped.health -= damage;
  ped.state = 'flee';
  ped.fleeT = 1.6;
  if (ped.health <= 0 && !ped.dead) {
    ped.dead = true;
    combat.kills += 1;
    if (state.data.crimeQueue) state.data.crimeQueue.push(ped.hostile ? 'assault' : 'murder');
    state.events.push({ type: 'ped-down', x: ped.x, y: ped.y });
    if (state.data.audioQueue) state.data.audioQueue.push('thud');
  }
}

function fireOnce(state, weapons, combat, spec) {
  const p = state.player;
  const baseAngle = p.mode === 'car' ? aimAngle(state) : aimAngle(state);
  const ox = p.x + Math.cos(baseAngle) * 16;
  const oy = p.y + Math.sin(baseAngle) * 16;
  combat.muzzleT = 0.055;
  combat.muzzleAngle = baseAngle;
  combat.shotsFired += 1;
  if (spec.loud) {
    state.alarm = { x: p.x, y: p.y, radius: 320, ttl: 2.2 };
    state.data.gunfireAt = state.time;
    if (state.data.audioQueue) state.data.audioQueue.push('shot');
  } else if (state.data.audioQueue) {
    state.data.audioQueue.push('swing');
  }

  for (let pellet = 0; pellet < spec.pellets; pellet++) {
    const angle = baseAngle + (state.rng() - 0.5) * 2 * spec.spread;
    let ex = ox + Math.cos(angle) * spec.range;
    let ey = oy + Math.sin(angle) * spec.range;
    // Walls stop the shot early.
    for (let d = 30; d < spec.range; d += 26) {
      const sx = ox + Math.cos(angle) * d;
      const sy = oy + Math.sin(angle) * d;
      if (state.city.isSolid(sx, sy)) {
        ex = sx;
        ey = sy;
        break;
      }
    }
    let bestHit = null;
    const consider = (target, radius, apply) => {
      const res = segmentHitsCircle(ox, oy, ex, ey, target.x, target.y, radius);
      if (res.hit && (!bestHit || res.dist < bestHit.dist)) {
        bestHit = { dist: res.dist, target, apply, x: target.x, y: target.y };
      }
    };
    for (const ped of state.peds) {
      if (ped.dead) continue;
      consider(ped, 13, () => hurtPed(state, ped, spec.damage, combat));
    }
    const pd = state.data.police;
    if (pd) {
      for (const car of pd.cars) {
        if (car.dead) continue;
        consider(car, car.radius * 0.8, () => {
          car.health -= spec.damage;
          if (state.data.crimeQueue) state.data.crimeQueue.push('assault');
        });
      }
    }
    for (const car of state.allVehicles()) {
      consider(car, car.radius * 0.72, () => {
        car.health = Math.max(0, car.health - spec.damage * 0.6);
      });
    }
    if (state.data.missionCars) {
      for (const entry of state.data.missionCars) {
        if (entry.car.dead) continue;
        consider(entry.car, entry.car.radius * 0.8, () => {
          entry.car.health -= spec.damage;
        });
      }
    }
    if (bestHit) {
      ex = ox + Math.cos(angle) * bestHit.dist;
      ey = oy + Math.sin(angle) * bestHit.dist;
      bestHit.apply();
      combat.tracers.push({ x1: ox, y1: oy, x2: ex, y2: ey, ttl: 0.09, hostile: false, hit: true });
    } else if (spec.id !== 'fists') {
      combat.tracers.push({ x1: ox, y1: oy, x2: ex, y2: ey, ttl: 0.07, hostile: false, hit: false });
    }
  }
  p.angle = baseAngle;
}

function tryReload(state, weapons, combat) {
  const spec = WEAPONS[weapons.current];
  if (!spec || spec.magSize === 0) return;
  const need = spec.magSize - (weapons.mag[spec.id] || 0);
  const have = weapons.reserve[spec.id] || 0;
  if (need <= 0 || have <= 0 || combat.reloadT > 0) return;
  combat.reloadT = spec.id === 'shotgun' ? 1.5 : 1.05;
  combat.reloadSpec = spec.id;
  if (state.data.audioQueue) state.data.audioQueue.push('click');
}

function updateEnemyFire(state, combat, dt) {
  // Hostile peds shoot back: short bursts, poor aim, real consequences.
  for (const ped of state.peds) {
    if (!ped.hostile || ped.dead) continue;
    ped.fireT = (ped.fireT || 0) - dt;
    const dx = state.player.x - ped.x;
    const dy = state.player.y - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 300 || dist < 12) continue;
    ped.angle = Math.atan2(dy, dx);
    if (ped.fireT <= 0) {
      ped.fireT = 0.85 + state.rng() * 0.7;
      const spread = (state.rng() - 0.5) * 0.3;
      const ang = Math.atan2(dy, dx) + spread;
      const ex = ped.x + Math.cos(ang) * dist;
      const ey = ped.y + Math.sin(ang) * dist;
      combat.tracers.push({ x1: ped.x, y1: ped.y, x2: ex, y2: ey, ttl: 0.08, hostile: true, hit: false });
      if (state.data.audioQueue) state.data.audioQueue.push('shot-far');
      if (Math.abs(spread) < 0.09) {
        damagePlayer(state, state.player.mode === 'car' ? 3 : 6);
      }
    }
  }
}

function update(state, dt) {
  const weapons = ensureWeapons(state);
  const combat = state.data.combat;
  if (!state.data.crimeQueue) state.data.crimeQueue = [];
  if (!state.data.audioQueue) state.data.audioQueue = [];

  combat.cooldown = Math.max(0, combat.cooldown - dt);
  combat.muzzleT = Math.max(0, combat.muzzleT - dt);
  combat.fistSwingT = Math.max(0, combat.fistSwingT - dt);
  for (let i = combat.tracers.length - 1; i >= 0; i--) {
    combat.tracers[i].ttl -= dt;
    if (combat.tracers[i].ttl <= 0) combat.tracers.splice(i, 1);
  }
  // Dead peds leave the street.
  for (let i = state.peds.length - 1; i >= 0; i--) {
    if (state.peds[i].dead) state.peds.splice(i, 1);
  }

  if (combat.reloadT > 0) {
    combat.reloadT -= dt;
    state.data.reloading = true;
    if (combat.reloadT <= 0) {
      const spec = WEAPONS[combat.reloadSpec || weapons.current];
      if (spec && spec.magSize > 0) {
        const need = spec.magSize - (weapons.mag[spec.id] || 0);
        const take = Math.min(need, weapons.reserve[spec.id] || 0);
        weapons.mag[spec.id] = (weapons.mag[spec.id] || 0) + take;
        weapons.reserve[spec.id] = (weapons.reserve[spec.id] || 0) - take;
      }
      state.data.reloading = false;
    }
  }

  // Number keys switch weapons when the wheel / shop keys are not using them.
  if (!state.data.wheelOpen) {
    for (let i = 0; i < WEAPON_ORDER.length; i++) {
      if (state.input.wasPressed('Digit' + (i + 1))) {
        const id = WEAPON_ORDER[i];
        if (weapons.unlocked[id]) {
          weapons.current = id;
          combat.cooldown = Math.max(combat.cooldown, 0.18);
          if (state.data.audioQueue) state.data.audioQueue.push('click');
        }
      }
    }
  }
  if (state.input.wasPressed('KeyR')) tryReload(state, weapons, combat);

  const spec = WEAPONS[weapons.current];
  const wantFire = state.input.mouseDown || state.input.wasPressed('MouseLeft');
  const canFire = combat.cooldown <= 0 && combat.reloadT <= 0 && !state.data.wheelOpen;
  if (wantFire && canFire && (spec.auto || !combat.triggerHeld || state.input.wasPressed('MouseLeft'))) {
    if (spec.magSize > 0 && (weapons.mag[spec.id] || 0) <= 0) {
      if (state.data.audioQueue) state.data.audioQueue.push('click');
      combat.cooldown = 0.25;
      tryReload(state, weapons, combat);
    } else {
      if (spec.magSize > 0) weapons.mag[spec.id] -= 1;
      combat.cooldown = spec.rate;
      if (spec.id === 'fists') combat.fistSwingT = 0.18;
      fireOnce(state, weapons, combat, spec);
      if (spec.magSize > 0 && weapons.mag[spec.id] <= 0) tryReload(state, weapons, combat);
    }
  }
  combat.triggerHeld = state.input.mouseDown;

  updateEnemyFire(state, combat, dt);
  state.data.aimAngle = aimAngle(state);
}

function render(ctx, state, w, h) {
  const combat = state.data.combat;
  if (!combat) return;
  const cam = state.camera;
  const toScreenX = (x) => x - cam.x + w / 2;
  const toScreenY = (y) => y - cam.y + h / 2;

  for (const t of combat.tracers) {
    ctx.strokeStyle = t.hostile ? 'rgba(255,110,90,0.85)' : 'rgba(255,224,130,0.9)';
    ctx.lineWidth = t.hit ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.moveTo(toScreenX(t.x1), toScreenY(t.y1));
    ctx.lineTo(toScreenX(t.x2), toScreenY(t.y2));
    ctx.stroke();
    if (t.hit) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(toScreenX(t.x2), toScreenY(t.y2), 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const p = state.player;
  const px = toScreenX(p.x);
  const py = toScreenY(p.y);
  // Muzzle flash at the gun tip.
  if (combat.muzzleT > 0) {
    const a = combat.muzzleAngle;
    const gx = px + Math.cos(a) * 20;
    const gy = py + Math.sin(a) * 20;
    ctx.fillStyle = 'rgba(255,190,60,0.95)';
    ctx.beginPath();
    ctx.arc(gx, gy, 7 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,0.9)';
    ctx.beginPath();
    ctx.arc(gx, gy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fist swing arc.
  if (combat.fistSwingT > 0) {
    ctx.strokeStyle = 'rgba(244,241,222,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, 20, p.angle - 0.7, p.angle + 0.7);
    ctx.stroke();
  }
  // Aim reticle at the mouse.
  if (state.mode === 'playing') {
    const mx = state.input.mouseX;
    const my = state.input.mouseY;
    ctx.strokeStyle = 'rgba(255,209,102,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - 13, my);
    ctx.lineTo(mx - 4, my);
    ctx.moveTo(mx + 4, my);
    ctx.lineTo(mx + 13, my);
    ctx.moveTo(mx, my - 13);
    ctx.lineTo(mx, my - 4);
    ctx.moveTo(mx, my + 4);
    ctx.lineTo(mx, my + 13);
    ctx.stroke();
  }
  if (state.data.reloading) {
    ctx.fillStyle = 'rgba(10,22,32,0.72)';
    ctx.fillRect(px - 34, py - 40, 68, 15);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RELOADING', px, py - 29);
  }
}

export const combatSystem = { update, render };
