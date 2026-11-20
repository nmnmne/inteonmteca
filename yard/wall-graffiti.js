import * as THREE from './vendor/three.module.js';

// Guides traced in metres on the end wall of house 14. Several pens follow
// each gesture, with space for the brick to show inside the loops and forks.
// The last, thin strokes carry the ink away from the dense lower collar.
const gestures = [
  {width:1.06, lanes:9, color:0x462a32, points:[[-7.13,-.53],[-6.16,.12],[-5.38,.98],[-4.83,1.89],[-3.67,2.38],[-2.23,2.14],[-.93,2.58],[.55,3.23],[1.66,3.08],[2.43,2.18],[3.6,1.56],[5.33,1.02]]},
  {width:.82, lanes:7, color:0x273138, points:[[-6.51,.22],[-5.85,1.73],[-4.92,2.59],[-3.12,3.45],[-1.90,4.38],[-.56,4.50],[.68,4.16],[1.72,4.65],[3.14,6.75]]},
  {width:.49, lanes:5, color:0x502f32, points:[[-4.19,2.0],[-2.91,3.81],[-3.11,4.72],[-4.18,4.83],[-4.63,4.19],[-4.18,3.63],[-2.80,3.63],[-.59,4.32]]},
  {width:.40, lanes:5, color:0x363638, points:[[-6.87,3.64],[-6.34,2.67],[-6.18,1.56],[-5.44,.71],[-5.40,-.35],[-4.66,-.96],[-3.56,-1.23],[-1.51,-1.10],[.29,-1.42],[2.34,-1.09],[3.83,-1.24],[5.11,-.67]]},
  {width:.39, lanes:5, color:0x53363d, points:[[2.66,1.88],[3.72,1.75],[4.53,2.17],[5.11,1.91],[4.98,1.07],[4.50,.44],[4.39,-.22],[4.79,-.55],[5.27,-.28]]},
  {width:.48, lanes:5, color:0x29363a, points:[[-5.66,2.39],[-4.82,3.70],[-3.68,5.11],[-2.1,5.61],[-.08,5.55],[.87,6.21],[1.76,8.14],[3.26,9.05]]},
  {width:.34, lanes:4, color:0x58403a, points:[[-1.93,5.67],[-2.62,6.63],[-2.16,7.30],[-.97,7.13],[-.93,6.49],[.23,6.22],[1.46,6.96]]},
  {width:.22, lanes:3, color:0x303840, points:[[.91,6.87],[1.43,8.40],[2.21,9.34],[2.77,9.16],[2.89,8.53],[3.22,9.47],[3.89,10.52]]},
  {width:.26, lanes:3, color:0x593638, points:[[-7.27,.42],[-6.65,.82],[-6.15,.66],[-5.9,1.35],[-5.05,1.75]]},
  {width:.17, lanes:3, color:0x344047, points:[[-1.60,-1.53],[-.71,-1.69],[.81,-1.44],[1.67,-1.64],[2.53,-1.51]]},
];

// The writer has gone back over these junctions with a broad chisel pen.
// Their blunt downstrokes and fine return strokes read from across the yard.
const overprints = [
  {width:.17, color:0x35252c, points:[[-6.20,.20],[-5.63,.90],[-5.12,1.91],[-4.60,2.47],[-4.86,1.77],[-5.28,1.32],[-4.68,1.80],[-4.11,2.16],[-4.28,1.79],[-3.74,2.01],[-3.14,2.02]]},
  {width:.10, color:0x392a2c, points:[[-5.78,1.29],[-5.15,1.47],[-4.82,1.50],[-4.31,1.70],[-3.79,1.72]]},
  {width:.12, color:0x35252c, points:[[-4.31,2.53],[-4.14,2.80],[-4.01,2.84],[-4.09,2.61]]},
  {width:.17, color:0x263238, points:[[-4.71,3.00],[-3.75,3.50],[-2.98,4.12],[-3.09,4.59],[-3.51,4.81],[-3.72,4.65],[-3.31,4.40],[-2.95,4.30],[-2.42,4.75],[-2.54,4.34],[-2.09,4.53],[-1.65,4.51]]},
  {width:.13, color:0x263238, points:[[-3.20,4.13],[-2.77,4.30],[-2.23,4.10],[-1.74,4.18],[-1.31,4.13]]},
  {width:.13, color:0x493039, points:[[-1.92,5.89],[-1.43,5.64],[-.94,5.84],[-.53,5.73],[-.73,5.48],[-.34,5.58],[.14,5.55]]},
  {width:.15, color:0x263238, points:[[.74,6.38],[1.28,6.87],[1.57,7.58],[1.95,7.96],[1.82,7.37],[2.22,7.78],[2.08,7.35],[2.53,7.74]]},
  {width:.10, color:0x263238, points:[[1.55,7.03],[1.93,7.25],[2.26,7.21],[2.59,7.44]]},
];

