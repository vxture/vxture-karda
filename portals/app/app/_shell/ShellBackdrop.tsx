// The product backdrop: a fixed, non-scrolling, non-interactive layer behind
// every portal surface (owner 2026-08-24 - product-global, not one page).
//
// It draws what this product IS: a knowledge graph - nodes joined by edges,
// drifting slowly, a few of them pulsing as if being consulted. That reads as
// karda rather than as generic decoration.
//
// Cost discipline, because this sits under every screen:
//   · ONE inline <svg>, ~40 primitives, no filters (no feGaussianBlur over a
//     viewport - that is the expensive thing people reach for and regret);
//   · motion is CSS on transform/opacity only - composited, no layout, no
//     per-frame repaint of the graph itself;
//   · everything painted from DS colour vars, so it re-themes with the app and
//     never needs a second dark-mode asset;
//   · all motion stops under prefers-reduced-motion (globals.css).
//
// Visible, not loud: the graph sits at low alpha and every panel above it is
// translucent, so the page reads as sitting ON something without the content
// ever competing with it.

/** Node positions on a 0-1000 x 0-1000 viewBox, laid out as a loose graph. */
const NODES: [number, number, number][] = [
  // x, y, r
  [120, 180, 5],
  [300, 120, 3.5],
  [460, 240, 6],
  [220, 380, 4],
  [560, 90, 3],
  [700, 200, 5],
  [840, 130, 3.5],
  [620, 400, 4.5],
  [880, 330, 5],
  [160, 620, 4.5],
  [360, 560, 3.5],
  [520, 680, 5.5],
  [760, 600, 4],
  [900, 720, 3.5],
  [280, 820, 4],
  [640, 880, 4.5],
  [420, 940, 3],
  [820, 900, 3.5],
];

/** Edges as node-index pairs - a sparse graph, not a mesh. */
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [2, 3], [1, 4], [4, 5], [5, 6], [2, 7],
  [5, 7], [6, 8], [7, 8], [3, 9], [9, 10], [10, 11], [7, 11], [11, 12],
  [12, 13], [8, 12], [9, 14], [14, 15], [11, 15], [15, 16], [13, 17], [15, 17],
];

/** The few nodes that pulse - "being consulted right now". */
const PULSING = new Set([2, 7, 11, 5, 15]);

export function ShellBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* two slow brand / ai washes, giving the plane depth */}
      <div
        className="karda-drift-a absolute -left-[15%] -top-[20%] size-[75vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--color-primary) 26%, transparent), transparent)",
        }}
      />
      <div
        className="karda-drift-b absolute -bottom-[25%] -right-[15%] size-[70vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--color-ai) 22%, transparent), transparent)",
        }}
      />

      {/* the knowledge graph */}
      <svg
        className="karda-graph absolute inset-0 size-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
      >
        <g className="karda-graph-drift">
          {EDGES.map(([a, b], i) => (
            <line
              key={`e${i}`}
              x1={NODES[a][0]}
              y1={NODES[a][1]}
              x2={NODES[b][0]}
              y2={NODES[b][1]}
              stroke="var(--color-primary)"
              strokeOpacity="0.16"
              strokeWidth="1.1"
            />
          ))}
          {NODES.map(([x, y, r], i) => (
            <circle
              key={`n${i}`}
              cx={x}
              cy={y}
              r={r}
              fill="var(--color-primary)"
              fillOpacity={PULSING.has(i) ? 0.55 : 0.3}
              className={PULSING.has(i) ? "karda-node-pulse" : undefined}
              style={PULSING.has(i) ? { animationDelay: `${(i % 5) * 1.6}s` } : undefined}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
