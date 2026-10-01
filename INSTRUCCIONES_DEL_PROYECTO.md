# INSTRUCCIONES_DEL_PROYECTO — Landing de prueba: el scroll maneja el vuelo

> Fuente de verdad de este repo. Claude Code: releé este archivo al arrancar cada fase y después de cualquier compactación de contexto. Si existe `MODELO_DE_TRABAJO.md`, manda en lo metodológico; este archivo define qué se construye.
> Origen: `Drone_flying_into_modern_office_20260928000400.mp4`, analizado el 2026-10-01.

## 1. Objetivo

Landing donde el scroll maneja un vuelo de drone de 8 s: cielo → torre de vidrio → oficina → monitor. El video avanza y retrocede con el scroll (no hay autoplay). Al final el monitor se enciende con la marca y la cámara "entra" a la pantalla, que empalma con el resto de la página.

Terminado = Definition of Done (sección 11) completa, con evidencia.

## 2. Protocolo (obligatorio)

Federico decide y aprueba; Claude Code ejecuta. Una fase por vez, una variable por vez.

En cada fase:

1. **Plan**, sin escribir archivos (se permiten comandos de solo lectura: listar, contar, medir): archivos a crear o tocar, riesgo (bajo / medio / alto) y por qué, cómo se verifica, comando exacto de rollback.
2. **Esperar** "OK fase N" de Federico.
3. **Implementar** solo el alcance de la fase. Lo que aparezca fuera de alcance se anota en el reporte; no se arregla.
4. **Verificar** contra la checklist de la fase y armar el reporte.
5. **STOP.** Commit `fase-N: <resumen>` y tag `gate-N` solo con OK explícito.

Plantilla del reporte:

```
## Gate N — <nombre>
Cambios: <archivos>
| Check | Esperado | Medido | ✓/✗ |
Evidencia: qa/out/fase-N/...
Observaciones / riesgos nuevos:
Rollback: <comando>
Pido: OK para commit "fase-N: …" + tag gate-N
```

Prohibido sin OK explícito: commits, `git reset --hard`, borrar o modificar archivos del kit (`public/frames/`, `src/data/`, `src/lib/`, `tests/`, `tools/`), instalar dependencias no listadas acá y correr `npm create vite` (en una carpeta con archivos ofrece borrarlos).

## 3. Hechos medidos

No re-medir salvo que cambie el video.

**Video original** (1920×1080, 24 fps, 8,0 s, 192 frames, H.264 High con B-frames, audio AAC estéreo, 11,93 MB):

- Un solo keyframe (frame 0) en 192 frames y el índice (`moov`) al final del archivo. Benchmark de seek con ffmpeg (1 hilo): +1680 ms promedio por salto (máx. 2699 ms); re-encodeado all-intra: +5 ms (máx. 19 ms). **El MP4 original no se usa en la página.**
- Monitor en chroma verde, visible de f034 a f191. Entre f036 y f055 (salvo f042) la carpintería de la ventana lo parte en dos. Ancho de la pantalla: f096 = 192 px, f120 = 518 px, f150 = 816 px, f191 = 927 px (48,3 % del cuadro). Quad final ≈ TL(496,118) TR(1423,119) BR(1423,659) BL(496,659): casi frontal, aspecto 1,714.
- Jitter de esquinas desde f060 (antes de suavizar): p95 1,0 px, máx. 2,0 px.
- En 390×844 con `cover` se ve el 26 % del ancho (x 710–1210): el monitor final (x 496–1423) quedaría visible al 54 %.

**Kit** (generado con `tools/prepare_frames.py`; reporte en `tools/assets-report.json`):

| Set | Frames | Peso total | Pasada gruesa (1 de cada 8) | f000 | Frame más pesado |
|---|---|---|---|---|---|
| `public/frames/v1/1920` (1920×1080, WebP q75) | 192 | 15,78 MB | 1,96 MB | 117 KB | 253 KB |
| `public/frames/v1/1280` (1280×720, WebP q75) | 192 | 8,98 MB | 1,10 MB | 62 KB | 135 KB |

