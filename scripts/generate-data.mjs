#!/usr/bin/env node
/**
 * Builds the game's factual data (src/game/data/generated/) from these open sources:
 *
 *   F1DB                 https://github.com/f1db/f1db              CC BY 4.0
 *   F1 circuits GeoJSON  https://github.com/bacinger/f1-circuits   MIT
 *   OpenStreetMap        two circuits the set above lacks, kept in scripts/data/osm-outlines.json
 *                        (© OpenStreetMap contributors, ODbL 1.0)
 *
 * Usage, with both repositories cloned somewhere outside this project:
 *
 *   node scripts/generate-data.mjs --f1db <path to f1db> --circuits <path to f1-circuits>
 *
 * Everything in the output is a fact about the real 2010 to 2026 seasons. The game's own
 * judgements (ratings, colours, circuit character) are written by hand elsewhere in src/game/data.
 * A circuit with no open outline at all is drawn by hand in scripts/data/sketched-outlines.json.
 *
 * The output is deterministic: the same two checkouts always give the same files.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const FIRST = 2010;
const LAST = 2026;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Arguments ───────────────────────────────────────────────────────────────────────────────

function argument(name) {
  const at = process.argv.indexOf(`--${name}`);
  const value = at === -1 ? undefined : process.argv[at + 1];
  if (!value) {
    console.error(`Missing --${name}. Usage: node scripts/generate-data.mjs --f1db <path> --circuits <path>`);
    process.exit(2);
  }
  return resolve(value);
}

const f1dbRepo = argument('f1db');
const circuitsRepo = argument('circuits');
const data = join(f1dbRepo, 'src', 'data');
const outDir = join(root, 'src', 'game', 'data', 'generated');

const yaml = (...path) => parse(readFileSync(join(data, ...path), 'utf8'));
const cache = new Map();
/** A record file such as drivers/lewis-hamilton.yml, read once. */
function record(kind, id) {
  const key = `${kind}/${id}`;
  if (!cache.has(key)) cache.set(key, yaml(kind, `${id}.yml`));
  return cache.get(key);
}

