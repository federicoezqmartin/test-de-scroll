// Personajes 3D armados con primitivas, siguiendo las hojas de arte (arte/referencias).
// Todos miran hacia +Z y comparten esqueleto: root > hips > (legL, legR, torso > (head, armL, armR)).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tex } from './assets.js';
import { heroUniforms, patchHero, projectedMaterial } from './shaders.js';
import TAJO from './tajo-perfil.json';
import P_TUERCA from './perfiles/tuerca.json';
import P_BRASA from './perfiles/brasa.json';
import P_NOX from './perfiles/nox.json';
import P_POMPA from './perfiles/pompa.json';

const PI = Math.PI;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05, ...o });
const glow = (color, k = 1.8) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k * 0.8, roughness: 0.4 });
const steelN = () => ({ normalMap: tex('mat-acero-n.webp', { data: true }), normalScale: new THREE.Vector2(1.3, 1.3) });

function part(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function baseRig(hipY, height) {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = hipY;
  root.add(hips);
  const legL = new THREE.Group(), legR = new THREE.Group();
  const torso = new THREE.Group();
  hips.add(legL, legR, torso);
  const head = new THREE.Group(), armL = new THREE.Group(), armR = new THREE.Group();
  torso.add(head, armL, armR);
  return { root, hips, legL, legR, torso, head, armL, armR, hipY, height, seed: Math.random() * 10, armSwing: 1, kickArm: 0.5, custom: null };
}

// --- Zip: conejo ninja --------------------------------------------------------
function zip() {
  const r = baseRig(0.4, 1.75);
  const suit = std(0x3b3d4a), fur = std(0xdcdce2), pinkIn = std(0xff9bb5), red = std(0xe0263f, { roughness: 0.8 });
  const blade = std(0xdff6ff, { metalness: 0.7, roughness: 0.2, emissive: 0x66d9ff, emissiveIntensity: 0.4 });
  const black = std(0x101018, { roughness: 0.3 }), dark = std(0x1b1c26);

  for (const [leg, x] of [[r.legL, 0.13], [r.legR, -0.13]]) {
    leg.position.x = x;
    part(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8), suit, leg, 0, -0.17, 0);
    part(new RoundedBoxGeometry(0.15, 0.09, 0.28, 1, 0.03), fur, leg, 0, -0.35, 0.05);
  }
  part(new THREE.CapsuleGeometry(0.22, 0.3, 6, 14), suit, r.torso, 0, 0.3, 0).scale.set(1.05, 1, 0.85);
  part(new THREE.CylinderGeometry(0.235, 0.235, 0.08, 14), red, r.torso, 0, 0.14, 0).scale.set(1.05, 1, 0.85);
  part(new THREE.SphereGeometry(0.1, 10, 8), fur, r.torso, 0, 0.1, -0.24);

  r.head.position.set(0, 0.82, 0);
  part(new THREE.SphereGeometry(0.3, 20, 16), fur, r.head).scale.set(1, 0.95, 0.95);
  part(new THREE.CylinderGeometry(0.295, 0.302, 0.1, 18, 1, true), red, r.head, 0, 0.13, 0).scale.set(1, 1, 0.95);
  for (const x of [0.11, -0.11]) part(new THREE.SphereGeometry(0.045, 8, 8), black, r.head, x, 0.01, 0.265).scale.set(1.2, 0.8, 0.6);
  part(new THREE.SphereGeometry(0.035, 8, 6), pinkIn, r.head, 0, -0.08, 0.285);
  const ears = [];
  for (const x of [0.12, -0.12]) {
    const ear = new THREE.Group();
    ear.position.set(x, 0.22, -0.04);
    r.head.add(ear);
    part(new THREE.CapsuleGeometry(0.065, 0.42, 4, 8), fur, ear, 0, 0.28, 0).scale.set(1, 1, 0.6);
    part(new THREE.CapsuleGeometry(0.035, 0.32, 3, 6), pinkIn, ear, 0, 0.28, 0.03).scale.set(1, 1, 0.5);
    ear.userData.side = Math.sign(x);
    ears.push(ear);
  }
  part(new THREE.TorusGeometry(0.2, 0.07, 8, 16), red, r.torso, 0, 0.6, 0).rotation.x = PI / 2;
  const tails = [];
  for (const x of [0.06, -0.06]) {
    const t = new THREE.Group();
    t.position.set(x, 0.6, -0.2);
    r.torso.add(t);
    part(new THREE.BoxGeometry(0.1, 0.035, 0.46), red, t, 0, 0, -0.23);
    tails.push(t);
  }
  for (const [arm, x] of [[r.armL, 0.3], [r.armR, -0.3]]) {
    arm.position.set(x, 0.5, 0);
    part(new THREE.CapsuleGeometry(0.06, 0.24, 4, 8), suit, arm, 0, -0.16, 0);
    part(new THREE.SphereGeometry(0.075, 10, 8), fur, arm, 0, -0.34, 0);
    part(new THREE.BoxGeometry(0.05, 0.05, 0.14), dark, arm, 0, -0.34, 0.08);
    part(new THREE.BoxGeometry(0.035, 0.09, 0.56), blade, arm, 0, -0.34, 0.42);
  }
  r.armSwing = 1.1;
  r.kickArm = 0;
  r.custom = (s) => {
    for (const e of ears) {
      e.rotation.x = -0.25 - s.move * 0.55 + Math.sin(s.t * 2.2 + r.seed) * 0.05;
      e.rotation.z = -e.userData.side * (0.16 + Math.sin(s.t * 1.7 + r.seed + e.userData.side) * 0.05);
    }
    tails.forEach((t, i) => {
      t.rotation.x = -0.5 + s.move * 0.45 + Math.sin(s.t * 7 + i * 1.3) * (0.1 + s.move * 0.2);
      t.rotation.y = Math.sin(s.t * 5 + i * 2) * 0.25;
    });
    const k = s.kick;
    r.armR.rotation.x += -1.3 * k;
    r.armR.rotation.z = -1.1 * Math.sin(k * PI);
    r.armL.rotation.x += -1.3 * k;
    r.armL.rotation.z = 1.1 * Math.sin(k * PI);
    r.torso.rotation.x += s.move * 0.12;
  };
  return r;
}

