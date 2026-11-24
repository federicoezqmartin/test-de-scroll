// Brazos de la primera persona, hechos a propósito. El cuerpo de cada personaje se pinta
// proyectando su hoja de arte, y eso aguanta bien de lejos; pegado a la cámara, la piel de la
// hoja se ve estirada. Estos brazos tienen forma torneada (bíceps, codo, antebrazo, puño) y
// texturas generadas acá: piel, tela, cuero, vendas.
//
// Mismo convenio que los brazos del cuerpo: el hombro en el origen y el brazo colgando hacia
// -y, con el frente (los nudillos) hacia +z. userData.len es el largo hasta la punta del puño
// y userData.hand, el centro del puño, donde van las armas.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Colores de cada personaje, sacados de su hoja. sleeve.end y glove.from son alturas sobre el
// brazo (0 en el hombro, -0.52 en la muñeca).
export const ARM_STYLES = {
  tuerca: { skin: 0xc68b69, freckles: true, glove: { color: 0x5b4330, from: -0.49 } },
  brasa: { skin: 0xa36b4c, thick: 1.3, sleeve: { color: 0x3b3b3e, end: -0.13 }, glove: { color: 0x3e2c20, from: -0.43, embers: true } },
  nox: { skin: 0xc99a7c, sleeve: { color: 0x2a3147, end: -0.49 }, glove: { color: 0x3b2a20, from: -0.5 } },
  pompa: { skin: 0xe0b08f, sleeve: { color: 0x6b4c7d, end: -0.3, cuff: true }, glove: { color: 0xd9ad2e, from: -0.37, shiny: true } },
  zip: { skin: 0xc0875f, wraps: { color: 0xa3202a, from: -0.32 } },
  tajo: { skin: 0xc38c69, sleeve: { color: 0xe4dccb, stripes: 0x8a5a3a, end: -0.14 } },
};

const WRIST = -0.52, HAND_Y = -0.575, LEN = 0.635;
// Perfil del brazo: radio según la altura, del hombro a la muñeca.
const PROFILE = [
  [0.0, 0.03], [0.034, 0.022], [0.052, -0.02], [0.058, -0.1], [0.055, -0.19], [0.048, -0.26],
  [0.043, -0.3], [0.047, -0.35], [0.045, -0.42], [0.038, -0.48], [0.033, WRIST], [0.0, WRIST - 0.01],
];

// Texturas: lienzos chicos generados una vez. f(g, s) dibuja sobre un lienzo de s × s.
function canvasTex(s, f, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  f(c.getContext('2d'), s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function speckle(g, s, n, size, color) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = color(i);
    g.beginPath();
    g.arc(rnd(0, s), rnd(0, s), rnd(size * 0.4, size), 0, 6.3);
    g.fill();
  }
}

const TEX = {
  // Piel: manchas suaves de tono y, si corresponde, pecas.
  skin: (freckles) => canvasTex(256, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 260, 18, () => `rgba(${rnd(200, 255) | 0},${rnd(170, 215) | 0},${rnd(160, 200) | 0},0.08)`);
    if (freckles) speckle(g, s, 140, 2.2, () => `rgba(140,80,50,${rnd(0.25, 0.5)})`);
  }, [2, 2]),
  // Tela: trama cruzada y fibras sueltas.
  cloth: (stripes) => canvasTex(128, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) {
      g.fillStyle = `rgba(0,0,0,${i % 4 ? 0.05 : 0.09})`;
      g.fillRect(i, 0, 1, s);
      g.fillRect(0, i, s, 1);
    }
    if (stripes) {
      g.fillStyle = stripes;
      for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 3, s);
    }
  }, [6, 3]),
  // Cuero: poros y raspones.
  leather: () => canvasTex(128, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 500, 1.6, () => `rgba(0,0,0,${rnd(0.05, 0.2)})`);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      const x = rnd(0, s), y = rnd(0, s);
      g.moveTo(x, y);
      g.lineTo(x + rnd(-14, 14), y + rnd(-14, 14));
      g.stroke();
    }
  }, [3, 2]),
  // Vendas: tiras en diagonal con su borde.
  wraps: () => canvasTex(128, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 2;
    for (let i = -s; i < s * 2; i += 14) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + s * 0.5, s);
      g.stroke();
    }
  }, [2, 3]),
  // Brasas del guante de Brasa: grietas que brillan sobre negro.
  embers: () => canvasTex(128, (g, s) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#ff7a1a';
    g.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      g.lineWidth = rnd(1, 2.6);
      g.beginPath();
      let x = rnd(0, s), y = rnd(0, s);
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo((x += rnd(-12, 12)), (y += rnd(-12, 12)));
      g.stroke();
    }
  }, [2, 2]),
};