function gitStamp(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'log', '-1', '--format=%h %cs'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ── Names the game shows differently from the database ──────────────────────────────────────

/** Short circuit names as fans say them. The database's own short names are sometimes the full title. */
const CIRCUIT_NAMES = {
  austin: { name: 'Austin' },
  catalunya: { name: 'Barcelona' },
  hockenheimring: { name: 'Hockenheim' },
  imola: { name: 'Imola' },
  interlagos: { name: 'Interlagos' },
  istanbul: { name: 'Istanbul Park', fullName: 'Istanbul Park' },
  'mexico-city': { name: 'Mexico City' },
  montreal: { name: 'Montreal' },
  // Known as the Sochi Autodrom for every race it held.
  sirius: { name: 'Sochi', fullName: 'Sochi Autodrom', place: 'Sochi' },
  yeongam: { name: 'Yeongam' },
};

/**
 * Drivers the game names or abbreviates differently. Abbreviations must be unique in the game,
 * because drivers from different real eras can meet in a career: where two share one, the earlier
 * driver keeps the form he was best known by.
 */
const DRIVER_NAMES = {
  'carlos-sainz-jr': { name: 'Carlos Sainz', lastName: 'Sainz' },
  'guanyu-zhou': { name: 'Zhou Guanyu' },
  'jean-eric-vergne': { code: 'JEV' },
  'rio-haryanto': { code: 'HRY' },
  'michael-schumacher': { code: 'SCH' },
};

/** The outline set's file for each circuit. Circuits not listed here are sketched by hand. */
const OUTLINE_FILES = {
  austin: 'us-2012', bahrain: 'bh-2002', baku: 'az-2016', catalunya: 'es-1991', hockenheimring: 'de-1932',
  hungaroring: 'hu-1986', imola: 'it-1953', interlagos: 'br-1940', istanbul: 'tr-2005', jeddah: 'sa-2021',
  'las-vegas': 'us-2023', lusail: 'qa-2004', madring: 'es-2026', 'marina-bay': 'sg-2008', melbourne: 'au-1953',
  'mexico-city': 'mx-1962', miami: 'us-2022', monaco: 'mc-1929', montreal: 'ca-1978', monza: 'it-1922',
  mugello: 'it-1914', nurburgring: 'de-1927', 'paul-ricard': 'fr-1969', portimao: 'pt-2008', sepang: 'my-1999',
  shanghai: 'cn-2004', silverstone: 'gb-1948', sirius: 'ru-2014', 'spa-francorchamps': 'be-1925',
  spielberg: 'at-1969', suzuka: 'jp-1962', 'yas-marina': 'ae-2009', zandvoort: 'nl-1948',
};

/**
 * Where a traced outline does not begin at today's start line: how far round the traced lap the
 * real line is, in metres. The line is then set at the middle of the straight found there.
 *
 * Silverstone: the outline starts on the old pit straight before Copse. Since 2011 the start line
 * has been on the straight between Club and Abbey, a little over half a lap further on.
 *
 * Yeongam: the OpenStreetMap line starts in the last sector. The start line is on the straight
 * before Turn 1, the left-hander that leads to the 1.2 km straight and the Turn 3 hairpin.
 */
const START_LINES = { silverstone: 3240, yeongam: 1990 };

/** Outlines from OpenStreetMap, for circuits the f1-circuits set lacks. */
const osmFile = join(root, 'scripts', 'data', 'osm-outlines.json');
const OSM_OUTLINES = existsSync(osmFile)
  ? Object.fromEntries(JSON.parse(readFileSync(osmFile, 'utf8')).features.map((feature) => [feature.properties.id, feature]))
  : {};

// ── Race results ────────────────────────────────────────────────────────────────────────────

/** Whether a result row means the driver took the start. */
const started = (position) => typeof position === 'number' || ['DNF', 'NC', 'DSQ'].includes(position);

/** Retirements that are the driver's or another driver's doing, or not a retirement at all. */
const NOT_MECHANICAL = new Set([
  'Collision', 'Collision damage', 'Accident', 'Accident damage', 'Spun off', 'Spin', 'Puncture',
  'Puncture damage', 'Withdrew', 'Injury', 'Illness', 'Unwell', 'Fatal accident', 'Retirement',
  'Accident in qualifying', 'Car damaged in qualifying', 'Accident on formation lap',
  'Received outside assistance', 'Tyre shortage', 'Illegal skid block wear', 'Illegal rear wing',
  'Illegal floor', 'Car underweight', 'Fuel sample',
]);

function seasonFolders(year) {
  const dir = join(data, 'seasons', String(year), 'races');
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function optional(...path) {
  return existsSync(join(data, ...path)) ? yaml(...path) : null;
}

/** "1,2,3,7,8" as "1-3,7-8". */
function ranges(numbers) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    let end = i;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
    parts.push(end === i ? `${sorted[i]}` : `${sorted[i]}-${sorted[end]}`);
    i = end;
  }
  return parts.join(',');
}

const seconds = (time) => {
  if (typeof time !== 'string') return null;
  const match = /^(?:(\d+):)?(\d+\.\d+)$/.exec(time);
  return match ? Number(match[1] ?? 0) * 60 + Number(match[2]) : null;
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// ── Outlines ────────────────────────────────────────────────────────────────────────────────

const EARTH = 6371008.8;

/** Longitude and latitude to metres east and north of the points' centre. Exact enough over a few km. */
function toMetres(coordinates) {
  const lat0 = coordinates.reduce((sum, c) => sum + c[1], 0) / coordinates.length;
  const lon0 = coordinates.reduce((sum, c) => sum + c[0], 0) / coordinates.length;
  const shrink = Math.cos((lat0 * Math.PI) / 180);
  return coordinates.map(([lon, lat]) => [
    ((lon - lon0) * Math.PI * EARTH * shrink) / 180,
    ((lat - lat0) * Math.PI * EARTH) / 180,
  ]);
}

const step = (points, i) => {
  const a = points[i];
  const b = points[(i + 1) % points.length];
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
};
const lapLength = (points) => points.reduce((sum, _, i) => sum + step(points, i), 0);
/** Positive when the points run anticlockwise (with north up). */
const signedArea = (points) =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + (p[0] * q[1] - q[0] * p[1]);
  }, 0) / 2;

