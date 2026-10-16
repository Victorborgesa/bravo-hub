import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/motion.css";
import "./styles/editor.css";
import "./styles/vision.css";
import { installPointerGlow } from "./lib/motion";
import { App } from "./App";
import { useSpaces } from "./store/spaces";
import { useRuns } from "./store/runs";

// Só em desenvolvimento: deixa os testes visuais simularem estados (ex.: gerando).
if (import.meta.env.DEV) Object.assign(window, { __bravo: { useSpaces, useRuns } });

installPointerGlow();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
