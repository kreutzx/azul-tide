// AZUL TIDE — city.js
// Port Azul: a seeded, deterministic coastal city. The whole map — road grid,
// seven named districts, buildings, palms, parks, the beach, the harbour and
// every spawn / shop / garage / property location — is generated from one seed
// with a small mulberry32 generator, so ?seed=N always builds the same city.
//
// World layout (world units = pixels at zoom 1):
//   3600 x 2600. The sea fills x >= 3120; a sand beach runs 2960..3120.
//   Vertical avenues at x = 420, 940, 1460, 1980, 2500 (width 120).
//   Horizontal streets at y = 380, 860, 1340, 1820, 2300 (width 120).
//   Blocks between roads hold buildings, parks or parking lots.
//
// Exports the second builder relies on:
//   createCity(seed) -> city object (also stored on state.city)
//   city.districtAt(x, y) -> district record { id, name, ... }
//   city.isRoad(x, y), city.isWater(x, y), city.isSolid(x, y)
//   city.collide(pos, radius) -> resolves a circle out of solids, returns hit flag
//   city.nearestRoadPoint(x, y), city.randomRoadPoint(rng)
//   DISTRICTS, STREETS, WORLD_W, WORLD_H, createRng

export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const SEA_X = 3120;
export const BEACH_X = 2960;
export const ROAD_W = 120;

export const V_ROADS = [420, 940, 1460, 1980, 2500];
export const H_ROADS = [380, 860, 1340, 1820, 2300];

export const STREETS = {
  vertical: ['Avenida Brisa', 'Calle Luna', 'Avenida Coral', 'Calle Faro', 'Avenida Marina'],
  horizontal: ['Paseo del Sol', 'Calle Mercado', 'Avenida Palmas', 'Calle Muelle', 'Paseo Azul'],
};

// The seven districts of Port Azul. Each carries its own ground tint, building
// palette and prop density so the neighbourhoods read differently from above.
export const DISTRICTS = [
  { id: 'coral-heights', name: 'Coral Heights', ground: '#b9cf8e', roof: ['#e8b4a0', '#dfc39a', '#cfe0b8', '#f0d9b5'], palm: 0.5, parkChance: 0.34 },
  { id: 'the-flats', name: 'The Flats', ground: '#a8b184', roof: ['#9aa3a8', '#b08968', '#8d99ae', '#c2b280'], palm: 0.18, parkChance: 0.1 },
  { id: 'portside-market', name: 'Portside Market', ground: '#c2b184', roof: ['#e07a5f', '#f2cc8f', '#81b29a', '#e8c07d'], palm: 0.3, parkChance: 0.06 },
  { id: 'marina-alta', name: 'Marina Alta', ground: '#b5c99a', roof: ['#f4f1de', '#a8dadc', '#e9c46a', '#ffffff'], palm: 0.65, parkChance: 0.22 },
  { id: 'old-harbor', name: 'Old Harbor', ground: '#9d9d8a', roof: ['#7d8597', '#979dac', '#6c757d', '#8a817c'], palm: 0.1, parkChance: 0.02 },
  { id: 'isla-verde', name: 'Isla Verde', ground: '#8fbc7a', roof: ['#dce8b8', '#b5d99c', '#f0e6b8', '#cfe8a8'], palm: 0.8, parkChance: 0.55 },
  { id: 'faro-point', name: 'Faro Point', ground: '#c9bd93', roof: ['#f4f1de', '#e07a5f', '#ffffff', '#e9c46a'], palm: 0.45, parkChance: 0.18 },
];

// Deterministic RNG (mulberry32). Same seed, same stream, every run.
export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function districtFor(x, y) {
  if (x >= BEACH_X) return DISTRICTS[6]; // Faro Point headland / shore
  if (y >= 2240 && x < 940) return DISTRICTS[5]; // Isla Verde, green south-west
  if (y >= 1760 && x >= 1900) return DISTRICTS[4]; // Old Harbor, docklands south-east
  if (x >= 2440 && y < 1280) return DISTRICTS[3]; // Marina Alta, north-east coast
  if (y < 820 && x < 1520) return DISTRICTS[0]; // Coral Heights, north-west hills
  if (x >= 880 && x < 2060 && y >= 820 && y < 2240) return DISTRICTS[2]; // Portside Market, centre
  return DISTRICTS[1]; // The Flats fill the rest of the west / centre-south
}

