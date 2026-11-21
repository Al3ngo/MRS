# Modern Racing Manager

A single-player motorsport team management game for the phone, covering the 2010 to 2026 seasons.
It installs to the home screen and plays with no network at all. A personal project.

**Status: all 8 stages are built.** The app installs, runs offline and keeps three save slots; it
carries the real data of all 17 seasons; its race engine runs every car from a pit wall, with push
levels, driver stress, team race styles, tyres, fuel, batteries and weather. A career is the real
season loop (practice, qualifying, sprints, the race, both championships by each year's rules) with
the team to run between races: money, sponsors and their challenges, staff, contracts and the
driver market, car development, engines, power units and the budget cap. Drivers age, improve,
retire and, rarely, are lost; made-up drivers and a junior academy keep the grid full to 2026. A
one-time tutorial walks through the first weekend, and the races have sound made in code (engines
that sound as each era did). A single race can still be run from the season almanac. The game
plays in landscape, like a console game. The build plan is in the brief; choices made along the
way are in [DECISIONS.md](DECISIONS.md).

## Run it

Needs Node 22.12 or newer.

```bash
npm install
```

```bash
npm run dev
```

The dev server is for working on the game. It does not install a service worker, so offline play is
only real in a build:

```bash
npm run build
```

```bash
npm run preview
```

## Put it on a phone

`npm run build` writes the whole game to `dist/`: 15 files, about 570 kB. Upload that folder to any
static web host that serves **https** (GitHub Pages, Cloudflare Pages, Netlify, your own server). It
works from the root of a site or from any sub-folder, with no configuration.

Then, on the phone:

- **iPhone or iPad:** open the address in Safari, tap Share, then Add to Home Screen.
- **Android:** open it in Chrome and choose Install app (the Settings screen in the game also offers
  an Install button).

Open the installed app once while still online, and check that **Settings > Offline play** says
*Stored*. From then on it needs no connection.

The game plays sideways. An installed app on Android locks itself to landscape. iPhones and iPads
do not let a web app turn the screen, so held upright (with the rotation lock on, say) the game
turns itself a quarter: hold the phone sideways, either way round, and play. It follows the
phone's motion sensor to match the way it is held (the iPhone asks once). Settings > Phone held
upright fixes a side instead, or asks for the phone to be turned.

Two things worth knowing about saves:

- They live in the browser's storage on that one device. A backup file (the menu on a career's slot)
  is the only copy that survives a lost or reset phone.
- On iPhone and iPad a home-screen app keeps its own storage, separate from Safari's. Start careers
  in the installed app, or move one across with a backup file.

