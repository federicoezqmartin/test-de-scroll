// Look de cada vista: exposición, luces, niebla, color y borde de luz de los personajes. La
// partida mezcla el de la vista anterior con el nuevo mientras la cámara pasa de una a otra.
// Son solo valores (nada de pases nuevos), así cuesta lo mismo en celular.
//
//   exposure      exposición del mapeo de tonos
//   hemi, sun     luz del cielo y del sol; fill, luz de relleno; env, reflejos del entorno
//   fogNear/Far   dónde empieza y dónde tapa todo la niebla del horizonte
//   sat, con      saturación y contraste; vig, viñeta; grain, grano
//   split         virado: sombras frías y luces cálidas (0 = sin virado)
//   bloom         fuerza del resplandor; rim, cuánto del borde de luz de equipo se ve

// El de siempre: lo usa el menú.
export const BASE_LOOK = {
  exposure: 1, hemi: 0.6, sun: 3.4, fill: 0.32, env: 0.38, fogNear: 70, fogFar: 150,
  sat: 1.14, con: 1.08, vig: 0.28, grain: 0.022, split: 1, bloom: 0.3, rim: 1,
};

export const LOOKS = {
  // Desde arriba: brillante y saturado, con sombras claras, para leer todo de un vistazo.
  arriba: {
    exposure: 1.06, hemi: 0.75, sun: 3.2, fill: 0.4, env: 0.45, fogNear: 70, fogFar: 150,
    sat: 1.24, con: 1.05, vig: 0.16, grain: 0.006, split: 0.7, bloom: 0.32, rim: 1.1,
  },
  // Al hombro: colorido y luminoso, la distancia limpia y el borde de luz bien marcado.
  hombro: {
    exposure: 1.08, hemi: 0.7, sun: 3.5, fill: 0.38, env: 0.45, fogNear: 80, fogFar: 170,
    sat: 1.28, con: 1.06, vig: 0.14, grain: 0, split: 0.9, bloom: 0.38, rim: 1.5,
  },
  // En primera persona: sobrio y realista. Sombras profundas, más contraste, color frío en
  // las sombras y cálido en las luces, bruma en la distancia, viñeta y grano.
  primera: {
    exposure: 0.96, hemi: 0.36, sun: 3.9, fill: 0.12, env: 0.3, fogNear: 35, fogFar: 125,
    sat: 0.86, con: 1.17, vig: 0.42, grain: 0.03, split: 1.7, bloom: 0.16, rim: 0.45,
  },
};

// Mezcla de a con b (k = 0 es a, k = 1 es b), escrita en out.
export function mixLook(a, b, k, out = {}) {
  for (const key in b) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}
