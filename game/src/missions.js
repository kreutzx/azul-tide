// AZUL TIDE — missions.js
// The mission engine and Carmen Reyes' fourteen-job story chain against the
// Sombra syndicate, plus repeatable side work (taxi fares, courier runs,
// street races, vigilante hits) offered at standing markers around Port Azul,
// and twelve hidden Sombra packages stashed across the city that pay cash
// when Dario walks or drives over them.
//
// Objective types: goto, deliver, chase-target, escort, race-checkpoints,
// tail, combat-clear, escape. The engine runs one objective at a time, keeps
// a world beacon + state.data.missionMarker for the minimap, an objective
// banner string for the HUD, and a dialogue queue (speaker + line) that the
// HUD renders. Completing a story mission pays cash, grants respect through
// progression's API when present, unlocks the next mission, and requests an
// autosave.

import { drawCar } from './render.js';
import { driveCar, makeCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { raiseWanted } from './police.js';

const MARKET = { x: 1460, y: 1280 };
const GARAGE_CENTRAL = { x: 940, y: 800 };
const GARAGE_HARBOR = { x: 2500, y: 1880 };
const WAREHOUSE = { x: 2620, y: 2060 };
const LIGHTHOUSE = { x: 3300, y: 180 };
const MARINA = { x: 2560, y: 800 };
const DOCKS = { x: 2620, y: 1420 };

export const STORY_MISSIONS = [
  {
    id: 'first-run', title: 'First Run', payout: 600, respect: 40,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'Dario. One package, no questions. Marina Alta, fast and clean.'], ['Dario Luna', 'Consider it already there.']],
    dialogEnd: [['Carmen Reyes', 'Clean work. Port Azul is noticing you.']],
    objectives: [
      { type: 'goto', x: MARKET.x, y: MARKET.y, label: 'Pick up the package at Portside Market', radius: 55 },
      { type: 'deliver', x: 2500, y: 860, label: 'Deliver the package to Marina Alta', radius: 55, needCar: true },
    ],
  },
  {
    id: 'dockside-pickup', title: 'Dockside Pickup', payout: 850, respect: 55,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'Cargo waits at the Old Harbor docks. The port police nap at noon — usually.'], ['Dario Luna', 'Usually is my favourite word.']],
    dialogEnd: [['Carmen Reyes', 'The harbour provides. So do I.']],
    objectives: [
      { type: 'goto', x: DOCKS.x, y: DOCKS.y, label: 'Collect the cargo at the Old Harbor docks', radius: 60 },
      { type: 'deliver', x: GARAGE_HARBOR.x, y: GARAGE_HARBOR.y, label: 'Drop the cargo at Harbor Chop & Repair', radius: 60, needCar: true },
    ],
    onStart(state) { raiseWanted(state, 1, 'mission'); },
  },
  {
    id: 'hot-wheels', title: 'Hot Wheels', payout: 1100, respect: 70,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'A collector in Coral Heights leaves a sports car out front. Rude, really.'], ['Dario Luna', 'I will teach it some manners.']],
    dialogEnd: [['Carmen Reyes', 'She purrs. The garage boys are jealous.']],
    objectives: [
      { type: 'goto', x: 420, y: 380, label: 'Reach the sports car in Coral Heights', radius: 70 },
      { type: 'deliver', x: GARAGE_CENTRAL.x, y: GARAGE_CENTRAL.y, label: 'Deliver the sports car to Taller Luna Garage', radius: 65, needCar: true, needType: 'sports' },
    ],
    onStart(state) { spawnMissionCar(state, 'sports', 420, 380, 0, 'target-car'); },
  },
  {
    id: 'escort-carmen', title: 'Escort Carmen', payout: 1400, respect: 85,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'Drive me to the Marina, Dario. Sombra has been asking about my route.'], ['Dario Luna', 'Then we give them a show they regret.']],
    dialogEnd: [['Carmen Reyes', 'You drive like the tide — nobody holds you.']],
    objectives: [
      { type: 'escort', x: MARINA.x, y: MARINA.y, label: 'Escort Carmen to Marina Alta Boutique', radius: 65, needCar: true },
    ],
    onStart(state) {
      spawnChaser(state, 1750, 1150);
      spawnChaser(state, 1200, 1500);
    },
  },
  {
    id: 'race-for-respect', title: 'Race for Respect', payout: 1300, respect: 95,
    start: GARAGE_CENTRAL,
    dialogStart: [['Carmen Reyes', 'The street racers respect one thing: the clock. Beat it.'], ['Dario Luna', 'The clock never stood a chance.']],
    dialogEnd: [['Carmen Reyes', 'Word travels. The racers wave at you now.']],
    objectives: [
      {
        type: 'race-checkpoints', label: 'Hit every checkpoint before the clock dies', radius: 70, time: 95,
        points: [
          { x: 1460, y: 380 }, { x: 2500, y: 860 }, { x: 1980, y: 1340 }, { x: 940, y: 1820 }, { x: 940, y: 800 },
        ],
      },
    ],
  },
  {
    id: 'sombras-tax', title: "Sombra's Tax", payout: 1700, respect: 110,
    start: MARKET,
    dialogStart: [['Victor Sombra', 'Every shop in my city pays the tax, Reyes. Even yours.'], ['Carmen Reyes', 'Three shops, Dario. Show his collectors the door.']],
    dialogEnd: [['Carmen Reyes', 'The market breathes again. Sombra will answer soon.']],
    objectives: [
      { type: 'combat-clear', x: 1520, y: 1400, label: 'Clear Sombra thugs at Mercado Central', radius: 90, thugs: 3 },
      { type: 'combat-clear', x: 2560, y: 800, label: 'Clear Sombra thugs at Marina Alta Boutique', radius: 90, thugs: 3 },
      { type: 'combat-clear', x: 1460, y: 1280, label: 'Clear Sombra thugs at Portside Market', radius: 90, thugs: 4 },
    ],
  },
  {
    id: 'tail-the-courier', title: 'Tail the Courier', payout: 1600, respect: 105,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'Sombra moves his ledger by van. Follow it home — stay close, stay unseen.'], ['Dario Luna', 'A shadow with a steering wheel.']],
    dialogEnd: [['Carmen Reyes', 'Now we know where the money sleeps.']],
    objectives: [
      { type: 'tail', x: WAREHOUSE.x, y: WAREHOUSE.y, label: 'Tail the courier van to its destination', radius: 60 },
    ],
    onStart(state) { spawnMissionCar(state, 'van', 1980, 1340, 0, 'tail-van'); },
  },
  {
    id: 'harbor-heist', title: 'Harbor Heist', payout: 2400, respect: 140,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'Tonight we take Sombra\'s cargo truck. The whole harbour will wake up.'], ['Dario Luna', 'Let it. I drive faster than gossip.']],
    dialogEnd: [['Carmen Reyes', 'His own truck, in my garage. Beautiful.']],
    objectives: [
      { type: 'goto', x: WAREHOUSE.x, y: WAREHOUSE.y, label: 'Infiltrate the Sombra Warehouse', radius: 65 },
      { type: 'deliver', x: GARAGE_HARBOR.x, y: GARAGE_HARBOR.y, label: 'Deliver the cargo truck to Harbor Chop & Repair', radius: 70, needCar: true, needType: 'truck' },
    ],
    onStart(state) {
      spawnMissionCar(state, 'truck', 2620, 2000, Math.PI, 'target-car');
      raiseWanted(state, 3, 'mission');
    },
  },
  {
    id: 'roadblock-run', title: 'Roadblock Run', payout: 2200, respect: 130,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'The police have your face on every wall. Get to the Flats safehouse. Lose them.'], ['Dario Luna', 'Four stars. My favourite constellation.']],
    dialogEnd: [['Carmen Reyes', 'Gone like sea mist. Rest now.']],
    objectives: [
      { type: 'escape', x: 360, y: 1400, label: 'Escape to the Flats Safehouse with the heat on', radius: 70, minWanted: 4 },
    ],
    onStart(state) { raiseWanted(state, 4, 'mission'); },
  },
  {
    id: 'neon-relay', title: 'Neon Relay', payout: 1900, respect: 120,
    start: MARKET, timeLimit: 150,
    dialogStart: [['Carmen Reyes', 'A neon dealer pays triple if his stock lands before the club opens. Clock is running, Dario.'], ['Dario Luna', 'Then I will not be stopping for red lights.']],
    dialogEnd: [['Carmen Reyes', 'Beat the doors opening. The club crowd owes us now.']],
    objectives: [
      { type: 'goto', x: 1520, y: 1400, label: 'Grab the neon stock at Mercado Central', radius: 55 },
      { type: 'deliver', x: MARINA.x, y: MARINA.y, label: 'Deliver to Marina Alta before the club opens', radius: 60, needCar: true },
    ],
  },
  {
    id: 'three-drops', title: 'Three Drops', payout: 2100, respect: 125,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'Sombra hid three cash drops around the city before we squeezed him. Collect them all, bring them home.'], ['Dario Luna', 'A treasure hunt. With better parking.']],
    dialogEnd: [['Carmen Reyes', 'Every last bill. His war chest is our seed money now.']],
    objectives: [
      { type: 'goto', x: LIGHTHOUSE.x, y: 320, label: 'Collect drop one at Faro Point', radius: 55 },
      { type: 'goto', x: 420, y: 1820, label: 'Collect drop two in the Flats', radius: 55 },
      { type: 'goto', x: DOCKS.x, y: DOCKS.y, label: 'Collect drop three at the Old Harbor docks', radius: 55 },
      { type: 'deliver', x: GARAGE_CENTRAL.x, y: GARAGE_CENTRAL.y, label: 'Bring the drops to Taller Luna Garage', radius: 60, needCar: true },
    ],
  },
  {
    id: 'witness-run', title: 'Witness Run', payout: 2300, respect: 135,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'A dock clerk saw everything at the warehouse. Get her to the Flats safehouse alive — Sombra is already hunting.'], ['Dario Luna', 'She rides with me. Nobody touches her.']],
    dialogEnd: [['Carmen Reyes', 'She will talk. Sombra just lost his last alibi.']],
    objectives: [
      { type: 'escort', x: 360, y: 1400, label: 'Escort the witness to the Flats Safehouse', radius: 65, needCar: true },
      { type: 'combat-clear', x: 360, y: 1400, label: 'Drive off the Sombra hit squad', radius: 95, thugs: 3 },
    ],
    onStart(state) {
      spawnChaser(state, 1900, 1000);
      spawnChaser(state, 1100, 1650);
    },
  },
  {
    id: 'convoy-takedown', title: 'Convoy Takedown', payout: 2600, respect: 150,
    start: MARKET,
    dialogStart: [['Carmen Reyes', 'Sombra runs one last armoured convoy car through Port Azul. Box it in, stop it, take what is inside.'], ['Dario Luna', 'One car. One me. Bad odds — for him.']],
    dialogEnd: [['Carmen Reyes', 'The convoy is ours. Only Faro Point is left.']],
    objectives: [
      { type: 'chase-target', x: WAREHOUSE.x, y: WAREHOUSE.y, label: 'Run down the Sombra convoy car', radius: 80 },
      { type: 'deliver', x: GARAGE_HARBOR.x, y: GARAGE_HARBOR.y, label: 'Bring the haul to Harbor Chop & Repair', radius: 65, needCar: true },
    ],
    onStart(state) { spawnMissionCar(state, 'muscle', 2300, 1100, 0, 'chase-target'); },
  },
  {
    id: 'faro-showdown', title: 'Faro Showdown', payout: 4000, respect: 220,
    start: MARKET,
    dialogStart: [['Victor Sombra', 'Faro Point, Luna. Bring your little empire. I will bring the tide.'], ['Dario Luna', 'This city is done paying you, Victor.']],
    dialogEnd: [['Carmen Reyes', 'Sombra is finished, Dario. Port Azul is ours — Port Royalty.']],
    objectives: [
      { type: 'combat-clear', x: 3150, y: 320, label: 'Face Sombra\'s crew at Faro Point', radius: 110, thugs: 5 },
      { type: 'chase-target', x: LIGHTHOUSE.x, y: LIGHTHOUSE.y, label: 'Run down Sombra\'s getaway car', radius: 80 },
    ],
    onStart(state) { spawnMissionCar(state, 'sports', 3050, 420, Math.PI, 'chase-target'); },
  },
];

