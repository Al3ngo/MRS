# Decisions

The brief says: "Where the brief leaves something open, choose the option closest to Golden Lap and
note the choice." This is that note, kept stage by stage, newest stage last. "Closest" is read as
closest in how the game plays (quick, simple, few screens), not as a copy of how it looks.

## Stage 1: project, offline app, saves

### The look

- **The game has its own visual identity; it does not copy Golden Lap's.** The brief asks to match
  that game's look as closely as possible. I have kept what the brief describes in general terms
  (flat, minimal, a muted palette, simple bold type, tidy management screens) and drawn everything
  else fresh, so the result is a game in the same genre rather than a re-skin of someone else's.
- **Direction: "true-black flat".** One black ground; a surface is raised by a step in lightness,
  never a border or shadow. Buttons and navigation are white or grey. **Hue is reserved for racing
  data**: your team, tyre compounds, flags, gains and losses. With a dozen team colours on a track
  map, that is what keeps the screens readable. True black also saves battery on OLED phones.
- **One accent hue, lime, until a career has a team.** From Stage 2 the accent can become the
  player's team colour inside a career.
- **Two typefaces.** Inter for text; Barlow Condensed for standalone figures (season years now; lap
  times, positions and money later). Both have true tabular numerals, checked by measurement, and a
  condensed figure face fits more timing columns across a phone.
- **A signature element: the 2010 to 2026 strip** on every save slot. One segment per season, filled
  as far as the career has run; taller segments are the seasons that open with a rules reset (2014,
  2017, 2022, 2026).
- **The mark** is an original top-down racing car, the same shape the race view will use.

### Layout

- **Designed for a phone held upright, and only that.** A tablet or desktop window shows the same
  column, centred. No separate wide layouts: the brief does not ask for them.
- **Every control is at least 44px tall; main actions are 48px** and sit low on the screen. The
  screen's main action is pinned to the bottom edge where a thumb rests.
- **One main (white) action per screen.** On the Careers screen it belongs to the career played
  last, so carrying on is always one tap.
- **Manifest locks the installed app to portrait** and names it "Racing Mgr" under the icon (the full
  name would be cut off on a home screen).

### Technology

- **TypeScript, Vite, Preact.** Preact is a few kilobytes and enough for the management screens. The
  race view (Stage 4) will draw on a plain Canvas; PixiJS is not needed for flat top-down shapes.
- **No backend, and no network use at all after the first visit.**
- **A hand-written service worker** (`pwa/service-worker.js`, about 120 lines) instead of a plugin.
  It stores every file at install and serves from that store. The usual plugin does the same job but
  brought a large tree of build-time packages with it, six of them carrying security advisories.
- **Fonts are stored in the project**, not loaded from a font service, so they work offline.

### Offline and updates

- **A new version never reloads the game under the player.** It downloads in the background and
  waits for "Update now", or for the app to be fully closed.
- **Relative addresses everywhere**, so the built game runs from any folder on any static host.
- **`noindex`**, so a hosted copy stays out of search engines. It is a personal project.

### Saves

- **Three slots, autosave only.** There is no Save button. The career is written after every session
  and race, and again whenever the app goes to the background (phones discard background apps
  without warning).
- **A career is plain JSON** and is stored exactly as a backup file would hold it.
- **Backup files are readable JSON with an integrity stamp** (CRC-32). A file that was edited by
  hand still loads, after a warning that it could not be verified: this is a single-player game,
  and editing your own save is your business.
- **A safety copy, not an undo.** Each slot quietly keeps the last sound save before the current
  one. It is only offered if the current save cannot be read. There is deliberately no "go back one
  save" button, so results stand.
- **Saves carry a version.** A save from an older version of the game is upgraded step by step when
  loaded, and the pre-upgrade copy is kept as the safety copy. A save from a newer version is shown
  but never opened or overwritten by accident.

### Stand-ins that later stages replace

- **The career screen is a test bench.** "Completing a session" only advances a counter. It exists
  so that slots, autosave, backups and offline play can be tried now.
- **Rounds per season is a provisional table** in `src/game/career.ts`. Stage 2 replaces it with the
  real calendar of each season, checked against the record.
- **The weekend is practice, qualifying, race, then management.** The brief's "brainstorm" list
  names the loop as practice, race, management; its race-weekend section also asks for knockout
  qualifying. I have read those together: qualifying stays, and the management phase follows the
  race. To be confirmed when the season loop is built (Stage 5).

## Stage 2: tracks, teams, drivers, regulation timeline

### Facts are generated, not typed

