// Builds each Jejak vehicle as a 3D model in three.js and renders it to two transparent PNG layers:
//   base = what stays on the road (shadow, tyres, forks)
//   body = what rides the suspension (paint, glass, lights, rider)
// The app stacks them and bobs only the body. Run with: node tools/vehicles/render.mjs
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

// Art is authored in the app's old 2D coordinates (64 x 46 box, y pointing down, top at -6).
const GROUND = 37.5;
const X = (x) => x - 32;
const Y = (y) => GROUND - y;

export const PAINTS = {
  red: '#D8242B',
  blue: '#1F5FE0',
  white: '#F4F4F2',
  black: '#101214',
  silver: '#A7AEB4',
  yellow: '#F2B705',
  green: '#1E9E52',
  orange: '#F0701E',
};

// ---------- materials ----------
const M = {
  paint: () =>
    new THREE.MeshPhysicalMaterial({ color: '#888', metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#16222B', metalness: 0.1, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.6 }),
  tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.88 }),
  rim: new THREE.MeshStandardMaterial({ color: '#C9CED2', metalness: 1, roughness: 0.22 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#E4E7EA', metalness: 1, roughness: 0.08 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: '#3A4147', metalness: 0.7, roughness: 0.45 }),
  trim: new THREE.MeshStandardMaterial({ color: '#16191C', roughness: 0.6 }),
  well: new THREE.MeshStandardMaterial({ color: '#050505', roughness: 1 }),
  seat: new THREE.MeshStandardMaterial({ color: '#1B1F22', roughness: 0.75 }),
  head: new THREE.MeshStandardMaterial({ color: '#FFF3C4', emissive: '#FFE7A0', emissiveIntensity: 0.9, roughness: 0.2 }),
  tail: new THREE.MeshStandardMaterial({ color: '#C0141B', emissive: '#A00F15', emissiveIntensity: 0.6, roughness: 0.3 }),
  jacket: new THREE.MeshStandardMaterial({ color: '#46545E', roughness: 0.65 }),
  pants: new THREE.MeshStandardMaterial({ color: '#262E34', roughness: 0.8 }),
  helmet: new THREE.MeshPhysicalMaterial({ color: '#F2F4F5', roughness: 0.25, clearcoat: 1 }),
  visor: new THREE.MeshPhysicalMaterial({ color: '#0C1318', roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
  glove: new THREE.MeshStandardMaterial({ color: '#15191C', roughness: 0.7 }),
};

// ---------- geometry helpers ----------
function svgShapePoints(d, div = 14) {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
  const shape = SVGLoader.createShapes(data.paths[0])[0];
  return shape.getPoints(div).map((p) => [p.x, p.y]);
}

function svgStrokePoints(d, div = 16) {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
  return data.paths[0].subPaths.map((sp) => sp.getPoints(div).map((p) => [p.x, p.y]));
}

// Sutherland–Hodgman: keep the part of a polygon on one side of a horizontal line (svg coords)
function clipY(poly, yLine, keepBelow) {
  const inside = (p) => (keepBelow ? p[1] >= yLine : p[1] <= yLine);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (yLine - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, yLine]);
    }
  }
  return out;
}

// Cut wheel arches into the bottom edge of a body outline (svg coords)
function cutArches(poly, wheelsX, wheelY, r) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (Math.abs(a[1] - wheelY) < 0.2 && Math.abs(b[1] - wheelY) < 0.2 && Math.abs(a[0] - b[0]) > 20) {
      const dir = Math.sign(b[0] - a[0]);
      const ws = [...wheelsX].sort((p, q) => dir * (p - q));
      const ins = [];
      for (const w of ws) {
        for (let k = 0; k <= 14; k++) {
          const t = (k / 14) * Math.PI;
          ins.push([w - dir * r * Math.cos(t), wheelY - r * Math.sin(t)]);
        }
      }
      poly.splice(i + 1, 0, ...ins);
      return poly;
    }
  }
  return poly;
}

function extrude(polySvg, depth, mat, bevel = 0.9) {
  const s = new THREE.Shape(polySvg.map(([x, y]) => new THREE.Vector2(X(x), Y(y))));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.1, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 5,
    curveSegments: 16,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  return m;
}

const v3 = (x, y, z = 0) => new THREE.Vector3(X(x), Y(y), z);

function capsule(a, b, r, mat) {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 6, 14);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

function rod(a, b, r, mat) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 14);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

function tube(pointsSvg, r, mat, z = 0) {
  const curve = new THREE.CatmullRomCurve3(pointsSvg.map(([x, y]) => v3(x, y, z)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r, 12, false), mat);
}

