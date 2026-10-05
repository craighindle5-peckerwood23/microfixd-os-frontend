// src/os/shell/use-holographic-head.ts
//
// Real holographic humanoid head, dot-matrix style per the reference model:
// the actual face geometry from facecap.glb (three.js MIT-licensed ARKit
// demo asset, see public/models/ATTRIBUTION.md) rendered as a glowing
// point-cloud of blue/periwinkle dots, over a subtle fresnel shell for
// volume, plus the concentric pedestal ring.
//
// CRITICAL FIX (2026-10-01): facecap.glb declares extensionsRequired
// [KHR_mesh_quantization, EXT_meshopt_compression, KHR_texture_basisu].
// The previous loader registered none of them, so parsing failed at
// runtime and the code silently fell back to a sphere -- which is why the
// presence rendered as a plain glowing orb. GLTFLoader now has MeshoptDecoder
// and KTX2Loader (self-hosted transcoder in public/libs/basis/) attached,
// so the real face topology actually loads.
//
// The dot matrix is built from the loaded mesh's own vertex positions --
// every dot IS a real vertex of the face scan, driven by a real custom
// THREE.ShaderMaterial (circular sprites, shimmer, fresnel-weighted
// brightness, form-progress reveal). State contract unchanged:
// setForm/setEyesLit/setAlert from AIPresence.tsx.

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface HolographicHeadHandle {
  setForm: (progress: number) => void;
  setEyesLit: (lit: boolean) => void;
  setAlert: (alert: boolean) => void;
}

const COLOR_NOMINAL = new THREE.Color(0x2f8fff);
const COLOR_ALERT = new THREE.Color(0xf87171);

// Subtle volumetric shell behind the dots (fresnel edges only).
const SHELL_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SHELL_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uFormProgress;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.2);
    float scanline = 0.5 + 0.5 * sin(vWorldPosition.y * 18.0 - uTime * 2.0);
    float scanBand = smoothstep(0.85, 1.0, scanline) * 0.4;
    float alpha = clamp((fresnel * 0.65 + scanBand * 0.5) * uFormProgress, 0.0, 0.7);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function buildShellMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uFormProgress: { value: 0 } },
    vertexShader: SHELL_VERTEX_SHADER,
    fragmentShader: SHELL_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// Dot-matrix: every point is a real vertex of the face scan. Circular
// sprites, per-dot shimmer, brightness weighted by view angle so the
// silhouette edge glows like the reference, reveal driven by uFormProgress.
const DOTS_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uFormProgress;
  uniform float uPixelRatio;
  attribute float aShimmerSeed;
  varying float vBrightness;
  varying float vReveal;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Form reveal: bottom-up sweep as the presence forms (0 -> 1).
    // Head is ~3.3 units tall, centered -- y in [-1.66, 1.66].
    float yNorm = clamp(position.y * 0.3 + 0.5, 0.0, 1.0);
    vReveal = smoothstep(yNorm - 0.2, yNorm + 0.05, uFormProgress);

    // Per-dot twinkle, de-synced by seed; faster when fully formed.
    float twinkle = 0.75 + 0.25 * sin(uTime * (1.5 + 2.5 * uFormProgress) + aShimmerSeed * 6.2831);
    vBrightness = twinkle;

    // Camera sits at z ~ 6.9; normalize size against that reference distance.
    gl_PointSize = (5.2 + 2.4 * twinkle) * uPixelRatio * (6.9 / -mvPosition.z);
  }
`;

const DOTS_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uActiveBoost;
  varying float vBrightness;
  varying float vReveal;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float dotShape = smoothstep(0.5, 0.1, d);
    float alpha = dotShape * vBrightness * vReveal * (0.9 + 0.1 * uActiveBoost);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor * (0.85 + 0.5 * uActiveBoost), clamp(alpha, 0.0, 1.0));
  }
`;

function buildDotsMaterial(color: THREE.Color, pixelRatio: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uFormProgress: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uActiveBoost: { value: 0 },
    },
    vertexShader: DOTS_VERTEX_SHADER,
    fragmentShader: DOTS_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// Merge the loaded meshes' world-space vertex positions into one
// Float32Array -- the raw dot-matrix lattice of the real face scan.
function collectVertexPositions(root: THREE.Object3D): Float32Array | null {
  root.updateMatrixWorld(true);
  const chunks: Float32Array[] = [];
  let total = 0;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const arr = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y;
      arr[i * 3 + 2] = v.z;
    }
    chunks.push(arr);
    total += pos.count;
  });
  if (total === 0) return null;
  const merged = new Float32Array(total * 3);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

