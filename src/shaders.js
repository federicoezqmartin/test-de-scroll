// Shaders propios: agua, mar, pasto con viento, borde de luz en personajes, escudo,
// zonas de efecto e indicador de puntería. Los que parten de un material estándar
// conservan luces, sombras y niebla de three.js.
import * as THREE from 'three';

// Reloj compartido por todos los shaders animados.
export const shaderTime = { value: 0 };

// Posición (x, z) e intensidad de hasta 6 luchadores visibles: el pasto se abre a su paso.
export const grassFighters = { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, 0)) };
// Ondas expansivas (x, z, radio, fuerza): aplastan el pasto hacia afuera un instante.
export const grassShocks = { value: Array.from({ length: 2 }, () => new THREE.Vector4(0, 0, 1, 0)) };

const NOISE = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Red de luz en el fondo del agua.
float caustic(vec2 uv, float t) {
  const mat3 m = mat3(-2.0, -1.0, 0.0, 3.0, -1.0, 1.0, 1.0, -1.0, -1.0);
  vec3 k = vec3(uv * 7.0, t * 0.8);
  k = k * m * 0.5;
  float v1 = length(0.5 - fract(k));
  k = k * m * 0.2;
  float v2 = length(0.5 - fract(k));
  k = k * m * 0.5;
  float v3 = length(0.5 - fract(k));
  return pow(min(min(v1, v2), v3), 7.0) * 25.0;
}
`;

const RIPPLE = /* glsl */ `
vec2 rippleGrad(vec2 q, float t, float s) {
  q *= s;
  float a = cos(q.x * 5.0 + q.y * 2.0 + t * 1.9), b = cos(q.x * 9.0 - q.y * 4.0 - t * 2.4), c = cos(q.y * 7.0 + q.x + t * 1.3);
  return vec2(a * 5.0 + b * 9.0 + c, a * 2.0 - b * 4.0 + c * 7.0);
}
`;

function patch(material, key, fn) {
  material.onBeforeCompile = fn;
  material.customProgramCacheKey = () => key;
  return material;
}

const WPOS_VERT = (extra = '') => (src) =>
  src
    .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${extra}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');

// --- Piletas -----------------------------------------------------------------
// aEdge marca en cada baldosa qué lados (-x, +x, -z, +z) dan a tierra: ahí va la espuma.
export function waterMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x2fc4d6, roughness: 0.36, metalness: 0, transparent: true, opacity: 0.86, envMapIntensity: 0.3 });
  return patch(m, 'tz-water', (s) => {
    s.uniforms.uTime = shaderTime;
    s.vertexShader = WPOS_VERT('attribute vec4 aEdge;\nattribute vec2 aLocal;\nvarying vec4 vEdge;\nvarying vec2 vLocal;')(s.vertexShader).replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;\nvLocal = aLocal;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec3 vWPos;\nvarying vec4 vEdge;\nvarying vec2 vLocal;\n${NOISE}${RIPPLE}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec2 wp = vWPos.xz;
        vec2 fl = vLocal;
        float ed = 1.0;
        ed = min(ed, mix(1.0, fl.x, vEdge.x));
        ed = min(ed, mix(1.0, 1.0 - fl.x, vEdge.y));
        ed = min(ed, mix(1.0, fl.y, vEdge.z));
        ed = min(ed, mix(1.0, 1.0 - fl.y, vEdge.w));
        float wn = vnoise(wp * 2.3 + vec2(uTime * 0.22, uTime * 0.17));
        float ca = caustic(wp * 0.33 + wn * 0.03, uTime * 0.9);
        vec3 deep = vec3(0.008, 0.20, 0.34), shallow = vec3(0.05, 0.50, 0.55);
        diffuseColor.rgb = mix(deep, shallow, smoothstep(0.6, 0.0, ed) * 0.7 + wn * 0.3);
        diffuseColor.rgb += ca * vec3(0.4, 0.85, 0.8) * 0.2;
        float foamLine = ed + (wn - 0.5) * 0.09 + sin(uTime * 1.6 + wp.x * 2.0 + wp.y * 1.3) * 0.02;
        float foam = smoothstep(0.12, 0.05, foamLine);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.9, 0.9), foam * 0.85);
        diffuseColor.a = mix(diffuseColor.a, 1.0, foam);`)
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
        {
          vec2 g = rippleGrad(vWPos.xz, uTime, 1.0);
          normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz * 0.009);
        }`);
  });
}

// --- Mar alrededor de la isla -------------------------------------------------
export function seaMaterial(halfW, halfH) {
  const m = new THREE.MeshStandardMaterial({ color: 0x0f6f86, roughness: 0.38, metalness: 0, envMapIntensity: 0.15 });
  const island = { value: new THREE.Vector2(halfW, halfH) };
  return patch(m, 'tz-sea', (s) => {
    s.uniforms.uTime = shaderTime;
    s.uniforms.uIsland = island;
    s.vertexShader = WPOS_VERT()(s.vertexShader);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform vec2 uIsland;\nvarying vec3 vWPos;\n${NOISE}${RIPPLE}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec2 wp = vWPos.xz;
        vec2 iq = abs(wp) - uIsland;
        float sd = length(max(iq, 0.0)) + min(max(iq.x, iq.y), 0.0);
        float n1 = vnoise(wp * 0.35 + uTime * 0.05), n2 = vnoise(wp * 1.3 - uTime * 0.12);
        vec3 deep = vec3(0.004, 0.06, 0.12), mid = vec3(0.008, 0.14, 0.21), shore = vec3(0.03, 0.30, 0.33);
        sd += (n1 - 0.5) * 2.4 + (n2 - 0.5) * 0.8;
        float shoreK = smoothstep(7.0, 0.0, sd);
        vec3 sc = mix(deep, mid, smoothstep(28.0, 3.0, sd) * (0.7 + n1 * 0.3));
        sc = mix(sc, shore, shoreK * shoreK * 0.85);
        sc += caustic(wp * 0.12 + n1 * 0.02, uTime * 0.6) * 0.03 * (0.25 + shoreK);
        float wave = sin(sd * 2.6 + uTime * 1.5 + n1 * 3.0 + n2 * 1.5);
        float band = smoothstep(0.86, 0.98, wave) * smoothstep(7.0, 1.0, sd) * (0.25 + n2 * 0.6);
        float rim = smoothstep(1.5 + n2 * 0.5, 0.8, sd) * 0.8;
        float seaFoam = clamp(band * 0.75 + rim, 0.0, 1.0);
        diffuseColor.rgb = mix(sc, vec3(0.5, 0.68, 0.72), seaFoam * 0.85);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, seaFoam);')
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
        {
          vec2 sq = vWPos.xz + vec2(n1, n2) * 3.5; // deforma las ondas para que no se vea una grilla
          vec2 g = rippleGrad(sq, uTime * 0.7, 0.35) + rippleGrad(sq + 13.7, uTime, 1.1) * 0.4;
          normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz * 0.012 * (1.0 - seaFoam));
        }`);
  });
}

