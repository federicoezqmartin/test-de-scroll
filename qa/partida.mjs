// Juega partidas completas sin ventana y avisa si algo falla.
// Uso: npm test  ·  node qa/partida.mjs --heroe tajo --vista primera --segundos 300
//   --heroe   tuerca | brasa | nox | pompa | zip | tajo | todos (por defecto: todos)
//   --vista   arriba | hombro | primera (por defecto: arriba)
// Cada partida avanza la simulación a mano (60 pasos por segundo), así que dura poco aunque
// el render sea lento. Tu personaje lo maneja un piloto simple que va al centro y dispara.
import { abrir, args } from './comun.mjs';

const o = args({ heroe: 'todos', vista: 'arriba', segundos: '420', calidad: 'baja' });
const heroes = o.heroe === 'todos' ? ['tuerca', 'brasa', 'nox', 'pompa', 'zip', 'tajo'] : [o.heroe];
const { page, url, errores, cerrar } = await abrir();
let fallas = 0;
for (const heroe of heroes) {
  await page.goto(url + '?q=' + o.calidad, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const r = await page.evaluate(({ heroe, vista, segundos }) => {
    const T = window.__trifulca;
    T.setSetting('view', vista);
    T.startMatch(heroe);
    const m = T.match;
    for (let i = 0; i < segundos * 60 && m.state !== 'over'; i++) {
      if (m.state === 'play') {
        const p = m.player;
        let best = null, bd = 99;
        for (const e of m.fighters) {
          if (e.team === 0 || !e.alive || !e.visTo[0]) continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d < bd) { bd = d; best = e; }
        }
        p.mvx = best && bd < 7 ? 0 : -p.x;
        p.mvz = best && bd < 7 ? 0 : 2.5 - p.z;
        T.input.keys.clear();
        if (best && p.alive) {
          const ax = best.x - p.x, az = best.z - p.z, d = Math.hypot(ax, az) || 1;
          if (d < p.def.attack.range) m.tryAttack(p, ax / d, az / d, d);
          if (p.super >= 1 && d < p.def.super.range) m.trySuper(p, ax / d, az / d, d);
        }
      }
      m.update(1 / 60);
    }
    return { estado: m.state, tiempo: +m.time.toFixed(1), nucleos: m.score, gano: m.result?.won };
  }, { heroe, vista: o.vista, segundos: +o.segundos });
  const ok = r.estado === 'over';
  if (!ok) fallas++;
  console.log(`${ok ? 'ok  ' : 'MAL '} ${heroe.padEnd(7)} vista ${o.vista}: ${r.estado === 'over' ? `terminó a los ${r.tiempo} s, núcleos ${r.nucleos.join(' a ')}, ${r.gano ? 'ganó tu equipo' : 'ganó el rival'}` : `no terminó en ${o.segundos} s`}`);
}
await cerrar();
if (errores.length) console.log(`\n${errores.length} errores en la consola del navegador:\n` + errores.slice(0, 8).join('\n'));
process.exit(fallas || errores.length ? 1 : 0);