function box(cx, cy, w, h, d, mat, z = 0, radius = 0.6) {
  const s = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2, rr = Math.min(radius, w / 2, h / 2);
  s.moveTo(x0 + rr, y0);
  s.lineTo(x0 + w - rr, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr);
  s.lineTo(x0 + w, y0 + h - rr); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h);
  s.lineTo(x0 + rr, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr);
  s.lineTo(x0, y0 + rr); s.quadraticCurveTo(x0, y0, x0 + rr, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 0.4, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 3 });
  g.translate(0, 0, -(d - 0.4) / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(X(cx), Y(cy), z);
  return m;
}

// wheel lying in the XY plane (axle along Z)
function wheel(x, y, r, width, z, spokes = false) {
  const g = new THREE.Group();
  if (spokes) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r - 0.9, 0.9, 12, 48), M.tyre);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(r - 1.9, 0.25, 8, 48), M.rim);
    g.add(t, rimRing);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const side = k % 2 ? 0.5 : -0.5;
      g.add(rod(new THREE.Vector3(0, 0, side), new THREE.Vector3(Math.cos(a) * (r - 1.9), Math.sin(a) * (r - 1.9), 0), 0.08, M.rim));
    }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 16).rotateX(Math.PI / 2), M.chrome));
  } else {
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 40).rotateX(Math.PI / 2), M.tyre);
    const wallR = new THREE.Mesh(new THREE.TorusGeometry(r - width * 0.18, width * 0.32, 10, 40), M.tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, width + 0.12, 32).rotateX(Math.PI / 2), M.rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.17, r * 0.17, width + 0.3, 16).rotateX(Math.PI / 2), M.darkMetal);
    g.add(tyre, wallR, rim, hub);
    // five spokes on the rim face for a real-wheel read
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(r * 0.42, r * 0.11, 0.3), M.darkMetal);
      sp.position.set(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32, (width + 0.12) / 2 * Math.sign(z || 1));
      sp.rotation.z = a;
      g.add(sp);
    }
  }
  g.position.set(X(x), Y(y), z);
  return g;
}

function rider(pts) {
  const g = new THREE.Group();
  const P = (p, z = 0) => v3(p[0], p[1], z);
  for (const z of [-2.6, 2.6]) {
    g.add(capsule(P(pts.hip, z), P(pts.knee, z), 1.55, M.pants));
    g.add(capsule(P(pts.knee, z), P(pts.foot, z), 1.35, M.pants));
    const boot = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), M.glove);
    boot.scale.set(1.4, 0.8, 0.9);
    boot.position.copy(P(pts.foot, z)).add(new THREE.Vector3(0.6, -0.4, 0));
    g.add(boot);
  }
  g.add(capsule(P(pts.hip), P(pts.shoulder), 2.9, M.jacket));
  for (const z of [-3.1, 3.1]) {
    g.add(capsule(P(pts.shoulder, z * 0.75), P(pts.hand, z), 1.15, M.jacket));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), M.glove);
    hand.position.copy(P(pts.hand, z));
    g.add(hand);
  }
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(4.4, 32, 24), M.helmet);
  helmet.position.copy(P(pts.head));
  g.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(4.5, 32, 24, -0.55 * Math.PI, 1.1 * Math.PI, 0.38 * Math.PI, 0.3 * Math.PI), M.visor);
  visor.rotation.y = Math.PI / 2;
  visor.position.copy(P(pts.head));
  g.add(visor);
  return g;
}

function lamp(x, y, z, r, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
  m.scale.set(0.6, 1, 1);
  m.position.set(X(x), Y(y), z);
  return m;
}

// ---------- vehicles ----------
const CARS = {
  hatchback: { body: 'M6 29 L6 22 Q8 18 14 17 L22 11 Q24 10 28 10 L42 10 Q46 10 48 14 L52 20 Q58 21 58 24 L58 29 Z', wheels: [16, 48], belt: 18, door: 35 },
  sedan: { body: 'M3 29 L3 23 Q4 20 11 19 L19 12 Q21 11 25 11 L39 11 Q42 11 45 14 L50 19 L58 20 Q61 21 61 24 L61 29 Z', wheels: [14, 50], belt: 19, door: 32 },
  suv: { body: 'M5 29 L5 18 Q5 14 9 13 L14 8 Q15 7 18 7 L46 7 Q49 7 51 10 L55 17 Q59 18 59 22 L59 29 Z', wheels: [16, 48], belt: 15.5, door: 31 },
  mpv: { body: 'M5 29 L5 15 Q6 9 12 8 L40 8 Q46 8 50 12 L56 19 Q59 20 59 24 L59 29 Z', wheels: [16, 48], belt: 16.5, door: 29 },
  pickup: { body: 'M3 29 L3 20 L29 20 L29 12 Q29 10 32 10 L42 10 Q45 10 47 13 L51 19 Q59 20 60 24 L60 29 Z', wheels: [14, 50], belt: 19.5 },
};

