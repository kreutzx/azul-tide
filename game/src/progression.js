// AZUL TIDE — progression.js
// Dario's rise through Port Azul: cash, respect and ranks, standing in each
// district, garage upgrades in three tracks, shop purchases, buyable
// properties that become safehouses, the weapon wheel, the car radio, and
// localStorage saves (3 slots + autosave).
//
// Shared fields owned here:
//   state.data.respect, state.data.rank, state.data.districtStanding,
//   state.data.garageTiers {engine, armor, nitro},
//   state.data.ownedProperties [locationIds], state.data.shirtColor,
//   state.data.armor, state.data.radio {index, name, track},
//   state.data.wheelOpen, state.data.prompt (with promptTick),
//   state.data.addRespect / addMoney / saveGame / loadGame for other systems.

import { WEAPON_ORDER, WEAPONS, ensureWeapons } from './combat.js';
import { healPlayer } from './player.js';

export const RANKS = [
  { at: 0, name: 'Nobody' },
  { at: 100, name: 'Runner' },
  { at: 250, name: 'Wheelman' },
  { at: 500, name: 'Fixer' },
  { at: 900, name: 'Made Man' },
  { at: 1500, name: 'Port Royalty' },
];

export const RADIO_STATIONS = [
  { name: 'Radio Brisa FM', genre: 'Coastal Pop', tracks: ['Neon Palms — Tide Lines', 'Brisa Nights — The Coral Club', 'Salt & Chrome — Marina Rey'] },
  { name: 'Faro Rock 98.1', genre: 'Harbour Rock', tracks: ['Docklight Anthem — Rust Anchor', 'Four Star Run — The Getaways', 'Lighthouse Blues — Vera Sol'] },
  { name: 'Onda Sombra', genre: 'Dark Synth', tracks: ['Ledger of Shadows — V. Sombra', 'Night Freight — Port Ghosts', 'Black Tide — Isla Verde'] },
];

const SHIRT_COLORS = ['#0e7c86', '#ee6c4d', '#ffd166', '#8338ec', '#22354f', '#f4f1de'];
const UPGRADE_COST = [800, 1600, 3000];
const SAVE_PREFIX = 'azul-tide-save-';

let pendingSave = false;
let pendingLoad = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'F5') { ev.preventDefault(); pendingSave = true; }
    if (ev.code === 'F9') { ev.preventDefault(); pendingLoad = true; }
  });
}

export function rankFor(respect) {
  let rank = RANKS[0];
  for (const r of RANKS) if (respect >= r.at) rank = r;
  return rank;
}

export function nextRank(respect) {
  for (const r of RANKS) if (respect < r.at) return r;
  return null;
}

function ensureProgression(state) {
  const d = state.data;
  if (d.progressionInit) return;
  d.progressionInit = true;
  if (d.respect === undefined) d.respect = 0;
  if (!d.districtStanding) {
    d.districtStanding = {};
    for (const loc of state.city.locations) void loc;
    for (const id of ['coral-heights', 'the-flats', 'portside-market', 'marina-alta', 'old-harbor', 'isla-verde', 'faro-point']) {
      d.districtStanding[id] = 0;
    }
  }
  if (!d.garageTiers) d.garageTiers = { engine: 0, armor: 0, nitro: 0 };
  if (!d.ownedProperties) d.ownedProperties = [];
  if (d.shirtColor === undefined) d.shirtColor = SHIRT_COLORS[0];
  if (d.shirtIndex === undefined) d.shirtIndex = 0;
  if (d.armor === undefined) d.armor = 0;
  if (!d.radio) d.radio = { index: 0, name: RADIO_STATIONS[0].name, track: RADIO_STATIONS[0].tracks[0], trackIndex: 0 };
  d.radioToastT = 0;
  d.wheelOpen = false;
  d.addRespect = (n) => { d.respect += n; };
  d.addMoney = (n) => { state.money += n; };
  d.saveGame = (slot) => saveGame(state, slot);
  d.loadGame = (slot) => loadGame(state, slot);
}

export function priceFor(state, base, districtId) {
  const standing = (state.data.districtStanding && state.data.districtStanding[districtId]) || 0;
  const discount = Math.min(0.15, standing * 0.01);
  return Math.round(base * (1 - discount));
}

