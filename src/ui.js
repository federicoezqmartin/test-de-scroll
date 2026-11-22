// Interfaz en DOM: menú, HUD de partida, pausa, configuración y resultados.
import { HEROES, RULES, TEAMS, heroById } from './data.js';
import { artUrl } from './assets.js';
import { settings, SECTIONS, setSetting, resetSettings, TEAM_PALETTES } from './settings.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// Colores del minimapa por tipo de baldosa (ver T en world.js).
const MAP_COLORS = { 1: '#7d93a6', 2: '#b9793f', 3: '#2bb3d0', 4: '#3f9a34', 5: '#c8ff3a' };
const MAP_FLOOR = 'rgba(58, 46, 26, 0.92)';
// Minimapa redondo de las vistas con cámara propia: diámetro en píxeles y aumento respecto del
// mapa fijo. En celular entra en el mismo hueco que el mapa fijo, al lado del panel rival.
const ROUND = { desk: 168, touch: 90, zoom: 1.35 };

export class UI {
  constructor() {
    this.menu = $('menu');
    this.hud = $('hud');
    this.layer = $('world-ui');
    this.stage = $('stage');
    this.selected = HEROES[0].id;
    try {
      const saved = localStorage.getItem('trifulca-hero');
      if (saved && HEROES.some((h) => h.id === saved)) this.selected = saved;
    } catch { /* sin almacenamiento */ }
    this.onSelect = () => {};
    this.onSettingsClose = () => {};
    this.portraits = {};
    this.bigT = 0;
    this.hs = 1;
    this.last = {};
    this.team = [];
    this.buildSettings();
    for (let t = 0; t < 2; t++) {
      const p = $('pips-' + t);
      for (let i = 0; i < RULES.goal; i++) p.append(el('i'));
    }
    const ammo = $('me-ammo');
    for (let i = 0; i < RULES.ammoMax; i++) {
      const seg = el('i');
      seg.append(el('u'));
      ammo.append(seg);
    }
    this.applySettings();
  }

  // ----------------------------------------------------------------- menú --
  buildRoster(portraits) {
    this.portraits = portraits;
    const nav = $('roster');
    nav.textContent = '';
    for (const h of HEROES) {
      const b = el('button', 'hero-btn');
      b.type = 'button';
      b.dataset.id = h.id;
      b.style.setProperty('--c', h.color);
      const img = el('img', h.art ? 'art' : '');
      img.alt = '';
      if (portraits[h.id]) img.src = portraits[h.id];
      const txt = el('span', 'hb-text');
      txt.append(el('b', '', h.name), el('small', '', h.role));
      b.append(img, txt);
      b.addEventListener('click', () => this.select(h.id, true));
      nav.append(b);
    }
    this.select(this.selected, false);
  }

