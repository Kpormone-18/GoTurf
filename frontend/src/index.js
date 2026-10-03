import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

// Deliver resize updates on the next frame. This prevents nested layout work
// from causing Safari's ResizeObserver notification loop on narrow screens.
const NativeResizeObserver = window.ResizeObserver;
if (NativeResizeObserver) {
  window.ResizeObserver = class FrameResizeObserver extends NativeResizeObserver {
    constructor(callback) {
      let pending = false;
      let latestEntries = [];
      super((entries, observer) => {
        latestEntries = entries;
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(() => {
          pending = false;
          callback(latestEntries, observer);
        });
      });
    }
  };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
