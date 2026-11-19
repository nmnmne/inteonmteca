"""Bake disconnected pools in the depressions of the yard's exposed pavement.

The linear grayscale mask maps X from left to right and Z from top to bottom,
across the bounds of layout.walkable. 128 is the waterline, 255 is the interior.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from shapely import union_all
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import substring

ROOT = Path(__file__).resolve().parents[1]
PIXELS_PER_METRE = 8
SEED = 51230439


def site_geometry(layout):
    lot = Polygon(layout["walkable"])
    landscaping = layout["landscaping"]
    lawns = [Polygon(p["polygon"], p.get("holes")) for p in landscaping["patches"]]
    obstacles = [Polygon(p["footprint"]) for key in ("buildings", "utilityStructures", "obstacles")
                 for p in layout[key]]
    obstacles.extend(Point(c["x"], c["z"]).buffer(1.2 * c["radius"]) for c in layout["circles"])
    obstacles.extend(Polygon(s["polygon"]) for s in layout["surfaces"] if s["kind"] != "asphalt")
    bars = layout["playground"].get("bars")
    if bars:
        for offset in np.linspace(-bars["span"] / 2, bars["span"] / 2, len(bars["heights"]) + 1):
            x = bars["x"] + offset * np.cos(bars["yaw"])
            z = bars["z"] - offset * np.sin(bars["yaw"])
            obstacles.append(Point(x, z).buffer(.055))
    curbs = [LineString(segment).buffer(landscaping["curbWidthM"] / 2, cap_style="flat")
             for segment in landscaping["curbs"]]
    drives, paths = [], []
    bearings = []
    for road in layout["roads"]:
        if road.get("render") is False or road["kind"] != "asphalt":
            continue
        points = road["centerline"]
        line = LineString(points)
        width = road["widthM"]
        strip = line.buffer(width / 2, cap_style="flat", join_style="mitre", mitre_limit=2)
        walkway = road["id"] == "spawn-pedestrian-link"
        (paths if walkway else drives).append(strip)
        if road.get("curbEdges") == "both":
            for side in (-1, 1):
                edge = line.offset_curve(side * width / 2, join_style="mitre", mitre_limit=2)
                curbs.append(edge.buffer(.07, cap_style="flat"))
        for a, b in zip(points, points[1:]):
            segment = LineString([a, b]).buffer(width / 2 + .3, cap_style="square")
            bearings.append((segment, np.arctan2(b[1] - a[1], b[0] - a[0]), width))
    for path in landscaping["paths"]:
        shape = Polygon(path["polygon"], path.get("holes"))
        paths.append(shape)
        corners = np.asarray(shape.minimum_rotated_rectangle.exterior.coords)
        sides = np.diff(corners, axis=0)
        lengths = np.linalg.norm(sides, axis=1)
        direction = sides[np.argmax(lengths)]
        bearings.append((shape, np.arctan2(direction[1], direction[0]), min(lengths)))
    pavement = lot.difference(union_all(lawns + obstacles + curbs))
    # The guided walk only uses the loop between the drives' shared junction
    # and their western turn. Exclude both unused tails from its area statistic.
    roads = {r["id"]: r["centerline"] for r in layout["roads"]}
    inner = LineString(roads["house14-courtyard-drive"][::-1])
    outer = LineString(roads["zhandova-courtyard-drive"][::-1])
    foot = LineString(roads["spawn-pedestrian-link"])
    spawn = Point(layout["spawn"]["x"], layout["spawn"]["z"])
    west = inner.interpolate(inner.project(Point(outer.coords[0])))
    junction = Point(inner.coords[0])
    loop = [substring(foot, foot.project(spawn), foot.length),
            substring(inner, 0, inner.project(west)), LineString([west, Point(outer.coords[1])]),
            substring(outer, outer.project(Point(outer.coords[1])), outer.project(junction))]
    corridor = union_all(loop).buffer(.65)
    return lot, pavement, union_all(drives), union_all(paths), corridor, bearings


class Raster:
    def __init__(self, bounds):
        self.x0, self.z0, x1, z1 = bounds
        self.size = (round((x1 - self.x0) * PIXELS_PER_METRE),
                     round((z1 - self.z0) * PIXELS_PER_METRE))

    def points(self, ring):
        return [((x - self.x0) * PIXELS_PER_METRE - .5, (z - self.z0) * PIXELS_PER_METRE - .5)
                for x, z in ring.coords]

    def draw(self, image, geometry, value):
        drawer = ImageDraw.Draw(image)
        for poly in getattr(geometry, "geoms", (geometry,)):
            if poly.is_empty or poly.geom_type != "Polygon":
                continue
            drawer.polygon(self.points(poly.exterior), fill=value)
            for hole in poly.interiors:
                drawer.polygon(self.points(hole), fill=0)

    def mask(self, geometry):
        result = Image.new("1", self.size)
        self.draw(result, geometry, 1)
        return np.asarray(result)


def shoreline(rng, length, width, bearing):
    # Different shorelines on opposite wheel-rut shoulders, with bays, necks
    # and tongues. More samples on long shores preserve sub-metre detail.
    t = np.linspace(0, 2 * np.pi, max(28, round(9 * length)), endpoint=False)
    phases = rng.uniform(0, 2 * np.pi, 8)
    radii = 1 + sum(rng.uniform(.04, .12) * np.cos(n * t + phase)
                    for n, phase in zip((2, 3, 4, 5), phases))
    radii += .04 * np.cos(9 * t + phases[4]) + .018 * np.sin(17 * t + phases[5])
    u = np.cos(t) * radii
    v = np.sin(t) * radii * (1 + .22 * np.cos(t + phases[6]))
    v += rng.uniform(-.34, .34) * np.cos(np.pi * u + phases[7])
    u *= length * PIXELS_PER_METRE
    v *= width * PIXELS_PER_METRE
    c, s = np.cos(bearing), np.sin(bearing)
    return np.column_stack((u * c - v * s, u * s + v * c))


def distribute(raster, pavement, road, foot, route, bearings):
    rng = np.random.default_rng(SEED)
    angles, widths = (Image.new("F", raster.size) for _ in range(2))
    for strip, bearing, width in bearings:
        raster.draw(angles, strip, bearing)
        raster.draw(widths, strip, width)
    angles, widths = np.asarray(angles), np.asarray(widths)
    regions = [foot & pavement, route & pavement & ~foot, road & pavement & ~foot & ~route,
               pavement & ~road & ~foot & ~route]
    area = np.array([r.sum() for r in regions])
    pools = np.zeros_like(pavement)
    margin = np.zeros_like(pavement)
    indices = [np.flatnonzero(r[::2, ::2]) for r in regions]
    counts = np.zeros(len(regions), dtype=np.int64)
    # Fill deep broad depressions first, then smaller holes in their dry
    # shoulders. Each pass stops at an area target for each kind of pavement.
    stages = [(.24, (3.5, 12), .42), (.425, (1.7, 5.4), .32),
              (.535, (.75, 3), .21), (.590, (.30, 1.4), .13)]
    for target, (short, long), gap in stages:
        for group, candidates in enumerate(indices):
            misses = 0
            while counts[group] < target * area[group] and misses < 4000:
                misses += 1
                point = int(rng.choice(candidates))
                y, x = divmod(point, (raster.size[0] + 1) // 2)
                y, x = y * 2, x * 2
                if margin[y, x]:
                    continue
                length = rng.uniform(short, long)
                width = length * rng.uniform(.25, .78)
                if widths[y, x] > 0:
                    # Fill sagging wheel ruts and the low shoulder along curbs.
                    width = min(width, max(.26, widths[y, x] * rng.uniform(.18, .52)))
                    bearing = angles[y, x] + rng.normal(0, .23)
                else:
                    bearing = rng.normal(-.57 if rng.random() < .7 else 1.07, .59)
                points = shoreline(rng, length, width, bearing)
                padding = max(1, round(gap * PIXELS_PER_METRE))
                x0 = max(0, x + int(np.floor(points[:, 0].min())) - padding)
                y0 = max(0, y + int(np.floor(points[:, 1].min())) - padding)
                x1 = min(raster.size[0], x + int(np.ceil(points[:, 0].max())) + padding + 1)
                y1 = min(raster.size[1], y + int(np.ceil(points[:, 1].max())) + padding + 1)
                tile = Image.new("L", (x1 - x0, y1 - y0))
                polygon = points + [x - x0, y - y0]
                ImageDraw.Draw(tile).polygon(list(map(tuple, polygon)), fill=255)
                roi = np.s_[y0:y1, x0:x1]
                patch = np.asarray(tile, dtype=bool) & pavement[roi]
                pixels = patch.sum()
                if pixels < max(5, .22 * np.pi * length * width * PIXELS_PER_METRE ** 2):
                    continue
                if np.count_nonzero(patch & margin[roi]) > .09 * pixels:
                    continue
                patch &= ~margin[roi]
                pools[roi] |= patch
                halo = Image.fromarray(np.uint8(patch) * 255).filter(ImageFilter.MaxFilter(2 * padding + 1))
                margin[roi] |= np.asarray(halo, dtype=bool)
                counts += [np.count_nonzero(patch & r[roi]) for r in regions]
                misses = 0
    return pools


def pool_areas(binary):
    # Count connected water footprints in scanline runs, after clipping to
    # the real lawns and kerbs. Labels are handles into a union-find forest.
    parents, areas = [], []

    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    previous = []
    for row in binary:
        ends = np.flatnonzero(np.diff(row, prepend=False, append=False))
        current = []
        j = 0
        for left, right in ends.reshape(-1, 2):
            while j < len(previous) and previous[j][1] <= left:
                j += 1
            group = len(parents)
            parents.append(group)
            areas.append(int(right - left))
            k = j
            while k < len(previous) and previous[k][0] < right:
                old = root(previous[k][2])
                if old != group:
                    parents[old] = group
                    areas[group] += areas[old]
                k += 1
            current.append((left, right, group))
        previous = current
    return np.array([a for i, a in enumerate(areas) if parents[i] == i]) / PIXELS_PER_METRE ** 2


def main():
    layout = json.loads((ROOT / "yard/data/site-layout.json").read_text(encoding="utf-8"))
    lot, pavement_shape, road_shape, foot_shape, route_shape, bearings = site_geometry(layout)
    raster = Raster(lot.bounds)
    pavement, road, foot, route = map(raster.mask, [pavement_shape, road_shape, foot_shape, route_shape])
    pools = distribute(raster, pavement, road, foot, route, bearings)
    wet = Image.fromarray(np.uint8(pools) * 255)
    # Feather the transition and retain an opaque flat core for compact PNGs.
    edge = np.asarray(wet.filter(ImageFilter.GaussianBlur(.7)), dtype=np.float32)
    depth = np.asarray(wet.filter(ImageFilter.GaussianBlur(2.3)), dtype=np.float32)
    values = np.uint8(np.rint(np.rint((.63 * edge + .37 * depth) / 255 * 31) * (255 / 31)))
    values[~pavement] = 0
    target = ROOT / "yard/assets/puddle-shores.png"
    Image.fromarray(values).save(target, optimize=True)
    water = values >= 128
    for name, mask in [("all exposed asphalt", pavement), ("drives", road), ("footpaths", foot),
                       ("walking corridor", route)]:
        domain = mask & pavement
        print(f"{name}: {100 * water[domain].mean():.2f}% of {domain.sum() / PIXELS_PER_METRE ** 2:.1f} m2")
    areas = pool_areas(water)
    bins = np.histogram(areas, [.1, 1, 8, 40, np.inf])[0]
    print(f"pools by area 0.1-1 / 1-8 / 8-40 / 40+ m2: {bins.tolist()}; largest {areas.max():.1f} m2")
    print(f"{target.name}: {raster.size}, {target.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
