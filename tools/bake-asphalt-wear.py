"""Bake a seamless 16 m asphalt fracture map; the mineral grain is sampled separately."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


SIZE, METRES = 1024, 16
OUT = Path(__file__).resolve().parents[1] / 'yard/assets/surfaces/asphalt-wear.webp'


def bake():
    rng = np.random.default_rng(1426)
    size = 2 * SIZE
    cavities = Image.new('L', (size, size))
    repairs = Image.new('L', (size, size))

    def fracture(anchors, width, sealed=False):
        """Widths are in metres. Break up each segment on successively finer scales."""
        line = np.asarray(anchors, dtype=float)
        for _ in range(6):
            spans = np.diff(line, axis=0)
            perp = np.column_stack([-spans[:, 1], spans[:, 0]])
            midpoint = (line[:-1] + line[1:]) / 2 + perp * rng.uniform(-.18, .18, (len(spans), 1))
            refined = np.empty((len(line) * 2 - 1, 2))
            refined[::2], refined[1::2] = line, midpoint
            line = refined
        line *= size / METRES
        phase = rng.uniform(0, 2*np.pi)
        along = np.linspace(0, 1, len(line)-1)
        taper = np.minimum(1, np.minimum(along, 1-along)*9 + .10)
        widths = width * size / METRES * taper * (1+.27*np.sin(7*along+phase)+.14*np.cos(46*along+phase))
        weights = (np.minimum(1, .55+1.4*taper) * rng.uniform(.89, 1, len(widths)) * 255).astype(int)
        target = ImageDraw.Draw(repairs if sealed else cavities)
        for sx in (-size, 0, size):
            for sy in (-size, 0, size):
                p = line + [sx, sy]
                if np.any(p.max(axis=0) < 0) or np.any(p.min(axis=0) > size):
                    continue
                for a,b,w,k in zip(p[:-1], p[1:], widths, weights):
                    target.line((tuple(a),tuple(b)), fill=int(k), width=max(1, round(w)))

    # Long shrinkage fractures branch from an irregular spine. Short cracks
    # break off at different angles; small fatigue cells collect in two bends.
    main = [(-1,1.8),(1.1,2.4),(2.8,2.05),(4.3,3.15),(6.2,3.4),
            (7.4,4.35),(8.6,4.53),(10.1,5.35),(12,5.18),(13.6,6.2)]
    fracture(main,.042)
    fracture([(1.1,2.4),(1.4,3.25),(2.3,3.8),(2.5,4.7)],.022)
    fracture([(2.8,2.05),(3.46,1.41),(4.7,1.5),(5.45,.84),(6.43,.65)],.026)
    fracture([(4.3,3.15),(4.7,2.62),(4.92,1.58)],.016)
    fracture([(6.2,3.4),(6.5,4.22),(6.12,5.22),(6.48,6.0)],.028)
    fracture([(6.5,4.22),(7.21,4.68),(7.4,4.35)],.020)
    fracture([(8.6,4.53),(8.4,3.92),(8.9,3.5),(8.7,2.77)],.013)
    fracture([(12,5.18),(12.6,4.49),(13.6,4.13),(14.1,3.58)],.022)

    fracture([(12.8,8.25),(12.6,9.4),(11.92,10.23),(11.4,12.15),(10.6,13.2),
              (10.4,14.35),(9.5,15.14),(9.62,16.7)],.038)
    fracture([(11.92,10.23),(11.1,10.87),(10.15,10.65),(9.55,11.03)],.024)
    fracture([(10.6,13.2),(11.63,13.8),(12.25,14.8)],.017)
    fracture([(9.5,15.14),(8.7,14.9),(8.3,14.22)],.015)
    fracture([(3.67,8.74),(4.45,9.5),(5.63,9.8),(6.4,9.22)],.020)
    fracture([(4.45,9.5),(4.24,10.62),(3.54,11.7),(3.66,12.5),(2.97,13.16)],.027)
    fracture([(4.24,10.62),(4.89,10.68),(5.32,10.24),(5.63,9.8)],.016)
    fracture([(1.3,13.6),(2.3,14.3),(3.2,14.42),(4.2,15.37),(5.1,15.68)],.057,True)
    fracture([(14.82,10.63),(15.72,11.2),(16.36,12.03),(17.28,12.3)],.017)

    # Periodic noise, including across the image boundary. It gives chipped
    # edges and dry, abraded patches a quieter scale than the mineral scan.
    def noise(n):
        grid = rng.integers(0,256,(n,n),dtype=np.uint8)
        pad = Image.fromarray(np.pad(grid, 2, mode='wrap'))
        k = SIZE // n
        resized = pad.resize(((n+4)*k, (n+4)*k), Image.Resampling.BICUBIC)
        return np.asarray(resized.crop((2*k,2*k,2*k+SIZE,2*k+SIZE)),float)/255

    cavity = np.asarray(cavities.resize((SIZE,SIZE),Image.Resampling.LANCZOS),float)/255
    repair = np.asarray(repairs.resize((SIZE,SIZE),Image.Resampling.LANCZOS),float)/255
    rim = Image.fromarray(np.uint8(cavity*255)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(.8))
    shoulder = np.maximum(0,np.asarray(rim)/255-cavity)
    abrasion = .45*noise(4)+.30*noise(8)+.19*noise(32)+.06*noise(128)
    weather = np.stack([1-cavity, repair, .22+.51*abrasion+.22*shoulder],axis=-1)
    Image.fromarray(np.uint8(np.clip(weather,0,1)*255)).save(OUT,quality=95,method=6)


if __name__ == '__main__':
    bake()
