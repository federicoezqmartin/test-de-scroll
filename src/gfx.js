// Calidad gráfica y posprocesado: oclusión ambiental, bloom, desenfoque de maqueta,
// corrección de color y viñeta. En calidad baja se dibuja directo, sin nada de esto.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { BASE_LOOK } from './looks.js';

export const QUALITY_ORDER = ['baja', 'media', 'alta'];
export const QUALITY = {
  baja: { label: 'Baja', dpr: 1.25, shadow: 1024, shadowRadius: 1.6, post: false, msaa: 0, ao: false, tilt: false, fxaa: false, lights: 0, fxScale: 0.6, boost: 1 },
  media: { label: 'Media', dpr: 1.5, shadow: 2048, shadowRadius: 2.4, post: true, msaa: 0, ao: false, tilt: false, fxaa: true, lights: 2, fxScale: 0.85, boost: 1.9 },
  alta: { label: 'Alta', dpr: 1.5, shadow: 4096, shadowRadius: 3.6, post: true, msaa: 4, ao: true, tilt: true, fxaa: false, lights: 4, fxScale: 1, boost: 1.9 },
};

// Oclusión ambiental a media resolución; ignora lo transparente y lo que no ocupa volumen.
class AOPass extends GTAOPass {
  setSize(w, h) {
    super.setSize(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)));
  }
  _overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const m = o.material;
      if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO || (m && (m.transparent || m.depthWrite === false))) {
        o.visible = false;
        cache.push(o);
      }
    });
  }
}

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uVig: { value: 0.28 }, uSat: { value: 1.14 }, uCon: { value: 1.08 }, uGrain: { value: 0.022 }, uCA: { value: 0 }, uSplit: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVig, uSat, uCon, uGrain, uCA, uSplit;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uCA > 0.0) {
        vec2 o = d * r2 * uCA;
        c.r = texture2D(tDiffuse, vUv + o).r;
        c.b = texture2D(tDiffuse, vUv - o).b;
      }
      c = (c - 0.5) * uCon + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      // virado: sombras frías, luces cálidas; uSplit dice cuánto (cada vista tiene el suyo)
      vec3 tint = mix(vec3(0.95, 0.99, 1.07), vec3(1.05, 1.01, 0.95), smoothstep(0.05, 0.9, l));
      c *= mix(vec3(1.0), tint, uSplit);
      c *= 1.0 - uVig * smoothstep(0.1, 0.55, r2);
      c += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class Gfx {
  constructor(renderer) {
    this.renderer = renderer;
    this.name = '';
    this.q = QUALITY.media;
    this.w = 1;
    this.h = 1;
    this.composer = null;
    this.size = new THREE.Vector2();
    // Sin esta extensión no se puede dibujar en buffers de alto rango: se juega sin posprocesado.
    const ext = renderer.extensions;
    this.canPost = renderer.capabilities.isWebGL2 !== false && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.look = BASE_LOOK; // exposición, resplandor y color de la vista (ver looks.js)
    this.blank = new THREE.Scene();
    this.blankCam = new THREE.PerspectiveCamera();
  }

  setQuality(name) {
    if (!QUALITY[name]) name = 'media';
    this.name = name;
    this.q = this.canPost || !QUALITY[name].post ? QUALITY[name] : { ...QUALITY[name], post: false, boost: 1 };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.dpr));
    this.teardown();
    if (this.q.post) this.build();
    if (this.opts) this.setOptions(this.opts);
    this.setSize(this.w, this.h);
  }

  teardown() {
    if (!this.composer) return;
    for (const p of this.composer.passes) p.dispose?.();
    this.composer.dispose();
    this.composer = this.ao = this.bloom = this.grade = this.tiltH = this.tiltV = this.renderPass = null;
  }

  build() {
    const r = this.renderer, q = this.q;
    r.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x), h = Math.max(1, this.size.y);
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa });
    const c = (this.composer = new EffectComposer(r, rt));
    c.addPass((this.renderPass = new RenderPass(this.blank, this.blankCam)));
    if (q.ao) {
      this.ao = new AOPass(this.blank, this.blankCam, w, h);
      this.ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 10, screenSpaceRadius: false });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 10 });
      this.ao.blendIntensity = 0.9;
      c.addPass(this.ao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.5, 1.12);
    c.addPass(this.bloom);
    if (q.tilt) {
      c.addPass((this.tiltH = new ShaderPass(HorizontalTiltShiftShader)));
      c.addPass((this.tiltV = new ShaderPass(VerticalTiltShiftShader)));
      this.tiltH.uniforms.r.value = this.tiltV.uniforms.r.value = 0.5;
    }
    c.addPass(new OutputPass());
    if (q.fxaa) c.addPass(new FXAAPass());
    c.addPass((this.grade = new ShaderPass(GradeShader)));
    this.grade.uniforms.uCA.value = q.ao ? 0.005 : 0;
  }

  // Efectos que se prenden y apagan desde Configuración, dentro de lo que el nivel permite.
  setOptions(o) {
    this.opts = { bloom: o.bloom !== false, tilt: o.tilt !== false, grade: o.grade !== false };
    if (!this.composer) return;
    this.bloom.enabled = this.opts.bloom;
    if (this.tiltH) this.tiltH.enabled = this.opts.tilt;
    if (this.tiltV) this.tiltV.enabled = this.opts.tilt;
    this.applyLook();
  }

  // Look de la vista. Se llama en cada cuadro: son unos pocos valores, no rearma nada.
  setLook(look) {
    this.look = look;
    this.renderer.toneMappingExposure = look.exposure;
    if (this.composer) this.applyLook();
  }

  // Con "Color de cine" apagado la imagen queda neutra en todas las vistas.
  applyLook() {
    const u = this.grade.uniforms, on = this.opts ? this.opts.grade : true, l = this.look;
    u.uVig.value = on ? l.vig : 0;
    u.uSat.value = on ? l.sat : 1;
    u.uCon.value = on ? l.con : 1;
    u.uGrain.value = on ? l.grain : 0;
    u.uSplit.value = on ? l.split : 0;
    u.uCA.value = on && this.q.ao ? 0.005 : 0;
    this.bloom.strength = l.bloom;
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    if (!this.composer) return;
    this.renderer.getDrawingBufferSize(this.size);
    const bw = Math.max(1, this.size.x), bh = Math.max(1, this.size.y);
    this.composer.setSize(bw, bh);
    this.grade.uniforms.uRes.value.set(bw, bh);
    if (this.tiltH) {
      // Cuánto se desenfoca arriba y abajo: apenas, para dar aire de maqueta sin molestar.
      this.tiltH.uniforms.h.value = 1.15 / bw;
      this.tiltV.uniforms.v.value = 1.15 / bh;
    }
  }

  render(scene, camera, dt) {
    if (!this.composer) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.ao) {
      this.ao.scene = scene;
      this.ao.camera = camera;
    }
    this.grade.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
