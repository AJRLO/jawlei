import raw from "./site.json";

// Everything editable on the site lives in site.json. The admin app (/admin, dev server only) edits that file.

export type Shape = "circle" | "square" | "half" | "ring" | "stripes" | "diamond" | "pixels";
export const SHAPES: Shape[] = ["circle", "square", "half", "ring", "stripes", "diamond", "pixels"];

export interface Piece {
  bg: string; // placeholder colour, shown until an image is uploaded
  fg: string;
  src?: string; // uploaded image, e.g. "/work/avi-1.png"
}

export interface Section {
  id: string; // used for the #anchor link
  title: string;
  note: string;
  ratio: string; // CSS aspect-ratio of every tile, e.g. "16 / 9"
  cols: number; // tiles per row on a landscape screen
  pieces: Piece[];
}

export interface RingCard extends Piece {
  shape: Shape;
}

// How one of the two name lines (first / last) looks. `font` is a built-in font id or the id of an uploaded font.
export interface NameStyle {
  font: string;
  color: string;
  size: number; // percent of the normal name size
}

// A font file the admin uploaded (stored in public/fonts/custom).
export interface CustomFont {
  id: string;
  label: string;
  file: string; // e.g. "/fonts/custom/my-font-abc.otf"
}

export interface FontChoice {
  id: string;
  label: string;
  family: string;
  weight: number;
  spacing: string;
}

export const BUILT_IN_FONTS: FontChoice[] = [
  { id: "sans", label: "Bold sans (Montserrat)", family: '"Gotham", "Gotham SSm", "Montserrat", system-ui, sans-serif', weight: 700, spacing: "-0.04em" },
  { id: "pixel", label: "Pixel italic (supplied font)", family: '"NewPixel", serif', weight: 400, spacing: "0" },
  { id: "minecraft", label: "Minecraft", family: '"Minecraft", monospace', weight: 400, spacing: "0" },
];

// The CSS family name an uploaded font is registered under.
export const customFamily = (id: string) => `Custom ${id}`;

// Everything a name line needs from its font choice (built-in or uploaded).
export function fontFor(id: string, custom: CustomFont[]): FontChoice {
  const builtIn = BUILT_IN_FONTS.find((f) => f.id === id);
  if (builtIn) return builtIn;
  const c = custom.find((f) => f.id === id);
  if (c) return { id, label: c.label, family: `"${customFamily(c.id)}", sans-serif`, weight: 400, spacing: "0" };
  return BUILT_IN_FONTS[0];
}

export interface SiteContent {
  fonts?: CustomFont[];
  services: {
    label: string;
    title: string;
    items: { title: string; text: string }[];
  };
  clients: {
    label: string;
    items: { name: string; src?: string }[]; // one box each in the scrolling strip: a logo (or the name, if there is no logo yet). Empty hides the strip.
  };
  home: {
    tagline: string[];
    madeMeta: string[];
    footer: string; // the copyright line
    footerTitle: string; // big line at the top of the footer
    footerStatus: string; // small blinking-dot line above it (e.g. "AVAILABLE FOR NEW PROJECTS"); empty hides it

    ringText: string;
    cards: RingCard[];
  };
  about: {
    label: string;
    firstName: string;
    lastName: string;
    meta: string[];
    paragraphs: string[];
    contactLabel: string; // text of the button that opens the contact page
    firstStyle?: NameStyle;
    lastStyle?: NameStyle;
    nameOverlap?: number; // how far the second name line tucks up under the first, in % of its height
  };
  contact: {
    label: string;
    title: string;
    intro: string;
    email: string; // leave empty to hide the email row
    formKey: string; // access key from the form service (see the admin's Contact tab); the form is hidden until this is set
    formEndpoint: string; // where the form posts to (the Web3Forms address by default)
    formSubject: string; // subject line of the emails you receive
    links: { label: string; href: string; note: string }[];
  };
  work: {
    label: string;
    title: string;
    behanceLabel: string; // the button at the bottom of the work page
    behanceHref: string;
    sections: Section[];
  };
}

export const RATIOS = [
  { value: "1 / 1", label: "Square (1:1)" },
  { value: "3 / 1", label: "Wide banner (3:1)" },
  { value: "16 / 9", label: "Landscape (16:9)" },
  { value: "4 / 3", label: "Classic (4:3)" },
  { value: "4 / 5", label: "Portrait (4:5)" },
];

export const content = raw as unknown as SiteContent;

export const DEFAULT_FIRST_STYLE: NameStyle = { font: "pixel", color: "#0e3a8a", size: 128 };
export const DEFAULT_FORM_ENDPOINT = "https://api.web3forms.com/submit";
export const DEFAULT_NAME_OVERLAP = 35;
export const DEFAULT_LAST_STYLE: NameStyle = { font: "sans", color: "#000000", size: 100 };
