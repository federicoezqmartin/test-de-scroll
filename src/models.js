// Personajes 3D armados con primitivas. Todos miran hacia +Z y comparten esqueleto:
// root > hips > (legL, legR, torso > (head, armL, armR)).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05, ...o });
const glow = (color, k = 1.8) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k * 0.55, roughness: 0.4 });

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

// --- Tuerca: robot remachadora ------------------------------------------------
function tuerca() {
  const r = baseRig(0.42, 1.5);
  const orange = std(0xff8a1e), dark = std(0x2c323d, { metalness: 0.45, roughness: 0.5 });
  const steel = std(0xd3dce4, { metalness: 0.5, roughness: 0.35 }), cyan = glow(0x39e6ff, 2.2), red = glow(0xff4a4a, 2);

  for (const [leg, x] of [[r.legL, 0.2], [r.legR, -0.2]]) {
    leg.position.x = x;
    part(new THREE.CylinderGeometry(0.085, 0.085, 0.3, 10), dark, leg, 0, -0.17, 0);
    part(new RoundedBoxGeometry(0.22, 0.15, 0.32, 2, 0.05), orange, leg, 0, -0.345, 0.04);
  }
  part(new RoundedBoxGeometry(0.8, 0.62, 0.6, 3, 0.13), orange, r.torso, 0, 0.34, 0);
  part(new RoundedBoxGeometry(0.44, 0.24, 0.08, 2, 0.03), dark, r.torso, 0, 0.38, 0.29);
  part(new THREE.BoxGeometry(0.3, 0.09, 0.04), cyan, r.torso, 0, 0.4, 0.335);
  part(new RoundedBoxGeometry(0.5, 0.44, 0.24, 2, 0.07), dark, r.torso, 0, 0.38, -0.38);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), steel, r.torso, 0.14, 0.66, -0.4);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), steel, r.torso, -0.14, 0.66, -0.4);
  for (const x of [-0.3, 0.3]) part(new THREE.SphereGeometry(0.035, 8, 6), steel, r.torso, x, 0.56, 0.3);

  r.head.position.set(0, 0.74, 0);
  part(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 16), dark, r.head, 0, -0.04, 0);
  part(new THREE.SphereGeometry(0.31, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), steel, r.head, 0, 0.02, 0);
  part(new RoundedBoxGeometry(0.42, 0.15, 0.2, 2, 0.05), dark, r.head, 0, 0.11, 0.2);
  const eye = part(new THREE.SphereGeometry(0.075, 12, 10), cyan, r.head, 0, 0.11, 0.3);
  const ant = new THREE.Group();
  ant.position.set(0.13, 0.3, -0.05);
  r.head.add(ant);
  part(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), steel, ant, 0, 0.13, 0);
  part(new THREE.SphereGeometry(0.05, 10, 8), red, ant, 0, 0.28, 0);

  // Brazo cañón (derecho) y pinza (izquierdo).
  r.armR.position.set(-0.5, 0.44, 0);
  part(new THREE.SphereGeometry(0.13, 12, 10), dark, r.armR);
  const barrel = new THREE.CylinderGeometry(0.13, 0.15, 0.58, 14).rotateX(Math.PI / 2);
  part(barrel, steel, r.armR, 0, -0.06, 0.3);
  part(new THREE.CylinderGeometry(0.165, 0.165, 0.1, 14).rotateX(Math.PI / 2), orange, r.armR, 0, -0.06, 0.2);
  part(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12).rotateX(Math.PI / 2), cyan, r.armR, 0, -0.06, 0.6);
  r.armL.position.set(0.5, 0.44, 0);
  part(new THREE.SphereGeometry(0.12, 12, 10), dark, r.armL);
  part(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), steel, r.armL, 0, -0.18, 0.03);
  part(new RoundedBoxGeometry(0.16, 0.16, 0.2, 2, 0.05), orange, r.armL, 0, -0.36, 0.06);

  r.armSwing = 0.5;
  r.kickArm = 0.35;
  r.custom = (s) => {
    ant.rotation.z = Math.sin(s.t * 6 + r.seed) * 0.12 + Math.sin(s.phase) * 0.2 * s.move;
    eye.scale.setScalar(1 + s.kick * 0.5);
    r.armR.rotation.x -= 0.1;
    r.armR.position.z = -s.kick * 0.12;
  };
  return r;
}

