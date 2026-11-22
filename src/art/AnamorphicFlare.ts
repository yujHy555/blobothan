import * as BABYLON from 'babylonjs';

/**
 * ANAMORPHIC FLARE — cinema-wide horizontal blue streaks from bright pixels.
 * A single full-screen post-process: sample the scene, detect bright cores,
 * smear them horizontally with a cheap tap kernel, tint cinematic blue and
 * add a soft halo. Enabled only for level 4 (the endless mega-park).
 */
BABYLON.Effect.ShadersStore['anamorphicFragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 texel;
uniform float amount;
uniform float time;

void main(void) {
  vec3 base = texture2D(textureSampler, vUV).rgb;
  if (amount < 0.001) { gl_FragColor = vec4(base, 1.0); return; }

  // Bright-pass: only very bright, warm/cool cores flare.
  vec3 c = texture2D(textureSampler, vUV).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float bright = smoothstep(0.62, 0.95, l);

  // Horizontal smear — 9 taps across a wide cinema streak.
  vec3 streak = vec3(0.0);
  float wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    float fi = float(i);
    float w = exp(-fi * fi * 0.16);
    vec2 uv = vUV + vec2(fi * texel.x * 14.0, 0.0);
    vec3 s = texture2D(textureSampler, uv).rgb;
    float sl = dot(s, vec3(0.299, 0.587, 0.114));
    streak += s * smoothstep(0.5, 0.95, sl) * w;
    wsum += w;
  }
  streak /= max(1.0, wsum);

  // Subtle animated shimmer so the streak feels alive.
  float shimmer = 0.9 + 0.1 * sin(vUV.x * 40.0 - time * 2.0);
  vec3 flareColor = vec3(0.45, 0.78, 1.0) * streak * bright * shimmer * amount;
  // Slight anamorphic halo around the core.
  flareColor += vec3(0.25, 0.5, 0.9) * bright * 0.12 * amount;

  gl_FragColor = vec4(base + flareColor, 1.0);
}`;

export class AnamorphicFlare {
  private pp: BABYLON.PostProcess | null = null;
  private scene: BABYLON.Scene;
  private camera: BABYLON.Camera;
  private t = 0;
  private enabled = false;

  constructor(scene: BABYLON.Scene, camera: BABYLON.Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  public setEnabled(on: boolean) {
    // Keep the post-process permanently attached (Babylon won't re-attach a
    // non-reusable PP). Toggle its 'amount' uniform to switch the effect.
    if (!this.pp) {
      this.pp = new BABYLON.PostProcess('anamorphic', 'anamorphic',
        ['texel', 'amount', 'time'], null, 1.0, this.camera);
      this.pp.onApply = (effect) => {
        const e = this.scene.getEngine();
        effect.setFloat2('texel', 1 / e.getRenderWidth(), 1 / e.getRenderHeight());
        effect.setFloat('amount', this.enabled ? 0.9 : 0.0);
        effect.setFloat('time', this.t);
      };
    }
    this.enabled = on;
  }

  public update(dt: number) { this.t += dt; }

  public dispose() {
    if (this.pp) { this.pp.dispose(); this.pp = null; }
  }
}
