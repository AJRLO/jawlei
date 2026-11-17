import { useEffect, useMemo, useRef } from "react";

type RGB = [number, number, number];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const BLUE = hex("#0e3a8a");
const RED = hex("#8a0e40");

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
const smooth = (t: number) => t * t * (3 - 2 * t);

const PALETTES: RGB[][] = [
  [hex("#ffe600"), hex("#7dffb2"), hex("#2ec4ff")], // yellow > mint > sky
  [hex("#ff3ea5"), hex("#ff9a3c"), hex("#ffe600")], // hot pink > orange > yellow
  [hex("#2f6bff"), hex("#2ee6ff"), hex("#b6ff6a")], // blue > cyan > lime
  [hex("#b13cff"), hex("#ff4fd8"), hex("#ffb36b")], // violet > magenta > peach
  [hex("#00e0a0"), hex("#ffe600"), hex("#ff6ea8")], // green > yellow > pink
  [hex("#ff5a36"), hex("#ffd23f")], // red-orange > gold
  [hex("#3ef0d0"), hex("#4d7cff"), hex("#c24dff")], // aqua > blue > purple
  [hex("#ff7ad9"), hex("#ffe9a8")], // pink > cream
  [BLUE, hex("#2f6bff"), hex("#7de8ff")], // brand blue glow
  [RED, hex("#ff3ea5"), hex("#ffb36b")], // brand red glow
];

interface BlobSpec {
  id: number;
  cells: number; // silhouette resolution (bigger squares = chunkier edge)
  size: number; // rendered px
  x: number; // % of viewport
  y: number;
  stops: RGB[];
  opacity: number;
  floatDuration: number;
  floatDelay: number;
}

// Slots hug the edges so the centered logo stays clear.
const SLOTS: { x: [number, number]; y: [number, number] }[] = [
  { x: [-6, 10], y: [0, 24] },
  { x: [82, 98], y: [2, 26] },
  { x: [-4, 12], y: [34, 60] },
  { x: [84, 98], y: [36, 62] },
  { x: [0, 16], y: [66, 90] },
  { x: [78, 94], y: [64, 90] },
  { x: [34, 58], y: [76, 94] },
  { x: [28, 60], y: [-8, 4] },
  // closer to the center logo
  { x: [12, 28], y: [10, 30] },
  { x: [62, 78], y: [8, 28] },
  { x: [14, 30], y: [52, 70] },
  { x: [60, 76], y: [54, 72] },
];

// Places blobs one at a time (largest first) and rejects any spot that would overlap one
// already placed. If a blob can't fit, it shrinks and retries, and is dropped as a last resort.
function makeSpecs(): BlobSpec[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const unit = Math.min(vw, vh) / 900; // px per spec-size unit (sizes are in vmin)
  const placed: { cx: number; cy: number; r: number }[] = [];
  const specs: BlobSpec[] = [];

  const wanted = SLOTS.map((slot, i) => ({
    slot,
    i,
    size: 240 + 460 * Math.random() ** 1.2, // px at a 900px-tall viewport; scales with vmin
  })).sort((a, b) => b.size - a.size);

  for (const { slot, i, size: startSize } of wanted) {
    let size = startSize;
    let spot: { x: number; y: number; cx: number; cy: number; r: number } | null = null;

    while (!spot && size >= 150) {
      const r = size * unit * 0.36; // the visible shape fills roughly this radius
      for (let tries = 0; tries < 40 && !spot; tries++) {
        // first tries stay inside the slot; later ones may roam the whole screen
        const roam = tries > 20;
        const x = roam ? rand(-6, 92) : rand(slot.x[0], slot.x[1]);
        const y = roam ? rand(-6, 92) : rand(slot.y[0], slot.y[1]);
        const cx = (vw * x) / 100 + (size * unit) / 2;
        const cy = (vh * y) / 100 + (size * unit) / 2;
        if (placed.every((p) => Math.hypot(p.cx - cx, p.cy - cy) >= (p.r + r) * 1.08)) {
          spot = { x, y, cx, cy, r };
        }
      }
      if (!spot) size *= 0.85;
    }
    if (!spot) continue;
    placed.push({ cx: spot.cx, cy: spot.cy, r: spot.r });

    const stops = [...pick(PALETTES)];
    if (Math.random() < 0.5) stops.reverse();
    specs.push({
      id: i,
      cells: Math.floor(rand(6, 27)),
      size,
      x: spot.x,
      y: spot.y,
      stops,
      opacity: rand(0.7, 1),
      floatDuration: rand(12, 28),
      floatDelay: rand(-24, 0),
    });
  }
  return specs;
}

// Adds eased color stops so transitions between colors are soft, not linear.
function addSoftStops(g: CanvasGradient, stops: RGB[]) {
  const segs = stops.length - 1;
  const steps = 8;
  for (let s = 0; s < segs; s++) {
    for (let k = s === 0 ? 0 : 1; k <= steps; k++) {
      const t = smooth(k / steps);
      const a = stops[s];
      const b = stops[s + 1];
      const c: RGB = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      g.addColorStop((s + k / steps) / segs, css(c));
    }
  }
}

