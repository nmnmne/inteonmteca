"""Rebuild the user-marked lawn; requires Shapely (authoring only)."""
import json
import math
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'yard/data/site-layout.json'


def road_polygon(road):
    # Match road-details.js miter joins, including its width-limited corners.
    line, width = road['centerline'], road['widthM']
    sides = []
    def normal(a, b):
        dx, dz = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx, dz) or 1
        return -dz/length, dx/length
    for i, p in enumerate(line):
        incoming = normal(line[i-1], p) if i else normal(p, line[1])
        outgoing = normal(p, line[i+1]) if i < len(line)-1 else incoming
        length = math.hypot(incoming[0]+outgoing[0], incoming[1]+outgoing[1]) or 1
        nx, nz = (incoming[0]+outgoing[0])/length, (incoming[1]+outgoing[1])/length
        miter = min(width, width/(2*max(.5, nx*outgoing[0]+nz*outgoing[1])))
        sides.append(((p[0]+nx*miter, p[1]+nz*miter), (p[0]-nx*miter, p[1]-nz*miter)))
    return unary_union([Polygon([a[0], b[0], b[1], a[1]]) for a, b in zip(sides, sides[1:])])


def polygons(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [p for part in geometry.geoms for p in polygons(part)]


def ring(coords):
    return [[round(x, 4), round(z, 4)] for x, z in list(coords)[:-1]]


def encode(poly):
    return {'polygon': ring(poly.exterior.coords), 'holes': [ring(h.coords) for h in poly.interiors]}


def build(layout):
    def latest_point(x, y):
        # The latest annotation repeats the top 234 px before the full map.
        return (x*230/800-100, (y-234)*290/1000-130)

    # Traced on the supplied composite at 2048 px wide. The left map is
    # calibrated against house 14's footprint (north remains up).
    pixels = [(78,532),(79,357),(205,281),(242,266),(358,198),(379,244)]
    original_edge = [((x-207)/1.786, (y-321)/1.786) for x,y in pixels]
    original_edge[1:2] = [latest_point(98,768), latest_point(270,667)]
    # Follow-up purple markup on the 800 x 1000 overhead preview: extend
    # the entrance-side beds to the drive, retaining the five access notches.
    # Orthographic preview bounds: x [-100,130], z [-130,160].
    front_pixels = [(365,485),(207,582),(207,679),(203,759),(199,840)]
    front_edge = [(x*230/800-100, y*290/1000-130) for x,y in front_pixels]
    outline = Polygon(original_edge + front_edge)
    # Additional purple outlines. Cropped ends continue behind the buildings,
    # as confirmed by the user; the dimensions remain approximate.
    additional_pixels = {
        'houses-46-rear-and-front': [
            (398,750),(714,570),(727,574),(826,751),(235,1109),
            (235,1037),(265,1022),(263,963),(272,942),(463,839),
            (437,801),(427,809),(398,763)],
        'tower-34-east': [
            (108,634),(103,708),(124,704),(257,635),(271,665),
            (323,637),(323,617),(310,593),(194,633)],
        'tower-34-west': [(38,590),(32,703),(58,713),(87,709),(92,632)],
        'house-14-west': [(35,764),(65,749),(80,752),(75,1092),(32,1092)],
    }
    additional = {name: Polygon([latest_point(x,y) for x,y in points])
                  for name, points in additional_pixels.items()}
    # Central island, traced on the next 2/3-scale preview (bottom cropped).
    # That render spans x [-115,145], z [-130,160] at 5 px per metre.
    central_pixels = [(264,574),(382,498),(415,507),(455,576),
                      (266,679),(258,675),(264,612)]
    additional['central-island'] = Polygon([(x*.3-115,y*.3-130) for x,y in central_pixels])
    for name, area in additional.items():
        assert area.is_valid, f'Invalid landscaping outline: {name}'
    envelope = unary_union([outline, *additional.values()])
    buildings = unary_union([Polygon(b['footprint']) for b in layout['buildings']]
                            + [Polygon(b['footprint']) for b in layout.get('utilityStructures',[])])
    aprons = buildings.buffer(.8, join_style=2)
    roads = unary_union([road_polygon(r) for r in layout['roads'] if r.get('render',True)])
    paths = []
    path_entries = []
    for entry in layout['entrances']:
        if entry['buildingId'] not in ('house-14', 'house-46-1', 'house-46-2', 'tower-34'):
            continue
        house = next(b for b in layout['buildings'] if b['id'] == entry['buildingId'])
        points = house['footprint']
        a, b = points[entry['edgeIndex']], points[(entry['edgeIndex']+1)%len(points)]
        dx, dz = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx,dz)
        nx, nz = -dz/length, dx/length
        x, z = a[0]+dx/length*entry['alongM'], a[1]+dz/length*entry['alongM']
        if Polygon(points).contains(Point(x+nx, z+nz)):
            nx, nz = -nx, -nz
        # Three-metre clear routes from the stairs to the courtyard drive.
        ray = LineString([(x,z),(x+nx*15,z+nz*15)])
        road_hit = ray.intersection(roads)
        # Stop at the first driveway, rather than cutting a second lawn on
        # its opposite side with the unused end of an entrance access ray.
        reach = min(15, Point(x,z).distance(road_hit)+.1) if not road_hit.is_empty else 15
        path = LineString([(x,z),(x+nx*reach,z+nz*reach)]).buffer(1.6, cap_style=2)
        parts = polygons(path.intersection(envelope).difference(aprons).difference(roads))
        paths.extend(parts)
        path_entries.extend([entry['id']] * len(parts))
    clear = unary_union(paths)
    lawn = envelope.difference(aprons).difference(roads.buffer(.15, join_style=2)).difference(clear.buffer(.12, join_style=2))
    patches = [p for p in polygons(lawn) if p.area > .5]
    curbs = []
    for p in patches:
        for edge in [p.exterior, *p.interiors]:
            coords = list(edge.coords)
            for a,b in zip(coords,coords[1:]):
                # Leave the building apron edge open; retain only lawn/path edges.
                if LineString([a,b]).interpolate(.5, normalized=True).distance(buildings) < .82:
                    continue
                curbs.append([[round(v,4) for v in a],[round(v,4) for v in b]])
    return {'source': 'User lawn and curb annotations, 2026-10-14: house 14, tower 34, houses 46/1 and 46/2, central island. Cropped contours continued behind building ends with user confirmation; approximate plan dimensions',
            'outline': ring(outline.exterior.coords), 'curbHeightM': .14, 'curbWidthM': .18,
            'additionalOutlines': [{'id': name, **encode(area)} for name, area in additional.items()],
            'patches': [encode(p) for p in patches],
            'paths': [{**encode(p), 'entranceId': entry_id} for p,entry_id in zip(paths,path_entries)],
            'curbs': curbs}


if __name__ == '__main__':
    layout = json.loads(PATH.read_text(encoding='utf-8'))
    layout['landscaping'] = build(layout)
    PATH.write_text(json.dumps(layout, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f"Built {len(layout['landscaping']['patches'])} lawn patches with open entrance paths")
