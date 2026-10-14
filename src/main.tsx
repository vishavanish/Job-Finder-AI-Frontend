import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/screens.css";
import App from "./app/App";

async function start() {
  // Inline env check (not the USE_MOCKS constant) so Vite replaces it at build time and
  // drops the MSW chunk from bundles built with VITE_USE_MOCKS=false.
  if (import.meta.env.VITE_USE_MOCKS === "true") {
    const { startMockWorker } = await import("./mocks/browser");
    await startMockWorker();
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