const CANVAS = 360; // high-res canvas so gradients stay smooth

function drawBlob(canvas: HTMLCanvasElement, spec: BlobSpec) {
  const S = CANVAS;
  canvas.width = S;
  canvas.height = S;
  const out = canvas.getContext("2d");
  const base = document.createElement("canvas");
  base.width = S;
  base.height = S;
  const ctx = base.getContext("2d");
  if (!out || !ctx) return;

  const n = spec.cells;
  const mid = S / 2;

  // 1) Blocky silhouette: random lumpy outline, stretched and rotated.
  const harmonics = Array.from({ length: Math.floor(rand(2, 6)) }, (_, k) => ({
    freq: Math.floor(rand(2, 6)),
    amp: rand(0.04, 0.26) / (1 + k * 0.4),
    phase: rand(0, Math.PI * 2),
  }));
  const baseR = rand(0.62, 0.8);
  const rot = rand(0, Math.PI);
  const stretch = rand(0.45, 1);
  const cx = (n - 1) / 2 + rand(-0.8, 0.8);
  const cy = (n - 1) / 2 + rand(-0.8, 0.8);
  const jitter = rand(0.03, 0.12);

  const pad = S * 0.12;
  const cell = (S - pad * 2) / n;
  ctx.fillStyle = "#000";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const rx = dx * Math.cos(rot) + dy * Math.sin(rot);
      const ry = (-dx * Math.sin(rot) + dy * Math.cos(rot)) / stretch;
      const dist = Math.hypot(rx, ry) / (n / 2);
      const theta = Math.atan2(ry, rx);
      let radius = baseR;
      for (const h of harmonics) radius += h.amp * Math.sin(h.freq * theta + h.phase);
      radius = Math.min(radius, 0.98) + rand(-jitter, jitter);
      if (dist > radius) continue;
      ctx.fillRect(Math.floor(pad + x * cell), Math.floor(pad + y * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }

  // 2) Fill with a randomly chosen smooth gradient, only inside the silhouette.
  const hasConic = typeof ctx.createConicGradient === "function";
  const kind = pick(hasConic ? ["linear", "radial", "conic", "mesh"] : ["linear", "radial", "mesh"]);
  const { stops } = spec;
  const ox = mid + rand(-0.2, 0.2) * S;
  const oy = mid + rand(-0.2, 0.2) * S;
  ctx.globalCompositeOperation = "source-in";

  if (kind === "linear") {
    const a = rand(0, Math.PI * 2);
    const reach = S * rand(0.3, 0.5);
    const g = ctx.createLinearGradient(
      mid - Math.cos(a) * reach, mid - Math.sin(a) * reach,
      mid + Math.cos(a) * reach, mid + Math.sin(a) * reach,
    );
    addSoftStops(g, stops);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  } else if (kind === "radial") {
    const g = ctx.createRadialGradient(ox, oy, S * rand(0, 0.08), ox, oy, S * rand(0.28, 0.55));
    addSoftStops(g, stops);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  } else if (kind === "conic") {
    const g = ctx.createConicGradient(rand(0, Math.PI * 2), ox, oy);
    addSoftStops(g, [...stops, stops[0]]); // loop back so there is no seam
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  } else {
    // mesh: a base color with soft color pools layered over it
    ctx.fillStyle = css(stops[0]);
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = "source-atop";
    const pools = [...stops.slice(1), pick(stops), pick(stops)];
    for (const c of pools) {
      const px = mid + rand(-0.28, 0.28) * S;
      const py = mid + rand(-0.28, 0.28) * S;
      const g = ctx.createRadialGradient(px, py, 0, px, py, S * rand(0.18, 0.4));
      g.addColorStop(0, css(c, 1));
      g.addColorStop(1, css(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
  }

  // 3) Smooth fade toward the outside; how strong differs per blob.
  const fade = ctx.createRadialGradient(mid, mid, S * rand(0.05, 0.2), mid, mid, S * 0.5);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.6, "rgba(0,0,0,0.95)");
  fade.addColorStop(1, `rgba(0,0,0,${rand(0.25, 0.9)})`);
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = "source-over";

  out.drawImage(base, 0, 0);

  // 4) On some blobs, soften just one side of the outline.
  if (Math.random() < 0.45 && "filter" in out) {
    const soft = document.createElement("canvas");
    soft.width = S;
    soft.height = S;
    const sc = soft.getContext("2d");
    if (!sc) return;
    sc.filter = `blur(${S * rand(0.025, 0.055)}px)`;
    sc.drawImage(base, 0, 0);
    sc.filter = "none";

    const a = rand(0, Math.PI * 2);
    // one shared mask, so the soft layer exactly replaces the sharp one on that side
    const edges = [rand(0.3, 0.5), rand(0.65, 0.85)];
    const applyMask = (ctxM: CanvasRenderingContext2D) => {
      const g = ctxM.createLinearGradient(
        mid - Math.cos(a) * S * 0.5, mid - Math.sin(a) * S * 0.5,
        mid + Math.cos(a) * S * 0.5, mid + Math.sin(a) * S * 0.5,
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(edges[0], "rgba(0,0,0,0)");
      g.addColorStop(edges[1], "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      ctxM.fillStyle = g;
      ctxM.fillRect(0, 0, S, S);
    };

    sc.globalCompositeOperation = "destination-in";
    applyMask(sc);
    out.globalCompositeOperation = "destination-out";
    applyMask(out);
    out.globalCompositeOperation = "source-over";
    out.drawImage(soft, 0, 0);
  }
}

function Blob({ spec, wrapRef }: { spec: BlobSpec; wrapRef: (el: HTMLDivElement | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawBlob(ref.current, spec);
  }, [spec]);
  // The wrapper is styled by the cursor effect; the canvas keeps its own slow float animation.
  return (
    <div
      ref={wrapRef}
      className="pixel-blob-wrap"
      style={{
        left: `${spec.x}%`,
        top: `${spec.y}%`,
        width: `${spec.size / 9}vmin`,
        height: `${spec.size / 9}vmin`,
        opacity: spec.opacity,
      }}
    >
      <canvas
        ref={ref}
        className="pixel-blob"
        style={{
          animationDuration: `${spec.floatDuration}s`,
          animationDelay: `${spec.floatDelay}s`,
        }}
      />
    </div>
  );
}

// Shapes brighten and get more saturated as the cursor gets close, like a spotlight.
function useCursorGlow(specs: BlobSpec[], wraps: React.MutableRefObject<(HTMLDivElement | null)[]>) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const mouse = { x: 0, y: 0, active: false };
    const level = specs.map(() => 0); // eased 0..1 per blob
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onLeave = () => {
      mouse.active = false;
    };
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const tick = () => {
      specs.forEach((spec, i) => {
        const el = wraps.current[i];
        if (!el) return;
        let target = 0;
        if (mouse.active) {
          const box = el.getBoundingClientRect(); // (not offsetTop: the scroll drift moves the shape with a translate)
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          const reach = el.offsetWidth * 0.9 + window.innerWidth * 0.05; // scales with the shape's size
          const d = Math.hypot(cx - mouse.x, cy - mouse.y);
          const p = Math.max(0, 1 - d / reach);
          target = p * p * (3 - 2 * p); // smoothstep falloff
        }
        level[i] += (target - level[i]) * 0.08;
        const p = level[i];
        if (p < 0.001 && target === 0) {
          el.style.filter = "";
          el.style.opacity = String(spec.opacity);
          return;
        }
        el.style.opacity = String(spec.opacity + (1 - spec.opacity) * p);
        el.style.filter = `saturate(${(1 + p * 0.8).toFixed(3)}) brightness(${(1 + p * 0.1).toFixed(3)})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [specs, wraps]);
}
// The shapes drift with the scroll: they rise as you scroll down and sink as you scroll up, each at its own speed (so they
// sit at different depths). A shape that leaves one edge comes back in from the other, so the screen never runs empty.
function useScrollDrift(specs: BlobSpec[], wraps: React.MutableRefObject<(HTMLDivElement | null)[]>) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const speeds = specs.map(() => rand(0.25, 0.7)); // px of rise per px scrolled
    let shown = window.scrollY; // eased toward the real scroll position, so the drift stays smooth
    let raf = 0;
    const apply = () => {
      const vh = window.innerHeight;
      specs.forEach((_, i) => {
        const el = wraps.current[i];
        if (!el) return;
        const size = el.offsetHeight;
        const home = el.offsetTop; // where the shape sits with no drift
        const span = vh + size; // from just above the top edge to just below the bottom edge
        const y = (((home + size - shown * speeds[i]) % span) + span) % span - size;
        el.style.translate = `0 ${(y - home).toFixed(1)}px`;
      });
    };
    const tick = () => {
      shown += (window.scrollY - shown) * 0.1;
      if (Math.abs(window.scrollY - shown) < 0.3) shown = window.scrollY;
      apply();
      raf = shown === window.scrollY ? 0 : requestAnimationFrame(tick);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", apply);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", apply);
    };
  }, [specs, wraps]);
}

export default function PixelShapes() {
  const specs = useMemo(makeSpecs, []);
  const wraps = useRef<(HTMLDivElement | null)[]>([]);
  useCursorGlow(specs, wraps);
  useScrollDrift(specs, wraps);
  return (
    <div className="pixel-shapes">
      {specs.map((s, i) => (
        <Blob
          key={s.id}
          spec={s}
          wrapRef={(el) => {
            wraps.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}