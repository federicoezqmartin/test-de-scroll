// Capturas del minimapa redondo y de la marca de puntería, con la cámara girada hacia distintos
// lados, en escritorio y en celular (táctil). Quedan en qa/out/ (pantalla entera y el minimapa
// ampliado). Uso: node qa/minimapa.mjs  ·  node qa/minimapa.mjs --heroe nox
import { mkdirSync } from 'node:fs';
import { abrir, args } from './comun.mjs';

const o = args({ heroe: 'tuerca', calidad: 'media' });
mkdirSync('qa/out', { recursive: true });
for (const [nombre, tam] of [['escritorio', { ancho: 1440, alto: 900 }], ['celular', { ancho: 390, alto: 844, tactil: true }]]) {
  const { page, url, errores, cerrar } = await abrir(tam);
  await page.goto(url + '?q=' + o.calidad, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  // Partida en primera persona con los bots quietos y un rival adelante del jugador, a la vista.
  const base = await page.evaluate((heroe) => {
    const T = window.__trifulca;
    T.setSetting('view', 'primera');
    T.startMatch(heroe);
    const m = T.match, w = m.world, p = m.player;
    while (m.state !== 'play') m.update(1 / 60);
    for (const f of m.fighters) { f.bot = null; f.mvx = f.mvz = 0; }
    const free = (c, r) => c >= 0 && r >= 0 && c < w.W && r < w.H && w.type(c, r) === 0;
    let c0 = 10, r0 = 20;
    for (let r = 20; r < w.H - 2; r++) {
      const c = [10, 9, 11, 8, 12].find((c) => free(c, r) && free(c, r - 5) && w.shotClear(w.cx(c), w.cz(r), w.cx(c), w.cz(r - 5)));
      if (c !== undefined) { c0 = c; r0 = r; break; }
    }
    p.x = w.cx(c0); p.z = w.cz(r0);
    const foe = m.fighters.find((f) => f.team === 1);
    foe.x = w.cx(c0) + 0.6; foe.z = w.cz(r0 - 5);
    m.yaw = Math.atan2(foe.x - p.x, foe.z - p.z);
    for (let i = 0; i < 20; i++) m.update(1 / 60);
    return m.yaw;
  }, o.heroe);
  const tomas = [['primera', 0], ['primera', 90], ['primera', 180], ['primera', 270], ['hombro', 35]];
  for (const [vista, grados] of tomas) {
    await page.evaluate(({ vista, yaw }) => {
      const T = window.__trifulca;
      T.setSetting('view', vista);
      T.match.yaw = yaw;
      for (let i = 0; i < 30; i++) T.match.update(1 / 60);
      T.match.yaw = yaw;
    }, { vista, yaw: base + (grados * Math.PI) / 180 });
    await page.waitForTimeout(2500);
    const nom = `qa/out/minimapa-${nombre}-${vista}-${grados}`;
    await page.screenshot({ path: nom + '.png' });
    const box = await page.locator('#minimap').boundingBox();
    if (box) await page.screenshot({ path: nom + '-mapa.png', clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 }, scale: 'device' });
  }
  console.log(`${nombre}: capturas en qa/out/minimapa-${nombre}-*.png${errores.length ? ` · ${errores.length} errores:\n` + errores.slice(0, 5).join('\n') : ''}`);
  await cerrar();
}
