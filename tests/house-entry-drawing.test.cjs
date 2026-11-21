const test=require('node:test');
const assert=require('node:assert/strict');
const layout=require('../yard/data/site-layout.json');

test('only the surveyed perimeter is traced on a triangulated concave floor',async()=>{
  const {createHouseBackstage}=await import('../yard/house-backstage.js');
  const house=layout.buildings.find(h=>h.id==='house-14'),draw={value:.4};
  const gallery=createHouseBackstage(house,{value:0},{value:null},draw);
  assert.equal(gallery.material.uniforms.entryDraw,draw);
  const {position,surfaceKind,edgeBary}=gallery.geometry.attributes;
  const key=(x,z)=>x.toFixed(2)+','+z.toFixed(2);
  const expected=new Set(house.footprint.map((point,i)=>[key(...point),key(...house.footprint[(i+1)%house.footprint.length])].sort().join('/')));
  const outlined=new Set();let hidden=0;
  for (let i=0;i<position.count;i+=3) {
    if (surfaceKind.getX(i)!==0 || position.getY(i)>.09) continue;
    for (let k=0;k<3;k++) {
      const traced=[0,1,2].some(n=>edgeBary.getComponent(i+n,k)===0);
      if (!traced) {hidden++;continue;}
      const a=i+(k+1)%3,b=i+(k+2)%3;
      outlined.add([key(position.getX(a),position.getZ(a)),key(position.getX(b),position.getZ(b))].sort().join('/'));
    }
  }
  assert.deepEqual(outlined,expected);
  assert.ok(hidden>2,'floor triangulation stays invisible');
  gallery.geometry.dispose();gallery.material.dispose();
});

test('rooms use the entry clock even with a stationary W plane and recover ordinary opacity at completion',async()=>{
  const {createHouseSections,mapHouseSections}=await import('../yard/house-sections.js');
  const T=await import('../yard/vendor/three.module.js');
  const house=layout.buildings.find(h=>h.id==='house-46-1'),site=mapHouseSections(house)[1];
  const gallery=new T.Group(), update=createHouseSections();
  const draw=t=>update(gallery,house,site.x,1.42,site.z,.68,4,t);
  draw(.15);
  const room=gallery.children.find(g=>g.visible && Math.abs(g.position.x-site.x)<.001);
  const faces=room.getObjectByName('four-space-section-walls'),rims=room.getObjectByName('four-space-section-rims');
  const uniforms=mesh=>{
    const program={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <alphatest_fragment>'};
    mesh.material.onBeforeCompile(program);
    return program.uniforms;
  };
  const f=uniforms(faces),r=uniforms(rims);
  assert.equal(f.entryDraw,r.entryDraw);
  const attr=faces.geometry.getAttribute('position'),version=attr.version;
  const opacity=faces.material.opacity;
  for (const t of [.34,.57,.86,.99,1]) {
    draw(t);
    assert.equal(f.entryDraw.value,t);
    assert.equal(attr.version,version,'revealing a stationary cut does not rebuild its geometry');
  }
  draw(undefined);
  assert.equal(f.entryDraw.value,1);
  assert.equal(faces.material.opacity,opacity);
});
