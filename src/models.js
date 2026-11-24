// Personajes 3D armados desde sus hojas de arte realistas (arte/originales/*-realista-image.png).
// Todos miran hacia +Z y comparten esqueleto: root > hips > (legL, legR, torso > (head, armL, armR)).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tex } from './assets.js';
import { heroUniforms, patchHero, projectedMaterial } from './shaders.js';
import P_TUERCA from './perfiles/tuerca.json';
import P_BRASA from './perfiles/brasa.json';
import P_NOX from './perfiles/nox.json';
import P_POMPA from './perfiles/pompa.json';
import P_TAJO from './perfiles/tajo.json';
import P_ZIP from './perfiles/zip.json';

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

// --- Cuerpos armados desde la hoja de arte ---------------------------------------
// Los seis personajes no están hechos de primitivas: cada cuerpo se arma con la
// silueta medida en su hoja de arte (src/perfiles/*.json) y se pinta
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

// Mano de un brazo, en coordenadas del brazo: el centro de su última rodaja en el perfil.
// Ahí van las armas, así quedan en la mano sin medir píxeles a mano.
function handOf(d, name) {
  const rows = d.parts[name], [y, cx, , cz] = rows[rows.length - 1];
  return new THREE.Vector3(cx - d.piv[name], y - d.piv.shoulder, cz);
}

// --- Tuerca: mecánica con remachadora. El arma va en la mano derecha. -------------
function tuerca() {
  const d = P_TUERCA;
  const r = sheetRig(d, 'hoja-tuerca.webp', { headPow: 2.1, bodyPow: 2.4 });
  const steel = std(0xffffff, { map: tex('mat-acero.webp'), metalness: 0.75, roughness: 0.42, ...steelN() });
  const orange = std(0xc65a24, { roughness: 0.55 }), dark = std(0x24262b, { roughness: 0.5, metalness: 0.4 });
  // El brazo cuelga hacia -y; el caño sigue esa dirección, así apunta adelante con el brazo levantado.
  const gun = new THREE.Group();
  gun.position.copy(handOf(d, 'armR'));
  r.armR.add(gun);
  part(new RoundedBoxGeometry(0.09, 0.2, 0.13, 2, 0.02), orange, gun, 0, -0.06, 0.02);
  part(new THREE.CylinderGeometry(0.028, 0.032, 0.26, 10), steel, gun, 0, -0.2, 0.03);
  part(new THREE.BoxGeometry(0.05, 0.1, 0.06), dark, gun, 0, 0.01, -0.06);
  r.armSwing = 0.5;
  r.kickArm = 0;
  r.custom = (s) => {
    // Apunta con el brazo estirado; cada remache lo levanta un poco.
    r.armR.rotation.x = -1.35 - s.kick * 0.4 + Math.sin(s.phase) * 0.1 * s.move;
    r.legL.rotation.x *= 0.8;
    r.legR.rotation.x *= 0.8;
  };
  r.acc = { gun }; // accesorios que usa la vista en primera persona
  return r;
}

// --- Brasa: herrero de fundición. Las brasas de sus guantes brillan solas. --------
function brasa() {
  const r = sheetRig(P_BRASA, 'hoja-brasa.webp', { glow: [1, 0, -1, 1.4], headPow: 2.2, bodyPow: 2.5 });
  const embers = r.art.userData.glow.value;
  r.armSwing = 0.5;
  r.kickArm = 0;
  r.custom = (s) => {
    embers.w = 1.2 + Math.sin(s.t * 3 + r.seed) * 0.3 + s.kick * 1.6; // laten y se encienden al atacar
    r.armL.rotation.x -= s.kick * 1.4;
    r.armR.rotation.x -= s.kick * 1.4;
    r.legL.rotation.x *= 0.6;
    r.legR.rotation.x *= 0.6;
  };
  return r;
}

