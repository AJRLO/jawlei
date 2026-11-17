import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { content } from "../content";
import type { RingCard } from "../content";

// The cards come from the admin app (home.cards). Cards with an uploaded image show it; the rest show a flat colour and shape.
type CardSpec = RingCard;
const CARDS = content.home.cards;

const COUNT = 19; // cards on the arc
const STEP = 14; // degrees between neighbouring cards

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function Art({ shape, fg }: { shape: CardSpec["shape"]; fg: string }) {
  return (
    <svg viewBox="0 0 70 95" className="card-art" aria-hidden="true" fill={fg}>
      {shape === "circle" && <circle cx="35" cy="42" r="24" />}
      {shape === "square" && <rect x="12" y="19" width="46" height="46" />}
      {shape === "half" && <path d="M8 62 A27 27 0 0 1 62 62 Z" />}
      {shape === "ring" && <circle cx="35" cy="42" r="21" fill="none" stroke={fg} strokeWidth="9" />}
      {shape === "diamond" && <rect x="17" y="24" width="36" height="36" transform="rotate(45 35 42)" />}
      {shape === "stripes" && (
        <>
          <rect x="8" y="18" width="54" height="7" />
          <rect x="8" y="33" width="54" height="7" />
          <rect x="8" y="48" width="54" height="7" />
          <rect x="8" y="63" width="54" height="7" />
        </>
      )}
      {shape === "pixels" && (
        <>
          <rect x="21" y="14" width="14" height="14" />
          <rect x="35" y="28" width="14" height="14" />
          <rect x="21" y="42" width="14" height="14" />
          <rect x="35" y="56" width="14" height="14" />
          <rect x="7" y="28" width="14" height="14" />
        </>
      )}
    </svg>
  );
}

const ringText = content.home.ringText.replace(/ /g, "\u00A0");
const ringRepeats = Math.max(1, Math.round(60 / (ringText.length + 3))); // keeps the ring full whatever the text is

export default function ScrollStory() {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLCanvasElement>(null);

  // Scroll progress (0..1) drives three CSS variables on the stage:
  // --hero (logo leaves), --enter (cards rise in), --spin (arc rotates).
  useEffect(() => {
    let target = 0;
    let current = 0;
    let raf = 0;

    // End of the track: white pixels rise from the bottom and take over the screen, so the
    // next (white) section starts with no seam. One canvas pixel = one big square.
    const COLS = 64;
    const RANGE = 10; // how far apart the columns' rising times can be, in rows
    let rows = 0;
    let offsets: number[] = [];
    let jitter: number[] = [];
    let lastQ = -1;
    let curQ = 0;

    const setupGrid = () => {
      const cv = edge.current;
      if (!cv) return;
      rows = Math.ceil(window.innerHeight / (window.innerWidth / COLS)) + 1;
      cv.width = COLS;
      cv.height = rows;
      cv.style.height = `${(rows * 100) / COLS}vw`;
      let o = RANGE / 2;
      offsets = Array.from({ length: COLS }, () => (o = clamp(o + (Math.random() - 0.5) * 4, 0, RANGE)));
      jitter = Array.from({ length: COLS * rows }, () => Math.random());
      lastQ = -1;
    };

    const drawEdge = (q: number) => {
      const cv = edge.current;
      const ctx = cv?.getContext("2d");
      if (!cv || !ctx || q === lastQ) return;
      lastQ = q;
      ctx.clearRect(0, 0, COLS, rows);
      if (q <= 0) return;
      ctx.fillStyle = "#fff";
      const total = rows + RANGE + 4;
      for (let c = 0; c < COLS; c++) {
        const h = q * total - offsets[c] - 2; // column height in squares
        for (let r = 0; r < rows; r++) {
          // jitter scatters squares ahead of and behind each column's top
          if (r < h + (jitter[c * rows + r] - 0.5) * 3) ctx.fillRect(c, rows - 1 - r, 1, 1);
        }
      }
    };

    const apply = (p: number) => {
      curQ = Math.round(smoothstep(0.78, 1, p) * 1000) / 1000;
      drawEdge(curQ);
      document.documentElement.style.setProperty("--rise", String(curQ)); // lets the About section fade in as the white fills the screen
      const el = stage.current;
      if (!el) return;
      const hero = smoothstep(0, 0.28, p).toFixed(4);
      document.documentElement.style.setProperty("--hero", hero); // the big logo lives in its own layer behind the stage (see App), so it reads this from the page root
      el.style.setProperty("--hero", hero);
      el.style.setProperty("--enter", smoothstep(0.12, 0.5, p).toFixed(4));
      el.style.setProperty("--spin", ((p - 0.5) * 100).toFixed(3));
    };

    const loop = () => {
      current += (target - current) * 0.12; // eased, so the motion feels fluid
      if (Math.abs(target - current) < 0.0004) current = target;
      apply(current);
      raf = current === target ? 0 : requestAnimationFrame(loop);
    };

    const onResize = () => {
      setupGrid();
      drawEdge(curQ);
      onScroll();
    };

    const onScroll = () => {
      const t = track.current;
      if (!t) return;
      const rect = t.getBoundingClientRect();
      target = clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
      if (!raf) raf = requestAnimationFrame(loop);
    };

    setupGrid();
    onScroll();
    current = target;
    apply(current);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="scroll-track" ref={track}>
      <div className="stage" ref={stage}>

        <div className="cards" aria-hidden="true">
          <div className="ring">
            {/* dashed circle plus text running around it, sitting under the cards */}
            <svg className="ring-text" viewBox="-45 -45 90 90" aria-hidden="true">
              <circle className="ring-dash" r="38" />
              <path id="my-work-path" d="M -31 0 A 31 31 0 1 1 31 0 A 31 31 0 1 1 -31 0" fill="none" />
              <text className="ring-label" textLength="194.8" lengthAdjust="spacing">
                <textPath href="#my-work-path">{`${ringText}\u00A0\u2022\u00A0`.repeat(ringRepeats)}</textPath>
              </text>
            </svg>
            {(CARDS.length ? Array.from({ length: COUNT }, (_, i) => {
              const spec = CARDS[i % CARDS.length];
              const style = {
                "--a": ((i - (COUNT - 1) / 2) * STEP).toFixed(2),
                background: spec.bg,
                color: spec.fg,
              } as CSSProperties;
              return (
                <div className="card" key={i} style={style}>
                  {spec.src ? <img src={spec.src} alt="" className="card-img" /> : <Art shape={spec.shape} fg={spec.fg} />}
                  <span className="card-num">{String(i + 1).padStart(2, "0")}</span>
                </div>
              );
            }) : null)}
          </div>
        </div>

        <canvas className="stage-pixels" ref={edge} aria-hidden="true" />
      </div>
    </div>
  );
}