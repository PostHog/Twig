import "reflect-metadata";
import "@radix-ui/themes/styles.css";
import { Providers } from "@components/Providers";
import App from "@renderer/App";
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/globals.css";

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
