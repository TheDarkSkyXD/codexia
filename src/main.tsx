import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import "./App.css";
import { UpdateChecker } from "./components/UpdateChecker";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
      {import.meta.env.PROD && <UpdateChecker />}
    </ThemeProvider>
  </React.StrictMode>,
);