- Pantalla "apagada" (gris oscuro con leve degradé + despill de bordes): 0 px de verde residual en los 192 frames.
- `src/data/screen-quads.json`: esquinas por frame (orden TL, TR, BR, BL), suavizadas con media móvil de 5 frames, en px del espacio 1920×1080 para los dos sets; `null` donde no hay pantalla; `splitByWindowFrame` lista los frames partidos.
- `src/lib/quad-math.js`: `quadToMatrix3d()` y `srcToView()`. `node tests/quad-math.test.mjs` → error máx. 2,5e-13 px en 316 casos (158 frames × 2 encuadres).

## 4. Decisiones (con lo descartado)

| Decisión | Por qué (medido) | Descartado |
|---|---|---|
| Canvas + secuencia WebP | El canvas y la pantalla HTML usan el mismo índice de frame en el mismo rAF: sincronía exacta. Con la pasada gruesa (1,96 / 1,10 MB) el scrub ya es usable. | `<video>` all-intra: más liviano (12,28 / 6,31 MB), pero el frame presentado llega asíncrono al seek (la pantalla HTML "flotaría") y es fluido recién con todo el archivo en buffer. |
| Scroll nativo + `position: sticky` + suavizado propio | El progreso de una sección sticky es una resta; no hace falta librería. | GSAP/ScrollTrigger, Lenis (scroll-jacking). |
| Set por viewport: `(max-width: 900px)` o Save-Data → 1280; si no → 1920 | 8,98 vs 15,78 MB en datos móviles. | 1920 en todos lados. |
| Encuadre `cover` + apertura final hacia el monitor donde `cover` no alcanza | Sin esto, en 390×844 el monitor final se ve al 54 %. | Video vertical aparte (mejor en celular, pero exige otra generación y otro set). |
| Vite vanilla, sin framework | Una sola página, sin estado. | React / Next. |

## 5. Estructura del repo

```
/
├─ INSTRUCCIONES_DEL_PROYECTO.md
├─ index.html
├─ package.json                 "type": "module"
├─ public/frames/v1/1920/f000.webp … f191.webp    (kit, no tocar)
├─ public/frames/v1/1280/f000.webp … f191.webp    (kit, no tocar)
├─ src/
│  ├─ main.js                   arranque
│  ├─ scrub.js                  loader + loop de render + encuadre
│  ├─ screen.js                 Fase 2: pantalla HTML
│  ├─ content.js                todos los textos y rangos de frames
│  ├─ style.css
│  ├─ lib/quad-math.js          (kit, verificado)
│  └─ data/screen-quads.json    (kit)
├─ tests/quad-math.test.mjs     (kit)
├─ qa/capture.mjs               Playwright: capturas + métricas
├─ tools/prepare_frames.py      (kit) regenera frames y esquinas
├─ tools/assets-report.json     (kit) mediciones del kit
└─ source/                      video original (en .gitignore)
```

- `.gitignore`: `node_modules/`, `dist/`, `qa/out/`, `source/`.
- Scripts: `dev: vite` · `build: vite build` · `preview: vite preview` · `test: node tests/quad-math.test.mjs` · `qa: node qa/capture.mjs`.

## 6. Dirección visual

- Lo único protagonista es el vuelo. Todo lo demás, callado. No usar: cards, degradés decorativos, entradas fade + slide por sección, rótulos en mayúsculas sobre los títulos, una palabra destacada en otro color dentro de un titular, "→" en botones, tipografía monoespaciada para etiquetas.
- Paleta sacada del propio video:

| Token | Valor | Origen / uso |
|---|---|---|
| `--ink` | `#F4F6F8` | texto sobre el video |
| `--scrim` | `16 19 24` (rgb) | degradé de legibilidad detrás del texto; nunca cajas |
| `--glass` | `#6F8696` | vidrio de la torre: foco visible, detalles |
| `--oak` | `#A8774C` | madera del escritorio: uso mínimo |
| `--screen-bg` | `#F3F5F7` | monitor encendido = fondo de la sección siguiente |
| `--screen-ink` | `#14181D` | texto sobre `--screen-bg` |

