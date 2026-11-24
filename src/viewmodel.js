// Armas y manos vistas en primera persona. Se arman con piezas del propio personaje: los brazos
// que salen de su hoja de arte (Tuerca, Brasa, Tajo), los brazos con cuchillas de Zip, la
// ballesta de Nox y el frasco de Pompa. Para eso se construye un segundo cuerpo del personaje,
// que no se dibuja, y se le sacan esas piezas.
//
// Todo cuelga de la cámara dentro de un grupo achicado: visto desde la cámara se ve igual que
// a tamaño real, pero ocupa poco lugar y no se mete en los muros cuando estás pegado a uno.
import * as THREE from 'three';
import { buildHero } from './models.js';

const PI = Math.PI;
const SCALE = 0.25;
const FWD = new THREE.Vector3(0, 0, -1);
const X = new THREE.Vector3(1, 0, 0);
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PI); // los cuerpos miran hacia +z; la cámara, hacia -z
const RAISE = new THREE.Quaternion().setFromAxisAngle(X, -PI / 2); // brazo levantado hacia adelante
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Curva de un golpe con preparación: sube un poco (0 a a0), baja de golpe (a0 a a1) y vuelve.
function chop(a, a0, a1) {
  if (a < a0) return -0.35 * smooth(a / a0);
  if (a < a1) return -0.35 + 1.35 * smooth((a - a0) / (a1 - a0));
  return 1 - smooth((a - a1) / (1 - a1));
}

