# test-de-scroll

Repo de pruebas con IA. Ahora mismo la página es un juego: **Trifulca 3D**.

## Trifulca 3D

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

**Controles**

- Teclado y mouse: `WASD` o flechas para moverte, mouse para apuntar, clic para disparar, `Espacio` o clic derecho para el súper (mantené para ver a dónde va), `Esc` para pausar.
- Celular: palanca izquierda para moverte; el botón rojo dispara solo al rival más cercano si lo tocás, o apunta si lo arrastrás. El botón de súper funciona igual.

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
src/models.js     personajes 3D armados con primitivas
src/fx.js         partículas, proyectiles, textos flotantes
src/audio.js      sonido sintetizado (no hay archivos de audio)
src/input.js      teclado, mouse y táctil
src/ui.js         interfaz en DOM
```

No hay modelos, texturas ni sonidos externos: todo se genera por código.

`INSTRUCCIONES_DEL_PROYECTO.md` es de la landing de scroll anterior y quedó como estaba.