function buildCar(style, paint) {
  const c = CARS[style];
  const W = 21;
  const base = new THREE.Group();
  const body = new THREE.Group();
  const outline = svgShapePoints(c.body, 16);
  const r = 5.6;
  const wy = 31.9; // wheel centre (svg y) so tyres touch the ground

  const lower = cutArches(clipY(outline, c.belt, true), c.wheels, 29, r + 1.1);
  body.add(extrude(lower, W, paint, 1.3));
  const top = Math.min(...outline.map((p) => p[1]));
  const cabin = clipY(outline, c.belt + 0.4, false);
  // glass gets a tiny bevel so it can't grow past the roof; the roof's larger bevel caps it
  body.add(extrude(cabin, W * 0.8, M.glass, 0.4));
  body.add(extrude(clipY(outline, top + 2.4, false), W * 0.8 + 0.6, paint, 1.1)); // roof
  if (c.door) body.add(box(c.door + 0.3, (top + c.belt) / 2 + 0.6, 1.6, c.belt - top - 1.2, W * 0.8 + 0.6, paint, 0, 0.4)); // B-pillar
  // wheel wells: dark half-cylinders so the arches read as openings, not holes
  for (const wx of c.wheels) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.0, r + 1.0, W - 3, 28, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2), M.well);
    well.position.set(X(wx), Y(29), 0);
    body.add(well);
  }
  // lights and trim
  const xs = outline.map((p) => p[0]);
  const front = Math.max(...xs), back = Math.min(...xs);
  for (const z of [-W / 2 + 3, W / 2 - 3]) {
    body.add(lamp(front - 0.1, 22.8, z, 1.6, M.head));
    body.add(lamp(back + 0.1, 22.8, z, 1.4, M.tail));
  }
  body.add(box((front + back) / 2, 28.4, front - back - 2, 1.4, W + 0.2, M.trim, 0, 0.5)); // sill
  body.add(box(front - 0.4, 26.6, 1.6, 2.4, W - 4, M.trim, 0, 0.6)); // bumper
  body.add(box(back + 0.4, 26.6, 1.6, 2.4, W - 4, M.trim, 0, 0.6));
  if (c.door) body.add(box(c.door + 3.6, c.belt + 2.4, 2.4, 0.7, W + 0.5, M.chrome, 0, 0.3)); // door handle
  // mirror
  body.add(box(Math.min(front - 11, c.wheels[1] - 4), c.belt - 0.4, 2.2, 1.6, W + 2.4, paint, 0, 0.5));

  for (const wx of c.wheels) for (const z of [-W / 2 + 1.9, W / 2 - 1.9]) base.add(wheel(wx, wy, r, 3.2, z));
  return { base, body, footprint: [X(back), X(front), W] };
}

