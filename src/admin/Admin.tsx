import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { BUILT_IN_FONTS, DEFAULT_FORM_ENDPOINT, DEFAULT_FIRST_STYLE, DEFAULT_LAST_STYLE, DEFAULT_NAME_OVERLAP, RATIOS, SHAPES } from "../content";
import type { NameStyle, Piece, RingCard, Section, Shape, SiteContent } from "../content";
import "./admin.css";

// The admin app: edit the site's content (work, about, home) and upload images. It talks to the dev-server API in
// admin-api.ts, which writes src/content/site.json and public/work. Open it at /admin while `npm run dev` is running.

type Tab = "work" | "about" | "contact" | "home";

// Present only inside the desktop app (electron/preload.ts); undefined when the admin is opened in a browser.
interface DesktopBridge {
  getProject: () => Promise<string>;
  chooseProject: () => Promise<string>;
  preview: () => Promise<{ ok: boolean; error?: string }>;
  build: () => Promise<{ ok: boolean; log: string; dist: string }>;
}
const desktop = (window as unknown as { jawlei?: DesktopBridge }).jawlei;
type Upload = (file: File) => Promise<string>;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
};
const imagesIn = (d: SiteContent) =>
  new Set(
    [
      ...[...d.work.sections.flatMap((s) => s.pieces), ...d.home.cards].map((p) => p.src),
      ...d.clients.items.map((c) => c.src),
      ...(d.fonts ?? []).map((f) => f.file),
    ].filter((s): s is string => !!s),
  );

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

// ---- small building blocks ---------------------------------------------------------------------------------------

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="a-field">
      <span className="a-label">{label}</span>
      {children}
      {hint && <span className="a-hint">{hint}</span>}
    </label>
  );
}