function saveGame(state, slot) {
  try {
    const d = state.data;
    const payload = {
      money: state.money,
      respect: d.respect || 0,
      storyIndex: d.storyIndex || 0,
      ownedProperties: d.ownedProperties || [],
      garageTiers: d.garageTiers || { engine: 0, armor: 0, nitro: 0 },
      districtStanding: d.districtStanding || {},
      shirtIndex: d.shirtIndex || 0,
      armor: d.armor || 0,
      weapons: d.weapons ? { current: d.weapons.current, unlocked: d.weapons.unlocked } : null,
    };
    localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(payload));
    state.data.saveToastT = state.time + 2.5;
    state.data.saveToast = 'Saved — slot ' + slot;
    return true;
  } catch (err) {
    return false;
  }
}

function loadGame(state, slot) {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + slot) || localStorage.getItem(SAVE_PREFIX + 'auto');
    if (!raw) return false;
    const data = JSON.parse(raw);
    const d = state.data;
    state.money = data.money || 0;
    d.respect = data.respect || 0;
    d.storyIndex = data.storyIndex || 0;
    d.ownedProperties = data.ownedProperties || [];
    d.garageTiers = data.garageTiers || { engine: 0, armor: 0, nitro: 0 };
    d.districtStanding = data.districtStanding || d.districtStanding;
    d.shirtIndex = data.shirtIndex || 0;
    d.shirtColor = SHIRT_COLORS[d.shirtIndex % SHIRT_COLORS.length];
    d.armor = data.armor || 0;
    if (data.weapons && d.weapons) {
      d.weapons.unlocked = data.weapons.unlocked;
      if (data.weapons.current && d.weapons.unlocked[data.weapons.current]) d.weapons.current = data.weapons.current;
    }
    d.saveToastT = state.time + 2.5;
    d.saveToast = 'Loaded — slot ' + slot;
    return true;
  } catch (err) {
    return false;
  }
}

function nearLocation(state, kind, radius) {
  const p = state.player;
  for (const loc of state.city.locations) {
    if (loc.kind !== kind) continue;
    const d = Math.hypot(p.x - loc.x, p.y - loc.y);
    if (d < radius) return loc;
  }
  return null;
}

function setPrompt(state, text) {
  state.data.prompt = text;
  state.data.promptTick = state.tick;
}

function updateGarage(state) {
  const loc = nearLocation(state, 'garage', 95);
  state.data.atGarage = loc;
  if (!loc) return;
  const tiers = state.data.garageTiers;
  const district = state.city.districtAt(loc.x, loc.y);
  const cost = (track) => tiers[track] >= 3 ? null : priceFor(state, UPGRADE_COST[tiers[track]], district.id);
  const fmt = (track, key) => {
    const c = cost(track);
    return c === null ? track + ' MAX' : key + ' ' + track + ' $' + c;
  };
  setPrompt(state, loc.name + ' — Upgrades: [' + fmt('engine', 'U') + '] [' + fmt('armor', 'I') + '] [' + fmt('nitro', 'O') + ']');
  const buy = (track) => {
    const c = cost(track);
    if (c === null) return;
    if (state.money < c) {
      state.data.saveToastT = state.time + 2;
      state.data.saveToast = 'Not enough cash for ' + track + ' tier ' + (tiers[track] + 1);
      return;
    }
    state.money -= c;
    tiers[track] += 1;
    if (state.data.audioQueue) state.data.audioQueue.push('chime');
    state.data.requestAutosave = true;
  };
  if (state.input.wasPressed('KeyU')) buy('engine');
  if (state.input.wasPressed('KeyI')) buy('armor');
  if (state.input.wasPressed('KeyO')) buy('nitro');
}

function applyGarageEffects(state, dt) {
  const car = state.vehicles.playerCar;
  if (!car || state.player.mode !== 'car') return;
  const tiers = state.data.garageTiers;
  // Nitro: Shift spends boost while driving.
  if (tiers.nitro > 0 && (state.input.down('ShiftLeft') || state.input.down('ShiftRight'))) {
    if (Math.abs(car.speed) > 40) {
      car.speed += Math.sign(car.speed) * (160 + tiers.nitro * 70) * dt;
      state.data.nitroActive = true;
    }
  } else state.data.nitroActive = false;
  // Engine tiers add a whisper of extra shove under throttle.
  if (tiers.engine > 0 && state.input.throttle() > 0) {
    car.speed += tiers.engine * 14 * dt;
  }
}