/** Moves the start of the lap to the middle of the straight nearest `distance` metres round it. */
function restart(points, distance) {
  let travelled = 0;
  let at = 0;
  while (travelled + step(points, at) < distance) travelled += step(points, at++);
  // The straight is the longest single segment within a few points either side.
  let best = at;
  for (let offset = -3; offset <= 3; offset++) {
    const i = (at + offset + points.length) % points.length;
    if (step(points, i) > step(points, best)) best = i;
  }
  const a = points[best];
  const b = points[(best + 1) % points.length];
  const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return [middle, ...points.slice(best + 1), ...points.slice(0, best + 1)];
}

/** Centres the lap on the middle of its bounding box and rounds to whole metres. */
function settle(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const out = [];
  let last = null;
  for (const [x, y] of points) {
    const p = [Math.round(x - cx), Math.round(y - cy)];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
    last = p;
  }
  return out.flat();
}

function surveyedOutline(id, direction, officialKm) {
  const geo = OSM_OUTLINES[id] ?? JSON.parse(readFileSync(join(circuitsRepo, 'circuits', `${OUTLINE_FILES[id]}.geojson`), 'utf8'));
  const geometry = (geo.features ? geo.features[0] : geo).geometry;
  if (geometry.type !== 'LineString') throw new Error(`${id}: expected a LineString outline`);
  let points = toMetres(geometry.coordinates);
  const first = points[0];
  const final = points[points.length - 1];
  if (first[0] === final[0] && first[1] === final[1]) points = points.slice(0, -1);

  // The tracing may run either way round; the lap must run the way the cars do.
  const tracedClockwise = signedArea(points) < 0;
  if (tracedClockwise !== (direction === 'clockwise')) points = [points[0], ...points.slice(1).reverse()];
  if (START_LINES[id] !== undefined) points = restart(points, START_LINES[id]);

  const off = (lapLength(points) / 1000 / officialKm - 1) * 100;
  if (Math.abs(off) > 1.5) throw new Error(`${id}: outline is ${off.toFixed(1)}% off the official lap length`);
  return settle(points);
}

/** A closed Catmull-Rom curve through hand-placed points, sampled finely. */
function smooth(points, perSpan = 10) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < perSpan; s++) {
      const t = s / perSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((k) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
      ));
    }
  }
  return out;
}

/** Drops points that sit on a straight line between their neighbours, to keep the outline small. */
function thin(points, tolerance) {
  const keep = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = keep[keep.length - 1];
    const b = points[i];
    const c = points[(i + 1) % points.length];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    const base = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (base === 0 || area / base > tolerance || Math.hypot(b[0] - a[0], b[1] - a[1]) > 220) keep.push(b);
  }
  return keep;
}

const sketchFile = join(root, 'scripts', 'data', 'sketched-outlines.json');
const sketches = existsSync(sketchFile) ? JSON.parse(readFileSync(sketchFile, 'utf8')) : {};

/** A hand-drawn outline: smoothed, scaled so one lap is the official length, and turned to run the right way. */
function sketchedOutline(id, direction, officialKm) {
  const sketch = sketches[id];
  if (!sketch) throw new Error(`${id}: no surveyed outline and no sketch in scripts/data/sketched-outlines.json`);
  // Sketches are drawn with y pointing down, as on a screen; the game's outlines have north up.
  let points = smooth(sketch.points.map(([x, y]) => [x, -y]));
  if ((signedArea(points) < 0) !== (direction === 'clockwise')) {
    throw new Error(`${id}: the sketch runs the wrong way round for a ${direction} circuit`);
  }
  const scale = (officialKm * 1000) / lapLength(points);
  points = thin(points.map(([x, y]) => [x * scale, y * scale]), 1.2);
  return settle(points);
}

// ── Read the seasons ────────────────────────────────────────────────────────────────────────

const countryCode = (id) => record('countries', id).alpha3Code;

