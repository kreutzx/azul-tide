// AZUL TIDE — shots-stage.js
// Deterministic scene staging for the four judge screenshots. When the game
// is opened with ?shot=<name>, this system rearranges the world on its first
// update tick: it teleports Dario, sets cash / respect / wanted, places cars
// and starts the right mission, so each screenshot shows a real, readable
// slice of the game (cover street life, a four-star chase with roadblock and
// helicopter, Carmen's first mission, and the late-game empire state).
// With no ?shot parameter it does nothing at all.

import { makeCar } from './vehicles.js';

let staged = false;

function placePlayer(state, x, y, angle) {
  const p = state.player;
  p.x = x;
  p.y = y;
  p.angle = angle;
  p.mode = 'foot';
  p.car = null;
  state.camera.x = x;
  state.camera.y = y;
}

function putPlayerInCar(state, car) {
  const p = state.player;
  car.driver = 'player';
  car.parked = false;
  p.mode = 'car';
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  state.vehicles.playerCar = car;
  state.camera.x = car.x;
  state.camera.y = car.y;
}

function stageCover(state) {
  // Marina Alta, on the coast avenue at midday: Dario on foot, traffic and
  // pedestrians around, HUD fully visible, the sea a street away.
  placePlayer(state, 2470, 830, -0.5);
  state.money = 1250;
  if (state.data.addRespect) state.data.respect = 140;
  else state.data.respect = 140;
  const taxi = makeCar('taxi', 2540, 900, Math.PI / 2, state.rng);
  taxi.driver = 'traffic';
  taxi.axis = 'v';
  taxi.dir = 1;
  taxi.lane = taxi.x;
  state.vehicles.traffic.push(taxi);
  const sedan = makeCar('sedan', 2430, 760, -Math.PI / 2, state.rng);
  sedan.parked = true;
  state.vehicles.parked.push(sedan);
}

function stageChase(state) {
  // Eastbound on Avenida Palmas at full heat: sports car, wanted 4, police
  // behind, a roadblock ahead, helicopter spotlight overhead.
  const car = makeCar('sports', 1460, 1370, 0, state.rng);
  car.color = '#ee6c4d';
  car.speed = 215;
  putPlayerInCar(state, car);
  state.money = 3420;
  state.data.respect = 320;
  state.wanted = 4;
  state.data.pursuit = 'PURSUIT';
  const pd = state.data.police;
  if (pd && state.data.spawnRoadblock) {
    state.data.spawnRoadblock();
  }
  if (pd) {
    // A helicopter is forced by the four-star update; pin its spotlight in.
    pd.state = 'PURSUIT';
  }
}

function stageMission(state) {
  // Portside Market, face to face with Carmen Reyes: mission one is active,
  // its banner and opening dialogue on screen, the beacon on the minimap.
  placePlayer(state, 1415, 1310, 0.6);
  state.money = 300;
  state.data.respect = 20;
  if (state.data.startStoryMission) state.data.startStoryMission(0);
  // Re-show the first dialogue line so the box is up for the shot.
  if (state.data.dialogueQueue) {
    state.data.dialogue = { speaker: 'Carmen Reyes', text: 'Dario. One package, no questions. Marina Alta, fast and clean.' };
    state.data.dialogueT = 30;
  }
}

function stageEmpire(state) {
  // Late game at Taller Luna Garage: Port Royalty money and respect, every
  // weapon unlocked, the weapon wheel open, properties owned (green on the
  // minimap), garage prompt on screen.
  placePlayer(state, 940, 845, -Math.PI / 2);
  state.money = 58250;
  state.data.respect = 1620;
  state.data.ownedProperties = ['safehouse-flats', 'apt-market', 'villa-marina'];
  if (state.data.garageTiers) state.data.garageTiers = { engine: 3, armor: 2, nitro: 3 };
  if (state.data.weapons) {
    state.data.weapons.unlocked = { fists: true, pistol: true, smg: true, shotgun: true };
    state.data.weapons.current = 'smg';
  }
  state.data.wheelHold = true;
  state.data.wheelOpen = true;
  const car = makeCar('sports', 985, 880, Math.PI / 4, state.rng);
  car.parked = true;
  state.vehicles.parked.push(car);
}

function stageNeon(state) {
  // The new "Neon Relay" timed delivery (story mission 10): Dario in a
  // muscle car with the stock aboard, the clock on the HUD objective line,
  // a hidden package glowing on the corner ahead.
  const car = makeCar('muscle', 1750, 1420, 0.35, state.rng);
  car.color = '#9d0208';
  car.speed = 160;
  putPlayerInCar(state, car);
  state.money = 4950;
  state.data.respect = 760;
  state.data.storyIndex = 9;
  if (state.data.startStoryMission) state.data.startStoryMission(9);
  if (state.data.dialogueQueue) {
    state.data.dialogue = { speaker: 'Carmen Reyes', text: 'A neon dealer pays triple if his stock lands before the club opens. Clock is running, Dario.' };
    state.data.dialogueT = 30;
  }
}

function update(state) {
  if (staged || !state.shot) return;
  staged = true;
  try {
    if (state.shot === 'cover') stageCover(state);
    else if (state.shot === 'chase') stageChase(state);
    else if (state.shot === 'mission') stageMission(state);
    else if (state.shot === 'empire') stageEmpire(state);
    else if (state.shot === 'neon') stageNeon(state);
  } catch (err) {
    // Staging must never break boot; the plain scene still renders.
    void err;
  }
}

export const stagingSystem = { update };
