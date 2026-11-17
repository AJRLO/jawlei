import type { CSSProperties } from "react";
import { useState } from "react";
import Morph from "./Morph";
import Lightbox from "./Lightbox";
import PixelCover from "./PixelCover";
import PixelButton from "./PixelButton";
import { content } from "../content";

// All of this comes from the admin app (work.sections). Pieces with an uploaded image show it; the rest show a flat colour.
const CATEGORIES = content.work.sections;

export default function WorkPage() {
  // which image is open in the viewer: the section, and the position among that section's images
  const [open, setOpen] = useState<{ section: number; img: number } | null>(null);
  const imagesOf = (s: number) => CATEGORIES[s].pieces.map((p) => p.src).filter((x): x is string => !!x);

  return (
    <main className="work">
      <p className="work-label">{content.work.label}</p>
      <h1 className="work-title"><Morph text={content.work.title} /><PixelCover rows={10} /></h1>

      <nav className="work-nav" aria-label="Work categories">
        {CATEGORIES.map((c) => (
          <a key={c.id} href={`#${c.id}`} onClick={(e) => {
            e.preventDefault();
            document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}>
            {c.title}
            <sup>{String(c.pieces.length).padStart(2, "0")}</sup>
          </a>
        ))}
      </nav>

      {CATEGORIES.map((c, si) => (
        <section className="work-group" id={c.id} key={c.id}>
          <div className="work-group-head">
            <h2><Morph text={c.title} /><PixelCover rows={8} /></h2>
            <p>{c.note}</p>
          </div>
          <div className="work-grid" style={{ "--cols": c.cols, "--ratio": c.ratio } as CSSProperties}>
            {c.pieces.map((p, i) => {
              const img = c.pieces.slice(0, i).filter((q) => q.src).length; // position among this section's images
              const show = () => setOpen({ section: si, img });
              return (
              <figure
                className={"work-tile" + (p.src ? " zoomable" : "")}
                key={i}
                style={{ color: p.fg }}
                {...(p.src ? { role: "button", tabIndex: 0, "aria-label": `View image ${i + 1} larger`, onClick: show, onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && show() } : {})}
              >
                <div className="work-face" style={{ background: p.bg }}>
                  {p.src && <img src={p.src} alt="" loading="lazy" />}
                  <PixelCover />
                  <figcaption>{String(i + 1).padStart(2, "0")}</figcaption>
                </div>
              </figure>
              );
            })}
          </div>
        </section>
      ))}
      {content.work.behanceHref && (
        <div className="work-more">
          <PixelButton href={content.work.behanceHref} label={content.work.behanceLabel || "VIEW ALL WORK ON BEHANCE"} external />
        </div>
      )}

      {open && <Lightbox images={imagesOf(open.section)} index={open.img} onIndex={(img) => setOpen({ ...open, img })} onClose={() => setOpen(null)} />}
    </main>
  );
}