const rounds = {};
const entries = {};
const pace = {};
const fixture = {};
const driverSeasons = new Map(); // driver id -> Set of seasons with a start, 2010 to 2026
const circuitIds = new Set();
const latestLapKm = new Map(); // circuit id -> lap length the last time it was used
let lastSeasonRoundsHeld = 0;

for (let year = FIRST; year <= LAST; year++) {
  const folders = seasonFolders(year);
  rounds[year] = [];
  fixture[year] = [];
  const startsBy = new Map(); // constructor -> driver -> rounds started
  const gaps = new Map(); // constructor -> qualifying gaps to the fastest car, one per weekend
  const reliability = new Map(); // constructor -> { starts, mechanical }

  for (const folder of folders) {
    const race = yaml('seasons', String(year), 'races', folder, 'race.yml');
    const grandPrix = record('grands-prix', race.grandPrixId);
    circuitIds.add(race.circuitId);
    latestLapKm.set(race.circuitId, race.courseLength);
    const row = {
      round: race.round,
      gp: race.grandPrixId,
      name: grandPrix.fullName,
      code: grandPrix.abbreviation,
      circuit: race.circuitId,
      date: race.date,
      laps: race.scheduledLaps ?? race.laps,
      lapKm: race.courseLength,
      turns: race.turns,
      sprintLaps: race.sprintRaceLaps ?? null,
      refLap: null,
    };
    rounds[year].push(row);

    const results = optional('seasons', String(year), 'races', folder, 'race-results.yml');
    if (!results) continue;
    if (year === LAST) lastSeasonRoundsHeld = Math.max(lastSeasonRoundsHeld, race.round);

    for (const row of results) {
      if (!started(row.position)) continue;
      if (!startsBy.has(row.constructorId)) startsBy.set(row.constructorId, new Map());
      const drivers = startsBy.get(row.constructorId);
      if (!drivers.has(row.driverId)) drivers.set(row.driverId, []);
      drivers.get(row.driverId).push(race.round);
      if (!driverSeasons.has(row.driverId)) driverSeasons.set(row.driverId, new Set());
      driverSeasons.get(row.driverId).add(year);

      const tally = reliability.get(row.constructorId) ?? { starts: 0, mechanical: 0 };
      tally.starts += 1;
      if (row.position === 'DNF' && row.reasonRetired && !NOT_MECHANICAL.has(row.reasonRetired)) tally.mechanical += 1;
      reliability.set(row.constructorId, tally);
    }

    // Each team's best qualifying lap of the weekend against the fastest of all.
    const qualifying = optional('seasons', String(year), 'races', folder, 'qualifying-results.yml') ?? [];
    const best = new Map();
    for (const row of qualifying) {
      for (const lap of [row.q1, row.q2, row.q3, row.time].map(seconds)) {
        if (lap !== null && lap < (best.get(row.constructorId) ?? Infinity)) best.set(row.constructorId, lap);
      }
    }
    const fastest = Math.min(...best.values());
    // The quickest lap anyone managed all weekend: the yardstick for lap times at this round.
    const raceBest = (optional('seasons', String(year), 'races', folder, 'fastest-laps.yml') ?? [])
      .map((entry) => seconds(entry.time))
      .filter((lap) => lap !== null);
    const quickest = Math.min(fastest, ...raceBest);
    if (Number.isFinite(quickest)) row.refLap = Number(quickest.toFixed(3));
    for (const [constructor, lap] of best) {
      if (!gaps.has(constructor)) gaps.set(constructor, []);
      gaps.get(constructor).push((lap / fastest - 1) * 100);
    }

    // What the points tests check against: who scored what, as it really happened.
    const scored = (rows) =>
      (rows ?? [])
        .filter((row) => typeof row.position === 'number' && (row.position <= 10 || row.points > 0))
        .map((row) => [row.position, row.driverId, row.points ?? 0]);
    const fastestLaps = optional('seasons', String(year), 'races', folder, 'fastest-laps.yml');
    fixture[year].push({
      round: race.round,
      gp: race.grandPrixId,
      laps: race.laps,
      scheduled: race.scheduledLaps ?? race.laps,
      fastest: fastestLaps?.find((row) => row.position === 1)?.driverId ?? null,
      race: scored(results),
      sprint: scored(optional('seasons', String(year), 'races', folder, 'sprint-race-results.yml')),
    });
  }

  // One entry per constructor: a team that changed entrant mid-season is still one team.
  const byConstructor = new Map();
  for (const row of yaml('seasons', String(year), 'entrants.yml')) {
    if (!startsBy.has(row.constructorId)) continue;
    if (!byConstructor.has(row.constructorId)) byConstructor.set(row.constructorId, row);
    else if (byConstructor.get(row.constructorId).engineManufacturerId !== row.engineManufacturerId) {
      throw new Error(`${year} ${row.constructorId}: two engine makers in one season`);
    }
  }
  entries[year] = [...byConstructor.values()].map((row) => ({
    constructor: row.constructorId,
    name: record('constructors', row.constructorId).name,
    countryCode: countryCode(row.countryId),
    engine: row.engineManufacturerId,
    engineName: record('engine-manufacturers', row.engineManufacturerId).name,
    drivers: [...startsBy.get(row.constructorId)]
      .sort((a, b) => a[1][0] - b[1][0] || b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([id, started]) => ({ id, rounds: ranges(started) })),
  }));

  pace[year] = {};
  for (const [constructor, values] of gaps) {
    const tally = reliability.get(constructor);
    if (!tally) continue;
    pace[year][constructor] = {
      gap: Number(median(values).toFixed(2)),
      mechanical: Number((tally.mechanical / tally.starts).toFixed(3)),
      starts: tally.starts,
    };
  }
}

