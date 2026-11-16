import type { PartId } from '../../game/team';

/**
 * A flat drawing of each part of the car: solid shapes in the game's greys, with the team's colour
 * on one piece. Drawn for this game; sized by the box it is put in.
 */
export function PartArt({ part, class: className }: { part: PartId; class?: string }) {
  return (
    <svg class={`art${className ? ` ${className}` : ''}`} viewBox="0 0 120 80" aria-hidden="true">
      {ART[part]}
    </svg>
  );
}

const ART: Readonly<Record<PartId, preact.JSX.Element>> = {
  // A rear wing from behind: endplates, the main plane, the flap that opens, the pylon.
  aero: (
    <>
      <rect class="art__dark" x="54" y="40" width="12" height="28" rx="2" />
      <rect class="art__body" x="28" y="64" width="64" height="6" rx="3" />
      <rect class="art__body" x="12" y="10" width="10" height="54" rx="3" />
      <rect class="art__body" x="98" y="10" width="10" height="54" rx="3" />
      <rect class="art__light" x="22" y="33" width="76" height="9" rx="3" />
      <rect class="art__accent" x="22" y="18" width="76" height="8" rx="3" />
      <rect class="art__ground" x="22" y="28" width="76" height="2" />
      <rect class="art__dark" x="15" y="16" width="4" height="40" rx="2" />
      <rect class="art__dark" x="101" y="16" width="4" height="40" rx="2" />
    </>
  ),
  // The car from the side: the body round the driver, the floor and the wheels.
  chassis: (
    <>
      <path class="art__body" d="M6 54 C 18 50 34 44 46 42 L 58 38 C 66 30 80 28 92 32 L 112 44 L 112 56 L 6 56 Z" />
      <rect class="art__dark" x="16" y="56" width="96" height="4" rx="2" />
      <path class="art__accent" d="M 40 50 L 96 46 L 100 50 L 44 53 Z" />
      <path class="art__dark" d="M 50 41 C 54 36 60 35 64 37 L 62 41 Z" />
      <path class="art__line" d="M 46 40 C 52 30 62 30 66 36" />
      <rect class="art__dark" x="66" y="26" width="10" height="8" rx="3" />
      <circle class="art__dark" cx="26" cy="58" r="12" />
      <circle class="art__light" cx="26" cy="58" r="4" />
      <circle class="art__dark" cx="98" cy="58" r="13" />
      <circle class="art__light" cx="98" cy="58" r="4.5" />
    </>
  ),
  // A V engine from the front: two banks of cylinders over the crankcase, the intakes between.
  engine: (
    <>
      <path class="art__body" d="M 38 50 L 16 22 L 30 12 L 54 42 Z" />
      <path class="art__body" d="M 82 50 L 104 22 L 90 12 L 66 42 Z" />
      <path class="art__accent" d="M 17 20 L 29 12 L 33 17 L 21 25 Z" />
      <path class="art__accent" d="M 103 20 L 91 12 L 87 17 L 99 25 Z" />
      <rect class="art__dark" x="50" y="24" width="20" height="22" rx="3" />
      <rect class="art__light" x="53" y="16" width="5" height="12" rx="2" />
      <rect class="art__light" x="62" y="16" width="5" height="12" rx="2" />
      <rect class="art__body" x="36" y="44" width="48" height="22" rx="5" />
      <rect class="art__ground" x="40" y="54" width="40" height="2" />
      <rect class="art__dark" x="46" y="66" width="28" height="6" rx="2" />
      <path class="art__line" d="M 30 46 C 22 52 20 60 24 70" />
      <path class="art__line" d="M 90 46 C 98 52 100 60 96 70" />
    </>
  ),
  // The battery: a pack of cells with its terminals, and a bolt.
  battery: (
    <>
      <rect class="art__light" x="28" y="14" width="12" height="8" rx="2" />
      <rect class="art__light" x="80" y="14" width="12" height="8" rx="2" />
      <rect class="art__body" x="14" y="20" width="92" height="48" rx="7" />
      <rect class="art__dark" x="14" y="20" width="92" height="9" rx="4" />
      <rect class="art__ground" x="33" y="33" width="2" height="31" />
      <rect class="art__ground" x="85" y="33" width="2" height="31" />
      <path class="art__accent" d="M 64 31 L 48 50 L 59 50 L 55 64 L 72 43 L 61 43 Z" />
    </>
  ),
  // Energy recovery: the motor-generator, with its shaft, and energy flowing back in.
  recovery: (
    <>
      <path class="art__accent-line" d="M 22 30 A 30 30 0 0 1 72 18" />
      <path class="art__accent" d="M 70 10 L 80 19 L 68 25 Z" />
      <path class="art__accent-line" d="M 78 58 A 30 30 0 0 1 28 70" />
      <path class="art__accent" d="M 30 78 L 20 69 L 32 63 Z" />
      <rect class="art__light" x="68" y="40" width="40" height="8" rx="3" />
      <circle class="art__body" cx="50" cy="44" r="22" />
      <circle class="art__dark" cx="50" cy="44" r="14" />
      <circle class="art__light" cx="50" cy="44" r="5" />
      <rect class="art__ground" x="49" y="22" width="2" height="7" />
      <rect class="art__ground" x="49" y="59" width="2" height="7" />
      <rect class="art__ground" x="28" y="43" width="7" height="2" />
      <rect class="art__ground" x="65" y="43" width="7" height="2" />
    </>
  ),
};