function updateShop(state) {
  const loc = nearLocation(state, 'shop', 85);
  state.data.atShop = loc;
  if (!loc) return false;
  const district = state.city.districtAt(loc.x, loc.y);
  const armorCost = priceFor(state, 200, district.id);
  const mealCost = priceFor(state, 40, district.id);
  const medCost = priceFor(state, 120, district.id);
  const clothesCost = priceFor(state, 60, district.id);
  setPrompt(state, loc.name + ' — [6] Armor $' + armorCost + ' · [7] Meal $' + mealCost + ' · [8] Medkit $' + medCost + ' · [9] Clothes $' + clothesCost);
  const spend = (cost) => {
    if (state.money < cost) {
      state.data.saveToastT = state.time + 2;
      state.data.saveToast = 'Not enough cash';
      return false;
    }
    state.money -= cost;
    if (state.data.audioQueue) state.data.audioQueue.push('pickup');
    return true;
  };
  if (state.input.wasPressed('Digit6') && spend(armorCost)) state.data.armor = 100;
  if (state.input.wasPressed('Digit7') && spend(mealCost)) healPlayer(state, 30);
  if (state.input.wasPressed('Digit8') && spend(medCost)) healPlayer(state, 100);
  if (state.input.wasPressed('Digit9') && spend(clothesCost)) {
    state.data.shirtIndex = ((state.data.shirtIndex || 0) + 1) % SHIRT_COLORS.length;
    state.data.shirtColor = SHIRT_COLORS[state.data.shirtIndex];
  }
  return true;
}

function updateProperties(state) {
  const p = state.player;
  state.data.inSafehouse = false;
  for (const loc of state.city.locations) {
    if (loc.kind !== 'property') continue;
    const d = Math.hypot(p.x - loc.x, p.y - loc.y);
    if (d > 85) continue;
    const owned = state.data.ownedProperties.includes(loc.id);
    if (owned) {
      state.data.inSafehouse = true;
      state.data.hidden = true;
      setPrompt(state, loc.name + ' — your safehouse. Heat fades fast here. (Autosaves)');
      if (!state.data._safehouseSaved) {
        state.data._safehouseSaved = true;
        saveGame(state, 'auto');
      }
    } else {
      setPrompt(state, 'F — Buy ' + loc.name + ' for $' + loc.price + ' (safehouse)');
      if (state.input.wasPressed('KeyF')) {
        if (state.money >= loc.price) {
          state.money -= loc.price;
          state.data.ownedProperties.push(loc.id);
          if (state.data.audioQueue) state.data.audioQueue.push('complete');
          state.data.requestAutosave = true;
        } else {
          state.data.saveToastT = state.time + 2;
          state.data.saveToast = 'Need $' + loc.price + ' for ' + loc.name;
        }
      }
    }
    return;
  }
  state.data._safehouseSaved = false;
  const atGarage = state.data.atGarage;
  state.data.hidden = !!(atGarage && Math.hypot(p.x - atGarage.x, p.y - atGarage.y) < 55);
}