const BIKES = {
  scooter: (paint) => {
    const base = new THREE.Group(), body = new THREE.Group();
    base.add(wheel(14, 32.5, 5, 2.8, 0), wheel(49, 32.5, 5, 2.8, 0));
    base.add(rod(v3(48, 16), v3(49, 32.5), 0.6, M.darkMetal));
    body.add(extrude(svgShapePoints('M8 30 Q8 20 18 20 L29 20 Q34 20 35 25 L36 30 Z'), 9, paint, 1.6));
    body.add(extrude(svgShapePoints('M40 30 L43 16 L48 16 L47 30 Z'), 8, paint, 1.2));
    body.add(box(38, 28.6, 10, 1.6, 7, M.trim));
    body.add(box(20.5, 18.8, 15, 2.6, 7.5, M.seat, 0, 1.2));
    body.add(rod(v3(46, 11, -5), v3(46, 11, 5), 0.55, M.trim));
    body.add(rod(v3(46, 16), v3(46.6, 11), 0.6, M.darkMetal));
    body.add(lamp(48.6, 18, 0, 1.5, M.head));
    body.add(lamp(8.3, 25, 0, 1.2, M.tail));
    body.add(rider({ hip: [21, 17], knee: [32, 18], foot: [36, 26.5], shoulder: [25, 6], hand: [46, 11], head: [27, 1.8] }));
    return { base, body, footprint: [X(8), X(52), 10] };
  },
  kapcai: (paint) => {
    const base = new THREE.Group(), body = new THREE.Group();
    base.add(wheel(13, 31.5, 6, 2.4, 0), wheel(51, 31.5, 6, 2.4, 0));
    for (const z of [-1.6, 1.6]) base.add(rod(v3(48, 12, z), v3(51, 31.5, z), 0.55, M.chrome));
    base.add(rod(v3(13, 31.5, 1.8), v3(27, 27, 1.8), 0.6, M.darkMetal));
    body.add(extrude(svgShapePoints('M5 21 Q9 16 19 16.5 L30 17 L29 22 Q20 25 11 24 Z'), 6.5, paint, 1.4));
    for (const pts of svgStrokePoints('M29 20 Q35 27 42 21 L47 13')) body.add(tube(pts, 2, paint));
    body.add(box(30, 26, 10, 6, 6, M.darkMetal, 0, 1.2));
    body.add(rod(v3(26, 28.5, 2.6), v3(8, 27, 3.2), 0.8, M.chrome)); // exhaust
    body.add(box(22, 15.2, 16, 3.4, 6, M.seat, 0, 1.4));
    body.add(rod(v3(46, 10, -5), v3(46, 10, 5), 0.55, M.trim));
    body.add(lamp(49.6, 13, 0, 1.5, M.head));
    body.add(lamp(5.4, 21.5, 0, 1.1, M.tail));
    body.add(rider({ hip: [22, 13], knee: [31, 16], foot: [31, 26.5], shoulder: [28, 2.5], hand: [46, 10], head: [31, -1.5] }));
    return { base, body, footprint: [X(5), X(57), 8] };
  },
  superbike: (paint) => {
    const base = new THREE.Group(), body = new THREE.Group();
    base.add(wheel(13, 31, 6.5, 3.2, 0), wheel(51, 31, 6.5, 2.6, 0));
    for (const z of [-1.7, 1.7]) base.add(rod(v3(50, 18, z), v3(51, 31, z), 0.7, M.chrome));
    base.add(rod(v3(13, 31, 2.2), v3(28, 26, 2.2), 0.8, M.darkMetal));
    body.add(extrude(svgShapePoints('M6 17 L18 18 L33 17 Q43 10 52 14 L57 21 L50 27 L24 28 L17 23 Z'), 8.5, paint, 2));
    body.add(extrude(svgShapePoints('M43 12 Q49 9.5 53 14.5 L46 15.5 Z'), 6, M.glass, 0.8));
    body.add(box(17.5, 16.2, 11, 3.2, 6, M.seat, 0, 1.4));
    body.add(lamp(55.4, 19.5, -1.6, 1.2, M.head), lamp(55.4, 19.5, 1.6, 1.2, M.head));
    body.add(lamp(6.4, 17.4, 0, 1, M.tail));
    body.add(rod(v3(22, 27, 2.8), v3(10, 21, 3.4), 1, M.chrome)); // exhaust
    body.add(rider({ hip: [18, 13], knee: [28, 14], foot: [25, 24.5], shoulder: [33, 5], hand: [44, 13], head: [38, 2] }));
    return { base, body, footprint: [X(6), X(58), 9] };
  },
  cruiser: (paint) => {
    const base = new THREE.Group(), body = new THREE.Group();
    base.add(wheel(11, 31, 6.5, 3.4, 0), wheel(54, 31, 6.5, 2.4, 0));
    for (const z of [-2, 2]) base.add(rod(v3(45, 8, z), v3(54, 31, z), 0.65, M.chrome));
    base.add(rod(v3(11, 31, 2.4), v3(24, 27, 2.4), 0.7, M.chrome));
    for (const pts of svgStrokePoints('M3.5 28 Q5 21 15 21.5')) body.add(tube(pts, 2.2, paint));
    body.add(extrude(svgShapePoints('M25 18 Q31 12 39 14 L41 20 L27 21 Z'), 7.5, paint, 1.8));
    body.add(box(31, 24.5, 14, 7, 7, M.chrome, 0, 2));
    body.add(rod(v3(26, 29, 3), v3(6, 29.5, 3.6), 0.9, M.chrome));
    body.add(box(18.5, 20.5, 15, 4, 7.5, M.seat, 0, 1.8));
    body.add(rod(v3(42, 7, -6), v3(42, 7, 6), 0.55, M.chrome));
    body.add(lamp(47.3, 11, 0, 2, M.head));
    body.add(lamp(3.6, 26, 0, 1.1, M.tail));
    body.add(rider({ hip: [18, 17], knee: [30, 17], foot: [39, 25.5], shoulder: [16, 4.5], hand: [42, 7], head: [18, 0] }));
    return { base, body, footprint: [X(3), X(61), 9] };
  },
  bicycle: (paint) => {
    const base = new THREE.Group(), body = new THREE.Group();
    base.add(wheel(13, 30, 7.5, 1.8, 0, true), wheel(51, 30, 7.5, 1.8, 0, true));
    for (const z of [-1, 1]) base.add(rod(v3(44, 17, z * 0.6), v3(51, 30, z), 0.38, M.darkMetal));
    const segs = [[[13, 30], [28, 30]], [[28, 30], [24, 16]], [[24, 16], [13, 30]], [[28, 30], [44, 17]], [[24, 17], [44, 17]], [[44, 17], [45, 12]], [[45, 12], [49, 12]]];
    for (const [a, b] of segs) body.add(rod(v3(...a), v3(...b), 0.75, paint));
    body.add(box(23, 14.8, 8, 2.2, 3.2, M.seat, 0, 1));
    body.add(rod(v3(49, 12, -4.5), v3(49, 12, 4.5), 0.45, M.trim));
    body.add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.6, 24).rotateX(Math.PI / 2), M.chrome).translateX(X(28)).translateY(Y(30)));
    body.add(rider({ hip: [24, 13], knee: [33, 20], foot: [29, 30.5], shoulder: [33, 3.5], hand: [48, 12], head: [37, 0] }));
    return { base, body, footprint: [X(5), X(59), 4] };
  },
};

