import "reflect-metadata";
import "@radix-ui/themes/styles.css";
import { Providers } from "@components/Providers";
import App from "@renderer/App";
import { initializeRendererErrorHandling } from "@renderer/lib/error-handling";
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/globals.css";

// Initialize error handling early, before React renders
initializeRendererErrorHandling();

document.title = import.meta.env.DEV ? "Array (Development)" : "Array";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