- Tipografía: una sola familia, **Archivo** (Google Fonts, variable con ejes de ancho y peso). Titulares angostos (`wdth` ≈ 75, `wght` 600, tracking −0,01em), que repiten la verticalidad de las torres; texto en ancho normal (`wdth` 100, `wght` 400). Escala: 14 / 18 / 24 / 36 / 48 / 72 px. Titular de beat 48 px (36 en mobile), cuerpo 18 px con interlineado 1,5, líneas de ≤ 60 caracteres. Siempre sentence case.
- Layout: los textos de los beats van abajo a la izquierda en desktop (margen 64 px, titular de ≤ 28ch) y abajo a todo el ancho en mobile (margen 20 px). El centro del cuadro queda libre: ahí pasa la acción.
- Piso de calidad: contraste ≥ 4,5:1 del cuerpo en el peor frame (nubes blancas), foco visible, `prefers-reduced-motion` respetado, CLS = 0.

## 7. Fases

### Fase 0 — Setup y verificación del kit · riesgo bajo

Alcance:

- Verificar el kit (solo lectura): 192 archivos por set, nombres `f000`–`f191` contiguos, dimensiones 1920×1080 y 1280×720, pesos ±1 % de la tabla de la sección 3, JSON válido con 192 entradas en `screen`, `screen[33] === null`, `screen[34] !== null`, `screen[191]` = quad final ±1 px, `splitByWindowFrame` = 36–55 sin el 42.
- `package.json` a mano (sección 5), `npm i -D vite @playwright/test`, `npx playwright install chromium webkit`.
- `npm test` (requiere `"type": "module"`).
- `index.html` mínimo, `src/main.js`, `src/style.css` y `src/content.js` con los textos de la sección 9.
- `qa/capture.mjs`: levanta su propio servidor de Vite (API `createServer`) en un puerto libre y abre `/?debug=1` en tres configuraciones: (a) Chromium 1440×900, (b) Chromium 390×844 móvil, (c) WebKit 390×844 móvil (`isMobile`, `hasTouch`, DPR 3). Scrollea a los progresos 0 / 0,25 / 0,5 / 0,75 / 1 del vuelo, espera `window.__scrub.settled`, guarda capturas en `qa/out/fase-N/` y un `metrics.json` (estado de `__scrub`, marcas de performance, long tasks). Acepta frames puntuales para fases posteriores. En esta fase solo tiene que correr sin errores sobre la página vacía.
- `git init` + `.gitignore`.
- En el plan, preguntarle a Federico marca y textos reales, o si quedan los placeholders.

Fuera de alcance: cualquier lógica de scrub.

Checklist: tabla esperado/medido del kit · `npm test` OK · `npm run dev` levanta · `npm run qa -- 0` termina sin errores.

Rollback: borrar `package.json`, `package-lock.json`, `node_modules/`, `index.html`, `src/main.js`, `src/style.css`, `src/content.js`, `qa/`, `.git/`. El kit no se toca.

### Fase 1 — Scrub del vuelo · riesgo bajo-medio

Alcance:

- Estructura: `section.flight` con `height: calc(var(--video-len) + var(--dive-len) + 100lvh)`, `--video-len: 400lvh`, `--dive-len: 0lvh` (se usa en la Fase 3). Adentro, `div.stage` con `position: sticky; top: 0; height: 100vh; height: 100lvh; overflow: hidden`, que contiene `canvas.backdrop`, `canvas.frame` (`role="img"` + `aria-label` que describa el vuelo) y la capa de beats.
- Progreso, en cada scroll o resize:

  ```js
  const r = flight.getBoundingClientRect();
  const p = clamp(-r.top / (r.height - stage.offsetHeight), 0, 1); // nunca innerHeight cacheado
  const target = p * 191;
  ```

