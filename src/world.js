// Arena: grilla de colisiones + todo lo que se ve del escenario.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MAP_HALF } from './data.js';
import { tex } from './assets.js';
import { waterMaterial, seaMaterial, grassMaterial, grassHeight, stoneMaterial } from './shaders.js';

export const T = { FLOOR: 0, WALL: 1, CRATE: 2, WATER: 3, BUSH: 4, CORE: 5 };
const CHAR = { '.': T.FLOOR, '#': T.WALL, X: T.CRATE, '~': T.WATER, g: T.BUSH, M: T.CORE };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Halo oscuro alrededor de una huella cuadrada (la huella ocupa el centro, 1 de cada 1.9).
function contactTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const half = 0.5 / 1.9;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = Math.abs((x + 0.5) / S - 0.5), v = Math.abs((y + 0.5) / S - 0.5);
      const d = Math.hypot(Math.max(u - half, 0), Math.max(v - half, 0)) * 1.9;
      const a = Math.max(0, 1 - d / 0.42) ** 2.2;
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(a * 200);
    }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    const top = MAP_HALF.map((h) => h + [...h.slice(0, -1)].reverse().join(''));
    const rows = [...top, ...top.slice(0, -1).reverse()];
    this.W = rows[0].length;
    this.H = rows.length;
    this.grid = new Uint8Array(this.W * this.H);
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) this.grid[r * this.W + c] = CHAR[rows[r][c]] ?? T.FLOOR;

    this.spawns = [
      [[10, this.H - 2], [7, this.H - 2], [13, this.H - 2]],
      [[10, 1], [13, 1], [7, 1]],
    ].map((list) => list.map(([c, r]) => ({ x: this.cx(c), z: this.cz(r) })));
    this.reactor = { x: 0, z: 0 };

    // Costo extra para caminar pegado a obstáculos (los bots doblan más abierto).
    this.version = 0; // sube cada vez que cambia el mapa (cajón roto, pasto cortado)
    this.cost = new Float32Array(this.W * this.H);
    this.updateCost(0, 0, this.W - 1, this.H - 1);

    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];
    this.build();
  }

  updateCost(c0, r0, c1, r1) {
    for (let r = Math.max(0, r0); r <= Math.min(this.H - 1, r1); r++)
      for (let c = Math.max(0, c0); c <= Math.min(this.W - 1, c1); c++) {
        let near = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (this.blocksMove(c + dc, r + dr)) near++;
        this.cost[r * this.W + c] = near ? 0.35 : 0;
      }
  }

  // --- cosas que se rompen ----------------------------------------------------
  // Daña el cajón de una baldosa. Devuelve 'hit', 'broken' o null si ahí no hay cajón.
  damageCrate(c, r, amount) {
    const k = this.crates.get(r * this.W + c);
    if (!k || this.type(c, r) !== T.CRATE) return null;
    k.hp -= amount;
    if (k.hp > 0) return 'hit';
    this.grid[r * this.W + c] = T.FLOOR;
    this.version++;
    const hide = this.hideMatrix;
    this.crateMesh.setMatrixAt(k.n, hide);
    this.crateMesh.setMatrixAt(k.n2, hide);
    this.crateMesh.instanceMatrix.needsUpdate = true;
    this.aoMesh.setMatrixAt(k.ao, hide);
    this.aoMesh.instanceMatrix.needsUpdate = true;
    this.updateCost(c - 1, r - 1, c + 1, r + 1);
    return 'broken';
  }

  // Corta el pasto alto de una baldosa: deja de esconder. Devuelve true si había.
  cutBush(c, r) {
    const start = this.bushStart.get(r * this.W + c);
    if (start === undefined || this.type(c, r) !== T.BUSH) return false;
    this.grid[r * this.W + c] = T.FLOOR;
    this.version++;
    for (let k = 0; k < this.bushPer; k++) this.bushMesh.setMatrixAt(start + k, this.hideMatrix);
    this.bushMesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  // Baldosas (columna, fila) cuyo centro cae dentro de un círculo.
  tilesIn(x, z, radius) {
    const out = [];
    for (let r = this.row(z - radius); r <= this.row(z + radius); r++)
      for (let c = this.col(x - radius); c <= this.col(x + radius); c++)
        if (Math.hypot(this.cx(c) - x, this.cz(r) - z) <= radius) out.push([c, r]);
    return out;
  }

  // --- grilla ---------------------------------------------------------------
  col(x) { return Math.floor(x + this.W / 2); }
  row(z) { return Math.floor(z + this.H / 2); }
  cx(c) { return c - this.W / 2 + 0.5; }
  cz(r) { return r - this.H / 2 + 0.5; }
  type(c, r) {
    if (c < 0 || r < 0 || c >= this.W || r >= this.H) return T.WALL;
    return this.grid[r * this.W + c];
  }
  blocksMove(c, r) { const t = this.type(c, r); return t === T.WALL || t === T.CRATE || t === T.WATER || t === T.CORE; }
  blocksShot(c, r) { const t = this.type(c, r); return t === T.WALL || t === T.CRATE || t === T.CORE; }
  shotBlockedAt(x, z) { return this.blocksShot(this.col(x), this.row(z)); }
  bushAt(x, z) { return this.type(this.col(x), this.row(z)) === T.BUSH; }

  circleFree(x, z, rad) {
    const c0 = this.col(x), r0 = this.row(z);
    for (let r = r0 - 1; r <= r0 + 1; r++)
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (!this.blocksMove(c, r)) continue;
        const minx = c - this.W / 2, minz = r - this.H / 2;
        const dx = x - Math.max(minx, Math.min(x, minx + 1));
        const dz = z - Math.max(minz, Math.min(z, minz + 1));
        if (dx * dx + dz * dz < rad * rad) return false;
      }
    return true;
  }

  // Saca un círculo de adentro de los obstáculos (deslizando por los bordes).
  resolve(p, rad) {
    const c0 = this.col(p.x), r0 = this.row(p.z);
    for (let r = r0 - 1; r <= r0 + 1; r++)
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (!this.blocksMove(c, r)) continue;
        const minx = c - this.W / 2, minz = r - this.H / 2;
        const nx = Math.max(minx, Math.min(p.x, minx + 1));
        const nz = Math.max(minz, Math.min(p.z, minz + 1));
        const dx = p.x - nx, dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rad * rad) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = (rad - d) / d;
          p.x += dx * push;
          p.z += dz * push;
        } else {
          const l = p.x - minx, rr = minx + 1 - p.x, t = p.z - minz, b = minz + 1 - p.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) p.x = minx - rad;
          else if (m === rr) p.x = minx + 1 + rad;
          else if (m === t) p.z = minz - rad;
          else p.z = minz + 1 + rad;
        }
      }
  }

  // Distancia que recorre un disparo antes de chocar (hasta max).
  rayShot(x, z, dx, dz, max) {
    const step = 0.1;
    for (let d = 0; d < max; d += step) if (this.shotBlockedAt(x + dx * d, z + dz * d)) return d;
    return max;
  }
  shotClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    return this.rayShot(x0, z0, dx / d, dz / d, d) >= d;
  }
  walkClear(x0, z0, x1, z1, rad = 0.43) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(d / 0.3));
    for (let i = 1; i <= n; i++) if (!this.circleFree(x0 + (dx * i) / n, z0 + (dz * i) / n, rad)) return false;
    return true;
  }
  nearestFreeTile(c, r) {
    c = Math.max(0, Math.min(this.W - 1, c));
    r = Math.max(0, Math.min(this.H - 1, r));
    if (!this.blocksMove(c, r)) return { c, r };
    for (let ring = 1; ring < 8; ring++) {
      let best = null, bd = 1e9;
      for (let dr = -ring; dr <= ring; dr++)
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (this.blocksMove(c + dc, r + dr)) continue;
          const d = dc * dc + dr * dr;
          if (d < bd) { bd = d; best = { c: c + dc, r: r + dr }; }
        }
      if (best) return best;
    }
    return { c, r };
  }
  nearestFree(x, z, rad = 0.4) {
    const lim = 0.5 + rad * 0.2;
    x = Math.max(-this.W / 2 + lim, Math.min(this.W / 2 - lim, x));
    z = Math.max(-this.H / 2 + lim, Math.min(this.H / 2 - lim, z));
    if (this.circleFree(x, z, rad)) return { x, z };
    const t = this.nearestFreeTile(this.col(x), this.row(z));
    return { x: this.cx(t.c), z: this.cz(t.r) };
  }

  // --- visual ---------------------------------------------------------------
  keep(o) { this.disposables.push(o); return o; }

  build() {
    const { W, H } = this;
    const rand = rng(7);
    const dummy = (this.dummy = new THREE.Object3D());
    const col = new THREE.Color();

    // Base de cada baldosa (hace de junta oscura); las de agua van hundidas.
    const floorGeo = this.keep(new THREE.BoxGeometry(1, 0.6, 1));
    const floorMat = this.keep(new THREE.MeshStandardMaterial({ roughness: 1 }));
    const floor = new THREE.InstancedMesh(floorGeo, floorMat, W * H);
    floor.receiveShadow = true;
    let i = 0;
    const waterTiles = [], bushTiles = [], walls = [], crates = [], sandQuads = [];
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const t = this.type(c, r);
        const x = this.cx(c), z = this.cz(r);
        const water = t === T.WATER;
        dummy.position.set(x, water ? -0.72 : -0.335, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        floor.setMatrixAt(i, dummy.matrix);
        col.set(water ? 0x1b7388 : t === T.BUSH ? 0x3d5a1e : 0x7d5a30);
        floor.setColorAt(i++, col);
        // Debajo del pasto alto va el mismo suelo: un cuadrado de césped por mata se veía, desde
        // arriba, como un bloque. La mata la dibujan las hojas, que se desbordan un poco.
        if (water) waterTiles.push([x, z]);
        else sandQuads.push([x, z]);
        if (t === T.BUSH) bushTiles.push([x, z]);
        if (t === T.WALL) walls.push([x, z, 0.92 + rand() * 0.14, 0]);
        if (t === T.CRATE) crates.push([x, z]);
      }
    this.group.add(floor);

    // Cara superior de las baldosas, con la textura continua de una a otra. El tono no va por
    // baldosa (un damero dibujaba la grilla en el piso): sale de manchas grandes que dependen de
    // la posición, y cada esquina toma el suyo, así se funde con la baldosa vecina.
    const groundShade = (px, pz) => 0.84 + 0.08 * Math.sin(px * 0.71 + pz * 0.33) + 0.06 * Math.sin(px * 0.23 - pz * 0.61 + 1.7) + 0.04 * Math.sin(px * 1.9 + pz * 1.37);
    const quads = (list, uvScale, inset) => {
      const n = list.length;
      const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), cl = new Float32Array(n * 12), nor = new Float32Array(n * 12);
      const idx = [];
      list.forEach(([x, z], k) => {
        const a = 0.5 - inset;
        const cs = [[x - a, z - a], [x + a, z - a], [x + a, z + a], [x - a, z + a]];
        cs.forEach(([px, pz], v) => {
          pos.set([px, 0, pz], k * 12 + v * 3);
          uv.set([px / uvScale, -pz / uvScale], k * 8 + v * 2);
          const shade = groundShade(px, pz);
          cl.set([shade, shade, shade], k * 12 + v * 3);
          nor.set([0, 1, 0], k * 12 + v * 3);
        });
        idx.push(k * 4, k * 4 + 3, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 1);
      });
      const g = this.keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(idx);
      return g;
    };
    const sand = new THREE.Mesh(quads(sandQuads, 3.2, 0), this.keep(new THREE.MeshStandardMaterial({
      map: tex('arena.webp', { repeat: true }), normalMap: tex('arena-n.webp', { repeat: true, data: true }),
      normalScale: new THREE.Vector2(1.5, 1.5), vertexColors: true, roughness: 0.92,
    })));
    sand.receiveShadow = true;
    this.group.add(sand);

    // Borde de la arena.
    for (let c = -1; c <= W; c++) {
      walls.push([this.cx(c), this.cz(-1), 0.8, 1]);
      walls.push([this.cx(c), this.cz(H), 0.4, 1]);
    }
    for (let r = 0; r < H; r++) {
      walls.push([this.cx(-1), this.cz(r), 0.6, 1]);
      walls.push([this.cx(W), this.cz(r), 0.6, 1]);
    }

    // Muros de piedra. Cada muro interior tiene uno o dos bloques más que, en las vistas al hombro
    // y en primera persona, suben desde adentro del bloque de abajo (ver setTall): así tapa la
    // vista lo mismo que tapa los disparos. En la vista de arriba quedan escondidos.
    // Bloques del ancho justo de la baldosa, sin redondear y subdivididos: el material de
    // piedra los deforma con un ruido del mundo, así los vecinos se funden en un solo muro
    // irregular en vez de verse como cubos (ver stoneMaterial).
    const wallGeo = this.keep(new THREE.BoxGeometry(1, 1, 1, 3, 3, 3));
    const pos = wallGeo.attributes.position;
    const shadeAttr = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v), k = 0.68 + 0.32 * (y + 0.5) ** 1.5; // más oscuro abajo
      shadeAttr[v * 3] = shadeAttr[v * 3 + 1] = shadeAttr[v * 3 + 2] = k;
    }
    wallGeo.setAttribute('color', new THREE.BufferAttribute(shadeAttr, 3));
    const stoneMap = this.keep(tex('piedra.webp').clone()), stoneN = this.keep(tex('piedra-n.webp', { data: true }).clone());
    for (const t of [stoneMap, stoneN]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }
    const wallMat = this.keep(stoneMaterial(stoneMap, stoneN));
    const stone = [0xffffff, 0xe9eef3, 0xf4efe6];
    this.wallStacks = [];
    this.stackTop = new Map(); // baldosa -> alto del muro bajo y cuánto suma apilado
    let extra = 0;
    for (const [x, z, h, border] of walls) {
      const blocks = [];
      if (!border) {
        blocks.push({ h: Math.min(h - 0.02, 0.84 + rand() * 0.1), rot: Math.floor(rand() * 4), col: stone[Math.floor(rand() * 3)] });
        if (rand() < 0.4) blocks.push({ h: Math.min(h - 0.02, 0.5 + rand() * 0.3), rot: Math.floor(rand() * 4), col: stone[Math.floor(rand() * 3)] });
      }
      this.wallStacks.push({ x, z, h, border, blocks, first: walls.length + extra });
      if (!border) this.stackTop.set(this.row(z) * W + this.col(x), { h, extra: blocks.reduce((a, b) => a + b.h, 0) });
      extra += blocks.length;
    }
    const wallMesh = (this.wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length + extra));
    wallMesh.castShadow = wallMesh.receiveShadow = true;
    walls.forEach(([x, z, h, border], n) => {
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(1, h, 1);
      dummy.rotation.set(0, border ? 0 : Math.floor(rand() * 4) * (Math.PI / 2), 0);
      dummy.updateMatrix();
      wallMesh.setMatrixAt(n, dummy.matrix);
      col.set(border ? 0xb9c2cc : stone[Math.floor(rand() * 3)]);
      wallMesh.setColorAt(n, col);
    });
    for (const w of this.wallStacks) w.blocks.forEach((b, k) => wallMesh.setColorAt(w.first + k, col.set(b.col)));
    dummy.rotation.set(0, 0, 0);
    this.group.add(wallMesh);

    // Cajones.
    const crateScale = []; // tamaño de cada uno: el que se apila encima se apoya justo sobre él
    if (crates.length) {
      const crateGeo = this.keep(new RoundedBoxGeometry(0.92, 0.92, 0.92, 2, 0.035));
      const crateMat = this.keep(new THREE.MeshStandardMaterial({
        map: tex('cajon.webp'), normalMap: tex('cajon-n.webp', { data: true }), normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.8,
      }));
      // Cada cajón trae otro encima que sube en las vistas con cámara propia (instancias crates.length+n).
      const crateMesh = (this.crateMesh = new THREE.InstancedMesh(crateGeo, crateMat, crates.length * 2));
      crateMesh.castShadow = crateMesh.receiveShadow = true;
      // Apenas girados y de distinto tamaño: alineados a la grilla parecían cubos de juguete.
      crates.forEach(([x, z], n) => {
        const sc = (crateScale[n] = 0.95 + rand() * 0.07);
        dummy.position.set(x, 0.46 * sc, z);
        dummy.scale.setScalar(sc);
        dummy.rotation.set(0, Math.floor(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.24, 0);
        dummy.updateMatrix();
        crateMesh.setMatrixAt(n, dummy.matrix);
      });
      dummy.rotation.set(0, 0, 0);
      this.group.add(crateMesh);
    }

    // Piedritas sueltas al pie de los muros y desparramadas por el piso. No chocan con nada:
    // solo rompen la línea recta donde el muro toca el piso y la superficie lisa de la arena.
    const pebbles = [];
    const open = (x, z) => {
      const tt = this.type(this.col(x), this.row(z));
      return tt === T.FLOOR || tt === T.BUSH;
    };
    for (const [x, z, , border] of walls) {
      if (border) continue;
      for (let k = 0; k < 3; k++) {
        const side = Math.floor(rand() * 4), along = (rand() - 0.5) * 0.9, out = 0.53 + rand() * 0.1;
        const px = x + (side === 0 ? out : side === 1 ? -out : along), pz = z + (side === 2 ? out : side === 3 ? -out : along);
        if (open(px, pz)) pebbles.push([px, pz, 0.04 + rand() * 0.07]);
      }
    }
    for (const [x, z] of sandQuads) if (rand() < 0.3) pebbles.push([x + (rand() - 0.5) * 0.9, z + (rand() - 0.5) * 0.9, 0.025 + rand() * 0.045]);
    const pebbleMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x9a8a78, roughness: 1, flatShading: true }));
    const pebbleMesh = new THREE.InstancedMesh(this.keep(new THREE.IcosahedronGeometry(1, 0)), pebbleMat, Math.max(1, pebbles.length));
    pebbleMesh.count = pebbles.length;
    pebbles.forEach(([x, z, sc], n) => {
      dummy.position.set(x, sc * 0.35, z);
      dummy.scale.set(sc * (0.8 + rand() * 0.6), sc * (0.5 + rand() * 0.4), sc * (0.8 + rand() * 0.6));
      dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      dummy.updateMatrix();
      pebbleMesh.setMatrixAt(n, dummy.matrix);
      pebbleMesh.setColorAt(n, col.set(0x9a8a78).offsetHSL(0, 0, (rand() - 0.5) * 0.16));
    });
    dummy.rotation.set(0, 0, 0);
    pebbleMesh.receiveShadow = true;
    this.group.add(pebbleMesh);

    // Sombra de contacto pintada alrededor de muros y cajones (oclusión barata, en toda calidad).
    const aoList = [...walls.filter((w) => !w[3]), ...crates, [this.reactor.x, this.reactor.z]];
    const aoGeo = this.keep(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2));
    const aoMat = this.keep(new THREE.MeshBasicMaterial({
      map: this.keep(contactTexture()), color: 0x1a0f05, transparent: true, depthWrite: false, opacity: 0.85,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    const aoMesh = (this.aoMesh = new THREE.InstancedMesh(aoGeo, aoMat, aoList.length));
    this.hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    this.crates = new Map(); // baldosa -> { vida, instancia del cajón, instancia de su sombra }
    const firstCrateAo = aoList.length - 1 - crates.length;
    crates.forEach(([x, z], n) => this.crates.set(this.row(z) * W + this.col(x), {
      hp: 1600, n, n2: crates.length + n, ao: firstCrateAo + n, x, z, sc: crateScale[n] ?? 1,
      rot: rand() * 0.6 - 0.3, jx: (rand() - 0.5) * 0.06, jz: (rand() - 0.5) * 0.06,
    }));
    this.tall = -1; // 0: todo bajo (vista de arriba) · 1: muros, cajones y pasto altos
    this.tallTarget = 0;
    this.setTall(0);
    aoList.forEach(([x, z], n) => {
      dummy.position.set(x, 0.006, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      aoMesh.setMatrixAt(n, dummy.matrix);
    });
    aoMesh.renderOrder = 1;
    this.group.add(aoMesh);

    // Agua: una sola malla; cada baldosa sabe qué lados dan a tierra para dibujar la espuma.
    const isWater = (x, z) => this.type(this.col(x), this.row(z)) === T.WATER;
    const wn = waterTiles.length;
    const wPos = new Float32Array(wn * 12), wNor = new Float32Array(wn * 12), wEdge = new Float32Array(wn * 16), wLoc = new Float32Array(wn * 8), wIdx = [];
    const corner = [[0, 0], [1, 0], [1, 1], [0, 1]];
    waterTiles.forEach(([x, z], k) => {
      const e = [isWater(x - 1, z) ? 0 : 1, isWater(x + 1, z) ? 0 : 1, isWater(x, z - 1) ? 0 : 1, isWater(x, z + 1) ? 0 : 1];
      [[x - 0.5, z - 0.5], [x + 0.5, z - 0.5], [x + 0.5, z + 0.5], [x - 0.5, z + 0.5]].forEach(([px, pz], v) => {
        wPos.set([px, 0, pz], k * 12 + v * 3);
        wNor.set([0, 1, 0], k * 12 + v * 3);
        wEdge.set(e, k * 16 + v * 4);
        wLoc.set(corner[v], k * 8 + v * 2);
      });
      wIdx.push(k * 4, k * 4 + 3, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 1);
    });
    const waterGeo = this.keep(new THREE.BufferGeometry());
    waterGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    waterGeo.setAttribute('normal', new THREE.BufferAttribute(wNor, 3));
    waterGeo.setAttribute('aEdge', new THREE.BufferAttribute(wEdge, 4));
    waterGeo.setAttribute('aLocal', new THREE.BufferAttribute(wLoc, 2));
    waterGeo.setIndex(wIdx);
    this.water = new THREE.Mesh(waterGeo, this.keep(waterMaterial()));
    this.water.position.y = -0.14;
    this.water.receiveShadow = true;
    this.group.add(this.water);

    // Pasto alto: matas de hojas finas; el viento y el paso de los luchadores van en el shader.
    const PER = 26;
    const bladeGeo = this.keep(new THREE.ConeGeometry(0.085, 1, 4, 3).translate(0, 0.5, 0));
    const bp = bladeGeo.attributes.position;
    const bc = new Float32Array(bp.count * 3);
    for (let v = 0; v < bp.count; v++) {
      const k = 0.4 + 0.8 * bp.getY(v);
      bc[v * 3] = bc[v * 3 + 1] = bc[v * 3 + 2] = k;
    }
    bladeGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    this.bushMesh = new THREE.InstancedMesh(bladeGeo, this.keep(grassMaterial()), Math.max(1, bushTiles.length * PER));
    this.bushMesh.count = bushTiles.length * PER;
    this.bushMesh.castShadow = true;
    this.bushMesh.receiveShadow = true;
    this.bushMesh.frustumCulled = false;
    this.bushMesh.userData.noAO = true;
    const greens = [0x5fae2e, 0x4d9a26, 0x78bf3a, 0x8fc440, 0x3f8a22];
    this.bushPer = PER;
    this.bushStart = new Map(); // baldosa -> primera hoja de esa mata
    bushTiles.forEach(([x, z], n) => {
      this.bushStart.set(this.row(z) * W + this.col(x), n * PER);
      for (let k = 0; k < PER; k++) {
        const sx = 0.8 + rand() * 0.8;
        dummy.position.set(x + (rand() - 0.5) * 1.12, 0, z + (rand() - 0.5) * 1.12);
        dummy.scale.set(sx, 0.6 + rand() * 0.45, sx);
        dummy.rotation.set((rand() - 0.5) * 0.5, rand() * 6.28, (rand() - 0.5) * 0.5);
        dummy.updateMatrix();
        this.bushMesh.setMatrixAt(n * PER + k, dummy.matrix);
        col.set(greens[Math.floor(rand() * greens.length)]);
        this.bushMesh.setColorAt(n * PER + k, col);
      }
    });
    dummy.rotation.set(0, 0, 0);
    this.group.add(this.bushMesh);
    this.dummy = dummy;

    // Isla: acantilado de roca, piedras sueltas al pie y mar con oleaje.
    const cliffMap = tex('piedra.webp').clone();
    cliffMap.wrapS = cliffMap.wrapT = THREE.RepeatWrapping;
    cliffMap.repeat.set(7, 1);
    cliffMap.needsUpdate = true;
    const cliffN = tex('piedra-n.webp', { data: true }).clone();
    cliffN.wrapS = cliffN.wrapT = THREE.RepeatWrapping;
    cliffN.repeat.set(7, 1);
    cliffN.needsUpdate = true;
    this.keep(cliffMap);
    this.keep(cliffN);
    const baseGeo = this.keep(new THREE.BoxGeometry(W + 2, 3, H + 2));
    const baseMat = this.keep(new THREE.MeshStandardMaterial({
      map: cliffMap, normalMap: cliffN, normalScale: new THREE.Vector2(2, 2), color: 0x9a8672, roughness: 1,
    }));
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -2.14;
    base.receiveShadow = true;
    this.group.add(base);

    const rockGeo = this.keep(new THREE.IcosahedronGeometry(1, 1));
    const rockMat = this.keep(new THREE.MeshStandardMaterial({ color: 0xa39484, roughness: 1, flatShading: true }));
    const rocks = [];
    const hw = W / 2 + 1, hh = H / 2 + 1;
    for (let k = 0; k < 64; k++) {
      const side = k % 4, t = rand() * 2 - 1;
      const out = 0.1 + rand() * 1.1;
      const x = side < 2 ? t * hw : (side === 2 ? -1 : 1) * (hw + out);
      const z = side < 2 ? (side === 0 ? -1 : 1) * (hh + out) : t * hh;
      rocks.push([x, -3.1 + rand() * 1.5, z, 0.6 + rand() * 1.2]);
    }
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
    rocks.forEach(([x, y, z, sc], n) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(sc * (0.8 + rand() * 0.5), sc * (0.7 + rand() * 0.8), sc * (0.8 + rand() * 0.5));
      dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(n, dummy.matrix);
      col.set(0xa39484).offsetHSL(0, 0, (rand() - 0.5) * 0.1);
      rockMesh.setColorAt(n, col);
    });
    dummy.rotation.set(0, 0, 0);
    rockMesh.receiveShadow = true;
    this.group.add(rockMesh);

    const seaGeo = this.keep(new THREE.PlaneGeometry(420, 420).rotateX(-Math.PI / 2));
    const sea = new THREE.Mesh(seaGeo, this.keep(seaMaterial(hw, hh)));
    sea.position.y = -3;
    sea.receiveShadow = true;
    this.group.add(sea);

    // Plataformas de salida.
    const padGeo = this.keep(new THREE.RingGeometry(0.34, 0.47, 28).rotateX(-Math.PI / 2));
    this.spawns.forEach((list, team) => {
      const mat = this.keep(new THREE.MeshBasicMaterial({
        color: team === 0 ? 0x2f9bff : 0xff4757, transparent: true, opacity: 0.55, depthWrite: false,
      }));
      for (const s of list) {
        const m = new THREE.Mesh(padGeo, mat);
        m.position.set(s.x, 0.02, s.z);
        this.group.add(m);
      }
    });

    this.buildReactor();
    this.buildHorizon(rand);
  }

  // Reactor: tanque de vidrio verde entre dos aros de metal remachado.
  // Islas lejanas alrededor, para que en las vistas con cámara propia haya horizonte.
  buildHorizon(rand) {
    const geo = this.keep(new THREE.IcosahedronGeometry(1, 2));
    const p = geo.attributes.position, colors = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // relieve irregular y pasto arriba, roca abajo
      const n = 1 + 0.18 * Math.sin(x * 5.1 + z * 3.7) + 0.12 * Math.sin(x * 9.3 - y * 7.1 + z * 2.3);
      p.setXYZ(i, x * n, Math.max(y, -0.35) * n, z * n);
      c.set(y > 0.35 ? 0x4f8f3a : y > 0.05 ? 0x7d8a52 : 0x7a6a58);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = this.keep(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    const N = 14, mesh = new THREE.InstancedMesh(geo, mat, N), d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (rand() - 0.5) * 0.35, r = 85 + rand() * 55;
      const big = 5 + rand() * 13;
      d.position.set(Math.cos(a) * r, -3.2, Math.sin(a) * r);
      d.scale.set(big * (1 + rand() * 0.8), big * (0.35 + rand() * 0.55), big * (0.8 + rand() * 0.6));
      d.rotation.set(0, rand() * 6.3, 0);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      mesh.setColorAt(i, c.set(0xffffff).offsetHSL(0, 0, (rand() - 0.5) * 0.12));
    }
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  // Alto de muros, cajones y pasto (0 bajo, 1 alto). Los bloques de más suben desde adentro
  // del de abajo, que es un poco más ancho, así que en 0 quedan escondidos.
  setTall(t) {
    if (t === this.tall) return;
    this.tall = t;
    const d = this.dummy, wm = this.wallMesh;
    for (const w of this.wallStacks) {
      let top = w.h;
      w.blocks.forEach((b, k) => {
        const cy = top + b.h / 2;
        d.position.set(w.x, w.h / 2 + (cy - w.h / 2) * t, w.z);
        d.scale.set(0.965, b.h, 0.965);
        d.rotation.set(0, b.rot * (Math.PI / 2), 0);
        d.updateMatrix();
        wm.setMatrixAt(w.first + k, d.matrix);
        top += b.h;
      });
    }
    wm.instanceMatrix.needsUpdate = true;
    if (this.crateMesh) {
      for (const k of this.crates.values()) {
        if (k.hp <= 0) continue;
        // escondido adentro del de abajo (t = 0) o apoyado justo encima (t = 1)
        d.position.set(k.x + k.jx * t, 0.46 * k.sc + (0.46 * k.sc + 0.423) * t, k.z + k.jz * t);
        d.scale.setScalar(0.92);
        d.rotation.set(0, k.rot, 0);
        d.updateMatrix();
        this.crateMesh.setMatrixAt(k.n2, d.matrix);
      }
      this.crateMesh.instanceMatrix.needsUpdate = true;
    }
    d.rotation.set(0, 0, 0);
    grassHeight.value = 1 + 0.75 * t;
  }

  // Alto de lo que hay en un punto ahora mismo (para que la cámara al hombro no se meta adentro).
  heightAt(x, z) {
    const c = this.col(x), r = this.row(z);
    if (c < -1 || r < -1 || c > this.W || r > this.H) return 0; // mar
    if (c < 0 || r < 0 || c >= this.W || r >= this.H) return 0.85; // borde bajo de la arena
    const t = Math.max(0, this.tall), type = this.type(c, r);
    if (type === T.WALL) {
      const st = this.stackTop.get(r * this.W + c);
      return st ? st.h + st.extra * t + 0.05 : 1.1;
    }
    if (type === T.CRATE) return 0.96 + 0.9 * t;
    if (type === T.CORE) return 1.8;
    return 0;
  }

  buildReactor() {
    const g = new THREE.Group();
    const metal = this.keep(new THREE.MeshStandardMaterial({ map: tex('mat-acero.webp'), color: 0x8f8a80, roughness: 0.5, metalness: 0.7 }));
    const dark = this.keep(new THREE.MeshStandardMaterial({ color: 0x3b3a38, roughness: 0.55, metalness: 0.7 }));
    const glass = this.keep(new THREE.MeshStandardMaterial({
      color: 0x9dff3a, emissive: 0x7dff2a, emissiveIntensity: 1.3, roughness: 0.15, transparent: true, opacity: 0.8,
    }));
    const glow = this.keep(new THREE.MeshStandardMaterial({ color: 0xe6ff9a, emissive: 0xc8ff3a, emissiveIntensity: 1.8 }));
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(this.keep(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(0.56, 0.62, 0.34, 12), dark, 0, 0.17, 0);
    add(new THREE.CylinderGeometry(0.5, 0.56, 0.16, 12), metal, 0, 0.42, 0);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.86, 20), glass, 0, 0.93, 0).castShadow = false;
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 12), metal, 0, 1.43, 0);
    add(new THREE.CylinderGeometry(0.34, 0.46, 0.14, 12), dark, 0, 1.57, 0);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8), metal, 0, 1.74, 0);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      add(new THREE.CylinderGeometry(0.045, 0.045, 1.0, 6), dark, Math.cos(a) * 0.47, 0.93, Math.sin(a) * 0.47);
      add(new THREE.SphereGeometry(0.045, 6, 5), metal, Math.cos(a) * 0.53, 0.42, Math.sin(a) * 0.53);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const pipe = add(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), dark, Math.cos(a) * 0.62, 0.16, Math.sin(a) * 0.62);
      pipe.rotation.z = Math.PI / 2;
      pipe.rotation.y = -a;
    }
    this.coreOrb = add(new THREE.IcosahedronGeometry(0.2, 0), glow, 0, 0.93, 0);
    this.coreOrb.castShadow = false;
    this.coreRing = add(new THREE.TorusGeometry(0.28, 0.025, 6, 20), glow, 0, 0.93, 0);
    this.coreRing.castShadow = false;
    this.coreLight = new THREE.PointLight(0x9dff3a, 6, 7, 1.6);
    this.coreLight.position.set(0, 1.2, 0);
    g.add(this.coreLight);
    g.position.set(this.reactor.x, 0, this.reactor.z);
    this.group.add(g);
  }

  update(time, dt = 0) {
    if (this.tall !== this.tallTarget) {
      const step = dt * 2.6, t = this.tall;
      this.setTall(t < this.tallTarget ? Math.min(this.tallTarget, t + step) : Math.max(this.tallTarget, t - step));
    }
    this.coreOrb.rotation.y = time * 1.4;
    this.coreOrb.rotation.x = time * 0.8;
    this.coreOrb.position.y = 0.93 + Math.sin(time * 2.2) * 0.1;
    this.coreRing.rotation.x = Math.PI / 2 + Math.sin(time * 1.1) * 0.5;
    this.coreRing.rotation.y = time * 0.9;
    this.coreLight.intensity = 5 + Math.sin(time * 5) * 1.2;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const o of this.disposables) o.dispose?.();
  }
}