## Check it

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run e2e
```

`npm test` runs the unit tests: career logic, save versions, backup files, the save store against a
simulated IndexedDB, the season data (including the points rules against every real result), and
the race engine. The engine's tests cover its rules (the same seed gives the same race, a race
saved half way carries on unchanged, each era's tyres and aids, the two-compound rule, safety
cars, red flags) and then run all 352 real rounds once to check that the races look like their
era. That last part takes most of a minute. Further tests pin the engine's results exactly, check
the team race styles, the tyre and fuel graph and the forecast, and keep the game logic apart from
the screens.

The career tests play a whole career, every session of 2010 to 2026, and check it stays sound
at every step and that the points add up; that one takes about a minute on its own.

`npm run e2e` builds the game twice and drives it in a real browser at phone size: first visit,
offline reloads, a cold start with the server gone, backup and restore, an update arriving, hosting
from a sub-folder, the almanac, a race from the grid to its result, and a career weekend from
practice to the standings (with a race left and carried on after a reload, and a 2023 sprint
weekend). It needs Playwright with Chromium to be
available to Node; it is deliberately not a dependency of the project.

## The balance lab

Two scripts run the engine in bulk and print what came out. They are for tuning, not part of the
game.

```bash
npm run lab -- --runs 3 2010 2012 2019
```

runs every round of those seasons three times and prints, per season: overtakes, stops per car,
retirements by cause (beside the real figure), safety cars, wet races, how often pole wins.

```bash
npm run lab -- --race 2012 8 7
```

prints one race in full: season, round, seed.

```bash
npm run lab:tyres
```

shows how many stops the pit wall plans in each season on a dry day.

```bash
npm run lab:push -- 2019 ferrari 3
```

runs one team's cars through a season under different push-level policies (always normal, always
all-out, short bursts and so on).

```bash
npm run lab:push-solo -- 2019 5 250
```

measures the bare trade of all-out with no traffic: time gained and cars lost for bursts of 1 to 20
laps.

```bash
npm run lab:styles -- 2019 ferrari 3
```

```bash
npm run lab:economy -- ferrari williams hrt
```

```bash
npm run lab:lifecycle -- 2 --career
```

simulates every round of every season (twice here) and prints the crashes out and expected fatal
accidents per season and over a whole career; with `--career`, also plays a whole career and lists
who was lost and how many made-up drivers joined.

plays whole careers with the team's business run the way the real team ran it, and prints each
season's place against the real team's, the money left, how far each part is ahead of or behind
the real car, the engines used against the allowance and the budget cap.

runs one team's cars through a season under each race style (cautious, balanced, aggressive) and
prints grid and finishing places, points, crashes, stops, laps on all-out and stress.

The balance values are the constants at the top of `src/game/sim/model.ts`, `race.ts` and
`tyres.ts`; the team styles are in `src/game/sim/styles.ts`.

## The data

The facts of the 2010 to 2026 seasons are generated from two open sources and checked in under
`src/game/data/generated/`. To regenerate them (after a new race, say), clone both sources somewhere
outside this project and run:

```bash
npm run data -- --f1db <path to f1db> --circuits <path to f1-circuits>
```

- [F1DB](https://github.com/f1db/f1db), CC BY 4.0: calendars, entries, drivers, results.
- [f1-circuits](https://github.com/bacinger/f1-circuits) by Tomislav Bacinger, MIT: circuit outlines.
- [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, ODbL 1.0:
  the outlines of Buddh and Yeongam, kept in `scripts/data/osm-outlines.json`.

Ratings, team colours, money and circuit character are the game's own and live beside them in
`src/game/data/`.

## Where things are

```
index.html              the one page
pwa/service-worker.js   stores every file for offline play; the build fills in the file list
public/                 web manifest and icons (icons are generated: npm run icons)
build/                  the small build step that writes dist/sw.js
src/game/               the game itself: plain data and pure functions, no browser APIs
src/game/data/          the seasons: generated facts, and the game's own ratings and rules
src/game/sim/           the race engine: practice, qualifying, the race, the pit wall
src/game/season/        the season: weekend formats, the grid of a round, sessions, championships
src/game/team/          the team off the track: money, sponsors, staff, contracts, engines,
                        development, power units, the budget cap, the junior academy
src/game/world/         the drivers' world: retirements, fatal accidents, made-up drivers
src/platform/           the browser: save store, backup files, service worker, storage, sound
src/app/                app state, screen addresses, the actions screens call
src/ui/                 screens and components
src/ui/race/            the race view: circuit map, drawing, race clock, wording
src/ui/career/          pieces of the career screens: the team, the car, the winter, standings
src/ui/tutorial/        the one-time tutorial: its tips and the pop-up that shows them
src/ui/stage.ts         the stage the game is drawn in, turned when the phone is upright
src/styles/             design tokens and styles
src/dev/                staged save states for screenshots (left out of normal builds)
scripts/                data generator, icon maker, the balance lab
tests/                  unit tests
e2e/                    the end-to-end check
```

Rules the code keeps to:

- `src/game` never touches the DOM, storage or the clock, and never imports a screen. That keeps
  the simulation testable, runnable thousands of times for balancing, and lets any screen be
  redesigned without touching it. What a screen shows (the tyre and fuel graph, the forecast, pit
  advice) is worked out in `src/game/sim/readouts.ts` and handed over as plain data.
  `tests/architecture.test.ts` checks all of this.
- The race engine's results are pinned: `tests/engine-fingerprints.test.ts` replays 72 sessions
  and fails on any change to a result. After a deliberate change to the engine, record the new
  results with `npx vitest run tests/engine-fingerprints.test.ts -u`.
- A career is plain JSON. What is in memory, what is in storage and what is in a backup file are the
  same thing.
- Any change to the shape of a career bumps `SCHEMA_VERSION` in `src/game/save-schema.ts` and adds a
  migration, so existing saves keep loading.

## Releasing a new version

Build and upload `dist/` again. A phone that has the game installed downloads the new version in the
background the next time it is opened online, and offers **Update now** on the Careers and Settings
screens. It never reloads on its own, so a session in progress is not interrupted; if the offer is
ignored, the new version takes over the next time the app is fully closed and reopened.

## Credits

Typefaces: Inter and Barlow Condensed, both under the SIL Open Font License (licences in
`src/assets/fonts/`). Season data from F1DB (CC BY 4.0); circuit outlines from f1-circuits (MIT) and, for Buddh and
Yeongam, OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0). Every sound is made in code.
The icon and all artwork are drawn for this project.

This is a fan-made, personal-use project. It is not affiliated with any racing series, team, driver
or other game.
