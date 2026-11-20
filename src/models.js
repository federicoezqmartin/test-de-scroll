// Personajes 3D armados con primitivas, siguiendo las hojas de arte (arte/referencias).
// Todos miran hacia +Z y comparten esqueleto: root > hips > (legL, legR, torso > (head, armL, armR)).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tex } from './assets.js';

const PI = Math.PI;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05, ...o });
const glow = (color, k = 1.8) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k * 0.55, roughness: 0.4 });

function part(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Texturas chicas dibujadas una sola vez y compartidas (no se liberan con el personaje).
const drawn = {};
function drawTex(key, size, draw) {
  if (!drawn[key]) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    drawn[key] = t;
  }
  return drawn[key];
}
const hazardTex = () => drawTex('hazard', 64, (g, s) => {
  g.fillStyle = '#e8c21a';
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#1b1a18';
  for (let i = -s; i < s * 2; i += 32) {
    g.beginPath();
    g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - s, s); g.lineTo(i - s, s);
    g.fill();
  }
});
const stripesTex = () => drawTex('stripes', 64, (g, s) => {
  g.fillStyle = '#eee3d6';
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#c8b1a8';
  for (let i = 0; i < s; i += 8) g.fillRect(i, 0, 3, s);
});
const frogTex = () => drawTex('frog', 128, (g, s) => {
  g.fillStyle = '#6fae2a';
  g.fillRect(0, 0, s, s);
  let a = 11;
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = i % 3 ? 'rgba(62,120,26,.55)' : 'rgba(150,190,60,.5)';
    g.beginPath();
    g.ellipse(rnd() * s, rnd() * s, 4 + rnd() * 9, 3 + rnd() * 6, rnd() * 3, 0, 7);
    g.fill();
  }
});

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