// --- Brasa: gólem de lava -----------------------------------------------------
function brasa() {
  const r = baseRig(0.36, 1.6);
  const rock = std(0x3b3036, { flatShading: true, roughness: 0.9 });
  const rock2 = std(0x52424a, { flatShading: true, roughness: 0.9 });
  const lava = glow(0xff4a12, 2.2), hot = glow(0xffb52e, 2.4);

  for (const [leg, x] of [[r.legL, 0.26], [r.legR, -0.26]]) {
    leg.position.x = x;
    part(new THREE.DodecahedronGeometry(0.2, 0), rock2, leg, 0, -0.2, 0.02).scale.set(1, 1.2, 1.1);
  }
  // Cuerpo: dos poliedros superpuestos, la lava asoma entre las caras de roca.
  const body = part(new THREE.IcosahedronGeometry(0.62, 0), rock, r.torso, 0, 0.5, 0);
  body.scale.set(1.12, 1, 0.98);
  const core = part(new THREE.SphereGeometry(0.51, 20, 16), lava, r.torso, 0, 0.5, 0);
  core.scale.set(1.12, 1, 0.98);
  core.castShadow = false;
  part(new THREE.DodecahedronGeometry(0.2, 0), rock2, r.torso, 0.34, 1.0, -0.1);
  part(new THREE.DodecahedronGeometry(0.16, 0), rock2, r.torso, -0.36, 0.98, -0.05);
  part(new THREE.DodecahedronGeometry(0.14, 0), rock2, r.torso, 0, 1.08, -0.18);

  r.head.position.set(0, 0.62, 0.42);
  part(new THREE.BoxGeometry(0.13, 0.09, 0.08), hot, r.head, 0.17, 0.08, 0.14).rotation.z = -0.25;
  part(new THREE.BoxGeometry(0.13, 0.09, 0.08), hot, r.head, -0.17, 0.08, 0.14).rotation.z = 0.25;
  part(new THREE.BoxGeometry(0.3, 0.06, 0.08), lava, r.head, 0, -0.14, 0.14);
  const flame = part(new THREE.ConeGeometry(0.13, 0.4, 6), hot, r.torso, 0, 1.3, -0.05);
  flame.castShadow = false;

  for (const [arm, x] of [[r.armL, 0.74], [r.armR, -0.74]]) {
    arm.position.set(x, 0.68, 0);
    part(new THREE.DodecahedronGeometry(0.17, 0), rock2, arm, 0, -0.08, 0);
    part(new THREE.DodecahedronGeometry(0.3, 0), rock, arm, 0, -0.44, 0.1);
    const k = part(new THREE.SphereGeometry(0.247, 12, 10), lava, arm, 0, -0.44, 0.1);
    k.castShadow = false;
  }
  r.armSwing = 0.8;
  r.kickArm = 1.5;
  r.custom = (s) => {
    const f = 1 + Math.sin(s.t * 11 + r.seed) * 0.18 + Math.sin(s.t * 17) * 0.1;
    flame.scale.set(1, f, 1);
    flame.position.y = 1.3 + (f - 1) * 0.2;
    lava.emissiveIntensity = 1.2 + Math.sin(s.t * 3 + r.seed) * 0.3 + s.kick * 1.2;
    r.armL.rotation.x -= s.kick * 1.5;
  };
  return r;
}

