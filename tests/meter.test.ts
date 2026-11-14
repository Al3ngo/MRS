import { describe, expect, it } from 'vitest';
import { batteryMeter, fuelMeter, meterColour, stressMeter, tyreMeter, wetMeter } from '../src/ui/Meter';
import { causeLabel, causePhrase, placeWords, raceGuide } from '../src/ui/race/words';
import { sessionRules } from '../src/game/sim';

describe('meters', () => {
  it('run from red through amber to green', () => {
    expect(meterColour(0)).toBe('rgb(229, 72, 77)');
    expect(meterColour(0.5)).toBe('rgb(229, 169, 59)');
    expect(meterColour(1)).toBe('rgb(82, 194, 106)');
    expect(meterColour(-3)).toBe(meterColour(0));
    expect(meterColour(Number.NaN)).toBe(meterColour(0));
  });

  it('read tyres, fuel, battery, wetness and stress the right way round', () => {
    expect(tyreMeter(0)).toMatchObject({ fill: 1, good: 1, words: 'fresh' });
    expect(tyreMeter(0.5).fill).toBeCloseTo(0.5);
    expect(tyreMeter(1.2)).toMatchObject({ fill: 0, good: 0, words: 'worn out' });
    // Fuel: the bar empties as the race goes on; its colour says whether what is left is enough.
    expect(fuelMeter(50, 60, 1.2)).toMatchObject({ good: 1, words: 'enough to finish' });
    expect(fuelMeter(50, 60, 1.2).fill).toBeCloseTo(50 / 60);
    expect(fuelMeter(5, 60, -1).good).toBe(0);
    expect(fuelMeter(5, 60, 0.2).words).toBe('only just enough to finish');
    expect(batteryMeter(100).fill).toBe(1);
    expect(batteryMeter(10).words).toBe('nearly empty');
    expect(wetMeter(0)).toEqual({ fill: 0, good: 1 });
    expect(wetMeter(1)).toEqual({ fill: 1, good: 0 });
    expect(stressMeter(90).words).toBe('on the limit');
    expect(stressMeter(90).good).toBeCloseTo(0.1);
  });
});

describe('plain words', () => {
  it('name places and causes the way people say them', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(placeWords)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd',
    ]);
    expect(causeLabel('Power unit')).toBe('Engine');
    expect(causeLabel('Energy recovery')).toBe('Hybrid system');
    expect(causeLabel('Finished')).toBe('Finished');
    expect(causePhrase('KERS')).toBe('a KERS boost failure');
    expect(causePhrase('Something new')).toBe('something new');
  });

  it('explain only what a season has on its race screen', () => {
    const terms = (season: number) => raceGuide(sessionRules(season, 'race')).map((entry) => entry.term);
    expect(terms(2010)).not.toContain('DRS');
    expect(terms(2010)).not.toContain('Battery bar');
    expect(terms(2010)).not.toContain('Virtual safety car');
    expect(terms(2012)).toEqual(expect.arrayContaining(['DRS', 'Battery bar']));
    expect(terms(2019)).toContain('Virtual safety car');
    expect(terms(2026)).toContain('Active aero');
    expect(terms(2026)).not.toContain('DRS');
    for (const entry of raceGuide(sessionRules(2019, 'race'))) expect(entry.meaning.length).toBeGreaterThan(20);
  });
});
