// Arte del juego (carpeta public/arte): texturas compartidas entre partidas.
import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL + 'arte/';
const loader = new THREE.TextureLoader();
const cache = new Map();

export const artUrl = (name) => BASE + name;

// Devuelve siempre la misma textura para un mismo nombre; nadie debe hacerle dispose.
export function tex(name, { repeat = false, data = false } = {}) {
  const key = name + (repeat ? ':r' : '');  // la misma imagen puede existir con y sin repetición
  let t = cache.get(key);
  if (!t) {
    t = loader.load(BASE + name);
    if (!data) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    cache.set(key, t);
  }
  return t;
}

// Las pide por adelantado para que estén listas al entrar a la partida.
export function preloadArt() {
  for (const n of ['arena.webp', 'pasto.webp']) tex(n, { repeat: true });
  for (const n of ['piedra.webp', 'cajon.webp', 'nucleo.webp', 'mat-acero.webp']) tex(n);
  for (const n of ['arena-n.webp', 'pasto-n.webp']) tex(n, { repeat: true, data: true });
  for (const n of ['piedra-n.webp', 'cajon-n.webp', 'mat-acero-n.webp']) tex(n, { data: true });
  for (const n of ['tajo-hoja.webp', 'hoja-tuerca.webp', 'hoja-brasa.webp', 'hoja-nox.webp', 'hoja-pompa.webp']) tex(n);
}
