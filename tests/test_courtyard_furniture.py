"""Protect pedestrian routes when the layout or courtyard furniture changes."""
import json
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]


def test_furniture_clearance():
    layout = json.loads((ROOT / "yard/data/site-layout.json").read_text(encoding="utf8"))
    gardens = [Polygon(p["polygon"], p["holes"]) for p in layout["landscaping"]["patches"]]
    paths = [Polygon(p["polygon"]) for p in layout["landscaping"]["paths"]]
    drives = [LineString(road["centerline"]).buffer(road["widthM"]/2) for road in layout["roads"]]
    houses = {h["id"]: h for h in layout["buildings"]}
    fixtures = [Polygon(row["footprint"]) for row in [*layout["buildings"], *layout["utilityStructures"]]]
    entries = []
    for door in layout["entrances"]:
        ring = houses[door["buildingId"]]["footprint"]
        i = door["edgeIndex"]
        at = LineString([ring[i], ring[(i+1) % len(ring)]]).interpolate(door["alongM"])
        entries.append(at.buffer(2.5))
    bars = layout["playground"]["bars"]
    fixtures.append(Point(bars["x"], bars["z"]).buffer(3.5))
    fixtures.extend(Point(o["x"],o["z"]).buffer(o["radius"]) for o in layout["circles"])
    rows = [o for o in layout["obstacles"] if o.get("kind") in {"bench", "garden-fence"}]
    fixtures.extend(Polygon(o["footprint"]) for o in layout["obstacles"] if o not in rows)
    travel = unary_union([*paths, *drives, *fixtures, *entries])
    assert {r["kind"] for r in rows} == {"bench", "garden-fence"}
    placed = []
    for row in rows:
        footprint = Polygon(row["footprint"])
        assert any(garden.contains(footprint.buffer(.30)) for garden in gardens), row
        assert travel.distance(footprint) > .7, row
        assert all(other.distance(footprint) > 1.5 for other in placed), row
        placed.append(footprint)


if __name__ == "__main__":
    test_furniture_clearance()
    print("PASS courtyard furniture clears entrances, lawns' paths, drives and play equipment")
