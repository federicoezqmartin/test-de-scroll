# test-de-scroll

Repo de pruebas con IA. Ahora mismo la página es un juego: **Tu Zanja 3D**.

## Tu Zanja 3D

Arena 3 contra 3 con vista cenital, en 3D real (three.js), que corre en el navegador. Vos manejás un personaje; los otros cinco son bots.

**Objetivo:** el reactor del centro va soltando núcleos. El equipo que junte 10 y los aguante 15 segundos gana. Si te eliminan, se te caen todos los que llevabas.

**Mecánicas:** tres cargas de munición que se recargan solas, un súper que se carga haciendo daño, pasto alto para esconderse, muros que frenan los disparos, cajones que frenan los disparos hasta que se rompen, agua que frena el paso pero no los disparos, y vida que se regenera si dejás de pelear unos segundos.

**Personajes:**

| Personaje | Rol | Ataque | Súper |
|---|---|---|---|
| Tuerca (mecánica con remachadora) | Tiradora | Ráfaga de 3 remaches | Esfera de plasma que atraviesa |
| Brasa (herrero de fundición) | Tanque | Abanico de ascuas | Salto que aplasta la zona |
| Nox (exploradora con ballesta) | Francotiradora | Dardo de largo alcance | Lluvia de estrellas en un área |
| Pompa (química) | Lanzadora | Frasco que pasa sobre los muros | Charco tóxico |
| Zip (corredor de parkour con cuchillas) | Asesino | Dos tajos cuerpo a cuerpo | Embestida instantánea |
| Tajo (zanjero con hacha) | Embestidor | Hachazo: se lanza hacia adelante cortando | Zanja en línea que daña, empuja y lo cura |

**Vistas** (Configuración → Cámara, o la tecla V durante la partida):

- **Arriba:** la vista cenital de siempre.
- **Al hombro:** cámara detrás del personaje, sobre el hombro derecho.
- **Primera persona:** la cámara en los ojos del personaje. El cuerpo propio no se dibuja, pero se ven sus brazos o su arma: el taladro de Tuerca, los puños de Brasa, la ballesta de Nox, el frasco de Pompa, las cuchillas de Zip y el hacha de Tajo. Se balancean al caminar, se quedan un poco atrás al girar, bajan cuando no hay munición y cada ataque y cada súper tiene su movimiento. Los disparos salen del arma que se ve. El arma tiene una luz mínima propia, así se lee aunque el sol le dé de espaldas, y lo que pasa pegado a los ojos (chispas, humo, el halo de lo disparado) se achica y se apaga para no tapar la pantalla.

Al hombro y en primera persona la arena cambia para que lo que frena los disparos también tape la vista: los muros suben uno o dos bloques de piedra, los cajones se apilan de a dos y el pasto crece; en la vista de arriba todo vuelve a quedar bajo, para no tapar a los personajes. El cambio es animado. Arriba hay cielo con sol y nubes, y alrededor islas a lo lejos; el horizonte se funde con la niebla. Los nombres de los rivales que quedan detrás de un muro no se muestran.

Al hombro y en primera persona el mouse queda capturado para mirar (Esc lo suelta y pausa), hay una mira en el centro con la munición debajo, y moverse es relativo a hacia dónde mirás. La puntería sigue siendo sobre el piso, como en la vista de arriba: mirar arriba o abajo solo cambia a qué distancia caen los ataques en arco. Esos ataques (el frasco de Pompa y el salto de Brasa) muestran un arco punteado con la curva que van a hacer; la parte que queda detrás de un muro se ve más tenue. Al morir la cámara pasa a la vista de arriba hasta que reaparecés. En celular se mira arrastrando en la mitad de la pantalla que no tiene la palanca, y tocar el botón de ataque dispara al rival que tengas adelante.

**Ayuda de puntería en celular** (al hombro y en primera persona; con mouse no cambia nada). Trabaja solo sobre el giro, porque la puntería es sobre el piso:

- **Fricción:** con la mira sobre un rival, el giro con el dedo se frena (queda el 60 % en Suave y el 40 % en Fuerte). En el borde del rival se suelta de a poco.
- **Imán:** mientras te movés o atacás, si hay un rival cerca del centro la cámara se corre de a poco hacia él. Tira más cuanto más centrado está, así no arranca de golpe.
- **Marca:** un aro sobre el rival al que iría el disparo si tocás el botón sin arrastrar, y su nombre se pinta de amarillo.

Nunca ayuda hacia un rival escondido en el pasto o detrás de un muro o un cajón; el toque sin arrastrar tampoco les apunta en estas vistas. La intensidad se elige en Configuración → Controles táctiles.

**Controles**

- Teclado y mouse: `WASD` o flechas para moverte, mouse para apuntar (o para mirar, al hombro y en primera persona), clic para disparar, `Espacio` o clic derecho para el súper (mantené para ver a dónde va), `V` para cambiar de vista, `Esc` para pausar.
- Celular: palanca izquierda para moverte; el botón rojo dispara solo al rival más cercano si lo tocás, o apunta si lo arrastrás. El botón de súper funciona igual.

## Interfaz de partida