// ── Reference lap times: dry-weather yardsticks for every round ─────────────────────────────

/*
 * The quickest lap of a weekend is a poor yardstick when the weekend was wet, and there is none for
 * a round not yet run. So each round's lap is checked against what that circuit and that season's
 * cars would be expected to give: a circuit has a characteristic speed, a season's cars are a
 * certain amount quicker or slower than average, and the two multiply. Both are found from the
 * medians of the real laps, which wet weekends barely move. A real lap more than 4.5% slower than
 * expected is taken to be weather and replaced by the expected one.
 */
{
  const all = Object.values(rounds).flat();
  const speedOf = (row) => (row.lapKm / row.refLap) * 3600;
  // A layout is a circuit with one count of turns at one lap length, give or take a re-measurement.
  const layouts = [];
  const sameLayout = (l, row) => l.circuit === row.circuit && l.turns === row.turns && Math.abs(l.lapKm / row.lapKm - 1) < 0.004;
  const layoutOf = (row) => {
    let layout = layouts.find((l) => sameLayout(l, row));
    if (!layout) layouts.push((layout = { circuit: row.circuit, lapKm: row.lapKm, turns: row.turns, base: 1 }));
    return layout;
  };
  const timed = all.filter((row) => row.refLap !== null).map((row) => ({ row, layout: layoutOf(row), year: Number(row.date.slice(0, 4)) }));
  const index = Object.fromEntries(Object.keys(rounds).map((year) => [year, 1]));
  for (let pass = 0; pass < 8; pass++) {
    for (const layout of layouts) {
      const mine = timed.filter((entry) => entry.layout === layout);
      if (mine.length) layout.base = median(mine.map((entry) => speedOf(entry.row) / index[entry.year]));
    }
    for (const year of Object.keys(index)) {
      const mine = timed.filter((entry) => String(entry.year) === year);
      index[year] = median(mine.map((entry) => speedOf(entry.row) / entry.layout.base));
    }
  }
  let replaced = 0;
  for (const row of all) {
    const year = row.date.slice(0, 4);
    const known = layouts.find((l) => sameLayout(l, row));
    // A layout never timed (a round still to come on a changed circuit) borrows the circuit's nearest.
    const layout = known ?? layouts.find((l) => l.circuit === row.circuit);
    if (!layout) throw new Error(`${year} ${row.gp}: nothing to estimate a lap time from`);
    const expected = layout.base * index[year];
    if (row.refLap === null || speedOf(row) < expected * 0.955) {
      row.refLap = Number(((row.lapKm / expected) * 3600).toFixed(3));
      row.refLapEstimated = true;
      replaced += 1;
    }
  }
  console.log(`reference laps: ${replaced} of ${all.length} estimated (wet weekends and rounds to come)`);
}