- Suavizado por tiempo (igual a 60 y 120 Hz): `cur += (target - cur) * (1 - Math.exp(-dt / 90))`, con `dt` en ms. Se dibuja el frame cargado más cercano a `Math.round(cur)`. Dibujar solo si cambió el frame o el encuadre. El rAF se apaga cuando `|target - cur| < 0.01` y se reactiva con el próximo scroll o resize.
- Loader: primero `f000`, que se dibuja apenas llega (poster y LCP); después pasadas con paso 8 → 4 → 2 → 1, como máximo 6 pedidos en paralelo, y `await img.decode()` antes de marcar cada frame como cargado. Marcas `performance.mark('frame0' | 'coarse' | 'all')`. Usar `HTMLImageElement`; no crear `ImageBitmap` de todos los frames (192 × 8,3 MB decodificados = 1,6 GB en el set 1920).
- Canvas: tamaño en px de dispositivo = px CSS × `min(devicePixelRatio, 2)`. `ResizeObserver` con debounce de 100 ms; en pantallas táctiles, ignorar cambios que sean solo de alto y menores al 15 % (barra del navegador).
- Encuadre `{ s, cx, cy, vw, vh }` (s = px CSS por px fuente; (cx, cy) = punto fuente que queda en el centro del viewport):

  ```js
  const sCover = Math.max(vw / 1920, vh / 1080);
  let s = sCover;
  const q = quads.screen[f]; // null si no hay pantalla
  if (q) {
    const { w, h } = bbox(q);
    const k = lerp(0.70, 0.88, smoothstep(clamp((f - 96) / 95, 0, 1)));
    s = Math.min(sCover, (k * vw) / w, (0.62 * vh) / h);
  }
  // foco: s >= sCover → centro (960, 540), recortado para que el cuadro siga cubriendo el viewport
  //       s <  sCover → mezcla hacia el centro de la pantalla con t = clamp((sCover - s) / (0.15 * sCover), 0, 1)
  ```

  - Dibujar solo el rectángulo fuente visible (`drawImage` de 9 argumentos), escalando por `img.naturalWidth / 1920` para el set 1280.
  - Backdrop: si `s < sCover`, `canvas.backdrop` a ~1/10 de resolución con el mismo frame en `cover`, CSS `filter: blur(18px) brightness(.85)`, opacidad = `t`. Si no, oculto.
  - Resultado esperado: en desktop 16:9 y 16:10 el encuadre es `cover` todo el tiempo; en 390×844, en f191, `s ≈ 0,370` y la pantalla mide ≈ 343 px de ancho.
- Beats (`content.js`): 4 bloques con `from`/`to` en frames; solo opacidad, con rampa de 8 frames; scrim degradado detrás. El beat D (f160–f191) lleva marca y CTA.
- `?debug=1`: HUD con frame dibujado, objetivo, cargados, set, `s` y fps. `window.__scrub = { frame, target, cur, settled, loaded, set, s }` expuesto siempre (lo usa el QA).

Fuera de alcance: pantalla HTML, entrada a la pantalla, sección siguiente (alcanza un bloque de 100vh para poder terminar de scrollear).

Checklist:

- p = 0 → `__scrub.frame === 0`; p = 1 → `191`. Ida y vuelta rápida sin frames vacíos ni flashes.
- Capturas 5 progresos × 3 configuraciones: ninguna muestra verde; en 390×844, la pantalla de f191 entra entera (≤ 88 % del ancho).
- WebKit (c) y Chromium (b) dan el mismo `frame` y `s` en cada progreso.
- Marcas `frame0`, `coarse` y `all` presentes. Corrida con throttling en Chromium (CDP `Network.emulateNetworkConditions`: 9 Mbps de bajada, 150 ms de RTT, caché desactivada) en (a) y (b): reportar tiempos medidos. Por cálculo (peso / ancho de banda + rondas de RTT), `coarse` ≈ 2,6 s con el set 1920 y ≈ 1,8 s con el 1280.
- Barrido automático 0 → 1 en 3 s, después de `all`: 0 long tasks > 50 ms (PerformanceObserver `longtask`, Chromium).
- Contraste del cuerpo ≥ 4,5:1, medido muestreando píxeles detrás del texto en la captura de p = 0.
- Prueba manual de Federico: `npm run dev -- --host` y abrir en el celular la IP de red que muestra Vite.

Rollback: `git reset --hard gate-0` (con OK).

### Fase 2 — Monitor encendido · riesgo medio

Alcance:

- `div.screen` con lienzo de diseño 1200×700 (aspecto del quad final): `position: absolute; left: 0; top: 0; transform-origin: 0 0`, y `transform = quadToMatrix3d(1200, 700, q.map(([x, y]) => srcToView(x, y, encuadre)))`.
- Regla de oro: el mismo `f` entero que se dibujó en el canvas y el mismo objeto de encuadre. Nunca interpolar quads.
- Visibilidad: `visibility: hidden` antes de f096 (en f036–f055 está partida por la ventana y antes de f096 mide menos de 192 px); de f096 a f120 se "enciende" (opacidad 0 → 1 con un leve brillo).
- Es visual: `aria-hidden="true"`, sin foco ni clicks. En 390×844 se ve a 0,29× del lienzo, así que lleva solo marca, un titular de ≥ 110 px y un botón dibujado; nada de texto de cuerpo. El CTA accesible sigue siendo el beat D, que pasa a tener solo el botón.
- Contenido desde `content.js`, fondo `--screen-bg`.

