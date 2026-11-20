// Interfaz en DOM: menú, HUD de partida, pausa y resultados.
import { HEROES, RULES, TEAMS, heroById } from './data.js';
import { artUrl } from './assets.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

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
    } catch { /* sin storage */ }
    this.onSelect = () => {};
    this.portraits = {};
    this.bigT = 0;
    this.last = { s0: -1, s1: -1, sup: -1, resp: null };
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
    try { localStorage.setItem('trifulca-hero', id); } catch { /* sin storage */ }
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

  setHints(touch) {
    const t = touch
      ? 'Palanca izquierda: moverte · Botón rojo: tocá para disparar solo o arrastrá para apuntar'
      : 'WASD: moverte · Mouse: apuntar · Clic: disparar · Espacio o clic derecho: súper · Esc: pausa';
    $('keys-hint').textContent = t;
    $('pause-hint').textContent = t;
  }

  show(name) {
    this.menu.hidden = name !== 'menu';
    this.hud.hidden = name !== 'match';
    $('results').hidden = name !== 'results';
    $('pause').hidden = true;
    document.body.dataset.screen = name;
  }

  setPaused(p) { $('pause').hidden = !p; }

  // ------------------------------------------------------------------ HUD --
  makeTag(f) {
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
      place(x, y, vis) {
        if (vis !== c.vis) { c.vis = vis; root.style.display = vis ? '' : 'none'; }
        if (vis) root.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`;
      },
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
    if (a !== L.s0) { L.s0 = a; $('score-0').textContent = a; $('bar-0').style.width = Math.min(100, (a / RULES.goal) * 100) + '%'; }
    if (b !== L.s1) { L.s1 = b; $('score-1').textContent = b; $('bar-1').style.width = Math.min(100, (b / RULES.goal) * 100) + '%'; }
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
    if (cls !== 'win' && cls !== 'lose') this.bigT = setTimeout(() => b.classList.remove('show'), 900);
  }

  feed(killer, victim) {
    const f = $('feed');
    const row = el('div', 'feed-item');
    if (killer) row.append(el('b', 't' + killer.team, killer.name), ' eliminó a ');
    row.append(el('b', 't' + victim.team, victim.name));
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

  setRespawn(n) {
    if (n === this.last.resp) return;
    this.last.resp = n;
    const r = $('respawn');
    r.hidden = n == null;
    if (n != null) r.textContent = `Reaparecés en ${n}`;
  }

  hurt() {
    const v = $('vignette');
    v.classList.remove('on');
    void v.offsetWidth;
    v.classList.add('on');
  }

  resetHud() {
    this.last = { s0: -1, s1: -1, sup: -1, resp: undefined };
    $('feed').textContent = '';
    $('big').className = '';
    $('banner').hidden = true;
    this.layer.textContent = '';
  }

  // ------------------------------------------------------------ resultados --
  showResults(res) {
    $('res-title').textContent = res.won ? '¡Victoria!' : 'Derrota';
    $('res-title').className = res.won ? 'win' : 'lose';
    $('res-sub').textContent = `Núcleos: ${TEAMS[0].name} ${res.score[0]} · ${TEAMS[1].name} ${res.score[1]}`;
    const t = $('res-table');
    t.textContent = '';
    const head = el('div', 'res-row head');
    head.append(el('span', '', ''), el('span', '', 'Luchador'), el('span', 'n', 'Bajas'), el('span', 'n', 'Daño'), el('span', 'n', 'Núcleos'));
    t.append(head);
    for (const f of res.fighters) {
      const row = el('div', `res-row t${f.team}${f.isPlayer ? ' me' : ''}`);
      const img = el('img', heroById(f.hero).art ? 'art' : '');
      img.alt = '';
      if (this.portraits[f.hero]) img.src = this.portraits[f.hero];
      const who = el('span', 'who');
      who.append(el('b', '', f.name), el('small', '', f.heroName));
      row.append(img, who, el('span', 'n', f.kills), el('span', 'n', f.dmg.toLocaleString('es-AR')), el('span', 'n', f.cores));
      t.append(row);
    }
    this.show('results');
  }
}
