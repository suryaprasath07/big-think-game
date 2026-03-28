"use client";

import dynamic from "next/dynamic";

const SplatViewer = dynamic(() => import("@/components/SplatViewer"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "#aaa" }}>
      Loading environment…
    </div>
  ),
});

export default function SplatViewerWrapper() {
  return <SplatViewer />;
}