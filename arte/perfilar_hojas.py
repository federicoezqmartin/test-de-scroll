# Convierte las hojas de personaje (vistas de frente, perfil y espalda) en lo que usa
# models.js para armar cada cuerpo 3D y pintarlo con su propio dibujo:
#   - public/arte/hoja-<id>.webp : las tres vistas juntas, con el color de la figura
#     extendido hacia el fondo para que no aparezca gris en las orillas;
#   - src/perfiles/<id>.json : la silueta por alturas de cada parte del cuerpo, los puntos
#     de giro (cadera, cuello, hombros) y dónde cae el eje del cuerpo en cada vista.
#
# Uso, desde la raíz del repo:
#   ARTE_ORIGINALES=/carpeta/con/los/png python3 arte/perfilar_hojas.py [id ...]
#   DEBUG_DIR=/alguna/carpeta guarda además una imagen de control por personaje.
import os, sys, json, numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC_DIR = os.environ.get('ARTE_ORIGINALES', 'arte/originales') + '/'
DEBUG = os.environ.get('DEBUG_DIR')

# Todas las medidas están en píxeles de la imagen original.
#   views: rectángulo (x0, y0, x1, y1) de cada vista y la columna por donde pasa el eje del cuerpo.
#   side:  +1 si el perfil mira a la derecha, -1 si mira a la izquierda.
#   parts: filas (y0, y1) que ocupa la parte, ventana en x de la vista de frente que la aísla
#          de sus vecinas, y ventana en la vista de perfil ("S"); sin perfil, "depth" da el
#          fondo como proporción del ancho.
#   piv:   alturas de cadera, cuello y hombros, y columnas de piernas y brazos (vista de frente).
HEROES = {
    # Hojas realistas generadas con ChatGPT (arte/originales/<id>-realista-image.png): frente,
    # perfil mirando a la derecha y espalda, sobre gris parejo. Las medidas salen de un medidor
    # automático; donde la ropa tapa la anatomía (delantal, capa, mangas anchas) se completaron
    # a mano o con proporciones humanas: cuello al 13 %, hombros al 19 % y cadera al 49 %.
    'tuerca': dict(
        src='tuerca-realista', up=1, alto=1.7, top=12, bot=991, side=+1, strict=True,
        views=dict(F=((78, 0, 514, 1024), 290), S=((649, 0, 868, 1024), 763), B=((1013, 0, 1453, 1024), 1238)),
        parts=dict(
            head=dict(rows=(12, 144), F=(214, 366), S=(649, 868)),
            body=dict(rows=(138, 530), F=(233, 363), S=(649, 868)),
            armR=dict(rows=(179, 599), F=(78, 233), depth=0.9),
            armL=dict(rows=(179, 599), F=(363, 514), depth=0.9),
            legR=dict(rows=(472, 991), F=(157, 290), S=(649, 868)),
            legL=dict(rows=(472, 991), F=(290, 423), S=(649, 868)),
        ),
        piv=dict(hip=491, neck=144, shoulder=198, legR=215, legL=363, armR=243, armL=353),
    ),
    'brasa': dict(
        src='brasa-realista', up=1, alto=1.92, top=15, bot=994, side=+1, strict=True,
        views=dict(F=((22, 0, 549, 1024), 285), S=((614, 0, 895, 1024), 748), B=((980, 0, 1496, 1024), 1236)),
        parts=dict(
            head=dict(rows=(15, 147), F=(219, 351), S=(614, 895)),
            body=dict(rows=(141, 533), F=(169, 410), S=(614, 895)),
            armR=dict(rows=(182, 602), F=(22, 169), depth=0.9),
            armL=dict(rows=(182, 602), F=(410, 549), depth=0.9),
            legR=dict(rows=(475, 994), F=(138, 285), S=(614, 895)),
            legL=dict(rows=(475, 994), F=(285, 432), S=(614, 895)),
        ),
        piv=dict(hip=494, neck=147, shoulder=201, legR=196, legL=366, armR=179, armL=400),
    ),
    'nox': dict(
        src='nox-realista', up=1, alto=1.75, top=13, bot=990, side=+1, strict=True,
        views=dict(F=((58, 0, 508, 1024), 283), S=((613, 0, 855, 1024), 742), B=((1014, 0, 1465, 1024), 1239)),
        parts=dict(
            head=dict(rows=(13, 144), F=(213, 353), S=(613, 855)),
            body=dict(rows=(138, 530), F=(128, 439), S=(613, 855)),
            armR=dict(rows=(179, 599), F=(58, 128), depth=0.9),
            armL=dict(rows=(179, 599), F=(439, 508), depth=0.9),
            legR=dict(rows=(472, 990), F=(170, 283), S=(613, 855)),
            legL=dict(rows=(472, 990), F=(283, 396), S=(613, 855)),
        ),
        piv=dict(hip=491, neck=144, shoulder=198, legR=229, legL=337, armR=160, armL=406),
    ),
    'pompa': dict(
        src='pompa-realista', up=1, alto=1.62, top=20, bot=996, side=+1, strict=True,
        views=dict(F=((29, 0, 539, 1024), 272), S=((604, 0, 888, 1024), 754), B=((988, 0, 1498, 1024), 1253)),
        parts=dict(
            head=dict(rows=(20, 151), F=(189, 355), S=(604, 888)),
            body=dict(rows=(145, 537), F=(186, 386), S=(604, 888)),
            armR=dict(rows=(186, 605), F=(29, 186), depth=0.9),
            armL=dict(rows=(186, 605), F=(386, 539), depth=0.9),
            legR=dict(rows=(479, 996), F=(162, 272), S=(604, 888)),
            legL=dict(rows=(479, 996), F=(272, 382), S=(604, 888)),
        ),
        piv=dict(hip=498, neck=151, shoulder=205, legR=218, legL=326, armR=196, armL=376),
    ),
    'zip': dict(
        src='zip-realista', up=1, alto=1.75, top=14, bot=907, side=+1, strict=True,
        views=dict(F=((134, 0, 557, 941), 344), S=((702, 0, 901, 941), 829), B=((1105, 0, 1536, 941), 1324)),
        parts=dict(
            head=dict(rows=(14, 134), F=(283, 405), S=(702, 901)),
            body=dict(rows=(128, 486), F=(244, 446), S=(702, 901)),
            armR=dict(rows=(166, 549), F=(134, 244), depth=0.9),
            armL=dict(rows=(166, 549), F=(446, 557), depth=0.9),
            legR=dict(rows=(434, 907), F=(225, 347), S=(702, 901)),
            legL=dict(rows=(434, 907), F=(347, 465), S=(702, 901)),
        ),
        piv=dict(hip=451, neck=134, shoulder=183, legR=292, legL=403, armR=256, armL=432),
    ),
    # Tajo realista (hoja generada con ChatGPT). La camisa es clara y se parece al gris del
    # fondo: con strict solo cuenta como fondo el gris conectado con el borde. La mochila entra
    # en el fondo del torso, por eso la ventana de perfil del cuerpo arranca bien atrás.
    'tajo': dict(
        src='tajo-realista', up=1, alto=1.85, top=18, bot=908, side=+1, strict=True,
        views=dict(F=((140, 0, 580, 925), 357), S=((640, 0, 960, 925), 805), B=((1090, 0, 1535, 925), 1315)),
        parts=dict(
            head=dict(rows=(18, 142), F=(300, 415), S=(760, 900)),
            body=dict(rows=(136, 520), F=(252, 462), S=(650, 905)),
            armR=dict(rows=(190, 530), F=(140, 252), depth=0.9),
            armL=dict(rows=(190, 530), F=(462, 575), depth=0.9),
            legR=dict(rows=(505, 908), F=(228, 357), S=(735, 912)),
            legL=dict(rows=(505, 908), F=(357, 492), S=(735, 912)),
        ),
        piv=dict(hip=510, neck=142, shoulder=205, legR=296, legL=416, armR=243, armL=471),
    ),
}

