import * as BABYLON from 'babylonjs';

/**
 * COZY WINDOW SHADER — next-gen candlelit interior glow.
 *
 * Samples the painted window-emissive map and adds: per-window phase-shifted
 * candle flicker (hash noise in UV-cell space), a warm black-body colour ramp,
 * a soft bloom halo and a slow breathing pulse — so lit windows read as real
 * inhabited interiors rather than flat yellow rectangles. Additive blending
 * lets the glow layer bloom them beautifully. Cost: one quad per town layer.
 */
BABYLON.Effect.ShadersStore['cozyWindowVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void) {
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

BABYLON.Effect.ShadersStore['cozyWindowFragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D windowMap;
uniform float time;
uniform float warmth;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Smooth value noise for organic candle flutter.
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main(void) {
  vec4 src = texture2D(windowMap, vUV);
  float mask = src.a;
  if (mask < 0.01) discard;

  // Each window occupies a coarse UV cell → its own independent flicker seed.
  vec2 cell = floor(vUV * vec2(34.0, 12.0));
  float seed = hash(cell);
  float flick = noise(vec2(time * 1.7 + seed * 20.0, seed * 31.0));
  flick = 0.82 + 0.18 * flick;                       // subtle candle flutter
  float breathe = 0.94 + 0.06 * sin(time * 0.7 + seed * 6.2831);

  // Black-body-ish warm ramp: deep amber core → soft golden halo.
  vec3 core = vec3(1.0, 0.84, 0.55);
  vec3 edge = vec3(1.0, 0.55, 0.22);
  float radial = clamp(src.r + src.g * 0.4, 0.0, 1.0);
  vec3 col = mix(edge, core, radial) * warmth;

  // A gentle pulsing halo bleeds past the window frame.
  float halo = smoothstep(0.0, 0.45, mask) * (0.55 + 0.45 * flick) * breathe;
  gl_FragColor = vec4(col * flick * breathe, mask * halo);
}`;

export function createCozyWindowMaterial(scene: BABYLON.Scene, name: string, map: BABYLON.Texture, warmth = 1.0) {
  const m = new BABYLON.ShaderMaterial(name, scene,
    { vertex: 'cozyWindow', fragment: 'cozyWindow' },
    { attributes: ['position', 'uv'], uniforms: ['worldViewProjection', 'time', 'warmth'], samplers: ['windowMap'] });
  m.setTexture('windowMap', map);
  m.setFloat('warmth', warmth);
  m.setFloat('time', 0);
  m.alphaMode = BABYLON.Engine.ALPHA_ADD;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.needAlphaBlending = () => true;
  return m;
}