// ── Teams: one id across every change of name ───────────────────────────────────────────────

/** The set of constructor ids a constructor has gone by. */
function family(constructor) {
  const chronology = record('constructors', constructor).chronology;
  return chronology ? chronology.map((link) => link.constructorId) : [constructor];
}

const teams = [];
const teamOf = new Map(); // constructor id -> team id
for (let year = FIRST; year <= LAST; year++) {
  for (const entry of entries[year]) {
    if (teamOf.has(entry.constructor)) continue;
    const relatives = family(entry.constructor);
    const known = relatives.find((id) => teamOf.has(id));
    // A team takes the id of the name it first raced under in these seasons.
    const id = known ? teamOf.get(known) : entry.constructor;
    for (const relative of relatives) if (!teamOf.has(relative)) teamOf.set(relative, id);
    if (!known) teams.push({ id, names: [], seasons: [year, year] });
  }
}
for (let year = FIRST; year <= LAST; year++) {
  for (const entry of entries[year]) {
    entry.team = teamOf.get(entry.constructor);
    const team = teams.find((candidate) => candidate.id === entry.team);
    team.seasons[1] = year;
    const current = team.names[team.names.length - 1];
    if (current && current.constructor === entry.constructor && current.to === year - 1) current.to = year;
    else team.names.push({ constructor: entry.constructor, name: entry.name, from: year, to: year });
  }
  entries[year] = entries[year]
    .map(({ team, constructor, ...rest }) => ({ team, constructor, ...rest }))
    .sort((a, b) => a.team.localeCompare(b.team));
  pace[year] = Object.fromEntries(
    Object.entries(pace[year])
      .map(([constructor, value]) => [teamOf.get(constructor), value])
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
}
teams.sort((a, b) => a.id.localeCompare(b.id));

// ── Drivers ─────────────────────────────────────────────────────────────────────────────────

// A driver's debut may be long before 2010, so every season in the database is read for it.
const debut = new Map();
for (const folder of readdirSync(join(data, 'seasons')).sort()) {
  const year = Number(folder);
  if (year > LAST) continue;
  for (const race of seasonFolders(year)) {
    const results = optional('seasons', folder, 'races', race, 'race-results.yml');
    for (const row of results ?? []) {
      if (driverSeasons.has(row.driverId) && !debut.has(row.driverId) && started(row.position)) {
        debut.set(row.driverId, year);
      }
    }
  }
}

const drivers = [...driverSeasons.keys()].sort().map((id) => {
  const driver = record('drivers', id);
  const country = record('countries', driver.nationalityCountryId);
  const seasons = [...driverSeasons.get(id)].sort((a, b) => a - b);
  const shown = DRIVER_NAMES[id] ?? {};
  return {
    id,
    name: shown.name ?? driver.name,
    firstName: driver.firstName,
    lastName: shown.lastName ?? driver.lastName,
    code: shown.code ?? driver.abbreviation,
    born: driver.dateOfBirth,
    countryCode: country.alpha3Code,
    nationality: country.demonym,
    debut: debut.get(id),
    raced: [seasons[0], seasons[seasons.length - 1]],
  };
});

// ── Circuits ────────────────────────────────────────────────────────────────────────────────

const TYPES = { RACE: 'permanent', STREET: 'street', ROAD: 'road' };
const DIRECTIONS = { CLOCKWISE: 'clockwise', ANTI_CLOCKWISE: 'anticlockwise' };

const circuits = [...circuitIds].sort().map((id) => {
  const circuit = record('circuits', id);
  const shown = CIRCUIT_NAMES[id] ?? {};
  const direction = DIRECTIONS[circuit.direction];
  const surveyed = OUTLINE_FILES[id] !== undefined || OSM_OUTLINES[id] !== undefined;
  // The outline set shows each circuit as it is today, so it is checked against the lap length of
  // the circuit's most recent race in these seasons.
  const km = latestLapKm.get(id);
  return {
    id,
    name: shown.name ?? circuit.name,
    fullName: shown.fullName ?? circuit.fullName,
    place: shown.place ?? circuit.placeName,
    country: record('countries', circuit.countryId).name,
    countryCode: countryCode(circuit.countryId),
    type: TYPES[circuit.type],
    direction,
    outline: surveyed ? surveyedOutline(id, direction, km) : sketchedOutline(id, direction, km),
    outlineSource: surveyed ? 'surveyed' : 'sketched',
  };
});

// ── Write ───────────────────────────────────────────────────────────────────────────────────

const version = /^version=(.+)$/m.exec(readFileSync(join(f1dbRepo, 'gradle.properties'), 'utf8'))?.[1] ?? 'unknown';
const sources = {
  f1db: `v${version} (${gitStamp(f1dbRepo)})`,
  circuits: gitStamp(circuitsRepo),
  lastSeasonRoundsHeld,
};

const HEADER = `/*
 * GENERATED FILE. Do not edit by hand: run scripts/generate-data.mjs instead.
 *
 * Facts from F1DB ${sources.f1db}, https://github.com/f1db/f1db, CC BY 4.0,
 * and circuit outlines from https://github.com/bacinger/f1-circuits (${sources.circuits}), MIT,
 * and for Buddh and Yeongam from OpenStreetMap, © OpenStreetMap contributors, ODbL 1.0.
 */
`;

const line = (value) => JSON.stringify(value);
/** An object of year -> list, one list item per line. */
const byYear = (table) =>
  `{\n${Object.entries(table)
    .map(([year, items]) => `  ${year}: [\n${items.map((item) => `    ${line(item)},`).join('\n')}\n  ],`)
    .join('\n')}\n}`;
const list = (items) => `[\n${items.map((item) => `  ${line(item)},`).join('\n')}\n]`;

mkdirSync(outDir, { recursive: true });
const write = (file, body) => writeFileSync(join(outDir, file), HEADER + body);

write('rounds.ts', `import type { RoundFact } from '../types';\n\nexport const ROUNDS: Readonly<Record<number, readonly RoundFact[]>> = ${byYear(rounds)};\n`);
write('entries.ts', `import type { EntryFact, TeamFact } from '../types';\n\nexport const TEAMS: readonly TeamFact[] = ${list(teams)};\n\nexport const ENTRIES: Readonly<Record<number, readonly EntryFact[]>> = ${byYear(entries)};\n`);
write('drivers.ts', `import type { DriverFact } from '../types';\n\nexport const DRIVERS: readonly DriverFact[] = ${list(drivers)};\n`);
write('circuits.ts', `import type { CircuitFact } from '../types';\n\nexport const CIRCUITS: readonly CircuitFact[] = ${list(circuits)};\n`);
write('pace.ts', `import type { RealPace } from '../types';\n\nexport const REAL_PACE: Readonly<Record<number, Readonly<Record<string, RealPace>>>> = {\n${Object.entries(pace).map(([year, table]) => `  ${year}: ${line(table)},`).join('\n')}\n};\n`);
write('sources.ts', `import type { DataSources } from '../types';\n\nexport const SOURCES: DataSources = ${JSON.stringify(sources, null, 2)};\n`);

// Real results, for the tests that check the game's points rules against history.
const fixtureDir = join(root, 'tests', 'fixtures');
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(
  join(fixtureDir, 'real-results.json'),
  `{\n${Object.entries(fixture).map(([year, races]) => `"${year}": [\n${races.map((race) => `  ${line(race)}`).join(',\n')}\n]`).join(',\n')}\n}\n`,
);

const outlinePoints = circuits.reduce((sum, circuit) => sum + circuit.outline.length / 2, 0);
console.log(`F1DB ${sources.f1db}; outlines ${sources.circuits}`);
console.log(`${Object.values(rounds).flat().length} rounds, ${circuits.length} circuits (${outlinePoints} outline points, ${circuits.filter((c) => c.outlineSource === 'sketched').length} sketched), ${teams.length} teams, ${drivers.length} drivers`);
console.log(`${LAST}: ${lastSeasonRoundsHeld} of ${rounds[LAST].length} rounds held`);
