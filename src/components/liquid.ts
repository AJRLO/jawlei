// The liquid pixel blob used by the menu and by the image viewer: a soft, colourful rim leads, a second blob follows, and
// the blob swells from the middle of the screen until it fills the page. One low-res canvas pixel = one big square.

export const GROW_MS = 950; // how long one blob takes to fill the screen
export const LAG_MS = 260; // the second blob trails the colourful one by this much
export const TOTAL_MS = GROW_MS + LAG_MS;
export const SHOW_AFTER_MS = 780; // the white has reached the menu links by about now
const BAND = 2.6; // softness: how many squares wide the faded rim of the blob is

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t: number) => t * t * (3 - 2 * t);

// Wobble of the outline: a few waves of different sizes and speeds, which is what makes it look liquid.
const WAVES = [
  { k: 2, amp: 0.07, speed: 1.6 },
  { k: 3, amp: 0.055, speed: -2.1 },
  { k: 5, amp: 0.035, speed: 2.8 },
  { k: 7, amp: 0.022, speed: -3.4 },
];

// The colourful rim: these blend into each other and loop around.
const PALETTE: [number, number, number][] = [
  [255, 230, 0],
  [255, 62, 165],
  [177, 60, 255],
  [47, 107, 255],
  [46, 230, 255],
  [125, 255, 178],
];

function paletteAt(t: number): [number, number, number] {
  const n = PALETTE.length;
  const p = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(p);
  const f = smooth(p - i);
  const a = PALETTE[i % n];
  const b = PALETTE[(i + 1) % n];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export const randomPhases = () => WAVES.map(() => Math.random() * Math.PI * 2);
export const zeroPhases = () => WAVES.map(() => 0);

// Size of the grid of squares for a window of w x h.
export function liquidGrid(w: number, h: number) {
  const cols = w > h ? 64 : 36;
  const cell = w / cols;
  const rows = Math.ceil(h / cell) + 1;
  return { cols, cell, rows };
}

const ripple = (p: number) => 0.2 + 1.9 * Math.pow(Math.sin(Math.PI * clamp(p)), 1.2) * (1 - clamp((p - 0.85) / 0.15));

// The shape of the blob for one moment: for every square, how much the colourful lead covers it (aL), how much the
// following blob covers it (aM), and the rainbow colour there.
function makeField(w: number, h: number, phases: number[]) {
  const { cols, cell, rows } = liquidGrid(w, h);
  const cx = cols / 2;
  const cy = h / 2 / cell;
  const rMax = Math.hypot(Math.max(cx, cols - cx), Math.max(cy, h / cell - cy)) * 1.4;

  const each = (
    progress: number,
    nowSeconds: number,
    visit: (i: number, aL: number, aM: number, r: number, g: number, b: number) => void,
  ) => {
    const ms = progress * TOTAL_MS;
    const pLead = ease(clamp(ms / GROW_MS));
    const pMain = ease(clamp((ms - LAG_MS) / GROW_MS));
    const time = nowSeconds;
    const rl = rMax * pLead;
    const rm = rMax * pMain;
    const wl = ripple(pLead);
    const wm = ripple(pMain);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        let sl = 0;
        let sm = 0;
        for (let j = 0; j < WAVES.length; j++) {
          const wave = WAVES[j];
          sl += wave.amp * Math.sin(wave.k * ang + phases[j] + time * wave.speed);
          sm += wave.amp * Math.sin(wave.k * ang + phases[j] + (time + 0.4) * wave.speed);
        }
        // soft rim: alpha fades over BAND squares instead of cutting off
        const aL = rl < 0.5 ? 0 : smooth(clamp((rl * (1 + sl * wl) - dist) / BAND + 0.5));
        const aM = rm < 0.5 ? 0 : smooth(clamp((rm * (1 + sm * wm) - dist) / BAND + 0.5));
        const [r, g, b] = paletteAt(ang / (Math.PI * 2) + 0.5 + time * 0.07 + (dist / rMax) * 0.9);
        visit(y * cols + x, aL, aM, r, g, b);
      }
    }
  };
  return { cols, cell, rows, each };
}