export function useHolographicHead(canvasRef: RefObject<HTMLCanvasElement>, onError?: (message:string)=>void) {
  const stateRef = useRef<HolographicHeadHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    // facecap.glb is ~3.3 units tall (verified by parsing the real file:
    // bounds 2.31 x 3.33 x 3.02). Frame the whole head: fov 30 needs
    // d = h / (2*tan(15deg)) = 3.3 / 0.536 ~ 6.2, plus margin.
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.12, 6.9);

    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
    catch { onError?.("3D head unavailable: this browser could not initialize WebGL. OS controls remain available."); return; }
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);

    const shellMaterial = buildShellMaterial(COLOR_NOMINAL);
    const dotsMaterial = buildDotsMaterial(COLOR_NOMINAL, pixelRatio);
    const headGroup = new THREE.Group();
    scene.add(headGroup);
    let modelLoaded = false;

    // facecap.glb requires EXT_meshopt_compression + KHR_mesh_quantization
    // (see extensionsRequired in the file's JSON chunk; the unused texture
    // payload was stripped so no KTX2/basis decoder is needed). Without
    // MeshoptDecoder the parse fails at runtime and we'd fall back to a
    // sphere -- the 'plain orb' bug.
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      '/models/facecap.glb',
      (gltf) => {
        // Shell: the solid face with fresnel-only material, for volume.
        gltf.scene.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) mesh.material = shellMaterial;
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);
        headGroup.add(gltf.scene);

        // Dot matrix: one glowing dot per real vertex of the face scan.
        const positions = collectVertexPositions(gltf.scene);
        if (positions) {
          const dotsGeometry = new THREE.BufferGeometry();
          dotsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          const seeds = new Float32Array(positions.length / 3);
          for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
          dotsGeometry.setAttribute('aShimmerSeed', new THREE.Float32BufferAttribute(seeds, 1));
          const dots = new THREE.Points(dotsGeometry, dotsMaterial);
          headGroup.add(dots);
          dotsGeometryRef.current = dotsGeometry;
        }
        modelLoaded = true;
      },
      undefined,
      (err) => {
        const fallback = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 20), shellMaterial);
        headGroup.add(fallback);
        modelLoaded = true;
        console.error('facecap.glb failed to load, using fallback sphere geometry:', err);
        // Fallback is detectable from outside the browser console too.
        document.title = 'Microfixd [HEAD FALLBACK]';
      },
    );

    const dotsGeometryRef = { current: null as THREE.BufferGeometry | null };

    const ringCount = 220;
    const ringPositions = new Float32Array(ringCount * 3);
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const radius = 2.7 + Math.random() * 0.45;
      ringPositions[i * 3] = Math.cos(angle) * radius;
      ringPositions[i * 3 + 1] = -1.70 + (Math.random() - 0.5) * 0.06;
      ringPositions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ringPositions, 3));
    const ringMaterial = new THREE.PointsMaterial({ color: COLOR_NOMINAL, size: 0.045, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const ring = new THREE.Points(ringGeometry, ringMaterial);
    scene.add(ring);

    let formProgress = 0;
    let eyesLit = false;
    let alertActive = false;
    let raf = 0;
    let t = 0;

    function resize() {
      const w = canvas!.clientWidth || 1;
      const h = canvas!.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    function animate() {
      t += 0.016;
      const targetColor = alertActive ? COLOR_ALERT : COLOR_NOMINAL;
      shellMaterial.uniforms.uColor.value.lerp(targetColor, 0.05);
      shellMaterial.uniforms.uTime.value = t;
      shellMaterial.uniforms.uFormProgress.value = 0.25 + 0.7 * formProgress;
      dotsMaterial.uniforms.uColor.value.lerp(targetColor, 0.05);
      dotsMaterial.uniforms.uTime.value = t;
      dotsMaterial.uniforms.uFormProgress.value = 0.2 + 0.8 * formProgress;
      dotsMaterial.uniforms.uActiveBoost.value += ((eyesLit || alertActive ? 1 : 0) - dotsMaterial.uniforms.uActiveBoost.value) * 0.06;
      ringMaterial.color.lerp(targetColor, 0.05);
      ringMaterial.opacity = 0.3 + 0.5 * formProgress;

      if (modelLoaded) headGroup.rotation.y = Math.sin(t * 0.15) * 0.3;
      ring.rotation.y += 0.002 + (alertActive ? 0.006 : 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    stateRef.current = {
      setForm: (p) => { formProgress = p; },
      setEyesLit: (v) => { eyesLit = v; },
      setAlert: (v) => { alertActive = v; },
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      shellMaterial.dispose();
      dotsMaterial.dispose();
      dotsGeometryRef.current?.dispose();
      ringGeometry.dispose(); ringMaterial.dispose();
      renderer.dispose();
    };
  }, [canvasRef]);

  return stateRef;
}
