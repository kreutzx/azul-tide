# AZUL TIDE

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kreutzx/azul-tide/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kreutzx/azul-tide/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

AZUL TIDE is an original top-down 2D open-world crime game set in Port Azul, a sun-bleached coastal city where every district keeps its own grudges. You play Dario Luna, a small-time wheelman pulled into bigger work by fixer Carmen Reyes — the one person in the city who always knows which job pays and which job buries you. Standing across the table is Victor Sombra, a polished antagonist who treats Port Azul like a balance sheet and Dario like a rounding error. Work the streets, build your name, and find out whether the tide in Port Azul lifts you or pulls you under.

This project was built for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01).

## The City and the Story

Port Azul is split into 7 distinct districts, each with its own look, traffic density, and attitude toward you. District standing matters: run a neighbourhood ragged and it remembers; keep it sweet and doors open more easily. The main storyline runs through 10 story missions that carry Dario from errand-running for Carmen Reyes into a direct collision with Victor Sombra's operation, with respect ranks tracking how far your reputation has climbed along the way.

Between story beats, the city stays busy. Four repeatable side jobs — taxi fares, courier runs, street races, and vigilante work — keep cash flowing and give you reasons to learn every shortcut in town.

## Features

- **7 districts** forming one continuous open world, each with its own district standing that reacts to how you behave there
- **Living traffic and pedestrians** — cars flow through the streets, crowds scatter, and the city keeps moving whether you are on a mission or not
- **Stealable cars** — any vehicle you can reach is a vehicle you can take, and every ride handles as part of the chase
- **Police pursuits with escalation** — a wanted system that grows teeth as your stars climb: roadblocks appear at 3+ stars, and a helicopter joins the hunt at 4+ stars
- **Pursuit states** — chases move through PURSUIT, EVADING, and EVADED, so breaking line of sight is a real skill, not a cutscene
- **10 story missions** following Dario Luna, Carmen Reyes, and Victor Sombra, plus **4 repeatable side jobs**: taxi, courier, street races, and vigilante
- **Combat with a weapon wheel** — mouse-aimed shooting, reloading, and quick weapon selection mid-fight
- **Respect ranks and district standing** — a two-layer reputation system that tracks both your overall name and your standing block by block
- **Garage upgrades** — spend earnings on making your rides faster and tougher
- **Shops and buyable safehouse properties** — turn dirty money into a foothold in the city
- **3 synth radio stations** — switch stations while you drive and let Port Azul's synthetic airwaves score the getaway
- **3 save slots plus autosave**, so you can keep multiple runs going and never lose a good night's work
- **Full HUD with minimap** — wanted level, pursuit state, mission markers, and your position in the city at a glance

## Controls

- **WASD / Arrow keys** — move on foot, drive in a vehicle
- **E** — enter or exit a car
- **Shift** — sprint on foot, nitro in a car
- **Space** — handbrake
- **Mouse** — aim
- **Mouse click** — shoot
- **R** — reload
- **Q / Tab** — weapon wheel
- **M** — radio (cycle the 3 synth stations)
- **Esc** — pause
- **F5 / F9** — quick save / quick load

## How to Play Locally

You only need Node.js. From the repo root:

```bash
node serve.ts
```

That serves the `game/` folder locally. Then open your browser at:

```
http://localhost:8080
```

Pick a save slot (or let autosave carry you), take Carmen's first call, and Port Azul is yours to lose.

## How the Entry Is Packaged

The make.fun entry program packages the game into an output directory. From the repo root:

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Running `main.ts` with `MAKEFUN_OUTPUT_DIR` set writes the packaged entry to `/output`, including a `dossier.json` describing the submission.

## Join make.fun

New to make.fun? Join with referral code 24q484pk: https://make.fun/r/24q484pk

## License

MIT — see [LICENSE](LICENSE) for the full text.
