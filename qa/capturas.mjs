// Saca capturas del menú y de una partida en las tres vistas, en escritorio y en celular.
// Uso: npm run qa  ·  node qa/capturas.mjs --heroe nox --calidad alta
// Las imágenes quedan en qa/out/ (esa carpeta no se sube a git).
import { mkdirSync } from 'node:fs';
import { abrir, args } from './comun.mjs';

const o = args({ heroe: 'tuerca', calidad: 'media' });
mkdirSync('qa/out', { recursive: true });
for (const [nombre, tam] of [['escritorio', { ancho: 1440, alto: 900 }], ['celular', { ancho: 390, alto: 844, tactil: true }]]) {
  const { page, url, errores, cerrar } = await abrir(tam);
  await page.goto(url + '?q=' + o.calidad, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click(`.hero-btn[data-id=${o.heroe}]`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `qa/out/${nombre}-menu.png` });
  for (const vista of ['arriba', 'hombro', 'primera']) {
    await page.evaluate(({ heroe, vista }) => {
      const T = window.__trifulca;
      T.setSetting('view', vista);
      if (!T.match) T.startMatch(heroe);
      const m = T.match;
      for (let i = 0; i < 60 * 4; i++) m.update(1 / 60);
      m.yaw = Math.atan2(-m.player.x, -m.player.z); // mira hacia el centro de la arena
      for (let i = 0; i < 30; i++) m.update(1 / 60);
    }, { heroe: o.heroe, vista });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `qa/out/${nombre}-${vista}.png` });
  }
  console.log(`${nombre}: capturas en qa/out/${nombre}-*.png${errores.length ? ` · ${errores.length} errores:\n` + errores.slice(0, 5).join('\n') : ''}`);
  await cerrar();
}