// --- Cuerpos armados desde la hoja de arte ---------------------------------------
// Tuerca, Brasa, Nox, Pompa y Tajo no están hechos de primitivas: cada cuerpo se arma con la
// silueta medida en su hoja de arte (src/perfiles/*.json, src/tajo-perfil.json) y se pinta
// proyectando esa misma hoja de frente, perfil y espalda.

// Cuerpo por rodajas: cada fila es [y, centroX, semiAncho, centroZ, semiFondo], de arriba a abajo.
// `power` > 2 da secciones más cuadradas (torso con mochila); 2 es una elipse.
function loft(rows, seg, power) {
  const n = rows.length, e = 2 / power, pos = [], idx = [], ty = [];
  for (const [y, cx, hw, cz, hd, texY] of rows)
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(cx + hw * Math.sign(c) * Math.abs(c) ** e, y, cz + hd * Math.sign(sn) * Math.abs(sn) ** e);
      ty.push(texY ?? y); // altura de la hoja de donde toma el color (por defecto, la propia)
    }
  const top = pos.length / 3;
  pos.push(rows[0][1], rows[0][0], rows[0][3], rows[n - 1][1], rows[n - 1][0], rows[n - 1][3]);
  ty.push(rows[0][5] ?? rows[0][0], rows[n - 1][5] ?? rows[n - 1][0]);
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < seg; k++) {
      const p0 = i * seg + k, p1 = i * seg + ((k + 1) % seg), q0 = p0 + seg, q1 = p1 + seg;
      idx.push(p0, p1, q0, p1, q1, q0);
    }
  for (let k = 0; k < seg; k++) {
    const k1 = (k + 1) % seg;
    idx.push(top, k1, k, top + 1, (n - 1) * seg + k, (n - 1) * seg + k1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('ty', new THREE.Float32BufferAttribute(ty, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Filas extra que cierran en redondo el tope de una parte; toman el color de su primera fila.
function domed(rows, h) {
  const [y, cx, hw, cz, hd] = rows[0];
  return [[1, 0.1], [0.94, 0.38], [0.78, 0.66], [0.5, 0.87], [0.2, 0.97]].map(([up, k]) => [y + h * up, cx, hw * k, cz, hd * k, y]).concat(rows);
}

// Coordenadas de cada vértice dentro de la hoja, para las tres vistas, y el peso de cada una.
function projectSheet(g, d) {
  const P = g.attributes.position, N = g.attributes.normal, TY = g.attributes.ty, [W, H] = d.hoja;
  const uvF = [], uvB = [], uvS = [], w = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i) / d.u, y = TY.getX(i) / d.u, z = P.getZ(i) / d.u;
    const v = 1 - (d.bot - y) / H;
    uvF.push((d.cxF + x) / W, v);
    uvB.push((d.cxB - x) / W, v);
    uvS.push((d.czS + (d.side ?? 1) * z) / W, v); // side -1: el perfil de la hoja mira a la izquierda
    const nx = N.getX(i), nz = N.getZ(i);
    const f = Math.max(0, nz) ** 3 + 0.002, b = Math.max(0, -nz) ** 3, sd = Math.abs(nx) ** 3, t = f + b + sd;
    w.push(f / t, b / t, sd / t);
  }
  g.setAttribute('aUvF', new THREE.Float32BufferAttribute(uvF, 2));
  g.setAttribute('aUvB', new THREE.Float32BufferAttribute(uvB, 2));
  g.setAttribute('aUvS', new THREE.Float32BufferAttribute(uvS, 2));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 3));
  return g;
}