// Tramo del perfil entre dos alturas, inflado `pad`: sirve para mangas, guantes y vendas.
function sleeveGeo(y0, y1, pad, thick) {
  const pts = [];
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r, y] = PROFILE[i];
    if (y > y0 || y < y1 || r === 0) continue;
    pts.push(new THREE.Vector2(r * thick + pad, y));
  }
  // bordes exactos en las dos alturas
  const at = (y) => {
    for (let i = 0; i < PROFILE.length - 1; i++) {
      const [r0, ya] = PROFILE[i], [r1, yb] = PROFILE[i + 1];
      if (y <= ya && y >= yb) return r0 + ((r1 - r0) * (ya - y)) / (ya - yb || 1);
    }
    return PROFILE[0][0];
  };
  pts.unshift(new THREE.Vector2(at(y0) * thick + pad, y0));
  pts.push(new THREE.Vector2(at(y1) * thick + pad, y1));
  return new THREE.LatheGeometry(pts.reverse(), 24); // de abajo hacia arriba: si no, las caras quedan para adentro
}

// Arma un brazo. side 'R' o 'L': el pulgar va hacia el centro del cuerpo.
export function buildArm(style, side, patch) {
  const k = style.thick ?? 1;
  const g = new THREE.Group();
  const mats = [], texs = [];
  // La misma textura da también el relieve: poros de la piel, trama de la tela, grano del
  // cuero. Sin eso, de cerca parecían de plástico.
  const mat = (o, bump = 0) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });
    if (bump && o.map) {
      m.bumpMap = o.map;
      m.bumpScale = bump;
    }
    patch?.(m);
    mats.push(m);
    for (const t of [o.map, o.emissiveMap]) if (t) texs.push(t);
    return m;
  };
  const add = (geo, m, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const skin = mat({ color: style.skin, map: TEX.skin(style.freckles), roughness: 0.5 }, 0.8);
  const arm = add(new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r * k, y)).reverse(), 28), skin);
  arm.scale.set(1.05, 1, 0.92); // sección un poco ovalada, como un brazo

  if (style.sleeve) {
    const s = style.sleeve;
    const cloth = mat({ color: s.color, map: TEX.cloth(s.stripes && `#${new THREE.Color(s.stripes).getHexString()}`), roughness: 0.92, side: THREE.DoubleSide }, 0.6);
    add(sleeveGeo(0.03, s.end, 0.012, k), cloth).scale.set(1.05, 1, 0.92);
    // borde de la manga (o la manga arremangada)
    const rim = add(new THREE.TorusGeometry(0.05 * k + 0.012, s.cuff ? 0.016 : 0.006, 6, 24), cloth, 0, s.end, 0);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1.05, 0.92, 1);
  }
  if (style.wraps) {
    const w = mat({ color: style.wraps.color, map: TEX.wraps(), roughness: 0.85 }, 1);
    add(sleeveGeo(style.wraps.from, WRIST, 0.005, k), w).scale.set(1.05, 1, 0.92);
  }

  // Puño: palma, fila de nudillos y pulgar. Con guante o vendas, del mismo material.
  let handMat = skin, emberMat = null;
  if (style.glove) {
    const gl = style.glove;
    const o = { color: gl.color, map: TEX.leather(), roughness: gl.shiny ? 0.32 : 0.7 };
    if (gl.embers) Object.assign(o, { emissive: 0xff6a1a, emissiveMap: TEX.embers(), emissiveIntensity: 0.8 });
    handMat = mat(o, 1.5);
    if (gl.embers) emberMat = handMat;
    add(sleeveGeo(gl.from, WRIST, 0.008, k), handMat).scale.set(1.05, 1, 0.92);
  } else if (style.wraps) handMat = mats[mats.length - 1];
  const hk = k > 1 ? 1.15 : 1;
  const fist = add(new RoundedBoxGeometry(0.085 * hk, 0.105 * hk, 0.075 * hk, 3, 0.026), handMat, 0, HAND_Y, 0.004);
  fist.rotation.x = 0.08;
  const knuckles = add(new THREE.CapsuleGeometry(0.02 * hk, 0.055 * hk, 4, 10), handMat, 0, HAND_Y - 0.045 * hk, 0.022);
  knuckles.rotation.z = Math.PI / 2;
  const thumb = add(new THREE.CapsuleGeometry(0.016 * hk, 0.04 * hk, 4, 8), handMat, (side === 'R' ? 1 : -1) * 0.043 * hk, HAND_Y - 0.01, 0.026);
  thumb.rotation.set(0.5, 0, (side === 'R' ? -1 : 1) * 0.5);

  g.userData.len = LEN * (k > 1 ? 1.04 : 1);
  g.userData.hand = new THREE.Vector3(0, HAND_Y, 0);
  g.userData.mats = mats;
  g.userData.texs = texs; // propias de este brazo: se liberan con él
  g.userData.embers = emberMat;
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = false; });
  return g;
}
