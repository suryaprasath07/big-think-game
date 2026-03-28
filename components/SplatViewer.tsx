"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createPlayer, createRemotePlayer } from "@/hooks/usePlayer";

const SPLAT_URL    = "/splats/model.spz";
const SPAWN_Y      = 0;
const CAM_DISTANCE = 2;
const CAM_HEIGHT   = 1.2;
const MAX_FPS      = 30;
const FRAME_MS     = 1000 / MAX_FPS;

interface Vec3 { x: number; y: number; z: number }
interface RemotePlayer {
  id: string;
  name: string;
  pos: Vec3;
  rot: Vec3;
  hp: number;
  maxHp: number;
  isDead: boolean;
  anim: string;
}

interface SplatViewerProps {
  remotePlayers?: Map<string, RemotePlayer>;
  sendMove?: (payload: { seq: number; pos: Vec3; rot: Vec3; vel: Vec3; anim: string; t: number }) => void;
  localHp?: number;
  localMaxHp?: number;
  localIsDead?: boolean;
  requestRespawn?: () => void;
}

export default function SplatViewer({
  remotePlayers = new Map(),
  sendMove,
  localHp = 100,
  localMaxHp = 100,
  localIsDead = false,
  requestRespawn,
}: SplatViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const remoteObjectsRef = useRef(new Map<string, ReturnType<typeof createRemotePlayer>>>();

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    let cleanup: (() => void) | undefined;

    import("@sparkjsdev/spark").then(({ SplatMesh, SparkRenderer }) => {

      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.shadowMap.enabled = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        500
      );

      const spark = new SparkRenderer({ renderer });
      scene.add(spark);
      scene.add(new SplatMesh({
        url: SPLAT_URL,
        maxSplats: isMobile ? 80_000 : 150_000,
      }));

      scene.add(new THREE.AmbientLight(0xffffff, 1.0));
      const sun = new THREE.DirectionalLight(0xffffff, 1.2);
      sun.position.set(5, 10, 5);
      scene.add(sun);

      const player = createPlayer(scene, SPAWN_Y);

      // ── Attach camera to player group ──────────────────────────────────
      // Player faces -Z. "Behind" in local space = +Z.
      // Camera at +Z with no rotation naturally looks toward -Z (player's forward).
      // YXZ order: parent group owns Y (yaw), camera owns X (pitch).
      camera.rotation.order = "YXZ";
      camera.position.set(0, CAM_HEIGHT, CAM_DISTANCE);  // +Z = behind player ✓
      // NO rotation.y flip — camera default look direction (-Z) is already correct
      player.group.add(camera);

      const keys: Record<string, boolean> = {};
      let yaw   = 0;
      let pitch = 0.15;
      let pointerLocked = false;

      const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
      const onKeyUp   = (e: KeyboardEvent) => { keys[e.code] = false; };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup",   onKeyUp);

      renderer.domElement.addEventListener("click", () => {
        if (!pointerLocked) renderer.domElement.requestPointerLock();
      });
      document.addEventListener("pointerlockchange", () => {
        pointerLocked = document.pointerLockElement === renderer.domElement;
      });

      const onMouseMove = (e: MouseEvent) => {
        if (!pointerLocked) return;
        yaw   -= e.movementX * 0.001;
        pitch += e.movementY * 0.001;
        pitch  = Math.max(-0.1, Math.min(0.6, pitch));
        camera.rotation.x = -pitch;
      };
      document.addEventListener("mousemove", onMouseMove);

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener("resize", onResize);

      let lastFrame = 0;
      let lastTime  = performance.now();

      renderer.setAnimationLoop((now: number) => {
        if (now - lastFrame < FRAME_MS) return;
        lastFrame = now;
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        player.update(delta, yaw, keys);

        spark.update?.(camera, renderer);
        renderer.render(scene, camera);
      });

      cleanup = () => {
        renderer.setAnimationLoop(null);
        window.removeEventListener("keydown",  onKeyDown);
        window.removeEventListener("keyup",    onKeyUp);
        window.removeEventListener("resize",   onResize);
        document.removeEventListener("mousemove", onMouseMove);
        player.dispose();
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
        🖱 Click to capture · WASD move · Shift run · Mouse look · Esc release
      </div>
    </div>
  );
}
