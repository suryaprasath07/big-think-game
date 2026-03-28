"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const SPLAT_URL = "splats/model.spz";

const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

export default function SplatViewer() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let cleanup: (() => void) | undefined;

    // ✅ Dynamic import inside useEffect — the ONLY way to safely load WASM in Next.js
    import("@sparkjsdev/spark").then(({ SplatMesh, SparkRenderer, SparkControls }) => {
      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      );
      camera.position.set(0, 1, 4);

      const isMobile = /Mobi|Android/i.test(navigator.userAgent);

      const renderer = new THREE.WebGLRenderer({ antialias: false });
      renderer.setPixelRatio(isMobile ? 0.75 : Math.min(window.devicePixelRatio, 1));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      const spark = new SparkRenderer({ renderer });
      scene.add(spark);

      const splatMesh = new SplatMesh({
        url: SPLAT_URL,
        maxSplats: isMobile ? 200_000 : 500_000,
      });
      scene.add(splatMesh);

      const controls = new SparkControls({ canvas: renderer.domElement });

      const onResize = (): void => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      let lastFrame = 0;
      let lastTime = performance.now();

      renderer.setAnimationLoop((now: number) => {
        if (now - lastFrame < FRAME_MS) return;
        lastFrame = now;
        const delta = (now - lastTime) / 1000;
        lastTime = now;
        controls.update(camera);
        renderer.render(scene, camera);
      });

      cleanup = (): void => {
        renderer.setAnimationLoop(null);
        window.removeEventListener("resize", onResize);
        // controls.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    });

    return () => cleanup?.();
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <div style={{
        position: "absolute", bottom: 16, left: 16,
        color: "white", background: "rgba(0,0,0,0.55)",
        padding: "8px 14px", borderRadius: 8,
        fontSize: 13, fontFamily: "monospace", pointerEvents: "none",
      }}>
        🖱 Click to capture · WASD move · Mouse look · Shift fast · Esc release
      </div>
    </div>
  );
}