const SIDE_MARKERS = [
  { kind: 'taxi', name: 'Taxi Fares', x: MARINA.x, y: MARINA.y, color: '#f4d35e' },
  { kind: 'courier', name: 'Courier Runs', x: 1520, y: 1400, color: '#81b29a' },
  { kind: 'race', name: 'Street Races', x: GARAGE_CENTRAL.x, y: GARAGE_CENTRAL.y, color: '#118ab2' },
  { kind: 'vigilante', name: 'Vigilante Hits', x: WAREHOUSE.x, y: WAREHOUSE.y, color: '#ee6c4d' },
];

// Hidden Sombra packages: twelve stashes hidden near landmarks. Walking or
// driving over one pays $150; finding all twelve pays a $1,000 bonus. They
// render as glowing teal crates in the world and as teal dots on the minimap
// (hud.js reads state.data.packages).
export const PACKAGE_SPOTS = [
  { x: 3300, y: 240 }, { x: 420, y: 380 }, { x: 2560, y: 860 }, { x: 940, y: 860 },
  { x: 2620, y: 1480 }, { x: 1460, y: 1340 }, { x: 360, y: 1460 }, { x: 1980, y: 380 },
  { x: 2500, y: 1880 }, { x: 700, y: 2060 }, { x: 3100, y: 1200 }, { x: 1200, y: 620 },
];
export const PACKAGE_PAY = 150;
export const PACKAGE_BONUS = 1000;

