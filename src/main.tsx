import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Exposes the zoom level so CSS can keep the film grain a constant size in real screen pixels.
const syncDpr = () => document.documentElement.style.setProperty("--dpr", String(window.devicePixelRatio || 1));
syncDpr();
window.addEventListener("resize", syncDpr);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);