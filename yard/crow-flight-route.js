import {pointInRing} from './navigation.js';
import {wallCorners} from './facade-frame.js';
import {gableProfile,roofDeckY,roofParapet} from './roof-geometry.js';

const wingClearance=.90, overRoof=.32, footHeight=.19;
const eps=1e-7, distance=(x,z,a,b)=>Math.hypot(x-a,z-b);
function outline(ring,offset) {
  const area=ring.reduce((sum,[x,z],i)=>{const [u,v]=ring[(i+1)%ring.length];return sum+x*v-z*u;},0);
  const points=wallCorners(ring,-Math.sign(area)*offset);
  const xs=points.map(p=>p[0]), zs=points.map(p=>p[1]);
  return {points,x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs)};
}
function overlaps(r,x,z,u,v) {
  return !(Math.max(x,u)<r.x0-eps || Math.min(x,u)>r.x1+eps || Math.max(z,v)<r.z0-eps || Math.min(z,v)>r.z1+eps);
}
function touchesEdges(r,x,z,u,v) {
  const dx=u-x,dz=v-z;
  for (let i=0,j=r.points.length-1;i<r.points.length;j=i++) {
    const [ax,az]=r.points[j],[bx,bz]=r.points[i];
    if (Math.max(ax,bx)<Math.min(x,u)-eps || Math.min(ax,bx)>Math.max(x,u)+eps ||
        Math.max(az,bz)<Math.min(z,v)-eps || Math.min(az,bz)>Math.max(z,v)+eps) continue;
    const ex=bx-ax,ez=bz-az;
    const a=dx*(az-z)-dz*(ax-x), b=dx*(bz-z)-dz*(bx-x);
    const p=ex*(z-az)-ez*(x-ax), q=ex*(v-az)-ez*(u-ax);
    if ((Math.min(a,b)<=eps && Math.max(a,b)>=-eps) && (Math.min(p,q)<=eps && Math.max(p,q)>=-eps)) return true;
  }
  return false;
}
function crosses(r,x,z,u,v) {
  return overlaps(r,x,z,u,v) && (pointInRing(x,z,r.points) || touchesEdges(r,x,z,u,v));
}
function within(r,x,z,u,v) {
  return overlaps(r,x,z,u,v) && pointInRing(x,z,r.points) && pointInRing(u,v,r.points) && !touchesEdges(r,x,z,u,v);
}

