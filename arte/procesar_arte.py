# Convierte el arte original en los archivos livianos que usa el juego.
# Uso: ARTE_ORIGINALES=/carpeta/con/los/png python3 arte/procesar_arte.py  (desde la raíz del repo)
# Los originales se esperan con el nombre <id>-image.png; los ids están en SRC.
import os, numpy as np
from PIL import Image, ImageDraw, ImageFilter
U=os.environ.get('ARTE_ORIGINALES','arte/originales')+'/'
OUT='public/arte/'; REF='arte/referencias/'
os.makedirs(OUT,exist_ok=True); os.makedirs(REF,exist_ok=True)
SRC={'hoja-tuerca':'3e419a76','guia-tuerca':'62ca7c37','guia-brasa':'30347cb9','guia-nox':'bb32d7f7','guia-pompa':'89765357',
     'tex-arena':'4fbcb025','tex-piedra':'c2994ab8','tex-cajon':'374512b4','tex-pasto':'0cc59fa8','nucleo':'4c952efa','logo':'75a5c3c8',
     'hoja-tajo':'0ef6e144','pose-tajo':'c5a35fba'}
im={k:Image.open(U+v+'-image.png').convert('RGB') for k,v in SRC.items()}
for k,v in im.items():
    r=v.copy(); r.thumbnail((1400,1400)); r.save(REF+k+'.webp',quality=80)

