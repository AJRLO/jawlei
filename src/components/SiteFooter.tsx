import type { CSSProperties } from "react";
import PixelButton from "./PixelButton";
import PixelCover from "./PixelCover";
import { content } from "../content";
import { wipeTo } from "./PageWipe";

// Stickers stuck on the big wordmark: your own marks, each painted in one brand colour through the image's shape, with a white
// outline and a hard shadow (so they read as stickers). Positions are shares of the artwork area; width is in vw.
const STICKERS = [
  { src: "/brand/made.png", ar: 2.459, color: "#0050e0", left: "3%", top: "6%", w: 15, rot: -9 },
  { src: "/brand/j-mark.png", ar: 0.558, color: "#ffe600", left: "26%", top: "16%", w: 4.4, rot: 12 },
  { src: "/brand/script.png", ar: 2.46, color: "#ff3ea5", left: "55%", top: "2%", w: 13, rot: -6 },
  { src: "/brand/blobs.svg", ar: 1.318, color: "#7dffb2", left: "80%", top: "18%", w: 9, rot: 16 },
];

// The footer at the bottom of every page: a floating pixel card. When you scroll down to it, it appears square by square
// (the same pixel dissolve as the cards: white squares clear away).
export default function SiteFooter() {
  const { home, about, work, contact } = content;
  const go = (path: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    wipeTo(path);
  };
  // other places to find you: email, Behance, then the links from the Contact page (no repeats)
  const elsewhere: { label: string; href: string }[] = [];
  for (const l of [
    ...(contact.email ? [{ label: contact.email, href: `mailto:${contact.email}` }] : []),
    { label: "Behance", href: work.behanceHref },
    ...contact.links,
  ]) {
    if (l.label && l.href && !elsewhere.some((e) => e.href === l.href)) elsewhere.push({ label: l.label, href: l.href });
  }
  return (
    <footer className="site-foot">
      <div className="site-foot-card">
        <div className="site-foot-face">
          <div className="site-foot-top">
            <div className="site-foot-col site-foot-main">
              {home.footerStatus && (
                <p className="site-foot-tag">
                  <i aria-hidden="true" />
                  {home.footerStatus}
                </p>
              )}
              <p className="site-foot-title">{home.footerTitle}</p>
              <PixelButton href="/contact" label={about.contactLabel} />
            </div>
            <nav className="site-foot-col" aria-label="Footer">
              <p className="site-foot-tag">PAGES</p>
              <ul>
                <li><a href="/" onClick={go("/")}>Home</a></li>
                <li><a href="/work" onClick={go("/work")}>Work</a></li>
                <li><a href="/contact" onClick={go("/contact")}>Contact</a></li>
              </ul>
            </nav>
            {elsewhere.length > 0 && (
              <div className="site-foot-col">
                <p className="site-foot-tag">ELSEWHERE</p>
                <ul>
                  {elsewhere.map((l, i) => (
                    <li key={i}>
                      <a href={l.href} {...(/^https?:/i.test(l.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{l.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="site-foot-art">
            <img className="site-foot-mark" src="/jawlei-typo.png" alt="JAWLEI" />
            {STICKERS.map((s, i) => (
              <span key={i} className="site-foot-sticker" style={{ left: s.left, top: s.top, "--w": `${s.w}vw`, "--r": `${s.rot}deg` } as CSSProperties} aria-hidden="true">
                <i style={{ "--ar": s.ar, "--c": s.color, "--m": `url(${s.src})` } as CSSProperties} />
              </span>
            ))}
          </div>

          <div className="site-foot-bar" aria-hidden="true" />
          <div className="site-foot-bottom">
            <p>&copy; {home.footer}</p>
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              BACK TO TOP
            </button>
          </div>
        </div>
        <PixelCover />
      </div>
    </footer>
  );
}