// --- Tuerca: robot de taller, casco enorme y brazo taladro --------------------
function tuerca() {
  const r = baseRig(0.3, 1.72);
  const steel = std(0xffffff, { map: tex('mat-acero.webp'), metalness: 0.75, roughness: 0.42 });
  const orange = std(0xffffff, { map: tex('mat-naranja.webp'), metalness: 0.3, roughness: 0.62 });
  const dark = std(0x3a3837, { metalness: 0.6, roughness: 0.5 });
  const glass = std(0x07090d, { roughness: 0.1, metalness: 0.5 });
  const hazard = std(0xffffff, { map: hazardTex(), metalness: 0.3, roughness: 0.6 });
  const cyan = glow(0x2fe6f5, 3.4), red = std(0xd0211c, { roughness: 0.25 }), white = glow(0xffffff, 2);

  for (const [leg, x] of [[r.legL, 0.17], [r.legR, -0.17]]) {
    leg.position.x = x;
    part(new RoundedBoxGeometry(0.24, 0.2, 0.26, 2, 0.07), orange, leg, 0, -0.1, 0);
    part(new RoundedBoxGeometry(0.27, 0.14, 0.32, 2, 0.06), dark, leg, 0, -0.23, 0.03);
  }
  part(new RoundedBoxGeometry(0.6, 0.46, 0.46, 3, 0.12), orange, r.torso, 0, 0.24, 0);
  part(new RoundedBoxGeometry(0.3, 0.24, 0.06, 2, 0.02), orange, r.torso, 0, 0.27, 0.235);
  part(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 6).rotateX(PI / 2), steel, r.torso, 0, 0.27, 0.275);
  part(new RoundedBoxGeometry(0.32, 0.24, 0.05, 2, 0.02), orange, r.torso, 0, 0.27, -0.235);
  for (let i = 0; i < 3; i++) part(new THREE.BoxGeometry(0.18, 0.028, 0.02), dark, r.torso, 0, 0.21 + i * 0.06, -0.265);
  part(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 12), dark, r.torso, 0, 0.5, 0);

  r.head.position.set(0, 0.93, 0);
  part(new THREE.SphereGeometry(0.44, 28, 20), steel, r.head);
  part(new THREE.SphereGeometry(0.447, 12, 8, PI - 0.75, 0.75, 0.35, 0.62), orange, r.head);
  part(new THREE.SphereGeometry(0.447, 12, 8, 0, 0.75, 0.35, 0.62), orange, r.head);
  part(new THREE.SphereGeometry(0.455, 28, 12, PI / 2 - 1.02, 2.04, 1.12, 0.95), glass, r.head);
  for (const s of [1, -1]) {
    part(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16).rotateZ(PI / 2), orange, r.head, s * 0.44, -0.03, 0);
    part(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 12).rotateZ(PI / 2), steel, r.head, s * 0.485, -0.03, 0);
  }
  const eye = new THREE.Group();
  eye.position.set(0, -0.05, 0.452);
  r.head.add(eye);
  part(new THREE.TorusGeometry(0.105, 0.034, 8, 22), cyan, eye);
  part(new THREE.SphereGeometry(0.045, 10, 8), cyan, eye, 0, 0, 0.005);
  part(new THREE.SphereGeometry(0.024, 8, 6), white, eye, 0.05, 0.035, 0.03);
  part(new THREE.CylinderGeometry(0.1, 0.14, 0.07, 14), steel, r.head, 0, 0.44, 0);
  const ant = new THREE.Group();
  ant.position.set(0, 0.47, 0);
  r.head.add(ant);
  part(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), steel, ant, 0, 0.11, 0);
  part(new THREE.SphereGeometry(0.06, 12, 10), red, ant, 0, 0.26, 0);

  for (const [arm, x] of [[r.armL, 0.37], [r.armR, -0.37]]) {
    arm.position.set(x, 0.4, 0);
    part(new THREE.SphereGeometry(0.095, 12, 10), steel, arm);
    part(new THREE.CylinderGeometry(0.085, 0.1, 0.16, 12), orange, arm, 0, -0.11, 0);
    part(new THREE.CylinderGeometry(0.105, 0.105, 0.12, 14), hazard, arm, 0, -0.24, 0);
  }
  part(new THREE.CylinderGeometry(0.1, 0.075, 0.1, 12), steel, r.armR, 0, -0.34, 0);
  part(new THREE.ConeGeometry(0.075, 0.18, 12).rotateX(PI), steel, r.armR, 0, -0.47, 0);
  part(new THREE.SphereGeometry(0.085, 10, 8), steel, r.armL, 0, -0.35, 0);
  for (const fx of [-0.05, 0, 0.05]) part(new THREE.BoxGeometry(0.035, 0.09, 0.04), dark, r.armL, fx, -0.44, 0.02);

  r.armSwing = 0.6;
  r.kickArm = 0;
  r.custom = (s) => {
    ant.rotation.z = Math.sin(s.t * 6 + r.seed) * 0.12 + Math.sin(s.phase) * 0.2 * s.move;
    eye.scale.setScalar(1 + s.kick * 0.25);
    r.armR.rotation.x = -0.55 - s.kick * 0.9 + Math.sin(s.phase) * 0.2 * s.move;
    r.armR.position.z = -s.kick * 0.08;
    r.head.rotation.z = Math.sin(s.phase) * 0.04 * s.move;
  };
  return r;
}

