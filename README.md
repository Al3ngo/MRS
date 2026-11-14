# Modern Racing Manager

A single-player motorsport team management game for the phone, covering the 2010 to 2026 seasons.
It installs to the home screen and plays with no network at all. A personal project.

**Status: Stage 4 of 8 is built.** The app installs, runs offline and keeps three save slots
(Stage 1); it carries the real data of all 17 seasons (Stage 2); it has its race engine (Stage 3);
and a race can now be watched and run from the pit wall (Stage 4): the circuit from above, the
running order, engine and battery modes, pit stops, the driver on the radio, and 1x, 2x, 4x or
skip. To race, open the season almanac, pick a round, then **Race this round** and choose a team.
There is no season yet: each race stands alone, and the career screen is still a test bench. The
build plan is in the brief; choices made along the way are in [DECISIONS.md](DECISIONS.md).

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

`npm run build` writes the whole game to `dist/`: 15 files, about 535 kB. Upload that folder to any
static web host that serves **https** (GitHub Pages, Cloudflare Pages, Netlify, your own server). It
works from the root of a site or from any sub-folder, with no configuration.

Then, on the phone:

- **iPhone or iPad:** open the address in Safari, tap Share, then Add to Home Screen.
- **Android:** open it in Chrome and choose Install app (the System screen in the game also offers
  an Install button).

Open the installed app once while still online, and check that **System > Offline play** says
*Stored*. From then on it needs no connection.

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
era. That last part takes most of a minute.

`npm run e2e` builds the game twice and drives it in a real browser at phone size: first visit,
offline reloads, a cold start with the server gone, backup and restore, an update arriving, hosting
from a sub-folder, the almanac, and a race from the grid to its result. It needs Playwright with Chromium to be
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

shows how many stops the pit wall plans in each season on a dry day. The balance values are the
constants at the top of `src/game/sim/model.ts`, `race.ts` and `tyres.ts`.

## The data

The facts of the 2010 to 2026 seasons are generated from two open sources and checked in under
`src/game/data/generated/`. To regenerate them (after a new race, say), clone both sources somewhere
outside this project and run:

```bash
npm run data -- --f1db <path to f1db> --circuits <path to f1-circuits>
```

- [F1DB](https://github.com/f1db/f1db), CC BY 4.0: calendars, entries, drivers, results.
- [f1-circuits](https://github.com/bacinger/f1-circuits) by Tomislav Bacinger, MIT: circuit outlines.

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
src/platform/           the browser: save store, backup files, service worker, storage
src/app/                app state, screen addresses, the actions screens call
src/ui/                 screens and components
src/ui/race/            the race view: circuit map, drawing, race clock, wording
src/styles/             design tokens and styles
src/dev/                staged save states for screenshots (left out of normal builds)
scripts/                data generator, icon maker, the balance lab
tests/                  unit tests
e2e/                    the end-to-end check
```

Rules the code keeps to:

- `src/game` never touches the DOM, storage or the clock. That keeps the simulation testable and,
  later, runnable thousands of times for balancing.
- A career is plain JSON. What is in memory, what is in storage and what is in a backup file are the
  same thing.
- Any change to the shape of a career bumps `SCHEMA_VERSION` in `src/game/save-schema.ts` and adds a
  migration, so existing saves keep loading.

## Releasing a new version

Build and upload `dist/` again. A phone that has the game installed downloads the new version in the
background the next time it is opened online, and offers **Update now** on the Careers and System
screens. It never reloads on its own, so a session in progress is not interrupted; if the offer is
ignored, the new version takes over the next time the app is fully closed and reopened.

## Credits

Typefaces: Inter and Barlow Condensed, both under the SIL Open Font License (licences in
`src/assets/fonts/`). Season data from F1DB (CC BY 4.0); circuit outlines from f1-circuits (MIT).
The icon and all artwork are drawn for this project.

This is a fan-made, personal-use project. It is not affiliated with any racing series, team, driver
or other game.
