# Tu Zanja 3D

Juego de navegador: arena 3 contra 3 en 3D con three.js y Vite, sin framework. Un jugador y cinco bots; gana el equipo que junta 10 núcleos y los aguanta 15 segundos. Tres vistas: arriba (cenital), al hombro y primera persona. El `README.md` describe todo lo que hay; `INSTALAR.md`, cómo instalarlo.

## Comandos

- `npm run dev`: servidor de desarrollo (http://localhost:5173).
- `npm run build`: compila a `dist/`. Tiene que pasar antes de dar algo por terminado.
- `npm test`: juega una partida completa por personaje, sin ventana (`qa/partida.mjs`). Opciones: `npm test -- --heroe tajo --vista primera --segundos 300`. Sale con código 1 si una partida no termina o hay errores en la consola.
- `npm run qa`: capturas del menú y de las tres vistas en `qa/out/` (`qa/capturas.mjs`). Mirarlas es la forma de verificar cambios visuales.
- `node qa/punteria.mjs [--vista hombro]`: mide la ayuda de puntería en táctil y sale con código 1 si la fricción, el imán o el filtro de escondidos no dan lo esperado.
- `node qa/minimapa.mjs`: capturas del minimapa redondo girado hacia cuatro lados y de la marca de puntería, en escritorio y celular.
- `node qa/armas.mjs [--heroe brasa,pompa] [--calidad alta] [--celular]`: capturas en primera persona de cada arma quieta, caminando, atacando y en tres momentos de la súper, con la partida congelada en cada instante. Cada captura tarda más de medio minuto.
- No edites archivos de `src/` mientras corre una prueba: Vite recarga la página y la prueba se corta.
- Las pruebas necesitan `npx playwright install chromium` la primera vez. Renderizan por software: son lentas y no miden rendimiento. Correlas de a una: varias a la vez chocan en la caché de Vite (`EPERM` en `node_modules/.vite`).

## Dónde está cada cosa

- `src/data.js`: reglas, personajes (vida, ataques, súper) y mapa. Casi todo lo ajustable del juego.
- `src/match.js`: la partida: combate, núcleos, reglas, cámara de las tres vistas, efectos de golpes y muertes.
- `src/ai.js`: bots. `src/world.js`: arena (colisiones en grilla 2D y escenario). `src/physics.js`: escombros.
- `src/models.js`: personajes 3D. Cinco se arman desde su hoja de arte (`src/perfiles/*.json`, `src/tajo-perfil.json`); Zip es de formas simples.
- `src/viewmodel.js`: brazos y armas de la primera persona. Usa piezas de un segundo cuerpo del personaje (los brazos, o los accesorios de `r.acc`) colgadas de la cámara en un grupo achicado. Ese cuerpo tiene una luz mínima propia (`uLift` de `heroUniforms`, en `src/shaders.js`).
- Lo que pasa cerca del ojo: `nearFade` en `src/fx.js` achica partículas, humo y halos; `NEAR_K`, `NEAR_BIG`, `OWN_HALO` y `fx.ownShot` en `src/match.js` hacen nacer chico y apagado lo que dispara uno en primera persona.
- `src/shaders.js` y `src/gfx.js`: shaders propios, posprocesado y niveles de calidad.
- `src/looks.js`: el look de cada vista (exposición, luces, niebla, color, borde de luz). `Match.applyLook` mezcla el de la vista anterior con el nuevo y `Gfx.setLook` aplica la parte de color.
- `src/settings.js`: configuración (valores por defecto y la lista de controles de la pantalla). `src/ui.js`: interfaz en DOM. `src/input.js`: teclado, mouse (con captura en las vistas con cámara propia) y táctil.
- `arte/`: scripts de Python que generan `public/arte/` y los perfiles desde `arte/originales/`.

## Cómo está pensado

- El combate es 2D sobre la grilla: disparos, colisiones y visibilidad no dependen de la altura. Lo 3D es visual. En las vistas al hombro y en primera persona la puntería sigue siendo sobre el piso.
- `window.__trifulca` expone la partida, la configuración y funciones (`startMatch`, `setSetting`, `setQuality`) para las pruebas. `match.update(1 / 60)` avanza la simulación a mano.
- Configuración nueva: agregar el valor en `DEFAULTS` y el control en `SECTIONS` de `src/settings.js`; se aplica en `applySettings` de `src/main.js` y de `Match`.

## Convenciones

- Textos del juego, comentarios, commits y documentación en español rioplatense (voseo), en oraciones simples.
- Los comentarios explican el porqué, no repiten el código.
- No agregar dependencias sin necesidad: hoy la única es `three`.
- `INSTRUCCIONES_DEL_PROYECTO.md` es de un proyecto anterior del repo (una landing con scroll); no aplica.

## Estado

- El pull request #1 (rama `claude/busy-gauss-lwcnlr`) está fusionado en `main`, que Netlify publica en https://testdescroll.netlify.app/. El trabajo nuevo va en ramas aparte con su propio pull request, que Netlify publica como vista previa.
- Cambio de estilo en curso, en la rama `claude/estilo-realista`: primera persona realista, al hombro colorida, desde arriba brillante y legible. Hecho: un look de luz y color por vista (`src/looks.js`). Sigue: rehacer los seis personajes con aspecto realista (con arte nuevo generado en ChatGPT) y después el escenario, que todavía se ve de cubos.
- Modo en primera persona, en cinco etapas, todas hechas: 1 (cámara y controles), 2 (arena alta, cielo, horizonte), 3 (armas vistas en primera persona y arco punteado de los ataques por el aire), 4 (minimapa redondo que gira con la cámara y ayuda de puntería en táctil: fricción, imán y marca, con opción en Controles táctiles) y 5 (ajuste fino: lo que pasa pegado al ojo se achica y se apaga, lo que dispara uno nace chico y apagado, la luz de la súper propia va más adelante y más suave, y el arma tiene una luz mínima propia; los puños de Brasa van más altos y con la lava más encendida).
- Falta probarlo en un celular y con una placa de video de verdad: las pruebas renderizan por software y no miden rendimiento ni cómo se siente la ayuda de puntería.
