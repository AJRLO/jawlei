import { useLayoutEffect, useRef } from "react";

// A layer of big white squares over a tile. When the tile scrolls into view the squares dissolve away at random,
// revealing it (the same idea as the pixel rise on the home page). There is no hover effect.
const CELL = 0.02; // square size as a share of the tile's width

export default function PixelCover({ rows: fixedRows }: { rows?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);

  // layout effect: the white squares are drawn before the first paint, so the tile never flashes uncovered
  useLayoutEffect(() => {
    const canvas = cv.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      canvas.style.display = "none";
      return;
    }

    // Every square is exactly square: pick the square's size in pixels first (from the width for tiles, from the height
    // for headings so they stay chunky), then use as many whole squares as it takes to cover the host.
    const w = host.clientWidth;
    const h = host.clientHeight;
    const cell = fixedRows ? h / fixedRows : w * CELL;
    const cols = Math.max(1, Math.ceil(w / cell - 0.001));
    const rows = Math.max(1, Math.ceil(h / cell - 0.001));
    canvas.width = cols;
    canvas.height = rows;
    canvas.style.width = `${cols * cell}px`;
    canvas.style.height = `${rows * cell}px`;
    // the last row/column of squares may overhang the host a little: clip it while the cover is showing
    const keepOverflow = host.style.overflow;
    host.style.overflow = "hidden";
    const restore = () => (host.style.overflow = keepOverflow);
    const rnd = Array.from({ length: cols * rows }, () => Math.random());

    let level = 1; // 1 = fully covered, 0 = revealed
    let last = 0;
    let raf = 0;

    const draw = () => {
      ctx.clearRect(0, 0, cols, rows);
      ctx.fillStyle = "#fff";
      for (let i = 0; i < rnd.length; i++) {
        if (rnd[i] < level) ctx.fillRect(i % cols, Math.floor(i / cols), 1, 1);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(64, now - (last || now)) / 1000;
      last = now;
      level = Math.max(0, level - dt / 0.75);
      draw();
      if (level > 0) raf = requestAnimationFrame(frame);
      else {
        canvas.style.display = "none";
        restore();
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          raf = requestAnimationFrame(frame);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(host);
    draw();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      restore();
    };
  }, []);

  return <canvas ref={cv} className="pixel-cover" aria-hidden="true" />;
}