function ensureMissions(state) {
  if (!state.data.missionsInit) {
    state.data.missionsInit = true;
    if (state.data.storyIndex === undefined) state.data.storyIndex = 0;
    if (state.data.respect === undefined) state.data.respect = 0;
    state.data.mission = null;
    state.data.missionCars = [];
    state.data.dialogueQueue = [];
    state.data.dialogue = null;
    state.data.dialogueT = 0;
    state.data.objectiveText = '';
    state.data.missionMarker = null;
    state.data.sideCooldown = 0;
  }
  if (!state.data.missionCars) state.data.missionCars = [];
  if (!state.data.dialogueQueue) state.data.dialogueQueue = [];
  if (!state.data.packages) {
    state.data.packages = PACKAGE_SPOTS.map((s) => ({ x: s.x, y: s.y, taken: false }));
    state.data.packagesFound = 0;
  }
}

function updatePackages(state) {
  const pkgs = state.data.packages;
  if (!pkgs) return;
  const p = state.player;
  for (const pkg of pkgs) {
    if (pkg.taken) continue;
    const d = Math.hypot(p.x - pkg.x, p.y - pkg.y);
    if (d < 36) {
      pkg.taken = true;
      state.data.packagesFound += 1;
      state.money += PACKAGE_PAY;
      if (state.data.audioQueue) state.data.audioQueue.push('package');
      if (state.data.packagesFound >= pkgs.length) {
        state.money += PACKAGE_BONUS;
        say(state, [['Carmen Reyes', 'Every hidden package in Port Azul. That is the whole stash, Dario — plus a $' + PACKAGE_BONUS + ' bonus from me.']]);
      } else {
        say(state, [['Dario Luna', 'Hidden package ' + state.data.packagesFound + '/' + pkgs.length + '. +$' + PACKAGE_PAY + '.']]);
      }
      state.data.requestAutosave = true;
    }
  }
}