  select(id, byUser) {
    this.selected = id;
    try { localStorage.setItem('trifulca-hero', id); } catch { /* sin almacenamiento */ }
    const h = heroById(id);
    for (const b of document.querySelectorAll('.hero-btn')) {
      const on = b.dataset.id === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    $('hero-card').style.setProperty('--c', h.color);
    const art = $('hc-art');
    art.hidden = !h.art;
    if (h.art) art.src = artUrl(h.art);
    $('hc-name').textContent = h.name;
    $('hc-role').textContent = h.role;
    $('hc-blurb').textContent = h.blurb;
    const bars = $('hc-bars');
    bars.textContent = '';
    for (const [k, v] of Object.entries(h.bars)) {
      const dd = el('dd');
      for (let i = 0; i < 5; i++) dd.append(el('i', i < v ? 'on' : ''));
      bars.append(el('dt', '', k), dd);
    }
    $('hc-atk-name').textContent = h.attack.name;
    $('hc-atk-desc').textContent = h.attack.desc;
    $('hc-sup-name').textContent = h.super.name;
    $('hc-sup-desc').textContent = h.super.desc;
    this.onSelect(id, byUser);
  }

  setHints(touch, view = 'arriba') {
    const cam = view !== 'arriba';
    const t = touch
      ? cam
        ? 'Palanca: moverte · Arrastrá en la otra mitad: mirar · Botón de ataque: tocá para disparar al que tengas adelante o arrastrá para apuntar'
        : 'Palanca: moverte · Botón de ataque: tocá para disparar solo o arrastrá para apuntar'
      : cam
        ? 'WASD: moverte · Mouse: mirar · Clic: disparar · Espacio o clic derecho: súper · V: cambiar vista · Esc: pausa'
        : 'WASD: moverte · Mouse: apuntar · Clic: disparar · Espacio o clic derecho: súper · V: cambiar vista · Esc: pausa';
    $('keys-hint').textContent = t;
    $('pause-hint').textContent = t;
  }

  show(name) {
    this.menu.hidden = name !== 'menu';
    this.hud.hidden = name !== 'match';
    $('results').hidden = name !== 'results';
    $('pause').hidden = true;
    $('settings').hidden = true;
    document.body.dataset.screen = name;
  }

  setPaused(p, match) {
    $('pause').hidden = !p;
    if (p && match) this.statsTable($('pause-table'), match.fighters.map((f) => ({ name: f.name, hero: f.def.id, heroName: f.def.name, team: f.team, isPlayer: f.isPlayer, ...f.stats })));
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { t.hidden = true; }, 5000);
  }

  // -------------------------------------------------------- configuración --
  // Dibuja un control por cada entrada de SECTIONS; cada uno guarda su valor al tocarlo.
  buildSettings() {
    const body = $('settings-body');
    this.setRefresh = [];
    for (const sec of SECTIONS) {
      body.append(el('h3', 'set-sec', sec.title));
      for (const it of sec.items) {
        const row = el('div', 'set-row');
        const id = 'set-' + it.k;
        const ctl = el('div', 'set-ctl');
        if (it.type === 'seg') {
          row.append(el('span', 'lbl', it.label));
          const seg = el('div', 'seg');
          seg.setAttribute('role', 'group');
          seg.setAttribute('aria-label', it.label);
          for (const [v, text] of it.opts) {
            const b = el('button', '', text);
            b.type = 'button';
            b.addEventListener('click', () => setSetting(it.k, v));
            seg.append(b);
            this.setRefresh.push(() => b.setAttribute('aria-pressed', String(settings[it.k] === v)));
          }
          ctl.append(seg);
        } else if (it.type === 'toggle') {
          const b = el('button', 'sw');
          b.type = 'button';
          b.id = id;
          b.setAttribute('role', 'switch');
          b.setAttribute('aria-label', it.label);
          b.addEventListener('click', () => setSetting(it.k, !settings[it.k]));
          row.append(el('span', 'lbl', it.label));
          ctl.append(b);
          this.setRefresh.push(() => b.setAttribute('aria-checked', String(!!settings[it.k])));
        } else if (it.type === 'range') {
          const lab = el('label', '', it.label);
          lab.htmlFor = id;
          const inp = el('input');
          Object.assign(inp, { type: 'range', id, min: it.min, max: it.max, step: it.step });
          const out = el('output');
          inp.addEventListener('input', () => setSetting(it.k, Number(inp.value)));
          row.append(lab);
          ctl.append(inp, out);
          this.setRefresh.push(() => { inp.value = settings[it.k]; out.textContent = it.fmt(settings[it.k]); });
        } else {
          const lab = el('label', '', it.label);
          lab.htmlFor = id;
          const inp = el('input');
          Object.assign(inp, { type: 'text', id, maxLength: it.max, autocomplete: 'off', spellcheck: false });
          inp.addEventListener('change', () => {
            setSetting(it.k, inp.value.trim().slice(0, it.max) || 'Vos');
            inp.value = settings[it.k];
          });
          row.append(lab);
          ctl.append(inp);
          this.setRefresh.push(() => { if (document.activeElement !== inp) inp.value = settings[it.k]; });
        }
        row.append(ctl);
        if (it.note) row.append(el('p', 'note', it.note));
        body.append(row);
      }
    }
    $('settings-reset').addEventListener('click', () => resetSettings());
    $('settings-done').addEventListener('click', () => this.closeSettings());
  }