// Esqueleto con un cuerpo por cada parte que tenga el perfil (cabeza, torso, brazos, piernas).
function sheetRig(d, atlas, o = {}) {
  const P = d.piv, hip = P.hip;
  const r = baseRig(hip, d.alto + (o.extra ?? 0.05));
  const art = projectedMaterial(tex(atlas), o.glow);
  const put = (name, parent, px, py, seg, power) => {
    let rows = d.parts[name];
    if (!rows) return;
    // Cabeza o torso que arrancan en una fila ancha: se cierran en redondo en vez de quedar planos.
    const dome = name === 'head' ? o.dome : name === 'body' ? o.bodyDome : 0;
    if (dome) rows = domed(rows, dome);
    const m = new THREE.Mesh(projectSheet(loft(rows, seg, power), d), art);
    m.position.set(-px, -py, 0); // la malla está en coordenadas del cuerpo entero
    m.castShadow = true;
    parent.add(m);
  };
  put('body', r.torso, 0, hip, 28, o.bodyPow ?? 2.3);
  r.head.position.set(0, P.neck - hip, 0);
  put('head', r.head, 0, P.neck, 28, o.headPow ?? 2.1);
  for (const [name, grp, px] of [['legL', r.legL, P.legL], ['legR', r.legR, P.legR]]) {
    grp.position.x = px;
    put(name, grp, px, hip, 16, 2.2);
  }
  for (const [name, grp, px] of [['armL', r.armL, P.armL], ['armR', r.armR, P.armR]]) {
    grp.position.set(px, P.shoulder - hip, 0);
    put(name, grp, px, P.shoulder, 16, 2.1);
  }
  r.art = art;
  r.headTop = d.parts.head[0][0] - P.neck; // tope de la cabeza, medido desde el cuello
  return r;
}

// --- Tuerca: robot de taller. La antena va aparte, para que se mueva. -----------
function tuerca() {
  const r = sheetRig(P_TUERCA, 'hoja-tuerca.webp', { glow: [-1, 0, 1, 1.2], headPow: 2, bodyPow: 2.6 });
  const steel = std(0xffffff, { map: tex('mat-acero.webp'), metalness: 0.75, roughness: 0.42, ...steelN() });
  const ant = new THREE.Group();
  ant.position.set(0, r.headTop - 0.02, 0);
  r.head.add(ant);
  part(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), steel, ant, 0, 0.1, 0);
  part(new THREE.SphereGeometry(0.06, 12, 10), std(0xd0211c, { roughness: 0.25 }), ant, 0, 0.22, 0);
  r.armSwing = 0.5;
  r.kickArm = 0;
  r.custom = (s) => {
    ant.rotation.z = Math.sin(s.t * 6 + r.seed) * 0.12 + Math.sin(s.phase) * 0.2 * s.move;
    // El brazo taladro apunta hacia adelante y retrocede con cada disparo.
    r.armR.rotation.x = -0.6 - s.kick * 0.8 + Math.sin(s.phase) * 0.15 * s.move;
    r.legL.rotation.x *= 0.7;
    r.legR.rotation.x *= 0.7;
    r.head.rotation.z = Math.sin(s.phase) * 0.04 * s.move;
  };
  return r;
}