PAD = 12  # margen entre vistas dentro de la hoja final


def mask_of(crop, bot_local, strict, glow_floor=0):
    """Silueta de una vista: todo lo que no es el gris del fondo conectado con el borde.
    glow_floor: filas sobre los pies donde el piso está teñido por la luz del personaje
    (la lava de Brasa); ahí cuenta como fondo todo lo claro y poco saturado."""
    a = np.asarray(crop).astype(np.int32)
    h, w = a.shape[:2]
    edge = np.concatenate([a[0], a[:, 0], a[:, -1]])
    bg = np.median(edge, axis=0)
    like = np.abs(a - bg).max(axis=2) < (14 if strict else 18)
    # Sombra sobre el piso: gris neutro, más oscuro que el fondo, cerca de los pies.
    neutral = (np.abs(a[..., 0] - a[..., 1]) < 12) & (np.abs(a[..., 1] - a[..., 2]) < 12) & (a.mean(axis=2) > (150 if strict else 120))
    band = np.zeros((h, w), bool)
    band[max(0, bot_local - 26):] = True
    like |= neutral & band
    if glow_floor:
        lit = (a.mean(axis=2) > 135) & ((a.max(axis=2) - a.min(axis=2)) < 70)
        low = np.zeros((h, w), bool)
        low[max(0, bot_local - glow_floor):] = True
        like |= lit & low
    like[min(h, bot_local + 1):] = True  # debajo de los pies no hay figura
    m = Image.fromarray((like * 255).astype(np.uint8)).copy()
    m.load()
    for x in range(0, w, 2):
        for y in (0, h - 1):
            if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
    for y in range(0, h, 2):
        for x in (0, w - 1):
            if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
    outside = np.asarray(m) == 128
    if not strict:
        # Huecos encerrados (entre un brazo y el cuerpo, entre las piernas): también son fondo.
        # No se hace con Tuerca, cuyo acero claro se confunde con el gris del fondo.
        outside = outside | like
    fg = Image.fromarray(((~outside) * 255).astype(np.uint8))
    # Cierra entradas finas del fondo en bordes de color parecido (brillos del metal).
    fg = fg.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MedianFilter(5))
    return fg


