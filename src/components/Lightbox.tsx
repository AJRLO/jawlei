import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createLiquidReveal, randomPhases, TOTAL_MS } from "./liquid";
import "./lightbox.css";

// Full-screen image viewer. It opens and closes with the same liquid pixel blob as the menu, but here the blob is a mask:
// a white page with the picture on it is revealed through the blob as it swells out from the middle of the screen, with
// the rainbow leading the edge. Closing plays it backwards. Click outside the picture or press Esc to close; arrow
// keys or the side buttons step through the other images.

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX_W = 0.88; // the picture may use this much of the screen's width...
const MAX_H = 0.86; // ...and height

export default function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const many = images.length > 1;
  const [closing, setClosing] = useState(false);
  const [show, setShow] = useState(false); // the arrows appear once the picture is on screen
  const [size] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = useRef(reduced() ? 1 : 0); // 0 = nothing, 1 = full screen
  const phases = useRef(randomPhases());
  const content = useRef<HTMLCanvasElement | null>(null); // the white page with the picture on it
  const pic = useRef({ left: 0, top: 0, right: 0, bottom: 0 }); // where the picture sits, in CSS pixels
  const render = useRef<(p: number, t: number) => void>(() => undefined);
  const shown = useRef(false);

  const requestClose = () => {
    if (closing) return;
    if (reduced()) onClose();
    else setClosing(true);
  };
  const step = (d: number) => onIndex((index + d + images.length) % images.length);

  // Set up the canvas and the mask painter once.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    const paint = createLiquidReveal(cv, size.w, size.h, dpr, phases.current);
    render.current = (p, t) => content.current && paint(p, t, content.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the page + picture (and redraw it whenever the image changes), then repaint the current frame.
  useEffect(() => {
    const page = document.createElement("canvas");
    page.width = Math.round(size.w * dpr);
    page.height = Math.round(size.h * dpr);
    const ctx = page.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, page.width, page.height);
    content.current = page;
    render.current(progress.current, performance.now() / 1000);

    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      const k = Math.min((size.w * MAX_W) / img.naturalWidth, (size.h * MAX_H) / img.naturalHeight);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      const left = (size.w - w) / 2;
      const top = (size.h - h) / 2;
      pic.current = { left, top, right: left + w, bottom: top + h };
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, left * dpr, top * dpr, w * dpr, h * dpr);
      render.current(progress.current, performance.now() / 1000);
    };
    img.src = images[index];
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images]);

  // The blob: moves `progress` toward fully open (or fully closed) and repaints.
  useEffect(() => {
    const goal = closing ? 0 : 1;
    const speed = reduced() ? 1 : 1 / TOTAL_MS;
    let last = performance.now();
    let raf = 0;
    const frame = () => {
      const now = performance.now();
      const dt = Math.max(0, now - last);
      last = now;
      const cur = progress.current;
      progress.current = goal > cur ? Math.min(goal, cur + dt * speed) : Math.max(goal, cur - dt * speed);
      render.current(progress.current, now / 1000);

      if (!closing && !shown.current && progress.current >= 0.62) {
        shown.current = true; // the picture is well on screen: bring in the buttons
        setShow(true);
      }
      if (progress.current === goal) {
        if (closing) onClose();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  useEffect(() => {
    if (closing) {
      shown.current = false;
      setShow(false);
    } else if (reduced()) {
      shown.current = true;
      setShow(true);
    }
  }, [closing]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
      else if (many && !closing && e.key === "ArrowRight") step(1);
      else if (many && !closing && e.key === "ArrowLeft") step(-1);
    };
    // Keep the page from scrolling behind the viewer. This is done by blocking the scroll inputs rather than hiding
    // the page scrollbar: hiding it would make the whole page jump sideways when the viewer opens and closes.
    const block = (e: Event) => e.preventDefault();
    const scrollKeys = (e: KeyboardEvent) => {
      if ([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("keydown", scrollKeys);
    document.addEventListener("wheel", block, { passive: false });
    document.addEventListener("touchmove", block, { passive: false });
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("keydown", scrollKeys);
      document.removeEventListener("wheel", block);
      document.removeEventListener("touchmove", block);
    };
  });

  // clicking the picture itself does nothing; clicking anywhere else closes
  const onBackdrop = (e: React.MouseEvent) => {
    const p = pic.current;
    if (e.clientX >= p.left && e.clientX <= p.right && e.clientY >= p.top && e.clientY <= p.bottom && progress.current >= 1) return;
    requestClose();
  };

  // rendered straight into <body> so nothing on the page (the fixed header and footer) can sit above it
  return createPortal(
    <div className={"lb" + (show ? " show" : "")} role="dialog" aria-modal="true" aria-label="Image viewer" onClick={onBackdrop}>
      <canvas ref={canvas} className="lb-bg" role="img" aria-label="Enlarged image" />

      <div className="lb-ui">
        {many && (
          <>
            <button type="button" className="lb-btn lb-prev" aria-label="Previous image" onClick={(e) => { e.stopPropagation(); step(-1); }}>
              ←
            </button>
            <button type="button" className="lb-btn lb-next" aria-label="Next image" onClick={(e) => { e.stopPropagation(); step(1); }}>
              →
            </button>
            <span className="lb-count">
              {String(index + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
            </span>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