// ---------- rendering ----------
export function createRenderer(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  return { renderer, canvas, env };
}

function contactShadow(footprint) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 32, 4, 128, 32, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  const [x0, x1, w] = footprint;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 12, w + 12), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, 0.02, 0);
  return m;
}

function setRole(group, role) {
  // role: 'show' normal, 'hide' invisible, 'ghostShadow' invisible but still casts a shadow, 'occlude' depth only
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.orig) o.userData.orig = o.material;
    o.visible = role !== 'hide';
    if (role === 'show') o.material = o.userData.orig;
    else {
      const m = o.userData.orig.clone();
      m.colorWrite = false;
      m.depthWrite = role === 'occlude';
      o.material = m;
    }
    o.renderOrder = role === 'occlude' ? -1 : 0;
    o.castShadow = true;
  });
}

export function renderVehicle(ctx, kind, style, paints) {
  const { renderer, canvas, env } = ctx;
  const scene = new THREE.Scene();
  scene.environment = env;
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(-14, 60, 34);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -45, right: 45, top: 30, bottom: -30, near: 1, far: 140 });
  key.shadow.radius = 6;
  key.shadow.blurSamples = 16;
  scene.add(key, new THREE.HemisphereLight('#ffffff', '#5a5040', 0.6));
  const rim = new THREE.DirectionalLight('#dfe9ff', 0.9);
  rim.position.set(30, 20, -40);
  scene.add(rim);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // fixed camera for every vehicle so they all share one scale on the map; slightly above and in front
  const aspect = canvas.width / canvas.height;
  const camera = new THREE.PerspectiveCamera(17, aspect, 10, 600);
  camera.position.set(52, 52, 150);
  camera.lookAt(1.5, 18, 0);

  const paintMat = M.paint();
  const built = kind === 'car' ? buildCar(style, paintMat) : BIKES[style](paintMat);
  const shadowBlob = contactShadow(built.footprint);
  scene.add(built.base, built.body, shadowBlob);

  const out = {};
  // base layer: wheels + shadows (the body is invisible but still casts its shadow)
  setRole(built.base, 'show');
  setRole(built.body, 'ghostShadow');
  ground.visible = true;
  shadowBlob.visible = true;
  renderer.render(scene, camera);
  out.base = canvas.toDataURL('image/png');

  // body layers: wheels only block what's behind them, no shadows
  setRole(built.base, 'occlude');
  setRole(built.body, 'show');
  ground.visible = false;
  shadowBlob.visible = false;
  for (const [name, hex] of Object.entries(paints)) {
    paintMat.color.set(hex);
    renderer.render(scene, camera);
    out[name] = canvas.toDataURL('image/png');
  }
  return out;
}

window.__vehicles = { createRenderer, renderVehicle, PAINTS };