Fuera de alcance: la entrada a la pantalla.

Checklist: `npm test` OK · capturas en f096, f120, f150 y f191 en 1440×900, 390×844 y 820×1180, con recortes 4× de las 4 esquinas: ninguna franja de pantalla apagada visible > 2 px · la pantalla nunca aparece sobre la ventana · 0 long tasks > 50 ms en el barrido.

Rollback: `git reset --hard gate-1`.

### Fase 3 — Entrada a la pantalla + sección siguiente · riesgo medio

Alcance:

- `--dive-len: 100lvh`. El progreso se divide en vuelo (`--video-len`) y entrada (`--dive-len`). Durante la entrada el frame queda fijo en f191 y la escala va de la final a `sDive = 1.04 * Math.max(vw / 927, vh / 541)` con easeInCubic, con el foco convergiendo al centro de la pantalla (959,5; 388,5) sin romper el recorte de cobertura. Esperado: `sDive` ≈ 1,73 en 1440×900 y ≈ 1,62 en 390×844.
- El beat D se desvanece al empezar la entrada. El contenido de la pantalla se desvanece en el último 40 % y queda solo `--screen-bg` cubriendo el viewport. La sección siguiente arranca con el mismo fondo: el empalme no se ve.
- Sección siguiente: 2 bloques de texto + CTA final, en columna izquierda de ≤ 60ch, flujo normal.

Checklist: al terminar la entrada, 5 puntos de muestreo de la captura (4 esquinas + centro) = `--screen-bg` ±2 por canal · capturas a ±20 px del fin de la sección sticky sin salto visible · ida y vuelta sin desfasaje de la pantalla.

Rollback: `git reset --hard gate-2`.

### Fase 4 — Pulido, accesibilidad, QA final y preview · riesgo bajo

Alcance:

- `prefers-reduced-motion: reduce` → sin scrub: f000, f048, f120 y f191 como imágenes estáticas en flujo, con sus textos; pantalla fija sobre f191 (mismo `srcToView`, con `s` = ancho renderizado / 1920).
- Sin JS: f191 de fondo + textos.
- `<title>`, meta description, `og:image` 1200×630 (recorte de f191 en JPG).
- Caché: `/frames/*` con `Cache-Control: public, max-age=31536000, immutable` (Vercel: `vercel.json`; Netlify: `public/_headers`). Si cambian los frames se publica una carpeta nueva (`v2`); nunca se pisan.
- Lighthouse mobile sobre el preview: reportar Performance, LCP, CLS y TBT.
- Deploy de preview en Vercel o Netlify (el que elija Federico).

Checklist: CLS = 0 · el LCP es f000 · reduced-motion verificado con emulación en Playwright · foco visible en todos los CTA · preview accesible por URL · checklist de dispositivos de la sección 11 completa por Federico.

Rollback: `git reset --hard gate-3`; en el hosting, volver al deploy anterior desde el panel.

## 8. Recetas

- Desarrollo: `npm run dev`. En el celular: `npm run dev -- --host` y abrir la IP de red que muestra Vite (misma Wi-Fi).
- Debug: agregar `?debug=1` a la URL.
- QA: `npm run qa -- <fase>` → `qa/out/fase-<fase>/`.
- Largo del recorrido: `--video-len` en `style.css` (300–500lvh; con 400lvh y un viewport de 900 px son ~19 px de scroll por frame).
- Textos y tiempos: `src/content.js` (24 frames = 1 s de video).
- Cambiar el video: copiarlo a `source/`, `pip install opencv-python numpy`, `python tools/prepare_frames.py source/<video>.mp4 --version v2`, revisar `tools/assets-report.json` (verde residual 0, primer frame con pantalla, frames partidos) y actualizar `framesPath` en el código, los hechos de la sección 3 y los rangos de `content.js`. Si el video nuevo no tiene pantalla verde, `screen` sale todo en `null` y la Fase 2 no aplica.

## 9. Textos placeholder

Se reemplazan en la Fase 0 si Federico pasa los reales.