def seamless(img,size):
    a=np.asarray(img.resize((size,size),Image.LANCZOS)).astype(np.float32)
    sh=np.roll(a,(size//2,size//2),(0,1))
    t=np.abs(np.linspace(-1,1,size)); w1=np.clip((1-t)/0.35,0,1); w1=w1*w1*(3-2*w1)
    w=np.minimum.outer(w1,w1)[...,None]
    return Image.fromarray(np.clip(a*w+sh*(1-w),0,255).astype(np.uint8))
seamless(im['tex-arena'],512).save(OUT+'arena.webp',quality=86)
seamless(im['tex-pasto'],512).save(OUT+'pasto.webp',quality=86)
im['tex-piedra'].resize((512,512),Image.LANCZOS).save(OUT+'piedra.webp',quality=86)
im['tex-cajon'].resize((512,512),Image.LANCZOS).save(OUT+'cajon.webp',quality=88)

def cut(img,box,tol=16,shadow=0.0,purple=False,erode=1):
    c=img.crop(box); a=np.asarray(c).astype(np.int32); h,w=a.shape[:2]
    edge=np.concatenate([a[0],a[-1],a[:,0],a[:,-1]]); bg=np.median(edge,axis=0)
    d=np.abs(a-bg).max(axis=2)
    like=d<tol
    if shadow>0:  # sombra gris bajo los pies: gris neutro en la franja inferior
        neutral=(np.abs(a[...,0]-a[...,1])<10)&(np.abs(a[...,1]-a[...,2])<10)&(a.mean(axis=2)>120)
        band=np.zeros((h,w),bool); band[int(h*(1-shadow)):]=True
        like|=neutral&band
    m=Image.fromarray((like*255).astype(np.uint8)).copy(); m.load()
    for x in range(0,w,4):
        for y in (0,h-1):
            if m.getpixel((x,y))==255: ImageDraw.floodfill(m,(x,y),128)
    for y in range(0,h,4):
        for x in (0,w-1):
            if m.getpixel((x,y))==255: ImageDraw.floodfill(m,(x,y),128)
    alpha=Image.fromarray(((np.asarray(m)!=128)*255).astype(np.uint8))
    for _ in range(erode): alpha=alpha.filter(ImageFilter.MinFilter(3))
    alpha=alpha.filter(ImageFilter.GaussianBlur(0.8))
    if shadow>0:  # restos claros de piso en la franja inferior, aunque no toquen el borde
        al=np.asarray(alpha).copy(); al[neutral&band&(a.mean(axis=2)>150)]=0; alpha=Image.fromarray(al).filter(ImageFilter.GaussianBlur(0.6))
    out=c.convert('RGBA'); out.putalpha(alpha)
    return out.crop(alpha.point(lambda v:255 if v>8 else 0).getbbox())
def fit(img,maxh,maxw=10**6):
    r=min(maxh/img.height,maxw/img.width); return img.resize((max(1,round(img.width*r)),max(1,round(img.height*r))),Image.LANCZOS)

fichas={
 'tuerca':cut(im['hoja-tuerca'],(25,20,580,890),tol=14,shadow=0.08),
 'brasa':cut(im['guia-brasa'],(12,598,298,888),tol=16,shadow=0.14),
 'nox':cut(im['guia-nox'],(20,606,270,888),tol=16,shadow=0.14),
 'pompa':cut(im['guia-pompa'],(18,600,268,888),tol=16,shadow=0.14),
 'tajo':cut(im['pose-tajo'],(250,60,960,1254),tol=60,erode=2),
}
for k,v in fichas.items(): fit(v,420).save(OUT+f'ficha-{k}.webp',quality=88)
fit(cut(im['nucleo'],(0,0,1254,1254),tol=70,erode=2),256).save(OUT+'nucleo.webp',quality=90)
fit(cut(im['logo'],(0,0,2172,724),tol=60,erode=2),400,900).save(OUT+'logo.webp',quality=90)

# Materiales de personajes
steel=im['hoja-tuerca'].crop((1240,245,1470,395)).resize((256,256),Image.LANCZOS)
steel.save(OUT+'mat-acero.webp',quality=85)
g=np.asarray(steel.convert('L')).astype(np.float32)/255; g=(g-g.mean())/g.std()
rng=np.random.default_rng(3)
lum=np.clip(1+g*0.16,0.55,1.25)[...,None]
orange=np.array([226,116,30],np.float32)*lum
noise=np.asarray(Image.fromarray((rng.random((32,32))*255).astype(np.uint8)).resize((256,256),Image.BICUBIC)).astype(np.float32)/255
fine=rng.random((256,256))
rust=((noise>0.8)&(fine>0.62))[...,None]
orange=np.where(rust,np.array([92,58,40],np.float32)*(0.8+0.4*fine[...,None]),orange)
Image.fromarray(np.clip(orange,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)).save(OUT+'mat-naranja.webp',quality=85)
lava=im['guia-brasa'].crop((790,700,905,800)).resize((256,256),Image.LANCZOS); lava.save(OUT+'mat-lava.webp',quality=85)
a=np.asarray(lava).astype(np.float32)
hot=np.clip(((a[...,0]-a[...,2])-70)/90,0,1)*np.clip((a[...,0]-120)/80,0,1)
Image.fromarray((a*hot[...,None]).astype(np.uint8)).save(OUT+'mat-lava-brillo.webp',quality=85)
im['guia-nox'].crop((785,640,875,710)).resize((256,256),Image.LANCZOS).save(OUT+'mat-plumas.webp',quality=85)

# Colores de referencia (promedios) para los materiales lisos
def avg(k,b): return '#%02x%02x%02x'%tuple(int(x) for x in np.asarray(im[k].crop(b)).reshape(-1,3).mean(0))
for n,k,b in [('naranja','hoja-tuerca',(260,690,380,730)),('rana','guia-pompa',(95,715,165,740)),('panza','guia-pompa',(100,790,160,830)),('sombrero','guia-pompa',(790,650,830,680)),
  ('cuero','hoja-tajo',(1150,330,1200,400)),('pantalon','hoja-tajo',(1100,640,1160,760)),('piel','hoja-tajo',(110,480,140,540)),('camisa','hoja-tajo',(300,320,340,360)),('pelo','hoja-tajo',(1190,80,1250,130)),
  ('capa','guia-nox',(790,775,870,800)),('plumas','guia-nox',(800,650,860,700)),('crema','guia-nox',(110,790,150,820)),('zapa','hoja-tajo',(160,905,230,935)),('petate','hoja-tajo',(1120,200,1220,240))]:
    print(n,avg(k,b))
tot=0
for f in sorted(os.listdir(OUT)): s=os.path.getsize(OUT+f); tot+=s; print(f, s//1024,'KB', Image.open(OUT+f).size)
print('total KB',tot//1024,'refs KB',sum(os.path.getsize(REF+f) for f in os.listdir(REF))//1024)

# Mapas de relieve (normal maps) derivados del brillo de cada textura.
def normal_map(name, strength, wrap, invert_hot=False):
    a=np.asarray(Image.open(OUT+name+'.webp').convert('RGB')).astype(np.float32)/255
    h=a@np.array([0.299,0.587,0.114],np.float32)
    if invert_hot:  # en la lava, lo que brilla es grieta: va hundido
        hot=np.clip(((a[...,0]-a[...,2])-0.27)/0.35,0,1); h=h*(1-hot)-hot*0.25
    h=np.asarray(Image.fromarray(np.clip(h*255,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))).astype(np.float32)/255
    if wrap:
        dx=(np.roll(h,-1,1)-np.roll(h,1,1))/2; dy=(np.roll(h,-1,0)-np.roll(h,1,0))/2
    else:
        dy,dx=np.gradient(h)
    n=np.stack([-dx*strength,dy*strength,np.ones_like(h)],-1); n/=np.linalg.norm(n,axis=-1,keepdims=True)
    Image.fromarray(((n*0.5+0.5)*255).astype(np.uint8)).save(OUT+name+'-n.webp',quality=92)
normal_map('arena',5,True); normal_map('piedra',9,False); normal_map('cajon',8,False)
normal_map('mat-acero',4,False); normal_map('mat-lava',7,False,invert_hot=True); normal_map('mat-plumas',6,False)
normal_map('pasto',5,True)
