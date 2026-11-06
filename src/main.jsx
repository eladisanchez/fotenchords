import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/atkinson-hyperlegible/400";
import "@fontsource/atkinson-hyperlegible/400-italic";
import "@fontsource/atkinson-hyperlegible/700";
import "@fontsource/atkinson-hyperlegible-mono/500";
import "@fontsource/atkinson-hyperlegible-mono/700";
import "@fontsource/big-shoulders-display/700";
import "@fontsource/big-shoulders-display/800";
import "./styles/app.css";
import "./styles/sheet.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