// --- Brasa: gólem de roca con grietas de lava ---------------------------------
function brasa() {
  const r = baseRig(0.3, 1.6);
  const rock = new THREE.MeshStandardMaterial({
    map: tex('mat-lava.webp'), emissiveMap: tex('mat-lava-brillo.webp'), emissive: 0xffffff, emissiveIntensity: 1.5,
    roughness: 0.95, flatShading: true,
  });
  const stone = std(0x3a3231, { flatShading: true, roughness: 0.95 });
  const hot = glow(0xffb81a, 1.9), fire = glow(0xff5a0a, 1.5);
  const lump = (rad, parent, x, y, z, sx = 1, sy = 1, sz = 1, mat = rock) => {
    const m = part(new THREE.IcosahedronGeometry(rad, 1), mat, parent, x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(x * 3, y * 2, z * 4);
    return m;
  };

  for (const [leg, x] of [[r.legL, 0.27], [r.legR, -0.27]]) {
    leg.position.x = x;
    lump(0.2, leg, 0, -0.13, 0, 1, 1.15, 1.1);
    lump(0.15, leg, 0, -0.22, 0.1, 1.2, 0.6, 1.2, stone);
  }
  lump(0.52, r.torso, 0, 0.42, 0, 1.2, 0.95, 0.92);
  lump(0.2, r.torso, 0.5, 0.74, -0.06, 1, 1, 1, stone);
  lump(0.2, r.torso, -0.5, 0.74, -0.06, 1, 1, 1, stone);
  lump(0.24, r.torso, 0, 0.74, -0.26, 1.2, 0.9, 1, stone);

  r.head.position.set(0, 0.8, 0.2);
  lump(0.3, r.head, 0, 0, 0, 1.15, 0.9, 1);
  part(new THREE.BoxGeometry(0.5, 0.08, 0.1), stone, r.head, 0, 0.12, 0.22).rotation.x = 0.3;
  part(new THREE.BoxGeometry(0.15, 0.09, 0.08), hot, r.head, 0.14, 0.02, 0.27).rotation.z = 0.35;
  part(new THREE.BoxGeometry(0.15, 0.09, 0.08), hot, r.head, -0.14, 0.02, 0.27).rotation.z = -0.35;
  part(new THREE.BoxGeometry(0.2, 0.045, 0.06), stone, r.head, 0, -0.15, 0.27);
  const flame = new THREE.Group();
  flame.position.set(0, 0.24, -0.04);
  r.head.add(flame);
  const f1 = part(new THREE.ConeGeometry(0.15, 0.4, 7), fire, flame, 0, 0.18, 0);
  const f2 = part(new THREE.ConeGeometry(0.09, 0.3, 6), hot, flame, 0.02, 0.16, 0.03);
  const f3 = part(new THREE.ConeGeometry(0.07, 0.24, 6), fire, flame, -0.11, 0.1, 0);
  f1.castShadow = f2.castShadow = f3.castShadow = false;

  for (const [arm, x] of [[r.armL, 0.68], [r.armR, -0.68]]) {
    arm.position.set(x, 0.62, 0);
    lump(0.2, arm, 0, -0.08, 0);
    lump(0.3, arm, 0, -0.42, 0.06, 1, 1.15, 1);
    lump(0.14, arm, 0.08, -0.64, 0.12, 1, 1, 1, stone);
    lump(0.14, arm, -0.08, -0.64, 0.1, 1, 1, 1, stone);
  }
  r.armSwing = 0.8;
  r.kickArm = 1.5;
  r.custom = (s) => {
    const k = 1 + Math.sin(s.t * 11 + r.seed) * 0.16 + Math.sin(s.t * 17) * 0.1;
    f1.scale.set(1, k, 1);
    f2.scale.set(1, 2 - k, 1);
    f3.rotation.z = 0.3 + Math.sin(s.t * 9) * 0.2;
    rock.emissiveIntensity = 1.4 + Math.sin(s.t * 3 + r.seed) * 0.35 + s.kick * 1.4;
    r.armL.rotation.x -= s.kick * 1.5;
    r.armL.rotation.z = 0.12;
    r.armR.rotation.z = -0.12;
  };
  return r;
}

// --- Nox: lechuza de plumas azul noche, capa violeta y ballesta ---------------
function nox() {
  const r = baseRig(0.24, 1.55);
  const featherMap = tex('mat-plumas.webp', { repeat: true });
  featherMap.repeat.set(3, 2);
  const feather = std(0xffffff, { map: featherMap, roughness: 0.85 });
  const navy = std(0x2f2f58, { roughness: 0.85 }), cream = std(0xeadfc6, { roughness: 0.8 });
  const gold = std(0xe0a020, { roughness: 0.4, metalness: 0.3 }), teal = glow(0x25e6c0, 1.7);
  const black = std(0x0d0d14, { roughness: 0.2 }), white = std(0xffffff, { roughness: 0.2 });
  const purple = std(0x5a2d86, { roughness: 0.9, side: THREE.DoubleSide }), wood = std(0x6b4226), leather = std(0x5e3a1e);

  for (const [leg, x] of [[r.legL, 0.15], [r.legR, -0.15]]) {
    leg.position.x = x;
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 6), gold, leg, 0, -0.1, 0);
    for (const tx of [-0.06, 0, 0.06]) part(new THREE.BoxGeometry(0.04, 0.05, 0.16), gold, leg, tx, -0.215, 0.07).rotation.y = -tx * 4;
  }
  part(new THREE.SphereGeometry(0.4, 22, 16), feather, r.torso, 0, 0.34, 0).scale.set(1, 1.05, 0.92);
  part(new THREE.SphereGeometry(0.31, 18, 14), cream, r.torso, 0, 0.3, 0.14).scale.set(0.9, 1, 0.7);
  part(new THREE.TorusGeometry(0.385, 0.035, 6, 22).rotateX(PI / 2), leather, r.torso, 0, 0.2, 0.01);
  part(new THREE.BoxGeometry(0.1, 0.09, 0.04), gold, r.torso, 0, 0.2, 0.39);
  part(new RoundedBoxGeometry(0.14, 0.15, 0.1, 1, 0.03), leather, r.torso, 0.33, 0.15, 0.2);
  part(new RoundedBoxGeometry(0.14, 0.15, 0.1, 1, 0.03), leather, r.torso, -0.33, 0.15, 0.2);
  const cape = part(new THREE.ConeGeometry(0.58, 0.74, 14, 1, true, PI * 0.3, PI * 1.4), purple, r.torso, 0, 0.36, -0.04);
  cape.scale.set(1, 1, 0.9);
  part(new THREE.TorusGeometry(0.3, 0.08, 8, 20).rotateX(PI / 2), purple, r.torso, 0, 0.68, 0.02).scale.set(1.05, 1, 1);
  part(new THREE.SphereGeometry(0.06, 10, 8), gold, r.torso, 0, 0.64, 0.33);

  r.head.position.set(0, 1.0, 0.03);
  part(new THREE.SphereGeometry(0.42, 24, 18), feather, r.head).scale.set(1.08, 0.92, 0.98);
  for (const s of [1, -1]) {
    const x = s * 0.17;
    part(new THREE.SphereGeometry(0.18, 16, 12), cream, r.head, x, -0.01, 0.32).scale.set(1, 1.05, 0.4);
    part(new THREE.SphereGeometry(0.115, 14, 12), teal, r.head, x, 0, 0.375).scale.set(1, 1, 0.5);
    part(new THREE.SphereGeometry(0.058, 10, 8), black, r.head, x, 0, 0.425).scale.set(1, 1, 0.5);
    part(new THREE.SphereGeometry(0.02, 6, 6), white, r.head, x + 0.035, 0.035, 0.45);
    part(new THREE.BoxGeometry(0.25, 0.07, 0.1), navy, r.head, x * 1.05, 0.16, 0.36).rotation.z = s * 0.42;
    part(new THREE.ConeGeometry(0.11, 0.36, 5), navy, r.head, s * 0.3, 0.38, -0.02).rotation.z = -s * 0.4;
  }
  part(new THREE.ConeGeometry(0.075, 0.18, 6).rotateX(PI * 0.62), gold, r.head, 0, -0.1, 0.4);

  for (const [arm, x] of [[r.armL, 0.4], [r.armR, -0.4]]) {
    arm.position.set(x, 0.54, 0);
    part(new THREE.SphereGeometry(0.2, 12, 10), feather, arm, 0, -0.2, 0).scale.set(0.5, 1.3, 1);
  }
  const bow = new THREE.Group();
  bow.position.set(0.04, -0.3, 0.28);
  r.armR.add(bow);
  part(new THREE.BoxGeometry(0.07, 0.07, 0.72), wood, bow);
  part(new THREE.BoxGeometry(0.66, 0.05, 0.06), wood, bow, 0, 0.02, 0.26);
  part(new THREE.BoxGeometry(0.03, 0.03, 0.5), teal, bow, 0, 0.06, 0.12);
  r.armR.rotation.z = 0.25;

  r.armSwing = 0.35;
  r.kickArm = 0.6;
  r.custom = (s) => {
    cape.rotation.x = 0.06 + s.move * 0.28 + Math.sin(s.t * 3 + r.seed) * 0.04;
    r.armL.rotation.z = -0.15 - Math.abs(Math.sin(s.phase)) * 0.5 * s.move;
    r.armR.rotation.x = -0.25 - s.kick * 0.5;
    r.head.rotation.z = Math.sin(s.t * 0.7 + r.seed) * 0.1 * (1 - s.move);
  };
  return r;
}