function say(state, lines) {
  for (const [speaker, text] of lines) state.data.dialogueQueue.push({ speaker, text });
}

function grantRespect(state, amount) {
  if (typeof state.data.addRespect === 'function') state.data.addRespect(amount);
  else state.data.respect = (state.data.respect || 0) + amount;
}

function spawnMissionCar(state, type, x, y, angle, role) {
  const car = makeCar(type, x, y, angle, state.rng);
  car.driver = 'mission';
  car.missionRole = role;
  if (role === 'target-car') {
    car.parked = true;
    state.vehicles.parked.push(car);
  }
  state.data.missionCars.push({ car, role, catchT: 0, arrived: false });
  return car;
}

function spawnChaser(state, x, y) {
  const car = makeCar('sedan', x, y, 0, state.rng);
  car.color = '#3d2b3d';
  car.driver = 'mission';
  car.missionRole = 'chaser';
  car.health = 90;
  state.data.missionCars.push({ car, role: 'chaser', catchT: 0, arrived: false });
  return car;
}

function spawnThugs(state, x, y, count, tag) {
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const ped = makePed(x + (state.rng() - 0.5) * 90, y + (state.rng() - 0.5) * 90, state.rng);
    ped.health = 45;
    ped.hostile = true;
    ped.missionTag = tag;
    ped.color = '#402a3a';
    state.peds.push(ped);
    spawned += 1;
  }
  return spawned;
}

export function startStoryMission(state, index) {
  ensureMissions(state);
  const def = STORY_MISSIONS[index];
  if (!def || state.data.mission) return false;
  state.data.mission = {
    kind: 'story',
    index,
    def,
    objIndex: 0,
    timer: def.timeLimit || 0,
    objTimer: 0,
    pointIndex: 0,
    thugsAlive: 0,
    tailState: { spottedT: 0, lostT: 0 },
    startedAt: state.time,
  };
  say(state, def.dialogStart);
  if (def.onStart) def.onStart(state);
  primeObjective(state);
  if (state.data.audioQueue) state.data.audioQueue.push('chime');
  return true;
}

