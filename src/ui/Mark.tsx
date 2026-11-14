import markSvg from '../assets/mark.svg?raw';

/** The game's mark: its own racing car, seen from above as in the race view. */
export const Mark = () => <span class="brand__mark" dangerouslySetInnerHTML={{ __html: markSvg }} />;
