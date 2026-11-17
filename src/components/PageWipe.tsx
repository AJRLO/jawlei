import { useEffect, useState } from "react";
import SentOverlay from "./SentOverlay";
import { navigate } from "../router";

// A page change with the rainbow blob: it swells over the whole screen, the page switches while it covers everything,
// and then it closes out to show the new page. Call wipeTo("/work") instead of navigate("/work").
const EVENT = "pagewipe";

// before: runs once the screen is covered, just before the page changes (e.g. to shut the menu). after: runs once the new page is there.
interface Wipe {
  path: string;
  before?: () => void;
  after?: () => void;
}
export const wipeTo = (path: string, extra: { before?: () => void; after?: () => void } = {}) =>
  window.dispatchEvent(new CustomEvent<Wipe>(EVENT, { detail: { path, ...extra } }));

// Mounted once, in App.
export default function PageWipe() {
  const [wipe, setWipe] = useState<Wipe | null>(null);

  useEffect(() => {
    const on = (e: Event) => setWipe((cur) => cur ?? (e as CustomEvent<Wipe>).detail); // ignore clicks while one is already playing
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  if (!wipe) return null;
  return (
    <SentOverlay
      tick={false}
      hold={900} // long enough to see the figure run
      onCovered={() => {
        wipe.before?.();
        navigate(wipe.path);
        window.scrollTo(0, 0); // also when the link goes to the page you are already on
        if (wipe.after) window.setTimeout(wipe.after, 60); // the new page has to render first
      }}
      onDone={() => setWipe(null)}
    />
  );
}