// --- Nox: lechuza arquera -----------------------------------------------------
function nox() {
  const r = baseRig(0.3, 1.4);
  const indigo = std(0x4a3aa8), deep = std(0x2f2470), cream = std(0xe9e2ff), gold = std(0xffb52e, { roughness: 0.45 });
  const teal = glow(0x3dffd2, 2.2), wood = std(0x7a5232), black = std(0x15121f);

  for (const [leg, x] of [[r.legL, 0.15], [r.legR, -0.15]]) {
    leg.position.x = x;
    part(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6), gold, leg, 0, -0.14, 0);
    part(new RoundedBoxGeometry(0.15, 0.06, 0.24, 1, 0.02), gold, leg, 0, -0.27, 0.05);
  }
  part(new THREE.SphereGeometry(0.44, 20, 16), indigo, r.torso, 0, 0.36, 0).scale.set(0.95, 1.08, 0.88);
  part(new THREE.SphereGeometry(0.36, 18, 14), cream, r.torso, 0, 0.3, 0.13).scale.set(0.85, 1, 0.75);
  // Capa y cola.
  const cape = part(new THREE.ConeGeometry(0.5, 0.95, 10, 1, true), deep, r.torso, 0, 0.42, -0.12);
  cape.scale.set(1, 1, 0.8);
  cape.material.side = THREE.DoubleSide;
  const tail = part(new THREE.BoxGeometry(0.3, 0.05, 0.3), deep, r.torso, 0, 0.05, -0.42);
  tail.rotation.x = 0.5;

  r.head.position.set(0, 0.92, 0.02);
  part(new THREE.SphereGeometry(0.36, 20, 16), indigo, r.head).scale.set(1.05, 0.92, 0.95);
  for (const x of [0.16, -0.16]) {
    part(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 18).rotateX(Math.PI / 2), cream, r.head, x, 0.03, 0.3);
    part(new THREE.SphereGeometry(0.075, 12, 10), teal, r.head, x, 0.03, 0.33);
    part(new THREE.SphereGeometry(0.035, 8, 8), black, r.head, x, 0.03, 0.395);
    const tuft = part(new THREE.ConeGeometry(0.09, 0.3, 5), deep, r.head, x * 1.5, 0.36, -0.02);
    tuft.rotation.z = x > 0 ? -0.35 : 0.35;
  }
  part(new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(Math.PI * 0.62), gold, r.head, 0, -0.08, 0.36);

  for (const [arm, x] of [[r.armL, 0.4], [r.armR, -0.4]]) {
    arm.position.set(x, 0.56, 0);
    part(new THREE.SphereGeometry(0.2, 12, 10), deep, arm, 0, -0.22, 0).scale.set(0.5, 1.35, 1);
  }
  // Ballesta.
  const bow = new THREE.Group();
  bow.position.set(-0.02, -0.3, 0.26);
  r.armR.add(bow);
  part(new THREE.BoxGeometry(0.07, 0.07, 0.72), wood, bow);
  part(new THREE.BoxGeometry(0.62, 0.05, 0.06), wood, bow, 0, 0.02, 0.26);
  part(new THREE.BoxGeometry(0.03, 0.03, 0.5), teal, bow, 0, 0.06, 0.12);
  r.armR.rotation.z = 0.25;

  r.armSwing = 0.35;
  r.kickArm = 0.6;
  r.custom = (s) => {
    cape.rotation.x = 0.1 + s.move * 0.3 + Math.sin(s.t * 3 + r.seed) * 0.04;
    r.armL.rotation.z = -0.15 - Math.abs(Math.sin(s.phase)) * 0.5 * s.move;
    r.armR.rotation.x = -0.25 - s.kick * 0.5;
    r.head.rotation.z = Math.sin(s.t * 0.7 + r.seed) * 0.12 * (1 - s.move);
  };
  return r;
}

// --- Pompa: rana alquimista ---------------------------------------------------
function pompa() {
  const r = baseRig(0.3, 1.3);
  const green = std(0x67c93a), dgreen = std(0x3f9a2c), belly = std(0xf3e68a), white = std(0xffffff, { roughness: 0.3 });
  const black = std(0x15121f), leather = std(0x8a5a33), pink = glow(0xff5fc4, 1.6), glass = std(0xbfefff, { roughness: 0.15, metalness: 0.2 });

  for (const [leg, x] of [[r.legL, 0.3], [r.legR, -0.3]]) {
    leg.position.x = x;
    part(new THREE.SphereGeometry(0.18, 12, 10), dgreen, leg, 0, -0.1, -0.02).scale.set(1, 1.1, 1.3);
    part(new RoundedBoxGeometry(0.26, 0.07, 0.4, 1, 0.03), green, leg, x > 0 ? 0.04 : -0.04, -0.265, 0.12);
  }
  part(new THREE.SphereGeometry(0.5, 22, 16), green, r.torso, 0, 0.36, 0).scale.set(1.08, 0.86, 0.98);
  part(new THREE.SphereGeometry(0.42, 18, 14), belly, r.torso, 0, 0.27, 0.14).scale.set(0.92, 0.8, 0.8);
  part(new THREE.BoxGeometry(0.5, 0.035, 0.05), black, r.torso, 0, 0.47, 0.455);
  // Mochila con frascos.
  part(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 12), leather, r.torso, 0, 0.4, -0.46).rotation.z = Math.PI / 2;
  part(new THREE.SphereGeometry(0.09, 10, 8), pink, r.torso, 0.2, 0.68, -0.44);
  part(new THREE.SphereGeometry(0.09, 10, 8), glow(0x6dff5a, 1.6), r.torso, -0.2, 0.68, -0.44);

  r.head.position.set(0, 0.74, 0.12);
  const eyes = [];
  for (const x of [0.24, -0.24]) {
    const e = new THREE.Group();
    e.position.set(x, 0.06, 0);
    r.head.add(e);
    part(new THREE.SphereGeometry(0.19, 14, 12), green, e);
    part(new THREE.SphereGeometry(0.14, 14, 12), white, e, 0, 0.02, 0.08);
    part(new THREE.SphereGeometry(0.065, 10, 8), black, e, 0, 0.03, 0.19);
    eyes.push(e);
  }
  // Sombrerito de alquimista entre los ojos.
  const hatMat = std(0x7a4bd6);
  const hat = new THREE.Group();
  hat.position.set(0, 0.08, -0.12);
  hat.rotation.set(-0.25, 0, 0.12);
  r.head.add(hat);
  part(new THREE.CylinderGeometry(0.24, 0.24, 0.035, 18), hatMat, hat);
  part(new THREE.ConeGeometry(0.15, 0.36, 14), hatMat, hat, 0, 0.19, 0);
  part(new THREE.CylinderGeometry(0.155, 0.155, 0.05, 14), std(0xffd23f), hat, 0, 0.04, 0);

  for (const [arm, x] of [[r.armL, 0.5], [r.armR, -0.5]]) {
    arm.position.set(x, 0.42, 0.08);
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8), dgreen, arm, 0, -0.14, 0.02);
    part(new THREE.SphereGeometry(0.09, 10, 8), green, arm, 0, -0.3, 0.03);
  }
  const flask = new THREE.Group();
  flask.position.set(0, -0.34, 0.14);
  r.armR.add(flask);
  part(new THREE.SphereGeometry(0.15, 14, 12), pink, flask);
  part(new THREE.CylinderGeometry(0.045, 0.06, 0.14, 8), glass, flask, 0, 0.17, 0);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), leather, flask, 0, 0.26, 0);

  r.armSwing = 0.7;
  r.kickArm = 2.2;
  r.custom = (s) => {
    const blink = Math.sin(s.t * 0.9 + r.seed) > 0.985 ? 0.15 : 1;
    for (const e of eyes) e.scale.y = blink;
    r.torso.scale.y = 1 + Math.sin(s.t * 2.6 + r.seed) * 0.035;
    flask.scale.setScalar(1 - s.kick * 0.6);
    r.hips.position.y += Math.abs(Math.sin(s.phase)) * 0.1 * s.move;
  };
  return r;
}

