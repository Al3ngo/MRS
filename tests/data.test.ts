import { describe, expect, it } from 'vitest';
import {
  CIRCUITS,
  CIRCUITS_WITH_TRAITS,
  DRIVERS,
  ENGINE_MAKERS,
  ENTRIES,
  PROFILES,
  ROUNDS,
  SEASONS,
  SOURCES,
  TEAMS,
  TEAMS_WITH_COLOURS,
  ageIn,
  calendar,
  circuit,
  circuitTraits,
  driver,
  driversBy,
  expandRounds,
  knockoutCuts,
  openingGrid,
  ratingsAtAge,
  rulesFor,
  teamsIn,
} from '../src/game/data';

describe('calendars', () => {
  it('have the number of rounds each season really had', () => {
    expect(SEASONS.map((season) => calendar(season).length)).toEqual([
      19, 19, 20, 19, 19, 19, 21, 20, 21, 21, 17, 22, 22, 22, 24, 24, 23,
    ]);
  });

  it('give every round a believable reference lap, measured where the weekend was dry', () => {
    let estimated = 0;
    for (const season of SEASONS) {
      for (const round of calendar(season)) {
        const where = `${season} round ${round.round}`;
        // Between about 150 and 260 km/h average: Monaco at one end, Monza at the other.
        const speed = (round.lapKm / round.refLap) * 3600;
        expect(speed, where).toBeGreaterThan(150);
        expect(speed, where).toBeLessThan(270);
        if (round.refLapEstimated) estimated += 1;
      }
    }
    expect(estimated).toBeLessThan(20);
    // Pole at Monza in 2020 was the fastest lap in the sport's history, at 264 km/h.
    const monza = calendar(2020).find((round) => round.circuit === 'monza')!;
    expect(monza.refLap).toBeCloseTo(78.887, 2);
  });

  it('number their rounds 1, 2, 3 in date order, at known circuits', () => {
    for (const season of SEASONS) {
      const rounds = calendar(season);
      rounds.forEach((round, index) => {
        expect(round.round, `${season}`).toBe(index + 1);
        expect(round.date.startsWith(String(season)), `${season} round ${round.round} date`).toBe(true);
        if (index > 0) expect(round.date > rounds[index - 1]!.date, `${season} round ${round.round} order`).toBe(true);
        expect(() => circuit(round.circuit)).not.toThrow();
        expect(round.laps * round.lapKm, `${season} ${round.name} distance`).toBeGreaterThan(255);
        expect(round.laps * round.lapKm, `${season} ${round.name} distance`).toBeLessThan(312);
      });
    }
  });

  it('remember the oddities of real history', () => {
    const names = (season: number) => calendar(season).map((round) => round.name);
    expect(calendar(2010)[0]).toMatchObject({ name: 'Bahrain Grand Prix', date: '2010-03-14', laps: 49, lapKm: 6.299 });
    expect(names(2011)).not.toContain('Bahrain Grand Prix'); // cancelled
    expect(names(2020).slice(0, 5)).toEqual([
      'Austrian Grand Prix',
      'Styrian Grand Prix',
      'Hungarian Grand Prix',
      'British Grand Prix',
      '70th Anniversary Grand Prix',
    ]);
    expect(names(2023)).not.toContain('Emilia Romagna Grand Prix'); // called off for floods
    // 2021 Belgium ran three laps behind the safety car; the game schedules the full 44.
    expect(calendar(2021).find((round) => round.gp === 'belgium')?.laps).toBe(44);
    // 2026: the Bahrain race was run at Sepang in October, and Saudi Arabia was cancelled.
    expect(calendar(2026)[15]).toMatchObject({ name: 'Bahrain Grand Prix', circuit: 'sepang', date: '2026-10-04' });
    expect(names(2026)).not.toContain('Saudi Arabian Grand Prix');
  });

  it('have sprints from 2021 only, in the real numbers', () => {
    const sprints = (season: number) => calendar(season).filter((round) => round.sprintLaps !== null).length;
    expect(SEASONS.map(sprints)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 6, 6, 6, 6]);
    for (const season of SEASONS) expect(rulesFor(season).sprints, `${season}`).toBe(sprints(season) > 0);
  });
});

