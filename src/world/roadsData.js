// Définition du réseau routier (points de contrôle). Les chaînes sont des noeuds nommés (carrefours).
import { CITY, cityNode, cityNodePos, coastZ } from './layout.js';

export const NODES = {
  J_A1_W: [-11000, -6450],
  J_ALGER: [-3000, -6600],
  J_RN1: [300, -6500],
  J_AIRPORT: [5700, -6900],
  J_STUNT: [10400, -6500],
  J_A1_E: [13000, -6350],
  AIRPORT_T: [5700, -8330],
  STUNT_GATE: [10400, -5880],
  MONUMENT: [-2500, -7180],
  BLIDA: [300, -4580],
  CHREA: [-2200, -1600],
  J_STEPPE_W: [-11000, 4300],
  J_STEPPE: [1000, 4400],
  J_STEPPE_E: [13400, 4500],
  GHARDAIA: [2500, 11500],
  MEGA_RAMP: [-4300, 10800],
  TASSILI: [9500, 12000],
  CORN_W: [-11000, coastZ(-11000) + 270],
  CORN_E: [13000, coastZ(13000) + 260],
};

// Noeuds de la grille urbaine
for (let i = 0; i <= CITY.nx; i++) {
  for (let j = 0; j <= CITY.nz; j++) NODES[cityNode(i, j)] = cityNodePos(i, j);
}

function corniche(xFrom, xTo, step, offset, extraNodes) {
  const pts = [];
  const dir = Math.sign(xTo - xFrom);
  for (let x = xFrom; dir > 0 ? x <= xTo : x >= xTo; x += step * dir) {
    let off = offset;
    if (x > 2600 && x < 8700) off = 180; // longe l'aéroport côté mer
    pts.push([x, coastZ(x) + off + 40 * Math.sin(x * 0.0021)]);
  }
  // insère les noeuds nommés à leur position
  for (const n of extraNodes) {
    const nx = NODES[n][0];
    let k = pts.findIndex((p) => (dir > 0 ? p[0] > nx : p[0] < nx));
    if (k < 0) k = pts.length;
    // supprime les points trop proches du noeud
    const filtered = [];
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(pts[i][0] - nx) < step * 0.45) { if (i < k) k--; continue; }
      filtered.push(pts[i]);
    }
    filtered.splice(k, 0, n);
    pts.length = 0; pts.push(...filtered);
  }
  return pts;
}

// type: highway | national | mountain | piste | city
export const ROADS = [];

// Rues de la ville (en premier : elles fixent la hauteur des noeuds urbains)
for (let j = 0; j <= CITY.nz; j++) {
  const pts = [];
  for (let i = 0; i <= CITY.nx; i++) pts.push(cityNode(i, j));
  ROADS.push({ id: 'city_h' + j, type: 'city', name: j === 0 ? 'Boulevard du Front de Mer' : `Rue ${j}`, pts });
}
for (let i = 0; i <= CITY.nx; i++) {
  const pts = [];
  for (let j = 0; j <= CITY.nz; j++) pts.push(cityNode(i, j));
  ROADS.push({ id: 'city_v' + i, type: 'city', name: `Avenue ${i}`, pts });
}

