// Mide la ayuda de puntería en táctil con números: fricción, imán y que nunca ayude hacia un
// rival escondido en el pasto o detrás de un muro. También comprueba que con mouse no cambia nada.
// Uso: node qa/punteria.mjs  ·  node qa/punteria.mjs --vista hombro
// Sale con código 1 si alguna comprobación falla.
import { abrir, args } from './comun.mjs';

const o = args({ vista: 'primera' });
const { page, url, errores, cerrar } = await abrir({ ancho: 390, alto: 844, tactil: true });
await page.goto(url + '?q=baja', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const r = await page.evaluate(({ vista }) => {
  const T = window.__trifulca, out = {};
  T.setSetting('view', vista);
  T.startMatch('tuerca');
  const m = T.match, w = m.world, inp = T.input, p = m.player;
  while (m.state !== 'play') m.update(1 / 60);
  // Bots quietos: la prueba mueve a cada uno a mano.
  for (const f of m.fighters) { f.bot = null; f.mvx = f.mvz = 0; }
  const foes = m.fighters.filter((f) => f.team === 1);
  const [foe, ...rest] = foes;
  const free = (c, r) => c >= 0 && r >= 0 && c < w.W && r < w.H && w.type(c, r) === 0;
  const put = (f, c, r) => { f.x = w.cx(c); f.z = w.cz(r); f.velx = f.velz = 0; f.revealT = 0; };
  const ang = (f) => Math.atan2(f.x - p.x, f.z - p.z);
  const off = (f) => { let d = (ang(f) - m.yaw) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
  const step = (n = 1) => { for (let i = 0; i < n; i++) m.update(1 / 60); };
  const reset = () => {
    inp.move.x = inp.move.z = 0;
    inp.t.attack = null;
    inp.look.x = inp.look.y = 0;
    m.atkT = -99;
    // los otros dos rivales, lejos de la prueba
    rest.forEach((f, i) => put(f, 1 + i * 18, 0));
    p.hp = p.maxHp;
    foe.hp = foe.maxHp;
  };
  // Mide cuánto gira la cámara con un mismo arrastre de dedo.
  const turn = (px) => { const y0 = m.yaw; inp.look.x = px; step(); return Math.abs(m.yaw - y0); };

  // Un lugar abierto: jugador y rival a 5 baldosas, en piso libre y sin nada en el medio.
  let open = null;
  for (let r = 16; r < w.H - 2 && !open; r++)
    for (let c = 2; c < w.W - 2 && !open; c++) {
      if (!free(c, r) || !free(c, r - 5) || !free(c + 1, r - 5) || !free(c - 1, r - 5)) continue;
      if (w.shotClear(w.cx(c), w.cz(r), w.cx(c), w.cz(r - 5))) open = { c, r };
    }
  // Detrás de un muro: jugador en piso, muro en el medio, rival en piso del otro lado.
  let wall = null;
  for (let r = 3; r < w.H - 3 && !wall; r++)
    for (let c = 1; c < w.W - 1 && !wall; c++) {
      if (w.type(c, r) !== 1) continue;
      for (const [a, b] of [[r + 3, r - 1], [r - 3, r + 1]])
        if (free(c, a) && free(c, b) && !w.shotClear(w.cx(c), w.cz(a), w.cx(c), w.cz(b))) { wall = { c, from: a, to: b }; break; }
    }
  // En el pasto: rival en una mata, a más de 2,3 m del jugador y con tiro libre.
  let bush = null;
  for (let r = 2; r < w.H - 2 && !bush; r++)
    for (let c = 0; c < w.W && !bush; c++) {
      if (w.type(c, r) !== 4) continue;
      for (const dr of [4, -4])
        if (free(c, r + dr) && w.shotClear(w.cx(c), w.cz(r + dr), w.cx(c), w.cz(r))) { bush = { c, r, from: r + dr }; break; }
    }
  out.lugares = { open, wall, bush };

  // --- Fricción ---
  for (const nivel of ['no', 'suave', 'fuerte']) {
    T.setSetting('aimAssist', nivel);
    reset();
    put(p, open.c, open.r);
    put(foe, open.c, open.r - 5);
    step(2);
    m.yaw = ang(foe);
    const sobre = turn(40);
    m.yaw = ang(foe) + 1.2; // la mira lejos del rival
    const libre = turn(40);
    out['friccion_' + nivel] = { sobreRival: +sobre.toFixed(4), sinRival: +libre.toFixed(4), proporcion: +(sobre / libre).toFixed(2) };
  }

  // --- Imán: rival a 0,2 rad del centro, mientras se mantiene el botón de ataque ---
  for (const nivel of ['suave', 'fuerte']) {
    T.setSetting('aimAssist', nivel);
    reset();
    put(p, open.c, open.r);
    put(foe, open.c, open.r - 5);
    step(2);
    m.yaw = ang(foe) - 0.2;
    const curva = [+off(foe).toFixed(3)];
    let salto = 0;
    inp.t.attack = { id: 99, sx: 0, sy: 0 };
    for (let i = 0; i < 60; i++) {
      const y0 = m.yaw;
      step();
      salto = Math.max(salto, Math.abs(m.yaw - y0));
      if (i % 10 === 9) curva.push(+off(foe).toFixed(3));
    }
    inp.t.attack = null;
    // quieto y sin atacar: no tira
    m.yaw = ang(foe) - 0.2;
    m.atkT = -99;
    const yq = m.yaw;
    step(30);
    out['iman_' + nivel] = { angulo: curva, mayorPasoPorCuadro: +salto.toFixed(4), giroQuietoSinAtacar: +Math.abs(m.yaw - yq).toFixed(4) };
  }

  // --- Nunca hacia escondidos ---
  T.setSetting('aimAssist', 'fuerte');
  const escondido = (lugar, ponerRival) => {
    reset();
    put(p, lugar.c, lugar.from);
    ponerRival();
    step(3);
    m.yaw = ang(foe);
    const visible = foe.visTo[0], tiroLibre = w.shotClear(p.x, p.z, foe.x, foe.z);
    const giro = turn(40);
    m.yaw = ang(foe) - 0.2;
    const y0 = m.yaw;
    inp.t.attack = { id: 99, sx: 0, sy: 0 };
    step(30);
    inp.t.attack = null;
    return { visible, tiroLibre, giro: +giro.toFixed(4), giroDelIman: +Math.abs(m.yaw - y0).toFixed(4), marca: m.markTgt === foe };
  };
  out.detrasDeMuro = escondido(wall, () => put(foe, wall.c, wall.to));
  out.enElPasto = escondido(bush, () => put(foe, bush.c, bush.r));

  // --- Marca: con el rival a la vista apunta a él ---
  reset();
  put(p, open.c, open.r);
  put(foe, open.c, open.r - 5);
  step(2);
  m.yaw = ang(foe) + 0.5;
  step();
  out.marca = { rivalALaVista: m.markTgt === foe, aroVisible: document.getElementById('aimmark').style.display === 'block' };

  // --- Con mouse no cambia nada ---
  inp.setTouch(false);
  reset();
  put(p, open.c, open.r);
  put(foe, open.c, open.r - 5);
  step(2);
  m.yaw = ang(foe);
  const conMouseSobre = turn(40);
  m.yaw = ang(foe) + 1.2;
  const conMouseLibre = turn(40);
  m.yaw = ang(foe) - 0.2;
  const ym = m.yaw;
  inp.fire = true;
  step(30);
  inp.fire = false;
  out.mouse = { proporcion: +(conMouseSobre / conMouseLibre).toFixed(2), giroAlDisparar: +Math.abs(m.yaw - ym).toFixed(4), marca: m.markTgt !== null };
  return out;
}, { vista: o.vista });

console.log(JSON.stringify(r, null, 1));
const fallas = [];
const check = (ok, msg) => { if (!ok) fallas.push(msg); };
check(r.friccion_no.proporcion > 0.98, 'apagada no debería frenar el giro');
check(Math.abs(r.friccion_suave.proporcion - 0.6) < 0.05, 'suave debería dejar 60 % del giro sobre un rival');
check(Math.abs(r.friccion_fuerte.proporcion - 0.4) < 0.05, 'fuerte debería dejar 40 % del giro sobre un rival');
for (const n of ['suave', 'fuerte']) {
  const i = r['iman_' + n];
  check(Math.abs(i.angulo.at(-1)) < Math.abs(i.angulo[0]) * 0.5, `el imán ${n} debería acercar la mira al rival`);
  check(i.mayorPasoPorCuadro < 0.02, `el imán ${n} no debería saltar (paso máximo ${i.mayorPasoPorCuadro} rad)`);
  check(i.giroQuietoSinAtacar < 1e-6, `el imán ${n} no debería tirar quieto y sin atacar`);
}
for (const k of ['detrasDeMuro', 'enElPasto']) {
  const e = r[k];
  check(k === 'enElPasto' ? !e.visible : !e.tiroLibre, `${k}: la prueba no armó bien el escondite`);
  check(Math.abs(e.giro - r.friccion_no.sinRival) < 1e-4, `${k}: no debería frenar el giro`);
  check(e.giroDelIman < 1e-6, `${k}: el imán no debería tirar`);
  check(!e.marca, `${k}: no debería marcarlo`);
}
check(r.marca.rivalALaVista && r.marca.aroVisible, 'debería marcar al rival a la vista');
check(r.mouse.proporcion > 0.98 && r.mouse.giroAlDisparar < 1e-6 && !r.mouse.marca, 'con mouse no debería haber ayuda');
await cerrar();
if (errores.length) fallas.push(`${errores.length} errores en la consola:\n` + errores.slice(0, 5).join('\n'));
console.log(fallas.length ? '\nFALLAS:\n- ' + fallas.join('\n- ') : '\nok: fricción, imán y escondidos se comportan como se espera');
process.exit(fallas.length ? 1 : 0);