describe('circuits', () => {
  it('cover every race, each with traits and a closed outline of about the right length', () => {
    expect(CIRCUITS).toHaveLength(36);
    expect([...CIRCUITS_WITH_TRAITS].sort()).toEqual(CIRCUITS.map((c) => c.id).sort());
    for (const c of CIRCUITS) {
      expect(c.outline.length % 2, c.id).toBe(0);
      expect(c.outline.length / 2, `${c.id} points`).toBeGreaterThan(40);
      let length = 0;
      for (let i = 0; i < c.outline.length; i += 2) {
        const j = (i + 2) % c.outline.length;
        length += Math.hypot(c.outline[j]! - c.outline[i]!, c.outline[j + 1]! - c.outline[i + 1]!);
      }
      const lastUsed = [...SEASONS].reverse().flatMap((s) => calendar(s)).find((round) => round.circuit === c.id)!;
      expect(Math.abs(length / 1000 / lastUsed.lapKm - 1), `${c.id} lap length`).toBeLessThan(0.02);
      const traits = circuitTraits(c.id);
      for (const key of ['power', 'downforce', 'tyreWear', 'overtaking', 'danger'] as const) {
        expect(traits[key], `${c.id} ${key}`).toBeGreaterThanOrEqual(1);
        expect(traits[key], `${c.id} ${key}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('run the way the cars do', () => {
    for (const c of CIRCUITS) {
      if (c.id === 'suzuka') continue; // a figure of eight has no single sense
      let area = 0;
      for (let i = 0; i < c.outline.length; i += 2) {
        const j = (i + 2) % c.outline.length;
        area += c.outline[i]! * c.outline[j + 1]! - c.outline[j]! * c.outline[i + 1]!;
      }
      expect(area < 0 ? 'clockwise' : 'anticlockwise', c.id).toBe(c.direction);
    }
  });
});

describe('teams', () => {
  it('are on the grid in the seasons they really were', () => {
    expect(SEASONS.map((season) => teamsIn(season).length)).toEqual([
      12, 12, 12, 11, 11, 10, 11, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11,
    ]);
    const span = Object.fromEntries(TEAMS.map((team) => [team.id, team.seasons]));
    expect(span).toMatchObject({
      hrt: [2010, 2012],
      'lotus-racing': [2010, 2014],
      virgin: [2010, 2016],
      haas: [2016, 2026],
      cadillac: [2026, 2026],
      ferrari: [2010, 2026],
    });
    expect([...TEAMS_WITH_COLOURS].sort()).toEqual(TEAMS.map((team) => team.id).sort());
  });

  it('keep one identity through their changes of name', () => {
    const nameIn = (team: string, season: number) => teamsIn(season).find((t) => t.team === team)?.name;
    expect([2010, 2012, 2016, 2021].map((s) => nameIn('renault', s))).toEqual(['Renault', 'Lotus', 'Renault', 'Alpine']);
    expect([2010, 2019, 2021].map((s) => nameIn('force-india', s))).toEqual(['Force India', 'Racing Point', 'Aston Martin']);
    expect([2010, 2020, 2024, 2025].map((s) => nameIn('toro-rosso', s))).toEqual(['Toro Rosso', 'AlphaTauri', 'RB', 'Racing Bulls']);
    expect([2010, 2011, 2019, 2024, 2026].map((s) => nameIn('sauber', s))).toEqual(['BMW Sauber', 'Sauber', 'Alfa Romeo', 'Kick Sauber', 'Audi']);
    expect([2010, 2011, 2012].map((s) => nameIn('lotus-racing', s))).toEqual(['Lotus Racing', 'Team Lotus', 'Caterham']);
  });

  it('have the engines they really ran, from makers that existed', () => {
    const engine = (team: string, season: number) => teamsIn(season).find((t) => t.team === team)?.engineMaker;
    expect(engine('red-bull', 2010)).toBe('renault');
    expect(engine('red-bull', 2017)).toBe('renault'); // badged TAG Heuer
    expect(engine('red-bull', 2023)).toBe('honda'); // badged Honda RBPT
    expect(engine('red-bull', 2026)).toBe('red-bull-ford');
    expect(engine('mclaren', 2015)).toBe('honda');
    expect(engine('williams', 2010)).toBe('cosworth');
    expect(engine('renault', 2026)).toBe('mercedes'); // Alpine as a customer
    expect(engine('force-india', 2026)).toBe('honda');
    for (const season of SEASONS) {
      for (const team of teamsIn(season)) {
        const maker = ENGINE_MAKERS.find((m) => m.id === team.engineMaker);
        expect(maker, `${season} ${team.name}: ${team.engineMaker}`).toBeDefined();
        expect(season >= maker!.seasons[0] && season <= maker!.seasons[1], `${season} ${team.name}: ${maker!.id}`).toBe(true);
      }
    }
  });

  it('can be told apart by colour on a black screen, every season', () => {
    const lab = (hex: string): [number, number, number] => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const v = parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
      const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    };
    for (const season of SEASONS) {
      const teams = teamsIn(season);
      for (const team of teams) expect(lab(team.colour)[0], `${season} ${team.name} is too dark for black`).toBeGreaterThan(38);
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          const [a, b] = [lab(teams[i]!.colour), lab(teams[j]!.colour)];
          const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          expect(distance, `${season}: ${teams[i]!.name} and ${teams[j]!.name}`).toBeGreaterThan(17);
        }
      }
    }
  });

  it('spend within the cap once there is one, with the small teams short of it', () => {
    for (const season of SEASONS) {
      const cap = rulesFor(season).budgetCap;
      for (const team of teamsIn(season)) if (cap !== null) expect(team.spending).toBeLessThanOrEqual(cap);
    }
    expect([2020, 2021, 2022, 2023, 2026].map((s) => rulesFor(s).budgetCap)).toEqual([null, 145, 140, 135, 135]);
    const spend = (team: string, season: number) => teamsIn(season).find((t) => t.team === team)!.spending;
    expect(spend('ferrari', 2021)).toBe(145);
    expect(spend('williams', 2021)).toBeLessThan(145);
    expect(spend('ferrari', 2010)).toBeGreaterThan(spend('williams', 2010) * 1.5);
  });
});

describe('drivers', () => {
  it('are the 86 who started a race, each with ratings and a unique abbreviation', () => {
    expect(DRIVERS).toHaveLength(86);
    expect(Object.keys(PROFILES).sort()).toEqual(DRIVERS.map((d) => d.id).sort());
    expect(new Set(DRIVERS.map((d) => d.code)).size).toBe(86);
    for (const d of DRIVERS) {
      expect(d.code, d.id).toMatch(/^[A-Z]{3}$/);
      expect(d.debut, d.id).toBeLessThanOrEqual(d.raced[0]);
      for (const value of Object.values(PROFILES[d.id]!.peak)) {
        expect(value, d.id).toBeGreaterThanOrEqual(30);
        expect(value, d.id).toBeLessThanOrEqual(99);
      }
    }
  });

  it('arrive in their real debut year', () => {
    const debut = (id: string) => driver(id).debut;
    expect(debut('michael-schumacher')).toBe(1991);
    expect(debut('nico-hulkenberg')).toBe(2010);
    expect(debut('daniel-ricciardo')).toBe(2011);
    expect(debut('max-verstappen')).toBe(2015);
    expect(debut('charles-leclerc')).toBe(2018);
    expect(debut('oscar-piastri')).toBe(2023);
    expect(debut('arvid-lindblad')).toBe(2026);
    const pool = (season: number) => driversBy(season).map((entry) => entry.driver.id);
    expect(pool(2010)).toHaveLength(30);
    expect(pool(2010)).toContain('kimi-raikkonen'); // away rallying, but free to sign
    expect(pool(2014)).not.toContain('max-verstappen');
    expect(pool(2015)).toContain('max-verstappen');
    expect(driversBy(2015).find((entry) => entry.driver.id === 'max-verstappen')).toMatchObject({ age: 17, rookie: true });
  });

  it('start 2010 two to a team, as at the first race', () => {
    const grid = openingGrid(2010);
    expect(grid).toHaveLength(12);
    for (const seat of grid) expect(seat.drivers, seat.team).toHaveLength(2);
    expect([...(grid.find((seat) => seat.team === 'mclaren')?.drivers ?? [])].sort()).toEqual(['jenson-button', 'lewis-hamilton']);
    expect([...(grid.find((seat) => seat.team === 'mercedes')?.drivers ?? [])].sort()).toEqual(['michael-schumacher', 'nico-rosberg']);
    expect(knockoutCuts(grid.length * 2)).toEqual([7, 7]);
  });

  it('only list drivers and rounds that exist', () => {
    for (const season of SEASONS) {
      const rounds = calendar(season).length;
      for (const entry of ENTRIES[season]!) {
        for (const seat of entry.drivers) {
          expect(() => driver(seat.id)).not.toThrow();
          for (const round of expandRounds(seat.rounds)) expect(round >= 1 && round <= rounds, `${season} ${seat.id}`).toBe(true);
        }
      }
    }
  });

  it('rise to a peak and fade with age', () => {
    const at = (id: string, season: number) => ratingsAtAge(PROFILES[id]!, ageIn(driver(id), season));
    expect(at('michael-schumacher', 2010).pace).toBeLessThan(at('nico-rosberg', 2010).pace); // 41 against 25
    expect(at('max-verstappen', 2015).pace).toBeLessThan(at('max-verstappen', 2021).pace);
    expect(at('charles-leclerc', 2018).consistency).toBeLessThan(at('charles-leclerc', 2024).consistency);
    expect(at('fernando-alonso', 2023).pace).toBeGreaterThan(85); // still quick at 41
    expect(at('kimi-raikkonen', 2021).pace).toBeLessThan(at('kimi-raikkonen', 2012).pace - 8);
    const top = (season: number) => driversBy(season).slice(0, 4).map((entry) => entry.driver.lastName);
    expect(top(2010)).toEqual(expect.arrayContaining(['Alonso', 'Hamilton', 'Vettel']));
    expect(top(2024)).toEqual(expect.arrayContaining(['Verstappen', 'Norris']));
  });
});

describe('rules', () => {
  it('change on the real dates', () => {
    const when = <T,>(read: (season: number) => T, value: T) => SEASONS.filter((season) => read(season) === value);
    expect(when((s) => rulesFor(s).engine, 'v8')).toEqual([2010, 2011, 2012, 2013]);
    expect(when((s) => rulesFor(s).engine, 'hybrid-2026')).toEqual([2026]);
    expect(when((s) => rulesFor(s).recovery, 'kers')).toEqual([2011, 2012, 2013]);
    expect(when((s) => rulesFor(s).overtakingAid, 'none')).toEqual([2010]);
    expect(when((s) => rulesFor(s).overtakingAid, 'active-aero')).toEqual([2026]);
    expect(when((s) => rulesFor(s).tyreSupplier, 'Bridgestone')).toEqual([2010]);
    expect(when((s) => rulesFor(s).halo, true)[0]).toBe(2018);
    expect(when((s) => rulesFor(s).wideCars, true)[0]).toBe(2017);
    expect(when((s) => rulesFor(s).wheelInches, 18)[0]).toBe(2022);
    expect(when((s) => rulesFor(s).virtualSafetyCar, true)[0]).toBe(2015);
    expect(when((s) => rulesFor(s).reset, 'major')).toEqual([2014, 2017, 2022, 2026]);
    expect(when((s) => rulesFor(s).fastestLapPoint, true)).toEqual([2019, 2020, 2021, 2022, 2023, 2024]);
    expect(when((s) => rulesFor(s).doublePointsFinale, true)).toEqual([2014]);
  });
});

describe('sources', () => {
  it('say where the facts came from and how far the last season has run', () => {
    expect(SOURCES.f1db).toMatch(/^v2026\./);
    expect(SOURCES.lastSeasonRoundsHeld).toBeLessThanOrEqual(ROUNDS[2026]!.length);
  });
});