```js
export const content = {
  brand: "[Marca]",
  beats: [
    { id: "A", from: 0, to: 26, title: "Todo empieza arriba.", body: "Seguí bajando." },
    { id: "B", from: 38, to: 74, title: "Después, lo importante se ve de cerca." },
    { id: "C", from: 86, to: 128, title: "Adentro es donde se hace el trabajo." },
    // en la Fase 2 el beat D queda solo con el cta
    { id: "D", from: 160, to: 191, title: "[Marca]", cta: { label: "Escribinos", href: "#contacto" } },
  ],
  screen: { title: "Lo que hacemos, en una pantalla.", button: "Escribinos" }, // Fase 2
  next: [ // Fase 3
    { title: "[Título 1]", body: "[Texto de dos líneas]" },
    { title: "[Título 2]", body: "[Texto de dos líneas]" },
  ],
  finalCta: { label: "Escribinos", href: "#contacto" },
};
```

## 10. Recuperación de fallas

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Canvas negro o 404 en frames | ruta o numeración | Se sirven desde `/frames/v1/<set>/fNNN.webp` (carpeta `public/`); revisar la pestaña Network. |
| El scrub va a saltos los primeros segundos | todavía no terminó la pasada gruesa | Es lo esperado hasta la marca `coarse`; si dura más, revisar orden de carga y concurrencia. |
| Tirones al scrollear | decodificación al dibujar, DPR sin tope, redibujo sin chequeo | `img.decode()` antes de marcar cargado; DPR ≤ 2; dibujar solo si cambió frame o encuadre; mirar long tasks. |
| iPhone: la página salta cuando se esconde la barra | `100vh` / `innerHeight`, o canvas redimensionado por la barra | `lvh` en el stage; progreso con `getBoundingClientRect`; ignorar cambios de alto < 15 % en táctil. |
| iPhone recarga la pestaña | memoria: bitmaps retenidos | `HTMLImageElement` en vez de `ImageBitmap`; si sigue, en mobile cargar 1 de cada 2 frames (96). |
| Se ve verde | frames sacados del MP4 original | Usar solo `public/frames/v1` o regenerar con `tools/prepare_frames.py`. |
| Pantalla HTML desalineada | encuadre distinto entre canvas y pantalla, mezcla de px de dispositivo y CSS, orden de esquinas, quad de otro frame | Un solo objeto de encuadre por frame; pantalla en px CSS; orden TL, TR, BR, BL; el mismo `f` que se dibujó. |
| La pantalla HTML aparece sobre la ventana | se mostró antes de f096 | Respetar la ventana de visibilidad de la Fase 2. |
| Texto de la pantalla borroso | lienzo chico escalado hacia arriba | Diseñar a 1200×700; `will-change: transform` solo mientras se mueve. |
| `SyntaxError: Cannot use import statement` en `npm test` | falta `"type": "module"` | Agregarlo en `package.json`. |
| Google Fonts devuelve 400 | rangos de ejes mal en la URL | Copiar la URL exacta desde fonts.google.com (Archivo, ejes `wdth` y `wght`). |
| `npm create vite` ofrece borrar archivos | carpeta con el kit | Cancelar; setup manual de la Fase 0. |
| Playwright no baja navegadores | permisos o red | Reintentar `npx playwright install chromium`; si WebKit falla en Windows, seguir con Chromium y anotarlo en el reporte. |
| Frames viejos después de regenerar | caché `immutable` | Publicar en carpeta nueva (`v2`) y actualizar `framesPath`. |
| `prepare_frames.py`: "No encuentro ffmpeg" | ffmpeg fuera del PATH | Windows: `winget install Gyan.FFmpeg` y reabrir la terminal; macOS: `brew install ffmpeg`. |

## 11. Definition of Done

- [ ] Gates 0 a 4 aprobados, con evidencia en `qa/out/`.
- [ ] Scrub ida y vuelta sin frames vacíos en Chrome, Safari y Firefox de escritorio.
- [ ] iPhone con Safari (real): sin saltos con la barra, sin recarga de pestaña, monitor final entero.
- [ ] Android con Chrome (real): ídem.
- [ ] 0 px de verde en todas las capturas.
- [ ] `prefers-reduced-motion` y sin-JS funcionan.
- [ ] Preview publicado, con caché de frames.
