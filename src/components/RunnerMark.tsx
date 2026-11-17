import { useEffect, useRef } from "react";
import "./runner.css";

// The Jawlei mark as a running figure, in white and pixelated: it is painted on a tiny canvas (hard edges, no soft
// pixels) that is shown scaled up. The three shapes (body and arms, one leg, the head) are posed in steps, so the figure
// bobs, the leg swings and the head bounces, like a few frames of a running animation.
const BODY = new Path2D("M1879.89,663.84c-11.5,141.39-285.29,144.42-386.87,140.59-68.84-2.58-157.25-26.33-219.23,8.23-105.8,58.98-187.82,277.37-252.06,383.05-130.51,214.71-343.66,369.95-602.21,382.83-278.35,13.88-345.42-256.84-139.04-421.84,52.51-42,179.33-105.36,240.86-56.45,50.62,40.26-22.81,113.39,31.34,141.22,54.97,28.26,158.94-33.33,203.23-67.11,113.62-86.66,201.47-225.51,231.09-365.68,10.22-48.37,30.24-155.28-38.98-166.27-147.68-23.42-263.94,247.99-397.18,179.09-60.57-31.31-32.01-110.82,2.77-151.43,58.14-67.86,212.98-128.54,297.83-159.95,37.53-13.88,85.18-32.68,124.75-35.83,114.31-9.09,148.96,81.74,229.82,135.44,168.4,111.83,335.2-9.99,503.61-39.52,74.83-13.14,178.71-9.81,170.29,93.63Z");
const LEG = new Path2D("M1522.92,1087.96c-1.35,73.5-98.46,143.32-152.46,183.28-70.23,51.99-169.15,122.45-246.02,161.43-30.02,15.21-81.04,31.47-105.92-.35-30.93-39.55,20.72-87.36,45.95-113.53,41.22-42.76,86.74-82.28,126.7-126.16,23.08-25.33,61.5-69.4,63.29-104.67,2.88-56.93-80.92-79.16-41.82-142.29,29.83-48.18,106.9-64.89,158.33-47.94,62.41,20.55,153.19,122.22,151.94,190.24Z");
const HEAD = new Path2D("M1505.75,498.18c-50.17,132.69-244.96,143.68-315.32,21.67-58.21-100.91,15.64-223.54,125.97-237.39,123.12-15.46,236.34,91.45,189.36,215.72Z");

const VIEW = { x: 30, y: 150, w: 1980, h: 1560 }; // the figure plus spare room all round, so the bob and the head bounce never push any of it out of the picture
const COLS = 40; // squares across: bigger number = finer pixels
const ROWS = Math.round((COLS * VIEW.h) / VIEW.w);
const STEP = 0.11; // seconds per pose

const rot = (ctx: CanvasRenderingContext2D, cx: number, cy: number, deg: number) => {
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
};

function pose(ctx: CanvasRenderingContext2D, n: number) {
  const k = COLS / VIEW.w;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, COLS, ROWS);
  ctx.fillStyle = "#fff";

  // the whole figure bobs and leans over a four-pose stride
  const bob = [
    { y: -40, r: -2.5 },
    { y: 25, r: 0 },
    { y: -40, r: 2.5 },
    { y: 25, r: 0 },
  ][n % 4];
  const legSwing = n % 4 < 2 ? -14 : 14;
  const bodySwing = n % 4 < 2 ? 3 : -3;
  const headBounce = n % 2 === 0 ? -17 : 13;

  const base = () => {
    ctx.setTransform(k, 0, 0, k, -VIEW.x * k, -VIEW.y * k);
    ctx.translate(0, bob.y);
    rot(ctx, 1020, 930, bob.r);
  };

  ctx.save();
  base();
  rot(ctx, 1360, 1000, bodySwing);
  ctx.fill(BODY);
  ctx.restore();

  ctx.save();
  base();
  ctx.translate(legSwing > 0 ? 14 : -14, 0);
  rot(ctx, 1480, 1130, legSwing);
  ctx.fill(LEG);
  ctx.restore();

  ctx.save();
  base();
  ctx.translate(0, headBounce);
  ctx.fill(HEAD);
  ctx.restore();

  // hard pixels: every square is either fully there or not at all
  const img = ctx.getImageData(0, 0, COLS, ROWS);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}

export default function RunnerMark() {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = cv.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pose(ctx, 1);
      return;
    }
    let raf = 0;
    let shown = -1;
    const start = performance.now();
    const frame = (now: number) => {
      const n = Math.floor((now - start) / 1000 / STEP);
      if (n !== shown) {
        shown = n;
        pose(ctx, n);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={cv} className="runner" width={COLS} height={ROWS} aria-hidden="true" />;
}