// --- Nox: exploradora con ballesta, sostenida adelante con las dos manos. ---------
function nox() {
  const d = P_NOX, P = d.piv;
  const r = sheetRig(d, 'hoja-nox.webp', { headPow: 2.1, bodyPow: 2.3 });
  const wood = std(0x6b4226), teal = glow(0x25e6c0, 1);
  // Ballesta: culata, arco curvo hacia adelante con su cuerda tensa y el dardo cargado. Se ve
  // de cerca en primera persona, por eso tiene más detalle que el resto de los accesorios.
  const bow = new THREE.Group();
  bow.position.set(-0.04, P.shoulder - 0.3 - P.hip, 0.36);
  r.torso.add(bow);
  const metal = std(0x3a3f4c, { metalness: 0.65, roughness: 0.38 }), cord = std(0xe8e2cf, { roughness: 0.9 });
  part(new RoundedBoxGeometry(0.075, 0.075, 0.64, 2, 0.02), wood, bow, 0, 0, 0.09);
  part(new RoundedBoxGeometry(0.055, 0.15, 0.085, 2, 0.02), wood, bow, 0, -0.09, -0.1).rotation.x = 0.4;
  part(new THREE.BoxGeometry(0.095, 0.06, 0.07), metal, bow, 0, 0.005, 0.4);
  part(new THREE.BoxGeometry(0.02, 0.05, 0.03), metal, bow, 0, -0.055, 0.0);
  const arc = 1.9, rad = 0.36;
  part(new THREE.TorusGeometry(rad, 0.02, 6, 24, arc).rotateZ(PI / 2 - arc / 2).rotateX(PI / 2), wood, bow, 0, 0.02, 0.41 - rad);
  const tipX = Math.sin(arc / 2) * rad, tipZ = 0.41 - rad + Math.cos(arc / 2) * rad;
  for (const sd of [1, -1]) {
    part(new THREE.SphereGeometry(0.026, 8, 6), metal, bow, sd * tipX, 0.02, tipZ);
    const a = new THREE.Vector3(sd * tipX, 0.02, tipZ), b = new THREE.Vector3(0, 0.045, 0.06);
    const str = part(new THREE.CylinderGeometry(0.005, 0.005, a.distanceTo(b), 4), cord, bow, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    str.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  }
  part(new THREE.CylinderGeometry(0.011, 0.011, 0.36, 6).rotateX(PI / 2), teal, bow, 0, 0.05, 0.24);
  part(new THREE.ConeGeometry(0.022, 0.06, 6).rotateX(PI / 2), teal, bow, 0, 0.05, 0.45);
  r.armSwing = 0;
  r.kickArm = 0;
  r.custom = (s) => {
    bow.position.z = 0.36 - s.kick * 0.12;
    // Los dos brazos van adelante y hacia el centro, sosteniendo la ballesta.
    r.armR.rotation.set(-1.05 - s.kick * 0.15, 0, 0.42);
    r.armL.rotation.set(-0.95 - s.kick * 0.15, 0, -0.5);
    r.torso.rotation.z = Math.sin(s.phase) * 0.04 * s.move;
  };
  r.acc = { bow }; // accesorios que usa la vista en primera persona
  return r;
}

// --- Pompa: química. El frasco va en la mano derecha: lo lanza al atacar. ---------
function pompa() {
  const d = P_POMPA;
  const r = sheetRig(d, 'hoja-pompa.webp', { headPow: 2.2, bodyPow: 2.4 });
  const pink = glow(0xff4fb0, 1.5), glass = std(0xbfe9ff, { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.65 });
  const flask = new THREE.Group();
  flask.position.copy(handOf(d, 'armR')).add(new THREE.Vector3(0, -0.04, 0.05));
  r.armR.add(flask);
  part(new THREE.SphereGeometry(0.11, 14, 12), pink, flask);
  part(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 8), glass, flask, 0, 0.13, 0);
  part(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8), std(0x7a4a26), flask, 0, 0.2, 0);
  r.armSwing = 0.6;
  r.kickArm = 0;
  r.custom = (s) => {
    flask.scale.setScalar(1 - s.kick * 0.7);
    r.armR.rotation.x -= s.kick * 2.2; // tira por arriba
    r.head.rotation.z = Math.sin(s.phase) * 0.04 * s.move;
  };
  r.acc = { flask }; // accesorios que usa la vista en primera persona
  return r;
}

