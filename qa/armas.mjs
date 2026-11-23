// Capturas de las armas en primera persona: quieto, caminando, atacando y tres momentos de la
// súper, con la partida congelada en cada instante. Quedan en qa/out/armas-<heroe>-<toma>.png.
// Uso: node qa/armas.mjs  ·  node qa/armas.mjs --heroe brasa,pompa --tomas quieto,super-2 --calidad alta --celular
import { mkdirSync } from 'node:fs';
import { abrir, args } from './comun.mjs';

const o = args({ heroe: 'todos', tomas: 'todas', calidad: 'media', celular: false });
const heroes = o.heroe === 'todos' ? ['tuerca', 'brasa', 'nox', 'pompa', 'zip', 'tajo'] : o.heroe.split(',');
const tam = o.celular ? { ancho: 390, alto: 844, tactil: true } : { ancho: 1280, alto: 720 };
const disp = o.celular ? 'celular' : 'escritorio';
mkdirSync('qa/out', { recursive: true });
const { page, url, errores, cerrar } = await abrir(tam);
// Toma: qué hacer y cuántos cuadros avanzar antes de congelar.
const TOMAS = [
  ['quieto', 'nada', 60],
  ['caminando', 'caminar', 40],
  ['ataque', 'ataque', 5],
  ['super-1', 'super', 3],
  ['super-2', 'super', 10],
  ['super-3', 'super', 22],
].filter(([t]) => o.tomas === 'todas' || o.tomas.split(',').includes(t));
for (const heroe of heroes) {
  await page.goto(url + '?q=' + o.calidad, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  for (const [i, [toma, accion, cuadros]] of TOMAS.entries()) {
    await page.evaluate(({ heroe, accion, cuadros, primera }) => {
      const T = window.__trifulca;
      if (primera) {
        T.setSetting('view', 'primera');
        T.startMatch(heroe);
        const m = T.match;
        while (m.state !== 'play') m.update(1 / 60);
        for (const f of m.fighters) { f.bot = null; f.mvx = f.mvz = 0; }
        // Lejos de los rivales y mirando hacia el centro de la arena.
        m.fighters.filter((f) => f.team === 1).forEach((f, i) => { f.x = -8 + i * 8; f.z = -14; });
      }
      const m = T.match, p = m.player, w = m.world;
      delete m.update; // descongela
      p.hp = p.maxHp;
      p.ammo = 3;
      // Mira hacia el lado más despejado, para que lo disparado se vea en vuelo y no contra un muro.
      if (primera) {
        let best = 0, bd = 0;
        for (let a = 0; a < Math.PI * 2; a += 0.05) {
          const d = w.rayShot(p.x, p.z, Math.sin(a), Math.cos(a), 30);
          if (d > bd + 0.01) { bd = d; best = a; }
        }
        m.yawQA = best;
      }
      m.yaw = m.yawQA;
      m.pitch = -0.1;
      // Un cuadro para que la cámara (y el arma que cuelga de ella) mire hacia ahí antes de
      // disparar: si no, lo disparado sale de donde estaba el arma antes de girar.
      m.update(1 / 60);
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      T.input.move.x = T.input.move.z = 0;
      if (accion === 'ataque') m.tryAttack(p, fx, fz, p.def.attack.range * 0.8);
      if (accion === 'super') { p.super = 1; m.trySuper(p, fx, fz, p.def.super.range * 0.8); }
      // Caminar hacia adelante: con teclado en escritorio y con la palanca en táctil.
      if (accion === 'caminar') { T.input.keys.add('KeyW'); T.input.move.z = -1; }
      for (let i = 0; i < cuadros; i++) m.update(1 / 60);
      T.input.keys.delete('KeyW');
      T.input.move.z = 0;
      m.update = () => {}; // congela: el bucle sigue dibujando este instante
    }, { heroe, accion, cuadros, primera: i === 0 });
    await page.waitForTimeout(1800);
    // El render por software tarda: cada captura puede llevar más de medio minuto.
    await page.screenshot({ path: `qa/out/armas-${disp}-${heroe}-${toma}.png`, timeout: 120000 });
  }
  console.log(`${heroe}: capturas en qa/out/armas-${disp}-${heroe}-*.png`);
}
await cerrar();
if (errores.length) console.log(`\n${errores.length} errores en la consola:\n` + errores.slice(0, 5).join('\n'));
