"use client";

import { useEffect, useRef } from "react";

// The product backdrop, ported from the website's marketing hero
// (portals/website AnimatedHeroBg.tsx) so karda's ground reads as the same
// family as vxture.com - a drifting particle field that links neighbours into
// a graph, which is also exactly what this product is.
//
// Owner tuning against the website original (2026-08-24):
//   · dots LIGHTER and FEWER - density divisor 8500 -> 16000, node alpha
//     0.4+0.4*pulse -> 0.16+0.14*pulse;
//   · links LONGER - 150 -> 230px, so the graph reads as a web rather than
//     clusters;
//   · strokes stay hairline - lineWidth 0.5, alpha capped at 0.14.
// The scan line is dropped: it belongs to a hero that is looked at, not to a
// working surface that is looked THROUGH.
//
// Cost: the original is O(n^2) per frame, so the cuts matter twice - fewer
// nodes shrink the pair loop quadratically. It also pauses when the tab is
// hidden and stops entirely under prefers-reduced-motion (one static frame is
// drawn first, so the backdrop is present either way).
//
// Colours come from DS vars as bare channel triples: the canvas builds
// `rgb(R G B / a)` strings, and T1 scales are oklch() - interpolating those
// into rgb() yields an invalid colour and the canvas silently draws nothing
// (the website hit this; hence the literals there too).
const NODE_RGB = "37 99 235";
const LINE_RGB = "99 102 241";
const NODE_RGB_DARK = "147 197 253";
const LINE_RGB_DARK = "147 197 253";

export function ShellBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let running = false;
    let width = 0;
    let height = 0;

    interface Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      phase: number;
    }
    let nodes: Node[] = [];

    const isDark = () => document.documentElement.classList.contains("dark");

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Sparser than the hero (8500): this sits under working content.
      const count = Math.max(18, Math.floor((width * height) / 16000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.4 + 0.5,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const LINK_DIST = 230;
    const LINK_DIST_SQ = LINK_DIST * LINK_DIST;

    const renderFrame = () => {
      const dark = isDark();
      const nodeRgb = dark ? NODE_RGB_DARK : NODE_RGB;
      const lineRgb = dark ? LINE_RGB_DARK : LINE_RGB;
      ctx.clearRect(0, 0, width, height);

      for (const n of nodes) {
        n.phase += 0.01;
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }

      // Links first, under the nodes. Square-distance filter before sqrt, as
      // in the original - most pairs never need the root.
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dsq = dx * dx + dy * dy;
          if (dsq < LINK_DIST_SQ) {
            const d = Math.sqrt(dsq);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgb(${lineRgb} / ${(1 - d / LINK_DIST) * (dark ? 0.16 : 0.14)})`;
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const pulse = Math.sin(n.phase) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * (1 + pulse * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${nodeRgb} / ${(dark ? 0.2 : 0.16) + pulse * 0.14})`;
        ctx.fill();
      }
    };

    const loop = () => {
      if (!running) return;
      renderFrame();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || prefersReduced || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    resize();
    // One static frame up front: the backdrop exists before the first tick,
    // and is the final state when motion is reduced.
    renderFrame();
    start();

    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => {
      resize();
      renderFrame();
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    // Re-tint on theme change: the palette is read per frame, but a static
    // (reduced-motion) backdrop needs an explicit repaint.
    const themeObserver = new MutationObserver(() => renderFrame());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas ref={canvasRef} className="size-full" />
    </div>
  );
}