function Text({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function IconBtn({ children, onClick, title, danger, disabled }: { children: ReactNode; onClick: () => void; title: string; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={"a-icon" + (danger ? " danger" : "")} onClick={onClick} title={title} aria-label={title} disabled={disabled}>
      {children}
    </button>
  );
}

// A list of short strings (add, remove, reorder), or longer paragraphs when `multiline` is set.
function StringList({ label, items, onChange, multiline, addLabel, hint }: { label: string; items: string[]; onChange: (v: string[]) => void; multiline?: boolean; addLabel: string; hint?: string }) {
  const set = (fn: (a: string[]) => void) => {
    const next = [...items];
    fn(next);
    onChange(next);
  };
  return (
    <div className="a-field">
      <span className="a-label">{label}</span>
      {hint && <span className="a-hint">{hint}</span>}
      {items.map((v, i) => (
        <div className="a-row" key={i}>
          {multiline ? (
            <textarea rows={4} value={v} onChange={(e) => set((a) => void (a[i] = e.target.value))} />
          ) : (
            <input value={v} onChange={(e) => set((a) => void (a[i] = e.target.value))} />
          )}
          <IconBtn title="Move up" onClick={() => set((a) => move(a, i, -1))} disabled={i === 0}>↑</IconBtn>
          <IconBtn title="Move down" onClick={() => set((a) => move(a, i, 1))} disabled={i === items.length - 1}>↓</IconBtn>
          <IconBtn title="Remove" danger onClick={() => set((a) => void a.splice(i, 1))}>✕</IconBtn>
        </div>
      ))}
      <button type="button" className="a-btn small" onClick={() => onChange([...items, ""])}>
        + {addLabel}
      </button>
    </div>
  );
}

// One piece of work (or one card on the home ring): preview, upload/replace, remove image, colours, move, delete.
function PieceCard<T extends Piece>({
  item, ratio, index, count, onChange, onMove, onDelete, upload, extra, onError,
}: {
  item: T; ratio: string; index: number; count: number;
  onChange: (patch: Partial<T>) => void; onMove: (d: number) => void; onDelete: () => void;
  upload: Upload; extra?: ReactNode; onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      onChange({ src: await upload(f) } as Partial<T>);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed.");
    }
    setBusy(false);
  };
  return (
    <div className="a-piece">
      <div className="a-thumb" style={{ aspectRatio: ratio, background: item.bg, color: item.fg }}>
        {item.src ? <img src={item.src} alt="" /> : <span>{String(index + 1).padStart(2, "0")}</span>}
        {busy && <div className="a-thumb-busy">Uploading…</div>}
      </div>
      <div className="a-piece-tools">
        <label className="a-btn small">
          {item.src ? "Replace" : "Upload"}
          <input type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
        </label>
        {item.src && <button type="button" className="a-btn small" onClick={() => onChange({ src: undefined } as Partial<T>)}>Remove image</button>}
      </div>
      {!item.src && (
        <div className="a-colors">
          <label>Fill <input type="color" value={item.bg} onChange={(e) => onChange({ bg: e.target.value } as Partial<T>)} /></label>
          <label>Mark <input type="color" value={item.fg} onChange={(e) => onChange({ fg: e.target.value } as Partial<T>)} /></label>
        </div>
      )}
      {extra}
      <div className="a-piece-move">
        <IconBtn title="Move earlier" onClick={() => onMove(-1)} disabled={index === 0}>←</IconBtn>
        <IconBtn title="Move later" onClick={() => onMove(1)} disabled={index === count - 1}>→</IconBtn>
        <IconBtn title="Delete" danger onClick={onDelete}>✕</IconBtn>
      </div>
    </div>
  );
}

// One brand in the client strip: logo preview, upload/replace/remove, the name (also read out for screen readers), move, delete.
function ClientCard({
  item, index, count, onChange, onMove, onDelete, upload, onError,
}: {
  item: { name: string; src?: string }; index: number; count: number;
  onChange: (patch: { name?: string; src?: string }) => void; onMove: (d: number) => void; onDelete: () => void;
  upload: Upload; onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      onChange({ src: await upload(f) });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed.");
    }
    setBusy(false);
  };
  return (
    <div className="a-piece">
      <div className="a-thumb a-logo" style={{ aspectRatio: "2 / 1" }}>
        {item.src ? <img src={item.src} alt="" /> : <span>{item.name || "NAME"}</span>}
        {busy && <div className="a-thumb-busy">Uploading…</div>}
      </div>
      <input value={item.name} placeholder="Brand name" aria-label="Brand name" onChange={(e) => onChange({ name: e.target.value })} />
      <div className="a-piece-tools">
        <label className="a-btn small">
          {item.src ? "Replace logo" : "Upload logo"}
          <input type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
        </label>
        {item.src && <button type="button" className="a-btn small" onClick={() => onChange({ src: undefined })}>Remove logo</button>}
      </div>
      <div className="a-piece-move">
        <IconBtn title="Move earlier" onClick={() => onMove(-1)} disabled={index === 0}>←</IconBtn>
        <IconBtn title="Move later" onClick={() => onMove(1)} disabled={index === count - 1}>→</IconBtn>
        <IconBtn title="Delete" danger onClick={onDelete}>✕</IconBtn>
      </div>
    </div>
  );
}
// ---- tabs --------------------------------------------------------------------------------------------------------

