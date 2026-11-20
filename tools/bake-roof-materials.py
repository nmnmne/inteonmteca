"""Bake metre-scaled roof coverings from the courtyard's existing CC0 scans."""
from pathlib import Path

import numpy as np
from PIL import Image


SURFACES = Path(__file__).resolve().parents[1] / 'yard/assets/surfaces'


def scan(name, channel, shape, repeats):
    """Sample whole periods so the colour and relief also tile across UV wraps."""
    rows, cols = shape
    ny, nx = repeats
    with Image.open(SURFACES / f'{name}.webp') as src:
        im = src.convert('RGB').getchannel(channel)
        im = im.resize((cols // nx, rows // ny), Image.Resampling.LANCZOS)
    return np.tile(np.array(im, dtype=np.float32), (ny, nx))


def save(name, colour, relief, roughness):
    for suffix, channels in [('color', colour), ('surface', np.stack([relief, roughness, roughness], axis=-1))]:
        image = Image.fromarray(np.uint8(np.clip(channels, 0, 255)))
        image.save(SURFACES / f'{name}-{suffix}.webp', method=6, quality=87 if suffix == 'color' else 92)


def wrapped_distance(position, period):
    return (position + period / 2) % period - period / 2


def bump(distance, radius):
    return np.exp(-(distance / radius) ** 2)


def bitumen():
    # Four 94 cm exposed courses. Each full-width roll overlaps the next by
    # roughly 6 cm. The thinner end laps are offset from course to course.
    shape = (512, 1024)
    y, x = np.indices(shape) * np.array([3.76 / shape[0], 8 / shape[1]])[:, None, None]
    tau = 2 * np.pi
    grain = scan('asphalt-color', 'G', shape, (2, 4))
    grain -= grain.mean()
    aggregate = scan('asphalt-surface', 'R', shape, (2, 4)) / 255
    wash = scan('concrete-color', 'G', shape, (1, 1))
    wash -= wash.mean()
    drift = .012 * np.sin(tau * x / 8) + .005 * np.sin(tau * (3 * x / 8 + y / 3.76))
    course = (y + drift) / .94
    row = np.floor(course).astype(int) % 4
    along = wrapped_distance(y + drift, .94)
    across = wrapped_distance(x - np.array([.74, 4.91, 2.86, 6.68])[row] + .009 * np.sin(tau * y / .94), 8)
    lap_width = .015 + .004 * np.sin(tau * x * 7 / 8) + .0025 * grain / 15
    tar = np.maximum(bump(along + .012, lap_width), bump(across + .009, .013))
    selvage = np.maximum(bump(along - .026, .037), bump(across - .023, .030))
    age = np.array([-5, 3, 0, 5])[row] + 2 * np.sin(tau * (x / 8 + course / 4))
    stone = 109 + .74 * grain + .20 * wash + age
    grey = stone * (1 - .27 * tar) - 3 * selvage
    # Old pitch shows through where the granules have been hot-rolled into the laps.
    colour = np.stack([grey + 2, grey + .2, grey - 2.7 + .06 * grain], axis=-1)
    relief = (65 + 79 * aggregate) * (1 - .39 * tar) + selvage * 75
    rough = 215 + 27 * aggregate - 68 * tar - 10 * selvage
    save('roof-felt', colour, relief, rough)


def sheet_metal():
    shape = (512, 512)
    y, x = np.indices(shape) * np.array([2.76 / shape[0], 2.04 / shape[1]])[:, None, None]
    tau = 2 * np.pi
    wear = scan('paint-surface', 'R', shape, (1, 1)) / 255 - .5
    oxide = scan('concrete-color', 'G', shape, (2, 2))
    oxide -= oxide.mean()
    # Rolled galvanised sheets with 85 mm corrugations draining downslope.
    rib = .5 + .5 * np.cos(tau * x / .085 + .035 * np.sin(tau * y / 2.76))
    sheet = (x >= 1.02).astype(float)
    overlap = bump(wrapped_distance(y - .04 - sheet * .09, 2.76), .016)
    lip = bump(wrapped_distance(x - .008, 1.02), .012)
    fastener_x = wrapped_distance(x, .34)
    fastener_y = wrapped_distance(y - .11 - .09 * sheet, .92)
    radius = np.hypot(fastener_x, fastener_y)
    head = bump(radius, .009)
    rust = bump(fastener_x, .015) * np.exp(-np.maximum(0, fastener_y) / .073) * (fastener_y >= 0)
    grey = 167 + .26 * oxide + 9 * wear + 3 * sheet - 4 * (1 - rib) - 12 * overlap - 9 * lip - 15 * head
    colour = np.stack([grey - 2 + 4 * rust, grey - 5 * rust, grey - 7 * rust], axis=-1)
    relief = 38 + 159 * rib + 16 * wear + 23 * overlap + 13 * lip + 43 * head
    rough = 172 + .35 * oxide - 8 * rib + 18 * np.maximum(0, wear) + 25 * rust
    save('roof-zinc', colour, relief, rough)


def coping():
    # Smooth folded caps have a standing joint every 1.6 m. The adjoining
    # caps are slightly different shades of oxidised zinc.
    shape = (128, 512)
    y, x = np.indices(shape) * np.array([.8 / shape[0], 3.2 / shape[1]])[:, None, None]
    weather = scan('paint-surface', 'R', shape, (1, 1)) / 255 - .5
    zinc = scan('concrete-color', 'G', shape, (1, 4))
    zinc -= zinc.mean()
    patina = scan('asphalt-color', 'G', shape, (1, 1))
    patina -= patina.mean()
    distance = wrapped_distance(x + .0015 * np.sin(2 * np.pi * y / .8), 1.6)
    fold = bump(distance, .012)
    foot = bump(distance - .016, .008)
    grey = 145 + 11 * weather + .36 * zinc + .32 * patina - 4 * (x >= 1.6) - 16 * foot - 6 * fold
    colour = np.stack([grey + .08 * patina, grey + 1, grey - 1 - .07 * patina], axis=-1)
    save('roof-coping', colour, 66 + 106 * fold + 9 * weather + .13 * zinc,
         179 + 14 * weather + 14 * foot + .42 * patina)


if __name__ == '__main__':
    bitumen()
    sheet_metal()
    coping()