function updateRadio(state, dt) {
  const radio = state.data.radio;
  const driving = state.player.mode === 'car';
  const cycle = (dir) => {
    radio.index = (radio.index + dir + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    radio.trackIndex = 0;
    radio.name = RADIO_STATIONS[radio.index].name;
    radio.track = RADIO_STATIONS[radio.index].tracks[0];
    state.data.radioToastT = state.time + 2.6;
    if (state.data.audioQueue) state.data.audioQueue.push('click');
  };
  if (driving) {
    if (state.input.wasPressed('KeyM') || state.input.wasPressed('BracketRight')) cycle(1);
    if (state.input.wasPressed('BracketLeft')) cycle(-1);
    // Tracks roll over as the city rolls by.
    const trackSlot = Math.floor(state.time / 18) % RADIO_STATIONS[radio.index].tracks.length;
    if (trackSlot !== radio.trackIndex) {
      radio.trackIndex = trackSlot;
      radio.track = RADIO_STATIONS[radio.index].tracks[trackSlot];
    }
  }
  void dt;
}

function updateWheel(state) {
  const held = state.input.down('KeyQ') || state.input.down('Tab') || state.data.wheelHold;
  state.data.wheelOpen = !!held;
  if (state.data.wheelOpen) {
    const weapons = ensureWeapons(state);
    for (let i = 0; i < WEAPON_ORDER.length; i++) {
      if (state.input.wasPressed('Digit' + (i + 1))) {
        const id = WEAPON_ORDER[i];
        if (weapons.unlocked[id]) weapons.current = id;
      }
    }
    if (state.input.mouseDown && state.data.wheelPick) {
      const id = state.data.wheelPick;
      if (weapons.unlocked[id]) weapons.current = id;
    }
  }
}

function updateArmorAbsorb(state) {
  // Body armor (shop) and garage armor plating soak part of any health loss.
  const d = state.data;
  const hp = state.player.health;
  if (d._lastHealth === undefined) d._lastHealth = hp;
  if (hp < d._lastHealth && d.armor > 0 && !state.player.dead) {
    const loss = d._lastHealth - hp;
    const soaked = Math.min(d.armor, loss * 0.5);
    d.armor -= soaked;
    healPlayer(state, soaked);
  }
  d._lastHealth = state.player.health;
}

function update(state, dt) {
  ensureProgression(state);
  ensureWeapons(state);
  const d = state.data;
  d.rank = rankFor(d.respect || 0);
  d.currentDistrict = state.city.districtAt(state.player.x, state.player.y);

  if (pendingSave) { pendingSave = false; saveGame(state, 1); }
  if (pendingLoad) { pendingLoad = false; loadGame(state, 1); }
  if (d.requestAutosave) {
    d.requestAutosave = false;
    saveGame(state, 'auto');
  }

  updateWheel(state);
  const atShop = updateShop(state);
  if (!atShop) updateGarage(state);
  updateProperties(state);
  updateRadio(state, dt);
  applyGarageEffects(state, dt);
  updateArmorAbsorb(state);
}

function render(ctx, state, w, h) {
  const d = state.data;
  // Shirt colour: the core draws Dario in teal; the owned shirt is painted
  // over him here so a clothes purchase visibly changes his look.
  if (state.player.mode === 'foot' && d.shirtColor && state.mode === 'playing') {
    const px = state.player.x - state.camera.x + w / 2;
    const py = state.player.y - state.camera.y + h / 2;
    ctx.fillStyle = d.shirtColor;
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(px, py, 5.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Weapon wheel overlay.
  if (d.wheelOpen && state.mode === 'playing') {
    const weapons = state.data.weapons;
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = 'rgba(8,20,30,0.66)';
    ctx.beginPath();
    ctx.arc(cx, cy, 128, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,209,102,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WEAPON WHEEL', cx, cy - 96);
    WEAPON_ORDER.forEach((id, i) => {
      const a = -Math.PI / 2 + (i / WEAPON_ORDER.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * 82;
      const y = cy + Math.sin(a) * 82;
      const unlocked = weapons && weapons.unlocked[id];
      const selected = weapons && weapons.current === id;
      ctx.fillStyle = selected ? '#ffd166' : unlocked ? 'rgba(244,241,222,0.92)' : 'rgba(120,130,140,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = selected ? '#17323e' : '#17323e';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(unlocked ? WEAPONS[id].name : 'LOCKED', x, y - 2);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText('[' + (i + 1) + ']', x, y + 12);
    });
    ctx.fillStyle = '#f4f1de';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Number keys select · release Q to close', cx, cy + 112);
  }

  // Nitro flame while boosting.
  if (d.nitroActive && state.vehicles.playerCar) {
    const car = state.vehicles.playerCar;
    const px = car.x - state.camera.x + w / 2;
    const py = car.y - state.camera.y + h / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(80,180,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(-car.length / 2 - 4, -6);
    ctx.lineTo(-car.length / 2 - 22 - Math.random() * 8, 0);
    ctx.lineTo(-car.length / 2 - 4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (d.saveToast && state.time < (d.saveToastT || 0)) {
    ctx.fillStyle = 'rgba(10,22,32,0.78)';
    ctx.fillRect(w / 2 - 110, 54, 220, 26);
    ctx.fillStyle = '#a8dadc';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.saveToast, w / 2, 71);
  }
}

export const progressionSystem = { update, render };
export { SHIRT_COLORS };