function WorkTab({ d, edit, upload, onError }: { d: SiteContent; edit: (fn: (c: SiteContent) => void) => void; upload: Upload; onError: (m: string) => void }) {
  const addFiles = async (si: number, files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    for (const f of imgs) {
      try {
        const src = await upload(f);
        edit((c) => void c.work.sections[si].pieces.push({ bg: "#e8e8ec", fg: "#111111", src }));
      } catch (e) {
        onError(e instanceof Error ? e.message : "Upload failed.");
      }
    }
  };

  return (
    <>
      <div className="a-card">
        <h2>Work page</h2>
        <div className="a-grid2">
          <Text label="Small label" value={d.work.label} onChange={(v) => edit((c) => void (c.work.label = v))} />
          <Text label="Big title" value={d.work.title} onChange={(v) => edit((c) => void (c.work.title = v))} />
        </div>
        <div className="a-grid2">
          <Text label="Behance button text" value={d.work.behanceLabel ?? ""} onChange={(v) => edit((c) => void (c.work.behanceLabel = v))} />
          <Text
            label="Behance button link"
            value={d.work.behanceHref ?? ""}
            hint="Shown at the bottom of the work page. Leave empty to hide the button."
            onChange={(v) => edit((c) => void (c.work.behanceHref = v))}
          />
        </div>
      </div>

      {d.work.sections.map((s: Section, si) => (
        <div className="a-card" key={si}>
          <div className="a-card-head">
            <h2>{s.title || "Untitled section"}</h2>
            <div className="a-row">
              <IconBtn title="Move section up" onClick={() => edit((c) => move(c.work.sections, si, -1))} disabled={si === 0}>↑</IconBtn>
              <IconBtn title="Move section down" onClick={() => edit((c) => move(c.work.sections, si, 1))} disabled={si === d.work.sections.length - 1}>↓</IconBtn>
              <IconBtn
                title="Delete section"
                danger
                onClick={() => window.confirm(`Delete the "${s.title}" section and its ${s.pieces.length} pieces?`) && edit((c) => void c.work.sections.splice(si, 1))}
              >✕</IconBtn>
            </div>
          </div>
          <div className="a-grid4">
            <Text
              label="Title"
              value={s.title}
              onChange={(v) =>
                edit((c) => {
                  const others = c.work.sections.filter((_, k) => k !== si).map((x) => x.id);
                  let id = slug(v);
                  for (let n = 2; others.includes(id); n++) id = `${slug(v)}-${n}`;
                  c.work.sections[si].title = v;
                  c.work.sections[si].id = id;
                })
              }
            />
            <Text label="Note" value={s.note} onChange={(v) => edit((c) => void (c.work.sections[si].note = v))} />
            <Field label="Tile shape">
              <select value={s.ratio} onChange={(e) => edit((c) => void (c.work.sections[si].ratio = e.target.value))}>
                {RATIOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Per row">
              <input type="number" min={1} max={6} value={s.cols} onChange={(e) => edit((c) => void (c.work.sections[si].cols = Math.min(6, Math.max(1, Number(e.target.value) || 1))))} />
            </Field>
          </div>

          <div
            className="a-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(si, e.dataTransfer.files);
            }}
          >
            {s.pieces.length === 0 && <p className="a-empty">No pieces yet. Drop images here or use Upload images.</p>}
            <div className="a-pieces">
              {s.pieces.map((p, pi) => (
                <PieceCard
                  key={pi}
                  item={p}
                  ratio={s.ratio}
                  index={pi}
                  count={s.pieces.length}
                  upload={upload}
                  onError={onError}
                  onChange={(patch) => edit((c) => void Object.assign(c.work.sections[si].pieces[pi], patch))}
                  onMove={(dir) => edit((c) => move(c.work.sections[si].pieces, pi, dir))}
                  onDelete={() => edit((c) => void c.work.sections[si].pieces.splice(pi, 1))}
                />
              ))}
            </div>
          </div>
          <div className="a-row">
            <label className="a-btn primary small">
              Upload images
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(si, e.target.files); e.target.value = ""; }} />
            </label>
            <button type="button" className="a-btn small" onClick={() => edit((c) => void c.work.sections[si].pieces.push({ bg: "#e8e8ec", fg: "#111111" }))}>
              + Blank placeholder
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="a-btn primary"
        onClick={() =>
          edit((c) => {
            let id = "new-section";
            for (let n = 2; c.work.sections.some((x) => x.id === id); n++) id = `new-section-${n}`;
            c.work.sections.push({ id, title: "NEW SECTION", note: "", ratio: "1 / 1", cols: 4, pieces: [] });
          })
        }
      >
        + Add section
      </button>
    </>
  );
}