  openSettings() {
    for (const fn of this.setRefresh) fn();
    $('pause').hidden = true;
    $('settings').hidden = false;
    $('settings-done').focus();
  }

  closeSettings() {
    if ($('settings').hidden) return false;
    document.activeElement?.blur?.(); // confirma el nombre si quedó a medio escribir
    $('settings').hidden = true;
    this.onSettingsClose();
    return true;
  }

  get settingsOpen() { return !$('settings').hidden; }

  // Lleva la configuración a la página: tamaños, colores de equipo y qué se muestra.
  applySettings() {
    const s = settings, root = document.documentElement.style, pal = TEAM_PALETTES[s.teamColors] || TEAM_PALETTES.clasico;
    this.hs = s.hudScale;
    root.setProperty('--hs', s.hudScale);
    root.setProperty('--btn-scale', s.btnScale);
    root.setProperty('--t0', pal[0].css);
    root.setProperty('--t0l', pal[0].light);
    root.setProperty('--t1', pal[1].css);
    root.setProperty('--t1l', pal[1].light);
    const c = document.body.classList;
    c.toggle('no-names', !s.names);
    c.toggle('no-minimap', !s.minimap);
    c.toggle('no-teams', !s.teamPanels);
    c.toggle('lefty', s.lefty);
    $('fps').hidden = !s.fps;
    $('btn-mute').classList.toggle('off', s.muted);
    for (const fn of this.setRefresh) fn();
    this.mapDirty = true;
  }