// --- Brasa: gólem de lava. Las grietas brillan solas; la llama va aparte. --------
function brasa() {
  const r = sheetRig(P_BRASA, 'hoja-brasa.webp', { glow: [1, 0, -1, 1.5], headPow: 2.4, bodyPow: 2.5, extra: 0.35, dome: 0.07 });
  const hot = glow(0xffb81a, 1.9), fire = glow(0xff5a0a, 1.5);
  const flame = new THREE.Group();
  flame.position.set(0, r.headTop, -0.03);
  r.head.add(flame);
  const f1 = part(new THREE.ConeGeometry(0.15, 0.4, 7), fire, flame, 0, 0.18, 0);
  const f2 = part(new THREE.ConeGeometry(0.09, 0.3, 6), hot, flame, 0.02, 0.16, 0.03);
  const f3 = part(new THREE.ConeGeometry(0.07, 0.24, 6), fire, flame, -0.11, 0.1, 0);
  f1.castShadow = f2.castShadow = f3.castShadow = false;
  const lava = r.art.userData.glow.value;
  r.armSwing = 0.5;
  r.kickArm = 0;
  r.custom = (s) => {
    const k = 1 + Math.sin(s.t * 11 + r.seed) * 0.16 + Math.sin(s.t * 17) * 0.1;
    f1.scale.set(1, k, 1);
    f2.scale.set(1, 2 - k, 1);
    f3.rotation.z = 0.3 + Math.sin(s.t * 9) * 0.2;
    lava.w = 1.4 + Math.sin(s.t * 3 + r.seed) * 0.3 + s.kick * 1.6; // la lava late y se enciende al atacar
    r.armL.rotation.x -= s.kick * 1.4;
    r.armR.rotation.x -= s.kick * 1.4;
    r.legL.rotation.x *= 0.6;
    r.legR.rotation.x *= 0.6;
  };
  return r;
}

// --- Nox: lechuza arquera. La ballesta 3D va delante, para que se vea a dónde apunta. --
function nox() {
  const d = P_NOX;
  const r = sheetRig(d, 'hoja-nox.webp', { glow: [-1, 0, 1, 1.2], headPow: 2.2, bodyPow: 2.3, dome: 0.17, bodyDome: 0.1 });
  const wood = std(0x6b4226), teal = glow(0x25e6c0, 1), navy = std(0x2c2b55, { roughness: 0.85 });
  // Los mechones de las orejas van aparte: en la hoja son dos puntas sueltas.
  for (const sd of [1, -1]) {
    const tuft = part(new THREE.ConeGeometry(0.11, 0.34, 5), navy, r.head, sd * 0.25, r.headTop + 0.12, -0.02);
    tuft.rotation.z = -sd * 0.42;
  }
  const bow = new THREE.Group();
  bow.position.set(-0.06, 0.5 - d.piv.hip, 0.42);
  r.torso.add(bow);
  part(new THREE.BoxGeometry(0.07, 0.07, 0.62), wood, bow, 0, 0, 0.1);
  part(new THREE.BoxGeometry(0.66, 0.05, 0.06), wood, bow, 0, 0.02, 0.34);
  part(new THREE.BoxGeometry(0.025, 0.025, 0.3), teal, bow, 0, 0.055, 0.2);
  r.armSwing = 0;
  r.kickArm = 0;
  r.custom = (s) => {
    bow.position.z = 0.42 - s.kick * 0.14;
    r.head.rotation.z = Math.sin(s.t * 0.7 + r.seed) * 0.08 * (1 - s.move);
    r.torso.rotation.z = Math.sin(s.phase) * 0.07 * s.move; // camina balanceándose
  };
  return r;
}

