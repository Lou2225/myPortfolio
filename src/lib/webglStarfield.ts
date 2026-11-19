import { hexToRgb, normalizeHexColor } from "@/lib/appearance";
import type { PortfolioTheme } from "@/types/portfolio";

export const STARFIELD_CONFIG = {
  depth: 30,
  pointSize: 50,
  brightness: 1.85,
  opacity: 0.92,
  drift: 2.35,
  twinkle: 1.0,
  spin: 0.03,
  repelRadius: 5.0,
  repelStrength: 0.35,
  scrollPush: 8.0,
  scrollDrift: 6.0,
  scrollSpin: 0.1,
  parallax: 0.6,
  flameAmt: 0.18,
} as const;

export type Vec3Tuple = [number, number, number];

export interface StarfieldPalette {
  colorA: Vec3Tuple;
  colorB: Vec3Tuple;
  colorC: Vec3Tuple;
  flameA: Vec3Tuple;
  flameB: Vec3Tuple;
  flameAmt: number;
  maxOpacity: number;
  brightness: number;
  isLight: boolean;
}

function hexToVec3Tuple(hex: string): Vec3Tuple {
  const { r, g, b } = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
}

function mixTuple(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Resolves star tints and ambient nebula corner colors dynamically from the
 * active Appearance accent hex + theme mode so WebGL matches any live preset.
 */
export function resolveStarfieldPalette(
  accentHexRaw: string,
  theme: PortfolioTheme
): StarfieldPalette {
  const accentHex = normalizeHexColor(accentHexRaw, "#ff3b1d");
  const accent = hexToVec3Tuple(accentHex);

  if (theme === "light") {
    const pureBlack: Vec3Tuple = [0.02, 0.02, 0.028]; // #050507
    const obsidianBlack: Vec3Tuple = [0.045, 0.045, 0.055]; // #0b0b0e
    const charcoalInk: Vec3Tuple = [0.085, 0.085, 0.1]; // #16161a
    return {
      colorA: pureBlack,
      colorB: obsidianBlack,
      colorC: charcoalInk,
      flameA: mixTuple(accent, [0.95, 0.93, 0.88], 0.5),
      flameB: [0.82, 0.8, 0.76],
      flameAmt: 0.08,
      maxOpacity: 0.92,
      brightness: 1.0,
      isLight: true,
    };
  }

  // Dark obsidian canvas: crisp bone-white core stars + mint/jade/accent highlights
  const mintGlow = hexToVec3Tuple("#aef6cf");
  const boneWhite = hexToVec3Tuple("#eafff2");
  const coolCyan = hexToVec3Tuple("#aee9ff");
  const indigoMist = hexToVec3Tuple("#c79bff");

  return {
    colorA: mixTuple(mintGlow, accent, 0.58),
    colorB: accent,
    colorC: boneWhite,
    flameA: mixTuple(coolCyan, accent, 0.45),
    flameB: mixTuple(indigoMist, accent, 0.25),
    flameAmt: STARFIELD_CONFIG.flameAmt,
    maxOpacity: STARFIELD_CONFIG.opacity,
    brightness: STARFIELD_CONFIG.brightness,
    isLight: false,
  };
}

/**
 * Column-major 4x4 perspective matrix matching `THREE.PerspectiveCamera(45, aspect, near, far)`.
 */
export function createPerspectiveMatrix4(
  fovDeg: number,
  aspect: number,
  near: number,
  far: number
): Float32Array {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const nf = 1 / (near - far);

  return new Float32Array([
    f / safeAspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}

/**
 * Column-major 4x4 camera view matrix looking from `eye` toward `(eyeX, eyeY, targetZ)`.
 */
export function createViewMatrix4(
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  targetX: number,
  targetY: number,
  targetZ: number
): Float32Array {
  let zx = eyeX - targetX;
  let zy = eyeY - targetY;
  let zz = eyeZ - targetZ;
  const zLen = Math.hypot(zx, zy, zz) || 1;
  zx /= zLen;
  zy /= zLen;
  zz /= zLen;

  // Up = (0, 1, 0)
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  const xLen = Math.hypot(xx, xy, xz);
  if (xLen > 1e-6) {
    xx /= xLen;
    xy /= xLen;
    xz /= xLen;
  } else {
    xx = 1;
    xy = 0;
    xz = 0;
  }

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return new Float32Array([
    xx,
    yx,
    zx,
    0,
    xy,
    yy,
    zy,
    0,
    xz,
    yz,
    zz,
    0,
    -(xx * eyeX + xy * eyeY + xz * eyeZ),
    -(yx * eyeX + yy * eyeY + yz * eyeZ),
    -(zx * eyeX + zy * eyeY + zz * eyeZ),
    1,
  ]);
}

/**
 * Analytical pointer NDC -> z = 0 plane world intersection matching
 * `THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera)` + z-plane raycast.
 */
export function unprojectNdcToZ0Plane(
  ndcX: number,
  ndcY: number,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  fovDeg: number,
  aspect: number
): Vec3Tuple {
  const halfH = Math.tan((fovDeg * Math.PI) / 360);
  const halfW = halfH * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1);

  // Camera faces straight down -Z from (eyeX, eyeY, eyeZ) to (eyeX, eyeY, -10)
  const dirX = ndcX * halfW;
  const dirY = ndcY * halfH;
  const dirZ = -1;

  const t = -eyeZ / dirZ;
  if (!Number.isFinite(t) || t <= 0) {
    return [0, 0, 0];
  }

  return [eyeX + dirX * t, eyeY + dirY * t, 0];
}

export const BACKDROP_VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const BACKDROP_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;
uniform float iTime;
uniform float uOpacity;
uniform float uFlameAmt;
uniform float uIsLight;
uniform vec3 uFlameA;
uniform vec3 uFlameB;
varying vec2 vUv;

vec3 warp3d(vec3 pos, float t) {
  float curv = 0.8;
  float a = 1.9;
  float b = 0.7;
  pos *= 2.0;
  pos.x += curv * sin(t + a * pos.y) + t * b;
  pos.y += curv * cos(t + a * pos.x);
  pos.y += curv * sin(t + a * pos.z) + t * b;
  pos.z += curv * cos(t + a * pos.y);
  pos.z += curv * sin(t + a * pos.x) + t * b;
  pos.x += curv * cos(t + a * pos.z);
  return 0.5 + 0.5 * cos(pos.xyz + vec3(1.0, 2.0, 4.0));
}

void main() {
  vec2 uv = 2.0 * vUv - 1.0;
  vec3 w = pow(max(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime * 1.5), vec3(0.0001)), vec3(1.5));
  vec3 flame = 1.5 * uFlameA * w.x;
  flame *= w.y;
  flame += uFlameB * w.z;
  flame *= smoothstep(0.25, 1.0, abs(uv.y));
  float md = smoothstep(-0.7, 1.0, -uv.y * uv.x);
  flame *= md * md;

  float radialMask = clamp(1.0 - 0.35 * length(uv), 0.0, 1.0);
  vec3 color = flame * uFlameAmt * radialMask * uOpacity;
  float maxCh = max(max(color.r, color.g), color.b);
  float alpha = uIsLight > 0.5
    ? clamp(maxCh * 1.15, 0.0, 0.22)
    : clamp(maxCh * 1.45, 0.0, 0.85);
  gl_FragColor = vec4(color, alpha);
}
`;

export const STARS_VERTEX_SHADER = /* glsl */ `
precision highp float;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform float uTime;
uniform float uSize;
uniform float uDrift;
uniform float uDepth;
uniform float uTwinkle;
uniform float uRotZ;
uniform vec3 uCursor;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uActivity;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;

attribute vec3 aPosition;
attribute float aScale;
attribute float aPhase;
attribute float aPalette;
attribute float aBright;

varying vec3 vColor;
varying float vTwinkle;
varying float vDepthAlpha;

void main() {
  vec3 pos = aPosition;
  pos.z = mod(pos.z + uDrift + (uDepth * 0.5), uDepth) - (uDepth * 0.5);

  float c = cos(uRotZ);
  float s = sin(uRotZ);
  pos.xy = vec2(pos.x * c - pos.y * s, pos.x * s + pos.y * c);

  float tw = sin(uTime * 1.6 + aPhase * 6.2831);
  vTwinkle = (1.0 - uTwinkle) + uTwinkle * (0.55 + 0.45 * tw);

  vec4 modelPosition = vec4(pos, 1.0);
  vec3 toParticle = modelPosition.xyz - uCursor;
  float dist = length(toParticle);
  float falloff = smoothstep(uRepelRadius, 0.0, dist);
  modelPosition.xyz += normalize(toParticle + vec3(0.0001)) * falloff * uRepelStrength * uActivity;

  vec4 viewPosition = uViewMatrix * modelPosition;
  float distCam = -viewPosition.z;
  vDepthAlpha = 1.0 - smoothstep(11.0, 19.0, distCam);

  gl_Position = uProjectionMatrix * viewPosition;
  gl_PointSize = clamp(uSize * aScale * (1.0 / max(0.55, distCam)), 1.0, 44.0);

  vec3 base = aPalette < 0.5 ? uColorA : (aPalette < 1.5 ? uColorB : uColorC);
  vColor = base * aBright;
}
`;

export const STARS_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;
uniform float uOpacity;
uniform float uBrightness;
uniform float uIsLight;
varying vec3 vColor;
varying float vTwinkle;
varying float vDepthAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  float falloffPow = uIsLight > 0.5 ? 1.65 : 4.0;
  float strength = pow(max(0.0, 1.0 - d * 2.0), falloffPow);
  vec3 color = uIsLight > 0.5 ? vColor : mix(vec3(0.0), vColor, strength);
  float alpha = strength * uOpacity * vTwinkle * vDepthAlpha;
  gl_FragColor = vec4(color * uBrightness, clamp(alpha, 0.0, 1.0));
}
`;
