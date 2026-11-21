// Utilidades de las pruebas: levanta un servidor de Vite propio y abre Chromium sin ventana.
// El render es por software (SwiftShader) para que funcione igual en cualquier máquina;
// por eso es lento y no sirve para medir cuadros por segundo.
import { createServer } from 'vite';
import { chromium } from 'playwright';

export async function abrir({ ancho = 1440, alto = 900, tactil = false } = {}) {
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1, hasTouch: tactil, isMobile: tactil });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', (m) => {
    const t = m.text();
    if ((m.type() === 'error' || /THREE\.|shader/i.test(t)) && !/GPU stall|ReadPixels/.test(t)) errores.push(t.slice(0, 600));
  });
  page.on('pageerror', (e) => errores.push('Error de página: ' + e.message));
  const cerrar = async () => { await browser.close(); await server.close(); };
  return { page, url, errores, cerrar };
}

// Lee "--clave valor" de la línea de comandos.
export function args(defaults) {
  const out = { ...defaults }, a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) out[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  return out;
}
