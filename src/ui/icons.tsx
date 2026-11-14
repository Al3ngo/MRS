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