// --- Pompa: sapo alquimista. El frasco de la mano va aparte: lo lanza al atacar. ---
function pompa() {
  const d = P_POMPA;
  const r = sheetRig(d, 'hoja-pompa.webp', { headPow: 2.2, bodyPow: 2.3, bodyDome: 0.06 });
  const pink = glow(0xff4fb0, 1.5), glass = std(0xbfe9ff, { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.65 });
  const flask = new THREE.Group();
  flask.position.set(0.5, 0.74 - d.piv.hip, 0.24);
  r.torso.add(flask);
  part(new THREE.SphereGeometry(0.13, 14, 12), pink, flask);
  part(new THREE.CylinderGeometry(0.04, 0.055, 0.12, 8), glass, flask, 0, 0.15, 0);
  part(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 8), std(0x7a4a26), flask, 0, 0.23, 0);
  r.armSwing = 0;
  r.kickArm = 0;
  r.custom = (s) => {
    r.torso.scale.y = 1 + Math.sin(s.t * 2.6 + r.seed) * 0.03; // respira
    flask.scale.setScalar(1 - s.kick * 0.7);
    r.hips.position.y += Math.abs(Math.sin(s.phase)) * 0.1 * s.move; // avanza a saltitos
    r.head.rotation.z = Math.sin(s.phase) * 0.05 * s.move;
  };
  return r;
}

