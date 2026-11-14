import type { CircuitFact } from '../game/data';

/**
 * A circuit drawn from above as a single line, north up, with a dot on the start line.
 * The drawing scales to whatever box it is given.
 */
export function TrackOutline({ circuit, stroke = 3 }: { circuit: CircuitFact; stroke?: number }) {
  const { outline } = circuit;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < outline.length; i += 2) {
    minX = Math.min(minX, outline[i]!);
    maxX = Math.max(maxX, outline[i]!);
    minY = Math.min(minY, outline[i + 1]!);
    maxY = Math.max(maxY, outline[i + 1]!);
  }
  // Fit the longer side to 100 units, leaving room for the line's own thickness.
  const scale = (100 - stroke * 2) / Math.max(maxX - minX, maxY - minY);
  const x = (value: number) => (50 + (value - (minX + maxX) / 2) * scale).toFixed(1);
  const y = (value: number) => (50 - (value - (minY + maxY) / 2) * scale).toFixed(1);
  let path = '';
  for (let i = 0; i < outline.length; i += 2) path += `${i ? 'L' : 'M'}${x(outline[i]!)},${y(outline[i + 1]!)}`;
  return (
    <svg class="track" viewBox="0 0 100 100" role="img" aria-label={`Outline of ${circuit.fullName}`}>
      <path d={`${path}Z`} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linejoin="round" />
      <circle cx={x(outline[0]!)} cy={y(outline[1]!)} r={stroke * 1.5} fill="var(--accent)" />
    </svg>
  );
}
