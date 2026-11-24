# Instalar Tu Zanja 3D en tu compu

Guía para jugarlo y seguir desarrollándolo en tu máquina, con Claude Code en la terminal en vez de en la nube.

## 1. Lo que hace falta

- **Node.js 22 o más nuevo.** Bajalo de https://nodejs.org (la versión "LTS"). Para comprobarlo, en una terminal: `node -v`.
- **Git.** En Windows, https://git-scm.com/downloads/win (Claude Code también lo usa). En Mac viene con las herramientas de Xcode; si no lo tenés, la terminal te ofrece instalarlo la primera vez que escribís `git`.
- **Python 3 con Pillow y numpy**, solo si vas a regenerar el arte (paso 6).

## 2. Bajar el proyecto

Hay dos formas:

- **Con git (recomendado, así podés subir cambios a GitHub):**

  ```bash
  git clone https://github.com/federicoezqmartin/test-de-scroll.git
  cd test-de-scroll
  git checkout claude/busy-gauss-lwcnlr
  ```

  El juego está en la rama `claude/busy-gauss-lwcnlr` (el pull request #1). Si fusionás el pull request en `main`, alcanza con el `git clone`.

- **Con el zip:** descomprimilo y entrá a la carpeta `tu-zanja-3d`. El zip trae los archivos pero no el historial de git, así que para subir cambios a GitHub conviene la otra forma. También se puede bajar el zip directo de GitHub: https://github.com/federicoezqmartin/test-de-scroll/archive/refs/heads/claude/busy-gauss-lwcnlr.zip

## 3. Instalar y jugar

En la carpeta del proyecto:

```bash
npm install
npm run dev
```

Abrí la dirección que muestra (normalmente http://localhost:5173). Para probarlo en el celular, con el celular en la misma Wi-Fi: `npm run dev -- --host` y abrí en el celular la dirección "Network" que aparece.

Para generar la versión final (la que se publica en Netlify): `npm run build` (queda en `dist/`) y `npm run preview` para verla.

## 4. Pruebas automáticas

La primera vez hay que bajar el navegador de pruebas:

```bash
npx playwright install chromium
```

Después:

- `npm test` juega una partida completa con cada personaje, sin ventana, y avisa si algo falla. Se puede elegir: `npm test -- --heroe tajo --vista primera`.
- `npm run qa` saca capturas del menú y de las tres vistas, en escritorio y celular, en `qa/out/`.

Usan render por software, así que andan en cualquier compu pero son lentas y no sirven para medir rendimiento.

## 5. Claude Code en tu compu

Hace falta un plan pago de Claude (Pro, Max o de equipo). Instalalo con el instalador oficial:

- **Windows (PowerShell):** `irm https://claude.ai/install.ps1 | iex`
- **Mac o Linux:** `curl -fsSL https://claude.ai/install.sh | bash`

El instalador no muestra avance mientras descarga. Cuando termina, abrí una terminal nueva y comprobalo con `claude --version`.

Para trabajar, abrí una terminal en la carpeta del proyecto y escribí `claude`. La primera vez te pide iniciar sesión en el navegador. El archivo `CLAUDE.md` del proyecto le explica a Claude cómo está armado el juego y cómo probarlo, así que podés pedirle cambios directamente.

Guía oficial, con otras formas de instalarlo y la solución a problemas comunes: https://code.claude.com/docs/en/setup

## 6. Regenerar el arte (opcional)

Los originales están en `arte/originales/`. Si cambiás o agregás arte:

```bash
python3 -m pip install pillow numpy
python3 arte/procesar_arte.py      # texturas, logo, núcleo, fichas
python3 arte/perfilar_hojas.py     # cuerpos de Tuerca, Brasa, Nox y Pompa
python3 arte/perfilar_tajo.py      # cuerpo de Tajo
```

En Windows usá `py` en lugar de `python3`. Los detalles de cada script están en el `README.md`.
