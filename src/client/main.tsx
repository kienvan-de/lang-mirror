import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n"; // side-effect: init i18next before render
import "./styles/index.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Dismiss the inline splash screen after React has painted.
// The CSS transition (opacity 0.3s) handles the fade-out.
requestAnimationFrame(() => {
  const splash = document.getElementById("splash");
  if (splash) {
    splash.classList.add("hide");
    splash.addEventListener("transitionend", () => splash.remove());
  }
});
