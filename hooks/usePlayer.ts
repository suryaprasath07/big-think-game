import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const FBX_FILES = {
  base:  "/characters/idle.fbx",
  walk:  "/characters/walk.fbx",
  run:   "/characters/run.fbx",
  punch: "/characters/punch.fbx",   // ← new
};

const CHARACTER_SCALE = 0.0001;
const MOVE_SPEED      = 2.5;
const RUN_MULTIPLIER  = 1.8;
const PUNCH_COOLDOWN  = 700;   // ms between punches
const PUNCH_IMPACT_MS = 300;   // ms into animation when fist connects
const PUNCH_RANGE     = 1.8;   // world units
const PUNCH_ARC_DOT   = 0.3;   // cos(~72°) — forward cone

const _forward = new THREE.Vector3();
const _right   = new THREE.Vector3();
const _moveDir = new THREE.Vector3();

export interface PlayerController {
  group:    THREE.Group;
  update:   (delta: number, yaw: number, keys: Record<string, boolean>) => void;
  // Returns true if punch started (false if on cooldown)
  punch:    (onImpact: (worldPos: THREE.Vector3, forward: THREE.Vector3) => void) => boolean;
  dispose:  () => void;
  isLoaded: () => boolean;
}

export function createPlayer(
  scene: THREE.Scene,
  spawnY = 0,
  onLoaded?: (msg: string) => void,
  onError?:  (msg: string) => void
): PlayerController {
  const group = new THREE.Group();
  group.position.set(0, spawnY, 0);
  scene.add(group);

  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 1.2, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x4488ff })
  );
  capsule.position.y = 0.9;
  group.add(capsule);

  let mixer:         THREE.AnimationMixer | null = null;
  const actions:     Record<string, THREE.AnimationAction> = {};
  let currentAction: THREE.AnimationAction | null = null;
  let loaded =       false;
  let fbxMesh:       THREE.Group | null = null;
  let isPunching =   false;
  let lastPunchAt =  0;

  const switchAnim = (name: string, clampFinish = false) => {
    const next = actions[name];
    if (!next || next === currentAction) return;
    currentAction?.fadeOut(0.12);
    next.reset().setEffectiveWeight(1).fadeIn(0.12).play();
    if (clampFinish) next.clampWhenFinished = true;
    currentAction = next;
  };

  const loader = new FBXLoader();

  loader.load(
    FBX_FILES.base,
    (fbx) => {
      const box  = new THREE.Box3().setFromObject(fbx);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = size.y > 0 ? 0.5 / size.y : CHARACTER_SCALE;
      fbx.scale.setScalar(scale);
      fbx.updateWorldMatrix(true, true);
      const scaledBox = new THREE.Box3().setFromObject(fbx);
      fbx.position.y -= scaledBox.min.y;

      fbx.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = mesh.receiveShadow = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m: THREE.Material) => { m.transparent = false; m.depthWrite = true; });
      });

      fbx.rotation.y = Math.PI;
      group.add(fbx);
      fbxMesh = fbx;
      capsule.visible = false;

      mixer = new THREE.AnimationMixer(fbx);
      if (fbx.animations.length > 0) {
        actions.idle = mixer.clipAction(fbx.animations[0]);
        actions.idle.play();
        currentAction = actions.idle;
      }

      loaded = true;
      onLoaded?.(`FBX ready ✓  (scale: ${scale.toFixed(4)})`);

      // Load walk, run, punch
      const extras = Object.entries(FBX_FILES).filter(([k]) => k !== "base");
      for (const [name, url] of extras) {
        loader.load(url, (animFbx) => {
          if (!animFbx.animations.length) return;
          const clip = animFbx.animations[0];
          clip.name = name;
          const action = mixer!.clipAction(
            THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(clip)),
            fbx
          );
          // Punch plays once then returns to idle
          if (name === "punch") {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          actions[name] = action;
        });
      }

      // Listen for punch animation finishing → return to idle
      mixer.addEventListener("finished", (e) => {
        if ((e as any).action === actions.punch) {
          isPunching = false;
          switchAnim("idle");
        }
      });
    },
    undefined,
    (err) => {
      console.error("[Player] base FBX failed:", err);
      onError?.("FBX load failed — check /public/characters/idle.fbx");
    }
  );

  const update = (delta: number, yaw: number, keys: Record<string, boolean>) => {
    mixer?.update(delta);
    group.rotation.y = yaw;

    if (isPunching) return; // lock movement during punch

    const running = keys["ShiftLeft"] || keys["ShiftRight"];
    const speed   = MOVE_SPEED * (running ? RUN_MULTIPLIER : 1);

    _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _right.set(   Math.cos(yaw), 0, -Math.sin(yaw));
    _moveDir.set(0, 0, 0);

    if (keys["KeyW"] || keys["ArrowUp"])    _moveDir.addScaledVector(_forward,  1);
    if (keys["KeyS"] || keys["ArrowDown"])  _moveDir.addScaledVector(_forward, -1);
    if (keys["KeyA"] || keys["ArrowLeft"])  _moveDir.addScaledVector(_right,   -1);
    if (keys["KeyD"] || keys["ArrowRight"]) _moveDir.addScaledVector(_right,    1);

    if (_moveDir.lengthSq() > 0) {
      _moveDir.normalize();
      group.position.addScaledVector(_moveDir, speed * delta);
      if (fbxMesh) {
        const targetAngle = Math.atan2(_moveDir.x, _moveDir.z) - yaw;
        const da = ((targetAngle - fbxMesh.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        fbxMesh.rotation.y += da * 0.25;
      }
      switchAnim(running ? "run" : "walk");
    } else {
      if (fbxMesh) {
        const da = ((Math.PI - fbxMesh.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        fbxMesh.rotation.y += da * 0.15;
      }
      switchAnim("idle");
    }

    group.position.y = spawnY;
  };

  const punch = (onImpact: (worldPos: THREE.Vector3, forward: THREE.Vector3) => void): boolean => {
    const now = performance.now();
    if (isPunching || now - lastPunchAt < PUNCH_COOLDOWN) return false;
    if (!actions.punch) return false;

    isPunching  = true;
    lastPunchAt = now;
    switchAnim("punch");

    // Fire impact callback at the moment the fist connects
    setTimeout(() => {
      const worldPos = new THREE.Vector3();
      group.getWorldPosition(worldPos);
      const fwd = new THREE.Vector3(-Math.sin(group.rotation.y), 0, -Math.cos(group.rotation.y));
      onImpact(worldPos, fwd);
    }, PUNCH_IMPACT_MS);

    return true;
  };

  const dispose = () => {
    scene.remove(group);
    mixer?.stopAllAction();
    capsule.geometry.dispose();
    (capsule.material as THREE.Material).dispose();
  };

  return { group, update, punch, dispose, isLoaded: () => loaded };
}

// ── Remote player (unchanged except mixer.update moved to setAnimation) ───────

export interface RemotePlayerController {
  group:        THREE.Group;
  setPosition:  (pos: { x: number; y: number; z: number }) => void;
  setRotation:  (rot: { x: number; y: number; z: number }) => void;
  setAnimation: (animName: string, delta?: number) => void;
  dispose:      () => void;
}

export function createRemotePlayer(
  scene: THREE.Scene,
  playerId: string,
  playerName: string
): RemotePlayerController {
  const group = new THREE.Group();
  scene.add(group);

  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 1.2, 4, 8),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.8, 0.5),
    })
  );
  capsule.position.y = 0.9;
  group.add(capsule);

  // Name label
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.fillText(playerName, canvas.width / 2, canvas.height / 2 + 10);

  const texture     = new THREE.CanvasTexture(canvas);
  const labelMat    = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const labelGeom   = new THREE.PlaneGeometry(2, 0.5);
  const labelMesh   = new THREE.Mesh(labelGeom, labelMat);
  labelMesh.position.y = 2.2;
  labelMesh.renderOrder = 1;
  group.add(labelMesh);

  let mixer:         THREE.AnimationMixer | null = null;
  const actions:     Record<string, THREE.AnimationAction> = {};
  let currentAction: THREE.AnimationAction | null = null;
  let fbxMesh:       THREE.Group | null = null;

  const switchAnim = (name: string) => {
    const next = actions[name];
    if (!next || next === currentAction) return;
    currentAction?.fadeOut(0.12);
    next.reset().setEffectiveWeight(1).fadeIn(0.12).play();
    currentAction = next;
  };

  const loader = new FBXLoader();
  loader.load(FBX_FILES.base, (fbx) => {
    const box  = new THREE.Box3().setFromObject(fbx);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = size.y > 0 ? 0.5 / size.y : CHARACTER_SCALE;
    fbx.scale.setScalar(scale);
    fbx.updateWorldMatrix(true, true);
    const scaledBox = new THREE.Box3().setFromObject(fbx);
    fbx.position.y -= scaledBox.min.y;
    fbx.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = false;
    });
    fbx.rotation.y = Math.PI;
    group.add(fbx);
    fbxMesh = fbx;
    capsule.visible = false;

    mixer = new THREE.AnimationMixer(fbx);
    if (fbx.animations.length > 0) {
      actions.idle = mixer.clipAction(fbx.animations[0]);
      actions.idle.play();
      currentAction = actions.idle;
    }

    const extras = Object.entries(FBX_FILES).filter(([k]) => k !== "base");
    for (const [name, url] of extras) {
      loader.load(url, (animFbx) => {
        if (!animFbx.animations.length) return;
        const clip = animFbx.animations[0];
        clip.name  = name;
        const action = mixer!.clipAction(
          THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(clip)), fbx
        );
        if (name === "punch") {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        actions[name] = action;
      });
    }

    mixer.addEventListener("finished", (e) => {
      if ((e as any).action === actions.punch) switchAnim("idle");
    });
  });

  return {
    group,
    setPosition: (pos) => { group.position.set(pos.x, pos.y, pos.z); },
    setRotation: (rot) => {
      group.rotation.order = "YXZ";
      group.rotation.set(rot.x, rot.y, rot.z);
    },
    setAnimation: (animName, delta = 0.016) => {
      mixer?.update(delta);
      if (animName && actions[animName]) switchAnim(animName);
    },
    dispose: () => {
      scene.remove(group);
      mixer?.stopAllAction();
      capsule.geometry.dispose();
      (capsule.material as THREE.Material).dispose();
      labelGeom.dispose();
      labelMat.dispose();
      texture.dispose();
    },
  };
}