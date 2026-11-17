import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import RunnerMark from "./RunnerMark";
import { createLiquidReveal, createLiquidWipe, randomPhases, TOTAL_MS } from "./liquid";

// Shown when a message has been sent: the liquid rainbow blob (same as the menu) swells over the whole screen, a green
// pixel tick pops in the middle, and after a moment the blob closes back out. onCovered fires once the screen is fully
// covered (the page can change behind it); onDone fires when it has closed.
// the tick as rows of squares: [x, y, width] on a 12 x 8 grid
const TICK = [[10, 0, 2], [9, 1, 3], [8, 2, 3], [0, 3, 2], [7, 3, 3], [0, 4, 3], [6, 4, 3], [1, 5, 3], [5, 5, 3], [2, 6, 5], [3, 7, 3]];
const CELLS: [number, number][] = TICK.flatMap(([x, y, w]) => Array.from({ length: w }, (_, k) => [x + k, y] as [number, number])).sort((a, b) => a[0] - b[0] || a[1] - b[1]); // every square of the tick, left to right
const DRAW_MS = 650; // the tick draws itself in this long...
const POP_MS = 350; // ...then pops: it swells and settles in a few hard steps
const POP = [1.1, 1.22, 1.14, 1.06, 1.02];
const HOLD_MS = 1900; // how long the tick stays on a fully covered screen

// With tick = false it is a plain page transition (the blob covers the screen, the page changes behind it, the blob closes out).
export default function SentOverlay({ onCovered, onDone, tick = true, hold = HOLD_MS }: { onCovered: () => void; onDone: () => void; tick?: boolean; hold?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runner = useRef<HTMLDivElement>(null); // the running figure of a plain page change
  const [size] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cb = useRef({ onCovered, onDone });
  cb.current = { onCovered, onDone };

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    const phases = randomPhases();
    // a plain page change shows only the rainbow (no white page in it, so nothing white covers the new page); the sent animation reveals a white page with the tick
    const wipe = tick ? null : createLiquidWipe(cv, size.w, size.h, dpr, phases);
    const reveal = tick ? createLiquidReveal(cv, size.w, size.h, dpr, phases) : null;
    const paint = (p: number, t: number, content: HTMLCanvasElement) => (wipe ? wipe(p, t) : reveal!(p, t, content));
    // the white page with the green tick on it: the blob reveals this, so the tick sits UNDER the rainbow edge
    const page = document.createElement("canvas");
    page.width = cv.width;
    page.height = cv.height;
    const pc = page.getContext("2d")!;
    pc.fillStyle = "#fff";
    pc.fillRect(0, 0, page.width, page.height);
    // The tick is drawn square by square, left to right, then pops (a few hard size steps) once it is complete.
    const cell = ((size.w > size.h ? size.w * 0.16 : size.w * 0.4) / 12) * dpr;
    const drawTick = (count: number, scale: number) => {
      pc.fillStyle = "#fff";
      pc.fillRect(0, 0, page.width, page.height);
      pc.fillStyle = "#2fd37a";
      const mx = page.width / 2;
      const my = page.height / 2;
      for (let i = 0; i < Math.min(count, CELLS.length); i++) {
        const [x, y] = CELLS[i];
        const l = Math.round(mx + (x - 6) * cell * scale);
        const t = Math.round(my + (y - 4) * cell * scale);
        const r = Math.round(mx + (x + 1 - 6) * cell * scale);
        const b = Math.round(my + (y + 1 - 4) * cell * scale);
        pc.fillRect(l, t, r - l, b - t);
      }
    };
    if (tick) drawTick(0, 1);    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = reduced ? 1 : 1 / TOTAL_MS;
    let progress = 0;
    let dir = 1; // 1 = opening, 0 = holding, -1 = closing
    let holdUntil = 0;
    let last = performance.now();
    let tickAt = 0; // when the tick started drawing
    let raf = 0;
    if (reduced && tick) drawTick(CELLS.length, 1);
    const frame = () => {
      const now = performance.now();
      const dt = Math.max(0, now - last);
      last = now;
      if (dir === 1) {
        progress = Math.min(1, progress + dt * speed);
        if (progress >= 1) {
          cb.current.onCovered();
          dir = 0;
          holdUntil = now + hold;
        }
      } else if (dir === 0) {
        if (now >= holdUntil) {
          dir = -1;
        }
      } else {
        progress = Math.max(0, progress - dt * speed);
        if (progress <= 0) {
          cb.current.onDone();
          return;
        }
      }
      if (!reduced && tick) {
        if (!tickAt && progress >= 0.72) tickAt = now; // starts as the white reaches the middle
        if (tickAt) {
          const draw = Math.min(1, (now - tickAt) / DRAW_MS);
          const pop = Math.min(1, Math.max(0, (now - tickAt - DRAW_MS) / POP_MS));
          drawTick(Math.ceil(draw * CELLS.length), pop < 1 ? POP[Math.floor(pop * POP.length)] : 1);
        }
      }
      runner.current?.classList.toggle("on", progress >= 0.4); // eases in once the rainbow covers the middle, and out again as it closes
      paint(progress, now / 1000, page);
      raf = requestAnimationFrame(frame);
    };
    paint(0, now(), page);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the page still behind it
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const keys = (e: KeyboardEvent) => {
      if ([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
    };
    document.addEventListener("wheel", block, { passive: false });
    document.addEventListener("touchmove", block, { passive: false });
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("wheel", block);
      document.removeEventListener("touchmove", block);
      document.removeEventListener("keydown", keys);
    };
  }, []);

  return createPortal(
    <div className="sent-ov" role="status" aria-label="Message sent">
      <canvas ref={canvas} className="sent-liquid" aria-hidden="true" />
      {!tick && (
        <div ref={runner} className="sent-runner">
          <RunnerMark />
        </div>
      )}
    </div>,
    document.body,
  );
}

const now = () => performance.now() / 1000;
