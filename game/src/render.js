// AZUL TIDE — render.js
// Top-down renderer for Port Azul: sun-bleached ground tinted per district,
// asphalt roads with lane dashes and crosswalks, sidewalks, the animated sea,
// sand, harbour docks, buildings with soft shadows and rooftop detail, palms,
// and simple readable shapes for cars, pedestrians and Dario himself. A light
// screen-space vignette finishes the frame. No HUD here — the HUD is a later
// system that draws after renderFrame() using the same context.

import { BEACH_X, H_ROADS, ROAD_W, SEA_X, V_ROADS, WORLD_H, WORLD_W } from './city.js';

const ASPHALT = '#4a4a52';
const ASPHALT_DARK = '#3f3f46';
const SIDEWALK = '#cfc8b4';
const LANE_PAINT = '#f5f0dc';
const SAND = '#eed9a0';
const SEA_A = '#1b7f9e';
const SEA_B = '#25a3c4';
const PARK_GREEN = '#79a85b';
const LOT_GREY = '#8f8f8a';

function drawGround(ctx, state, view) {
  const { city } = state;
  // Base: paint the visible area with each district that intersects it.
  const step = 200;
  for (let x = Math.max(0, Math.floor(view.left / step) * step); x < Math.min(WORLD_W, view.right); x += step) {
    for (let y = Math.max(0, Math.floor(view.top / step) * step); y < Math.min(WORLD_H, view.bottom); y += step) {
      ctx.fillStyle = city.districtAt(x + step / 2, y + step / 2).ground;
      ctx.fillRect(x, y, step + 1, step + 1);
    }
  }
  // Parks and parking lots sit on top of the district ground.
  for (const park of city.parks) {
    if (!inView(park, view)) continue;
    ctx.fillStyle = PARK_GREEN;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(park.x, park.y, park.w, 6);
  }
  for (const lot of city.lots) {
    if (!inView(lot, view)) continue;
    ctx.fillStyle = LOT_GREY;
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let x = lot.x + 16; x < lot.x + lot.w - 10; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, lot.y + 8);
      ctx.lineTo(x, lot.y + lot.h - 8);
      ctx.stroke();
    }
  }
}

function inView(rect, view) {
  const w = rect.w || 0;
  const h = rect.h || 0;
  return rect.x + w >= view.left && rect.x <= view.right && rect.y + h >= view.top && rect.y <= view.bottom;
}

