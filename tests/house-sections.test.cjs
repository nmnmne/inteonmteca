const {test}=require('node:test');
const assert=require('node:assert/strict');
const layout=require('../yard/data/site-layout.json');

test('each mapped building has four-dimensional chambers inside its real footprint',async()=>{
  const {mapHouseSections}=await import('../yard/house-sections.js');
  const {pointInRing}=await import('../yard/navigation.js');
  for (const b of layout.buildings) {
    const sites=mapHouseSections(b);
    assert.ok(sites.length,b.id);
    for (const s of sites) for (const i of [-1,0,1]) for (const j of [-1,0,1]) {
      assert.ok(pointInRing(s.x+i*4.4*s.sx*s.ux-j*6.4*s.sz*s.uz,
        s.z+i*4.4*s.sx*s.uz+j*6.4*s.sz*s.ux,b.footprint),b.id);
    }
  }
});

test('the passive house crossing reveals a changing section on fixed storeys and hides it outside',async t=>{
  const T=await import('../yard/vendor/three.module.js');
  const {createDigitalBoundary}=await import('../yard/digital-boundary.js');
  const {mapHouseSections}=await import('../yard/house-sections.js');
  const house=layout.buildings.find(b=>b.id==='house-46-1');
  const site=mapHouseSections(house)[2], level=house.heightM/house.floors;
  const old=globalThis.matchMedia;
  globalThis.matchMedia=()=>({matches:true});
  t.after(()=>{if(old)globalThis.matchMedia=old;else delete globalThis.matchMedia;});
  const scene=new T.Scene(); scene.background=new T.Color();scene.fog=new T.Fog(0);
  const boundary=createDigitalBoundary(scene,layout,{skyColor:0,fogColor:0},new T.Mesh(),[],{passThroughBuildings:true});
  const visit=(d,y,t)=>boundary.update(site.x-site.uz*d,site.z+site.ux*d,y,t);
  const gallery=scene.getObjectByName('backstage-'+house.id);
  const rooms=()=>gallery.children.filter(obj=>obj.visible && obj.name==='four-space-section-rooms');
  visit(0,1.3,100);
  const room=rooms().find(s=>Math.abs(s.position.x-site.x)<.001);
  assert.ok(room);
  assert.ok(gallery.renderOrder<room.renderOrder,'draw the gallery before the transparent cross-section');
  const anchor=room.position.clone();
  const geometry=room.getObjectByName('four-space-section-walls').geometry;
  const version=()=>geometry.attributes.position.version;
  const original=version();
  visit(0,1.3,200);
  assert.equal(version(),original,'reduced motion at rest');
  visit(2,1.3,200);
  assert.ok(version()>original && room.position.equals(anchor));
  visit(0,2*level+1.3,201);
  assert.ok(rooms().some(s=>Math.abs(s.position.y-(2*level+.16))<.001));
  visit(0,house.heightM+3,201);
  assert.equal(rooms().length,0);
  visit(14,1.3,202);
  assert.equal(rooms().length,0);
});
