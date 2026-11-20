# test-de-scroll

Repo de pruebas con IA. Ahora mismo la página es un juego: **Tu Zanja 3D**.

## Tu Zanja 3D

Arena 3 contra 3 con vista cenital, en 3D real (three.js), que corre en el navegador. Vos manejás un personaje; los otros cinco son bots.

**Objetivo:** el reactor del centro va soltando núcleos. El equipo que junte 10 y los aguante 15 segundos gana. Si te eliminan, se te caen todos los que llevabas.

**Mecánicas:** tres cargas de munición que se recargan solas, un súper que se carga haciendo daño, pasto alto para esconderse, muros que frenan los disparos, agua que frena el paso pero no los disparos, y vida que se regenera si dejás de pelear unos segundos.

**Personajes:**

| Personaje | Rol | Ataque | Súper |
|---|---|---|---|
| Tuerca (robot) | Tiradora | Ráfaga de 3 remaches | Esfera de plasma que atraviesa |
| Brasa (gólem de lava) | Tanque | Abanico de ascuas | Salto que aplasta la zona |
| Nox (lechuza) | Francotiradora | Dardo de largo alcance | Lluvia de estrellas en un área |
| Pompa (rana) | Lanzadora | Frasco que pasa sobre los muros | Charco tóxico |
| Zip (conejo ninja) | Asesino | Dos tajos cuerpo a cuerpo | Embestida instantánea |
| Tajo (zanjero con hacha) | Embestidor | Hachazo: se lanza hacia adelante cortando | Zanja en línea que daña, empuja y lo cura |

**Controles**

- Teclado y mouse: `WASD` o flechas para moverte, mouse para apuntar, clic para disparar, `Espacio` o clic derecho para el súper (mantené para ver a dónde va), `Esc` para pausar.
- Celular: palanca izquierda para moverte; el botón rojo dispara solo al rival más cercano si lo tocás, o apunta si lo arrastrás. El botón de súper funciona igual.

## Gráficos

- **Luz y sombras:** sol bajo con sombras largas y suaves, luz de relleno, reflejos de entorno, sombra de contacto bajo personajes y alrededor de muros y cajones.
- **Materiales:** relieve (normal maps) generado a partir de las texturas de arena, piedra, madera, acero, lava y plumas.
- **Shaders propios** (`src/shaders.js`): agua de las piletas con espuma y red de luz, mar con oleaje hacia la costa, pasto que se mueve con el viento y se abre al paso de los luchadores, borde de luz del color del equipo y destello de daño en los personajes, escudo, zonas de efecto e indicador de puntería.
- **Posprocesado** (`src/gfx.js`): oclusión ambiental, bloom, desenfoque leve de maqueta arriba y abajo, corrección de color, viñeta y grano.
- **Efectos:** humo y polvo, marcas de quemado, luces de destello en explosiones, polvo al caminar, motas en el aire, vapor del reactor.

Hay tres niveles, que se cambian desde el menú o la pausa:

| Nivel | Qué incluye |
|---|---|
| Alta | Todo: oclusión ambiental, bloom, desenfoque de maqueta, antialias 4x, sombras de 4096 |
| Media | Bloom, corrección de color, antialias liviano, sombras de 2048 |
| Baja | Sin posprocesado, sombras de 1024, menos partículas |

Arranca en Alta (Media en pantallas táctiles). Si durante la partida no llega a unos 27 cuadros por segundo, baja sola un nivel y avisa. Elegir un nivel a mano apaga ese ajuste. Para forzar uno desde la dirección: `?q=alta`, `?q=media` o `?q=baja`.

## Correrlo

```bash
npm install
npm run dev        # desarrollo
npm run build      # genera dist/
npm run preview    # sirve dist/
```

## Dónde está cada cosa

```
index.html        pantallas (menú, HUD, pausa, resultados)
src/main.js       arranque, vitrina 3D del menú, ciclo menú → partida → resultados
src/data.js       reglas, personajes y mapa (todo lo ajustable está acá)
src/match.js      partida: combate, núcleos, reglas, cámara
src/ai.js         bots: búsqueda de camino y decisiones
src/world.js      arena: colisiones y escenario
src/shaders.js    shaders propios (agua, mar, pasto, personajes, escudo, zonas)
src/gfx.js        niveles de calidad y posprocesado
src/models.js     personajes 3D armados con primitivas, con materiales del arte
src/assets.js     carga de las texturas de public/arte
src/fx.js         partículas, proyectiles, textos flotantes
src/audio.js      sonido sintetizado (no hay archivos de audio)
src/input.js      teclado, mouse y táctil
src/ui.js         interfaz en DOM
```

## Arte

El arte se generó con IA a partir de prompts y vive en dos carpetas:

- `public/arte/`: lo que usa el juego (alrededor de 1 MB). Texturas de arena, piedra, cajón y pasto; el núcleo y el logo recortados; las fichas de los personajes (`ficha-*.webp`) que se ven en el menú; los materiales `mat-*.webp` recortados de las hojas de personaje; y los mapas de relieve `*-n.webp`.
- `arte/referencias/`: copias reducidas de las imágenes originales, para seguir ajustando los modelos.

`arte/procesar_arte.py` es el script que convierte los originales en los archivos de `public/arte/` (necesita Python con Pillow y numpy, y los PNG originales en la carpeta que indica la variable `U`).

Los personajes dentro de la partida son modelos 3D hechos por código que imitan las hojas; no son las imágenes. Zip todavía no tiene hoja de arte y usa una foto de su modelo como retrato.

El sonido se sintetiza por código.

`INSTRUCCIONES_DEL_PROYECTO.md` es de la landing de scroll anterior y quedó como estaba.