// --- Zip: corredor de parkour con dos cuchillas, una en cada mano. -----------------
function zip() {
  const d = P_ZIP;
  const r = sheetRig(d, 'hoja-zip.webp', { headPow: 2.1, bodyPow: 2.2 });
  const steel = std(0xdff6ff, { metalness: 0.7, roughness: 0.2, emissive: 0x66d9ff, emissiveIntensity: 0.4 }), dark = std(0x1b1c26);
  // Con el brazo colgando, la hoja sale hacia adelante desde el puño.
  const blades = [];
  for (const name of ['armL', 'armR']) {
    const g = new THREE.Group();
    g.position.copy(handOf(d, name));
    r[name].add(g);
    part(new THREE.BoxGeometry(0.05, 0.05, 0.14), dark, g, 0, 0, 0.06);
    part(new THREE.BoxGeometry(0.03, 0.08, 0.5), steel, g, 0, 0, 0.38);
    blades.push(g);
  }
  r.armSwing = 1.1;
  r.kickArm = 0;
  r.custom = (s) => {
    const k = s.kick;
    r.armR.rotation.x += -1.3 * k;
    r.armR.rotation.z = -1.1 * Math.sin(k * PI);
    r.armL.rotation.x += -1.3 * k;
    r.armL.rotation.z = 1.1 * Math.sin(k * PI);
    r.torso.rotation.x += s.move * 0.12;
  };
  r.acc = { blades }; // accesorios que usa la vista en primera persona
  return r;
}

// --- Tajo: zanjero con hacha. Hoja realista; el hacha y el farol van aparte. ---------
function tajo() {
  const d = P_TAJO, U = d.u, P = d.piv, hipY = P.hip, K = d.alto / 1.75; // K: escala de los accesorios
  // Píxel de la hoja original (vista de frente, eje del cuerpo en x = 357) a coordenadas del cuerpo.
  const yOf = (py) => (d.bot - py) * U, xOf = (px) => (px - 357) * U;
  const r = sheetRig(d, 'hoja-tajo.webp', { headPow: 2.1, bodyPow: 2.6 });

  // Farol sobre la cadera derecha y hacha colgada a la espalda (asoma sobre el hombro derecho).
  const steel = std(0xffffff, { map: tex('mat-acero.webp'), metalness: 0.7, roughness: 0.4, ...steelN() });
  const wood = std(0x5e3a1e, { roughness: 0.8 }), brass = std(0xc9962e, { metalness: 0.6, roughness: 0.35 });
  const lamp = glow(0x9dff3a, 1.6);
  const lantern = new THREE.Group();
  lantern.position.set(xOf(262), yOf(470) - hipY, -0.06);
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
  stowed.position.set(xOf(275), yOf(185) - hipY, -0.34); // detrás de la mochila
  stowed.rotation.set(0.1, -PI / 2, -0.5);
  stowed.scale.setScalar(K);
  r.torso.add(stowed);
  part(new THREE.CylinderGeometry(0.026, 0.03, 0.5, 8), wood, stowed, 0, -0.26, 0);
  stowed.add(axeHead());

  // Hacha en la mano: solo aparece durante el golpe.
  const axe = new THREE.Group();
  axe.position.set(xOf(165) - P.armR, yOf(495) - P.shoulder, 0.03); // en la mano
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
  r.acc = { axe, lantern }; // accesorios que usa la vista en primera persona
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
