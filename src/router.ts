import { useSyncExternalStore } from "react";

// Tiny client-side router: two pages ("/" and "/work"), no library needed.
const EVENT = "navchange";

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("popstate", cb);
  };
};

const getPath = () => (window.location.pathname.replace(/\/+$/, "") || "/");

export function usePath() {
  return useSyncExternalStore(subscribe, getPath, () => "/");
}

export function navigate(path: string) {
  if (getPath() !== path) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new Event(EVENT));
  }
}