- **Every fact comes from an open, maintained database**, not from memory: calendars, circuits,
  entries, engines and drivers are generated by `scripts/generate-data.mjs` from
  [F1DB](https://github.com/f1db/f1db) (CC BY 4.0), release v2026.20.0. The generated files in
  `src/game/data/generated/` are never edited by hand.
- **"The real calendar" means the races actually held.** 2011 has no Bahrain, 2020 is the 17-race
  pandemic season, 2023 has no Imola. 2026 is taken as it stood after round 20 of 23: the Bahrain
  Grand Prix run at Sepang on 4 October and the Saudi Arabian race cancelled (checked against news
  reports as well as the database). Its last three rounds are as scheduled.
- **A "real driver" is one who started a Grand Prix between 2010 and 2026**: 86 of them. Test and
  practice-only drivers are left out.
- **Drivers arrive in their real debut year.** Three who debuted before 2010 but were not racing
  that year (Räikkönen, Grosjean, Karthikeyan) are free agents from the start.
- **A career begins with the grid of the first race of 2010.** After that the game goes its own
  way: who really drove where in later years is reference, not a script. Real-life accidents and
  retirements are not scripted either.
- **Teams keep one identity through every change of name** (Toro Rosso to AlphaTauri to RB to Racing
  Bulls is one team) and join and leave on the real dates.
- **Rebadged engines count as their maker's**: TAG Heuer is Renault, the Red Bull-badged units of
  2022 to 2025 are Honda.

### Circuits

- **33 of the 36 outlines are surveyed**: traced centre-lines from the open
  [f1-circuits](https://github.com/bacinger/f1-circuits) set (MIT). Every one measures within 0.6%
  of the official lap length.
- **Three are rough hand sketches: Valencia, Yeongam and Buddh.** No open outline for them could be
  reached from the build environment. They are marked as sketches in the data and on screen, and
  are the one known weak spot of this stage (ten races out of 352). *Stage 8: Buddh and Yeongam are
  now surveyed too, from OpenStreetMap; only Valencia is still a sketch (see Stage 8).*
- **Each circuit has one outline, its present-day layout.** Lap length and turn count are correct
  for every year, but the drawing does not change for the 2010 Bahrain endurance loop, the 2020
  Bahrain outer circuit, or the older Yas Marina, Albert Park and Marina Bay layouts.
- **Silverstone's start line is on the modern pit straight** for all years, including 2010.

### Rules

- **The points rules are tested against every real result**: all 352 races and every sprint from
  2010 to 2026 score exactly as they really did, including double points at the 2014 finale, the
  fastest-lap point of 2019 to 2024, and half points at Spa in 2021.
- **Budget cap figures are the brief's** (145, 140, then 135 from 2023, including 2026), not the
  real 2026 figure, which rose when the rules changed what it covers.
- **Power unit allowances are simplified** to engines and batteries per car per season.
- **Tyres keep their real names and colours per era**; from 2019 every race has Soft, Medium, Hard.
- **Major resets are 2014, 2017, 2022 and 2026**, as the brief says; 2011, 2019 and 2021 are minor.

### The game's own assessments (balance values, to be tuned)

- **Driver ratings are mine.** Each driver is rated at his peak on the brief's six attributes, with
  the ages between which he is at that peak; a shared curve works out any season from that. Speed
  fades first, craft lasts.
- **Team colours** recall the real cars but are chosen first to be told apart on a black screen:
  a test checks every pair of teams in every season.
- **Team money** is on the brief's scale (the 2021 cap is 145): the big four far ahead before the
  cap, the small teams short of it afterwards.
- **Real pace is kept as reference**: for each team and season, how far its best qualifying lap
  was from the fastest car, and how often it retired with a mechanical failure. Stage 3 uses the
  2010 figures to set the starting order.
- **Circuit character** (power, downforce, tyre wear, overtaking, safety car, rain, danger) is my
  assessment on simple scales.

### Stand-ins

- **The season almanac is a bench**, like the Stage 1 career screen: a way to check the data by
  eye. Its calendar, team and driver lists are the ones the game's own screens will reuse.

## Stage 3: the race simulation engine

### How a race is run

- **A race is a state stepped one second at a time.** Each car has a position in laps; each second
  it moves as far as its lap time allows, unless the car ahead on the road is in the way. The state
  is plain data, so a race can be saved mid-lap and carries on exactly as it would have, and **the
  same seed always gives the same race**. Both are tested.
- **Lap times are built from the real ones.** Every round carries the quickest real lap of its
  weekend (for a wet weekend or a round still to come, an estimate from other years at the same
  layout). A car's lap is that time plus what slows it: the car, the driver, fuel, tyre compound
  and wear, engine and energy mode, the wake of the car ahead, damage, a wet track. Simulated pole
  laps land within about half a percent of the real ones.
- **Overtaking is a contest, not a formula for position.** A car that catches another is held
  behind it and gets a chance to pass each lap that grows with its pace advantage and shrinks at
  circuits where passing is hard. DRS (2011 to 2025), battery deployment and racecraft tilt it.
  Cars on another lap are waved through; a car that has just made a mistake can be passed freely.
- **The pit wall plans by tyre life.** Before the start each team works out the quickest way to
  the flag (compounds and stops) and chooses among the plans close to the best, so strategies
  differ. In the race it reacts: rain, a cheap stop under the safety car, damage, tyres gone early.

### What each era does

- **2010:** Bridgestone tyres that last, one stop, no DRS, no energy recovery. Overtaking is rare.
- **2011 to 2013:** DRS, a KERS boost (three settings: bank it, use it as it comes, spend it) and
  Pirelli tyres that wear out: two or three stops and the most overtaking of any era.
- **2014 on:** hybrid power with four deployment modes (harvest, balanced, attack, overtake) drawn
  from one battery. Stops fall to one or two from 2017. The virtual safety car exists from 2015.
- **2026:** no DRS. The overtake mode gives its full boost only within a second of the car ahead,
  and the electrical side counts for half as much again.
- **Engine modes in every year:** save, standard, push. Push is quicker, burns more fuel and wears
  the engine about twice as fast; cars start with fuel for the distance and very little over, so
  pushing has to be paid back.

### Choices where the brief was open

- **Qualifying choice: how hard to push.** Three parts, the real number knocked out for the size
  of the grid, two runs each. The one decision per car is safe, normal or push: pushing finds a
  tenth and more than doubles the chance of a ruined lap. Quick to play, as in Golden Lap.
- **Setup is three dials** (wing, balance, suspension) with a hidden best position that depends on
  the circuit, the driver and the weekend. Practice runs bring feedback on each dial, sharper from
  a consistent driver. The result is worth up to one percent of lap time.
- **The player's cars do what they are told.** They make the stops in their plan and keep the modes
  they were given; the simulation does not make calls for them unless a car is handed over. The
  driver reports on the radio (tyres going, fuel short, wants intermediates) instead. A puncture
  brings a car in by itself.
- **The two-compound rule is the real one:** a dry race on one compound means disqualification.
  Using intermediates or wets lifts it.
- **Races end as the rules say:** at full distance, or at the end of the lap on which two hours
  are up. A stopped race is restarted behind the safety car, or abandoned with the reduced points
  of its year (tested against the real tables in Stage 2).
- **A safety car comes about as often as the circuit's character says**, whatever the era: the
  odds per incident adjust for how often the cars of the day break down.
- **Cars are as fragile as they really were.** Each team's reliability comes from its real share of
  mechanical retirements that season; the simulation reproduces those to within a few tenths of a
  car per race.
- **Every team has a weekend.** Rival teams find a better or worse setup each weekend, and each
  driver has a slightly better or worse day. Without this the fastest car won nearly every race.

### Left simple on purpose, or for a later stage

- **Speed is even around the lap.** The engine knows where a car is as a share of the lap. Slowing
  for corners is for the race view (Stage 4) to draw.
- **Under the safety car, lapped cars stay where they are** in the queue; there is no unlapping,
  and restarts are rolling in every year.
- **A red-flag result is taken from the order at the stop,** not the countback lap of the rulebook.
  Fresh tyres at a red flag are chosen for every car, the player's included.
- **No rule on which tyres the top ten start on,** and no choice of fuel load.
- **Sprint weekends:** the engine runs a sprint (its own distance and points, no stop required).
  Which sessions set which grid in which year is for the season loop (Stage 5).
- **Engine parts and grid penalties:** a race reports the wear each power unit picked up. Counting
  parts against the season's allowance is for Stages 5 and 6.
- **Fatal accidents are Stage 7.** Every crash already carries a severity, from the circuit's
  danger and the luck of the impact, for that stage to read.
- **Radio messages are codes here,** not sentences. Their wording belongs to the race view.

### Balance, as it stands

Measured over three runs of every round of eight seasons (2010, 2012, 2014, 2017, 2019, 2022, 2025,
2026), against the real record where the data has it:

- Stops per car in dry races: 1.1 in 2010, 2.6 in 2012, 2.1 in 2014, 1.4 in 2017, 1.5 in 2022.
- Overtakes fought for per dry race, after the first lap: 25 in 2010, 68 in 2012, 50 in 2014, 30 in
  2017, 40 in 2022.
- Mechanical retirements per race: 3.2 in 2010 (real 3.0), 1.0 in 2019 (real 1.0), 0.6 in 2025
  (real 0.6).
- A safety car in a little over 40% of races, which is what the circuits' characters add up to;
  rain in about 20%.
- **Known to be off:** pole wins close to 60% of races (the real figure is nearer 45%), and the
  fastest car of a season wins more often than it really did, most of all in 2010 and 2012. Stage 8
  is for this; a career also stops following the real pecking order as soon as cars are developed.

## Stage 4: the race view and its controls

### The screen

- **One screen that does not scroll.** From the top: lap and flag, the circuit from above, a
  two-line feed, the running order, the player's two cars, their controls, and the pit and speed
  buttons under the thumb. Only the running order scrolls.
- **The map is flat shapes:** the circuit as one thick line, each car a dot in its team's colour,
  the player's two larger, ringed in white and named. The line turns blue as the track gets wet and
  gains a yellow edge under a safety car. Cars in the pits run beside the track; the safety car is
  a yellow dot.
- **Cars slow for the corners.** The engine only knows how far round the lap a car is; the map
  works out how fast each part of a circuit can be taken from how sharply the real outline turns,
  so cars bunch into the slow corners and stretch out on the straights.
- **A circuit taller than it is wide is drawn on its side** when that lets it be drawn larger
  (Monaco, for one). North is no longer up there; the space on a phone matters more.
- **Hue stays with data**, as everywhere else: team colours, tyre colours, flags and warnings.
  Controls are white and grey.

### Time

- **1x is ten times real time.** A real race lasts an hour and a half; nobody wants that on a
  phone. At 1x a race takes about nine minutes, at 2x under five, at 4x a little over two. Golden
  Lap's races are of that order.
- **Skip runs the rest of the race at once**, after asking. The pit wall takes over the player's
  cars for it, so they still make their stops.
- **Opening a sheet stops the clock.** Nobody should lose places while choosing tyres.

### The pit wall

- **Two cars, one set of controls.** Tap a car's card to select it; the controls below act on it.
  Each card shows position, tyre and its life left, fuel in hand (laps more or fewer than the
  distance needs) and battery charge.
- **Engine: save, standard, push. Battery: the modes of the season** (none in 2010; bank, normal,
  boost with KERS; harvest, balanced, attack, overtake with a hybrid).
- **The plan is chosen before the start** from the quickest few the pit wall can find, each with
  its cost against the best. Planned stops are made without being called.
- **A stop can be called at any time**, for any tyre. A stop called ahead of the plan takes the
  place of the next one planned, so one early stop does not become two.
- **A car can be handed to the pit wall and taken back**, from the same sheet.
- **The feed follows the player's cars closely** (every pass, stop and radio message) and the rest
  of the field only for what changes the race: flags, rain, retirements, the lead, fastest laps.

### Left simple, or for later

- **A race is not kept if the app is closed.** A race in progress is plain data and could be saved;
  it will be, as part of a career, in Stage 5. For now leaving a race gives it up.
- **Qualifying is run for you** before the grid is shown. Its own screen, and practice, belong to
  the weekend in Stage 5.
- **Choosing a team here is for one race.** In a career the team is chosen once and kept.
- **The figure-of-eight at Suzuka** draws its pit lane on the side that is "inside" for most of the
  lap. Circuit drawings get their polish in Stage 8, with the three sketched ones.
- **No sound yet.** The brief did not ask for any at the time; its version of 14 November adds sound
  effects to the polish stage (Stage 8), with a weather forecast for the coming laps.

### Stand-ins

- **Racing a round from the almanac** is how a race is reached until there is a season to play. It
  is close to the quick-race mode the brief lists as an extra, and will become it.

## Part A: driver push levels and stress

Built from the description given in chat; the brief now has the same item under "Hybrid power
units" (version of 14 November).

### What it does

- **Four push levels for every driver: conserve, normal, push, all-out.** Each higher level is
  quicker, wears the tyres faster and builds stress. Per lap, against normal: conserve is about
  three tenths slower, wears tyres 18% less and sheds 22 points of stress; push is about a quarter
  of a second quicker, wears them 18% more and adds 4 stress; all-out is about seven tenths
  quicker, wears them 40% more and adds 32. Normal sheds 10 a lap.
- **Stress also builds holding off a car right behind** (within 0.8 seconds), even at normal, and
  more at the higher levels. Behind the safety car it drains quickly.
- **Stress does no harm below 25.** Above that, mistakes grow likelier (up to six times at the top
  of the gauge), a mistake is likelier to end in the barriers, and contact with another car is
  likelier. Above 70 the driver is ragged and loses pace as well.
- **A consistent driver builds stress more slowly.**
- **The radio says when a driver is on the limit.**

### All-out is a burst

Tuned with two labs (`npm run lab:push`, `npm run lab:push-solo`). With no traffic, from lap 10
of a 66-lap race:

| laps all-out | time gained | cars that do not finish (normal: 5%) |
|---|---|---|
| 1 | 0.1 s | 5% |
| 2 | 0.8 s | 5% |
| 3 | 0.2 s | 7% |
| 6 | -0.3 s | 10% |
| 20 | -0.7 s | 15% |

Over whole seasons (2019 Ferrari and 2014 Williams, every round three times), all-out held for
the race is the worst policy by far: 3 to 5 places lost on average, and 4 to 10 times the
crashes. Push held for the race is nearly as bad, because any level that builds stress fills the
gauge in the end. Short bursts came out about a third of a place better than staying at normal
for Ferrari and about two thirds of a place worse for Williams: within the noise of 63 races, so
the clean measure is the one with no traffic, above. A test keeps that shape.

### Choices where the description was open

- **Push levels apply in every season**, not only the hybrid years: they are the driver's, not the
  engine's.
- **The pit wall uses them sparingly for the cars it runs**: push only after being stuck behind a
  car for a while, all-out only for a pass in the last two laps, conserve to shed stress or stretch
  worn tyres. When rival cars pushed whenever they were close, overtakes rose by a fifth; as it
  is, Stage 3's balance figures are about where they were (overtakes a few percent up).
- **The controls**: a push row of four 48px buttons directly above the engine and battery rows,
  with a stress gauge beside it (grey while harmless, white as it rises, amber at the limit), and a
  thin stress bar along the foot of each car card so both drivers can be watched at once.
- **Short phones** (under 740px tall) get a smaller map, a one-line feed and a one-line car card
  (tyre life and fuel together), so the running order keeps four rows.

## Stage 5: the season loop, calendar and standings

### The loop

- **Choose a team, keep it.** A new career opens on the 2010 grid; the team is confirmed once and
  cannot be changed, as in Golden Lap.
- **Each round is practice, qualifying, race, then the management phase**, as the brainstorm
  decisions say. The management phase is the career's home screen between races: the last result,
  the championships and the next round. It has nothing to manage until Stage 6.
- **Sprint weekends follow their year's real format**: 2021 and 2022 qualifying sets the sprint
  grid and the sprint result sets the Grand Prix grid; 2023 adds a separate sprint shootout for the
  sprint grid; from 2024 the sprint sessions come first (sprint qualifying, sprint, then
  qualifying and the race).
- **After the last round** the season is reviewed (champions, the team's place, its drivers'
  places) and filed in the career's history, and the next season begins. **After 2026** the career
  is complete: a summary of titles, wins, podiums and every season, and the slot can be started
  again.

### The sessions

- **Practice**: three dials (wing, balance, suspension) on each car, starting from the engineers'
  baseline, and four runs a car. After a run the driver says, for each dial, higher, lower or
  right, and how far; a consistent driver is more exact. The setup found counts in qualifying and
  the race. Skipping practice keeps the baseline.
- **Qualifying**: knockout, run a part at a time, choosing safe, normal or push for each car
  before each part.
- **The race and the sprint**: the grid with the plan for each car, then either the live race view
  or "Simulate" to have the result at once. A race under way is saved every other lap, on a pause,
  when a sheet opens and when the app goes to the background; leaving it keeps it, and it carries
  on later from where it was, paused.

### Points and the championships

- **Points are the real system of each year**, as tested against every real race in Stage 2:
  25-18-15 from 2010, double points at the 2014 finale, the fastest-lap point from 2019 to 2024,
  sprint points (3-2-1 in 2021, 8 to 1 from 2022), and reduced points for short races.
- **Ties are split by the countback**: most wins, then most second places, and so on, counting
  Grands Prix only. I believe sprint results do not count in the real countback, but have not
  confirmed it; it would only matter on exactly equal points.
- **Constructors' points are both cars' points.**

### Stand-ins and choices where the brief was open

- **Every team runs the drivers and car it really had that round**, the player's included, until
  contracts and development (Stage 6) and the driver lifecycle (Stage 7) exist. So a career's
  pecking order follows the real one for now.
- **The player's team stays in the sport after its real exit.** HRT (to 2012), Caterham (to 2014)
  and Manor (to 2016) left the real grid; a player who picked one keeps racing with its last car
  and its last drivers where they are free, with the best free drivers filling any seat a driver
  has left. Picking a team and keeping it (the brainstorm decision) wins over its real exit date.
  The grid then has one more team than it really had.
- **Saves from Stages 1 to 4** (stand-in careers with no team) are upgraded: they keep their
  identity and season, start that season from round 1, and ask for a team when opened.
- **The race view's "Leave" keeps a career race** to carry on later; leaving a single race from the
  almanac still gives it up.
- **No grid penalties yet**: power-unit wear is reported by each race, but counting parts against
  the season's allowance is for Stage 6.
- **The design checker warns of empty space on a desktop-sized window** on short screens (one card
  above the pinned action). The game is laid out for a phone held upright, where it passes.

## Readability pass (before Stage 6)

Asked for in chat, and now part of the brief's polish stage (version of 14 November): bars instead
of percentages, explained setup options, a hint of which way to move each setup slider, and plain
English throughout. Done ahead of Stage 8 at the player's request. The brief's other new polish
item, a one-time tutorial, is left for Stage 8. Nothing in the race engine or the balance changed: the code changes in the game
logic are wording, one export, and a record of the setup each practice run was made with.

### Bars

- **Tyres, fuel, battery, track wetness and driver stress are bars**, wherever they appear: the car
  cards, the timing tower (each car's tyre life beside its tyre colour), the race header (track
  wetness), the pit-stop sheet (tyres now) and the session screens (track wetness, inline).
- **One colour scale for all of them: green is fine, amber is worth watching, red needs action.**
  The colour is a single flat colour picked from the scale, not a gradient. The bar's length
  carries the same news, for anyone who does not tell red from green.
- **What each bar measures**: tyre life left (full when new); fuel left, with the colour saying
  whether it reaches the flag (green with half a lap or more to spare, red if it falls short);
  battery charge; track wetness (empty when dry, full and red when flooded); stress (empty and green
  when calm, red on the limit). Stress was not on the list, but it is the same kind of reading, so
  it uses the same bar.
- **No reading is shown as a percentage any more** (tyres were "59% left", the battery a figure).
  Chances of rain and of a safety car on the circuit sheet stay as percentages: they are odds, not
  readings.

### Setup

- **Under each end of each setting, one plain line on what it does in the race**: low drag is
  faster on the straights with less grip in the corners, downforce the opposite; a stable rear is
  steady and kind to the tyres but slow to turn in, a sharp front turns in quickly but the rear can
  slide; soft suspension rides bumps and kerbs but leans in fast corners, stiff is sharp in fast
  corners but jumpy over bumps. These describe the real cars. In the game the best setting depends
  on the circuit (more wing where corners matter more), the driver and the weekend, and the
  driver's feedback finds it.
- **The driver's feedback is an arrow on the slider.** A small mark shows the setting he drove;
  the arrow starts there and points the way to move, short for a little and long for a lot, with a
  green ring for "spot on". The words ("Driver: raise it a lot") sit beside the setting's name. The
  arrow stays where he drove when the dial is moved, so it is clear how far the setting has come
  since.
- **The slider fills in grey**, not the team colour: a red slider (Ferrari's) read like the red end
  of the bars.

### Plain English

- **The race screen**: a "?" in the top bar opens a guide to every term on it (the timing tower's
  columns, the bars, tyre colours, the two-tyre rule, DRS, the safety car and the virtual one, red
  and chequered flags), listing only what that season has. A line under the controls says what the
  setting just chosen does ("Harvest: slower, but charges the battery"). On short phones that line
  gives way to the running order.
- **Words changed**: "Box" is now "Stop at the end of this lap"; "pit wall" is "the team"; "Pole"
  is "Started first"; "P4" is "4th"; "Q1" is "part 1 (Q1)" with the knockout explained;
  "constructors" is "teams" (with the official name given once); "podium" is "top-three finish";
  "compound" is "tyre type"; "downforce matters" is "cornering grip matters"; gaps carry an "s"
  for seconds. Failure causes read as phrases ("retires with a KERS boost failure", not "retires:
  kers"). Each season's rule changes are rewritten so that terms like power unit, MGU-H, active
  aero and ground effect are said in plain words. Driver ratings each carry a line on what they
  mean.
- **Kept as they are**: the tyre names (Soft, Supersoft, Intermediate), DRS, KERS and the safety
  car are the words the sport uses, and each is explained where it appears. Three-letter driver
  codes stay in the timing tower, where full names do not fit, and the guide explains them; the
  feed and the results use surnames.
- **A name fix found on the way**: Pedro de la Rosa and Lucas di Grassi showed as "Rosa" and
  "Grassi" in team lists; surnames now come from the record.

## Before Stage 6: team styles, the tyre and fuel graph, the weather forecast

Asked for in chat (15 November), with the brief re-read first (version of 14 November, whose
polish stage already lists the forecast and the bars). The rule for this round: extend the race
simulation, do not rewrite it, and do not change its results or its balance.

### The engine is untouched, and a test proves it

- **The same engine runs every car.** Since Stage 3 the simulation's cars have been driven by the
  same code the player uses: the same push levels, engine and battery modes and pit calls, with
  the same stress, tyre wear, fuel and weather. What is new is that each team now makes those
  calls in its own style.
- **Balanced is the old team exactly.** With every team set to balanced, 72 qualifying sessions
  and races across all eras come out identical to a recording made before any of this work, to
  the last decimal (`tests/engine-fingerprints.test.ts`; any change to a result fails it).
- **Reading the race never changes it.** A test reads every readout on every car every second of
  a race and checks that the race ends byte-for-byte as it does unread.

### Every team has a race style

- **Three styles: aggressive, balanced, cautious.** Each is a set of thresholds the team uses for
  its calls (`src/game/sim/styles.ts`):

  | | Aggressive | Balanced | Cautious |
  |---|---|---|---|
  | All-out bursts | up to 4 laps, when within 0.9 s | up to 2 laps, within 0.6 s | never |
  | Push level | sooner, and kept with more stress | as before | later, and dropped sooner |
  | Saves the driver at stress | 65 | 55 | 45 |
  | Engine on Push | more often, with less fuel spare | as before | rarely, with plenty spare |
  | Battery | spent more freely | as before | kept in reserve |
  | Rain | gambles on changing early (first onto intermediates, first back on dry tyres) | as before | waits until the change clearly pays |
  | Pit stops | runs worn tyres longer; dives in behind a safety car more readily | as before | changes worn tyres sooner; stops behind a safety car only when it clearly pays |
  | Qualifying | normal, push, push | normal throughout | safe, normal, normal |

- **Who has which style** is an editorial call, like the driver ratings, and can change over a
  team's life: Red Bull, Toro Rosso and Haas (from 2016) aggressive; McLaren aggressive in
  2010-14 and from 2023, balanced between; Ferrari and Mercedes balanced; Renault balanced, then
  cautious in 2012-15; Williams, Force India, Sauber, the 2010 newcomers and Cadillac cautious;
  Haas balanced from 2024. Teams not listed are balanced.
- **Where it shows**: on each team in the almanac and on the career team choice, with one line on
  what the styles mean.
- **The player's own team** follows its style only for a car the player hands over to the team
  ("Let the team make this car's calls"). In qualifying the player's cars go at normal unless told
  otherwise.
- **No style simply wins.** One team, both cars, 84 races of 2019 under each style: cautious
  scored 26.9 points a race, balanced 26.3, aggressive 25.8. Aggressive cars gain places and crash
  more (0.077 crashes per car per race, against 0.030 balanced and 0.018 cautious). Run it with
  `npm run lab:styles -- 2019 ferrari 3`.
- **What it does to the eras** (eight runs of every round, styles against all-balanced): dry-race
  overtakes in 2010 24.0 → 25.8, in 2011-13 63.2 → 62.0, in 2017-18 31.3 → 32.6; stops per car
  0.97 → 0.96, 2.36 → 2.39, 1.14 → 1.21. All inside the Stage 3 bands. One test compared 2011-13
  against 2010 measured from a single run of 2010's 19 races, which swings by several passes
  either way; it now measures 2010 over three runs, with the band itself unchanged.

### Left open: the push level and mistakes

The brief says the push level trades pace against tyre wear, mistakes and stress. Since Part A,
mistakes rise with stress, which pushing builds, rather than with the push level directly. Making
the push level add mistakes of its own would change results and balance, which this round rules
out. It is noted for the balancing in Stage 8.

### The tyre and fuel graph

- **On each car's card, two slim strips: Tyres and Fuel, one bar per lap from now to the flag.**
  A bar's height is what will be left at the end of that lap; its colour is green, amber or red
  (fine, watch it, act). A white line marks each stop the car is set to make, after which the
  tyres are new. The tyre colour dot moved from the card's head to the Tyres label.
- **A red line under the card when something will not last**: "Tyres gone 3 laps early" (worn out
  before the stop, or the flag with no stop to come), "Fuel 2 laps short".
- **How it is worked out**: the engine's own tyre wear and fuel burn, at the modes the car is in
  now, in clear air, with its plan's stops, and with the track as the forecast sees it (wet-weather
  tyres wear fast once a track dries). It is an estimate, and a good one: in clear air it is
  within 0.06 of the real tyre bar six laps on, and in a drying race at Spa it saw intermediates
  finished by lap 18 where they really went at 16 or 17. Traffic and the safety car are not
  foreseen.
- **Tyre bars now empty where the engine starts to risk a puncture** (1.3 times a tyre's nominal
  life), everywhere a tyre bar appears. Teams plan to run a little past nominal life: the median
  stint ends at 1.11, nine in ten under 1.29. On the old scale nearly every normal stint ended
  "worn out", and the graph warned on plans that were fine. This only changes the bars, not the
  engine. With it, ordinary plans warn rarely (1.9% of last stints, nearly all "1 lap early") and
  honestly: about 4% of finishers do end past that point.
- **Fuel's colour says whether it reaches the flag** (green with half a lap or more to spare),
  as the fuel bar already did.

### The weather forecast

- **Over the map: how wet the track is now (bar and word), then the next five laps**, each with an
  icon (sun, cloud, light rain, heavy rain) and the chance of rain. On the grid, the same for the
  first laps, in its own card. The header no longer carries a separate wetness bar.
- **It is drawn from the rain the race will really have, and is less sure further ahead.** A lap
  with rain due shows 95% for the next lap, 7 points less for each lap further out, never under
  60%. Rain due just either side of a lap shows 40% and a cloud. Otherwise the chance is the
  circuit's usual odds, no more than 25%, with a sun. Rain icons need 50% or more (heavy when the
  rain due is hard), a cloud 30-49%. So a shower is never shown as certain far ahead, and never
  arrives without at least a cloud the lap before.
- **On small phones the forecast moves down the map's sides.** There the map is wide and short,
  and a strip along the top shrank the circuit to almost nothing. When the circuit draws bigger
  with the track on the left and the laps down the right, that is the layout used; on a 375 by
  667 screen the circuit now draws about twice as large.

### Game logic apart from the screens

- **What the screens show is worked out in the game layer and handed over as plain data**:
  `src/game/sim/readouts.ts` (the graph, the forecast, pit advice, race plans to choose from,
  which battery modes are open, a finished race's numbers) and `careerTotals` in
  `src/game/career.ts`. The screens only draw. A redesign of any screen needs no change below
  `src/ui`.
- **A test keeps it that way** (`tests/architecture.test.ts`): nothing in `src/game` may import a
  screen, the app, the browser layer or Preact, touch browser objects, read the clock or use
  unseeded randomness.

### Bars, setup and plain English

- Bars for tyres, wetness, battery and fuel, and the setup lines and feedback arrows, were done in
  the readability pass; this round rechecks them at phone size. The new graph uses the same
  colours. A browser test checks the car cards carry no percentages.
- New terms are explained where they appear: "Tyre and fuel graph" and "Weather" in the race
  guide, race styles on the team lists.

## Stage 6: team management, finances, development, contracts

The brief's Stage 6, with its brainstorm decisions: Golden Lap-style staff with traits plus the
modern roles; a split power unit with its own upgrades plus chassis work; this year's car against
next year's before the big rule changes; sponsors copied from Golden Lap; prize money; the budget
cap from 2021 with penalties; small abstract money; and contracts for drivers and staff. Golden
Lap's own rules were checked against its official guide, player guides and reviews (the guides
themselves could not be opened from this session; their content was read through search).

### What Golden Lap does, and what this game takes from it

- **Sponsors** (copied, as the brief asks): one title sponsor a season, chosen from three offers.
  Each pays a fixed sum after every Grand Prix and a bonus when a car finishes at or above its
  target place. A steady deal pays more for turning up, a bold one more for results. Better
  standing (last season's place) brings richer offers. Before each race the sponsor offers
  challenges: extra money for one particular result; take on one, or none.
- **Car parts**: an upgrade is cheap (a little pace, mostly reliability); building a new version
  gains much more but is fragile at first, and each new version of a part that season costs more
  than the last (Golden Lap adds 1 each time; here 2, on bigger budgets).
- **Staff**: hired with stats and traits; Golden Lap's engineer has one stat for how much new parts
  gain and one for how reliable they are, and its crew chief one for stop speed and one for
  sureness. Here each person has one skill and up to two traits, and the technical director and
  pit crew chief cover those two jobs. Someone kept into a new season keeps the salary they had, as
  in Golden Lap.
- **The rhythm**: between seasons, sign people and a sponsor; between races, develop the car and
  take on a challenge; staff and drivers change only between seasons. Golden Lap has no contract
  negotiation (players asked for it on its forums); the brief does, so it is added (below).

### Money

- **The scale**: the brief's. Budgets run from about 40 a season (HRT) to 240 (the big four before
  the cap); the best driver asks low to mid twenties a season (never more than 28); a new aero part
  costs 8 and up; one decimal place at most. Never millions.
- **Where it comes from**: the team's backers at the start of each season; prize money for last
  season's place in the teams' championship (40 for the champions down to 2), also at the start;
  the sponsor and its challenges after each Grand Prix; and the backers some drivers bring.
- **Realistic gaps, kept by construction**: the backers' share is set so that a team finishing
  where the real team finished, with the sponsor its standing earns, has the real team's spending
  power. Do better than history and there is more; worse, less. From 2021 a team's income is its
  spending power, up to the cap plus 45 (room for the salaries the cap leaves out), so the rich
  teams sit at the cap and Williams-sized teams cannot reach it, as the brief says.
- **What it goes on**: drivers' and staff salaries (paid race by race), car parts, next year's car,
  and a customer team's engine lease. Money carries over between seasons. In debt, nothing can be
  bought until it is paid off; salaries are still paid.
- **Pay drivers**: drivers who really brought backers' money bring it here (Maldonado's PDVSA
  money the most, 15 a season). The amounts are the game's estimates; the real deals were never
  published in full.

### The budget cap (from 2021)

- 145 in 2021, 140 in 2022, 135 from 2023, as the brief sets it. It counts car development, next
  year's car, the engine lease and staff salaries, except the three best-paid staff and the
  drivers, who sit outside it as in the real rules.
- **Overspend is allowed, and punished at the season's end**: up to 5% over, a fine of twice the
  overspend and development a tenth slower next season; more than 5%, three times the overspend
  and a quarter slower. Modelled on the real "minor" and "material" breaches; the real penalties
  (Red Bull's 2021 fine and wind-tunnel cut) were of this kind.

### Development

- **The parts**: aero and chassis, and the power unit as three (the brainstorm's split): engine,
  battery and energy recovery. 2010 has no energy recovery; 2011 to 2013 have KERS (battery and
  recovery); hybrids from 2014. The V8 engines were frozen by the rules until the end of 2013, so
  the engine can only be upgraded then. Only a works team rebuilds its power unit; a customer gets
  its maker's progress. From 2026 the power unit is about half electric, and the parts weigh that
  way.
- **The player's car is the real car plus the team's own work.** Each part's performance is
  counted against the real car of that team and season. A team starts each season behind its real
  car by half a season's typical development and, by spending what the real team spent, ends it
  ahead by as much: on average it races at its real pace. The yardstick is worked out from the
  team's real money, its real drivers' salaries, and the staff its money buys.
- **Proof it holds**: whole careers, 2010 to 2026, played with the team spending as the real one
  did (`npm run lab:economy`), for every starting team. Average place against where the real car
  ranked: Ferrari +0.06, Red Bull −0.06, Mercedes +0.13, Lotus 0.00, Virgin −0.13, HRT −0.06,
  Force India +0.13, Sauber +0.50, Renault +0.63, Williams +0.81, Toro Rosso +0.88, McLaren −0.69
  (negative is better). Across all twelve, 0.2 of a place behind history: no lean worth the name,
  and each a single career with race luck in it. Money left at a season's end ran from −5 to 170;
  the high end is a rich team under the cap with money it is not allowed to spend.
- **Across seasons**: half of this season's gains beyond the usual carry into next year's car in a
  quiet year, a third after a minor rules change, a tenth across a major reset (2014, 2017, 2022,
  2026). Money put into next year's car counts against what the real team usually put in; in the
  year before a major reset it counts more than twice as much (the brief's "teams that prepared
  early benefit"). A typical team puts a tenth of its development money into next year's car, and
  three tenths before a reset.
- **Reliability**: each new version lowers its part's reliability; upgrades bring it back. The
  car's reliability is the real car's plus the parts' average.
- **What a step is worth** is shown in seconds a lap ("about 0.05 s a lap quicker"), on an ordinary
  90-second lap.

### Engines

- **Works teams** (Ferrari, Mercedes, Renault, McLaren with Honda in 2015 to 2017, Red Bull with
  Honda from 2019 and with Ford in 2026, Audi in 2026) build and develop their own power units.
- **Customer teams** choose a supplier each winter from the makers that really sold engines that
  year, at a lease that is dearer for a better engine. How strong each maker's engine was, season
  by season, is the game's reading of the record (Mercedes ahead from 2014, Honda's hard 2015 to
  2017, Ferrari's 2020 dip); it only matters when a customer changes supplier.

### Power units

- **The allowance per car per season** is the real one, as set in Stage 2 (eight engines to 2013,
  then the hybrid limits, plus batteries from 2014). Every weekend wears the fitted units:
  practice and qualifying a fixed amount, the race as hard as it was driven (engine modes, laps).
  A worn-out unit is replaced before the next weekend; the team can fit one early.
- **Penalties**: 10 grid places for each extra engine to 2013; from 2014, 10 for the first extra
  of each kind in a season and 5 for each one after (the rule since 2015), applied to the Grand
  Prix grid. Units last so that a season at the standard engine mode, sprints included, just fits
  the allowance; pushing hard does not. Worn units break down more often.

### Staff

- **Five roles**: technical director (gain and reliability of new parts), aerodynamicist (extra
  gain on aero parts and on next year's car), race engineer (a closer baseline setup and clearer
  feedback in practice), strategist (how far ahead the forecast can be trusted, and better calls
  when the team runs a car), pit crew chief (stop speed and sureness).
- **Traits**: innovator, meticulous, thrifty, rising star, veteran, demanding, rain reader, calm,
  each with one plain line on what it does. Each comes up for about one person in six; more than
  half have none.
- **Staff are invented people** with invented names, as in Golden Lap; so are the sponsors. The
  brief asks for real teams and drivers; putting real engineers or brands to work in a game was not
  asked for.

### Contracts and the market

- **Contracts run one to three seasons.** The asking salary follows the driver's overall rating.
  Young drivers ask more for long deals (they want to stay free to move up); older ones take less
  for security. Staff ask by skill.
- **Negotiation, by clear rules**: offer the asking salary and he signs; offer 85% of it and he may
  take it (more readily from a top-four team), but turns it down for good that winter if not. The
  best drivers only talk to teams that can win (a driver rated 92 or more to a top-five team, and so
  on).
- **The market opens between seasons**: the player's drivers whose contracts ended, every driver
  whose real career moved him that winter, the coming season's rookies, and drivers between drives
  who raced in one of the two seasons before. A driver who really stayed with his team is under
  contract and not for sale. Drivers who retired in reality are gone (the driver lifecycle comes in
  Stage 7).
- **The other teams keep the real record**: they race the drivers who really raced for them, except
  that a driver the player has signed races for the player, and his real team puts the best free
  driver in his seat. The other teams' finances and development are not simulated: their cars stay
  the real ones.

### When the game makes the choices

"Skip ahead" (and the tests) settle the team's business the way the real team did where it can:
the drivers who really drove for it that season, otherwise its own drivers renewed, otherwise the
best it can afford; staff renewed unless the market has clearly better; the same engine; the
balanced sponsor; between races, this round's share of the real team's development money on the
cheapest new parts, upgrades for fragile parts, and its share of next year's car.

### Saves

Save version 3. A career from Stage 5 takes over its team's business when loaded: the team's real
drivers and the staff its money buys, with the season's backers' and prize money, and it signs a
sponsor before its next session.

## The briefing before the race (after Stage 6)

Asked for in chat (15 November), from a Golden Lap screenshot: a screen after qualifying that shows
the track and the forecast. Built in this game's own look, not a copy of Golden Lap's art.

- **When**: before every career race and sprint, after the qualifying (or sprint) that set its
  grid; "To the grid" goes on to the grid and the plan. A race carried on after closing the app goes
  straight back to it.
- **What**: the season and the race, the circuit and its country, the round; the circuit drawn
  large; the sponsor challenge taken on (or that none was) and the title sponsor's bonus target;
  what stands out about the circuit in a few plain words ("Hard on tyres", "Hard to overtake",
  "Safety cars likely", "Walls close by: mistakes cost dear"); the laps; how wet the track is now;
  the tyres on offer, wet ones included; and the weather for the start, middle and end of the race.
- **The forecast in thirds** is drawn from the race's real rain, like the lap-by-lap one, and is
  less sure the further off a part is.
- **The strategist now reaches every forecast**: the briefing, the grid and the race. A better
  strategist stays surer further ahead (Stage 6 promised this; the race screens were still using an
  average strategist).
- **No flags**: Golden Lap shows the country's flag. Flags here would mean drawing one for every
  country on the calendar (emoji flags are not used in this design), so the country is named
  instead. It can be added in the polish stage.

## Stage 7: the driver lifecycle

The brief's Stage 7 (ageing, retirement, fatalities, fictional generation), with the Drivers
section's junior academy, and from its suggested extras the memorial for drivers lost and the
setting to switch fatal accidents off. Golden Lap's own handling was checked first: after a fatal
crash it shows one dialogue, "A tragedy", with no other choice, then asks for a replacement before
the next event; its drivers move through career stages to a final year and retire after it; its
hiring pool is topped up with young drivers with room to grow.

### Ageing

- **Ratings follow age**, as they have since Stage 2: still learning before a driver's prime, at
  their best through it, fading after (speed first, craft last). Made-up drivers age the same way.
- **Career stages on screen**: still improving, at their best, past their best, final season.

### Retirement

- **Real drivers retire when they really did**, so the other teams' line-ups stay the real ones.
  The exception: a driver under contract to the player sees the contract out before retiring.
- **Made-up drivers retire at their own age**, between 33 and 38.
- **Retired drivers leave the market and the pool of free drivers.**

### Fatal accidents

- **Rare, as the brief asks.** Rolled after each race and sprint for every car that crashed out
  (an accident or a collision), never during it, and with the career's own luck: race results never
  change because of it.
- **What makes one likelier**: the era (two and a half times as likely before the halo arrived in
  2018), the circuit (walls close by: Monaco, Baku, Jeddah, Spa), and the driver's aggression.
- **How often**: tuned so a whole career expects about one, most likely before the halo, as the
  real sport saw one (Jules Bianchi, 2014) in these seasons. Measured with
  `npm run lab:lifecycle`: 1.01 expected over 2010 to 2026, between 6 and 11% a season before the
  halo and 3 to 5% after.
- **Afterwards**: a sheet titled "A tragedy" after the race, with one choice (Continue), as in
  Golden Lap. The driver is remembered (a "Remembered" card in the standings and in the career
  summary). A seat of the player's must be filled before the next race, from drivers without a
  seat; after a sprint, the team runs one car in that weekend's Grand Prix. Another team puts the
  best free driver in the seat.
- **Off by choice**: when starting a career, fatal accidents can be switched off for the whole
  career (the brief's suggested sandbox setting). On by default.
- **Respectfully worded**: plain words, no detail beyond the lap and the race.

### Made-up drivers

- **When real drivers run out**: whenever the pool of free drivers good enough for a seat runs
  thin (after losses, retirements, or drivers the player has taken), race-ready made-up drivers
  join, aged 21 to 26 and near their best. Each season also brings three young prospects, 15 to 17.
- **Rebuilt from their id**: a made-up driver's name, nationality, birthday, potential, ratings
  and retiring age all come from their id, so a career saves only the ids. Different careers get
  different drivers. Names come from the nationalities that produce racing drivers; anyone can
  race, so the screens now say "the driver" where they said "he".
- **Potential**: most turn out decent; a few are exceptional.

### The other teams

- **They keep the real line-ups**, except that a seat whose driver is lost, retired early, or held
  by the player (under contract or in the academy) goes to the best free driver, real or made up.

### The junior academy

- **Up to three young drivers, 15 to 19**: made-up prospects, or real drivers before their real
  debut (Verstappen in 2013, Piastri in 2019). A fee each season, more for more potential (1 to
  3.5), outside the budget cap.
- **They grow up as their age says**, and each full season in the academy adds a point to every
  rating once they race for the team (three at most).
- **Promotion**: old enough to race (17, and 18 from 2016, the rule brought in after Verstappen's
  debut), a junior appears in the winter market as "From your academy". Holding a real junior keeps
  him from his real team, which runs someone else when his debut year comes.

### Saves

Save version 4. A Stage 6 career gains its drivers' world when loaded: nobody lost, this season's
prospects, fatal accidents on, an empty academy.

## Stage 8: polish, balancing, the tutorial and sound

### Balancing the races

Before this stage, 3 runs of every round of seven seasons showed the best car winning too often:
Red Bull took 82% of the 2010 races (really 47%), McLaren 68% of 2012's (really 35%), Mercedes
80% of 2017's (really 60%). The car on pole won 42% to 76% of the time, against about half in the
real seasons. The cause was that a team's car was equally quick at every round, all season.
Three changes, all small:

- **A team's weekend form.** Each team's car is a little better or worse than its season average
  each weekend: a spread of 3 points on aero, chassis and power, the same for qualifying and the
  race. Real teams had circuits that suited them and upgrades that did not work; this stands in
  for both. It applies to every team, the player's included, and depends only on the career, the
  round and the team, so a weekend replays the same.
- **Race pace against one-lap pace.** Each car also runs a little quicker or slower on Sunday than
  it qualified: a spread of 0.2% of a lap (about two tenths). Some cars are kinder to their tyres
  over a stint, some are quick over one lap only.
- **The push level adds mistakes of its own.** Left open before Stage 6 for this stage: the brief
  says the push level trades pace against tyre wear, mistakes and stress. Mistakes now rise
  straight away with the push level (conserve 0.85 times as likely, push 1.15, all-out 1.4), as
  well as with the stress that pushing builds.

After (3 runs of every round; the real share in brackets):

| Season | Pole wins | Leading team's wins |
|---|---|---|
| 2010 | 44% | Red Bull 68% (47%) |
| 2012 | 42% | McLaren 53% (35%) |
| 2014 | 53% | Mercedes 81% (84%) |
| 2017 | 50% | Mercedes 65% (60%) |
| 2019 | 56% | Mercedes 63% (71%) |
| 2022 | 56% | Red Bull 74% (77%) |
| 2025 | 53% | McLaren 50% (58%) |

Overtakes, stops, safety cars, breakdowns and finishes stay inside the Stage 3 bands
(`tests/sim-seasons.test.ts`). The engine fingerprints were recorded again for the new results
(`tests/engine-fingerprints.test.ts`); the test still proves that reading a race never changes it.
The team business stays neutral: run by the game's own choices, Ferrari finishes on average where
the real Ferrari did (+0.00 places), Williams 0.63 places lower, HRT 0.06 places higher
(`npm run lab:economy`).

### The tutorial

- **Golden Lap's way: short pop-ups through the first race weekend.** Twenty-one tips, a sentence
  or two each, each pointing at the part of the screen it explains: the team's home (and the
  sponsor to sign first), practice and the driver's arrows, qualifying, the briefing, the race plan,
  the race screen (the race is held while a tip is up), the result, and the first management phase
  (the challenge, the Car tab). Each tip shows once per career; which have been read is kept in the
  save, so a reload carries on where it was.
- **Skip or replay.** Every tip has "Skip the tutorial". The settings list each career with a
  "Replay tutorial" button; the tips then show again, each the next time its screen comes up.
- **Careers from before Stage 8** (save version 4) count the tutorial as done, since the player has
  already learned the game by playing it; it can be replayed. Save version 5.

### Sound

- **Made in code, fully offline.** Every sound is synthesised with the Web Audio API at the moment
  it plays; nothing is downloaded, so there are no sound files and nothing to license.
- **Engines by era**, after the real ones:
  - 2010-13: the V8 at 18,000 rpm, a high, hard scream (its firing note about 1,200 Hz).
  - 2014-25: the turbo V6 hybrid at about 11,000 rpm, an octave lower, muffled, with the turbo's
    whistle.
  - 2026: the same engine duller, under the whine of the bigger electric motor.

  The settings have a button for each, to hear the difference.
- **What plays in a race**: each car passing the pit wall on the start-and-finish straight (rising
  then falling as it goes by, across the speakers; spray in the wet); the rest of the field in the
  distance, quieter behind a safety car; rain, as hard as it is raining; the wheel guns at the
  player's pit stops; crashes and collisions; the field's roar at lights out. At 4x only the
  player's own cars are heard going past. A paused race is silent.
- **Button clicks** everywhere: a short, soft tick.
- **Settings**: on or off, and a volume, kept on the device (not in a career). A sound button on
  the race screen turns it off and on. On iPhone the game plays as "ambient" audio: it mixes with
  the player's music and stays quiet when the phone is on silent.

### Settings

- The System screen is now **Settings**: sound and the tutorial first, then offline play, the home
  screen and the saves. A gear on the team's home screen opens it.

### Polish

- **The race starts when Start is pressed.** Before, a race in a career opened paused: the screen
  took the race it had just saved for one being carried on. A race carried on still opens paused.
- **Buddh and Yeongam are drawn from OpenStreetMap** (© OpenStreetMap contributors, ODbL 1.0)
  instead of hand sketches: both centre-lines measure within 0.3% of the official lap. Yeongam's
  start line is set on the straight before Turn 1. The lines are kept in
  `scripts/data/osm-outlines.json`, where the data generator reads them. No open outline of the
  Valencia street circuit could be found from the build environment, so it is still a sketch,
  marked as one in the almanac (three races, 2010-12).

### After Stage 8: money in sight on the Car tab (v0.8.1)

Asked for in chat: the money to spend was only on the Team tab, so buying parts meant switching
tabs to see what was left. The Car tab now opens with the money to spend (and, from 2021, the room
left under the budget cap), pinned under the top bar while the parts are scrolled through; after a
purchase it shows what it cost for a moment ("−3").
