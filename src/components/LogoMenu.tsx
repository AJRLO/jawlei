import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { wipeTo } from "./PageWipe";
import { createLiquid, liquidGrid, randomPhases, SHOW_AFTER_MS, TOTAL_MS, zeroPhases } from "./liquid";

type Phase = "closed" | "open" | "closing";
type Target = "home" | "work" | "about" | "contact";

const ITEMS: { label: string; target: Target }[] = [
  { label: "HOME", target: "home" },
  { label: "WORK", target: "work" },
  { label: "ABOUT", target: "about" },
  { label: "CONTACT", target: "contact" },
];

// ---- Liquid, pixelating text morph ---------------------------------------------------------------------------------
// On hover or focus the word melts into the pixel typeface (and back). The old word blurs and fades out while the
// new one sharpens and fades in, and a threshold filter (the "goo-text" filter below) snaps the blurry overlap back
// into solid shapes, so the letters flow into each other instead of just crossfading. The same filter then breaks the
// shapes into squares (chunkiest mid-morph), so the melt is pixelated.
export function FontLabel({ text, active }: { text: string; active: boolean }) {
  const label = useRef<HTMLSpanElement>(null);
  const base = useRef<HTMLSpanElement>(null);
  const alt = useRef<HTMLSpanElement>(null);
  const q = useRef(0); // 0 = original text, 1 = pixel font

  useEffect(() => {
    void document.fonts?.load('1em "NewPixel"'); // make sure the pixel font is ready before the first hover
  }, []);

  useEffect(() => {
    const el = label.current;
    const b = base.current;
    const a = alt.current;
    if (!el || !b || !a) return;
    const goal = active ? 1 : 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const baseW = b.offsetWidth;
    const altW = a.offsetWidth;
    const fontPx = parseFloat(getComputedStyle(b).fontSize);
    const blurK = fontPx * 0.065; // how soft the melt gets
    const dot = document.getElementById("goo-dot");
    const cell = document.getElementById("goo-cell");
    const grow = document.getElementById("goo-grow");
    const filterEl = document.getElementById("goo-text");
    const padPx = fontPx * 0.8;
    filterEl?.setAttribute("x", String(-padPx));
    filterEl?.setAttribute("y", String(-padPx));
    filterEl?.setAttribute("width", String(Math.max(baseW, altW) + padPx * 2));
    filterEl?.setAttribute("height", String(b.offsetHeight + padPx * 2));
    let lastSize = 0;
    let last = performance.now();
    let raf = 0;

    const tick = () => {
      const now = performance.now();
      const step = reduce ? 1 : (now - last) / 620;
      last = now;
      q.current = goal > q.current ? Math.min(goal, q.current + step) : Math.max(goal, q.current - step);
      const e = q.current * q.current * (3 - 2 * q.current);

      if (e <= 0 || e >= 1) {
        // at rest: plain, crisp text, no filters
        const onAlt = e >= 1;
        el.style.filter = "";
        b.style.filter = "";
        a.style.filter = "";
        b.style.opacity = onAlt ? "0" : "1";
        a.style.opacity = onAlt ? "1" : "0";
        el.style.width = onAlt ? `${altW}px` : "";
      } else {
        const g = 1 - e;
        // The squares change size in a few steps (chunkiest in the middle), never continuously: a size that
        // slides every frame makes the whole grid shimmer. Sizes are even whole pixels so the grid stays sharp.
        const frac = e < 0.15 || e > 0.85 ? 0.035 : e < 0.3 || e > 0.7 ? 0.05 : 0.065;
        const s = Math.max(2, 2 * Math.round((fontPx * frac) / 2));
        if (s !== lastSize) {
          lastSize = s;
          // one 2px sample dot per square, grown to fill it: this keeps the squares clean and sharp
          dot?.setAttribute("x", String(s / 2 - 1));
          dot?.setAttribute("y", String(s / 2 - 1));
          dot?.setAttribute("width", "2");
          dot?.setAttribute("height", "2");
          cell?.setAttribute("width", String(s));
          cell?.setAttribute("height", String(s));
          grow?.setAttribute("radius", String((s - 2) / 2));
        }        el.style.filter = "url(#goo-text)";
        a.style.filter = `blur(${Math.min(blurK / e - blurK, 100)}px)`;
        a.style.opacity = String(Math.pow(e, 0.4));
        b.style.filter = `blur(${Math.min(blurK / g - blurK, 100)}px)`;
        b.style.opacity = String(Math.pow(g, 0.4));
        el.style.width = `${baseW + (altW - baseW) * e}px`;
      }
      if (q.current !== goal) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, text]);

  return (
    <span className="menu-label" ref={label}>
      <span className="menu-label-text" ref={base}>
        {text}
      </span>
      <span className="menu-label-alt" ref={alt} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
function MenuItem({
  item,
  index,
  onGo,
}: {
  item: { label: string; target: Target };
  index: number;
  onGo: (t: Target) => void;
}) {
  const [hover, setHover] = useState(false);
  const style = { "--it": `${index * 80}ms` } as CSSProperties;
  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    onFocus: () => setHover(true),
    onBlur: () => setHover(false),
  };
  const content = (
    <>
      <span className="menu-num">{String(index + 1).padStart(2, "0")}</span>
      <FontLabel text={item.label} active={hover} />
    </>
  );
  return (
    <button type="button" className="menu-item" style={style} onClick={() => onGo(item.target)} {...handlers}>
      {content}
    </button>
  );}
// Clicking the logo sends a pixelated liquid blob out from the middle of the screen. A soft, colourful rim
// leads, white follows and swells until it fills the page, and the menu links show up on it.
export default function LogoMenu() {
  const [phase, setPhase] = useState<Phase>("closed");
  const [size, setSize] = useState({ w: 1600, h: 900 });
  const [show, setShow] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = useRef(0); // 0 = nothing, 1 = full screen
  const phases = useRef<number[]>(zeroPhases());

  const { cols, rows } = liquidGrid(size.w, size.h);

  const open = () => {
    setSize({ w: window.innerWidth, h: window.innerHeight });
    phases.current = randomPhases();
    setPhase("open");
  };
  const close = () => setPhase((p) => (p === "open" ? "closing" : p));
  const toggle = () => (phase === "open" ? close() : phase === "closed" ? open() : undefined);

  // Animation loop: moves `progress` toward its goal and redraws the grid of squares.
  useEffect(() => {
    const cv = canvas.current;
    if (phase === "closed" || !cv) return;
    const paint = createLiquid(cv, size.w, size.h, phases.current);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const goal = phase === "open" ? 1 : 0;
    const speed = reduce ? 1 : 1 / TOTAL_MS;
    let last = performance.now();
    let raf = 0;

    const frame = () => {
      const now = performance.now();
      const dt = Math.max(0, now - last);
      last = now;
      const cur = progress.current;
      progress.current = goal > cur ? Math.min(goal, cur + dt * speed) : Math.max(goal, cur - dt * speed);
      paint(progress.current, now / 1000);

      if (progress.current === goal) {
        if (goal === 0) setPhase("closed");
        return; // fully open (nothing left to animate) or fully closed
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, size, cols, rows]);
  // Links appear once the white has reached them, and vanish as soon as it starts to close.
  useEffect(() => {
    if (phase !== "open") {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // keep the grid sized to the window if it is resized while the menu is open
  useEffect(() => {
    if (phase === "closed") return;
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase]);

  // Shuts the menu at once (no closing animation): used while the page-change animation covers the screen.
  const closeNow = () => {
    progress.current = 0;
    setShow(false);
    setPhase("closed");
  };
  // Choosing a page plays the rainbow page-change animation; the menu is shut behind it.
  const go = (target: Target) => {
    if (target === "work" || target === "contact") {
      wipeTo(`/${target}`, { before: closeNow });
      return;
    }
    wipeTo("/", {
      before: closeNow,
      // About: scroll until the About section's bottom edge meets the bottom of the window (there is more page after it now)
      after:
        target === "about"
          ? () => {
              const about = document.querySelector(".about");
              const top = about ? about.getBoundingClientRect().bottom + window.scrollY - window.innerHeight : document.documentElement.scrollHeight;
              window.scrollTo({ top, behavior: "auto" });
            }
          : undefined,
    });
  };
  return (
    <span className="logo-menu">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          {/* fixed pixel region (set from code): a region sized in % would move as the word changes width, and drag the pixel grid with it */}
          <filter id="goo-text" filterUnits="userSpaceOnUse" x="-80" y="-80" width="1500" height="400" colorInterpolationFilters="sRGB">
            {/* 1. threshold: the blurry overlap becomes solid, liquid shapes */}
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 255 -140" result="goo" />
            {/* 2. pixelate: keep one sample dot per square, then grow each dot into a square. The sizes are set from code. */}
            <feFlood id="goo-dot" x="4" y="4" width="2" height="2" result="dot" />
            <feComposite id="goo-cell" in="dot" width="10" height="10" result="cell" />
            <feTile in="cell" result="tiles" />
            <feComposite in="goo" in2="tiles" operator="in" result="samples" />
            <feMorphology id="goo-grow" in="samples" operator="dilate" radius="4" />
          </filter>
        </defs>
      </svg>
      <button
        type="button"
        className="logo-btn"
        onClick={toggle}
        aria-expanded={phase === "open"}
        aria-haspopup="true"
        aria-label="JAWLEI menu"
      >
        <img className="top-mark-name" src="/jawlei-typo.png" alt="JAWLEI" />
      </button>

      {phase !== "closed" && (
        <span className={"menu" + (show ? " show" : "")} onClick={(e) => e.target === e.currentTarget && close()}>
          <canvas
            ref={canvas}
            className="liquid"
            width={cols}
            height={rows}
            style={{ height: `${(rows * 100) / cols}vw` }}
            aria-hidden="true"
          />

          <span className="menu-items" onClick={(e) => e.target === e.currentTarget && close()}>
            {ITEMS.map((item, i) => (
              <MenuItem key={item.label} item={item} index={i} onGo={go} />
            ))}
          </span>
        </span>
      )}
    </span>
  );
}