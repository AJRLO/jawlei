import ContactForm from "./ContactForm";
import Morph from "./Morph";
import PixelCover from "./PixelCover";
import { content } from "../content";

// The /contact page. Everything on it comes from the admin (Contact tab): the intro, the email and the list of links.
export default function ContactPage() {
  const c = content.contact;
  const rows = [
    ...(c.email ? [{ label: "EMAIL", href: `mailto:${c.email}`, note: c.email }] : []),
    ...c.links.filter((l) => l.label && l.href),
  ];
  return (
    <main className="work contact">
      <p className="work-label">{c.label}</p>
      <h1 className="work-title">
        <Morph text={c.title} />
        <PixelCover rows={10} />
      </h1>

      {c.intro && <p className="contact-intro">{c.intro}</p>}

      <ul className="contact-rows">
        {rows.map((r, i) => {
          const web = /^https?:/i.test(r.href);
          return (
            <li key={i}>
              <a className="contact-row" href={r.href} {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                <span className="contact-row-label">
                  <Morph text={r.label} />
                </span>
                {r.note && <span className="contact-row-note">{r.note}</span>}
              </a>
            </li>
          );
        })}
      </ul>

      <ContactForm />
    </main>
  );
}