// --- Pasto alto ---------------------------------------------------------------
// Cada hoja se dobla con el viento y se aparta de los luchadores cercanos.
export function grassMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true, flatShading: true });
  return patch(m, 'tz-grass', (s) => {
    s.uniforms.uTime = shaderTime;
    s.uniforms.uFighters = grassFighters;
    s.uniforms.uShocks = grassShocks;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uFighters[6];\nuniform vec4 uShocks[2];\nvarying float vHgt;')
      .replace('#include <project_vertex>', /* glsl */ `
        vec4 mvPosition = vec4(transformed, 1.0);
        vec3 gRoot = vec3(0.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          gRoot = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float hgt = clamp(position.y, 0.0, 1.0);
        vHgt = hgt;
        float ph = gRoot.x * 1.3 + gRoot.z * 1.7;
        vec2 bend = vec2(sin(uTime * 1.7 + ph) * 0.11 + sin(uTime * 3.3 + ph * 1.9) * 0.04, cos(uTime * 1.3 + ph * 0.7) * 0.06);
        float flatK = 0.0;
        for (int i = 0; i < 6; i++) {
          vec2 dd = gRoot.xz - uFighters[i].xy;
          float dl = length(dd);
          float k = (1.0 - smoothstep(0.3, 1.15, dl)) * uFighters[i].z;
          bend += (dd / max(dl, 0.05)) * k * 0.6;
          flatK = max(flatK, k);
        }
        for (int i = 0; i < 2; i++) {
          vec2 dd = gRoot.xz - uShocks[i].xy;
          float dl = length(dd);
          float k = (1.0 - smoothstep(0.2, uShocks[i].z, dl)) * uShocks[i].w;
          bend += (dd / max(dl, 0.05)) * k * 0.9;
          flatK = max(flatK, k * 0.8);
        }
        mvPosition.xz += bend * hgt * hgt;
        mvPosition.y *= 1.0 - flatK * 0.5;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHgt;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vHgt * 0.1;');
  });
}

// --- Personajes: borde de luz del color del equipo + destello al recibir daño --
export function heroUniforms(rim = 0x000000) {
  return { uFlash: { value: 0 }, uRim: { value: new THREE.Color(rim) } };
}
export function patchHero(material, u) {
  if (!material.isMeshStandardMaterial) return;
  const extra = material.userData.shaderExtra; // p. ej. la proyección del arte (projectedMaterial)
  patch(material, 'tz-hero' + (material.userData.shaderKey || ''), (s) => {
    extra?.(s);
    s.uniforms.uFlash = u.uFlash;
    s.uniforms.uRim = u.uRim;
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFlash;\nuniform vec3 uRim;')
      .replace('#include <opaque_fragment>', /* glsl */ `
        float rimF = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 2.6);
        outgoingLight += uRim * rimF;
        outgoingLight = mix(outgoingLight, vec3(1.7), uFlash);
        #include <opaque_fragment>`);
  });
}