  // ------------------------------------------------------------------ HUD --
  // Arma lo que depende de quiénes juegan: tarjeta propia, paneles de equipo y minimapa.
  bindMatch(match) {
    const p = match.player;
    this.last = {};
    $('me-img').src = this.portraits[p.def.id] || '';
    $('me-name').textContent = p.name;
    $('me-hero').textContent = p.def.name;
    $('super-name').textContent = p.def.super.name;
    this.team = [];
    for (let t = 0; t < 2; t++) $('team-' + t).textContent = '';
    for (const f of match.fighters) {
      if (f.isPlayer) continue;
      const row = el('div', `tm hud-box t${f.team}`);
      const img = el('img');
      img.alt = '';
      img.src = this.portraits[f.def.id] || '';
      const body = el('div', 'tm-b');
      const hp = el('div', 'tm-hp'), fill = el('i');
      hp.append(fill);
      body.append(el('span', 'tm-n', f.name), hp);
      const cores = el('span', 'tm-c'), dead = el('span', 'tm-x');
      row.append(img, body, cores, dead);
      $('team-' + f.team).append(row);
      this.team.push({ f, row, fill, cores, dead, hp: -1, c: -1, x: -1, seen: null });
    }
    // Minimapa: el fondo de baldosas se dibuja aparte y se rehace solo cuando cambia el mapa.
    // Hay dos fondos: el del mapa fijo y uno más grande para el redondo, que va con aumento.
    const w = match.world, cv = $('minimap');
    const touch = document.body.classList.contains('touch');
    const cell = touch ? 4 : 6;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = cell * dpr, kR = k * ROUND.zoom;
    const canvas = (s) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w.W * s), height: Math.ceil(w.H * s) });
    this.map = {
      cv, ctx: cv.getContext('2d'), w, cell, dpr, k, kR, d: touch ? ROUND.touch : ROUND.desk,
      bg: canvas(k), bgR: canvas(kR), ver: -1, verR: -1, round: null,
    };
    this.setMapShape(false);
    this.mapDirty = true;
    this.hudT = 0;
    this.clockN = -1;
    this.setClock(0);
  }

  // Fijo (vista de arriba): el mapa entero con el norte arriba. Redondo (vistas con cámara
  // propia): centrado en el jugador y girado para que lo que tenés adelante quede arriba.
  setMapShape(round) {
    const m = this.map, cssW = round ? m.d : m.w.W * m.cell, cssH = round ? m.d : m.w.H * m.cell;
    m.round = round;
    m.cv.style.width = cssW + 'px';
    m.cv.style.height = cssH + 'px';
    m.cv.width = Math.round(cssW * m.dpr);
    m.cv.height = Math.round(cssH * m.dpr);
    m.cv.classList.toggle('round', round);
  }

  // Pinta las baldosas del fondo que está en uso. Solo se llama cuando cambia el mapa.
  drawMapBackground(w) {
    const m = this.map, cv = m.round ? m.bgR : m.bg, k = m.round ? m.kR : m.k, g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = MAP_FLOOR;
    g.fillRect(0, 0, cv.width, cv.height);
    for (let r = 0; r < w.H; r++)
      for (let c = 0; c < w.W; c++) {
        const t = w.type(c, r);
        if (!MAP_COLORS[t]) continue;
        g.fillStyle = MAP_COLORS[t];
        g.fillRect(Math.floor(c * k), Math.floor(r * k), Math.ceil(k), Math.ceil(k));
      }
    if (m.round) m.verR = w.version;
    else m.ver = w.version;
  }

  drawMap(match) {
    const m = this.map, w = match.world, g = m.ctx, k = m.k;
    const round = match.camMode !== 'arriba';
    if (round !== m.round) this.setMapShape(round);
    if (this.mapDirty) { m.ver = m.verR = -1; this.mapDirty = false; }
    if ((round ? m.verR : m.ver) !== w.version) this.drawMapBackground(w);
    if (round) return this.drawRoundMap(match);
    g.drawImage(m.bg, 0, 0);
    const pal = TEAM_PALETTES[settings.teamColors] || TEAM_PALETTES.clasico;
    const dot = (x, z, r, color, ring) => {
      g.beginPath();
      g.arc((x + w.W / 2) * k, (z + w.H / 2) * k, r * k, 0, 6.3);
      g.fillStyle = color;
      g.fill();
      if (ring) { g.lineWidth = k * 0.22; g.strokeStyle = ring; g.stroke(); }
    };
    for (const c of match.cores) if (c.landed) dot(c.x, c.z, 0.38, '#c8ff3a');
    for (const f of match.fighters) {
      if (!f.alive || f.isPlayer) continue;
      if (f.team === 0) dot(f.x, f.z, 0.62, pal[0].css, '#06101e');
      else if (f.visTo[0]) dot(f.x, f.z, 0.62, pal[1].css, '#06101e');
    }
    const p = match.player;
    if (p.alive) dot(p.x, p.z, 0.78, '#ffd23f', '#1c1500');
  }

  drawRoundMap(match) {
    const m = this.map, w = match.world, g = m.ctx, p = match.player, dpr = m.dpr;
    const D = m.cv.width, r = D / 2, s = m.kR; // s: píxeles del lienzo por baldosa
    const edge = r - 3 * dpr; // hasta dónde llegan los puntos de lo que queda fuera del círculo
    // Ángulo de giro: con yaw = PI (mirando hacia -z) el mapa queda como el fijo, con el norte arriba.
    const th = match.yaw - Math.PI, cos = Math.cos(th), sin = Math.sin(th);
    const pal = TEAM_PALETTES[settings.teamColors] || TEAM_PALETTES.clasico;
    g.clearRect(0, 0, D, D);
    g.save();
    g.beginPath();
    g.arc(r, r, r - dpr, 0, 6.3);
    g.clip();
    g.fillStyle = 'rgba(14, 34, 46, 0.88)'; // fuera de la arena: agua
    g.fillRect(0, 0, D, D);
    // Las baldosas no se redibujan: se gira la imagen ya pintada con la transformación del lienzo.
    g.translate(r, r);
    g.rotate(th);
    g.drawImage(m.bgR, -(p.x + w.W / 2) * s, -(p.z + w.H / 2) * s);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Cono suave hacia adelante, del ancho del campo de visión.
    const half = Math.min(1.1, Math.max(0.45, ((match.fovUser - (match.camMode === 'hombro' ? 8 : 0)) * Math.PI) / 360));
    const cone = g.createRadialGradient(r, r, 0, r, r, r * 0.95);
    cone.addColorStop(0, 'rgba(255, 226, 120, 0.42)');
    cone.addColorStop(1, 'rgba(255, 226, 120, 0)');
    g.beginPath();
    g.moveTo(r, r);
    g.arc(r, r, r * 0.95, -Math.PI / 2 - half, -Math.PI / 2 + half);
    g.closePath();
    g.fillStyle = cone;
    g.fill();
    // Lo que queda fuera del círculo se marca en el borde, más chico, para saber hacia dónde está.
    const dot = (x, z, rad, color, ring) => {
      const dx = (x - p.x) * s, dz = (z - p.z) * s;
      let sx = dx * cos - dz * sin, sy = dx * sin + dz * cos;
      const d = Math.hypot(sx, sy), out = d > edge;
      if (out) { sx *= edge / d; sy *= edge / d; }
      g.globalAlpha = out ? 0.8 : 1;
      g.beginPath();
      g.arc(r + sx, r + sy, rad * s * (out ? 0.7 : 1), 0, 6.3);
      g.fillStyle = color;
      g.fill();
      if (ring) { g.lineWidth = 1.2 * dpr; g.strokeStyle = ring; g.stroke(); }
      g.globalAlpha = 1;
    };
    for (const c of match.cores) if (c.landed) dot(c.x, c.z, 0.38, '#c8ff3a');
    for (const f of match.fighters) {
      if (!f.alive || f.isPlayer) continue;
      if (f.team === 0) dot(f.x, f.z, 0.62, pal[0].css, '#06101e');
      else if (f.visTo[0]) dot(f.x, f.z, 0.62, pal[1].css, '#06101e');
    }
    // Jugador: flecha fija en el centro, siempre apuntando hacia arriba.
    const a = 1.05 * s;
    g.beginPath();
    g.moveTo(r, r - a);
    g.lineTo(r + a * 0.72, r + a * 0.7);
    g.lineTo(r, r + a * 0.3);
    g.lineTo(r - a * 0.72, r + a * 0.7);
    g.closePath();
    g.fillStyle = '#ffd23f';
    g.fill();
    g.lineWidth = 1.4 * dpr;
    g.strokeStyle = '#1c1500';
    g.stroke();
    g.restore();
    // Borde y norte: la N gira con el mapa y siempre queda pegada al borde.
    g.lineWidth = 2 * dpr;
    g.strokeStyle = 'rgba(8, 12, 20, 0.7)';
    g.beginPath();
    g.arc(r, r, r - dpr, 0, 6.3);
    g.stroke();
    const nr = r - 7 * dpr, nx = r + sin * nr, ny = r - cos * nr;
    g.beginPath();
    g.arc(nx, ny, 6.5 * dpr, 0, 6.3);
    g.fillStyle = 'rgba(8, 12, 20, 0.85)';
    g.fill();
    g.fillStyle = '#fff';
    g.font = `800 ${Math.round(9 * dpr)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', nx, ny + 0.5 * dpr);
  }

  // Una vez por cuadro, al final de la vista. Lo caro (paneles, minimapa) va más espaciado.
  frame(match, dt) {
    const p = match.player, L = this.last;
    const hp = Math.ceil(p.hp);
    if (hp !== L.hp) {
      L.hp = hp;
      $('me-hp-fill').style.width = (100 * hp) / p.maxHp + '%';
      $('me-hp-num').textContent = `${hp} / ${p.maxHp}`;
      $('me-hp').classList.toggle('low', hp < p.maxHp * 0.3);
    }
    const am = Math.round(p.ammo * 20);
    if (am !== L.ammo) {
      L.ammo = am;
      // misma munición en la tarjeta y debajo de la mira
      for (const box of [$('me-ammo'), document.querySelector('#crosshair .ch-ammo')]) {
        const segs = box.children;
        for (let i = 0; i < segs.length; i++) {
          const v = Math.max(0, Math.min(1, p.ammo - i));
          segs[i].firstChild.style.width = v * 100 + '%';
          segs[i].classList.toggle('full', v >= 1);
        }
      }
      $('crosshair').classList.toggle('empty', p.ammo < 1);
    }
    const kick = p.kick > 0.55;
    if (kick !== L.kick) { L.kick = kick; $('crosshair').classList.toggle('kick', kick); }
    // en primera persona el escudo de reaparición se ve como un borde celeste en la pantalla
    const shield = match.camMode === 'primera' && p.alive && p.shieldT > 0;
    if (shield !== L.shield) { L.shield = shield; this.hud.classList.toggle('shielded', shield); }
    if (p.cores !== L.cores) {
      L.cores = p.cores;
      $('me-cores').hidden = p.cores === 0;
      $('me-cores').textContent = p.cores;
    }
    const sec = Math.floor(match.time);
    if (sec !== this.clockN) this.setClock(sec);
    // El mapa redondo gira con la cámara: espaciado se vería a los saltos. Es barato (una imagen
    // girada y unos puntos), así que va en cada cuadro; el fijo sigue con el resto del HUD.
    const roundMap = match.camMode !== 'arriba';
    if (settings.minimap && roundMap) this.drawMap(match);
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.12;
    for (const t of this.team) {
      const f = t.f, seen = f.team === 0 || f.visTo[0];
      if (seen !== t.seen) { t.seen = seen; t.row.classList.toggle('unseen', !seen); }
      // De un rival escondido se muestra lo último que se le vio.
      if (seen || !f.alive) {
        const hpF = f.alive ? Math.round((f.hp / f.maxHp) * 50) : 0;
        if (hpF !== t.hp) { t.hp = hpF; t.fill.style.width = hpF * 2 + '%'; }
        if (f.cores !== t.c) { t.c = f.cores; t.cores.textContent = f.cores || ''; }
      }
      const x = f.alive ? 0 : Math.max(1, Math.ceil(f.respawnT));
      if (x !== t.x) { t.x = x; t.row.classList.toggle('dead', x > 0); t.dead.textContent = x || ''; }
    }
    if (settings.minimap && !roundMap) this.drawMap(match);
  }

  setClock(sec) {
    this.clockN = sec;
    $('clock').textContent = clock(sec);
  }

  setFps(n) { $('fps').textContent = n + ' fps'; }

  // Vista que se está mostrando: decide si hay mira en el centro de la pantalla.
  setView(mode) { document.body.dataset.view = mode; }

  setLockHint(on) { $('lockhint').hidden = !on; }

  // Posición en pantalla del jugador: ahí se centra el aviso de daño.
  anchor(x, y) { $('hitdir').style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; }

  // Aro sobre el rival al que iría el disparo automático en táctil. size: diámetro en píxeles.
  aimMark(x, y, size, on) {
    const box = $('aimmark');
    if (on !== this.markOn) { this.markOn = on; box.style.display = on ? 'block' : 'none'; }
    if (on) box.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    if (on && Math.abs(size - (this.markSize || 0)) > 0.5) {
      this.markSize = size;
      box.style.setProperty('--d', size.toFixed(1) + 'px');
    }
  }

  // dx, dz: dirección del mundo hacia la que empujó el golpe. yaw: hacia dónde mira la cámara
  // (PI en la vista de arriba, donde "arriba en la pantalla" es -z).
  hitFrom(dx, dz, yaw = Math.PI) {
    if (!settings.hitDir) return;
    const box = $('hitdir');
    while (box.children.length > 3) box.firstChild.remove();
    const arc = el('i');
    // el arco apunta arriba; se gira hacia el lado del que vino el golpe (contrario al empujón)
    arc.style.transform = `rotate(${((yaw - Math.atan2(-dx, -dz)) * 180) / Math.PI}deg)`;
    arc.addEventListener('animationend', () => arc.remove());
    box.append(arc);
  }

  makeTag(f) {
    const ui = this;
    const root = el('div', `tag t${f.team}${f.isPlayer ? ' me' : ''}`);
    const name = el('div', 'tag-name', f.name);
    const hp = el('div', 'tag-hp');
    const fill = el('i');
    const num = el('b');
    hp.append(fill, num);
    const cores = el('div', 'tag-cores');
    cores.hidden = true;
    root.append(cores, name, hp);
    let ammo = null;
    if (f.isPlayer) {
      ammo = el('div', 'tag-ammo');
      for (let i = 0; i < RULES.ammoMax; i++) {
        const seg = el('i');
        seg.append(el('u'));
        ammo.append(seg);
      }
      root.append(ammo);
    }
    root.style.display = 'none';
    this.layer.append(root);
    const c = { hp: -1, cores: -1, ammo: -1, vis: false, stealth: false };
    return {
      // k: escala extra (las etiquetas lejanas se achican en las vistas con cámara propia)
      place(x, y, vis, k = 1) {
        if (vis !== c.vis) { c.vis = vis; root.style.display = vis ? '' : 'none'; }
        if (vis) root.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%) scale(${(ui.hs * k).toFixed(3)})`;
      },
      // resalta al rival al que iría el disparo automático (ayuda de puntería en táctil)
      target(on) { root.classList.toggle('target', on); },
      sync(g) {
        const h = Math.ceil(g.hp);
        if (h !== c.hp) {
          c.hp = h;
          fill.style.width = (100 * h) / g.maxHp + '%';
          num.textContent = h;
        }
        const stealth = g.inBush && g.revealT <= 0;
        if (stealth !== c.stealth) { c.stealth = stealth; root.classList.toggle('stealth', stealth); }
        if (g.cores !== c.cores) {
          c.cores = g.cores;
          cores.hidden = g.cores === 0;
          cores.textContent = g.cores;
        }
        if (ammo) {
          const a = Math.round(g.ammo * 20);
          if (a !== c.ammo) {
            c.ammo = a;
            for (let i = 0; i < RULES.ammoMax; i++) {
              const v = Math.max(0, Math.min(1, g.ammo - i));
              ammo.children[i].firstChild.style.width = v * 100 + '%';
              ammo.children[i].classList.toggle('full', v >= 1);
            }
          }
        }
      },
      remove() { root.remove(); },
    };
  }

  setScore(a, b) {
    const L = this.last;
    [a, b].forEach((v, t) => {
      if (v === L['s' + t]) return;
      const prev = L['s' + t] ?? 0;
      L['s' + t] = v;
      $('score-' + t).textContent = v;
      const pips = $('pips-' + t).children;
      for (let i = 0; i < pips.length; i++) {
        pips[i].classList.toggle('on', i < v);
        pips[i].classList.toggle('new', i < v && i >= prev);
      }
      setTimeout(() => { for (const p of pips) p.classList.remove('new'); }, 250);
    });
  }

  setCountdown(team, n) {
    const b = $('banner');
    if (team < 0) { b.hidden = true; return; }
    b.hidden = false;
    b.className = 't' + team + (n <= 5 ? ' hot' : '');
    b.textContent = `${team === 0 ? 'Tu equipo gana' : 'El rival gana'} en ${n}`;
  }

  big(text, cls) {
    const b = $('big');
    b.textContent = text;
    b.className = cls || '';
    void b.offsetWidth; // reinicia la animación
    b.classList.add('show');
    clearTimeout(this.bigT);
    if (cls !== 'win' && cls !== 'lose') this.bigT = setTimeout(() => b.classList.remove('show'), cls === 'streak' ? 1300 : 900);
  }

  feed(killer, victim) {
    const f = $('feed');
    const row = el('div', 'feed-item');
    const who = (g) => {
      const img = el('img');
      img.alt = '';
      img.src = this.portraits[g.def.id] || '';
      return [img, el('b', 't' + g.team, g.name)];
    };
    if (killer) row.append(...who(killer), el('span', 'vs'));
    row.append(...who(victim));
    if (!killer) row.append(' cayó');
    f.prepend(row);
    while (f.children.length > 4) f.lastChild.remove();
    setTimeout(() => row.remove(), 4200);
  }

  setSuper(frac) {
    const v = Math.round(frac * 100);
    if (v === this.last.sup) return;
    this.last.sup = v;
    this.hud.style.setProperty('--super', v + '%');
    this.hud.style.setProperty('--super-deg', v * 3.6 + 'deg');
    this.hud.classList.toggle('super-ready', v >= 100);
  }

  // by: quién te eliminó (se pasa una vez, al morir).
  setRespawn(n, by) {
    if (by !== undefined) this.killer = by;
    if (n === this.last.resp) return;
    this.last.resp = n;
    const r = $('respawn');
    r.hidden = n == null;
    if (n == null) { this.killer = null; return; }
    r.textContent = '';
    if (this.killer) {
      const line = el('small', '', 'Te eliminó ');
      line.append(el('b', '', this.killer.name), ` (${this.killer.def.name})`);
      r.append(line);
    }
    r.append(el('span', '', `Reaparecés en ${n}`));
  }

  setLowHp(on) {
    if (on === this.last.low) return;
    this.last.low = on;
    $('vignette').classList.toggle('low', on);
  }

  hurt() {
    const v = $('vignette');
    v.classList.remove('on');
    void v.offsetWidth;
    v.classList.add('on');
  }

  resetHud() {
    this.last = {};
    this.team = [];
    $('feed').textContent = '';
    $('hitdir').textContent = '';
    $('big').className = '';
    $('banner').hidden = true;
    $('toast').hidden = true;
    $('vignette').classList.remove('low');
    this.hud.classList.remove('shielded');
    $('lockhint').hidden = true;
    this.aimMark(0, 0, 0, false);
    this.layer.textContent = '';
  }

  // ------------------------------------------------------------ resultados --
  // Tabla de luchadores con bajas, daño y núcleos; marca al mejor de la partida.
  statsTable(box, rows) {
    box.textContent = '';
    const head = el('div', 'res-row head');
    head.append(el('span', '', ''), el('span', '', 'Luchador'), el('span', 'n', 'Bajas'), el('span', 'n', 'Daño'), el('span', 'n', 'Núcleos'));
    box.append(head);
    const score = (f) => f.kills * 600 + f.dmg + f.cores * 400;
    const best = rows.reduce((a, b) => (score(b) > score(a) ? b : a), rows[0]);
    for (const f of rows) {
      const row = el('div', `res-row t${f.team}${f.isPlayer ? ' me' : ''}`);
      const img = el('img', heroById(f.hero).art ? 'art' : '');
      img.alt = '';
      if (this.portraits[f.hero]) img.src = this.portraits[f.hero];
      const who = el('span', 'who');
      const name = el('b', '', f.name);
      if (f === best && score(f) > 0) name.append(el('span', 'mvp', 'MEJOR'));
      who.append(name, el('small', '', f.heroName));
      row.append(img, who, el('span', 'n', f.kills), el('span', 'n', f.dmg.toLocaleString('es-AR')), el('span', 'n', f.cores));
      box.append(row);
    }
  }

  showResults(res) {
    $('res-title').textContent = res.won ? '¡Victoria!' : 'Derrota';
    $('res-title').className = res.won ? 'win' : 'lose';
    $('res-sub').textContent = `Núcleos: ${TEAMS[0].name} ${res.score[0]} · ${TEAMS[1].name} ${res.score[1]} · Duración ${clock(res.time || 0)}`;
    this.statsTable($('res-table'), res.fighters);
    this.show('results');
  }
}
