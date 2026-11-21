# test-de-scroll

Repo de pruebas con IA. Ahora mismo la página es un juego: **Tu Zanja 3D**.

## Tu Zanja 3D

Arena 3 contra 3 con vista cenital, en 3D real (three.js), que corre en el navegador. Vos manejás un personaje; los otros cinco son bots.

**Objetivo:** el reactor del centro va soltando núcleos. El equipo que junte 10 y los aguante 15 segundos gana. Si te eliminan, se te caen todos los que llevabas.

**Mecánicas:** tres cargas de munición que se recargan solas, un súper que se carga haciendo daño, pasto alto para esconderse, muros que frenan los disparos, cajones que frenan los disparos hasta que se rompen, agua que frena el paso pero no los disparos, y vida que se regenera si dejás de pelear unos segundos.

**Personajes:**

| Personaje | Rol | Ataque | Súper |
|---|---|---|---|
| Tuerca (robot) | Tiradora | Ráfaga de 3 remaches | Esfera de plasma que atraviesa |
| Brasa (gólem de lava) | Tanque | Abanico de ascuas | Salto que aplasta la zona |
| Nox (lechuza) | Francotiradora | Dardo de largo alcance | Lluvia de estrellas en un área |
| Pompa (rana) | Lanzadora | Frasco que pasa sobre los muros | Charco tóxico |
| Zip (conejo ninja) | Asesino | Dos tajos cuerpo a cuerpo | Embestida instantánea |
| Tajo (zanjero con hacha) | Embestidor | Hachazo: se lanza hacia adelante cortando | Zanja en línea que daña, empuja y lo cura |

**Vistas** (Configuración → Cámara, o la tecla V durante la partida):

- **Arriba:** la vista cenital de siempre.
- **Al hombro:** cámara detrás del personaje, sobre el hombro derecho.
- **Primera persona:** la cámara en los ojos del personaje; el cuerpo propio no se dibuja.

Al hombro y en primera persona la arena cambia para que lo que frena los disparos también tape la vista: los muros suben uno o dos bloques de piedra, los cajones se apilan de a dos y el pasto crece; en la vista de arriba todo vuelve a quedar bajo, para no tapar a los personajes. El cambio es animado. Arriba hay cielo con sol y nubes, y alrededor islas a lo lejos; el horizonte se funde con la niebla. Los nombres de los rivales que quedan detrás de un muro no se muestran.

Al hombro y en primera persona el mouse queda capturado para mirar (Esc lo suelta y pausa), hay una mira en el centro con la munición debajo, y moverse es relativo a hacia dónde mirás. La puntería sigue siendo sobre el piso, como en la vista de arriba: mirar arriba o abajo solo cambia a qué distancia caen los ataques en arco. Al morir la cámara pasa a la vista de arriba hasta que reaparecés. En celular se mira arrastrando en la mitad de la pantalla que no tiene la palanca, y tocar el botón de ataque dispara al rival que tengas adelante.

**Controles**

- Teclado y mouse: `WASD` o flechas para moverte, mouse para apuntar (o para mirar, al hombro y en primera persona), clic para disparar, `Espacio` o clic derecho para el súper (mantené para ver a dónde va), `V` para cambiar de vista, `Esc` para pausar.
- Celular: palanca izquierda para moverte; el botón rojo dispara solo al rival más cercano si lo tocás, o apunta si lo arrastrás. El botón de súper funciona igual.

## Interfaz de partida

- **Marcador:** diez casilleros por equipo que se van llenando, la meta y el reloj de la partida.
- **Tarjeta del jugador:** retrato, vida en números, munición y núcleos que llevás.
- **Paneles de equipo:** aliados y rivales con retrato, vida, núcleos y la cuenta para reaparecer. De un rival escondido se muestra lo último que se le vio.
- **Minimapa:** mapa, núcleos en el piso, aliados y los rivales que estén a la vista. Se actualiza cuando se rompe un cajón o se corta pasto.
- **Avisos:** bajas con retratos, rachas ("¡Doble baja!"), un arco rojo que marca de dónde vino el golpe, quién te eliminó y la mira del mouse.
- **Pausa:** tabla en vivo con bajas, daño y núcleos de los seis.

En celular la tarjeta, los paneles y el minimapa suben para dejar libres los pulgares.

## Configuración

Se abre desde el menú, la pausa o el engranaje del HUD, y se guarda en el navegador. Todo está definido en `src/settings.js` (valores por defecto y la lista de controles de la pantalla).

| Sección | Opciones |
|---|---|
| Juego | Tu nombre · dificultad de los bots (Fácil, Normal, Difícil) |
| Cámara | Vista (Arriba, Al hombro, Primera persona) · sensibilidad · campo de visión · invertir mirada vertical · distancia de cámara · temblor de cámara |
| Gráficos | Calidad (Auto, Baja, Media, Alta) · resplandor · desenfoque de maqueta · color de cine · sangre · cuadros por segundo |
| Sonido | Volumen · silenciar |
| Interfaz | Tamaño · minimapa · paneles de equipo · nombres · números de daño · aviso de dónde viene el daño · colores de equipo (azul y rojo, o azul y naranja para daltonismo) |
| Controles táctiles | Modo zurdo · tamaño de los botones |

La dificultad, el nombre y el color de equipo en el 3D se aplican al empezar la próxima partida; el resto cambia al instante.

## Gráficos

