"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const SplatViewer = dynamic(() => import("@/components/SplatViewer"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "#aaa" }}>
      Loading environment…
    </div>
  ),
});

export default function SplatViewerWrapper() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("[SplatViewerWrapper] Component mounted");
    window.addEventListener("error", (event) => {
      console.error("[SplatViewerWrapper] Global error:", event);
      setError(`Error: ${event.message}`);
    });
  }, []);

  if (error) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "#f00", fontFamily: "monospace" }}>
        {error}
      </div>
    );
  }

  return <SplatViewer />;
}