// --- Pompa: sapo alquimista con sombrero de bruja y arneses de cuero ---------
function pompa() {
  const r = baseRig(0.26, 1.6);
  const skin = std(0xffffff, { map: frogTex(), roughness: 0.5 }), dgreen = std(0x4f8a22, { roughness: 0.55 });
  const belly = std(0xe6d27a, { roughness: 0.6 }), eyeY = std(0xf2c81e, { roughness: 0.2 }), black = std(0x0d0d14, { roughness: 0.2 });
  const purple = std(0x6a3a96, { roughness: 0.9 }), leather = std(0x7a4a26, { roughness: 0.7 }), tan = std(0xb08a52, { roughness: 0.9 });
  const brass = std(0xc9962e, { metalness: 0.6, roughness: 0.35 });
  const lens = std(0xbfe9ff, { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.65 });
  const pink = glow(0xff4fb0, 1.5), blue = glow(0x3fb8ff, 1.3), lime = glow(0x6dff5a, 1.3);

  for (const [leg, x] of [[r.legL, 0.3], [r.legR, -0.3]]) {
    leg.position.x = x;
    part(new THREE.SphereGeometry(0.18, 12, 10), dgreen, leg, 0, -0.08, -0.02).scale.set(1, 1.05, 1.3);
    part(new RoundedBoxGeometry(0.28, 0.07, 0.4, 1, 0.03), dgreen, leg, x > 0 ? 0.04 : -0.04, -0.225, 0.12);
  }
  part(new THREE.SphereGeometry(0.5, 24, 18), skin, r.torso, 0, 0.38, 0).scale.set(1.1, 0.9, 1);
  part(new THREE.SphereGeometry(0.42, 18, 14), belly, r.torso, 0, 0.29, 0.15).scale.set(0.92, 0.82, 0.8);
  part(new THREE.BoxGeometry(0.5, 0.03, 0.05), black, r.torso, 0, 0.56, 0.44);
  part(new THREE.TorusGeometry(0.5, 0.045, 6, 26).rotateX(PI / 2), leather, r.torso, 0, 0.24, 0).scale.set(1.09, 1, 0.99);
  part(new THREE.BoxGeometry(0.13, 0.11, 0.05), brass, r.torso, 0, 0.24, 0.49);
  part(new RoundedBoxGeometry(0.44, 0.36, 0.22, 2, 0.06), leather, r.torso, 0, 0.44, -0.5);
  part(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12).rotateZ(PI / 2), tan, r.torso, 0, 0.68, -0.5);
  part(new THREE.SphereGeometry(0.08, 10, 8), blue, r.torso, -0.56, 0.22, 0.06);
  part(new THREE.SphereGeometry(0.08, 10, 8), lime, r.torso, 0.54, 0.22, -0.12);

  r.head.position.set(0, 0.72, 0.1);
  const eyes = [];
  for (const x of [0.23, -0.23]) {
    const e = new THREE.Group();
    e.position.set(x, 0.08, 0.02);
    r.head.add(e);
    part(new THREE.SphereGeometry(0.18, 14, 12), skin, e);
    part(new THREE.SphereGeometry(0.145, 14, 12), eyeY, e, 0, 0.02, 0.07);
    part(new THREE.SphereGeometry(0.085, 10, 8), black, e, 0, 0.03, 0.17).scale.set(1, 1, 0.55);
    eyes.push(e);
  }
  // Sombrero de bruja con antiparras de bronce.
  const hat = new THREE.Group();
  hat.position.set(0, 0.25, -0.08);
  hat.rotation.set(-0.16, 0, 0.06);
  r.head.add(hat);
  part(new THREE.CylinderGeometry(0.52, 0.56, 0.045, 22), purple, hat);
  part(new THREE.ConeGeometry(0.31, 0.44, 18), purple, hat, 0, 0.23, 0);
  const tip = part(new THREE.ConeGeometry(0.11, 0.26, 10), purple, hat, 0.1, 0.46, -0.02);
  tip.rotation.z = -1.0;
  part(new THREE.CylinderGeometry(0.3, 0.315, 0.08, 18), leather, hat, 0, 0.06, 0);
  for (const x of [0.12, -0.12]) {
    part(new THREE.TorusGeometry(0.085, 0.028, 6, 14), brass, hat, x, 0.12, 0.3).rotation.x = -0.35;
    part(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 12).rotateX(PI / 2), lens, hat, x, 0.12, 0.3).rotation.x = -0.35;
  }

  for (const [arm, x] of [[r.armL, 0.54], [r.armR, -0.54]]) {
    arm.position.set(x, 0.44, 0.08);
    part(new THREE.CylinderGeometry(0.065, 0.075, 0.3, 8), dgreen, arm, 0, -0.14, 0.02);
    part(new THREE.SphereGeometry(0.09, 10, 8), dgreen, arm, 0, -0.3, 0.03);
  }
  const flask = new THREE.Group();
  flask.position.set(0, -0.34, 0.14);
  r.armR.add(flask);
  part(new THREE.SphereGeometry(0.15, 14, 12), pink, flask);
  part(new THREE.CylinderGeometry(0.045, 0.06, 0.14, 8), lens, flask, 0, 0.17, 0);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), leather, flask, 0, 0.26, 0);

  r.armSwing = 0.7;
  r.kickArm = 2.2;
  r.custom = (s) => {
    const blink = Math.sin(s.t * 0.9 + r.seed) > 0.985 ? 0.15 : 1;
    for (const e of eyes) e.scale.y = blink;
    r.torso.scale.y = 1 + Math.sin(s.t * 2.6 + r.seed) * 0.03;
    flask.scale.setScalar(1 - s.kick * 0.6);
    tip.rotation.z = -1.0 + Math.sin(s.t * 3 + r.seed) * 0.12 + s.move * 0.2;
    r.hips.position.y += Math.abs(Math.sin(s.phase)) * 0.1 * s.move;
  };
  return r;
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

