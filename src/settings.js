// Configuración del juego: valores, guardado en el navegador y la lista de controles
// que dibuja la pantalla de Configuración (ui.js la arma a partir de SECTIONS).

const KEY = 'tuzanja-config';

export const DEFAULTS = {
  // juego
  playerName: 'Vos',
  difficulty: 'normal',
  // gráficos
  quality: 'auto',
  bloom: true,
  tilt: true,
  grade: true,
  shake: 1,
  zoom: 1,
  gore: true,
  fps: false,
  // sonido
  volume: 0.8,
  muted: false,
  // interfaz
  hudScale: 1,
  minimap: true,
  teamPanels: true,
  dmgNumbers: true,
  names: true,
  hitDir: true,
  teamColors: 'clasico',
  // táctil
  lefty: false,
  btnScale: 1,
};

// type: seg (opciones), toggle, range (min, max, step, fmt) o text.
export const SECTIONS = [
  {
    title: 'Juego',
    items: [
      { k: 'playerName', type: 'text', label: 'Tu nombre', max: 10 },
      { k: 'difficulty', type: 'seg', label: 'Dificultad de los bots', opts: [['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil']], note: 'Se aplica al empezar la próxima partida.' },
    ],
  },
  {
    title: 'Gráficos',
    items: [
      { k: 'quality', type: 'seg', label: 'Calidad', opts: [['auto', 'Auto'], ['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']], note: 'Auto baja sola un nivel si la partida no va fluida.' },
      { k: 'bloom', type: 'toggle', label: 'Resplandor', note: 'Brillo en lava, núcleos y disparos. No se aplica en calidad Baja.' },
      { k: 'tilt', type: 'toggle', label: 'Desenfoque de maqueta', note: 'Solo en calidad Alta.' },
      { k: 'grade', type: 'toggle', label: 'Color de cine', note: 'Más contraste, viñeta y grano. No se aplica en calidad Baja.' },
      { k: 'shake', type: 'range', label: 'Temblor de cámara', min: 0, max: 1.5, step: 0.1, fmt: (v) => (v === 0 ? 'No' : Math.round(v * 100) + '%') },
      { k: 'zoom', type: 'range', label: 'Distancia de cámara', min: 0.8, max: 1.3, step: 0.05, fmt: (v) => (v < 0.97 ? 'Cerca' : v > 1.03 ? 'Lejos' : 'Normal') + ' · ' + Math.round(v * 100) + '%' },
      { k: 'gore', type: 'toggle', label: 'Sangre y manchas' },
      { k: 'fps', type: 'toggle', label: 'Mostrar cuadros por segundo' },
    ],
  },
  {
    title: 'Sonido',
    items: [
      { k: 'volume', type: 'range', label: 'Volumen', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
      { k: 'muted', type: 'toggle', label: 'Silenciar' },
    ],
  },
  {
    title: 'Interfaz',
    items: [
      { k: 'hudScale', type: 'range', label: 'Tamaño de la interfaz', min: 0.8, max: 1.3, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
      { k: 'minimap', type: 'toggle', label: 'Minimapa' },
      { k: 'teamPanels', type: 'toggle', label: 'Paneles de equipo' },
      { k: 'names', type: 'toggle', label: 'Nombres sobre los luchadores' },
      { k: 'dmgNumbers', type: 'toggle', label: 'Números de daño' },
      { k: 'hitDir', type: 'toggle', label: 'Aviso de dónde viene el daño' },
      { k: 'teamColors', type: 'seg', label: 'Colores de equipo', opts: [['clasico', 'Azul y rojo'], ['contraste', 'Azul y naranja']], note: 'Azul y naranja se distingue mejor con daltonismo. En el 3D se aplica en la próxima partida.' },
    ],
  },
  {
    title: 'Controles táctiles',
    items: [
      { k: 'lefty', type: 'toggle', label: 'Modo zurdo', note: 'Botones de ataque a la izquierda y palanca a la derecha.' },
      { k: 'btnScale', type: 'range', label: 'Tamaño de los botones', min: 0.8, max: 1.4, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    ],
  },
];

function read(k) { try { return localStorage.getItem(k); } catch { return null; } }
function write(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }

function load() {
  const s = { ...DEFAULTS };
  let saved = null;
  try { saved = JSON.parse(read(KEY) || 'null'); } catch { /* guardado ilegible: se ignora */ }
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === typeof DEFAULTS[k]) s[k] = saved[k];
  } else {
    // Primera vez con esta pantalla: se respetan las preferencias sueltas de versiones anteriores.
    const q = read('tuzanja-calidad');
    if (['baja', 'media', 'alta'].includes(q)) s.quality = q;
    if (read('tuzanja-sangre') === '0') s.gore = false;
    if (read('trifulca-mute') === '1') s.muted = true;
  }
  s.playerName = String(s.playerName).trim().slice(0, 10) || DEFAULTS.playerName;
  return s;
}

export const settings = load();
const listeners = new Set();

export function onSettings(fn) { listeners.add(fn); }

export function setSetting(k, v) {
  if (!(k in DEFAULTS) || settings[k] === v) return;
  settings[k] = v;
  write(KEY, JSON.stringify(settings));
  for (const fn of listeners) fn(k);
}

export function resetSettings() {
  Object.assign(settings, DEFAULTS);
  write(KEY, JSON.stringify(settings));
  for (const fn of listeners) fn(null);
}

// Nivel al que bajó sola la calidad automática (se recuerda entre visitas).
export const autoLevel = {
  get: () => read('tuzanja-calidad-auto'),
  set: (v) => write('tuzanja-calidad-auto', v),
};

// Qué tan bien juegan los bots: error de puntería, pausa entre disparos y anticipación.
export const SKILL = {
  facil: { err: 2.1, cd: 1.7, lead: 0.4, think: 1.5 },
  normal: { err: 1, cd: 1, lead: 0.75, think: 1 },
  dificil: { err: 0.5, cd: 0.7, lead: 1, think: 0.75 },
};

export const TEAM_PALETTES = {
  clasico: [
    { name: 'AZUL', color: 0x2f9bff, css: '#2f9bff', light: '#8fcaff', shot: 0x2f9bff },
    { name: 'ROJO', color: 0xff4757, css: '#ff4757', light: '#ff9aa3', shot: 0xff3355 },
  ],
  contraste: [
    { name: 'AZUL', color: 0x2f9bff, css: '#2f9bff', light: '#8fcaff', shot: 0x2f9bff },
    { name: 'NARANJA', color: 0xff9d1e, css: '#ff9d1e', light: '#ffc978', shot: 0xffa51e },
  ],
};