def spread(rgb, known, rounds):
    """Extiende el color de la figura hacia afuera, para muestrear sin que entre el fondo."""
    rgb = rgb.astype(np.float32).copy()
    known = known.copy()
    for _ in range(rounds):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0: continue
                k = np.roll(np.roll(known, dy, 0), dx, 1)
                acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * k[..., None]
                cnt += k
        new = (~known) & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        known |= new
    return np.clip(rgb, 0, 255).astype(np.uint8)


def span(row, x0, x1):
    x0 = int(max(0, x0)); x1 = int(min(len(row) - 1, x1))
    xs = np.where(row[x0:x1 + 1])[0]
    return None if len(xs) < 2 else (xs[0] + x0, xs[-1] + x0)


def build(hid, cfg):
    im = Image.open(SRC_DIR + cfg['src'] + '-image.png').convert('RGB')
    up = cfg['up']
    cells, x_at = {}, PAD
    y0 = min(v[0][1] for v in cfg['views'].values())
    y1 = max(v[0][3] for v in cfg['views'].values())
    H = int(round((y1 - y0) * up))
    for name in 'FSB':
        (rx0, _, rx1, _), axis = cfg['views'][name]
        crop = im.crop((rx0, y0, rx1, y1))
        fg = mask_of(crop, cfg['bot'] - y0, cfg.get('strict', False), int(cfg.get('glow_floor', 0)))
        size = (int(round((rx1 - rx0) * up)), H)
        cells[name] = dict(img=crop.resize(size, Image.LANCZOS), fg=fg.resize(size, Image.BILINEAR), x=x_at, rx0=rx0, axis=axis)
        x_at += size[0] + PAD
    W = x_at
    atlas = Image.new('RGB', (W, H), (128, 128, 128))
    fg = np.zeros((H, W), bool)
    for c in cells.values():
        atlas.paste(c['img'], (c['x'], 0))
        m = np.asarray(c['fg']) > 127
        fg[:, c['x']:c['x'] + m.shape[1]] = m
    # El borde de la figura viene mezclado con el fondo: se descarta antes de extender el color.
    core = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3 if up < 1 else 7))) > 127
    out = spread(np.asarray(atlas), core, 40)
    Image.fromarray(out).save(f'public/arte/hoja-{hid}.webp', quality=90)

    ax = lambda v, x: cells[v]['x'] + (x - cells[v]['rx0']) * up   # columna original -> columna de la hoja
    ay = lambda y: (y - y0) * up                                    # fila original -> fila de la hoja
    U = cfg['alto'] / ((cfg['bot'] - cfg['top']) * up)              # unidades del juego por píxel de la hoja
    bot = ay(cfg['bot'])
    cxF, czS, cxB = ax('F', cells['F']['axis']), ax('S', cells['S']['axis']), ax('B', cells['B']['axis'])
    sgn = cfg['side']

    dbg = Image.fromarray(out).convert('RGB') if DEBUG else None
    dr = ImageDraw.Draw(dbg) if dbg else None
    colors = dict(head=(255, 0, 255), body=(0, 255, 255), armR=(255, 255, 0), armL=(255, 160, 0), legR=(0, 255, 0), legL=(255, 80, 80))
    parts = {}
    for pname, p in cfg['parts'].items():
        r0, r1 = ay(p['rows'][0]), ay(p['rows'][1])
        rows = []
        ys = list(np.arange(r0, r1, 5)) + [r1]
        for y in ys:
            yi = int(min(H - 1, round(y)))
            f = span(fg[yi], ax('F', p['F'][0]), ax('F', p['F'][1]))
            if f is None: continue
            cx = ((f[0] + f[1]) / 2 - cxF) * U
            hw = max(3, (f[1] - f[0]) / 2) * U
            s = span(fg[yi], ax('S', p['S'][0]), ax('S', p['S'][1])) if 'S' in p else None
            if s is not None:
                cz = sgn * ((s[0] + s[1]) / 2 - czS) * U
                hd = max(3, (s[1] - s[0]) / 2) * U
            else:
                cz = p.get('cz', 0.0)
                hd = hw * p.get('depth', 0.9)
            rows.append([(bot - y) * U, cx, hw, cz, hd])
            if dr:
                dr.line([(f[0], yi), (f[1], yi)], fill=colors[pname])
                if s is not None: dr.line([(s[0], yi), (s[1], yi)], fill=colors[pname])
        r = np.array(rows)
        if pname.startswith('leg'):  # una sombra pegada al pie no debe ensancharlo
            for c in (2, 4):
                r[:, c] = np.minimum(r[:, c], np.median(r[:, c]) * 1.2)
        sm = r.copy()  # suaviza para que no queden escalones
        for c in range(1, 5):
            v = np.pad(r[:, c], 1, mode='edge')
            sm[:, c] = (v[:-2] + 2 * v[1:-1] + v[2:]) / 4
        parts[pname] = [[round(float(v), 4) for v in row] for row in sm]

    pv = cfg['piv']
    yu = lambda y: round((cfg['bot'] - y) * up * U, 4)
    xu = lambda x: round((ax('F', x) - cxF) * U, 4)
    data = dict(
        alto=cfg['alto'], hoja=[W, H], u=round(U, 6), bot=round(bot, 2), cxF=round(cxF, 2), cxB=round(cxB, 2), czS=round(czS, 2), side=sgn,
        piv=dict(hip=yu(pv['hip']), neck=yu(pv['neck']), shoulder=yu(pv['shoulder']),
                 legR=xu(pv['legR']), legL=xu(pv['legL']), armR=xu(pv['armR']), armL=xu(pv['armL'])),
        parts=parts,
    )
    os.makedirs('src/perfiles', exist_ok=True)
    json.dump(data, open(f'src/perfiles/{hid}.json', 'w'), separators=(',', ':'))
    if dbg:
        for x in (cxF, czS, cxB): dr.line([(x, 0), (x, H)], fill=(255, 255, 255))
        dr.line([(0, bot), (W, bot)], fill=(255, 255, 255))
        for k in ('hip', 'neck', 'shoulder'):
            y = ay(pv[k]); dr.line([(cells['F']['x'], y), (cells['F']['x'] + 60, y)], fill=(255, 255, 255), width=2)
        dbg.save(f'{DEBUG}/perfil-{hid}.png')
    kb = lambda f: os.path.getsize(f) // 1024
    print(hid, 'hoja', (W, H), kb(f'public/arte/hoja-{hid}.webp'), 'KB · perfil', kb(f'src/perfiles/{hid}.json'), 'KB ·', {k: len(v) for k, v in parts.items()})


if __name__ == '__main__':
    for hid in (sys.argv[1:] or HEROES):
        build(hid, HEROES[hid])
