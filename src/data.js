// Datos del juego: reglas, equipos, héroes y mapa.

export const RULES = {
  goal: 10, // núcleos para activar la cuenta regresiva
  countdown: 15,
  respawn: 4.5,
  shield: 2.5,
  coreEvery: 6,
  coreFirst: 2.5,
  maxCores: 28,
  regenDelay: 3,
  regenRate: 0.14, // fracción de vida por segundo
  ammoMax: 3,
};

export const TEAMS = [
  { name: 'AZUL', color: 0x2f9bff, css: '#2f9bff' },
  { name: 'ROJO', color: 0xff4757, css: '#ff4757' },
];

export const BOT_NAMES = ['Rulo', 'Mecha', 'Pipa', 'Tano', 'Fideo', 'Lola', 'Brisa', 'Coco', 'Nacho', 'Greta', 'Turco', 'Mora'];

/*
  Tipos de ataque (attack / super):
  - shots : proyectiles. count + interval (ráfaga en línea) o spread (abanico).
  - lob   : lanzamiento en arco por encima de las paredes, con área de impacto.
  - melee : golpe en cono, instantáneo.
  - leap  : salto a un punto, daño en área al caer.
  - dash  : embestida en línea, daña lo que atraviesa.
  - zone  : zona de daño por tiempo en un punto.
  - line  : golpe en línea recta, instantáneo; puede curar una parte del daño hecho.
  `art` es el recorte del arte original (public/arte) que se usa de retrato.
  `gore`: qué pierde al recibir daño (blood: sangre, oil: aceite y chispas, lava: brasas)
  y cómo muere (fall: el cuerpo cae; break: se desarma en piezas).
*/
export const HEROES = [
  {
    id: 'tuerca',
    gore: { blood: 'oil', death: 'break' },
    art: 'ficha-tuerca.webp',
    name: 'Tuerca',
    role: 'Tiradora',
    blurb: 'Robot de taller reconvertida en pistolera. Constante, precisa y siempre con un remache de más.',
    color: '#ff8a1e',
    hp: 3800,
    speed: 5.5,
    superNeed: 3600,
    aiRange: 6.2,
    bars: { Vida: 3, Daño: 3, Alcance: 4, Velocidad: 3 },
    attack: {
      name: 'Remachadora', desc: 'Ráfaga de 3 remaches en línea recta.',
      kind: 'shots', count: 3, interval: 0.085, spread: 0, dmg: 430, range: 8.5, speed: 19, radius: 0.2,
      visual: 'bolt', sfx: 'bolt', reload: 1.45, cd: 0.5,
    },
    super: {
      name: 'Sobrecarga', desc: 'Esfera de plasma que atraviesa a todos los rivales y los empuja.',
      kind: 'shots', count: 1, interval: 0, spread: 0, dmg: 1500, range: 11, speed: 14, radius: 0.65,
      pierce: true, knock: 7, visual: 'orb', sfx: 'super',
    },
  },
  {
    id: 'brasa',
    gore: { blood: 'lava', death: 'break' },
    art: 'ficha-brasa.webp',
    name: 'Brasa',
    role: 'Tanque',
    blurb: 'Gólem de lava con pocas palabras y puños enormes. Aguanta todo y de cerca no perdona.',
    color: '#ff5a2a',
    hp: 6400,
    speed: 5.0,
    superNeed: 4200,
    aiRange: 3.2,
    bars: { Vida: 5, Daño: 4, Alcance: 2, Velocidad: 2 },
    attack: {
      name: 'Ascuas', desc: 'Abanico de 5 ascuas de corto alcance.',
      kind: 'shots', count: 5, interval: 0, spread: 36, dmg: 310, range: 5.2, speed: 16, radius: 0.22,
      visual: 'ember', sfx: 'ember', reload: 1.5, cd: 0.55,
    },
    super: {
      name: 'Salto volcánico', desc: 'Salta por encima de las paredes y aplasta la zona al caer.',
      kind: 'leap', range: 7, dur: 0.7, aoe: 2.6, dmg: 1300, knock: 9, sfx: 'super',
    },
  },
  {
    id: 'nox',
    gore: { blood: 'blood', death: 'fall' },
    art: 'ficha-nox.webp',
    name: 'Nox',
    role: 'Francotiradora',
    blurb: 'Lechuza arquera que casi no se deja ver. Frágil, pero pega desde donde nadie llega.',
    color: '#9a7dff',
    hp: 3000,
    speed: 5.6,
    superNeed: 3400,
    aiRange: 8.6,
    bars: { Vida: 2, Daño: 4, Alcance: 5, Velocidad: 3 },
    attack: {
      name: 'Dardo lunar', desc: 'Un solo dardo, muy rápido y de largo alcance.',
      kind: 'shots', count: 1, interval: 0, spread: 0, dmg: 1150, range: 11.5, speed: 27, radius: 0.18,
      visual: 'dart', sfx: 'dart', reload: 1.9, cd: 0.55,
    },
    super: {
      name: 'Lluvia de estrellas', desc: 'Marca una zona lejana que recibe daño durante unos segundos.',
      kind: 'zone', range: 9, radius: 2.7, delay: 0.55, dur: 2.4, tick: 0.4, dmg: 400, visual: 'stars', sfx: 'super',
    },
  },
  {
    id: 'pompa',
    gore: { blood: 'blood', death: 'fall' },
    art: 'ficha-pompa.webp',
    name: 'Pompa',
    role: 'Lanzadora',
    blurb: 'Rana alquimista. Sus frascos pasan por encima de las paredes y siempre caen donde molestan.',
    color: '#7ddc3c',
    hp: 3400,
    speed: 5.4,
    superNeed: 3400,
    aiRange: 5.6,
    bars: { Vida: 3, Daño: 3, Alcance: 3, Velocidad: 3 },
    attack: {
      name: 'Frasco burbujeante', desc: 'Lanza un frasco en arco que explota en área.',
      kind: 'lob', range: 7.5, flight: 0.7, aoe: 1.5, dmg: 900,
      visual: 'flask', sfx: 'lob', reload: 1.75, cd: 0.55,
    },
    super: {
      name: 'Charco tóxico', desc: 'Frasco gigante que deja un charco que daña a quien lo pise.',
      kind: 'lob', range: 8, flight: 0.8, aoe: 2.3, dmg: 800, visual: 'bigflask',
      zone: { radius: 2.3, delay: 0, dur: 4, tick: 0.5, dmg: 280, visual: 'toxic' }, sfx: 'super',
    },
  },
  {
    id: 'zip',
    gore: { blood: 'blood', death: 'fall' },
    name: 'Zip',
    role: 'Asesino',
    blurb: 'Conejo ninja, el más rápido de la arena. Entra, corta dos veces y ya no está.',
    color: '#ff3f6c',
    hp: 3600,
    speed: 6.4,
    superNeed: 3000,
    aiRange: 1.5,
    bars: { Vida: 3, Daño: 4, Alcance: 1, Velocidad: 5 },
    attack: {
      name: 'Corte doble', desc: 'Dos tajos seguidos en cono, cuerpo a cuerpo.',
      kind: 'melee', arc: 110, range: 2.4, dmg: 520, hits: 2, interval: 0.14,
      sfx: 'slash', reload: 1.0, cd: 0.4,
    },
    super: {
      name: 'Destello', desc: 'Embestida instantánea que corta a todos los que atraviesa.',
      kind: 'dash', range: 6, dur: 0.2, width: 1.15, dmg: 1200, sfx: 'super',
    },
  },
  {
    id: 'tajo',
    gore: { blood: 'blood', death: 'fall' },
    art: 'ficha-tajo.webp',
    name: 'Tajo',
    role: 'Embestidor',
    blurb: 'Zanjero de oficio. Avanza a los hachazos y, cuando clava el hacha, abre la tierra y se recupera con lo que arranca.',
    color: '#c9833a',
    hp: 4000,
    speed: 6.1,
    superNeed: 3200,
    aiRange: 2.0,
    bars: { Vida: 3, Daño: 4, Alcance: 2, Velocidad: 4 },
    attack: {
      name: 'Hachazo', desc: 'Se lanza hacia adelante y corta a los que cruza. Recarga lenta.',
      kind: 'dash', range: 2.7, dur: 0.16, width: 1.05, dmg: 950, vuln: true,
      sfx: 'slash', reload: 2.0, cd: 0.28,
    },
    super: {
      name: 'Zanja', desc: 'Clava el hacha y abre una zanja en línea: daña, empuja y lo cura.',
      kind: 'line', range: 7, width: 1.5, dmg: 1400, knock: 5, heal: 0.4, sfx: 'boom',
    },
  },
];

export const GAME_NAME = 'Tu Zanja 3D';

export const heroById = (id) => HEROES.find((h) => h.id === id) || HEROES[0];

/*
  Mapa: se escribe solo la mitad izquierda (columnas 0..10) de la mitad superior
  (filas 0..15). El resto sale por simetría, así los dos equipos juegan lo mismo.
    .  piso      #  muro      X  cajón      ~  agua      g  pasto alto      M  reactor
*/
export const MAP_HALF = [
  'ggg........',
  'gg.........',
  '...........',
  '...##...XX.',
  '...#.......',
  'g.....gg...',
  'g..~~.gg..#',
  '...~~.....#',
  '##.........',
  '#....XX...g',
  '....gX...gg',
  'g...g......',
  'gg.....##..',
  'gg..#....g.',
  '....#......',
  '..gg......M',
];
