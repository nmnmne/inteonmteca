const test=require('node:test');
const assert=require('node:assert/strict');

test('a real diagonal slice of a tesseract is an octahedron at the centre and a tetrahedron near the end',async()=>{
  const {sliceFourBox}=await import('../yard/four-space-room.js');
  const vertices=new Float64Array(64);
  for(let i=0;i<16;i++) {
    const [a,b,c,d]=[1,2,4,8].map(bit=>i&bit?1:-1);
    vertices.set([(a+b-c-d)/2,(a-b+c-d)/2,(a-b-c+d)/2,(a+b+c+d)/2],4*i);
  }
  function cut(w) {
    const corners=new Set(), faces=[];
    sliceFourBox(vertices,w,(_,loop,links,positions)=>{
      const polygon=new Set();
      for(const edge of loop) {
        const p=3*links[edge];
        const key=[positions[p],positions[p+1],positions[p+2]].join(',');
        polygon.add(key);corners.add(key);
      }
      if (polygon.size>=3) faces.push(polygon.size);
    });
    return {corners,faces};
  }
  const centre=cut(0);
  assert.deepEqual(centre.corners,new Set(['2,0,0','-2,0,0','0,2,0','0,-2,0','0,0,2','0,0,-2']));
  assert.deepEqual(centre.faces,new Array(8).fill(3));
  const apex=cut(1.5);
  assert.equal(apex.corners.size,4);assert.deepEqual(apex.faces,[3,3,3,3]);
  assert.equal(cut(2.01).corners.size,0);
});

test('the visitor crosses different rooms along W and can rotate their section while the architecture stays anchored',async()=>{
  const {createSectionRooms}=await import('../yard/four-space-room.js');
  const sections=createSectionRooms(),[walls,rims]=sections.group.children;
  function frame(w,rotation,visibility=1) {
    sections.update(w,rotation,visibility);
    const p=walls.geometry.getAttribute('position').array.slice(0,3*walls.geometry.drawRange.count);
    assert.ok(p.every(Number.isFinite));
    const z=p.filter((_,i)=>i%3===2);
    return {p,near:Math.max(...z),far:Math.min(...z)};
  }
  const a=frame(-1,0),b=frame(0,0),c=frame(1,0);
  assert.ok(a.far>b.far+2.5 && c.near<b.near-2.5);
  assert.ok(a.near>5 && c.far< -5);
  assert.ok(a.p.length>300 && c.p.length>300);
  assert.notDeepEqual(frame(0,.75).p,b.p);
  assert.ok(rims.geometry.drawRange.count>150);
  assert.equal(sections.group.children.length,2);
  const position=walls.geometry.getAttribute('position'), version=position.version;
  frame(0,.75,.36);assert.equal(position.version,version);
  assert.ok(walls.material.opacity>0 && walls.material.opacity<.36);
  frame(0,.75,0);assert.equal(sections.group.visible,false);
  frame(0,.75,1);assert.equal(sections.group.visible,true);
  sections.dispose();
});
