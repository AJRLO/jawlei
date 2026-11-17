import { useRef, useState } from "react";
import type { FormEvent } from "react";
import PixelButton from "./PixelButton";
import SentOverlay from "./SentOverlay";
import { content, DEFAULT_FORM_ENDPOINT } from "../content";

// Contact form. Messages are posted to a form-to-email service (Web3Forms by default, or any service that takes the same
// JSON, such as Formspree), which forwards them to your inbox. The form only appears once an access key is set in the admin.
type State = "idle" | "sending" | "sent" | "error";
type Errors = Partial<Record<"name" | "email" | "message", string>>;

// Our own checks, so the messages look like the rest of the site (the browser's built-in bubbles can't be styled).
function check(d: FormData): Errors {
  const e: Errors = {};
  const email = String(d.get("email") ?? "").trim();
  if (!String(d.get("name") ?? "").trim()) e.name = "PLEASE ENTER YOUR NAME";
  if (!email) e.email = "PLEASE ENTER YOUR EMAIL";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "THAT EMAIL DOES NOT LOOK RIGHT";
  if (!String(d.get("message") ?? "").trim()) e.message = "PLEASE WRITE A MESSAGE";
  return e;
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <span id={id} className="pix-field-error" role="alert">
      <i className="pix-bang" aria-hidden="true">!</i>
      {text}
    </span>
  );
}

export default function ContactForm() {
  const c = content.contact;
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const form = useRef<HTMLFormElement>(null);
  const [celebrate, setCelebrate] = useState(false); // the full-screen "sent" animation is playing

  const endpoint = c.formEndpoint || DEFAULT_FORM_ENDPOINT;
  if (!c.formKey && endpoint === DEFAULT_FORM_ENDPOINT) return null; // not set up yet: show nothing

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const data = new FormData(form.current!);
    if (data.get("botcheck")) {
      setCelebrate(true); // a bot filled the hidden field: pretend it worked
      return;
    }
    const problems = check(data);
    setErrors(problems);
    const first = (["name", "email", "message"] as const).find((k) => problems[k]);
    if (first) {
      form.current?.querySelector<HTMLElement>(`[name=${first}]`)?.focus(); // take them to the first thing to fix
      return;
    }
    setState("sending");
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: c.formKey,
          subject: c.formSubject || "New message from my website",
          from_name: String(data.get("name") ?? ""),
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          message: String(data.get("message") ?? ""),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) throw new Error(body.message || "It did not send.");
      form.current?.reset();
      setState("idle");
      setCelebrate(true); // the page switches to the "sent" card while the screen is covered
    } catch (err) {
      setError(err instanceof Error ? err.message : "It did not send.");
      setState("error");
    }
  };

  return (
    <section className="contact-form-wrap" aria-labelledby="send-title">
      <div className="work-group-head">
        <h2 id="send-title">SEND A MESSAGE</h2>
        <p>I read everything</p>
      </div>

      {celebrate && <SentOverlay onCovered={() => setState("sent")} onDone={() => setCelebrate(false)} />}
      {state === "sent" ? (
        <div className="pix-done" role="status">
          <div className="pix-done-face">
            <span className="pix-check" aria-hidden="true">
              <svg viewBox="0 0 12 8" shapeRendering="crispEdges">
                <path d="M10 0h2v1h-2zM9 1h3v1H9zM8 2h3v1H8zM0 3h2v1H0zM7 3h3v1H7zM0 4h3v1H0zM6 4h3v1H6zM1 5h3v1H1zM5 5h3v1H5zM2 6h5v1H2zM3 7h3v1H3z" />
              </svg>
            </span>
            <div className="pix-done-body">
              <p className="pix-done-title">SENT!</p>
              <p className="pix-done-text">Thanks for the message. I'll get back to you soon.</p>
              <PixelButton label="SEND ANOTHER" onClick={() => setState("idle")} />
            </div>
          </div>
        </div>
      ) : (
        <form
          ref={form}
          className="contact-form"
          onSubmit={submit}
          noValidate
          onInput={(e) => {
            const n = (e.target as HTMLInputElement).name as keyof Errors;
            if (errors[n]) setErrors((prev) => ({ ...prev, [n]: undefined })); // the message goes as soon as they start fixing it
          }}
        >
          {/* hidden field that only bots fill in */}
          <input type="text" name="botcheck" tabIndex={-1} autoComplete="off" className="pix-honey" aria-hidden="true" />
          <div className="contact-form-row">
            <label className="pix-field">
              <span className="pix-field-label">NAME</span>
              <span className={"pix-box" + (errors.name ? " invalid" : "")}>
                <input name="name" type="text" maxLength={120} autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "err-name" : undefined} />
              </span>
              <FieldError id="err-name" text={errors.name} />
            </label>
            <label className="pix-field">
              <span className="pix-field-label">EMAIL</span>
              <span className={"pix-box" + (errors.email ? " invalid" : "")}>
                <input name="email" type="email" maxLength={200} autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "err-email" : undefined} />
              </span>
              <FieldError id="err-email" text={errors.email} />
            </label>
          </div>
          <label className="pix-field">
            <span className="pix-field-label">MESSAGE</span>
            <span className={"pix-box" + (errors.message ? " invalid" : "")}>
              <textarea name="message" rows={6} maxLength={5000} aria-invalid={!!errors.message} aria-describedby={errors.message ? "err-message" : undefined} />
            </span>
            <FieldError id="err-message" text={errors.message} />
          </label>
          <div className="contact-form-actions">
            <PixelButton submit label={state === "sending" ? "SENDING..." : "SEND MESSAGE"} disabled={state === "sending"} />
            {state === "error" && (
              <p className="pix-error" role="alert">
                Sorry, that did not send ({error}). Please try again.
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}