// --- Tajo: zanjero con hacha (su perfil es anterior y trae otro formato) ----------
function tajo() {
  const d = TAJO, U = d.u, K = d.alto / 1.75; // K: escala de los accesorios
  const yOf = (px) => (d.bot - px) * U, xOf = (px) => (px - d.cxF) * U;
  const hipY = yOf(560), neckY = yOf(198), shoulderY = yOf(266);
  const r = baseRig(hipY, d.alto + 0.05);
  const art = projectedMaterial(tex('tajo-hoja.webp'));
  const body = (name, parent, pivotX, pivotY, seg, power) => {
    const m = new THREE.Mesh(projectSheet(loft(d.parts[name], seg, power), d), art);
    m.position.set(-pivotX, -pivotY, 0); // la malla está en coordenadas del cuerpo entero
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  body('body', r.torso, 0, hipY, 28, 2.7);
  r.head.position.set(0, neckY - hipY, 0);
  body('head', r.head, 0, neckY, 24, 2.15);
  for (const [name, grp, px] of [['legL', r.legL, xOf(358)], ['legR', r.legR, xOf(236)]]) {
    grp.position.x = px;
    body(name, grp, px, hipY, 20, 2.3);
  }
  for (const [name, grp, px] of [['armL', r.armL, xOf(402)], ['armR', r.armR, xOf(190)]]) {
    grp.position.set(px, shoulderY - hipY, 0);
    body(name, grp, px, shoulderY, 14, 2);
  }

  // Farol sobre la cadera derecha y hacha colgada a la espalda (asoma sobre el hombro derecho).
  const steel = std(0xffffff, { map: tex('mat-acero.webp'), metalness: 0.7, roughness: 0.4, ...steelN() });
  const wood = std(0x5e3a1e, { roughness: 0.8 }), brass = std(0xc9962e, { metalness: 0.6, roughness: 0.35 });
  const lamp = glow(0x9dff3a, 1.6);
  const lantern = new THREE.Group();
  lantern.position.set(xOf(206), yOf(418) - hipY, -0.22 * K);
  lantern.scale.setScalar(K);
  r.torso.add(lantern);
  part(new THREE.SphereGeometry(0.062, 12, 10), lamp, lantern, 0, -0.07, 0).castShadow = false;
  part(new THREE.TorusGeometry(0.066, 0.013, 5, 12), steel, lantern, 0, -0.07, 0);
  part(new THREE.TorusGeometry(0.066, 0.013, 5, 12).rotateY(PI / 2), steel, lantern, 0, -0.07, 0);
  part(new THREE.CylinderGeometry(0.04, 0.055, 0.035, 8), steel, lantern, 0, 0, 0);
  part(new THREE.CylinderGeometry(0.04, 0.03, 0.03, 8), steel, lantern, 0, -0.14, 0);

  const axeHead = () => {
    const g = new THREE.Group();
    part(new THREE.BoxGeometry(0.05, 0.1, 0.1), steel, g);
    const blade = part(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 16, 1, false, -0.95, 1.9).rotateZ(PI / 2), steel, g, 0, 0, 0.05);
    blade.scale.set(1, 1.3, 1.15);
    part(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8), brass, g, 0, -0.09, 0);
    return g;
  };
  const stowed = new THREE.Group();
  stowed.position.set(xOf(196), yOf(175) - hipY, -0.26 * K);
  stowed.rotation.set(0.1, -PI / 2, -0.5);
  stowed.scale.setScalar(K);
  r.torso.add(stowed);
  part(new THREE.CylinderGeometry(0.026, 0.03, 0.5, 8), wood, stowed, 0, -0.26, 0);
  stowed.add(axeHead());

  // Hacha en la mano: solo aparece durante el golpe.
  const axe = new THREE.Group();
  axe.position.set(xOf(116) - xOf(190), yOf(560) - shoulderY, 0.03);
  r.armR.add(axe);
  axe.rotation.x = PI / 2; // el mango sale hacia adelante de la mano
  axe.scale.setScalar(K);
  part(new THREE.CylinderGeometry(0.026, 0.03, 0.8, 8), wood, axe, 0, 0.3, 0);
  const hand = axeHead();
  hand.position.y = 0.66;
  axe.add(hand);
  axe.visible = false;

  r.armSwing = 0.35;
  r.kickArm = 0;
  r.custom = (s) => {
    // Piernas y brazos son piezas rígidas y largas: se mueven menos que las de los muñecos.
    r.legL.rotation.x *= 0.55;
    r.legR.rotation.x *= 0.55;
    // Hachazo: el brazo arranca en alto con el hacha sobre la cabeza y baja de golpe.
    axe.visible = s.kick > 0.03;
    stowed.visible = !axe.visible;
    r.armR.rotation.x = Math.sin(s.phase) * 0.3 * s.move - 2.5 * s.kick ** 0.8;
    lantern.rotation.z = Math.sin(s.phase) * 0.25 * s.move + Math.sin(s.t * 2 + r.seed) * 0.05;
    lamp.emissiveIntensity = 1.1 + Math.sin(s.t * 4 + r.seed) * 0.2;
    r.torso.rotation.x += s.move * 0.05;
  };
  return r;
}

const BUILDERS = { tuerca, brasa, nox, pompa, zip, tajo };

export function buildHero(id) {
  const r = (BUILDERS[id] || tuerca)();
  // Todos los materiales del personaje comparten borde de luz y destello de daño.
  r.fxU = heroUniforms();
  r.root.traverse((o) => { if (o.isMesh) patchHero(o.material, r.fxU); });
  return r;
}

// s = { t, move (0..1), phase, kick (1 -> 0 tras atacar) }
export function animateRig(r, s) {
  const sw = Math.sin(s.phase) * 0.85 * s.move;
  r.legL.rotation.x = sw;
  r.legR.rotation.x = -sw;
  r.hips.position.y = r.hipY + Math.abs(Math.cos(s.phase)) * 0.07 * s.move + Math.sin(s.t * 2.4 + r.seed) * 0.018;
  r.torso.rotation.x = 0.1 * s.move - s.kick * 0.18;
  r.torso.rotation.z = Math.sin(s.phase) * 0.05 * s.move;
  r.armL.rotation.x = -sw * 0.7 * r.armSwing;
  r.armR.rotation.x = sw * 0.7 * r.armSwing - s.kick * r.kickArm;
  r.head.rotation.y = Math.sin(s.t * 0.9 + r.seed) * 0.14 * (1 - s.move);
  r.custom?.(s);
}

// Libera geometrías y materiales; las texturas son compartidas y quedan.
export function disposeRig(r) {
  r.root.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}
