import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type DiceRollOverlayProps = {
  open: boolean;
  result: { diceOne: number; diceTwo: number } | null;
};

type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

const PIP_POSITIONS: Record<DiceValue, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-1, 1],
    [1, -1],
  ],
  3: [
    [-1, 1],
    [0, 0],
    [1, -1],
  ],
  4: [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ],
  5: [
    [-1, 1],
    [1, 1],
    [0, 0],
    [-1, -1],
    [1, -1],
  ],
  6: [
    [-1, 1],
    [1, 1],
    [-1, 0],
    [1, 0],
    [-1, -1],
    [1, -1],
  ],
};

const FRONT_FACE_ROTATIONS: Record<DiceValue, THREE.Euler> = {
  1: new THREE.Euler(0, 0, 0),
  2: new THREE.Euler(Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, -Math.PI / 2, 0),
  4: new THREE.Euler(0, Math.PI / 2, 0),
  5: new THREE.Euler(-Math.PI / 2, 0, 0),
  6: new THREE.Euler(0, Math.PI, 0),
};

function toDiceValue(value: number | undefined, fallback: DiceValue): DiceValue {
  return value && value >= 1 && value <= 6 ? (value as DiceValue) : fallback;
}

function createFace(
  dice: THREE.Group,
  value: DiceValue,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  pipGeometry: THREE.CircleGeometry,
  pipMaterial: THREE.MeshStandardMaterial,
) {
  const face = new THREE.Group();
  const spacing = 0.43;

  face.position.copy(position);
  face.rotation.copy(rotation);

  PIP_POSITIONS[value].forEach(([x, y]) => {
    const pip = new THREE.Mesh(pipGeometry, pipMaterial);

    pip.position.set(x * spacing, y * spacing, 0);
    face.add(pip);
  });

  dice.add(face);
}

function createDice(value: DiceValue, x: number) {
  const diceSize = 1.65;
  const half = diceSize / 2;
  const pipOffset = 0.012;
  const dice = new THREE.Group();
  const diceGeometry = new RoundedBoxGeometry(diceSize, diceSize, diceSize, 7, 0.16);
  const diceMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f7f2,
    metalness: 0.02,
    roughness: 0.45,
  });
  const pipGeometry = new THREE.CircleGeometry(0.095, 28);
  const pipMaterial = new THREE.MeshStandardMaterial({
    color: 0x050505,
    metalness: 0,
    roughness: 0.75,
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(diceGeometry, diceMaterial);

  body.castShadow = true;
  body.receiveShadow = true;
  dice.add(body);

  createFace(dice, 1, new THREE.Vector3(0, 0, half + pipOffset), new THREE.Euler(0, 0, 0), pipGeometry, pipMaterial);
  createFace(dice, 6, new THREE.Vector3(0, 0, -half - pipOffset), new THREE.Euler(0, Math.PI, 0), pipGeometry, pipMaterial);
  createFace(dice, 3, new THREE.Vector3(half + pipOffset, 0, 0), new THREE.Euler(0, Math.PI / 2, 0), pipGeometry, pipMaterial);
  createFace(dice, 4, new THREE.Vector3(-half - pipOffset, 0, 0), new THREE.Euler(0, -Math.PI / 2, 0), pipGeometry, pipMaterial);
  createFace(dice, 2, new THREE.Vector3(0, half + pipOffset, 0), new THREE.Euler(-Math.PI / 2, 0, 0), pipGeometry, pipMaterial);
  createFace(dice, 5, new THREE.Vector3(0, -half - pipOffset, 0), new THREE.Euler(Math.PI / 2, 0, 0), pipGeometry, pipMaterial);

  dice.position.x = x;
  dice.rotation.set(Math.PI * 1.4, Math.PI * 0.7, Math.PI * 0.25);

  return {
    dice,
    dispose() {
      diceGeometry.dispose();
      diceMaterial.dispose();
      pipGeometry.dispose();
      pipMaterial.dispose();
    },
    value,
  };
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

export function DiceRollOverlay({ open, result }: DiceRollOverlayProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !stageRef.current) {
      return undefined;
    }

    const stage = stageRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    const firstDie = createDice(toDiceValue(result?.diceOne, 1), -1.12);
    const secondDie = createDice(toDiceValue(result?.diceTwo, 2), 1.12);
    const start = performance.now();
    const duration = 1650;
    let animationFrame = 0;

    camera.position.set(0, 0.05, 6.2);
    camera.lookAt(0, 0, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x222244, 2.35));

    const keyLight = new THREE.DirectionalLight(0xffffff, 3);
    keyLight.position.set(3, 4, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x88aaff, 1.5);
    rimLight.position.set(-4, 2, 4);
    scene.add(rimLight);

    scene.add(firstDie.dice, secondDie.dice);

    function resizeRenderer() {
      const width = stage.clientWidth;
      const height = stage.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function rotateDie(die: THREE.Group, value: DiceValue, now: number, offset: number) {
      const rawProgress = Math.min((now - start - offset) / duration, 1);
      const progress = Math.max(0, rawProgress);
      const easedProgress = easeOutCubic(progress);
      const target = FRONT_FACE_ROTATIONS[value];
      const spin = (1 - easedProgress) * Math.PI * 8;

      die.rotation.x = target.x + spin + Math.sin(progress * Math.PI * 4) * 0.12;
      die.rotation.y = target.y + spin * 0.76;
      die.rotation.z = target.z + spin * 0.48;
      die.position.y = Math.abs(Math.sin(progress * Math.PI * 3)) * 0.46 * (1 - easedProgress);
      die.scale.setScalar(1 + Math.sin(progress * Math.PI * 5) * 0.04 * (1 - easedProgress));

      if (progress >= 1) {
        die.rotation.copy(target);
        die.position.y = 0;
        die.scale.setScalar(1);
      }
    }

    function animate(now: number) {
      rotateDie(firstDie.dice, firstDie.value, now, 0);
      rotateDie(secondDie.dice, secondDie.value, now, 140);
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }

    resizeRenderer();
    window.addEventListener('resize', resizeRenderer);
    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resizeRenderer);
      firstDie.dispose();
      secondDie.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === stage) {
        stage.removeChild(renderer.domElement);
      }
    };
  }, [open, result?.diceOne, result?.diceTwo]);

  if (!open) {
    return null;
  }

  return (
    <div className="dice-roll-overlay" aria-live="polite">
      <div ref={stageRef} className="dice-roll-overlay__stage" />
    </div>
  );
}
