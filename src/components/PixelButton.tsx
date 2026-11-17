import { useLayoutEffect, useRef } from "react";
import { wipeTo } from "./PageWipe";

// Pixel-art glass button, drawn in whole "pixels" of one size (--u in CSS): a dark outline with stepped corners, a pale
// face with slanted white glints of different widths, a darker band along the bottom, and the label in the Minecraft
// font. The glints and the label are painted on tiny canvases and scaled up with hard edges, so every pixel is square.

// Drawn at 16px, each pixel of the Minecraft font is exactly 2 canvas pixels, so the letters come out as clean pixel art.
// The canvas is then shown at half a button-pixel per canvas pixel, so one letter pixel = one button pixel.
const FONT = '16px "Minecraft", monospace';
const TEXT_ROWS = 18;
const TEXT_BASELINE = 16;

// Glints: where each starts (share of the face's width) and how wide it is, in pixels. Different widths on purpose.
const GLINTS = [
  { at: 0.06, w: 8 },
  { at: 0.19, w: 2 },
  { at: 0.46, w: 11 },
  { at: 0.7, w: 3 },
  { at: 0.84, w: 7 },
];
const SLANT = 0.5; // pixels each glint moves sideways per row: a steep "/" like the reference

function PixelLabel({ text }: { text: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    let cancelled = false;
    const draw = () => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || cancelled) return;
      ctx.font = FONT;
      const w = Math.ceil(ctx.measureText(text).width) + 2;
      canvas.width = w;
      canvas.height = TEXT_ROWS;
      canvas.style.setProperty("--w", String(w));
      ctx.font = FONT; // resizing the canvas resets the context
      ctx.fillStyle = getComputedStyle(canvas).color;
      ctx.fillText(text, 1, TEXT_BASELINE);
      const img = ctx.getImageData(0, 0, w, TEXT_ROWS);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0; // no soft edges
      ctx.putImageData(img, 0, 0);
    };
    draw();
    void document.fonts?.load(FONT).then(draw); // redraw once the font is really there
    return () => {
      cancelled = true;
    };
  }, [text]);
  return <canvas ref={cv} className="pix-label" aria-hidden="true" />;
}

// external opens the link in a new tab (for web links); leave it off for mailto: links.
export default function PixelButton({
  href,
  label,
  external = false,
  submit = false,
  disabled = false,
  onClick,
}: {
  href?: string;
  label: string;
  external?: boolean;
  submit?: boolean; // a form submit button instead of a link
  disabled?: boolean;
  onClick?: () => void; // with no href: a plain button that runs this when clicked
}) {
  const link = useRef<HTMLElement>(null);
  const glints = useRef<HTMLCanvasElement>(null);

  // paint the glints to fit the face: from the top of it down to the top of the darker band
  useLayoutEffect(() => {
    const a = link.current;
    const cv = glints.current;
    if (!a || !cv) return;
    const paint = () => {
      const u = parseFloat(getComputedStyle(a).paddingLeft) / 7 || 4; // one pixel, in screen pixels (the side padding is 7 of them)
      const cols = Math.max(8, Math.round((a.clientWidth - 2 * u) / u));
      const rows = Math.max(4, Math.round((a.clientHeight - 5 * u) / u)); // minus the outline (top and bottom) and the darker band (3 pixels)
      cv.width = cols;
      cv.height = rows;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cols, rows);
      // the stripes are designed for a long button (about 160 pixels wide): on a shorter one they get thinner, and some are left out
      const scale = Math.min(1.1, Math.max(0.4, cols / 160));
      const list = cols < 110 ? GLINTS.filter((_, i) => i % 2 === 0) : GLINTS;
      for (const gl of list) {
        const g = { at: gl.at, w: Math.max(1, Math.round(gl.w * scale)) };
        const x0 = Math.round(g.at * cols);
        for (let y = 0; y < rows; y++) {
          const shift = Math.floor((rows - 1 - y) * SLANT); // lower rows sit further left
          ctx.fillStyle = `rgba(255,255,255,${g.w > 5 ? 0.78 : 0.62})`;
          ctx.fillRect(x0 + shift, y, g.w, 1);
        }
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(a);
    void document.fonts?.ready.then(paint);
    return () => ro.disconnect();
  }, [label]);

  const inner = (
    <>
      <canvas ref={glints} className="pix-glints" aria-hidden="true" />
      <PixelLabel text={label} />
    </>
  );

  if (submit || onClick) {
    return (
      <button ref={link as React.RefObject<HTMLButtonElement>} type={submit ? "submit" : "button"} className="pix-btn" disabled={disabled} aria-label={label} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return (
    <a
      ref={link as React.RefObject<HTMLAnchorElement>}
      className="pix-btn"
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={(e) => {
        // a link to another page of this site (like "/contact") changes page without reloading
        if (href?.startsWith("/") && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          wipeTo(href); // with the rainbow page-change animation
        }
      }}
      aria-label={label}
    >
      {inner}
    </a>
  );
}