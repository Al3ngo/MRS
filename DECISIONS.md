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
  are the one known weak spot of this stage (ten races out of 352).
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
- **No sound.** The brief does not ask for any.

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
