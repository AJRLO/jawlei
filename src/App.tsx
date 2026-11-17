import { Fragment, lazy, Suspense, useEffect, useRef } from "react";
import LogoMenu from "./components/LogoMenu";
import PixelButton from "./components/PixelButton";
import PixelShapes from "./components/PixelShapes";
import ScrollStory from "./components/ScrollStory";
import ContactPage from "./components/ContactPage";
import HomeMore from "./components/HomeMore";
import PageWipe from "./components/PageWipe";
import SiteFooter from "./components/SiteFooter";
import WorkPage from "./components/WorkPage";
import type { CSSProperties } from "react";
import { content, customFamily, DEFAULT_FIRST_STYLE, DEFAULT_LAST_STYLE, DEFAULT_NAME_OVERLAP, fontFor } from "./content";
import type { NameStyle } from "./content";
import { usePath } from "./router";

const SHAPES = true; // the floating pixel shapes behind the pages, on top of the soft glows

// The admin app only exists on the dev server; the production build leaves it out entirely.
const Admin = import.meta.env.DEV ? lazy(() => import("./admin/Admin")) : null;

// In the bio, words wrapped in *stars* are set in the pixel font.
function Bio({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*([^*]+)\*/g).map((part, i) =>
        i % 2 ? (
          <span className="px-word" key={i}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

// Look of one name line: font, colour and size all come from the admin.
function nameStyle(style: NameStyle): CSSProperties {
  const f = fontFor(style.font, content.fonts ?? []);
  return {
    fontFamily: f.family,
    fontWeight: f.weight,
    letterSpacing: f.spacing,
    color: style.color,
    fontSize: `${style.size}%`,
    zIndex: style.font === "sans" ? 1 : 2, // a line in a special font sits on top where the two overlap
  };
}

// Registers the font files uploaded in the admin.
function CustomFonts() {
  const fonts = content.fonts ?? [];
  if (!fonts.length) return null;
  const css = fonts.map((f) => `@font-face{font-family:"${customFamily(f.id)}";src:url("${f.file}");font-display:swap}`).join("");
  return <style>{css}</style>;
}

export default function App() {
  const path = usePath();
  const header = useRef<HTMLElement>(null);

  // The header slides away as you scroll down and comes back as soon as you scroll up (or are at the top).
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const el = header.current;
      if (!el) return;
      const y = window.scrollY;
      const delta = y - last;
      if (y < 60 || delta < -4 || document.querySelector('.menu')) el.classList.remove('hide'); // top of page, scrolling up, or the menu is open
      else if (delta > 4) el.classList.add('hide');
      if (Math.abs(delta) > 4) last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // each page starts at the top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  if (Admin && path === "/admin") {
    return (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    );
  }

  const { home, about } = content;

  return (
    <>
      <CustomFonts />
      <div className="bg" aria-hidden="true">
        {/* Two big soft rectangles of colour, one above the screen and one below, with grain on top. */}
        <div className="bg-glow bg-glow-top" />
        <div className="bg-glow bg-glow-bottom" />
        <div className="bg-noise-mask">
          <div className="bg-noise" />
        </div>
      </div>

      {/* The home page's big logo sits in its own layer behind everything, and the floating pixel shapes in the layer above it: so the shapes float over the logo but stay behind the cards and all other content. Set SHAPES to false to hide them. */}
      {path !== "/work" && path !== "/contact" && !(Admin && path === "/admin") && (
        <div className="bg-logo" aria-hidden="true">
          <img src="/jawlei-made.png" alt="" className="hero-logo" />
        </div>
      )}
      {SHAPES && (
        <div className="bg-shapes" aria-hidden="true">
          <PixelShapes />
        </div>
      )}

      {path === "/work" ? (
        <WorkPage />
      ) : path === "/contact" ? (
        <ContactPage />
      ) : (
        <>
          <ScrollStory />

          <section className="about">
            <p className="about-label">{about.label}</p>
            <h2 className="about-name" style={{ "--overlap": `${(about.nameOverlap ?? DEFAULT_NAME_OVERLAP) / 100}em` } as CSSProperties}>
              <span style={nameStyle(about.firstStyle ?? DEFAULT_FIRST_STYLE)}>{about.firstName}</span>
              <span style={nameStyle(about.lastStyle ?? DEFAULT_LAST_STYLE)}>{about.lastName}</span>
            </h2>
            <ul className="about-meta">
              {about.meta.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>

            <div className="about-bottom">
              <div className="about-text">
                {about.paragraphs.map((p, i) => (
                  <p key={i}>
                    <Bio text={p} />
                  </p>
                ))}
              </div>
              <PixelButton href="/contact" label={about.contactLabel} />
            </div>
          </section>
          <HomeMore />
        </>
      )}

      <header className="site-top" ref={header}>
        <p className="top-mark">
          <LogoMenu />
          <span className="top-mark-meta">
            {home.madeMeta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </span>
        </p>
        <p className="top-tag">
          {home.tagline.map((t, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="top-slash">//</span>}
              <span>{t}</span>
            </Fragment>
          ))}
        </p>
      </header>

      <SiteFooter />
      <PageWipe />
    </>
  );
}
