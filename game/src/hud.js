// AZUL TIDE — hud.js
// The screen-space HUD, drawn after the world every frame: a minimap with
// roads, water, police blips, the helicopter and the mission marker; wanted
// stars and the PURSUIT / EVADING / EVADED indicator; cash, respect rank and
// its progress bar; health (and armor) bars; the current weapon and ammo; a
// speedometer while driving; district-name splashes; the mission objective
// banner and dialogue box; context prompts; and radio / save toasts.

import { H_ROADS, V_ROADS, WORLD_H, WORLD_W } from './city.js';
import { WEAPONS } from './combat.js';
import { RANKS, nextRank, rankFor } from './progression.js';
import { nearestCar } from './player.js';

let lastDistrictId = null;
let splashT = -99;
let splashName = '';

function panel(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = 'rgba(8,22,32,' + (alpha === undefined ? 0.72 : alpha) + ')';
  ctx.beginPath();
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + w - 8, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + 8);
  ctx.lineTo(x + w, y + h - 8);
  ctx.quadraticCurveTo(x + w, y + h, x + w - 8, y + h);
  ctx.lineTo(x + 8, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - 8);
  ctx.lineTo(x, y + 8);
  ctx.quadraticCurveTo(x, y, x + 8, y);
  ctx.closePath();
  ctx.fill();
}

function bar(ctx, x, y, w, h, frac, color, bg) {
  ctx.fillStyle = bg || 'rgba(255,255,255,0.16)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
}

