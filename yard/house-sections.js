import { pointInRing } from './navigation.js';
import { createSectionRooms } from './four-space-room.js';
import { createFourSpaceModel } from './four-space-model.js';

const sectionSpacing = 9.4;
const smooth = t => { t = Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };

// Find the opposite wall of the same wing. A ray stops at the first wall,
// including an inside corner of the L-shaped house.
function spanAcross(x,z,nx,nz,ring) {
  let span=Infinity;
  for (let i=0;i<ring.length;i++) {
    const [ax,az]=ring[i], [bx,bz]=ring[(i+1)%ring.length];
    const dx=bx-ax, dz=bz-az, det=nx*dz-nz*dx;
    if (Math.abs(det)<1e-7) continue;
    const t=((ax-x)*dz-(az-z)*dx)/det;
    const v=((ax-x)*nz-(az-z)*nx)/det;
    if (t>.02 && v>=0 && v<=1) span=Math.min(span,t);
  }
  return span;
}

export function mapHouseSections(house) {
  const ring=house.footprint;
  const walls=ring.map(([x,z],i)=>{
    const [bx,bz]=ring[(i+1)%ring.length], dx=bx-x, dz=bz-z;
    const length=Math.hypot(dx,dz);
    return {x,z,ux:dx/length,uz:dz/length,length};
  }).sort((a,b)=>b.length-a.length);
  const sites=[];
  for (const {x,z,ux,uz,length} of walls) {
    if (length<4.5) continue;
    const count=Math.max(1,Math.round(length/sectionSpacing));
    for (let j=0;j<count;j++) {
      const u=(j+.5)*length/count, bx=x+ux*u, bz=z+uz*u;
      const side=pointInRing(bx-uz*.08,bz+ux*.08,ring)?1:-1;
      const span=spanAcross(bx,bz,-uz*side,ux*side,ring);
      if (!Number.isFinite(span) || span<3) continue;
      const depth=Math.min(span/2,6.6);
      const cx=bx-uz*side*depth, cz=bz+ux*side*depth;
      if (sites.some(s=>Math.hypot(s.x-cx,s.z-cz)<sectionSpacing*.71)) continue;
      let sx=Math.min(1,length/count/9), sz=Math.min(1,(depth-.25)/6.4);
      // Keep the complete section in the footprint at bends and tapered ends.
      const fits=()=>[-1,0,1].every(i=>[-1,0,1].every(j=>
        pointInRing(cx+ux*4.4*sx*i-uz*6.4*sz*j,cz+uz*4.4*sx*i+ux*6.4*sz*j,ring)));
      while (sx>.28 && !fits()) { sx*=.86;sz*=.86; }
      if (!fits()) continue;
      sites.push({x:cx,z:cz,ux,uz,sx,sz});
    }
  }
  return sites;
}

// Chamber positions belong to the survey, including their storey. Only nearby
// sections need a live mesh. New slots enter at zero opacity on both axes.
export function createHouseSections() {
  const maps=new WeakMap(), slots=[];
  return function update(gallery,house,x,y,z,visibility,seconds,entryDraw=1) {
    const wanted=[];
    if (gallery && visibility>.001) {
      let sites=maps.get(house);
      if (!sites) { sites=mapHouseSections(house);maps.set(house,sites); }
      const floors=house.floors || Math.max(1,Math.round(house.heightM/2.8));
      const height=house.heightM/floors;
      const level=Math.floor(y/height);
      for (const site of sites) {
        const dx=x-site.x, dz=z-site.z;
        const along=site.ux*dx+site.uz*dz, across=-site.uz*dx+site.ux*dz;
        const attenuation=1-smooth((Math.hypot(along,across*.55)-5)/6);
        if (!attenuation) continue;
        for (let f=Math.max(0,level-1);f<=Math.min(floors-1,level+1);f++) {
          const vertical=1-smooth((Math.abs(y/height-f-.5)-.32)/.38);
          const alpha=visibility*attenuation*vertical;
          if (alpha>.003) wanted.push({site,f,height,along,across,alpha});
        }
      }
    }
    for (const slot of slots) {
      slot.active = wanted.some(entry=>slot.site===entry.site && slot.f===entry.f);
      if (!slot.active) slot.section.group.visible=false;
    }
    for (const {site,f,height,along,across,alpha} of wanted) {
      let slot=slots.find(s=>s.active && s.site===site && s.f===f);
      if (!slot) {
        slot=slots.find(s=>!s.active);
        if (!slot) {
          const section=createSectionRooms(), model=createFourSpaceModel();
          section.group.add(model.group);
          model.group.position.set(-1.83,1.72,-1.00);
          slot={section,model};slots.push(slot);
        }
        slot.active=true;slot.site=site;slot.f=f;
        const group=slot.section.group;
        gallery.add(group);
        group.position.set(site.x,f*height+.16,site.z);
        group.rotation.y=-Math.atan2(site.uz,site.ux);
        group.scale.set(site.sx,(height-.32)/4.0,site.sz);
        // The wall display stays metric even when the corridor fits a narrow wing.
        slot.model.group.scale.set(1/group.scale.x,1/group.scale.y,1/group.scale.z);
      }
      const phase=across*.25+along*.105+(y/height-f-.5)*.56;
      const w=.92*Math.sin(phase+.15*Math.sin(seconds*.17+f));
      const rotation=.24*Math.sin(phase*.62+seconds*.09);
      slot.section.update(w,rotation,alpha,entryDraw);
      slot.model.update(w,rotation,alpha*smooth((entryDraw-.48)/.48));
    }
  };
}