function makeSideJob(state, kind) {
  const rng = state.rng;
  const roadA = state.city.randomRoadPoint(rng);
  const roadB = state.city.randomRoadPoint(rng);
  if (kind === 'taxi') {
    return {
      kind: 'side', sideKind: 'taxi', title: 'Taxi Fare', payout: 0, respect: 12,
      objectives: [
        { type: 'goto', x: roadA.x, y: roadA.y, label: 'Pick up the fare', radius: 55, needCar: true },
        { type: 'deliver', x: roadB.x, y: roadB.y, label: 'Drop the fare at the destination', radius: 55, needCar: true, fareDist: Math.hypot(roadB.x - roadA.x, roadB.y - roadA.y) },
      ],
    };
  }
  if (kind === 'courier') {
    return {
      kind: 'side', sideKind: 'courier', title: 'Courier Run', payout: 420, respect: 14,
      objectives: [
        { type: 'goto', x: 1520, y: 1400, label: 'Collect the parcel at Mercado Central', radius: 55 },
        { type: 'deliver', x: roadB.x, y: roadB.y, label: 'Deliver the parcel against the clock', radius: 55, needCar: true },
      ],
      timeLimit: 110,
    };
  }
  if (kind === 'race') {
    return {
      kind: 'side', sideKind: 'race', title: 'Street Race', payout: 650, respect: 18,
      objectives: [
        {
          type: 'race-checkpoints', label: 'Street race: clear the checkpoints', radius: 70, time: 80,
          points: [roadA, roadB, state.city.randomRoadPoint(rng), { x: GARAGE_CENTRAL.x, y: GARAGE_CENTRAL.y }],
        },
      ],
    };
  }
  return {
    kind: 'side', sideKind: 'vigilante', title: 'Vigilante Hit', payout: 800, respect: 20,
    objectives: [
      { type: 'combat-clear', x: roadA.x, y: roadA.y, label: 'Take down the Sombra crew', radius: 95, thugs: 3 },
    ],
  };
}

function startSideJob(state, kind) {
  ensureMissions(state);
  if (state.data.mission) return false;
  const def = makeSideJob(state, kind);
  state.data.mission = {
    kind: 'side', sideKind: kind, def, title: def.title,
    objIndex: 0, timer: def.timeLimit || 0, objTimer: 0, pointIndex: 0,
    thugsAlive: 0, tailState: { spottedT: 0, lostT: 0 }, startedAt: state.time,
  };
  say(state, [['Dispatch', def.title + ' accepted. The streets are watching, Dario.']]);
  primeObjective(state);
  if (state.data.audioQueue) state.data.audioQueue.push('chime');
  return true;
}

function primeObjective(state) {
  const m = state.data.mission;
  if (!m) return;
  const obj = m.def.objectives[m.objIndex];
  if (!obj) return;
  m.objTimer = obj.time || 0;
  m.pointIndex = 0;
  if (obj.type === 'combat-clear') {
    m.thugsAlive = spawnThugs(state, obj.x, obj.y, obj.thugs || 3, m.def.id || m.sideKind);
  }
  if (obj.type === 'escape' && obj.minWanted) {
    raiseWanted(state, Math.max(0, obj.minWanted - state.wanted), 'mission');
  }
}

function currentTarget(m) {
  const obj = m.def.objectives[m.objIndex];
  if (!obj) return null;
  if (obj.type === 'race-checkpoints') {
    const pt = obj.points[Math.min(m.pointIndex, obj.points.length - 1)];
    return { x: pt.x, y: pt.y, label: obj.label + ' (' + (m.pointIndex + 1) + '/' + obj.points.length + ')' };
  }
  if (obj.type === 'tail') {
    const van = (m && m._tailEntry) || null;
    if (van) return { x: van.car.x, y: van.car.y, label: obj.label };
  }
  if (obj.type === 'chase-target') {
    const entry = (m && m._chaseEntry) || null;
    if (entry) return { x: entry.car.x, y: entry.car.y, label: obj.label };
  }
  return { x: obj.x, y: obj.y, label: obj.label };
}

function failMission(state, reason) {
  const m = state.data.mission;
  if (!m) return;
  say(state, [['Carmen Reyes', reason || 'That job fell apart. Come back to me and we run it again.']]);
  cleanupMissionCars(state, true);
  state.data.mission = null;
  state.data.objectiveText = '';
  state.data.missionMarker = null;
  if (state.data.audioQueue) state.data.audioQueue.push('fail');
}