function drawMinimap(ctx, state, w, h) {
  const mw = 196;
  const mh = 148;
  const mx = w - mw - 14;
  const my = 14;
  panel(ctx, mx - 4, my - 4, mw + 8, mh + 8, 0.66);
  const sx = (x) => mx + (x / WORLD_W) * mw;
  const sy = (y) => my + (y / WORLD_H) * mh;
  // District tints sampled from the real city data.
  const cols = 12;
  const rows = 9;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const wx = ((i + 0.5) / cols) * WORLD_W;
      const wy = ((j + 0.5) / rows) * WORLD_H;
      ctx.fillStyle = state.city.isWater(wx, wy) ? '#1b7f9e' : state.city.districtAt(wx, wy).ground;
      ctx.fillRect(mx + (i / cols) * mw, my + (j / rows) * mh, mw / cols + 1, mh / rows + 1);
    }
  }
  // Roads.
  ctx.strokeStyle = 'rgba(40,40,48,0.85)';
  ctx.lineWidth = 2;
  for (const cx of V_ROADS) {
    ctx.beginPath();
    ctx.moveTo(sx(cx), my);
    ctx.lineTo(sx(cx), my + mh);
    ctx.stroke();
  }
  for (const cy of H_ROADS) {
    ctx.beginPath();
    ctx.moveTo(mx, sy(cy));
    ctx.lineTo(mx + mw, sy(cy));
    ctx.stroke();
  }
  // Properties: owned glow green, for-sale stay grey.
  for (const loc of state.city.locations) {
    if (loc.kind === 'property') {
      const owned = state.data.ownedProperties && state.data.ownedProperties.includes(loc.id);
      ctx.fillStyle = owned ? '#57ff8a' : 'rgba(230,230,230,0.75)';
      ctx.fillRect(sx(loc.x) - 3, sy(loc.y) - 3, 6, 6);
    } else if (loc.kind === 'shop') {
      ctx.fillStyle = '#e9c46a';
      ctx.fillRect(sx(loc.x) - 2, sy(loc.y) - 2, 4, 4);
    } else if (loc.kind === 'garage') {
      ctx.fillStyle = '#118ab2';
      ctx.fillRect(sx(loc.x) - 2, sy(loc.y) - 2, 4, 4);
    }
  }
  // Hidden packages: small teal dots.
  for (const pkg of state.data.packages || []) {
    if (pkg.taken) continue;
    ctx.fillStyle = '#2de2c4';
    ctx.fillRect(sx(pkg.x) - 2, sy(pkg.y) - 2, 4, 4);
  }
  // Mission marker.
  const marker = state.data.missionMarker;
  if (marker) {
    const pulse = 3.5 + Math.sin(state.time * 5) * 1.2;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(sx(marker.x), sy(marker.y), pulse + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#17323e';
    ctx.beginPath();
    ctx.arc(sx(marker.x), sy(marker.y), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips flash red/blue; the helicopter is an H.
  const pd = state.data.police;
  if (pd) {
    const phase = Math.floor(state.time * 4) % 2;
    for (const car of pd.cars) {
      ctx.fillStyle = phase === 0 ? '#ff5964' : '#4d7cff';
      ctx.beginPath();
      ctx.arc(sx(car.x), sy(car.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pd.heli) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('H', sx(pd.heli.x), sy(pd.heli.y) + 3);
    }
  }
  // Player arrow.
  const px = sx(state.player.x);
  const py = sy(state.player.y);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.4);
  ctx.lineTo(-5, 4.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, mw, mh);
  return { mx, my, mw, mh };
}

function drawStars(ctx, state, w) {
  const x0 = w - 210;
  const y = 176;
  ctx.font = '24px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < state.wanted ? '#ffd166' : 'rgba(255,255,255,0.28)';
    ctx.fillText('★', x0 + i * 26, y);
  }
  if (state.wanted > 0 || state.data.pursuit === 'PURSUIT') {
    const pursuit = state.data.pursuit || 'PURSUIT';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = pursuit === 'PURSUIT' ? '#ff5964' : pursuit === 'EVADING' ? '#ffb703' : '#57ff8a';
    const blink = pursuit === 'PURSUIT' && Math.floor(state.time * 3) % 2 === 0;
    ctx.fillText(blink ? '● PURSUIT' : pursuit, x0 + 2, y + 20);
  }
}

function update(state) {
  // District splash bookkeeping (render draws it).
  const district = state.city.districtAt(state.player.x, state.player.y);
  if (district.id !== lastDistrictId) {
    if (lastDistrictId !== null && state.mode === 'playing') {
      splashName = district.name;
      splashT = state.time;
    }
    lastDistrictId = district.id;
    state.data.currentDistrict = district;
  }
  // Default context prompts when no other system claimed this tick.
  if (state.data.promptTick !== state.tick) {
    if (state.player.mode === 'car') {
      state.data.prompt = 'E — Exit car';
    } else {
      const car = nearestCar(state, 64);
      state.data.prompt = car ? 'E — Enter ' + (car.driver === 'traffic' ? 'occupied ' : '') + car.type : '';
    }
  }
}

function render(ctx, state, w, h) {
  if (state.mode !== 'playing' && state.mode !== 'paused') return;
  const d = state.data;
  const p = state.player;

  drawMinimap(ctx, state, w, h);
  drawStars(ctx, state, w);

  // Top-left: cash, respect + rank, health.
  panel(ctx, 12, 12, 252, 96);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#57ff8a';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText('$' + Math.floor(state.money).toLocaleString('en-US'), 24, 40);
  const respect = d.respect || 0;
  const rank = d.rank || rankFor(respect);
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(rank.name.toUpperCase() + ' · ' + Math.floor(respect) + ' respect', 24, 62);
  const next = nextRank(respect);
  if (next) {
    const prevAt = rank.at;
    bar(ctx, 24, 70, 160, 6, (respect - prevAt) / (next.at - prevAt), '#ffd166');
    ctx.fillStyle = 'rgba(244,241,222,0.75)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(next.at - Math.floor(respect) + ' to ' + next.name, 190, 76);
  } else {
    bar(ctx, 24, 70, 160, 6, 1, '#ffd166');
  }
  bar(ctx, 24, 84, 228, 11, p.health / p.maxHealth, p.health > 30 ? '#57c256' : '#ff5964');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText('HEALTH ' + Math.ceil(p.health), 28, 93);
  if ((d.armor || 0) > 0) bar(ctx, 24, 97, 228, 5, d.armor / 100, '#a8dadc');

  // Bottom-left: weapon + ammo.
  panel(ctx, 12, h - 64, 252, 52);
  const weapons = d.weapons;
  const spec = weapons ? WEAPONS[weapons.current] : null;
  ctx.fillStyle = '#f4f1de';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(spec ? spec.name : 'Fists', 24, h - 38);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#a8dadc';
  if (spec && spec.magSize > 0) {
    ctx.fillText('Ammo ' + (weapons.mag[spec.id] || 0) + ' / ' + (weapons.reserve[spec.id] || 0) + (d.reloading ? ' · RELOADING' : ''), 24, h - 20);
  } else {
    ctx.fillText('Mouse aim · click to strike · Q wheel', 24, h - 20);
  }

  // Bottom-right: speedometer + car health + radio while driving.
  if (p.mode === 'car' && p.car) {
    panel(ctx, w - 216, h - 96, 204, 84);
    const mph = Math.round(Math.abs(p.car.speed) * 0.24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(mph + '', w - 58, h - 62);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#a8dadc';
    ctx.fillText('MPH', w - 24, h - 62);
    ctx.textAlign = 'left';
    bar(ctx, w - 204, h - 52, 180, 7, p.car.health / 100, '#e9c46a');
    ctx.fillStyle = 'rgba(244,241,222,0.8)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText((p.car.type || 'car').toUpperCase() + ' CONDITION', w - 204, h - 58);
    if (d.radio) {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('♪ ' + d.radio.name, w - 204, h - 32);
      ctx.fillStyle = 'rgba(244,241,222,0.85)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(d.radio.track || '', w - 204, h - 19);
    }
  }

  // Mission banner: title + objective, top centre.
  if (d.objectiveText) {
    const title = d.missionTitle || (d.mission ? 'Side Job' : 'Port Azul');
    const tw = Math.max(300, Math.min(560, ctx.measureText(d.objectiveText).width + 60));
    panel(ctx, w / 2 - tw / 2, 12, tw, d.mission ? 52 : 38, 0.78);
    ctx.textAlign = 'center';
    if (d.mission) {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('— ' + title.toUpperCase() + ' —', w / 2, 29);
    }
    ctx.fillStyle = '#f4f1de';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(d.objectiveText, w / 2, d.mission ? 50 : 36);
  }

  // District splash.
  if (state.time - splashT < 2.6 && splashName) {
    const age = state.time - splashT;
    const alpha = age < 0.3 ? age / 0.3 : age > 2 ? Math.max(0, (2.6 - age) / 0.6) : 1;
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(splashName.toUpperCase(), w / 2, 110);
    ctx.fillStyle = 'rgba(244,241,222,0.9)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('— Port Azul —', w / 2, 132);
    ctx.globalAlpha = 1;
  }

  // Radio toast.
  if (d.radioToastT && state.time < d.radioToastT && d.radio) {
    panel(ctx, w / 2 - 150, 140, 300, 30, 0.8);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('♪ ' + d.radio.name + ' — ' + (d.radio.track || ''), w / 2, 159);
  }

  // Dialogue box, bottom centre.
  if (d.dialogue) {
    const text = d.dialogue.text;
    ctx.font = '14px system-ui, sans-serif';
    const tw = Math.min(w - 80, Math.max(340, ctx.measureText(text).width + 48));
    const x = w / 2 - tw / 2;
    const y = h - 128;
    panel(ctx, x, y, tw, 56, 0.85);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(d.dialogue.speaker.toUpperCase(), x + 16, y + 19);
    ctx.fillStyle = '#f4f1de';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(text, x + 16, y + 40);
  }

  // Context prompt, bottom centre above the dialogue slot.
  if (d.prompt) {
    ctx.font = 'bold 14px system-ui, sans-serif';
    const tw = ctx.measureText(d.prompt).width + 34;
    const x = w / 2 - tw / 2;
    const y = h - (d.dialogue ? 188 : 118);
    panel(ctx, x, y, tw, 30, 0.82);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(d.prompt, w / 2, y + 20);
  }

  // Low-health pulse.
  if (p.health <= 30 && !p.dead) {
    const a = 0.1 + 0.07 * Math.sin(state.time * 6);
    ctx.fillStyle = 'rgba(200,30,40,' + a + ')';
    ctx.fillRect(0, 0, w, h);
  }
}

export const hudSystem = { update, render };
export { RANKS };