const slices = 5;
export const verticesPerInscription = (slices + 1) * 2;

function printable(points) {
  let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
  for (const [x,y] of points) {
    x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y);
  }
  return x0 > -7.54 && x1 < 5.58 && y0 > -1.88 &&
    (x1 < -4.13 || x0 > 4.13 || y0 > .84 || y1 < -.84) &&
    (x1 < -7.32 || x0 > -6.70 || y0 > 3.08 || y1 < 2.32);
}

export function wallGraffiti() {
  let seed = 9137, count=0;
  const random = () => (seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
  const ink=[], strokes=[];
  for (const [index,g] of gestures.entries()) {
    const curve=new THREE.SplineCurve(g.points.map(p=>new THREE.Vector2(...p)));
    const length=curve.getLength();
    // Offset each pen in the moving frame of the gesture. The flock of
    // small inscriptions swells around a turn, then converges at its tip.
    function edges(t,offset,height,phase) {
      const p=curve.getPointAt(t), d=curve.getTangentAt(t);
      const swelling=Math.pow(Math.max(0,Math.sin(Math.PI*t)),.62);
      const breathing=.86+.14*Math.sin(t*13+index);
      const drift=g.width*swelling*(offset*breathing+.065*Math.sin(t*18+phase));
      const x=p.x-d.y*drift, y=p.y+d.x*drift;
      return [[x+d.y*height/2,y-d.x*height/2],[x-d.y*height/2,y+d.x*height/2]];
    }
    for (let lane=0; lane<g.lanes; lane++) {
      const offset=(2*lane/(g.lanes-1)-1)+(random()-.5)*.11;
      const phase=random()*2*Math.PI;
      let at=(random()*.11+Math.abs(offset)*.038)*length;
      const end=length*(1-random()*.09-Math.abs(offset)*.04);
      while (at < end-.18) {
        const span=Math.min(end-at,.47+random()*.81+(index===0?.33:0));
        const h=(.17+random()*.24)*(g.lanes<=3?.72:1)*(1-.2*Math.abs(offset));
        const tilt=(random()-.5)*.16, bend=(random()-.5)*.09;
        const points=[];
        for (let j=0; j<=slices; j++) {
          const u=j/slices, t=(at+u*span)/length;
          const sway=(tilt*(u-.5)+bend*Math.sin(u*Math.PI))/g.width;
          points.push(...edges(t,offset+sway,h*(.83+.17*Math.sin(Math.PI*u)),phase));
        }
        if (printable(points)) {
          const color=random()<.18 ? (index%2 ? 0x584747 : 0x26353c) : g.color;
          ink.push({points,color,slot:count++});
        }
        at+=span+.02+random()*.19+(random()<.13 ? .30+random()*.36 : 0);
      }
    }
    // Split-nib sweeps end in a fine flick. Break them into short segments
    // so paint can run up to a fitting without covering its face.
    const veins=g.lanes>5 ? [-.91,-.10,.96] : [index%2 ? -.78 : .68];
    for (const offset of veins) {
      const phase=random()*Math.PI, start=.03+random()*.13, end=.77+random()*.20;
      const parts=Math.ceil(length*(end-start)/.18);
      let previous;
      for (let j=0; j<=parts; j++) {
        const u=j/parts, t=start+(end-start)*u;
        const taper=Math.sin(Math.PI*u);
        const w=(.014+.034*g.width)*taper*(.63+.37*Math.sin(t*19+phase)**2);
        const current=edges(t,offset,w,phase);
        if (previous && printable([...previous,...current])) {
          strokes.push({points:[...previous,...current],color:g.color,slot:-1,from:(j-1)/parts,to:u});
        }
        previous=current;
      }
    }
  }
  for (const mark of overprints) {
    const curve=new THREE.SplineCurve(mark.points.map(p=>new THREE.Vector2(...p)));
    const parts=Math.ceil(curve.getLength()/.07);
    let previous;
    for (let j=0; j<=parts; j++) {
      const u=j/parts, p=curve.getPointAt(u), d=curve.getTangentAt(u);
      const nib=.20+.80*Math.abs(.83*d.y-.56*d.x);
      const radius=.5*mark.width*Math.pow(Math.sin(Math.PI*u),.48)*nib;
      const current=[[p.x+d.y*radius,p.y-d.x*radius],[p.x-d.y*radius,p.y+d.x*radius]];
      if (previous && printable([...previous,...current])) {
        strokes.push({points:[...previous,...current],color:mark.color,slot:-2,from:(j-1)/parts,to:u});
      }
      previous=current;
    }
  }
  return {ribbons:ink.concat(strokes),count};
}