// --- Zip: conejo ninja --------------------------------------------------------
function zip() {
  const r = baseRig(0.4, 1.75);
  const navy = std(0x232a4d), fur = std(0xf2f0ea), pinkIn = std(0xff9bb5), red = std(0xff2e54);
  const blade = std(0xdff6ff, { metalness: 0.7, roughness: 0.2, emissive: 0x66d9ff, emissiveIntensity: 0.6 });
  const eyeMat = glow(0xfff3a8, 2), dark = std(0x141833);

  for (const [leg, x] of [[r.legL, 0.13], [r.legR, -0.13]]) {
    leg.position.x = x;
    part(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8), navy, leg, 0, -0.17, 0);
    part(new RoundedBoxGeometry(0.15, 0.09, 0.28, 1, 0.03), fur, leg, 0, -0.35, 0.05);
  }
  part(new THREE.CapsuleGeometry(0.22, 0.3, 6, 14), navy, r.torso, 0, 0.3, 0).scale.set(1.05, 1, 0.85);
  part(new THREE.CylinderGeometry(0.235, 0.235, 0.08, 14), red, r.torso, 0, 0.14, 0).scale.set(1.05, 1, 0.85);
  part(new THREE.SphereGeometry(0.1, 10, 8), fur, r.torso, 0, 0.1, -0.24);

  r.head.position.set(0, 0.82, 0);
  part(new THREE.SphereGeometry(0.3, 20, 16), fur, r.head).scale.set(1, 0.95, 0.95);
  part(new THREE.CylinderGeometry(0.305, 0.305, 0.15, 18, 1, true), navy, r.head, 0, 0.04, 0).scale.set(1, 1, 0.95);
  for (const x of [0.11, -0.11]) part(new THREE.SphereGeometry(0.045, 8, 8), eyeMat, r.head, x, 0.04, 0.27).scale.set(1.3, 0.7, 0.6);
  part(new THREE.SphereGeometry(0.035, 8, 6), pinkIn, r.head, 0, -0.07, 0.285);
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
  // Bufanda con dos puntas que flamean.
  part(new THREE.TorusGeometry(0.2, 0.07, 8, 16), red, r.torso, 0, 0.6, 0).rotation.x = Math.PI / 2;
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
    part(new THREE.CapsuleGeometry(0.06, 0.24, 4, 8), navy, arm, 0, -0.16, 0);
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
    // Tajo cruzado al atacar.
    const k = s.kick;
    r.armR.rotation.x += -1.3 * k;
    r.armR.rotation.z = -1.1 * Math.sin(k * Math.PI);
    r.armL.rotation.x += -1.3 * k;
    r.armL.rotation.z = 1.1 * Math.sin(k * Math.PI);
    r.torso.rotation.x += s.move * 0.12;
  };
  return r;
}

const BUILDERS = { tuerca, brasa, nox, pompa, zip };

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

export function disposeRig(r) {
  r.root.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}