// Font, colour and size for one of the two name lines.
function NameStyleEditor({ title, style, fonts, onChange }: { title: string; style: NameStyle; fonts: SiteContent["fonts"]; onChange: (patch: Partial<NameStyle>) => void }) {
  return (
    <div className="a-grid3">
      <Field label={`${title}: font`}>
        <select value={style.font} onChange={(e) => onChange({ font: e.target.value })}>
          {BUILT_IN_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          {(fonts ?? []).map((f) => <option key={f.id} value={f.id}>{f.label} (uploaded)</option>)}
        </select>
      </Field>
      <Field label={`${title}: colour`}>
        <input type="color" className="a-color" value={style.color} onChange={(e) => onChange({ color: e.target.value })} />
      </Field>
      <Field label={`${title}: size (${style.size}%)`}>
        <input type="range" min={60} max={170} step={2} value={style.size} onChange={(e) => onChange({ size: Number(e.target.value) })} />
      </Field>
    </div>
  );
}

function AboutTab({ d, edit, onError }: { d: SiteContent; edit: (fn: (c: SiteContent) => void) => void; onError: (m: string) => void }) {
  const a = d.about;
  const first = a.firstStyle ?? DEFAULT_FIRST_STYLE;
  const last = a.lastStyle ?? DEFAULT_LAST_STYLE;
  const [busy, setBusy] = useState(false);

  const addFont = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/upload?kind=font&name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      const label = f.name.replace(/\.[^.]+$/, "");
      edit((c) => void (c.fonts = [...(c.fonts ?? []), { id: `f${Date.now().toString(36)}`, label, file: body.path as string }]));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed.");
    }
    setBusy(false);
  };

  return (
    <>
      <div className="a-card">
        <h2>About</h2>
        <Text label="Small label" value={a.label} onChange={(v) => edit((c) => void (c.about.label = v))} />
        <div className="a-grid2">
          <Text label="First name" value={a.firstName} onChange={(v) => edit((c) => void (c.about.firstName = v))} />
          <Text label="Last name" value={a.lastName} onChange={(v) => edit((c) => void (c.about.lastName = v))} />
        </div>
        <NameStyleEditor title="First name" style={first} fonts={d.fonts} onChange={(p) => edit((c) => void (c.about.firstStyle = { ...first, ...p }))} />
        <NameStyleEditor title="Last name" style={last} fonts={d.fonts} onChange={(p) => edit((c) => void (c.about.lastStyle = { ...last, ...p }))} />
        <Field label={`Overlap between the two name lines (${a.nameOverlap ?? DEFAULT_NAME_OVERLAP}%)`}>
          <input type="range" min={-10} max={70} step={1} value={a.nameOverlap ?? DEFAULT_NAME_OVERLAP} onChange={(e) => edit((c) => void (c.about.nameOverlap = Number(e.target.value)))} />
        </Field>
        <StringList label="Details line (age, place, role…)" items={a.meta} addLabel="Add detail" onChange={(v) => edit((c) => void (c.about.meta = v))} />
        <StringList label="Bio paragraphs" hint="Put *stars* around words to set them in the pixel font, like *this*." items={a.paragraphs} multiline addLabel="Add paragraph" onChange={(v) => edit((c) => void (c.about.paragraphs = v))} />
        <Text label="Contact button text" hint="The button at the bottom of the About section. It opens the Contact page." value={a.contactLabel} onChange={(v) => edit((c) => void (c.about.contactLabel = v))} />
      </div>

      <div className="a-card">
        <h2>Fonts</h2>
        <p className="a-hint">Upload a font file (.ttf, .otf, .woff or .woff2) and it shows up in the font lists above. Built in: Bold sans, Pixel italic and Minecraft.</p>
        {(d.fonts ?? []).map((f, i) => (
          <div className="a-row" key={f.id}>
            <input value={f.label} onChange={(e) => edit((c) => void (c.fonts![i].label = e.target.value))} aria-label="Font name" />
            <IconBtn
              title="Remove font"
              danger
              onClick={() =>
                edit((c) => {
                  const gone = c.fonts![i].id;
                  c.fonts!.splice(i, 1);
                  // anything that was using it goes back to the default font
                  if (c.about.firstStyle?.font === gone) c.about.firstStyle.font = "sans";
                  if (c.about.lastStyle?.font === gone) c.about.lastStyle.font = "sans";
                })
              }
            >✕</IconBtn>
          </div>
        ))}
        <label className="a-btn small">
          {busy ? "Uploading…" : "+ Upload font"}
          <input type="file" accept=".ttf,.otf,.woff,.woff2" hidden onChange={(e) => { void addFont(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
    </>
  );
}
function ContactTab({ d, edit }: { d: SiteContent; edit: (fn: (c: SiteContent) => void) => void }) {
  const c = d.contact;
  return (
    <>
      <div className="a-card">
        <h2>Contact page</h2>
        <div className="a-grid2">
          <Text label="Small label" value={c.label} onChange={(v) => edit((x) => void (x.contact.label = v))} />
          <Text label="Big title" value={c.title} onChange={(v) => edit((x) => void (x.contact.title = v))} />
        </div>
        <Field label="Intro text">
          <textarea rows={3} value={c.intro} onChange={(e) => edit((x) => void (x.contact.intro = e.target.value))} />
        </Field>
        <Text label="Email address" hint="Shown as an EMAIL row that opens the visitor's mail app. Leave empty to hide it." value={c.email} onChange={(v) => edit((x) => void (x.contact.email = v))} />
      </div>

      <div className="a-card">
        <h2>Contact form</h2>
        <p className="a-hint">
          Visitors can send you a message from the Contact page and it arrives in your Gmail. Easiest way to set it up: go to web3forms.com, enter
          your Gmail address, and they email you an "access key". Paste that key below and save. The form stays hidden until a key is set.
        </p>
        <Text label="Access key" hint="From web3forms.com (it is safe for this to be public: it can only send mail to your address)." value={c.formKey ?? ""} onChange={(v) => edit((x) => void (x.contact.formKey = v.trim()))} />
        <div className="a-grid2">
          <Text label="Subject line of the emails you get" value={c.formSubject ?? ""} onChange={(v) => edit((x) => void (x.contact.formSubject = v))} />
          <Text label="Form service address (advanced)" hint="Leave as it is unless you use a different service, like Formspree." value={c.formEndpoint ?? DEFAULT_FORM_ENDPOINT} onChange={(v) => edit((x) => void (x.contact.formEndpoint = v.trim()))} />
        </div>
      </div>

      <div className="a-card">
        <h2>Links</h2>
        <p className="a-hint">Behance, Instagram, X, Discord… each one becomes a row on the Contact page.</p>
        {c.links.map((l, i) => (
          <div className="a-link-row" key={i}>
            <input value={l.label} placeholder="Name (e.g. BEHANCE)" onChange={(e) => edit((x) => void (x.contact.links[i].label = e.target.value))} aria-label="Link name" />
            <input value={l.href} placeholder="Address (https://…)" onChange={(e) => edit((x) => void (x.contact.links[i].href = e.target.value))} aria-label="Link address" />
            <input value={l.note} placeholder="Small note (optional)" onChange={(e) => edit((x) => void (x.contact.links[i].note = e.target.value))} aria-label="Link note" />
            <IconBtn title="Move up" onClick={() => edit((x) => move(x.contact.links, i, -1))} disabled={i === 0}>↑</IconBtn>
            <IconBtn title="Move down" onClick={() => edit((x) => move(x.contact.links, i, 1))} disabled={i === c.links.length - 1}>↓</IconBtn>
            <IconBtn title="Remove" danger onClick={() => edit((x) => void x.contact.links.splice(i, 1))}>✕</IconBtn>
          </div>
        ))}
        <button type="button" className="a-btn small" onClick={() => edit((x) => void x.contact.links.push({ label: "", href: "", note: "" }))}>
          + Add link
        </button>
      </div>
    </>
  );
}
function HomeTab({ d, edit, upload, onError }: { d: SiteContent; edit: (fn: (c: SiteContent) => void) => void; upload: Upload; onError: (m: string) => void }) {
  const h = d.home;
  return (
    <>
      <div className="a-card">
        <h2>Top and bottom text</h2>
        <StringList label="Top right text (shown with // between)" items={h.tagline} addLabel="Add phrase" onChange={(v) => edit((c) => void (c.home.tagline = v))} />
        <StringList label="Small text next to the logo" items={h.madeMeta} addLabel="Add line" onChange={(v) => edit((c) => void (c.home.madeMeta = v))} />
        <Text label="Footer copyright line" hint="The copyright symbol is added for you." value={h.footer} onChange={(v) => edit((c) => void (c.home.footer = v))} />
        <Text label="Big line at the top of the footer" value={h.footerTitle ?? ""} onChange={(v) => edit((c) => void (c.home.footerTitle = v))} />
        <Text label="Footer status line" hint="Small line with a blinking dot, e.g. AVAILABLE FOR NEW PROJECTS. Leave empty to hide it." value={h.footerStatus ?? ""} onChange={(v) => edit((c) => void (c.home.footerStatus = v))} />
      </div>

      <div className="a-card">
        <h2>Services</h2>
        <div className="a-grid2">
          <Text label="Small label" value={d.services.label} onChange={(v) => edit((c) => void (c.services.label = v))} />
          <Text label="Heading" value={d.services.title} onChange={(v) => edit((c) => void (c.services.title = v))} />
        </div>
        <p className="a-hint">Each one becomes a numbered card on the home page, under the About section. Remove them all to hide the section.</p>
        {d.services.items.map((s, i) => (
          <div className="a-svc-row" key={i}>
            <input value={s.title} placeholder="Name (e.g. THUMBNAILS)" onChange={(e) => edit((c) => void (c.services.items[i].title = e.target.value))} aria-label="Service name" />
            <textarea rows={2} value={s.text} placeholder="One or two sentences" onChange={(e) => edit((c) => void (c.services.items[i].text = e.target.value))} aria-label="Service description" />
            <IconBtn title="Move up" onClick={() => edit((c) => move(c.services.items, i, -1))} disabled={i === 0}>↑</IconBtn>
            <IconBtn title="Move down" onClick={() => edit((c) => move(c.services.items, i, 1))} disabled={i === d.services.items.length - 1}>↓</IconBtn>
            <IconBtn title="Remove" danger onClick={() => edit((c) => void c.services.items.splice(i, 1))}>✕</IconBtn>
          </div>
        ))}
        <button type="button" className="a-btn small" onClick={() => edit((c) => void c.services.items.push({ title: "", text: "" }))}>
          + Add service
        </button>
      </div>

      <div className="a-card">
        <h2>Client strip</h2>
        <Text label="Small label" value={d.clients.label} onChange={(v) => edit((c) => void (c.clients.label = v))} />
        <p className="a-hint">Each one is a pixel box that scrolls across the home page. Upload the brand's logo (a PNG with a transparent background looks best). The ones there now are placeholders that show just a name: replace or remove them. Remove them all to hide the strip.</p>
        <div className="a-pieces">
          {d.clients.items.map((cl, i) => (
            <ClientCard
              key={i}
              item={cl}
              index={i}
              count={d.clients.items.length}
              upload={upload}
              onError={onError}
              onChange={(patch) => edit((c) => void Object.assign(c.clients.items[i], patch))}
              onMove={(dir) => edit((c) => move(c.clients.items, i, dir))}
              onDelete={() => edit((c) => void c.clients.items.splice(i, 1))}
            />
          ))}
        </div>
        <button type="button" className="a-btn small" onClick={() => edit((c) => void c.clients.items.push({ name: "" }))}>
          + Add brand
        </button>
      </div>

      <div className="a-card">
        <h2>Scroll section</h2>
        <Text label="Text running round the circle" value={h.ringText} onChange={(v) => edit((c) => void (c.home.ringText = v))} />
        <p className="a-hint">The cards rotate in an arc and repeat, so a few cards are enough. Cards without an image show a colour and shape.</p>
        <div className="a-pieces">
          {h.cards.map((card: RingCard, i) => (
            <PieceCard
              key={i}
              item={card}
              ratio="70 / 95"
              index={i}
              count={h.cards.length}
              upload={upload}
              onError={onError}
              onChange={(patch) => edit((c) => void Object.assign(c.home.cards[i], patch))}
              onMove={(dir) => edit((c) => move(c.home.cards, i, dir))}
              onDelete={() => edit((c) => void c.home.cards.splice(i, 1))}
              extra={
                !card.src && (
                  <select value={card.shape} onChange={(e) => edit((c) => void (c.home.cards[i].shape = e.target.value as Shape))}>
                    {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )
              }
            />
          ))}
        </div>
        <button type="button" className="a-btn small" onClick={() => edit((c) => void c.home.cards.push({ bg: "#ff3ea5", fg: "#ffffff", shape: "circle" }))}>
          + Add card
        </button>
      </div>
    </>
  );
}

// ---- the app -----------------------------------------------------------------------------------------------------

export default function Admin() {
  const [saved, setSaved] = useState<SiteContent | null>(null);
  const [data, setData] = useState<SiteContent | null>(null);
  const [tab, setTab] = useState<Tab>("work");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState("");
  const [working, setWorking] = useState<"preview" | "build" | null>(null);

  useEffect(() => {
    void desktop?.getProject().then(setProject);
  }, []);

  const preview = async () => {
    setWorking("preview");
    setMsg({ kind: "ok", text: "Starting the preview…" });
    const r = await desktop!.preview();
    setMsg(r.ok ? { kind: "ok", text: "Preview opened in its own window." } : { kind: "err", text: r.error ?? "Preview failed." });
    setWorking(null);
  };

  const build = async () => {
    setWorking("build");
    setMsg({ kind: "ok", text: "Building the site…" });
    const r = await desktop!.build();
    setMsg(r.ok ? { kind: "ok", text: "Built. The finished site is in the dist folder (opened for you)." } : { kind: "err", text: `Build failed: ${r.log.slice(-300)}` });
    setWorking(null);
  };

  useEffect(() => {
    api("/content")
      .then((c: SiteContent) => {
        setSaved(c);
        setData(structuredClone(c));
      })
      .catch((e: Error) => setMsg({ kind: "err", text: `Could not load the content: ${e.message}. Is "npm run dev" running?` }));
  }, []);

  const dirty = useMemo(() => !!data && !!saved && JSON.stringify(data) !== JSON.stringify(saved), [data, saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = useCallback((fn: (c: SiteContent) => void) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setMsg(null);
  }, []);

  const upload: Upload = useCallback(async (file) => {
    const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Upload failed.");
    return body.path as string;
  }, []);

  const onError = useCallback((text: string) => setMsg({ kind: "err", text }), []);

  const save = async () => {
    if (!data || !saved) return;
    setSaving(true);
    try {
      await api("/content", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      // images that were removed or replaced are deleted from disk now that nothing points at them
      const keep = imagesIn(data);
      for (const old of imagesIn(saved)) if (!keep.has(old)) await api(`/upload?path=${encodeURIComponent(old)}`, { method: "DELETE" }).catch(() => undefined);
      setSaved(structuredClone(data));
      setMsg({ kind: "ok", text: "Saved. The site is updated." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Save failed." });
    }
    setSaving(false);
  };

  const discard = () => {
    if (saved && window.confirm("Throw away your unsaved changes?")) setData(structuredClone(saved));
  };

  return (
    <div className="adm">
      <header className="a-bar">
        <strong>Jawlei admin</strong>
        <nav className="a-tabs">
          {(["work", "about", "contact", "home"] as Tab[]).map((t) => (
            <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t === "work" ? "Work" : t === "about" ? "About" : t === "contact" ? "Contact" : "Home page"}
            </button>
          ))}
        </nav>
        <span className="a-spacer" />
        {msg && <span className={"a-msg " + msg.kind}>{msg.text}</span>}
        {dirty && !msg && <span className="a-msg">Unsaved changes</span>}
        {desktop ? (
          <>
            <button type="button" className="a-btn small" title={project} onClick={() => void desktop.chooseProject().then(setProject)}>Folder…</button>
            <button type="button" className="a-btn small" onClick={() => void preview()} disabled={!!working || dirty}>
              {working === "preview" ? "Starting…" : "Preview site"}
            </button>
            <button type="button" className="a-btn small" onClick={() => void build()} disabled={!!working || dirty}>
              {working === "build" ? "Building…" : "Build site"}
            </button>
          </>
        ) : (
          <a className="a-btn small" href="/" target="_blank" rel="noreferrer">View site</a>
        )}
        <button type="button" className="a-btn small" onClick={discard} disabled={!dirty || saving}>Discard</button>
        <button type="button" className="a-btn primary" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      <main className="a-main">
        {!data && !msg && <p>Loading…</p>}
        {data && tab === "work" && <WorkTab d={data} edit={edit} upload={upload} onError={onError} />}
        {data && tab === "about" && <AboutTab d={data} edit={edit} onError={onError} />}
        {data && tab === "contact" && <ContactTab d={data} edit={edit} />}
        {data && tab === "home" && <HomeTab d={data} edit={edit} upload={upload} onError={onError} />}
      </main>
    </div>
  );
}