function drawBeachAndSea(ctx, state, view) {
  if (view.right < BEACH_X) return;
  // Sand.
  ctx.fillStyle = SAND;
  ctx.fillRect(BEACH_X, 0, SEA_X - BEACH_X, WORLD_H);
  // Animated water: two drifting sine bands over a gradient base.
  const t = state.time;
  ctx.fillStyle = SEA_A;
  ctx.fillRect(SEA_X, 0, WORLD_W - SEA_X + 600, WORLD_H);
  ctx.fillStyle = SEA_B;
  for (let y = -40; y < WORLD_H + 40; y += 64) {
    const off = Math.sin(t * 0.7 + y * 0.02) * 22;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(SEA_X + 30 + off, y, WORLD_W - SEA_X + 600, 16);
  }
  ctx.globalAlpha = 1;
  // Foam line where the sea meets the sand.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let y = 0; y <= WORLD_H; y += 32) {
    const x = SEA_X + Math.sin(t * 1.3 + y * 0.03) * 7;
    if (y === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Harbour docks.
  for (const dock of state.city.docks) {
    ctx.fillStyle = '#8a6f4d';
    ctx.fillRect(dock.x, dock.y, dock.w, dock.h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = dock.x + 12; x < dock.x + dock.w; x += 26) ctx.fillRect(x, dock.y, 3, dock.h);
    // Moored boats.
    ctx.fillStyle = '#f4f1de';
    ctx.fillRect(dock.x + 60, dock.y + dock.h + 10, 54, 18);
    ctx.fillStyle = '#e07a5f';
    ctx.fillRect(dock.x + 190, dock.y - 28, 62, 18);
  }
  // Lighthouse.
  const lh = state.city.lighthouse;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(lh.x + 6, lh.y + 8, lh.r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f1de';
  ctx.beginPath();
  ctx.arc(lh.x, lh.y, lh.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e07a5f';
  ctx.beginPath();
  ctx.arc(lh.x, lh.y, lh.r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(lh.x, lh.y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoads(ctx, state, view) {
  // Sidewalk slabs first (wider than the asphalt), then the road surface.
  ctx.fillStyle = SIDEWALK;
  for (const cx of V_ROADS) ctx.fillRect(cx - ROAD_W / 2 - 12, 0, ROAD_W + 24, WORLD_H);
  for (const cy of H_ROADS) ctx.fillRect(0, cy - ROAD_W / 2 - 12, BEACH_X + 40, ROAD_W + 24);
  ctx.fillStyle = ASPHALT;
  for (const cx of V_ROADS) ctx.fillRect(cx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const cy of H_ROADS) ctx.fillRect(0, cy - ROAD_W / 2, BEACH_X + 40, ROAD_W);
  ctx.fillStyle = ASPHALT_DARK;
  for (const cx of V_ROADS) {
    for (const cy of H_ROADS) ctx.fillRect(cx - ROAD_W / 2, cy - ROAD_W / 2, ROAD_W, ROAD_W);
  }
  // Centre dashes.
  ctx.strokeStyle = LANE_PAINT;
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 22]);
  ctx.globalAlpha = 0.8;
  for (const cx of V_ROADS) {
    ctx.beginPath();
    ctx.moveTo(cx, Math.max(0, view.top));
    ctx.lineTo(cx, Math.min(WORLD_H, view.bottom));
    ctx.stroke();
  }
  for (const cy of H_ROADS) {
    ctx.beginPath();
    ctx.moveTo(Math.max(0, view.left), cy);
    ctx.lineTo(Math.min(BEACH_X, view.right), cy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(245,240,220,0.55)';
  for (const cx of V_ROADS) {
    for (const cy of H_ROADS) {
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(cx - ROAD_W / 2 - 10, cy + i * 22 - 6, 14, 12);
        ctx.fillRect(cx + ROAD_W / 2 - 4, cy + i * 22 - 6, 14, 12);
      }
    }
  }
  void state;
}

function drawBuildings(ctx, state, view) {
  for (const b of state.city.buildings) {
    if (!inView(b, view)) continue;
    // Soft shadow leaning away from the sun.
    ctx.fillStyle = 'rgba(30,30,40,0.25)';
    ctx.fillRect(b.x + b.height * 0.45, b.y + b.height * 0.55, b.w, b.h);
    // Walls then roof.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x - b.height * 0.16, b.y - b.height * 0.2, b.w, b.h);
    // Rooftop detail: rim + a small plant box / water tank.
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x - b.height * 0.16 + 4, b.y - b.height * 0.2 + 4, b.w - 8, b.h - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(b.x + b.w * 0.18, b.y + b.h * 0.16, b.w * 0.24, b.h * 0.2);
  }
}

function drawPalms(ctx, state, view) {
  for (const palm of state.city.palms) {
    if (palm.x < view.left - 40 || palm.x > view.right + 40 || palm.y < view.top - 40 || palm.y > view.bottom + 40) continue;
    const s = palm.s;
    ctx.fillStyle = 'rgba(30,30,40,0.2)';
    ctx.beginPath();
    ctx.arc(palm.x + 7 * s, palm.y + 8 * s, 13 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2e7d46';
    ctx.lineWidth = 3.4 * s;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + palm.x * 0.01;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.quadraticCurveTo(
        palm.x + Math.cos(a) * 10 * s,
        palm.y + Math.sin(a) * 10 * s - 4,
        palm.x + Math.cos(a) * 17 * s,
        palm.y + Math.sin(a) * 17 * s + 3,
      );
      ctx.stroke();
    }
    ctx.fillStyle = '#6b4f2e';
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, 3.4 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.length;
  const W = car.width;
  // Shadow.
  ctx.fillStyle = 'rgba(20,20,30,0.3)';
  ctx.fillRect(-L / 2 + 4, -W / 2 + 6, L, W);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  // Cabin / cargo.
  ctx.fillStyle = 'rgba(20,30,44,0.85)';
  if (car.type === 'truck') {
    roundRect(ctx, -L / 2 + 6, -W / 2 + 3, 20, W - 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    roundRect(ctx, -L / 2 + 30, -W / 2 + 2, L - 36, W - 4, 3);
    ctx.fill();
  } else if (car.type === 'van') {
    roundRect(ctx, L / 2 - 24, -W / 2 + 3, 18, W - 6, 3);
    ctx.fill();
  } else {
    roundRect(ctx, -L * 0.14, -W / 2 + 4, L * 0.34, W - 8, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, L * 0.24, -W / 2 + 5, L * 0.12, W - 10, 3);
    ctx.fill();
  }
  // Taxi sign.
  if (car.type === 'taxi') {
    ctx.fillStyle = '#3d405b';
    ctx.fillRect(-6, -5, 12, 10);
  }
  // Wheels.
  ctx.fillStyle = '#17171c';
  const wx = L / 2 - 11;
  const wy = W / 2 - 2;
  ctx.fillRect(-wx - 6, -wy - 3, 12, 6);
  ctx.fillRect(-wx - 6, wy - 3, 12, 6);
  ctx.fillRect(wx - 6, -wy - 3, 12, 6);
  ctx.fillRect(wx - 6, wy - 3, 12, 6);
  // Headlights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 6);
  ctx.fillRect(L / 2 - 3, W / 2 - 9, 3, 6);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawPed(ctx, ped) {
  const bob = ped.speed > 0 ? Math.sin(ped.phase) * 1.6 : 0;
  ctx.fillStyle = 'rgba(20,20,30,0.25)';
  ctx.beginPath();
  ctx.arc(ped.x + 2, ped.y + 4, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(ped.x, ped.y + bob * 0.3, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(ped.x, ped.y + bob * 0.3, 4.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPlayer(ctx, state) {
  const p = state.player;
  if (p.mode === 'car') return; // Dario is inside the car; drawCar covers him.
  const bob = p.speed > 0 ? Math.sin(p.walkPhase) * 1.8 : 0;
  ctx.fillStyle = 'rgba(20,20,30,0.3)';
  ctx.beginPath();
  ctx.arc(p.x + 3, p.y + 5, 10, 0, Math.PI * 2);
  ctx.fill();
  // Direction tick.
  ctx.strokeStyle = '#17323e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.angle) * 15, p.y + Math.sin(p.angle) * 15);
  ctx.stroke();
  // Body: teal shirt, the wheelman's colours.
  ctx.fillStyle = '#0e7c86';
  ctx.beginPath();
  ctx.arc(p.x, p.y + bob * 0.3, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(p.x, p.y + bob * 0.3, 5.4, 0, Math.PI * 2);
  ctx.fill();
  // Soft ring so the player is always findable in a crowd.
  ctx.strokeStyle = 'rgba(255,209,102,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 14 + Math.sin(state.time * 3) * 1.2, 0, Math.PI * 2);
  ctx.stroke();
}

// Location markers for shops / garages / properties (faint until a later
// system decides how to present them; drawn here so the world reads alive).
function drawLocations(ctx, state, view) {
  for (const loc of state.city.locations) {
    if (loc.kind === 'spawn' || loc.kind === 'landmark') continue;
    if (loc.x < view.left - 30 || loc.x > view.right + 30 || loc.y < view.top - 30 || loc.y > view.bottom + 30) continue;
    ctx.fillStyle = loc.kind === 'garage' ? '#118ab2' : loc.kind === 'shop' ? '#e9c46a' : '#81b29a';
    ctx.beginPath();
    ctx.arc(loc.x, loc.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#17323e';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(loc.kind === 'garage' ? 'G' : loc.kind === 'shop' ? '$' : 'H', loc.x, loc.y + 0.5);
  }
}

// Main entry: paint one frame of the world (no HUD, no menus).
export function renderFrame(ctx, state, viewW, viewH) {
  const cam = state.camera;
  const view = {
    left: cam.x - viewW / 2,
    top: cam.y - viewH / 2,
    right: cam.x + viewW / 2,
    bottom: cam.y + viewH / 2,
  };
  ctx.fillStyle = '#1b7f9e';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(viewW / 2 - cam.x, viewH / 2 - cam.y);
  drawGround(ctx, state, view);
  drawBeachAndSea(ctx, state, view);
  drawRoads(ctx, state, view);
  drawLocations(ctx, state, view);
  drawPalms(ctx, state, view);
  for (const car of state.vehicles.parked) drawCar(ctx, car);
  for (const car of state.vehicles.traffic) drawCar(ctx, car);
  if (state.vehicles.playerCar) drawCar(ctx, state.vehicles.playerCar);
  for (const ped of state.peds) drawPed(ctx, ped);
  drawPlayer(ctx, state);
  drawBuildings(ctx, state, view);
  ctx.restore();
  // Screen-space vignette.
  const grad = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.42, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
  grad.addColorStop(0, 'rgba(10,20,30,0)');
  grad.addColorStop(1, 'rgba(10,20,30,0.28)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);
}
