import { describe, expect, it } from 'vitest';
import { chooseTeam, endTutorial, findProblems, newCareer, replayTutorial, seeTip, type CareerState } from '../src/game/career';
import { MIGRATIONS, upgradeCareer } from '../src/game/save-schema';
import { BRIEFING_TIPS, GRID_TIPS, QUALIFYING_TIPS, RESULT_TIPS, hubTips, nextTip, practiceTips, raceTips } from '../src/ui/tutorial/tips';

const start = (): CareerState => chooseTeam(newCareer('career-1', new Date('2026-11-15T10:00:00Z')), 'williams');

describe('the tutorial', () => {
  it('is on for a new career, with nothing seen', () => {
    const career = start();
    expect(career.tutorial).toEqual({ seen: [], off: false });
    expect(findProblems(career)).toEqual([]);
  });

  it('shows a screen’s tips in order, each once', () => {
    let career = start();
    const tips = practiceTips(true);
    expect(nextTip(career, tips)?.id).toBe('practice');
    career = seeTip(career, 'practice');
    expect(nextTip(career, tips)?.id).toBe('arrows');
    career = seeTip(seeTip(career, 'arrows'), 'practice-done');
    expect(nextTip(career, tips)).toBeNull();
    // Seeing a tip twice changes nothing.
    expect(seeTip(career, 'arrows')).toBe(career);
  });

  it('shows no more tips once skipped, and all of them again once replayed', () => {
    const skipped = endTutorial(seeTip(start(), 'welcome'));
    expect(nextTip(skipped, QUALIFYING_TIPS)).toBeNull();
    const replayed = replayTutorial(skipped);
    expect(replayed.tutorial).toEqual({ seen: [], off: false });
    expect(nextTip(replayed, QUALIFYING_TIPS)?.id).toBe('qualifying');
  });

  it('starts at the sponsor before the first season, and points at the car between races', () => {
    const career = start();
    const winter = hubTips(career, { tab: 'Home', winterStep: 'sponsor' }).map((tip) => tip.id);
    expect(winter).toEqual(['welcome', 'sponsor']);
    const ready = hubTips(career, { tab: 'Home', winterStep: null }).map((tip) => tip.id);
    expect(ready).toEqual(['welcome', 'money', 'go']);
    const between = hubTips({ ...career, phase: 'management' }, { tab: 'Home', winterStep: null }).map((tip) => tip.id);
    expect(between).toContain('car-tab');
    expect(between.at(-1)).toBe('basics');
    expect(hubTips(career, { tab: 'Car', winterStep: null }).map((tip) => tip.id)).toEqual(['garage']);
  });

  it('gives every tip its own name, a title and something to say', () => {
    const career = start();
    const all = [
      ...hubTips(career, { tab: 'Home', winterStep: 'sponsor' }),
      ...hubTips(career, { tab: 'Home', winterStep: null }),
      ...hubTips({ ...career, phase: 'management', outfit: { ...career.outfit!, challengeOffers: [{} as never] } }, { tab: 'Home', winterStep: null }),
      ...hubTips(career, { tab: 'Car', winterStep: null }),
      ...practiceTips(true),
      ...QUALIFYING_TIPS,
      ...BRIEFING_TIPS,
      ...GRID_TIPS,
      ...raceTips(true),
      ...RESULT_TIPS,
    ];
    const unique = new Map(all.map((tip) => [tip.id, tip]));
    expect(unique.size).toBeGreaterThanOrEqual(20);
    for (const tip of unique.values()) {
      expect(tip.title.length).toBeGreaterThan(0);
      expect(tip.lines.length).toBeGreaterThan(0);
      // Short, as the brief asks: a pop-up, not a page.
      expect(tip.lines.join(' ').split(/\s+/).length, tip.id).toBeLessThanOrEqual(45);
    }
  });

  it('counts as done in a career saved before it existed, which can replay it', () => {
    const { tutorial: _tutorial, ...older } = start();
    const upgraded = MIGRATIONS[4]!(older) as CareerState;
    expect(upgraded.tutorial).toEqual({ seen: [], off: true });
    expect(upgradeCareer(older, 4).tutorial.off).toBe(true);
  });

  it('is checked when a save is loaded', () => {
    expect(findProblems({ ...start(), tutorial: { seen: 'all', off: false } })).toEqual(['The record of the tutorial is damaged.']);
    expect(findProblems({ ...start(), tutorial: undefined })).toEqual(['The record of the tutorial is damaged.']);
  });
});
