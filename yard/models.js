/** Data-only specs shared by scene construction, collision data and tests. */

export const FACADE_SPECS = Object.freeze({
  "house14-brick-light": Object.freeze({
    id: "house14-brick-light",
    kind: "brick",
    baseColor: "#c9c1b4",
    mortar: "#817a70",
    tileM: [2.08, 0.6],
    windowSpacingM: 3.25,
    balconyEvery: 0,
  }),
  "tower34-panel": Object.freeze({
    id: "tower34-panel",
    kind: "panel",
    baseColor: "#aeb5b5",
    accentColor: "#798386",
    tileM: [3.2, 2.8],
    windowSpacingM: 3.15,
    balconyEvery: 2,
  }),
  "house46-1-patchwork": Object.freeze({
    id: "house46-1-patchwork",
    kind: "masonry-panel",
    baseColor: "#b8afa3",
    accentColor: "#a65c53",
    tileM: [3.4, 2.8],
    windowSpacingM: 3.35,
    balconyEvery: 1,
    balconyMode: "mixed",
  }),
  "house46-2-pink": Object.freeze({
    id: "house46-2-pink",
    kind: "plaster",
    baseColor: "#c7a9a2",
    accentColor: "#b0736b",
    tileM: [3.4, 2.8],
    windowSpacingM: 3.35,
    balconyEvery: 1,
    balconyMode: "mixed",
  }),
  "house26-pale": Object.freeze({
    id: "house26-pale",
    kind: "plaster",
    baseColor: "#c5c1ac",
    accentColor: "#88877b",
    tileM: [3.4, 2.8],
    windowSpacingM: 3.35,
    balconyEvery: 1,
    balconyMode: "mixed",
  }),
  "house36-warm-gray": Object.freeze({
    id: "house36-warm-gray",
    kind: "masonry-panel",
    baseColor: "#aaa49a",
    accentColor: "#8a7869",
    tileM: [3.4, 2.8],
    windowSpacingM: 3.35,
    balconyEvery: 1,
    balconyMode: "mixed",
  }),
  "house46-a-gray": Object.freeze({
    id: "house46-a-gray",
    kind: "panel",
    baseColor: "#aeb0aa",
    accentColor: "#777d78",
    tileM: [3.4, 2.8],
    windowSpacingM: 3.35,
    balconyEvery: 1,
    balconyMode: "mixed",
  }),
  "house46-b-sand": Object.freeze({
    id: "house46-b-sand",
    kind: "plaster",
    baseColor: "#c0b39f",
    accentColor: "#908170",
    tileM: [3.4, 2.8],
    windowSpacingM: 3.35,
    balconyEvery: 1,
    balconyMode: "mixed",
  }),
  "unknown-facade": Object.freeze({
    id: "unknown-facade",
    kind: "plaster",
    baseColor: "#b2ada4",
    accentColor: "#918b81",
    tileM: [3.4, 2.8],
    windowSpacingM: 3.4,
    balconyEvery: 0,
  }),
});

export function facadeSpec(id) {
  return FACADE_SPECS[id] || FACADE_SPECS["unknown-facade"];
}

export function openingsForFacade(building, wallLength, edgeIndex = 0) {
  const spec = facadeSpec(building.facadeMaterialId);
  const floors = Math.max(1, Number(building.floors) || Math.round((Number(building.heightM) || 2.8) / 2.8));
  const floorHeight = (Number(building.heightM) || floors * 2.8) / floors;
  const margin = Math.min(1.2, wallLength * 0.12);
  const usable = Math.max(0, wallLength - margin * 2);
  const cols = Math.max(1, Math.floor(usable / spec.windowSpacingM));
  const spacing = usable / cols;
  const windows = [];
  const balconies = [];
  const project = building.facadeProject || {};
  const balconyEvery = Number(project.balconyEvery ?? spec.balconyEvery) || 0;
  const balconyEdges = Array.isArray(project.balconyEdges) ? project.balconyEdges : null;
  const longFacesOnly = project.longFacesOnly ?? (floors === 5 && balconyEvery > 0);
  const balconyAllowed = balconyEvery > 0
    && (!balconyEdges || balconyEdges.includes(edgeIndex))
    && (!longFacesOnly || wallLength >= (project.minBalconyWallM || 18));
  const balconyMode = project.balconyMode || spec.balconyMode;

  for (let floor = 0; floor < floors; floor += 1) {
    const y = Math.min((floor + 0.55) * floorHeight, (Number(building.heightM) || floors * floorHeight) - 0.85);
    for (let col = 0; col < cols; col += 1) {
      const along = margin + spacing * (col + 0.5);
      windows.push({
        along,
        y,
        width: 1.1,
        height: Math.min(1.35, floorHeight * 0.58),
        variant: "window",
      });
      if (balconyAllowed && floor > 0 && col % Math.max(2, balconyEvery) === 1) {
        const variant = balconyMode === "mixed" && (floor + col) % 3 !== 0 ? "glazed" : "open";
        balconies.push({ along, y: Math.max(0.5, y - floorHeight * 0.38), width: 1.55, depth: 0.85, railHeight: 0.9, variant });
      }
    }
  }
  return { windows, balconies, entrances: [] };
}

function rectangle(id, x, z, width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return {
    id,
    footprint: [
      [x - halfWidth, z - halfDepth],
      [x + halfWidth, z - halfDepth],
      [x + halfWidth, z + halfDepth],
      [x - halfWidth, z + halfDepth],
    ],
  };
}

export function playgroundFootprints(playground) {
  if (!playground) return [];
  const output = [];
  if (playground.sandbox) {
    output.push(rectangle("sandbox", playground.sandbox.x, playground.sandbox.z, playground.sandbox.size, playground.sandbox.size));
  }
  if (playground.bars) {
    output.push(rectangle("bars", playground.bars.x, playground.bars.z, playground.bars.span || 4.2, playground.bars.depth || 1.2));
  }
  if (playground.slide) {
    output.push(rectangle("slide", playground.slide.x, playground.slide.z + (playground.slide.length || 4) * 0.25, playground.slide.width, playground.slide.length || 4));
  }
  return output;
}