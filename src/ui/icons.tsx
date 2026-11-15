/** The app's few icons: 20px outlines, drawn in the current text colour. */

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.6,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': true,
} as const;

export const IconBack = () => (
  <svg {...base}>
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </svg>
);

export const IconMore = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <circle cx="4.5" cy="10" r="1.5" />
    <circle cx="10" cy="10" r="1.5" />
    <circle cx="15.5" cy="10" r="1.5" />
  </svg>
);

export const IconPause = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <rect x="5" y="4.5" width="3.4" height="11" rx="1" />
    <rect x="11.6" y="4.5" width="3.4" height="11" rx="1" />
  </svg>
);

/** Skip to the end: play, into a wall. */
export const IconSkip = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M4.5 5.2v9.6a.6.6 0 0 0 .93.5l7.1-4.8a.6.6 0 0 0 0-1L5.43 4.7a.6.6 0 0 0-.93.5Z" />
    <rect x="13.4" y="4.5" width="2.6" height="11" rx="1" />
  </svg>
);

export const IconForward = () => (
  <svg {...base}>
    <path d="M7.5 4.5 13 10l-5.5 5.5" />
  </svg>
);

/** A question mark in a ring: what does this mean? */
export const IconHelp = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M7.9 7.7a2.2 2.2 0 1 1 3.2 2c-.7.4-1.1.9-1.1 1.6v.4" />
    <circle cx="10" cy="14.2" r=".6" fill="currentColor" />
  </svg>
);

/** Settings: a gear. */
export const IconSettings = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    <circle cx="10" cy="10" r="5.4" />
  </svg>
);

/** Sound on: a speaker with waves. */
export const IconSound = () => (
  <svg {...base}>
    <path d="M3.5 7.8h2.6L10 4.6v10.8l-3.9-3.2H3.5Z" />
    <path d="M13 7.4a3.6 3.6 0 0 1 0 5.2M15.2 5.4a6.4 6.4 0 0 1 0 9.2" />
  </svg>
);

/** Sound off: a speaker, crossed out. */
export const IconMuted = () => (
  <svg {...base}>
    <path d="M3.5 7.8h2.6L10 4.6v10.8l-3.9-3.2H3.5Z" />
    <path d="m13 7.8 4.2 4.4M17.2 7.8 13 12.2" />
  </svg>
);
