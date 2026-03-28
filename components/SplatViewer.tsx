"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SplatMesh, SparkRenderer, SparkControls } from "@sparkjsdev/spark";

const SPLAT_URL = "splats/model.spz";

export default function SplatViewer() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ── 1. Scene & Camera ─────────────────────────────────────────
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1, 4); // Start position inside the environment

    // ── 2. Renderer ────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // ── 3. Spark – manages splat sorting & rendering ───────────────
    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    // ── 4. Load the Gaussian Splat environment ─────────────────────
    const splatMesh = new SplatMesh({ url: SPLAT_URL });
    splatMesh.position.set(0, 0, 0);
    scene.add(splatMesh);

    // ── 5. SparkControls – FPS navigation (WASD + mouse) ──────────
    //       Click the canvas to lock the pointer, then:
    //       W/A/S/D  – move,  Mouse – look around
    //       Shift    – speed boost,  Ctrl – slow down
    const controls = new SparkControls({ canvas: renderer.domElement });

    // ── 6. Resize handler ──────────────────────────────────────────
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── 7. Render loop ─────────────────────────────────────────────
    let lastTime = performance.now();

    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000; // seconds
      lastTime = now;

      controls.update(camera, delta); // Move camera with input
      renderer.render(scene, camera);
    });

    // ── Cleanup on unmount ─────────────────────────────────────────
    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Three.js canvas mounts here */}
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* HUD overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          color: "white",
          background: "rgba(0,0,0,0.5)",
          padding: "8px 14px",
          borderRadius: 8,
          fontSize: 13,
          fontFamily: "monospace",
          pointerEvents: "none",
        }}
      >
        🖱 Click to capture mouse &nbsp;|&nbsp; WASD move &nbsp;|&nbsp; Mouse
        look &nbsp;|&nbsp; Shift = fast &nbsp;|&nbsp; Esc = release
      </div>
    </div>
  );
}