// --- Tajo: zanjero con hacha, mochila y farol --------------------------------
function tajo() {
  const r = baseRig(0.34, 1.62);
  const skin = std(0xc98f62, { roughness: 0.6 }), hair = std(0x1c1512, { roughness: 0.95 });
  const shirt = std(0xffffff, { map: stripesTex(), roughness: 0.85 }), pants = std(0x7a4a22, { roughness: 0.95 });
  const shoe = std(0xd8cfc0, { roughness: 0.6 }), shoeG = std(0x8d8d92, { roughness: 0.6 });
  const leather = std(0x7a4a26, { roughness: 0.7 }), tan = std(0xb08a52, { roughness: 0.9 }), wood = std(0x5e3a1e, { roughness: 0.8 });
  const brass = std(0xc9962e, { metalness: 0.6, roughness: 0.35 });
  const steel = std(0xffffff, { map: tex('mat-acero.webp'), metalness: 0.7, roughness: 0.4 });
  const white = std(0xffffff, { roughness: 0.3 }), dark = std(0x24140f, { roughness: 0.6 }), lamp = glow(0x9dff3a, 2.6);

  for (const [leg, x] of [[r.legL, 0.14], [r.legR, -0.14]]) {
    leg.position.x = x;
    part(new THREE.CapsuleGeometry(0.125, 0.1, 4, 10), pants, leg, 0, -0.13, 0);
    part(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), pants, leg, 0, -0.235, 0);
    part(new RoundedBoxGeometry(0.2, 0.12, 0.36, 2, 0.05), shoe, leg, 0, -0.28, 0.05);
    part(new RoundedBoxGeometry(0.17, 0.07, 0.2, 1, 0.03), shoeG, leg, 0, -0.235, 0.09);
  }
  part(new RoundedBoxGeometry(0.5, 0.44, 0.32, 3, 0.11), shirt, r.torso, 0, 0.22, 0);
  part(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 12), skin, r.torso, 0, 0.46, 0);
  for (const s of [1, -1]) part(new THREE.BoxGeometry(0.13, 0.04, 0.1), white, r.torso, s * 0.09, 0.44, 0.1).rotation.set(0.5, 0, -s * 0.5);
  for (const z of [0.166, -0.166]) part(new THREE.BoxGeometry(0.075, 0.62, 0.02), leather, r.torso, 0, 0.23, z).rotation.z = z > 0 ? 0.72 : -0.72;
  part(new THREE.BoxGeometry(0.1, 0.1, 0.03), brass, r.torso, 0.03, 0.26, 0.178);
  part(new RoundedBoxGeometry(0.38, 0.34, 0.18, 2, 0.05), leather, r.torso, 0, 0.26, -0.25);
  part(new RoundedBoxGeometry(0.22, 0.14, 0.05, 1, 0.02), leather, r.torso, 0, 0.2, -0.35);
  part(new THREE.CylinderGeometry(0.095, 0.095, 0.44, 12).rotateZ(PI / 2), tan, r.torso, 0, 0.5, -0.25);
  const lantern = new THREE.Group();
  lantern.position.set(0.3, 0.04, -0.12);
  r.torso.add(lantern);
  part(new THREE.SphereGeometry(0.08, 10, 8), lamp, lantern).castShadow = false;
  part(new THREE.TorusGeometry(0.085, 0.016, 5, 12), steel, lantern);
  part(new THREE.TorusGeometry(0.085, 0.016, 5, 12).rotateY(PI / 2), steel, lantern);
  part(new THREE.CylinderGeometry(0.05, 0.07, 0.04, 8), steel, lantern, 0, 0.09, 0);

  r.head.position.set(0, 0.85, 0);
  part(new THREE.SphereGeometry(0.34, 24, 18), skin, r.head).scale.set(1, 1.02, 0.97);
  const cap = part(new THREE.SphereGeometry(0.352, 22, 12, 0, PI * 2, 0, 1.12), hair, r.head, 0, 0.02, -0.01);
  cap.rotation.x = -0.2;
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 1.7;
    part(new THREE.SphereGeometry(0.075, 8, 6), hair, r.head, Math.sin(a) * 0.27, 0.24 - Math.abs(a) * 0.05, Math.cos(a) * 0.25);
  }
  for (const s of [1, -1]) {
    part(new THREE.SphereGeometry(0.07, 10, 8), skin, r.head, s * 0.335, -0.03, 0).scale.set(0.5, 1, 0.8);
    part(new THREE.SphereGeometry(0.018, 6, 6), white, r.head, s * 0.355, -0.08, 0.01);
    part(new THREE.SphereGeometry(0.045, 10, 8), dark, r.head, s * 0.12, 0.03, 0.3).scale.set(1, 1.25, 0.6);
    part(new THREE.BoxGeometry(0.11, 0.028, 0.03), hair, r.head, s * 0.12, 0.125, 0.305).rotation.z = -s * 0.12;
  }
  part(new THREE.SphereGeometry(0.042, 8, 6), skin, r.head, 0, -0.045, 0.335);
  part(new RoundedBoxGeometry(0.2, 0.09, 0.03, 1, 0.012), dark, r.head, 0, -0.15, 0.292);
  part(new RoundedBoxGeometry(0.16, 0.05, 0.03, 1, 0.01), white, r.head, 0, -0.14, 0.3);

  for (const [arm, x] of [[r.armL, 0.32], [r.armR, -0.32]]) {
    arm.position.set(x, 0.38, 0);
    part(new THREE.CylinderGeometry(0.095, 0.105, 0.15, 12), shirt, arm, 0, -0.04, 0);
    part(new THREE.CapsuleGeometry(0.062, 0.18, 4, 8), skin, arm, 0, -0.21, 0);
    part(new THREE.SphereGeometry(0.075, 10, 8), skin, arm, 0, -0.36, 0);
  }
  part(new THREE.TorusGeometry(0.07, 0.014, 5, 12).rotateX(PI / 2), steel, r.armR, 0, -0.29, 0);
  const axe = new THREE.Group();
  axe.position.set(0, -0.36, 0.02);
  axe.rotation.x = 1.15;
  r.armR.add(axe);
  part(new THREE.CylinderGeometry(0.03, 0.035, 1.0, 8), wood, axe, 0, 0.3, 0);
  part(new THREE.BoxGeometry(0.06, 0.1, 0.12), steel, axe, 0, 0.74, 0);
  const head = part(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 14, 1, false, -0.9, 1.8).rotateZ(PI / 2), steel, axe, 0, 0.74, 0.06);
  head.scale.set(1, 1.25, 1.2);
  part(new THREE.BoxGeometry(0.05, 0.08, 0.12), steel, axe, 0, 0.74, -0.1);

  r.armSwing = 0.8;
  r.kickArm = 0;
  r.custom = (s) => {
    // El hacha descansa apuntando arriba y adelante; al atacar baja de golpe.
    r.armR.rotation.x = -0.35 + Math.sin(s.phase) * 0.25 * s.move - Math.sin(s.kick * PI) * 1.5;
    axe.rotation.x = 1.15 + s.kick * 0.9;
    lantern.rotation.z = Math.sin(s.phase) * 0.3 * s.move + Math.sin(s.t * 2 + r.seed) * 0.05;
    lamp.emissiveIntensity = 1.3 + Math.sin(s.t * 4 + r.seed) * 0.25;
    r.torso.rotation.x += s.move * 0.08;
  };
  return r;
}

const BUILDERS = { tuerca, brasa, nox, pompa, zip, tajo };

export function buildHero(id) {
  return (BUILDERS[id] || tuerca)();
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