export function createCrowFlightRouter(layout) {
  const houses=[];
  for (const building of [...(layout.buildings || []),...(layout.utilityStructures || [])]) {
    if (building.footprint?.length<3 || !building.footprint) continue;
    const deck=roofDeckY(building),rim=roofParapet(building),gable=gableProfile(building);
    const base=Math.max(Number.isFinite(deck)?deck:3,gable?.ridgeY || 0);
    const surface=rim?.outer || wallCorners(building.footprint);
    if (surface.length<3) continue;
    houses.push({outer:outline(surface,wingClearance),nodes:outline(surface,wingClearance+.76),
      near:outline(surface,wingClearance+.12),inner:outline(rim?.inner || surface,-wingClearance),
      floor:base+footHeight,top:Math.max(base,rim?.topY || 0)+overRoof});
  }
  function heightNeeded(x,z,u,v) {
    let height=-Infinity;
    for (const h of houses) if (crosses(h.outer,x,z,u,v)) {
      height=Math.max(height,within(h.inner,x,z,u,v)?h.floor:h.top);
    }
    return height;
  }
  // Clip the swept segment to the part BELOW each roof, including vertical
  // descent. A segment that clears a low block cannot tunnel into a taller one.
  function clearStep(x,y,z,u,h,v) {
    const min=Math.min(y,h),max=Math.max(y,h),dy=h-y,dx=u-x,dz=v-z;
    for (const house of houses) {
      if (min>=house.top || !overlaps(house.outer,x,z,u,v)) continue;
      if (max<house.floor) {
        if (crosses(house.outer,x,z,u,v)) return false;
        continue;
      }
      const start=y>house.top ? (house.top-y)/dy : 0;
      const end=h>house.top ? (house.top-y)/dy : 1;
      const a=x+start*dx,b=z+start*dz,c=x+end*dx,d=z+end*dz;
      if (!crosses(house.outer,a,b,c,d)) continue;
      if (!within(house.inner,a,b,c,d)) return false;
      if (min<house.floor) return false;
    }
    return true;
  }
  function boundary(x,y,z,bird,old) {
    let best=Infinity, result=null;
    function consider(u,v) {
      const score=distance(x,z,u,v)+(bird?.id!==undefined ? .18*distance(bird.x,bird.z,u,v) : 0)
        -(old && distance(old.x,old.z,u,v)<2 ? .75 : 0);
      if (score<best && clearStep(u,y,v,u,y,v)) {best=score;result={x:u,z:v};}
    }
    for (const house of houses) {
      const points=house.near.points;
      for (let i=0,j=points.length-1;i<points.length;j=i++) {
        const [ax,az]=points[j],[bx,bz]=points[i],dx=bx-ax,dz=bz-az;
        const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
        consider(ax+t*dx,az+t*dz);consider(ax,az);
      }
    }
    return result || {x,z};
  }
  function safePoint(x,y,z) {
    return clearStep(x,y,z,x,y,z)?{x,z}:boundary(x,y,z);
  }

  // One visibility graph for every bird and flight height. Edge weights also
  // store the roof clearance needed to open that corridor. Only the two moving
  // endpoints are connected when an actual detour is requested.
  let nodes,links,heights;
  function buildGraph() {
    nodes=houses.flatMap(h=>[...h.nodes.points,...h.near.points]);
    links=new Array(nodes.length);
    heights=new Float64Array(nodes.length*nodes.length).fill(NaN);
  }
  function neighbours(i) {
    if (links[i]) return links[i];
    const row=links[i]=[], [x,z]=nodes[i], n=nodes.length;
    // Expand only the corners actually searched. Later routes share both
    // directions of every surveyed corridor without a large first-frame build.
    for (let j=0;j<n;j++) if (j!==i) {
      const [u,v]=nodes[j], key=i*n+j;
      let height=heights[key];
      if (Number.isNaN(height)) heights[key]=heights[j*n+i]=height=heightNeeded(x,z,u,v);
      row.push({to:j,length:distance(x,z,u,v),height});
    }
    return row;
  }
  function findPath(b,gx,gy,gz) {
    if (!nodes) buildGraph();
    const n=nodes.length, alt=Math.min(b.y,gy), costs=new Float64Array(n).fill(Infinity);
    const parent=new Int16Array(n).fill(-1), visited=new Uint8Array(n);
    let total=Infinity, last=-1;
    for (let i=0;i<n;i++) {
      const [x,z]=nodes[i];
      if (heightNeeded(b.x,b.z,x,z)<=alt) costs[i]=distance(b.x,b.z,x,z);
    }
    for (;;) {
      let best=Infinity, index=-1;
      // A* with straight-line distance bounds; keep index order on exact ties.
      for (let i=0;i<n;i++) if (!visited[i] && Number.isFinite(costs[i])) {
        const [x,z]=nodes[i], estimate=costs[i]+distance(x,z,gx,gz);
        if (estimate<best) {best=estimate;index=i;}
      }
      if (index<0 || best>=total) break;
      visited[index]=1;
      const [x,z]=nodes[index];
      if (heightNeeded(x,z,gx,gz)<=alt) {total=best;last=index;break;}
      for (const {to,length,height} of neighbours(index)) if (!visited[to] && height<=alt) {
        // Favour turning space on broad corners. The tighter ring remains
        // available through genuinely narrow gaps between separate houses.
        const cost=costs[index]+length+.06;
        if (cost<costs[to]) {costs[to]=cost;parent[to]=index;}
      }
    }
    const route=[];
    for (let i=last;i>=0;i=parent[i]) route.push(nodes[i]);
    return route.reverse();
  }
  const tracks=new WeakMap();
  function waypoint(b,gx,gy,gz) {
    let t=tracks.get(b);
    if (!t) {t={out:{x:gx,z:gz,detour:false},path:[],step:0};tracks.set(b,t);}
    const out=t.out;
    out.x=gx;out.z=gz;out.y=undefined;out.detour=false;
    if (clearStep(b.x,b.y,b.z,gx,gy,gz)) {t.path.length=0;t.wait=null;return out;}
    const safeGoal=clearStep(gx,gy,gz,gx,gy,gz);
    if (!safeGoal) {
      const fresh=!t.wait || distance(t.rawX,t.rawZ,gx,gz)>1.25 || !clearStep(t.wait.x,gy,t.wait.z,t.wait.x,gy,t.wait.z);
      if (fresh) {
        t.wait=boundary(gx,gy,gz,b,t.wait);t.rawX=gx;t.rawZ=gz;
      }
      gx=t.wait.x;gz=t.wait.z;
      out.x=gx;out.z=gz;out.detour=true;
    } else t.wait=null;
    if (!safeGoal && clearStep(b.x,b.y,b.z,gx,gy,gz)) {t.path.length=0;return out;}
    out.detour=true;
    // A roof perch is approached from above its rim. A bird already on that
    // roof clears the parapet before moving off and beginning its descent.
    for (const house of houses) {
      if (b.y>=house.floor && crosses(house.outer,b.x,b.z,b.x,b.z)) {
        if (b.y<house.top+.18) {out.x=b.x;out.z=b.z;out.y=house.top+.28;return out;}
        gy=Math.max(gy,house.top+.18);out.y=gy;
      } else if (safeGoal && gy>=house.floor && crosses(house.outer,gx,gz,gx,gz) && b.y<house.top+.18) {
        out.x=b.x;out.z=b.z;out.y=house.top+.28;return out;
      }
    }
    if (out.y!==undefined && clearStep(b.x,b.y,b.z,gx,gy,gz)) return out;
    let p=t.path;
    const baseY=Math.min(b.y,gy);
    while (t.step+1<p.length && distance(b.x,b.z,...p[t.step])<.85 &&
      clearStep(b.x,baseY,b.z,p[t.step+1][0],baseY,p[t.step+1][1])) t.step++;
    const last=p.length-1, next=p[t.step];
    const stale=!next || distance(t.goalX,t.goalZ,gx,gz)>10 || Math.abs(t.alt-baseY)>2 ||
      !clearStep(b.x,baseY,b.z,next[0],baseY,next[1]) ||
      (t.step===last && distance(b.x,b.z,...next)<.45 && !clearStep(next[0],baseY,next[1],gx,baseY,gz));
    if (stale) {
      const moved=distance(t.startX,t.startZ,b.x,b.z)>.28 || distance(t.goalX,t.goalZ,gx,gz)>.4 ||
        Math.abs(t.alt-baseY)>.24;
      if (moved || !t.retry) {
        p=t.path=findPath(b,gx,gy,gz);t.step=0;t.goalX=gx;t.goalZ=gz;t.alt=baseY;
        t.startX=b.x;t.startZ=b.z;t.retry=24;
      } else t.retry--;
    }
    if (t.step<p.length) {[out.x,out.z]=p[t.step];}
    else {out.x=b.x;out.z=b.z;}
    return out;
  }
  return {waypoint,clearStep,safePoint};
}
