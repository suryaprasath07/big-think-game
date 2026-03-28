"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createPlayer, createRemotePlayer } from "@/hooks/usePlayer";

const SPLAT_URL    = "/splats/model1.spz";
const SPAWN_Y      = 0;
const CAM_DISTANCE = 2;
const CAM_HEIGHT   = 1.2;
const MAX_FPS      = 30;
const FRAME_MS     = 1000 / MAX_FPS;

interface Vec3 { x: number; y: number; z: number }
interface RemotePlayer {
  id: string; name: string;
  pos: Vec3; rot: Vec3;
  hp: number; maxHp: number;
  isDead: boolean; anim: string;
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

  // ✅ Keep latest remotePlayers in a ref — animation loop reads this every frame
  // This avoids the race condition where useEffect fires before the scene is ready
  const remotePlayersRef = useRef<Map<string, RemotePlayer>>(new Map());
  useEffect(() => {
    remotePlayersRef.current = remotePlayers;
  }, [remotePlayers]);

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
      const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 500);

      const spark = new SparkRenderer({ renderer });
      scene.add(spark);
      scene.add(new SplatMesh({ url: SPLAT_URL, maxSplats: isMobile ? 80_000 : 150_000 }));
      scene.add(new THREE.AmbientLight(0xffffff, 1.0));
      const sun = new THREE.DirectionalLight(0xffffff, 1.2);
      sun.position.set(5, 10, 5);
      scene.add(sun);

      const player = createPlayer(scene, SPAWN_Y);
      camera.rotation.order = "YXZ";
      camera.position.set(0, CAM_HEIGHT, CAM_DISTANCE);
      player.group.add(camera);

      // ✅ Remote player objects live here — keyed by playerId
      const remoteObjects = new Map<string, ReturnType<typeof createRemotePlayer>>();

      const keys: Record<string, boolean> = {};
      let yaw = 0, pitch = 0.15, pointerLocked = false;

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

      let lastFrame = 0, lastTime = performance.now();
      let seq = 0, lastSyncTime = 0;
      const SYNC_INTERVAL = 50; // ms = 20hz

      renderer.setAnimationLoop((now: number) => {
        if (now - lastFrame < FRAME_MS) return;
        lastFrame = now;
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        player.update(delta, yaw, keys);

        // ── Send local position to server ──────────────────────────────────
        if (sendMove && now - lastSyncTime >= SYNC_INTERVAL) {
          lastSyncTime = now;
          seq++;
          const { x, y, z } = player.group.position;
          const rot = player.group.rotation;
          const moving  = keys["KeyW"] || keys["KeyS"] || keys["KeyA"] || keys["KeyD"];
          const running = moving && (keys["ShiftLeft"] || keys["ShiftRight"]);
          sendMove({
            seq,
            pos: { x, y, z },
            rot: { x: rot.x, y: rot.y, z: rot.z },
            vel: { x: 0, y: 0, z: 0 },
            anim: running ? "run" : moving ? "walk" : "idle",
            t: now,
          });
        }

        // ── Sync remote players every frame from the ref ───────────────────
        // This runs INSIDE the animation loop so the scene is guaranteed ready
        const current = remotePlayersRef.current;

        // Add / update
        current.forEach((rp) => {
          if (!remoteObjects.has(rp.id)) {
            const obj = createRemotePlayer(scene, rp.id, rp.name);
            remoteObjects.set(rp.id, obj);
          }
          const obj = remoteObjects.get(rp.id)!;
          obj.setPosition(rp.pos);
          obj.setRotation(rp.rot);
          obj.setAnimation(rp.anim);
        });

        // Remove players who left
        remoteObjects.forEach((obj, id) => {
          if (!current.has(id)) {
            obj.dispose();
            remoteObjects.delete(id);
          }
        });

        spark.update?.(camera, renderer);
        renderer.render(scene, camera);
      });

      cleanup = () => {
        renderer.setAnimationLoop(null);
        window.removeEventListener("keydown",  onKeyDown);
        window.removeEventListener("keyup",    onKeyUp);
        window.removeEventListener("resize",   onResize);
        document.removeEventListener("mousemove", onMouseMove);
        remoteObjects.forEach((obj) => obj.dispose());
        remoteObjects.clear();
        player.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      };
    });

    return () => cleanup?.();
  }, []); // ✅ Empty deps — animation loop reads remotePlayersRef, not closure state

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <div style={{
        position: "absolute", bottom: 16, left: 16,
        color: "white", background: "rgba(0,0,0,0.55)",
        padding: "8px 14px", borderRadius: 8,
        fontSize: 13, fontFamily: "monospace", pointerEvents: "none",
      }}>
        🖱 Click · WASD · Shift run · Mouse look · Esc
      </div>
    </div>
  );
}