import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const FBX_FILES = {
  base: "/characters/idle.fbx",
  walk: "/characters/walk.fbx",
  run:  "/characters/run.fbx",
};

const CHARACTER_SCALE = 0.0001;
const MOVE_SPEED      = 2.5;
const RUN_MULTIPLIER  = 1.8;

const _forward = new THREE.Vector3();
const _right   = new THREE.Vector3();
const _moveDir = new THREE.Vector3();

export interface PlayerController {
  group:     THREE.Group;
  update:    (delta: number, yaw: number, keys: Record<string, boolean>) => void;
  dispose:   () => void;
  isLoaded:  () => boolean;
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

  // Capsule placeholder
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

  // ── Keep a reference to the loaded FBX so we can rotate it each frame ────
  let fbxMesh: THREE.Group | null = null;

  const switchAnim = (name: string) => {
    const next = actions[name];
    if (!next || next === currentAction) return;
    currentAction?.fadeOut(0.12);
    next.reset().setEffectiveWeight(1).fadeIn(0.12).play();
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
        mesh.castShadow    = false;
        mesh.receiveShadow = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m: THREE.Material) => {
          m.transparent = false;
          m.depthWrite  = true;
        });
      });

      // Start facing forward (into the world, away from camera)
      // Math.PI because FBX default +Z faces toward camera; we flip it
      fbx.rotation.y = Math.PI;

      group.add(fbx);
      fbxMesh = fbx;          // ← store ref for per-frame rotation
      capsule.visible = false;

      mixer = new THREE.AnimationMixer(fbx);
      if (fbx.animations.length > 0) {
        actions.idle = mixer.clipAction(fbx.animations[0]);
        actions.idle.play();
        currentAction = actions.idle;
      }

      loaded = true;
      onLoaded?.(`FBX ready ✓  (scale: ${scale.toFixed(4)})`);

      const extras = Object.entries(FBX_FILES).filter(([k]) => k !== "base");
      for (const [name, url] of extras) {
        loader.load(
          url,
          (animFbx) => {
            if (!animFbx.animations.length) return;
            const clip = animFbx.animations[0];
            clip.name  = name;
            actions[name] = mixer!.clipAction(
              THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(clip)),
              fbx
            );
          },
          undefined,
          (err) => console.error(`[Player] anim load failed (${name}):`, err)
        );
      }
    },
    undefined,
    (err) => {
      console.error("[Player] base FBX failed:", err);
      onError?.("FBX load failed — check /public/characters/idle.fbx");
    }
  );

  const update = (delta: number, yaw: number, keys: Record<string, boolean>) => {
    mixer?.update(delta);

    // group.rotation.y = yaw keeps camera (child) behind player
    group.rotation.y = yaw;

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

      // ── Rotate FBX mesh to face movement direction ───────────────────────
      // atan2(moveDir.x, moveDir.z) = world-space facing angle
      // subtract yaw to get local-space angle (group is already rotated by yaw)
      // This makes W=PI, S=0, A=-PI/2, D=+PI/2 in local space
      if (fbxMesh) {
        const targetAngle = Math.atan2(_moveDir.x, _moveDir.z) - yaw;
        // Smooth rotation so it doesn't snap harshly on diagonals
        const da = ((targetAngle - fbxMesh.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        fbxMesh.rotation.y += da * 0.25;
      }

      switchAnim(running ? "run" : "walk");
    } else {
      // Idle: smoothly return to facing forward (Math.PI in local space)
      if (fbxMesh) {
        const da = ((Math.PI - fbxMesh.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        fbxMesh.rotation.y += da * 0.15;
      }
      switchAnim("idle");
    }

    group.position.y = spawnY;
  };

  const dispose = () => {
    scene.remove(group);
    mixer?.stopAllAction();
    capsule.geometry.dispose();
    (capsule.material as THREE.Material).dispose();
  };

  return { group, update, dispose, isLoaded: () => loaded };
}