import { useLayoutEffect, useRef, useState } from "react";
import { FontLabel } from "./LogoMenu";
import Morph from "./Morph";
import PixelCover from "./PixelCover";
import { content } from "../content";

// Slanted shimmer stripes of different widths, the same idea as on the pixel buttons: [start as a share of the width, width in squares]
const GLINTS: [number, number][] = [[0.05, 7], [0.17, 2], [0.4, 10], [0.62, 3], [0.8, 8], [0.93, 2]];

// One service card. While the pointer is over it the title melts into the pixel typeface and the card flips to blue.
function ServiceCard({ index, title, text }: { index: number; title: string; text: string }) {
  const [on, setOn] = useState(false);
  const face = useRef<HTMLDivElement>(null);
  const glints = useRef<HTMLCanvasElement>(null);

  // paint the shimmer in whole squares (about 110 across, whatever the card's size), scaled up with hard edges
  useLayoutEffect(() => {
    const el = face.current;
    const cv = glints.current;
    if (!el || !cv) return;
    const paint = () => {
      const cols = 110;
      const cell = el.clientWidth / cols;
      if (!cell) return;
      const rows = Math.max(4, Math.round(el.clientHeight / cell));
      cv.width = cols;
      cv.height = rows;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cols, rows);
      for (const [at, w] of GLINTS) {
        const x0 = Math.round(at * cols);
        ctx.fillStyle = `rgba(255,255,255,${w > 5 ? 0.85 : 0.7})`;
        for (let y = 0; y < rows; y++) ctx.fillRect(x0 + Math.floor((rows - 1 - y) * 0.5), y, w, 1);
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <li className="svc" onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}>
      <div className="svc-face" ref={face}>
        <canvas ref={glints} className="svc-glints" aria-hidden="true" />
        <span className="svc-num">{String(index + 1).padStart(2, "0")}</span>
        <h3 className="svc-title">
          <FontLabel text={title} active={on} />
        </h3>
        <p className="svc-text">{text}</p>
        <PixelCover />
      </div>
    </li>
  );
}

// The rest of the home page, under the About section: what you do, and a strip of who you have worked with.
// Both are edited in the admin (Home page tab).
export default function HomeMore() {
  const { services, clients } = content;
  const brands = clients.items.filter((c) => c.src || c.name.trim());
  // one run has to be wider than the screen or the loop shows a gap, so a short list is repeated within each run
  const run = Array.from({ length: Math.max(1, Math.ceil(6 / Math.max(1, brands.length))) }, () => brands).flat();
  return (
    <div className="home-more">
      {services.items.length > 0 && (
        <section className="svc-wrap" aria-labelledby="svc-title">
          <p className="work-label">{services.label}</p>
          <div className="work-group-head">
            <h2 id="svc-title">
              <Morph text={services.title} />
              <PixelCover rows={6} />
            </h2>
          </div>
          <ul className="svc-grid">
            {services.items.map((s, i) => (
              <ServiceCard key={i} index={i} title={s.title} text={s.text} />
            ))}
          </ul>
        </section>
      )}

      {brands.length > 0 && (
        <section className="clients" aria-label={clients.label}>
          <p className="work-label">{clients.label}</p>
          <div className="clients-strip">
            {/* the list twice, so the strip can loop with no gap; the copy is hidden from screen readers */}
            {[0, 1].map((copy) => (
              <ul className="clients-run" key={copy} aria-hidden={copy === 1 ? "true" : undefined}>
                {run.map((c, i) => (
                  <li className="client" key={i}>
                    <div className="client-face">{c.src ? <img src={c.src} alt={copy === 0 && i < brands.length ? c.name : ""} draggable={false} /> : <span>{c.name}</span>}</div>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
