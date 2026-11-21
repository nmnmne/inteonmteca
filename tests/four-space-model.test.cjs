const assert=require('node:assert/strict');
const test=require('node:test');

test('wall model projects the 32 straight edges of the central chamber and its true W section together',async()=>{
  const {createFourSpaceModel}=await import('../yard/four-space-model.js');
  const {Vector3}=await import('../yard/vendor/three.module.js');
  const model=createFourSpaceModel(),group=model.group;
  const cage=group.getObjectByName('four-space-projection'),shell=group.getObjectByName('four-space-cut-faces'),rim=group.getObjectByName('four-space-cut-rim');
  function xyz(mesh,index) {return new Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),index);}
  function project([x,y,z,w]) {return new Vector3(x,y-1.775,z).multiplyScalar(14/(14-w));}
  function envelope(rotation) {
    return Array.from({length:16},(_,i)=>{
      const u=i&1?3.02:-3.02,v=i&2?3.55:0,s=i&4?1.82:-1.82,q=i&8?1:-1;
      const x=u+.74*q,z=s+.4*q,w=.53*u+.34*(v-1.55)+.39*s+1.52*q;
      const c=Math.cos(rotation),sn=Math.sin(rotation),tilt=.38*sn,rw=x*sn+w*c;
      return [x*c-w*sn,v+.17*q,z*Math.cos(tilt)-rw*Math.sin(tilt),z*Math.sin(tilt)+rw*Math.cos(tilt)];
    });
  }
  for (const angle of [0,-.61,.38,1.25]) for(const w of [-.77,.01,.6,1.6]) {
    model.update(w,angle,1);group.updateMatrixWorld(true);
    assert.ok(group.visible);
    const corners=envelope(angle), expected=[];
    let j=0;
    for(let i=0;i<16;i++) for(const bit of [1,2,4,8]){
      if(i&bit)continue;
      const a=corners[i],b=corners[i|bit];
      assert.ok(xyz(cage,j++).distanceTo(project(a))<.000001);
      assert.ok(xyz(cage,j++).distanceTo(project(b))<.000001);
      if ((a[3]<4*w)===(b[3]<4*w)) continue;
      const t=(4*w-a[3])/(b[3]-a[3]);
      expected.push(project(a.map((first,axis)=>first+t*(b[axis]-first))));
    }
    assert.equal(cage.geometry.drawRange.count,j);
    const displayed=corners.map(p=>project(p).applyMatrix4(cage.matrixWorld));
    const diameter=Math.max(...displayed.flatMap(a=>displayed.map(b=>a.distanceTo(b))));
    assert.ok(diameter>=.65 && diameter<=.801,diameter);
    assert.ok(displayed.every(p=>p.length()<=.401));
    const actual=[];
    for(let i=0;i<rim.geometry.drawRange.count;i++){
      const p=xyz(rim,i);
      assert.ok(expected.some(q=>p.distanceTo(q)<.000005));
      actual.push(p);
    }
    assert.ok(expected.every(q=>actual.some(p=>p.distanceTo(q)<.000005)));
    assert.equal(Boolean(expected.length),shell.geometry.drawRange.count>0);
    for(let i=0;i<shell.geometry.drawRange.count;i++) assert.ok(expected.some(q=>xyz(shell,i).distanceTo(q)<.000005));
  }
  model.update(0,.2,0);assert.equal(group.visible,false);
  model.dispose();
});