// --- Arte proyectado ----------------------------------------------------------
// Pinta un cuerpo 3D con la hoja del personaje: cada vértice trae su coordenada en la vista
// de frente, de espalda y de perfil (aUvF, aUvB, aUvS) y cuánto pesa cada una (aW), según
// hacia dónde mira esa parte de la superficie.
export function projectedMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.8, metalness: 0 });
  m.userData.shaderKey = '-proj';
  m.userData.shaderExtra = (s) => {
    s.uniforms.uAtlas = { value: atlas };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUvF;\nattribute vec2 aUvB;\nattribute vec2 aUvS;\nattribute vec3 aW;\nvarying vec2 vUvF;\nvarying vec2 vUvB;\nvarying vec2 vUvS;\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUvF = aUvF;\nvUvB = aUvB;\nvUvS = aUvS;\nvW = aW;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas;\nvarying vec2 vUvF;\nvarying vec2 vUvB;\nvarying vec2 vUvS;\nvarying vec3 vW;')
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 pj = texture2D(uAtlas, vUvF).rgb * vW.x + texture2D(uAtlas, vUvB).rgb * vW.y + texture2D(uAtlas, vUvS).rgb * vW.z;
        diffuseColor.rgb *= pj / max(vW.x + vW.y + vW.z, 0.001);`);
  };
  return m;
}

// --- Escudo de reaparición ----------------------------------------------------
export function shieldMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: shaderTime, uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAlpha; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float band = 0.5 + 0.5 * sin(vP.y * 13.0 - uTime * 5.0);
        float hex = 0.5 + 0.5 * sin(vP.x * 16.0 + uTime) * sin(vP.z * 16.0 - uTime * 0.7);
        float a = f * (0.6 + 0.4 * band) + 0.05 + hex * 0.05;
        gl_FragColor = vec4(uColor * (1.1 + band * 0.7), a * uAlpha);
        #include <colorspace_fragment>
      }`,
  });
}