ROADS.push(
  {
    id: 'A1', type: 'highway', name: 'Autoroute Est-Ouest (A1)',
    pts: [[-15990, -6300], [-13500, -6560], 'J_A1_W', [-9000, -6250], [-7000, -6320], [-5000, -6520], 'J_ALGER',
      [-1400, -6540], 'J_RN1', [2600, -6760], 'J_AIRPORT', [8000, -6720], 'J_STUNT', 'J_A1_E', [15990, -6620]],
  },
  { id: 'A1_ALGER', type: 'highway', name: 'Rocade d\'Alger', pts: ['J_ALGER', [-3000, -7150], cityNode(20, CITY.nz)] },
  { id: 'AIRPORT_RD', type: 'national', name: "Route de l'Aéroport", pts: ['J_AIRPORT', [5720, -7600], 'AIRPORT_T'] },
  { id: 'STUNT_RD', type: 'national', name: 'Accès Stunt Park', pts: ['J_STUNT', [10400, -6200], 'STUNT_GATE'] },
  { id: 'MONUMENT_RD', type: 'mountain', name: 'Chemin de Riadh El Feth', pts: [cityNode(24, CITY.nz), [-2560, -7520], [-2440, -7350], 'MONUMENT'] },
  {
    id: 'RN1', type: 'national', carve: 1, name: 'RN1 — Transsaharienne',
    pts: ['J_RN1', [300, -5800], 'BLIDA', [300, -4200], [760, -3500], [180, -2750], [860, -1950], [260, -1050], [1000, -200],
      [560, 700], [1250, 1550], [720, 2450], [1150, 3400], 'J_STEPPE', [1300, 6000], [1900, 7800], [2300, 9800], 'GHARDAIA',
      [2650, 13400], [2300, 15990]],
  },
  {
    id: 'CHREA_RD', type: 'mountain', carve: 1, name: 'Route de Chréa',
    pts: ['BLIDA', [-380, -4480], [-900, -4050], [-560, -3550], [-1320, -3260], [-980, -2760], [-1820, -2460], [-1480, -1960], 'CHREA'],
  },
  {
    id: 'RN5', type: 'national', carve: 1, name: 'RN5 — Route de Bouira',
    pts: ['CORN_E', [13050, -8100], 'J_A1_E', [13300, -5200], [12800, -3800], [13500, -2600], [12900, -1300], [13600, 0],
      [13000, 1300], [13500, 2600], [13100, 3500], 'J_STEPPE_E'],
  },
  {
    id: 'RN4', type: 'national', carve: 1, name: 'RN4 — Route de Miliana',
    pts: ['CORN_W', [-11050, -8000], 'J_A1_W', [-11400, -5200], [-10800, -3900], [-11500, -2600], [-10900, -1300], [-11600, 0],
      [-11000, 1300], [-11500, 2600], [-11100, 3500], 'J_STEPPE_W'],
  },
  {
    id: 'STEPPE', type: 'national', name: 'Route des Hauts Plateaux',
    pts: [[-15990, 4500], 'J_STEPPE_W', [-8000, 4180], [-5000, 4150], [-2000, 4350], 'J_STEPPE', [4500, 4600], [8500, 4300], 'J_STEPPE_E', [15990, 4700]],
  },
  {
    id: 'CORNICHE_W', type: 'national', name: 'Corniche Ouest',
    pts: [...corniche(-15990, -6300, 650, 270, ['CORN_W']), cityNode(0, 1)],
  },
  {
    id: 'CORNICHE_E', type: 'national', name: 'Corniche Est',
    pts: [cityNode(CITY.nx, 1), ...corniche(-300, 15990, 650, 260, ['CORN_E'])],
  },
  { id: 'PISTE_ERG', type: 'piste', carve: 0.8, name: "Piste de l'Erg", pts: ['GHARDAIA', [500, 11300], [-1800, 11020], 'MEGA_RAMP'] },
  { id: 'PISTE_TASSILI', type: 'piste', carve: 0.8, name: 'Piste du Tassili', pts: ['GHARDAIA', [4500, 11900], [7000, 12300], 'TASSILI', [12500, 11400], [15990, 11200]] },
  { id: 'PISTE_NE', type: 'piste', carve: 0.8, name: 'Piste du Nord-Est', pts: ['TASSILI', [11500, 9500], [13000, 7500], [13400, 5600], 'J_STEPPE_E'] },
);

export const ROAD_TYPES = {
  highway: { halfWidth: 14.6, lanes: 3, laneWidth: 3.6, medianHalf: 1.3, speed: 120 / 3.6, smooth: 260, maxGrade: 0.06, priority: 5, surface: 'asphalt', step: 8 },
  national: { halfWidth: 5.6, lanes: 1, laneWidth: 3.6, medianHalf: 0, speed: 80 / 3.6, smooth: 120, maxGrade: 0.1, priority: 4, surface: 'asphalt', step: 8 },
  mountain: { halfWidth: 4.4, lanes: 1, laneWidth: 3.2, medianHalf: 0, speed: 55 / 3.6, smooth: 70, maxGrade: 0.13, priority: 3, surface: 'asphalt', step: 6 },
  piste: { halfWidth: 6.5, lanes: 1, laneWidth: 3.6, medianHalf: 0, speed: 70 / 3.6, smooth: 90, maxGrade: 0.12, priority: 2, surface: 'dirt', step: 10 },
  city: { halfWidth: 10, lanes: 2, laneWidth: 3.4, medianHalf: 0.2, speed: 55 / 3.6, smooth: 0, maxGrade: 1, priority: 6, surface: 'asphalt', step: 12 },
};
