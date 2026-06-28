/**
 * Calm spring-water surface — a full-screen fragment shader (ogl).
 *
 * Per-pixel where it counts: an fbm height field → surface normals → a
 * Schlick-Fresnel blend toward a pale sky (grazing-stronger), plus a sun-glitter
 * band along the reflection column (the stretched, twinkling sun streak that
 * makes a flat plane read as real water). Deliberately PALE and low-contrast —
 * it lives behind page content, so it tints rather than dominates. Petals, koi
 * and catkins are drawn on a 2D overlay above this.
 */
export const WATER_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uScroll;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.0; a *= 0.5; }
  return s;
}

// drifting ripple height: two scales scrolling in different directions
float waterH(vec2 p, float t){
  float h = fbm(p * 3.0 + vec2(t * 0.05, t * 0.03));
  h += 0.5 * fbm(p * 6.5 - vec2(t * 0.06, t * 0.045));
  h += 0.25 * fbm(p * 13.0 + vec2(t * 0.09, -t * 0.05));
  return h;
}

void main(){
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  float t = uTime;

  // compress ripples toward the top → a gently receding surface
  vec2 wp = vec2(uv.x * aspect, uv.y * uv.y + 0.15);
  wp += uPointer * 0.05;

  float e = 0.0026;
  float h0 = waterH(wp, t);
  float hx = waterH(wp + vec2(e, 0.0), t);
  float hy = waterH(wp + vec2(0.0, e), t);
  vec3 n = normalize(vec3(h0 - hx, h0 - hy, e * 7.0));

  // pale jade body, a touch deeper toward the foreground (bottom)
  vec3 deep = vec3(0.60, 0.80, 0.74);
  vec3 shallow = vec3(0.88, 0.95, 0.92);
  vec3 col = mix(deep, shallow, clamp(uv.y, 0.0, 1.0));

  // sky reflection — Schlick-ish on the normal tilt, stronger at grazing (top)
  float graze = pow(clamp(uv.y, 0.0, 1.0), 1.4);
  float fres = 0.03 + 0.55 * pow(1.0 - n.z, 2.2);
  vec3 sky = vec3(0.97, 0.99, 1.0);
  col = mix(col, sky, clamp(fres * graze * 1.25, 0.0, 0.55));

  // wind "cat's-paw": slow low-frequency patches drift across the water; where
  // a patch passes the surface is rougher → brighter ripples + more sparkle.
  // This is what keeps a calm lake alive (and replaces the koi's motion).
  float paw = fbm(wp * 0.6 + vec2(t * 0.018, -t * 0.012));
  paw = smoothstep(0.42, 0.86, paw);
  col += paw * 0.022; // faintly brighter ruffled patches

  // sun-glitter: sparkle where ripple normals point toward the sun, gated to a
  // reflection column under the sun and twinkling on the moving crests
  vec2 sunDir = normalize(vec2(0.30, 1.0));
  float align = dot(normalize(n.xy + 1e-4), sunDir);
  float bandX = 0.72 + uPointer.x * 0.06;
  float band = exp(-pow((uv.x - bandX) / 0.18, 2.0));
  float glit = pow(max(align, 0.0), 46.0) * band;
  glit *= 0.55 + 0.45 * sin(t * 5.5 + h0 * 26.0);
  glit *= 0.45 + 1.2 * paw; // cat's-paw patches sparkle hardest
  col += vec3(1.0, 0.98, 0.92) * max(glit, 0.0) * 0.85;

  // soft warm sun glow, upper-right
  float sun = exp(-length((uv - vec2(0.82, 0.9)) * vec2(1.0 / aspect, 1.0)) * 3.0);
  col += vec3(1.0, 0.96, 0.86) * sun * 0.12;

  // faint cool vignette at the lower corners to settle the edges
  float vig = smoothstep(1.15, 0.35, length(uv - vec2(0.5, 0.55)));
  col *= mix(0.94, 1.0, vig);

  // film grain + dither — break up banding in the pale gradients and add the
  // faint organic texture that reads as "real" rather than digitally clean
  float gn = hash(uv * uResolution + fract(t)) - 0.5;
  col += gn * (1.6 / 255.0); // ordered-ish dither: ~1 quantisation step
  col += gn * 0.012; // a whisper of grain

  gl_FragColor = vec4(col, 0.9);
}
`;