// The menu's blob: rainbow lead with a white blob following. Returns a painter for the canvas.
// `progress` runs 0..1 over TOTAL_MS; `nowSeconds` drives the wobble and colours.
export function createLiquid(cv: HTMLCanvasElement, w: number, h: number, phases: number[]) {
  const ctx = cv.getContext("2d")!;
  const field = makeField(w, h, phases);
  const img = ctx.createImageData(field.cols, field.rows);

  return (progress: number, nowSeconds: number) => {
    const data = img.data;
    field.each(progress, nowSeconds, (idx, aL, aM, r, g, b) => {
      const i = idx * 4;
      const alpha = aM + aL * (1 - aM);
      if (alpha <= 0.002) {
        data[i + 3] = 0;
        return;
      }
      const k = (aL * (1 - aM)) / alpha; // white over the colour: only the colour that is left shows through
      const wv = (255 * aM) / alpha;
      data[i] = wv + r * k;
      data[i + 1] = wv + g * k;
      data[i + 2] = wv + b * k;
      data[i + 3] = alpha * 255;
    });
    ctx.putImageData(img, 0, 0);
  };
}

// A page-change wipe: just the rainbow blob, no white in it. It swells until the rainbow covers the whole screen, and
// shrinks away again to show what is underneath. `out` is a full-size canvas (w x h CSS pixels at `scale` device pixels).
export function createLiquidWipe(out: HTMLCanvasElement, w: number, h: number, scale: number, phases: number[]) {
  const field = makeField(w, h, phases);
  const ctx = out.getContext("2d")!;
  const low = document.createElement("canvas");
  low.width = field.cols;
  low.height = field.rows;
  const lowCtx = low.getContext("2d")!;
  const img = lowCtx.createImageData(field.cols, field.rows);
  const spanW = field.cols * field.cell * scale;
  const spanH = field.rows * field.cell * scale;
  return (progress: number, nowSeconds: number) => {
    const d = img.data;
    field.each(progress, nowSeconds, (idx, aL, _aM, r, g, b) => {
      const i = idx * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = aL * 255;
    });
    lowCtx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.imageSmoothingEnabled = false; // every cell stays one hard square
    ctx.drawImage(low, 0, 0, spanW, spanH);
  };
}

// The image viewer's blob: the same shape and rainbow rim, but the second blob is a MASK. Whatever `content` holds (a
// white page with the picture on it) is revealed through the blob as it grows, with the rainbow leading the edge.
// `out` is a full-size canvas (w x h CSS pixels, drawn at `scale` device pixels per CSS pixel).
export function createLiquidReveal(out: HTMLCanvasElement, w: number, h: number, scale: number, phases: number[]) {
  const field = makeField(w, h, phases);
  const ctx = out.getContext("2d")!;
  const lowRim = document.createElement("canvas");
  const lowMask = document.createElement("canvas");
  lowRim.width = lowMask.width = field.cols;
  lowRim.height = lowMask.height = field.rows;
  const rimCtx = lowRim.getContext("2d")!;
  const maskCtx = lowMask.getContext("2d")!;
  const rimImg = rimCtx.createImageData(field.cols, field.rows);
  const maskImg = maskCtx.createImageData(field.cols, field.rows);
  const tmp = document.createElement("canvas");
  tmp.width = out.width;
  tmp.height = out.height;
  const tmpCtx = tmp.getContext("2d")!;
  const spanW = field.cols * field.cell * scale;
  const spanH = field.rows * field.cell * scale;

  return (progress: number, nowSeconds: number, content: HTMLCanvasElement) => {
    const rd = rimImg.data;
    const md = maskImg.data;
    field.each(progress, nowSeconds, (idx, aL, aM, r, g, b) => {
      const i = idx * 4;
      rd[i] = r;
      rd[i + 1] = g;
      rd[i + 2] = b;
      rd[i + 3] = aL * 255;
      md[i] = md[i + 1] = md[i + 2] = 255;
      md[i + 3] = aM * 255;
    });
    rimCtx.putImageData(rimImg, 0, 0);
    maskCtx.putImageData(maskImg, 0, 0);

    // the content, cut out by the mask
    tmpCtx.globalCompositeOperation = "source-over";
    tmpCtx.clearRect(0, 0, tmp.width, tmp.height);
    tmpCtx.drawImage(content, 0, 0);
    tmpCtx.globalCompositeOperation = "destination-in";
    tmpCtx.imageSmoothingEnabled = false; // each mask pixel stays one hard square
    tmpCtx.drawImage(lowMask, 0, 0, spanW, spanH);

    // rainbow underneath, the revealed content on top
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lowRim, 0, 0, spanW, spanH);
    ctx.drawImage(tmp, 0, 0);
  };
}
