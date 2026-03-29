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
const PUNCH_DAMAGE = 25;
const PUNCH_RANGE  = 1.8;
const PUNCH_ARC    = 0.3; // dot product threshold (~72° cone)

interface Vec3 { x: number; y: number; z: number }
interface RemotePlayer {
  id: string; name: string;
  pos: Vec3; rot: Vec3;
  hp: number; maxHp: number;
  isDead: boolean; anim: string;
}

interface SplatViewerProps {
  remotePlayers?:  Map<string, RemotePlayer>;
  sendMove?:       (p: { seq: number; pos: Vec3; rot: Vec3; vel: Vec3; anim: string; t: number }) => void;
  sendAttack?:     (targetId: string, damage: number, weaponId?: string) => void;
  localHp?:        number;
  localMaxHp?:     number;
  localIsDead?:    boolean;
  requestRespawn?: () => void;
}

export default function SplatViewer({
  remotePlayers = new Map(),
  sendMove,
  sendAttack,
  localHp       = 100,
  localMaxHp    = 100,
  localIsDead   = false,
  requestRespawn,
}: SplatViewerProps) {
  const mountRef         = useRef<HTMLDivElement>(null);
  const remotePlayersRef = useRef<Map<string, RemotePlayer>>(new Map());

  useEffect(() => { remotePlayersRef.current = remotePlayers; }, [remotePlayers]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    let cleanup: (() => void) | undefined;

    import("@sparkjsdev/spark").then(({ SplatMesh, SparkRenderer }) => {
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
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

      const remoteObjects = new Map<string, ReturnType<typeof createRemotePlayer>>();

      const keys: Record<string, boolean> = {};
      let yaw = 0, pitch = 0.15, pointerLocked = false;

      // ── Input ────────────────────────────────────────────────────────────
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

      // ── Punch on left-click while locked ─────────────────────────────────
      const onMouseDown = (e: MouseEvent) => {
        if (!pointerLocked || e.button !== 0) return;

        player.punch((worldPos, forward) => {
          if (!sendAttack) return;

          const current = remotePlayersRef.current;
          current.forEach((rp, id) => {
            if (rp.isDead) return;
            const rpPos = new THREE.Vector3(rp.pos.x, rp.pos.y, rp.pos.z);
            const dist  = worldPos.distanceTo(rpPos);
            if (dist > PUNCH_RANGE) return;

            // Must be in forward arc
            const toTarget = rpPos.clone().sub(worldPos).normalize();
            const dot = forward.dot(toTarget);
            if (dot < PUNCH_ARC) return;

            sendAttack(id, PUNCH_DAMAGE, "punch");
          });
        });
      };
      document.addEventListener("mousedown", onMouseDown);

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener("resize", onResize);

      let lastFrame = 0, lastTime = performance.now();
      let seq = 0, lastSyncTime = 0;
      const SYNC_INTERVAL = 50; // 20hz

      renderer.setAnimationLoop((now: number) => {
        if (now - lastFrame < FRAME_MS) return;
        lastFrame = now;
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        player.update(delta, yaw, keys);

        // ── Send position ─────────────────────────────────────────────────
        if (sendMove && now - lastSyncTime >= SYNC_INTERVAL) {
          lastSyncTime = now;
          seq++;
          const { x, y, z } = player.group.position;
          const rot     = player.group.rotation;
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

        // ── Sync remote players ───────────────────────────────────────────
        const current = remotePlayersRef.current;
        current.forEach((rp) => {
          if (!remoteObjects.has(rp.id)) {
            remoteObjects.set(rp.id, createRemotePlayer(scene, rp.id, rp.name));
          }
          const obj = remoteObjects.get(rp.id)!;
          obj.setPosition(rp.pos);
          obj.setRotation(rp.rot);
          obj.setAnimation(rp.anim, delta);
        });
        remoteObjects.forEach((obj, id) => {
          if (!current.has(id)) { obj.dispose(); remoteObjects.delete(id); }
        });

        spark.update?.(camera, renderer);
        renderer.render(scene, camera);
      });

      cleanup = () => {
        renderer.setAnimationLoop(null);
        window.removeEventListener("keydown",    onKeyDown);
        window.removeEventListener("keyup",      onKeyUp);
        window.removeEventListener("resize",     onResize);
        document.removeEventListener("mousemove",  onMouseMove);
        document.removeEventListener("mousedown",  onMouseDown);
        remoteObjects.forEach((obj) => obj.dispose());
        remoteObjects.clear();
        player.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
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
        🖱 Click · WASD · Shift run · Mouse look · LMB punch · Esc
      </div>
    </div>
  );
}