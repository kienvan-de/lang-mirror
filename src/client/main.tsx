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

// NOTE: The inline splash screen (#splash) is dismissed by RootLayout once
// auth resolves and real content is ready — NOT here. Dismissing here via
// requestAnimationFrame fires before React has committed to the DOM, causing
// a white flash between the splash and the first meaningful paint.