function completeMission(state) {
  const m = state.data.mission;
  if (!m) return;
  const def = m.def;
  let payout = def.payout || 0;
  if (m.sideKind === 'taxi') {
    const last = def.objectives[def.objectives.length - 1];
    payout = Math.round(180 + (last.fareDist || 600) * 0.22);
  }
  state.money += payout;
  grantRespect(state, def.respect || 0);
  const district = state.city.districtAt(state.player.x, state.player.y);
  if (state.data.districtStanding) {
    state.data.districtStanding[district.id] = (state.data.districtStanding[district.id] || 0) + 2;
  }
  if (m.kind === 'story') {
    say(state, def.dialogEnd || []);
    if (m.index === 3 && state.data.weapons) state.data.weapons.unlocked.smg = true;
    if (m.index === 6 && state.data.weapons) state.data.weapons.unlocked.shotgun = true;
    state.data.storyIndex = Math.max(state.data.storyIndex || 0, m.index + 1);
    if (m.index === 13) say(state, [['Dario Luna', 'Port Azul is free. Time to build something of my own.']]);
  } else {
    say(state, [['Dispatch', 'Job done. $' + payout + ' wired. More work whenever you want it.']]);
    state.data.sideCooldown = 4;
  }
  cleanupMissionCars(state, false);
  state.data.mission = null;
  state.data.objectiveText = '';
  state.data.missionMarker = null;
  state.data.requestAutosave = true;
  if (state.data.audioQueue) state.data.audioQueue.push('complete');
}

function cleanupMissionCars(state, failed) {
  for (const entry of state.data.missionCars) {
    if (entry.role === 'chaser' || entry.role === 'tail-van' || entry.role === 'chase-target') {
      entry.car.dead = true;
    }
  }
  state.data.missionCars = state.data.missionCars.filter((e) => !e.car.dead);
  void failed;
}

function advanceObjective(state) {
  const m = state.data.mission;
  if (!m) return;
  m.objIndex += 1;
  if (m.objIndex >= m.def.objectives.length) completeMission(state);
  else {
    primeObjective(state);
    if (state.data.audioQueue) state.data.audioQueue.push('pickup');
  }
}

function steerCar(state, car, tx, ty, dt, topSpeed) {
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.8));
  let throttle = dist > 30 ? 1 : 0;
  if (car.speed > topSpeed) throttle = -0.4;
  if (Math.abs(diff) > 2.3) throttle = -0.5;
  driveCar(car, dt, { throttle, steer, handbrake: false }, state.city);
  return dist;
}

function updateMissionCars(state, dt) {
  const m = state.data.mission;
  for (let i = state.data.missionCars.length - 1; i >= 0; i--) {
    const entry = state.data.missionCars[i];
    const car = entry.car;
    if (car.dead || car.health <= 0) {
      if (m && entry.role === 'chase-target') m._chaseCaught = true;
      state.data.missionCars.splice(i, 1);
      continue;
    }
    if (car.driver === 'player') {
      state.data.missionCars.splice(i, 1);
      continue;
    }
    if (entry.role === 'chaser' && m) {
      steerCar(state, car, state.player.x, state.player.y, dt, 350);
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d < 60) car.speed *= 0.9;
    } else if (entry.role === 'tail-van' && m) {
      if (!m._tailEntry) m._tailEntry = entry;
      const dest = m.def.objectives[m.objIndex];
      const d = steerCar(state, car, WAREHOUSE.x, WAREHOUSE.y, dt, 175);
      if (d < 55) entry.arrived = true;
      void dest;
    } else if (entry.role === 'chase-target' && m) {
      if (!m._chaseEntry) m._chaseEntry = entry;
      const away = Math.atan2(car.y - state.player.y, car.x - state.player.x);
      const road = state.city.nearestRoadPoint(car.x + Math.cos(away) * 300, car.y + Math.sin(away) * 300);
      steerCar(state, car, road.x, road.y, dt, 390);
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d < 78) {
        entry.catchT += dt;
        if (entry.catchT > 2.2) m._chaseCaught = true;
      } else entry.catchT = Math.max(0, entry.catchT - dt);
    }
  }
}