export function createCity(seed) {
  const rng = createRng(seed * 7919 + 13);

  // ---- blocks, buildings, parks -------------------------------------------
  const buildings = []; // { x, y, w, h, height, color, districtId }
  const parks = []; // { x, y, w, h }
  const lots = []; // parking lots { x, y, w, h }
  const xEdges = [0, ...V_ROADS.flatMap((cx) => [cx - ROAD_W / 2, cx + ROAD_W / 2]), BEACH_X];
  const yEdges = [0, ...H_ROADS.flatMap((cy) => [cy - ROAD_W / 2, cy + ROAD_W / 2]), WORLD_H];

  for (let xi = 0; xi < xEdges.length - 1; xi += 2) {
    for (let yi = 0; yi < yEdges.length - 1; yi += 2) {
      const bx = xEdges[xi];
      const by = yEdges[yi];
      const bw = xEdges[xi + 1] - bx;
      const bh = yEdges[yi + 1] - by;
      if (bw < 120 || bh < 120) continue;
      const district = districtFor(bx + bw / 2, by + bh / 2);
      const roll = rng();
      const inset = 14;
      if (roll < district.parkChance) {
        parks.push({ x: bx + inset, y: by + inset, w: bw - inset * 2, h: bh - inset * 2, districtId: district.id });
        continue;
      }
      if (roll > 0.93) {
        lots.push({ x: bx + inset, y: by + inset, w: bw - inset * 2, h: bh - inset * 2, districtId: district.id });
        continue;
      }
      // Subdivide the block into 2x2 lots; most hold a building.
      const cols = 2;
      const rows = 2;
      const cellW = bw / cols;
      const cellH = bh / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rng() < 0.14) continue; // empty lot / courtyard
          const pad = 12 + rng() * 10;
          const w = cellW - pad * 2;
          const h = cellH - pad * 2;
          if (w < 40 || h < 40) continue;
          buildings.push({
            x: bx + c * cellW + pad,
            y: by + r * cellH + pad,
            w,
            h,
            height: 10 + Math.floor(rng() * 30),
            color: district.roof[Math.floor(rng() * district.roof.length)],
            districtId: district.id,
          });
        }
      }
    }
  }

  // ---- harbour docks: solid piers reaching into the sea -------------------
  const docks = [];
  for (let i = 0; i < 4; i++) {
    docks.push({ x: SEA_X, y: 1560 + i * 240, w: 300, h: 44 });
  }
  // Lighthouse on Faro Point.
  const lighthouse = { x: 3300, y: 180, r: 26 };

  // ---- palm trees: beach rows, park scatter, street sprinkling ------------
  const palms = [];
  for (let y = 60; y < WORLD_H - 40; y += 90 + rng() * 60) {
    palms.push({ x: BEACH_X + 30 + rng() * 90, y, s: 0.8 + rng() * 0.5 });
  }
  for (const park of parks) {
    const n = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      palms.push({ x: park.x + rng() * park.w, y: park.y + rng() * park.h, s: 0.8 + rng() * 0.6 });
    }
  }
  for (let i = 0; i < 130; i++) {
    const onV = rng() < 0.5;
    const cx = onV ? V_ROADS[Math.floor(rng() * V_ROADS.length)] : 100 + rng() * 2800;
    const cy = onV ? 60 + rng() * (WORLD_H - 120) : H_ROADS[Math.floor(rng() * H_ROADS.length)];
    const px = onV ? cx + (rng() < 0.5 ? -ROAD_W / 2 - 16 : ROAD_W / 2 + 16) : cx;
    const py = onV ? cy : cy + (rng() < 0.5 ? -ROAD_W / 2 - 16 : ROAD_W / 2 + 16);
    const d = districtFor(px, py);
    if (rng() < d.palm) palms.push({ x: px, y: py, s: 0.75 + rng() * 0.5 });
  }

  // ---- named locations the progression / mission systems build on ---------
  const locations = [
    { id: 'market', kind: 'contact', name: 'Portside Market — Carmen Reyes', x: 1460, y: 1280 },
    { id: 'garage-central', kind: 'garage', name: 'Taller Luna Garage', x: 940, y: 800 },
    { id: 'garage-harbor', kind: 'garage', name: 'Harbor Chop & Repair', x: 2500, y: 1880 },
    { id: 'shop-market', kind: 'shop', name: 'Mercado Central', x: 1520, y: 1400 },
    { id: 'shop-marina', kind: 'shop', name: 'Marina Alta Boutique', x: 2560, y: 800 },
    { id: 'safehouse-flats', kind: 'property', name: 'Flats Safehouse', price: 4000, x: 360, y: 1400 },
    { id: 'apt-market', kind: 'property', name: 'Market Apartment', price: 12000, x: 1400, y: 920 },
    { id: 'villa-marina', kind: 'property', name: 'Marina Alta Villa', price: 45000, x: 2560, y: 320 },
    { id: 'sombra-warehouse', kind: 'landmark', name: 'Sombra Warehouse', x: 2620, y: 2060 },
    { id: 'lighthouse', kind: 'landmark', name: 'Faro Point Lighthouse', x: lighthouse.x, y: lighthouse.y },
    { id: 'player-spawn', kind: 'spawn', name: 'Old Harbor Docks', x: 2620, y: 1420 },
  ];

  const spawn = locations.find((l) => l.id === 'player-spawn');

  function isRoad(x, y) {
    if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return false;
    for (const cx of V_ROADS) if (Math.abs(x - cx) <= ROAD_W / 2) return true;
    for (const cy of H_ROADS) if (Math.abs(y - cy) <= ROAD_W / 2) return true;
    return false;
  }

  function isWater(x, y) {
    if (x < SEA_X) return false;
    for (const d of docks) {
      if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return false;
    }
    return true;
  }

  function isSolid(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return true;
    if (isWater(x, y)) return true;
    for (const b of buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    const dx = x - lighthouse.x;
    const dy = y - lighthouse.y;
    if (dx * dx + dy * dy < lighthouse.r * lighthouse.r) return true;
    return false;
  }

  // Resolve a circle (pos mutated in place) out of buildings, water and the
  // world edge. Returns true when a collision was corrected.
  function collide(pos, radius) {
    let hit = false;
    if (pos.x < radius) { pos.x = radius; hit = true; }
    if (pos.y < radius) { pos.y = radius; hit = true; }
    if (pos.x > WORLD_W - radius) { pos.x = WORLD_W - radius; hit = true; }
    if (pos.y > WORLD_H - radius) { pos.y = WORLD_H - radius; hit = true; }
    for (const b of buildings) {
      const nx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(pos.y, b.y + b.h));
      const dx = pos.x - nx;
      const dy = pos.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.y = ny + (dy / d) * radius;
        } else {
          // Centre inside the rect: push out along the smallest penetration.
          const left = pos.x - b.x;
          const right = b.x + b.w - pos.x;
          const top = pos.y - b.y;
          const bottom = b.y + b.h - pos.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) pos.x = b.x - radius;
          else if (m === right) pos.x = b.x + b.w + radius;
          else if (m === top) pos.y = b.y - radius;
          else pos.y = b.y + b.h + radius;
        }
      }
    }
    // Water is solid to everything except when standing on a dock.
    if (isWater(pos.x, pos.y)) {
      pos.x = SEA_X - radius;
      hit = true;
    }
    return hit;
  }

  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const cx of V_ROADS) {
      const d = Math.abs(x - cx);
      if (d < bestD) { bestD = d; best = { x: cx, y, axis: 'v', line: cx }; }
    }
    for (const cy of H_ROADS) {
      const d = Math.abs(y - cy);
      if (d < bestD) { bestD = d; best = { x, y: cy, axis: 'h', line: cy }; }
    }
    return best;
  }

  function randomRoadPoint(r) {
    if (r() < 0.5) {
      const cx = V_ROADS[Math.floor(r() * V_ROADS.length)];
      return { x: cx, y: 80 + r() * (WORLD_H - 160), axis: 'v', line: cx };
    }
    const cy = H_ROADS[Math.floor(r() * H_ROADS.length)];
    return { x: 80 + r() * (BEACH_X - 160), y: cy, axis: 'h', line: cy };
  }

  return {
    seed,
    width: WORLD_W,
    height: WORLD_H,
    buildings,
    parks,
    lots,
    docks,
    palms,
    lighthouse,
    locations,
    spawn: { x: spawn.x, y: spawn.y },
    districtAt(x, y) {
      return districtFor(x, y);
    },
    isRoad,
    isWater,
    isSolid,
    collide,
    nearestRoadPoint,
    randomRoadPoint,
  };
}