- **Luz y sombras:** sol bajo con sombras largas y suaves, luz de relleno, reflejos de entorno, sombra de contacto bajo personajes y alrededor de muros y cajones.
- **Materiales:** relieve (normal maps) generado a partir de las texturas de arena, piedra, madera y acero.
- **Shaders propios** (`src/shaders.js`): agua de las piletas con espuma y red de luz, mar con oleaje hacia la costa, pasto que se mueve con el viento y se abre al paso de los luchadores, borde de luz del color del equipo y destello de daño en los personajes, escudo, zonas de efecto e indicador de puntería.
- **Posprocesado** (`src/gfx.js`): oclusión ambiental, bloom, desenfoque leve de maqueta arriba y abajo, corrección de color, viñeta y grano.
- **Efectos:** humo y polvo, marcas de quemado, luces de destello en explosiones, polvo al caminar, motas en el aire, vapor del reactor.

Hay tres niveles, que se eligen en Configuración:

| Nivel | Qué incluye |
|---|---|
| Alta | Todo: oclusión ambiental, bloom, desenfoque de maqueta, antialias 4x, sombras de 4096 |
| Media | Bloom, corrección de color, antialias liviano, sombras de 2048 |
| Baja | Sin posprocesado, sombras de 1024, menos partículas |

En "Auto" arranca en Alta (Media en pantallas táctiles) y, si durante la partida no llega a unos 27 cuadros por segundo, baja sola un nivel y avisa. Para forzar uno por una visita: `?q=alta`, `?q=media` o `?q=baja`.

## Físicas y realismo

- **Escombros con física** (`src/physics.js`): tablas, esquirlas, piezas y casquillos caen con gravedad, rebotan contra el piso y los muros, quedan apoyados y, si caen al agua, salpican.
- **Cajones que se rompen:** aguantan 1500 de daño; los disparos les sacan astillas y las explosiones los parten. Al romperse abren el paso (los bots lo aprovechan).
- **Pasto que se corta:** el salto de Brasa, el charco de Pompa y la zanja de Tajo lo cortan, y ahí ya no se puede esconder nadie. Las explosiones además lo aplastan un instante.
- **Golpes:** cada personaje pierde lo que le corresponde: sangre que mancha el piso (Nox, Pompa, Zip, Tajo), aceite y chispas (Tuerca) o brasas y cascotes (Brasa). El cuerpo se inclina hacia donde lo empujan, y con poca vida gotea o larga humo.
- **Muertes:** los de carne caen hacia donde vino el golpe y dejan un charco; el robot y el gólem se desarman en piezas.
- **Movimiento y armas:** inercia al arrancar y frenar, retroceso al disparar y casquillos en los remaches de Tuerca.
- **Sangre** se apaga en Configuración. Apagada, los golpes sueltan chispas blancas y no quedan manchas.

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
src/physics.js    escombros con física (gravedad, rebotes, agua)
src/shaders.js    shaders propios (agua, mar, pasto, personajes, escudo, zonas)
src/gfx.js        niveles de calidad y posprocesado
src/models.js     personajes 3D armados desde sus hojas de arte
src/perfiles/     silueta medida de cada personaje (la genera arte/perfilar_hojas.py)
src/assets.js     carga de las texturas de public/arte
src/fx.js         partículas, proyectiles, textos flotantes
src/audio.js      sonido sintetizado (no hay archivos de audio)
src/input.js      teclado, mouse y táctil
src/ui.js         interfaz en DOM: menú, HUD, pausa, configuración, resultados
src/settings.js   configuración: valores, guardado y lista de controles
```

## Arte

El arte se generó con IA a partir de prompts y vive en dos carpetas:

- `public/arte/`: lo que usa el juego (alrededor de 1,6 MB). Texturas de arena, piedra, cajón y pasto; el núcleo y el logo recortados; las fichas de los personajes (`ficha-*.webp`) que se ven en el menú; las hojas de personaje listas para proyectar (`hoja-*.webp`, `tajo-hoja.webp`); el material de acero; y los mapas de relieve `*-n.webp`.
- `arte/referencias/`: copias reducidas de las imágenes originales, para seguir ajustando los modelos.

`arte/procesar_arte.py` es el script que convierte los originales en los archivos de `public/arte/` (necesita Python con Pillow y numpy, y los PNG originales en la carpeta que indica la variable `U`).

Dentro de la partida, cinco de los seis personajes se arman a partir de su hoja de arte:

- **Tuerca, Brasa, Nox y Pompa:** `arte/perfilar_hojas.py` toma de cada hoja las vistas de frente, perfil y espalda, mide la silueta de cada parte (cabeza, torso, brazos, piernas) y guarda las tres vistas juntas en `public/arte/hoja-<id>.webp` y las medidas en `src/perfiles/<id>.json`. Con eso `models.js` levanta cada cuerpo por rodajas y lo pinta proyectando la hoja de frente, perfil y espalda, así se ve como el dibujo desde cualquier ángulo. Lo que brilla en el dibujo (el ojo de Tuerca, la lava de Brasa, los ojos de Nox) brilla también en el juego.
- **Tajo** usa el mismo método, con su propio script (`arte/perfilar_tajo.py`, `src/tajo-perfil.json`), que es anterior.
- Algunas piezas van aparte, hechas con formas simples, porque se mueven o hay que verlas desde arriba: la antena de Tuerca, la llama de Brasa, los mechones y la ballesta de Nox, el frasco de Pompa, el hacha y el farol de Tajo.
- **Zip** todavía no tiene hoja de arte: es un modelo de formas simples y usa una foto de ese modelo como retrato.

Para ajustar un personaje (qué filas ocupa cada parte, dónde giran los brazos) se edita la tabla `HEROES` de `perfilar_hojas.py` y se vuelve a correr; con `DEBUG_DIR` guarda una imagen de control con lo que midió.

El sonido se sintetiza por código.

`INSTRUCCIONES_DEL_PROYECTO.md` es de la landing de scroll anterior y quedó como estaba.