// --- Zonas en el piso (lluvia de estrellas, charco, aviso de impacto) ---------
export const ZONE_KIND = { stars: 0, toxic: 1, warn: 2 };
export function zoneMaterial(color, kind) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: shaderTime, uColor: { value: new THREE.Color(color) }, uKind: { value: ZONE_KIND[kind] ?? 2 },
      uAlpha: { value: 1 }, uCharge: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime, uKind, uAlpha, uCharge; uniform vec3 uColor;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float ang = atan(p.y, p.x);
        float edge = smoothstep(0.88, 0.95, r) * smoothstep(1.0, 0.975, r);
        float a = 0.0, glow = 0.0;
        if (uKind < 0.5) {
          float rings = smoothstep(0.7, 1.0, sin(r * 15.0 + uTime * 5.0)) * (1.0 - r * 0.6);
          float tw = step(0.955, hash21(floor(p * 8.0) + floor(uTime * 7.0)));
          a = 0.15 + rings * 0.2 + tw * 0.55;
          glow = tw + rings * 0.4;
        } else if (uKind < 1.5) {
          vec2 g = p * 4.5 + vec2(0.0, uTime * 0.25);
          vec2 id = floor(g), f = fract(g) - 0.5;
          float h = hash21(id), grow = fract(h * 7.0 + uTime * 0.55);
          float bub = smoothstep(0.05, 0.0, abs(length(f) - (0.08 + 0.26 * grow))) * (1.0 - grow);
          a = 0.26 + vnoise(p * 4.0 + uTime * 0.5) * 0.16 + bub * 0.45;
          glow = bub;
        } else {
          float dash = step(0.5, fract(ang / 6.2832 * 14.0 + uTime * 0.5));
          edge *= dash * 0.7 + 0.3;
          a = 0.1 + 0.05 * sin(uTime * 9.0);
        }
        if (uCharge < 1.0) a = mix(0.07, 0.32 + 0.1 * sin(uTime * 22.0), step(r, uCharge));
        a = a * smoothstep(1.0, 0.9, r) + edge * 0.9;
        gl_FragColor = vec4(uColor * (1.0 + edge * 0.8 + glow * 1.5), a * uAlpha);
        #include <colorspace_fragment>
      }`,
  });
}

// --- Indicador de puntería ----------------------------------------------------
// mode 0: rectángulo (uv.y recorre el largo); mode 1: abanico o círculo (uv radial).
export function indicatorMaterial(mode) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: shaderTime, uColor: { value: new THREE.Color(0xffffff) }, uAlpha: { value: 1 }, uLen: { value: 1 }, uMode: { value: mode } },
    vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime, uAlpha, uLen, uMode; uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float a;
        if (uMode < 0.5) {
          float along = 1.0 - vUv.y, across = abs(vUv.x - 0.5) * 2.0;
          float border = smoothstep(0.78, 0.97, across), tip = smoothstep(1.0 - 0.12 / max(uLen, 0.3), 1.0, along);
          float stripes = smoothstep(0.3, 0.5, fract(along * uLen * 0.8 - uTime * 1.6)) * 0.3;
          a = (0.2 + stripes * (1.0 - across * 0.6) + border * 0.55 + tip * 0.6) * smoothstep(0.0, 0.06, along);
        } else {
          float r = length(vUv * 2.0 - 1.0);
          float ring = smoothstep(0.9, 0.96, r) * smoothstep(1.0, 0.985, r);
          float pulse = smoothstep(0.3, 0.5, fract(r * uLen * 0.6 - uTime * 1.4)) * 0.26;
          a = 0.18 + pulse * smoothstep(0.1, 0.5, r) + ring * 0.7;
        }
        gl_FragColor = vec4(uColor, a * uAlpha);
        #include <colorspace_fragment>
      }`,
  });
}

// --- Humo y polvo: cuadros que miran a cámara, con transparencia por instancia --
export function puffMaterial(map) {
  return instancedAlpha(new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
}

// Agrega a cualquier material un atributo aAlpha por instancia que multiplica su transparencia.
export function instancedAlpha(m) {
  return patch(m, 'tz-ialpha', (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
  });
}
