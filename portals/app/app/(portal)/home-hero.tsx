"use client";

import { useEffect, useRef } from "react";

// 首页 hero 的画布。
//
// 与外壳的 `ShellBackdrop` 是同一族形状——漂移的点被连成图——但**参数不同,而且必须
// 不同**:外壳那一层是被「看穿」的地(节点稀、连线淡、alpha 上限 0.14),这一层是
// 被「看」的第一屏。同一套参数放在这里会淡到看不见,而把外壳调到这里的浓度会让每一页
// 的正文都在噪声上读。
//
// 所以这里另起一个画布,而不是给 ShellBackdrop 加一个 `variant`:两者唯一共享的是
// 「点连成图」这个概念,而参数、尺寸、生命周期全不一样,合成一个组件只会得到一个
// 到处是 if 的东西。
//
// 三条与外壳一致的纪律,不重新决定:
//   · `prefers-reduced-motion` 下只画一帧静态图,不是什么都不画——背景仍在,只是不动;
//   · 标签页隐藏时暂停,不空转;
//   · 颜色用**字面通道值**,不从 DS 变量读。这一条是 ShellBackdrop 用血写下的:
//     DS 的 T1 色阶是 `oklch()`,把它插进 `rgb(R G B / a)` 会得到一个非法颜色,
//     而画布**静默什么都不画**——没有报错,只有一片空白。明暗两套值按
//     `documentElement.classList.contains("dark")` 切,与外壳同一处判据。
// 字面通道值,理由见文件头。与 ShellBackdrop 同色系但更实——这一层是被看的。
const NODE_RGB = "37 99 235";
const LINE_RGB = "99 102 241";
const NODE_RGB_DARK = "147 197 253";
const LINE_RGB_DARK = "147 197 253";

export function HomeHero({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDark = () => document.documentElement.classList.contains("dark");
    let raf = 0;
    let stopped = false;


    type Node = { x: number; y: number; vx: number; vy: number; phase: number };
    let nodes: Node[] = [];
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 密度按面积给,不给固定个数:窄屏上固定个数会挤成一团。
      // 除数比外壳小(外壳 16000),因为这一层是要被看见的。
      const count = Math.min(90, Math.max(24, Math.round((w * h) / 9000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t: number) => {
      const dark = isDark();
      const nodeRgb = dark ? NODE_RGB_DARK : NODE_RGB;
      const linkRgb = dark ? LINE_RGB_DARK : LINE_RGB;
      ctx.clearRect(0, 0, w, h);

      // 连线先画,点后画——点压在线上,读起来是「节点」而不是「交叉」。
      // O(n²) 的那一层:节点上限 90,所以最坏 ~4000 次配对,可接受。
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d2 = dx * dx + dy * dy;
          const max = 200;
          if (d2 > max * max) continue;
          const alpha = (1 - Math.sqrt(d2) / max) * 0.22;
          ctx.strokeStyle = `rgb(${linkRgb} / ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }

      for (const n of nodes) {
        const pulse = (Math.sin(t / 1400 + n.phase) + 1) / 2;
        ctx.fillStyle = `rgb(${nodeRgb} / ${0.22 + 0.2 * pulse})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.4 + 0.5 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = (t: number) => {
      if (stopped) return;
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        // 撞边反弹而不是绕回:绕回会让一个点忽然出现在对面,读起来是闪烁。
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      draw(t);
      raf = requestAnimationFrame(step);
    };

    resize();
    draw(0);
    if (!reduced) raf = requestAnimationFrame(step);

    const onResize = () => {
      resize();
      draw(performance.now());
    };
    const onVisibility = () => {
      if (reduced) return;
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(step);
      }
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // `aria-hidden`:它不承载任何信息。一个读屏用户听到「画布」得不到任何东西,
  // 只会多一次打断。
  return <canvas ref={ref} aria-hidden className={className} />;
}
