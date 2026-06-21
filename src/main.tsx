import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerServiceWorker } from "./service-worker";

const appElement = document.querySelector<HTMLElement>("#app");

if (!appElement) {
  throw new Error("Missing #app element");
}

createRoot(appElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
