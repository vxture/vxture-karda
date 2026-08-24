// The product backdrop: a fixed, non-scrolling, non-interactive wash behind
// every portal surface (owner 2026-08-24 - product-global, not one page).
//
// Cost discipline, because this sits under every screen:
//   · one <svg> with a <pattern> dot grid - patterns tile on the GPU and cost
//     nothing to repaint; no filters, no feGaussianBlur over a full viewport;
//   · two soft radial washes that drift on `transform` only (composited, no
//     layout/paint per frame), 54s and 68s so the motion reads as ambient
//     rather than animation, and stops entirely under prefers-reduced-motion;
//   · everything painted from DS colour vars, so it re-themes with the app and
//     never needs a second dark-mode asset.
//
// Opacities are deliberately near the floor: the backdrop must be sensed, not
// seen - every panel above it is translucent, so anything louder would read
// through the content.
export function ShellBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* knowledge-graph dot grid */}
      <svg className="size-full opacity-[0.35]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="karda-grid" width="44" height="44" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill="var(--color-primary)" fillOpacity="0.10" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#karda-grid)" />
      </svg>

      {/* two slow brand/ai washes */}
      <div
        className="karda-drift-a absolute -left-[10%] -top-[15%] size-[70vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent)",
        }}
      />
      <div
        className="karda-drift-b absolute -bottom-[20%] -right-[10%] size-[65vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--color-ai) 10%, transparent), transparent)",
        }}
      />
    </div>
  );
}
