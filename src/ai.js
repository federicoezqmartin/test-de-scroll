// Bots: búsqueda de camino (A*) + decisiones simples por prioridad.
const SQ2 = Math.SQRT2;
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
let gScore = null, came = null, stamp = null, gen = 0;
const heapF = [], heapI = [];

function push(f, i) {
  let n = heapF.length;
  heapF.push(f); heapI.push(i);
  while (n > 0) {
    const p = (n - 1) >> 1;
    if (heapF[p] <= f) break;
    heapF[n] = heapF[p]; heapI[n] = heapI[p];
    n = p;
  }
  heapF[n] = f; heapI[n] = i;
}
function pop() {
  const top = heapI[0];
  const f = heapF.pop(), i = heapI.pop();
  const len = heapF.length;
  if (len > 0) {
    let n = 0;
    for (;;) {
      let c = 2 * n + 1;
      if (c >= len) break;
      if (c + 1 < len && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= f) break;
      heapF[n] = heapF[c]; heapI[n] = heapI[c];
      n = c;
    }
    heapF[n] = f; heapI[n] = i;
  }
  return top;
}

export function findPath(world, sx, sz, gx, gz) {
  const { W, H } = world;
  if (!gScore || gScore.length !== W * H) {
    gScore = new Float32Array(W * H);
    came = new Int32Array(W * H);
    stamp = new Uint32Array(W * H);
  }
  const s = world.nearestFreeTile(world.col(sx), world.row(sz));
  let gc = world.col(gx), gr = world.row(gz), exact = true;
  if (world.blocksMove(gc, gr) || gc < 0 || gr < 0 || gc >= W || gr >= H) {
    const t = world.nearestFreeTile(gc, gr);
    gc = t.c; gr = t.r; exact = false;
  }
  const start = s.r * W + s.c, goal = gr * W + gc;
  if (start === goal) return [exact ? { x: gx, z: gz } : { x: world.cx(gc), z: world.cz(gr) }];
  gen++;
  heapF.length = 0; heapI.length = 0;
  gScore[start] = 0; stamp[start] = gen; came[start] = -1;
  push(0, start);
  let found = false;
  while (heapF.length) {
    const cur = pop();
    if (cur === goal) { found = true; break; }
    const cc = cur % W, cr = (cur / W) | 0, g = gScore[cur];
    for (const [dc, dr, w] of NB) {
      const nc = cc + dc, nr = cr + dr;
      if (world.blocksMove(nc, nr)) continue;
      if (dc && dr && (world.blocksMove(cc + dc, cr) || world.blocksMove(cc, cr + dr))) continue;
      const ni = nr * W + nc;
      const ng = g + w + world.cost[ni];
      if (stamp[ni] === gen && ng >= gScore[ni]) continue;
      stamp[ni] = gen; gScore[ni] = ng; came[ni] = cur;
      const hx = Math.abs(nc - gc), hz = Math.abs(nr - gr);
      push(ng + Math.max(hx, hz) + (SQ2 - 1) * Math.min(hx, hz), ni);
    }
  }
  if (!found) return null;
  const path = [];
  for (let i = goal; i !== start && i !== -1; i = came[i]) path.push({ x: world.cx(i % W), z: world.cz((i / W) | 0) });
  path.reverse();
  if (exact && path.length) path[path.length - 1] = { x: gx, z: gz };
  return path;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Bot {
  constructor(f, match, lane) {
    this.f = f;
    this.m = match;
    this.lane = lane; // -1, 0, 1
    this.thinkT = Math.random() * 0.3;
    this.fireCd = 0.6 + Math.random() * 0.6;
    this.superCd = 1;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1;
    this.path = null;
    this.pi = 0;
    this.target = null;
    this.mode = 'mid';
    this.stuckT = 0;
    this.lastX = f.x;
    this.lastZ = f.z;
  }

  update(dt) {
    const f = this.f;
    if (!f.alive) { this.path = null; f.mvx = f.mvz = 0; return; }
    this.thinkT -= dt; this.fireCd -= dt; this.superCd -= dt; this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 0.7 + Math.random() * 1.3; }
    if (this.thinkT <= 0) { this.thinkT = 0.2 + Math.random() * 0.12; this.think(); }
    this.follow(dt);
    this.combat();
  }

  think() {
    const { f, m } = this;
    const w = m.world;
    let target = null, best = 1e9;
    for (const e of m.fighters) {
      if (e.team === f.team || !e.alive || !e.visTo[f.team] || e.action) continue;
      const score = dist(f, e) + (e.hp / e.maxHp) * 2.5 - e.cores * 0.6;
      if (score < best) { best = score; target = e; }
    }
    this.target = target;
    const dT = target ? dist(f, target) : 99;
    const hpF = f.hp / f.maxHp;
    const side = f.team === 0 ? 1 : -1;
    const home = { x: this.lane * 3.5, z: side * (w.H / 2 - 4) };
    const leading = m.leadTeam === f.team;
    const range = f.def.aiRange;
    let goal;

    if (hpF < 0.33 && dT < 10) {
      this.mode = 'retreat';
      goal = home;
    } else if (f.cores >= 5 || (leading && f.cores >= 2)) {
      this.mode = 'guard';
      goal = target && dT < range + 1.5 && hpF > 0.5 ? this.fightPoint(target, range + 1) : { x: this.lane * 4, z: side * 7 };
    } else {
      // Núcleo más conveniente en el piso.
      let core = null, bc = 1e9;
      for (const c of m.cores) {
        if (!c.landed) continue;
        const d = dist(f, c);
        const ownHalf = c.z * side > 0 ? -1.5 : 0;
        if (d + ownHalf < bc) { bc = d + ownHalf; core = c; }
      }
      const dc = core ? dist(f, core) : 99;
      if (core && dc < 11 && (dT > 3.5 || dc < 2.2 || hpF > 0.65)) {
        this.mode = 'collect';
        goal = { x: core.x, z: core.z };
      } else if (target) {
        this.mode = 'fight';
        const back = f.ammo < 1 && f.def.attack.kind !== 'melee' ? 2 : 0;
        goal = this.fightPoint(target, range + back);
      } else {
        this.mode = 'mid';
        goal = { x: this.lane * 3.6, z: side * 2.6 };
      }
    }
    const p = findPath(w, f.x, f.z, goal.x, goal.z);
    if (p) { this.path = p; this.pi = 0; }

    // Destrabe: si casi no se movió teniendo camino, empuja de costado.
    const moved = Math.hypot(f.x - this.lastX, f.z - this.lastZ);
    this.lastX = f.x; this.lastZ = f.z;
    this.stuckT = this.path && this.path.length > 1 && moved < 0.05 ? this.stuckT + 1 : 0;
    if (this.stuckT > 3) { this.strafe *= -1; this.stuckT = 0; f.kx += (Math.random() - 0.5) * 6; f.kz += (Math.random() - 0.5) * 6; }
  }

  // Punto a distancia cómoda del rival, girando alrededor para no quedarse quieto.
  fightPoint(t, range) {
    const { f, m } = this;
    let ux = f.x - t.x, uz = f.z - t.z;
    const d = Math.hypot(ux, uz) || 1;
    ux /= d; uz /= d;
    const a = this.strafe * (range < 2.5 ? 0.9 : 0.55);
    const cs = Math.cos(a), sn = Math.sin(a);
    const rx = ux * cs - uz * sn, rz = ux * sn + uz * cs;
    const px = t.x + rx * range, pz = t.z + rz * range;
    if (m.world.circleFree(px, pz, 0.42)) return { x: px, z: pz };
    return { x: t.x + ux * range * 0.6, z: t.z + uz * range * 0.6 };
  }

  follow() {
    const { f, m } = this;
    const path = this.path;
    if (!path || this.pi >= path.length || f.action) { f.mvx = f.mvz = 0; return; }
    // Atajo: saltea puntos mientras haya paso libre en línea recta.
    let look = 0;
    while (this.pi + 1 < path.length && look++ < 5 && m.world.walkClear(f.x, f.z, path[this.pi + 1].x, path[this.pi + 1].z)) this.pi++;
    const wp = path[this.pi];
    const dx = wp.x - f.x, dz = wp.z - f.z, d = Math.hypot(dx, dz);
    if (d < 0.22) {
      this.pi++;
      if (this.pi >= path.length) { f.mvx = f.mvz = 0; return; }
    }
    f.mvx = dx / (d || 1);
    f.mvz = dz / (d || 1);
  }

  combat() {
    const { f, m } = this;
    const t = this.target;
    if (m.state !== 'play' || !t || !t.alive || !t.visTo[f.team] || t.action || f.action) return;
    const w = m.world;
    const atk = f.def.attack, sup = f.def.super;
    const d = dist(f, t);
    const hpF = f.hp / f.maxHp;

    // Súper.
    if (f.super >= 1 && this.superCd <= 0) {
      let use = false, ax = t.x, az = t.z;
      switch (sup.kind) {
        case 'shots': use = d < sup.range * 0.8 && w.shotClear(f.x, f.z, t.x, t.z); break;
        case 'leap': use = d < sup.range && d > 1.5 && hpF > 0.3; break;
        case 'zone':
        case 'lob': use = d < sup.range; ax += t.velx * 0.4; az += t.velz * 0.4; break;
        case 'dash': use = d < sup.range * 0.85 && w.shotClear(f.x, f.z, t.x, t.z); break;
        default: break;
      }
      if (use) {
        const dx = ax - f.x, dz = az - f.z, l = Math.hypot(dx, dz) || 1;
        m.trySuper(f, dx / l, dz / l, l);
        this.superCd = 1.5;
        this.fireCd = Math.max(this.fireCd, 0.35);
        return;
      }
    }

    if (this.fireCd > 0 || f.ammo < 1 || f.attackCd > 0) return;
    const lob = atk.kind === 'lob', melee = atk.kind === 'melee';
    if (d > atk.range * (melee ? 0.85 : 0.93)) return;
    if (!lob && !w.shotClear(f.x, f.z, t.x, t.z)) return;
    const tt = lob ? atk.flight : melee ? 0 : d / atk.speed;
    const px = t.x + t.velx * tt * 0.75, pz = t.z + t.velz * tt * 0.75;
    let dx = px - f.x, dz = pz - f.z;
    const l = Math.hypot(dx, dz) || 1;
    const err = (Math.random() - 0.5) * (lob ? 0.12 : 0.2);
    const cs = Math.cos(err), sn = Math.sin(err);
    const ex = (dx * cs - dz * sn) / l, ez = (dx * sn + dz * cs) / l;
    if (m.tryAttack(f, ex, ez, l)) {
      const finishing = t.hp < atk.dmg * (atk.count || atk.hits || 1) * 1.2;
      this.fireCd = (finishing ? 0.25 : 0.45) + Math.random() * 0.55;
    }
  }
}