function objectiveMet(state, m, obj) {
  const p = state.player;
  const target = currentTarget(m);
  if (!target) return false;
  const dist = Math.hypot(p.x - target.x, p.y - target.y);
  switch (obj.type) {
    case 'goto':
      if (obj.needCar && p.mode !== 'car') { state.data.objectiveHint = 'You need a car for this.'; return false; }
      return dist < (obj.radius || 55);
    case 'deliver': {
      if (obj.needCar && p.mode !== 'car') { state.data.objectiveHint = 'Stay in the car to deliver.'; return false; }
      if (obj.needType && (!p.car || p.car.type !== obj.needType)) {
        state.data.objectiveHint = 'Wrong wheels — this job needs a ' + obj.needType + '.';
        return false;
      }
      return dist < (obj.radius || 55);
    }
    case 'escort':
      if (obj.needCar && p.mode !== 'car') { state.data.objectiveHint = 'Carmen rides with you — stay in the car.'; return false; }
      return dist < (obj.radius || 60);
    case 'escape':
      return dist < (obj.radius || 65);
    case 'race-checkpoints':
      return false; // handled with pointIndex in update
    case 'combat-clear':
      return m.thugsAlive <= 0;
    case 'tail': {
      const entry = m._tailEntry;
      return !!(entry && entry.arrived && dist < 320);
    }
    case 'chase-target':
      return !!m._chaseCaught;
    default:
      return dist < (obj.radius || 55);
  }
}

function updateTailRules(state, m, dt) {
  const entry = m._tailEntry;
  if (!entry) return;
  const d = Math.hypot(entry.car.x - state.player.x, entry.car.y - state.player.y);
  if (d < 68) {
    m.tailState.spottedT += dt;
    state.data.objectiveHint = 'Too close — the courier is getting suspicious!';
    if (m.tailState.spottedT > 2.4) failMission(state, 'Spotted. The courier burned the route and vanished.');
  } else if (d > 330) {
    m.tailState.lostT += dt;
    state.data.objectiveHint = 'You are losing the van — close the gap!';
    if (m.tailState.lostT > 8) failMission(state, 'The trail went cold. The van is gone.');
  } else {
    m.tailState.spottedT = Math.max(0, m.tailState.spottedT - dt);
    m.tailState.lostT = Math.max(0, m.tailState.lostT - dt * 0.5);
    state.data.objectiveHint = 'Stay in the band: close, but unseen.';
  }
}

function update(state, dt) {
  ensureMissions(state);
  state.data.startStoryMission = (i) => startStoryMission(state, i);
  state.data.startSideJob = (k) => startSideJob(state, k);
  state.data.sideCooldown = Math.max(0, (state.data.sideCooldown || 0) - dt);

  // Dialogue queue: one line at a time, a few seconds each.
  if (!state.data.dialogue && state.data.dialogueQueue.length) {
    state.data.dialogue = state.data.dialogueQueue.shift();
    state.data.dialogueT = 4.2;
  }
  if (state.data.dialogue) {
    state.data.dialogueT -= dt;
    if (state.data.dialogueT <= 0) state.data.dialogue = null;
  }

  updateMissionCars(state, dt);
  updatePackages(state);

  const p = state.player;
  const m = state.data.mission;

  if (!m) {
    // Offer the next story mission at Carmen's marker.
    const next = STORY_MISSIONS[state.data.storyIndex || 0];
    const dCarmen = Math.hypot(p.x - MARKET.x, p.y - MARKET.y);
    if (next && dCarmen < 80) {
      state.data.prompt = 'F — Start mission: "' + next.title + '"';
      state.data.promptTick = state.tick;
      if (state.input.wasPressed('KeyF')) startStoryMission(state, state.data.storyIndex || 0);
      return;
    }
    if (state.data.sideCooldown <= 0) {
      for (const marker of SIDE_MARKERS) {
        const d = Math.hypot(p.x - marker.x, p.y - marker.y);
        if (d < 80) {
          state.data.prompt = 'F — Side job: ' + marker.name;
          state.data.promptTick = state.tick;
          if (state.input.wasPressed('KeyF')) startSideJob(state, marker.kind);
          return;
        }
      }
    }
    state.data.missionMarker = next ? { x: MARKET.x, y: MARKET.y, label: next.title, kind: 'story' } : null;
    const pkgNote = state.data.packagesFound < state.data.packages.length
      ? ' · Hidden packages: ' + state.data.packagesFound + '/' + state.data.packages.length + ' (teal dots)'
      : ' · All hidden packages found';
    state.data.objectiveText = (next ? 'See Carmen Reyes at Portside Market' : 'Port Azul is yours. Side jobs still pay.') + pkgNote;
    return;
  }

  // Active mission bookkeeping.
  if (m.def.timeLimit) {
    m.timer -= dt;
    if (m.timer <= 0) { failMission(state, 'Out of time. The job pays nothing.'); return; }
  }
  const obj = m.def.objectives[m.objIndex];
  if (!obj) { completeMission(state); return; }
  state.data.objectiveHint = '';

  if (obj.type === 'race-checkpoints') {
    m.objTimer -= dt;
    if (m.objTimer <= 0) { failMission(state, 'The clock won this one. Run it again.'); return; }
    const target = currentTarget(m);
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    if (d < obj.radius) {
      m.pointIndex += 1;
      if (state.data.audioQueue) state.data.audioQueue.push('pickup');
      if (m.pointIndex >= obj.points.length) { advanceObjective(state); return; }
    }
  } else if (obj.type === 'combat-clear') {
    m.thugsAlive = state.peds.filter((ped) => ped.missionTag === (m.def.id || m.sideKind) && !ped.dead).length;
    if (objectiveMet(state, m, obj)) { advanceObjective(state); return; }
  } else if (obj.type === 'tail') {
    updateTailRules(state, m, dt);
    if (state.data.mission !== m) return; // failed inside the rules
    if (objectiveMet(state, m, obj)) { advanceObjective(state); return; }
  } else if (objectiveMet(state, m, obj)) {
    advanceObjective(state);
    return;
  }

  const target = currentTarget(m);
  if (target) {
    state.data.missionMarker = { x: target.x, y: target.y, label: m.def.title || m.title, kind: 'objective' };
    const dist = Math.round(Math.hypot(p.x - target.x, p.y - target.y));
    let text = target.label + ' — ' + dist + 'm';
    if (obj.type === 'race-checkpoints') text += ' · ' + Math.ceil(m.objTimer) + 's';
    if (m.def.timeLimit) text += ' · ' + Math.ceil(m.timer) + 's';
    if (state.data.objectiveHint) text += ' · ' + state.data.objectiveHint;
    state.data.objectiveText = text;
    state.data.missionTitle = m.def.title || m.title;
  }
}