- **Marcador:** diez casilleros por equipo que se van llenando, la meta y el reloj de la partida.
- **Tarjeta del jugador:** retrato, vida en números, munición y núcleos que llevás.
- **Paneles de equipo:** aliados y rivales con retrato, vida, núcleos y la cuenta para reaparecer. De un rival escondido se muestra lo último que se le vio.
- **Minimapa:** mapa, núcleos en el piso, aliados y los rivales que estén a la vista. Se actualiza cuando se rompe un cajón o se corta pasto. En la vista de arriba es el mapa entero con el norte arriba. Al hombro y en primera persona es redondo, con algo de aumento, centrado en vos y girado con la cámara: lo que tenés adelante queda arriba. Ahí sos una flecha fija con un cono del ancho del campo de visión, la N del borde marca el norte (el lado de la base rival) y lo que queda fuera del círculo aparece más chico pegado al borde.
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
| Controles táctiles | Modo zurdo · tamaño de los botones · ayuda de puntería (Apagada, Suave, Fuerte) |

La dificultad, el nombre y el color de equipo en el 3D se aplican al empezar la próxima partida; el resto cambia al instante.

## Gráficos

- **Luz y sombras:** sol bajo con sombras largas y suaves, luz de relleno, reflejos de entorno, sombra de contacto bajo personajes y alrededor de muros y cajones.
- **Materiales:** relieve (normal maps) generado a partir de las texturas de arena, piedra, madera y acero.
- **Shaders propios** (`src/shaders.js`): agua de las piletas con espuma y red de luz, mar con oleaje hacia la costa, pasto que se mueve con el viento y se abre al paso de los luchadores, borde de luz del color del equipo y destello de daño en los personajes, escudo, zonas de efecto e indicador de puntería.
- **Posprocesado** (`src/gfx.js`): oclusión ambiental, bloom, desenfoque leve de maqueta arriba y abajo, corrección de color, viñeta y grano.
- **Un look por vista** (`src/looks.js`): exposición, luces, niebla, color y borde de luz cambian con la vista y se mezclan al pasar de una a otra. Arriba es brillante y saturada, para leer todo de un vistazo; al hombro, colorida y luminosa; en primera persona, sobria y realista, con sombras profundas, más contraste, bruma en la distancia, viñeta y grano. Son solo valores, así que en celular cuesta lo mismo.
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
- **Golpes:** sangre que mancha el piso. El cuerpo se inclina hacia donde lo empujan, y con poca vida gotea.
- **Muertes:** caen hacia donde vino el golpe y dejan un charco. (El código para desarmarse en piezas y perder aceite o brasas sigue en `match.js`, aunque hoy ningún personaje lo usa.)
- **Movimiento y armas:** inercia al arrancar y frenar, retroceso al disparar y casquillos en los remaches de Tuerca.
- **Sangre** se apaga en Configuración. Apagada, los golpes sueltan chispas blancas y no quedan manchas.

## Correrlo

```bash
npm install
npm run dev        # desarrollo
npm run build      # genera dist/
npm run preview    # sirve dist/
npm test           # juega una partida completa por personaje, sin ventana
npm run qa         # capturas del menú y de las tres vistas en qa/out/
node qa/punteria.mjs   # mide la ayuda de puntería en táctil (fricción, imán, escondidos)
node qa/minimapa.mjs   # capturas del minimapa redondo girado y de la marca, en qa/out/
node qa/armas.mjs      # capturas de cada arma en primera persona: quieta, atacando y en la súper
```

Las pruebas necesitan `npx playwright install chromium` la primera vez. Para instalarlo en tu compu y trabajar con Claude Code ahí, ver `INSTALAR.md`.

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
src/viewmodel.js  brazos y armas que se ven en primera persona
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

- `public/arte/`: lo que usa el juego (alrededor de 1,6 MB). Texturas de arena, piedra, cajón y pasto; el núcleo y el logo recortados; las fichas de los personajes (`ficha-*.webp`) que se ven en el menú; las hojas de personaje listas para proyectar (`hoja-*.webp`); el material de acero; y los mapas de relieve `*-n.webp`.
- `arte/referencias/`: copias reducidas de las imágenes originales, para seguir ajustando los modelos.

`arte/procesar_arte.py` es el script que convierte los originales (`arte/originales/`) en los archivos de `public/arte/`; necesita Python con Pillow y numpy.

Los seis personajes son personas de aspecto realista y se arman a partir de su hoja de arte:

- **Hojas:** cada una se generó con ChatGPT como una hoja de personaje con tres vistas en fila (frente, perfil mirando a la derecha y espalda), en pose A, sobre gris parejo. Están en `arte/originales/<id>-realista-image.png`.
- **Cuerpos:** `arte/perfilar_hojas.py` toma de cada hoja las tres vistas, mide la silueta de cada parte (cabeza, torso, brazos, piernas) y guarda las vistas juntas en `public/arte/hoja-<id>.webp` y las medidas en `src/perfiles/<id>.json`. Con eso `models.js` levanta cada cuerpo por rodajas y lo pinta proyectando la hoja, así se ve como el dibujo desde cualquier ángulo. Las brasas de los guantes de Brasa brillan solas.
- **Armas:** van aparte, hechas con formas simples, porque se mueven: la remachadora de Tuerca, la ballesta de Nox, el frasco de Pompa, las cuchillas de Zip, y el hacha y el farol de Tajo. Se ubican en la mano que mide el perfil.
- **Retratos del menú:** `procesar_arte.py` recorta la vista de frente de cada hoja.
- **De cerca:** en primera persona el brazo queda pegado a la cámara y la piel de la hoja se ve estirada; el método por rodajas no aguanta un primer plano tan cercano.

Para ajustar un personaje (qué filas ocupa cada parte, dónde giran los brazos) se edita la tabla `HEROES` de `perfilar_hojas.py` y se vuelve a correr; con `DEBUG_DIR` guarda una imagen de control con lo que midió.

El sonido se sintetiza por código.

`INSTRUCCIONES_DEL_PROYECTO.md` es de la landing de scroll anterior y quedó como estaba.
