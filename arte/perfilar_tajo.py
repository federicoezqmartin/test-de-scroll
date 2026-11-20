# Convierte la hoja de Tajo (frente, perfil, espalda) en:
#   - public/arte/tajo-hoja.webp : la hoja con el fondo rellenado con los colores del borde,
#     para proyectarla sobre el modelo sin que aparezca gris en las orillas;
#   - src/tajo-perfil.json : la silueta por alturas de cada parte del cuerpo, con la que
#     models.js arma el cuerpo 3D.
# Uso: ARTE_ORIGINALES=/carpeta/con/los/png python3 arte/perfilar_tajo.py  (desde la raíz del repo)
import os, json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
SRC=os.environ.get('ARTE_ORIGINALES','arte/originales')+'/0ef6e144-image.png'
im=Image.open(SRC).convert('RGB'); a=np.asarray(im).astype(np.int32); HI,WI=a.shape[:2]

# --- silueta -------------------------------------------------------------------
edge=np.concatenate([a[0],a[-1],a[:,0],a[:,-1]]); bg=np.median(edge,axis=0)
like=np.abs(a-bg).max(axis=2)<16
m=Image.fromarray((like*255).astype(np.uint8)).copy(); m.load()
for x in range(0,WI,3):
    for y in (0,HI-1):
        if m.getpixel((x,y))==255: ImageDraw.floodfill(m,(x,y),128)
for y in range(0,HI,3):
    for x in (0,WI-1):
        if m.getpixel((x,y))==255: ImageDraw.floodfill(m,(x,y),128)
# El hueco entre las piernas queda encerrado (no toca el borde): se marca a mano en frente y espalda.
for sx in (296,1212):
    for sy in (640,750,860,930):
        if m.getpixel((sx,sy))==255: ImageDraw.floodfill(m,(sx,sy),128)
fg=np.asarray(Image.fromarray(((np.asarray(m)!=128)*255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5)))>127

# --- hoja para proyectar: el color de la figura se extiende hacia el fondo ------
core=np.asarray(Image.fromarray((fg*255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)))>127
rgb=a.astype(np.float32).copy(); known=core.copy()
for it in range(46):
    acc=np.zeros_like(rgb); cnt=np.zeros(known.shape,np.float32)
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            if dx==0 and dy==0: continue
            k=np.roll(np.roll(known,dy,0),dx,1)
            acc+=np.roll(np.roll(rgb,dy,0),dx,1)*k[...,None]; cnt+=k
    new=(~known)&(cnt>0)
    rgb[new]=acc[new]/cnt[new][:,None]; known|=new
Image.fromarray(np.clip(rgb,0,255).astype(np.uint8)).save('public/arte/tajo-hoja.webp',quality=88)

# --- medidas -------------------------------------------------------------------
TOP,BOT=23,972            # coronilla y suela, en px
ALTO=2.0                  # alto del modelo, en unidades del juego
U=ALTO/(BOT-TOP)          # unidades por px
CXF,CXB,CZS=296,1212,775  # eje del cuerpo en cada vista (frente, espalda, perfil)

def lerp_tab(tab,y):
    for (y0,v0),(y1,v1) in zip(tab,tab[1:]):
        if y0<=y<=y1: return v0+(v1-v0)*(y-y0)/max(1,y1-y0)
    return tab[0][1] if y<tab[0][0] else tab[-1][1]
def span(row,x0,x1):
    xs=np.where(row[int(max(0,x0)):int(x1)+1])[0]
    return None if len(xs)<2 else (xs[0]+int(max(0,x0)), xs[-1]+int(max(0,x0)))

def front_span(part,y):
    r=fg[min(y,955) if part.startswith('leg') else y]
    if part=='head':
        h=lerp_tab([(23,70),(150,70),(165,46),(200,40)],y); return span(r,CXF-h,CXF+h)
    if part=='body':
        h=lerp_tab([(196,42),(215,74),(236,93),(520,93),(535,110),(605,112)],y); return span(r,CXF-h,CXF+h)
    if part=='armR':   # su brazo derecho: a la izquierda de la imagen
        b=203 if y<372 else lerp_tab([(372,190),(420,185),(460,170),(500,165),(540,160),(592,160)],y); return span(r,80,b)
    if part=='armL':
        b=391 if y<372 else lerp_tab([(372,413),(400,414),(420,427),(440,438),(460,447),(480,448),(500,425),(520,424),(540,424),(560,440),(592,440)],y); return span(r,b,520)
    lim=140 if y<600 else 0                  # a la altura de la cadera, sin las manos
    if part=='legR': return span(r,80+lim*0.6,262 if y>=912 else CXF+1)
    if part=='legL': return span(r,335 if y>=912 else CXF+1,520-lim*0.6)
def side_span(part,y):
    r=fg[min(y,955) if part.startswith('leg') else y]
    if part=='head': return span(r,700,895)
    if part=='body': return span(r,596 if y<=432 else 697,895)
    if part.startswith('leg'): return span(r,596,895)
    return None

RANGES={'head':(23,200),'body':(196,605),'armR':(258,592),'armL':(258,592),'legR':(556,972),'legL':(556,972)}
parts={}
for part,(y0,y1) in RANGES.items():
    rows=[]
    for y in list(range(y0,y1,6))+[y1]:
        f=front_span(part,y)
        if f is None: continue
        cx=((f[0]+f[1])/2-CXF)*U; hw=max(2,(f[1]-f[0])/2)*U
        s=side_span(part,y)
        if s is not None: cz=((s[0]+s[1])/2-CZS)*U; hd=max(2,(s[1]-s[0])/2)*U
        else: cz=8*U; hd=min(hw*0.95,30*U)   # brazos: no se distinguen en el perfil
        if part=='body' and y>545:             # la pelvis se angosta y queda metida entre las piernas
            k=1-0.5*(y-545)/60; hw*=k; hd*=k
        rows.append([(BOT-y)*U,cx,hw,cz,hd])
    r=np.array(rows)
    sm=r.copy()                                # suaviza un poco para que no queden escalones
    for c in range(1,5):
        v=np.pad(r[:,c],1,mode='edge'); sm[:,c]=(v[:-2]+2*v[1:-1]+v[2:])/4
    parts[part]=[[round(float(v),4) for v in row] for row in sm]
data={'alto':ALTO,'hoja':[WI,HI],'u':round(U,6),'top':TOP,'bot':BOT,'cxF':CXF,'cxB':CXB,'czS':CZS,'parts':parts}
json.dump(data,open('src/tajo-perfil.json','w'),separators=(',',':'))
print({k:len(v) for k,v in parts.items()}, os.path.getsize('src/tajo-perfil.json')//1024,'KB json', os.path.getsize('public/arte/tajo-hoja.webp')//1024,'KB hoja')