function render(ctx, state, w, h) {
  const cam = state.camera;
  ctx.save();
  ctx.translate(w / 2 - cam.x, h / 2 - cam.y);

  // Mission cars the core renderer does not know about.
  for (const entry of state.data.missionCars || []) {
    if (!entry.car.dead && entry.car.driver !== 'player') drawCar(ctx, entry.car);
  }

  const marker = state.data.missionMarker;
  if (marker && state.mode === 'playing') {
    const pulse = 1 + Math.sin(state.time * 4) * 0.16;
    ctx.strokeStyle = 'rgba(255,209,102,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 30 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,209,102,0.16)';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 30 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // Beacon pillar so the target reads from streets away.
    const grad = ctx.createLinearGradient(marker.x, marker.y - 190, marker.x, marker.y);
    grad.addColorStop(0, 'rgba(255,209,102,0)');
    grad.addColorStop(1, 'rgba(255,209,102,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(marker.x - 5, marker.y - 190, 10, 190);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(marker.kind === 'story' ? '!' : '◆', marker.x, marker.y - 44);
  }

  // Hidden packages: glowing teal crates with a soft pulse.
  if (state.mode === 'playing') {
    for (const pkg of state.data.packages || []) {
      if (pkg.taken) continue;
      const pulse = 1 + Math.sin(state.time * 3.4 + pkg.x * 0.01) * 0.18;
      ctx.fillStyle = 'rgba(45,226,196,0.22)';
      ctx.beginPath();
      ctx.arc(pkg.x, pkg.y, 20 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2de2c4';
      ctx.fillRect(pkg.x - 8, pkg.y - 8, 16, 16);
      ctx.strokeStyle = '#0b3d36';
      ctx.lineWidth = 2;
      ctx.strokeRect(pkg.x - 8, pkg.y - 8, 16, 16);
      ctx.fillStyle = '#0b3d36';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', pkg.x, pkg.y + 4);
    }
  }

  // Side-job markers when free.
  if (!state.data.mission && state.mode === 'playing') {
    for (const sm of SIDE_MARKERS) {
      ctx.fillStyle = sm.color;
      ctx.beginPath();
      ctx.arc(sm.x, sm.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17323e';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', sm.x, sm.y + 4);
    }
    if ((state.data.storyIndex || 0) < STORY_MISSIONS.length) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(MARKET.x, MARKET.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17323e';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('C', MARKET.x, MARKET.y + 5);
    }
  }
  ctx.restore();
}

export const missionsSystem = { update, render };
export { SIDE_MARKERS };