export class ViewModel {
  constructor(heroId, camera) {
    this.id = heroId;
    this.camera = camera;
    this.rig = buildHero(heroId);
    this.root = new THREE.Group();
    this.root.scale.setScalar(SCALE);
    this.root.visible = false;
    camera.add(this.root);
    this.slots = [];
    this.muzzles = [];
    this.texs = [];
    this.lastAtk = 0;
    this.lastHit = 0;
    this.atkT = 1; // avanza de 0 a 1 después de cada ataque o súper
    this.hitT = [1, 1]; // golpes de cada mano (Zip)
    this.lagYaw = 0;
    this.lagPitch = 0;
    this.prevYaw = null;
    this.prevPitch = 0;
    // Lo que se libera al final: todo el cuerpo de repuesto más lo que se arme acá.
    this.geos = new Set();
    this.mats = new Set();
    const collect = (o) => {
      if (!o.isMesh && !o.isSprite) return;
      if (o.isMesh) this.geos.add(o.geometry);
      this.mats.add(o.material);
    };
    this.rig.root.traverse(collect);
    this.build();
    this.root.traverse(collect);
    // Luz mínima propia (ver heroUniforms): la piedra de Brasa es oscura y necesita más.
    this.rig.fxU.uLift.value = heroId === 'brasa' ? 0.45 : 0.2;
    // Sin sombras: el arma está, de verdad, a centímetros del ojo, y las sombras del escenario
    // la dejarían a oscuras cada vez que pasás junto a un muro.
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = false;
    });
  }

  // Ubica una pieza del personaje en la pantalla. tip es dónde queda su punta (la mano, la
  // boca del arma) en metros desde el ojo, como si el grupo no estuviera achicado: x a la
  // derecha, y arriba, z hacia atrás. dir es hacia dónde apunta la pieza y len, cuánto hay de
  // su origen (el hombro, en los brazos) a la punta. Los brazos se levantan hacia adelante,
  // así que desde los ojos se ve su cara de adelante; roll los gira sobre su largo.
  slot(part, tip, dir, len, { arm = true, roll = 0, scale = 1 } = {}) {
    const d = new THREE.Vector3(...dir).normalize();
    const s = new THREE.Group();
    s.scale.setScalar(scale);
    s.position.set(...tip).addScaledVector(d, -len * scale);
    s.userData.base = s.position.clone();
    this.root.add(s);
    const q = new THREE.Quaternion().setFromAxisAngle(d, roll);
    q.multiply(new THREE.Quaternion().setFromUnitVectors(FWD, d)).multiply(FLIP);
    if (arm) q.multiply(RAISE);
    part.quaternion.copy(q);
    part.position.set(0, 0, 0);
    part.visible = true;
    s.add(part);
    this.slots.push(s);
    return s;
  }

  // Punto de donde sale lo que se dispara, en coordenadas de la pieza.
  muzzle(parent, x, y, z) {
    const m = new THREE.Object3D();
    m.position.set(x, y, z);
    parent.add(m);
    this.muzzles.push(m);
    return m;
  }

  // Punta del brazo, medida en la geometría (el brazo cuelga hacia -y desde el hombro).
  armTip(arm) {
    let tip = 0;
    for (const m of arm.children) {
      if (!m.isMesh) continue;
      m.geometry.computeBoundingBox();
      tip = Math.min(tip, m.geometry.boundingBox.min.y + m.position.y);
    }
    return tip;
  }

  build() {
    const r = this.rig;
    switch (this.id) {
      case 'tuerca': {
        // El brazo con la remachadora, apuntando hacia la mira. Dispara desde la punta del caño.
        const L = -this.armTip(r.armR), g = r.acc.gun.position;
        this.main = this.slot(r.armR, [0.32, -0.3, -1.15], [-0.22, 0.3, -1], L);
        this.muzzle(r.armR, g.x, g.y - 0.34, g.z + 0.03);
        this.flash = this.flashSprite(0x8ff6ff);
        this.muzzles[0].add(this.flash);
        break;
      }
      case 'brasa': {
        // Los dos puños de piedra abajo, a los costados. Van casi parados para que se vea su
        // cara de adelante, la de las grietas de lava, y bastante altos: más abajo solo
        // asomaba la punta de roca oscura y la lava quedaba fuera de cuadro.
        const L = -this.armTip(r.armR);
        this.main = this.slot(r.armR, [0.46, -0.2, -1.15], [-0.25, 1, -0.75], L * 0.9, { scale: 0.75, roll: 0.4 });
        this.off = this.slot(r.armL, [-0.46, -0.2, -1.15], [0.25, 1, -0.75], L * 0.9, { scale: 0.75, roll: -0.4 });
        this.muzzle(r.armR, 0, -L * 0.85, 0);
        this.muzzle(r.armL, 0, -L * 0.85, 0);
        break;
      }
      case 'nox': {
        // La ballesta, apuntando hacia adelante y apenas hacia el centro de la pantalla.
        this.main = this.slot(r.acc.bow, [0.2, -0.27, -0.85], [-0.12, 0.08, -1], 0, { arm: false });
        this.muzzle(r.acc.bow, 0, 0.05, 0.48);
        this.flash = this.flashSprite(0x7dffe9);
        this.muzzles[0].add(this.flash);
        break;
      }
      case 'pompa': {
        // La mano con su guante de goma amarillo sosteniendo el frasco; el frasco desaparece al
        // tirarlo y vuelve.
        const hand = new THREE.Group();
        const skin = new THREE.MeshStandardMaterial({ color: 0xd9ad2e, roughness: 0.45 });
        const palm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), skin);
        palm.scale.set(1.1, 0.7, 1.2);
        hand.add(palm);
        for (const fx of [-0.06, 0, 0.06]) {
          const finger = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), skin);
          finger.position.set(fx, 0.04, 0.1);
          hand.add(finger);
        }
        const flask = r.acc.flask;
        hand.add(flask);
        flask.position.set(0, 0.15, 0.02);
        flask.visible = true;
        this.flask = flask;
        this.main = this.slot(hand, [0.36, -0.38, -1.2], [-0.1, 0.25, -1], 0, { arm: false, scale: 0.85 });
        this.muzzle(flask, 0, 0, 0);
        break;
      }
      case 'zip': {
        // Con los brazos hacia adelante, las cuchillas van a lo largo del brazo, más allá del puño.
        for (const g of r.acc.blades) g.rotation.x = PI / 2;
        const L = -this.armTip(r.armR);
        this.main = this.slot(r.armR, [0.3, -0.36, -0.8], [-0.25, 0.3, -1], L, { scale: 0.8 });
        this.off = this.slot(r.armL, [-0.3, -0.36, -0.8], [0.25, 0.3, -1], L, { scale: 0.8 });
        this.muzzle(r.armR, 0, -L - 0.4, 0);
        this.muzzle(r.armL, 0, -L - 0.4, 0);
        break;
      }
      case 'tajo': {
        // El brazo con el hacha levantada, a la derecha.
        r.acc.axe.visible = true;
        r.acc.axe.rotation.x = PI / 2 + 0.55; // el mango se inclina hacia adelante, para que el filo entre en cuadro
        const L = -this.armTip(r.armR);
        this.main = this.slot(r.armR, [0.36, -0.42, -0.85], [-0.15, 0.35, -1], L, { roll: -0.5 });
        this.muzzle(r.armR, 0, -L, 0);
        break;
      }
      default:
        break;
    }
  }

  // Destello en la boca del arma.
  flashSprite(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.texs.push(tex);
    const mat = new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    mat.color.multiplyScalar(2.2);
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(0.15);
    return s;
  }

  // Dónde se ve ahora la boca del arma (o la mano) en el mundo; null si no se ve. Como el
  // grupo está achicado alrededor del ojo, el punto real se agranda desde el ojo: así un
  // disparo de tamaño normal sale de donde se ve el arma, y no pegado a la cara.
  muzzleWorld(out, i = 0) {
    const m = this.muzzles[i % Math.max(1, this.muzzles.length)];
    if (!m || !this.root.visible) return null;
    const eye = this.camera.getWorldPosition(this.eye || (this.eye = new THREE.Vector3()));
    return m.getWorldPosition(out).sub(eye).divideScalar(SCALE).add(eye);
  }

  // p: el jugador. show: si corresponde verla (primera persona y vivo). yaw y pitch: de la cámara.
  update(dt, p, show, yaw, pitch, time) {
    this.root.visible = show;
    if (!show) {
      this.prevYaw = null;
      return;
    }
    // Ataques nuevos: Match los cuenta en markAttack y en cada golpe cuerpo a cuerpo.
    if ((p.atkN || 0) !== this.lastAtk) {
      this.lastAtk = p.atkN || 0;
      this.atkT = 0;
    }
    if ((p.hitN || 0) !== this.lastHit) {
      this.lastHit = p.hitN || 0;
      this.hitT[this.lastHit % 2] = 0;
    }
    this.atkT = Math.min(1, this.atkT + dt / (p.atkSup ? 0.6 : 0.42));
    this.hitT[0] = Math.min(1, this.hitT[0] + dt / 0.24);
    this.hitT[1] = Math.min(1, this.hitT[1] + dt / 0.24);

    // Inercia al mirar: el arma se queda un poco atrás cuando girás la cámara.
    if (this.prevYaw === null) {
      this.prevYaw = yaw;
      this.prevPitch = pitch;
    }
    let dy = yaw - this.prevYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = pitch - this.prevPitch;
    this.prevYaw = yaw;
    this.prevPitch = pitch;
    const k = 1 - Math.exp(-dt * 10);
    this.lagYaw += (Math.max(-0.1, Math.min(0.1, dy * 1.5)) - this.lagYaw) * k;
    this.lagPitch += (Math.max(-0.08, Math.min(0.08, dp * 1.5)) - this.lagPitch) * k;
    this.root.rotation.set(this.lagPitch, this.lagYaw, 0);

    // Balanceo al caminar y respiración; sin munición el arma baja un poco.
    const mv = p.moveAmt;
    const low = p.ammo < 1 ? 0.06 : 0;
    this.root.position.set(
      Math.sin(p.phase) * 0.04 * mv,
      -Math.abs(Math.cos(p.phase)) * 0.045 * mv + Math.sin(time * 1.7) * 0.008 - low,
      0,
    ).multiplyScalar(SCALE);

    // En pantallas angostas (celular parado) las piezas se acercan al centro para no quedar afuera.
    const cam = this.camera;
    const fit = Math.max(0.6, Math.min(1, Math.tan((cam.fov * PI) / 360) * cam.aspect));
    for (const s of this.slots) {
      s.position.copy(s.userData.base);
      s.position.x *= fit;
      s.rotation.set(0, 0, 0);
    }
    const kick = p.kick, a = this.atkT, sup = !!p.atkSup;
    const swing = Math.sin(smooth(a) * PI);
    switch (this.id) {
      case 'tuerca': {
        // Cada remache empuja el taladro hacia atrás; la súper lo sacude más.
        const kk = kick * (sup ? 1.8 : 1);
        this.main.position.z += kk * 0.08;
        this.main.rotation.x = kk * 0.1;
        // El destello de la súper es apenas más grande que el del remache: pegado al ojo y con
        // el resplandor, uno grande tapaba la esfera que sale.
        this.flash.material.opacity = kick > 0.55 ? (kick - 0.55) * (sup ? 1.4 : 2.2) : 0;
        this.flash.scale.setScalar(sup ? 0.15 + kick * 0.1 : 0.12 + kick * 0.12);
        break;
      }
      case 'brasa': {
        const lava = this.rig.art.userData.glow?.value;
        if (p.action && p.action.type === 'leap') {
          // En el salto los dos puños suben sobre la cabeza y bajan al caer.
          const u = p.action.t / p.action.dur;
          const up = u < 0.75 ? smooth(clamp01(u / 0.3)) : 1 - smooth((u - 0.75) / 0.25);
          for (const [s, sd] of [[this.main, 1], [this.off, -1]]) {
            s.position.y += up * 0.35;
            s.position.x -= sd * up * 0.12;
            s.rotation.x = up * 0.6;
          }
          if (lava) lava.w = 1.6 + up * 1.8;
        } else {
          // Al tirar las ascuas los dos puños empujan hacia adelante.
          const punch = Math.sin(clamp01(a * 1.6) * PI);
          for (const s of [this.main, this.off]) {
            s.position.z -= punch * 0.3;
            s.position.y += punch * 0.1;
          }
          // En reposo la lava late bien encendida: es lo que hace que los puños se lean.
          if (lava) lava.w = 2.8 + Math.sin(time * 3) * 0.4 + punch * 1.4;
        }
        break;
      }
      case 'nox':
        if (sup) {
          // Para la lluvia de estrellas apunta la ballesta al cielo.
          this.main.rotation.x = swing * 0.7;
          this.main.position.y += swing * 0.08;
        }
        this.main.position.z += kick * 0.1;
        this.main.rotation.x += kick * 0.08;
        this.flash.material.opacity = kick > 0.65 ? (kick - 0.65) * 2.2 : 0;
        break;
      case 'pompa': {
        // Tira el frasco por arriba: la mano sube, va hacia adelante y el frasco vuelve a aparecer.
        const big = sup ? 1.35 : 1;
        this.main.position.z -= swing * 0.3 * big;
        this.main.position.y += swing * 0.2 * big;
        this.main.rotation.x = -swing * 0.5;
        this.flask.scale.setScalar(a < 0.2 ? 1 : smooth(clamp01((a - 0.55) / 0.45)));
        break;
      }
      case 'zip':
        // Cada golpe es un tajo cruzado de una mano; se alternan.
        [this.main, this.off].forEach((s, i) => {
          const cut = Math.sin(smooth(this.hitT[i === 0 ? 1 : 0]) * PI);
          const sd = i === 0 ? 1 : -1;
          s.rotation.z = sd * cut * 1.0;
          s.rotation.x = -cut * 0.55;
          s.position.x -= sd * cut * 0.2;
          s.position.z -= cut * 0.14;
        });
        if (p.action && p.action.type === 'dash') {
          // En la embestida las dos cuchillas van adelante, hacia el centro.
          for (const [s, sd] of [[this.main, 1], [this.off, -1]]) {
            s.position.z -= 0.35;
            s.position.x -= sd * 0.08;
            s.rotation.x = 0.2;
          }
        }
        break;
      case 'tajo': {
        // Hachazo: se prepara, baja de golpe y vuelve. La zanja se clava más abajo.
        const c = a < 1 ? chop(a, 0.18, 0.4) : 0;
        this.main.rotation.x = -c * (sup ? 1.35 : 1.2);
        this.main.position.y -= Math.max(0, c) * (sup ? 0.18 : 0.1);
        this.main.position.z -= Math.max(0, c) * 0.16;
        this.main.position.x -= Math.max(0, c) * 0.1;
        break;
      }
      default:
        break;
    }
  }

  dispose() {
    this.camera.remove(this.root);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}
