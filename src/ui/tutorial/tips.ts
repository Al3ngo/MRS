/**
 * The tutorial's tips: short pop-ups that walk a new career through its first race weekend and the
 * management phase after it, each pointing at the part of the screen it explains. A career shows
 * each tip once (the game keeps which, in the save); the settings can replay them.
 *
 * Each screen lists the tips that belong to it, in order, and shows the first one not yet seen.
 */
import type { CareerState } from '../../game/career';

export interface Tip {
  id: string;
  title: string;
  lines: readonly string[];
  /** A CSS selector for what the tip is about: it is lit up, and the rest of the screen dimmed. */
  target?: string;
}

/** The next tip to show of a screen's list, or null when the career has seen them all. */
export function nextTip(career: CareerState, tips: readonly Tip[]): Tip | null {
  if (career.tutorial.off) return null;
  return tips.find((tip) => !career.tutorial.seen.includes(tip.id)) ?? null;
}

const ACTION = '.actionbar .button--primary';

// ── The team's home ─────────────────────────────────────────────────────────────────────────

export function hubTips(career: CareerState, place: { tab: string; winterStep: string | null }): Tip[] {
  const tips: Tip[] = [];
  const between = career.phase === 'management';
  if (place.tab === 'Car') {
    tips.push({
      id: 'garage',
      title: 'Developing the car',
      lines: [
        'Spend money here on the car, between races. An upgrade is cheap and gains a little; a new version costs more and gains much more, but breaks down more at first.',
        'The bars at the top compare your car with the rest of the field.',
      ],
      target: 'section[aria-labelledby="parts"]',
    });
    return tips;
  }
  if (place.tab !== 'Weekend') return tips;

  tips.push({
    id: 'welcome',
    title: 'Your team',
    lines: [
      'This is your team’s home. A season is a run of race weekends: practice, qualifying, then the race. Between races, you run the team.',
      'The tabs hold the car, the season’s calendar and the championships.',
    ],
    target: '.hub .title-row',
  });
  if (place.winterStep === 'sponsor') {
    tips.push({
      id: 'sponsor',
      title: 'First, a sponsor',
      lines: [
        'Before the season starts, sign a title sponsor. A steady deal pays well just for racing; a bold one pays little, but much more for good results.',
      ],
      target: ACTION,
    });
  }
  if (place.winterStep !== null) return tips;

  if (!between) {
    tips.push(
      {
        id: 'money',
        title: 'Money',
        lines: [
          'The sponsor and the prize money pay after every race. Money pays the drivers and staff, and buys new parts for the car.',
        ],
        target: 'section[aria-labelledby="money"]',
      },
      {
        id: 'go',
        title: 'Off to the circuit',
        lines: ['The button at the bottom always takes you to what comes next. First, practice.'],
        target: ACTION,
      },
    );
    return tips;
  }

  // The management phase, after a race.
  tips.push({
    id: 'between',
    title: 'Between races',
    lines: ['How the race went, and what it earned. Now is the time to run the team, before the next race.'],
    target: 'section[aria-labelledby="last-round"]',
  });
  if (career.outfit && career.outfit.challengeOffers.length > 0) {
    tips.push({
      id: 'challenge',
      title: 'Sponsor challenges',
      lines: ['Take on one challenge for the next race, for extra money. It pays only if it comes off.'],
      target: 'section[aria-labelledby="sponsor"]',
    });
  }
  tips.push(
    {
      id: 'car-tab',
      title: 'Develop the car',
      lines: ['The Car tab is where the money goes on new parts. The car can only be worked on between races.'],
      target: '.tabs .tab:nth-child(2)',
    },
    {
      id: 'basics',
      title: 'That is the basics',
      lines: [
        'Go to the next race when you are ready. Everything else you learn as you go.',
        'The tutorial can be replayed from the settings: the gear at the top of this screen.',
      ],
      target: ACTION,
    },
  );
  return tips;
}

// ── The weekend ─────────────────────────────────────────────────────────────────────────────

export function practiceTips(driven: boolean): Tip[] {
  const tips: Tip[] = [
    {
      id: 'practice',
      title: 'Practice',
      lines: [
        'Three settings decide how well the car suits this circuit. Each car has its own.',
        'Do a run, and the driver says which way to move each setting.',
      ],
      target: 'section[aria-label^="Setup of"]',
    },
  ];
  if (driven) {
    tips.push(
      {
        id: 'arrows',
        title: 'Reading the driver',
        lines: [
          'Each arrow starts at the setting the car ran with, and points the way to move it. A long arrow means a big change.',
          'Move the settings, run again, and keep going until the driver says spot on.',
        ],
        target: '.dial',
      },
      {
        id: 'practice-done',
        title: 'When you are happy',
        lines: ['Finish practice. A better setup makes the car quicker for the rest of the weekend.'],
        target: ACTION,
      },
    );
  }
  return tips;
}

export const QUALIFYING_TIPS: readonly Tip[] = [
  {
    id: 'qualifying',
    title: 'Qualifying',
    lines: [
      'Qualifying sets the starting order, in three parts. After each of the first two, the slowest cars are knocked out.',
      'Choose how hard each driver pushes. Push is a little faster, but a mistake can ruin the lap.',
    ],
    target: 'section[aria-labelledby="quali-approach"]',
  },
];

export const BRIEFING_TIPS: readonly Tip[] = [
  {
    id: 'briefing',
    title: 'The briefing',
    lines: [
      'Before each race: what stands out about the circuit, the tyres, and the chance of rain in each part of the race. Further off, the forecast is less sure.',
    ],
    target: '.briefing__weather',
  },
];

export const GRID_TIPS: readonly Tip[] = [
  {
    id: 'grid',
    title: 'The race plan',
    lines: [
      'Each car starts with the team’s plan: which tyres, and when to stop. Change it here if you like, and again during the race.',
      'Then start the race and run it yourself, or skip to the result and let the team make the calls.',
    ],
    target: 'section[aria-labelledby="grid-plan"]',
  },
];

export function raceTips(hasBattery: boolean): Tip[] {
  return [
    {
      id: 'race',
      title: 'The race',
      lines: [
        'Every car on the circuit; yours are ringed and named. The weather the team expects runs along the edge.',
        'The race is paused while you read this.',
      ],
      target: '.race__map',
    },
    {
      id: 'tower',
      title: 'The running order',
      lines: ['Places, the gap to the car ahead, each car’s tyres and how worn they are, and its stops so far.'],
      target: '.tower',
    },
    {
      id: 'cars',
      title: 'Your cars',
      lines: [
        'Tap a car to give it orders. Its graph shows how long the tyres and the fuel will last.',
      ],
      target: '.pitwall__cars',
    },
    {
      id: 'push',
      title: 'How hard to push',
      lines: [
        'Pushing is faster, but the tyres wear sooner, mistakes get likelier and the driver gets stressed. Conserve looks after all three.',
        hasBattery ? 'The engine and battery modes trade fuel and electric power for speed in the same way.' : 'The engine mode trades fuel for speed in the same way.',
      ],
      target: '.pitwall',
    },
    {
      id: 'pit',
      title: 'Pit stops and speed',
      lines: [
        'The team plans the stops. Call one yourself when the tyres are worn or the weather turns.',
        'Pause, speed up or skip to the end at the bottom right. The question mark at the top explains everything here.',
      ],
      target: '.dock',
    },
  ];
}

export const RESULT_TIPS: readonly Tip[] = [
  {
    id: 'result',
    title: 'The result',
    lines: ['The best finishers score points for both championships. Continue, and the team’s money from the race comes in.'],
    target: 'section[aria-label="Result"]',
  },
];
