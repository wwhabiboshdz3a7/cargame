// Disposition générale de la carte (32 km x 32 km = 1024 km²).
// Axe X : ouest -> est. Axe Z : nord -> sud (la mer Méditerranée est au nord, z négatif).
import { smoothstep, lerp } from './noise.js';

export const WORLD_HALF = 16000;
export const WORLD_SIZE = WORLD_HALF * 2;

// Ville d'Alger : grille de rues
export const CITY = {
  x0: -5400, z0: -9900, nx: 36, nz: 18, pitch: 120, street: 20, y: 4,
};
CITY.x1 = CITY.x0 + CITY.nx * CITY.pitch;
CITY.z1 = CITY.z0 + CITY.nz * CITY.pitch;
export const cityNode = (i, j) => `C_${i}_${j}`;
export const cityNodePos = (i, j) => [CITY.x0 + i * CITY.pitch, CITY.z0 + j * CITY.pitch];

// Trait de côte (z de la ligne de rivage en fonction de x)
export function coastZ(x) {
  const nat = -10550 + 380 * Math.sin(x * 0.00037 + 0.7) + 220 * Math.sin(x * 0.00093 + 2.1) + 90 * Math.sin(x * 0.0031 + 0.3);
  const w = smoothstep(-7200, -5900, x) * (1 - smoothstep(-700, 600, x));
  return lerp(nat, -10010, w);
}

// Quais du port (rectangles plats à y=4 qui avancent dans la mer)
export const PORT_Y = 4;
export const PORT_QUAYS = [
  { id: 'Q1', x0: -5250, x1: -4850, z0: -10520, z1: -10000 },
  { id: 'Q2', x0: -4760, x1: -4580, z0: -10740, z1: -10000 },
  { id: 'Q3', x0: -4250, x1: -4030, z0: -10560, z1: -10000 },
  { id: 'Q4', x0: -3750, x1: -3480, z0: -10600, z1: -10000 },
  { id: 'TC', x0: -3150, x1: -1700, z0: -10660, z1: -10000 }, // terminal à conteneurs
  { id: 'JETEE', x0: -5300, x1: -1700, z0: -10960, z1: -10850 }, // jetée / brise-lames
  { id: 'LIEN', x0: -1900, x1: -1700, z0: -10860, z1: -10640 },
];

export const AIRPORT = {
  x0: 3000, x1: 8300, z0: -9950, z1: -8300,
  runway: { x0: 3500, x1: 7800, z: -9380, w: 60 },
  taxiway: { x0: 3700, x1: 7600, z: -9140, w: 24 },
  apron: { x0: 4700, x1: 6700, z0: -8920, z1: -8560 },
  terminal: { x0: 5000, x1: 6400, z0: -8560, z1: -8420 },
  tower: { x: 6800, z: -8640 },
};

export const STUNT_PARK = { x0: 9300, x1: 11500, z0: -5900, z1: -4300 };
export const MONUMENT = { x: -2500, z: -7050 };
export const OASIS = { x: 2500, z: 11500, r: 650 };
export const CHOTT = { x: -6500, z: 6100, rx: 3000, rz: 1250 };
export const MEGA_RAMP_AREA = { x0: -5800, x1: -4300, z0: 10300, z1: 11300 };
export const BLIDA = { x0: -150, x1: 750, z0: -4900, z1: -4250 };

// Zones d'aplanissement. y: nombre ou 'auto' (hauteur naturelle au centre).
// m: marges [ouest, est, nord, sud]
export const FLAT_REGIONS = [
  { id: 'city', type: 'rect', x0: -5600, x1: -900, z0: -10010, z1: -7700, m: [250, 250, 4, 260], y: CITY.y },
  ...PORT_QUAYS.map((q) => ({ id: 'port_' + q.id, type: 'rect', x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, m: [3, 3, 3, 3], y: PORT_Y })),
  { id: 'airport', type: 'rect', x0: AIRPORT.x0, x1: AIRPORT.x1, z0: AIRPORT.z0, z1: AIRPORT.z1, m: [320, 320, 140, 320], y: 'auto' },
  { id: 'stunt', type: 'rect', x0: STUNT_PARK.x0, x1: STUNT_PARK.x1, z0: STUNT_PARK.z0, z1: STUNT_PARK.z1, m: [260, 260, 260, 260], y: 'auto' },
  { id: 'monument', type: 'circle', x: MONUMENT.x, z: MONUMENT.z, r: 130, m: 90, y: 'auto' },
  { id: 'blida', type: 'rect', x0: BLIDA.x0, x1: BLIDA.x1, z0: BLIDA.z0, z1: BLIDA.z1, m: [160, 160, 160, 160], y: 'auto' },
  { id: 'oasis', type: 'circle', x: OASIS.x, z: OASIS.z, r: OASIS.r, m: 380, y: 'auto' },
  { id: 'chott', type: 'ellipse', x: CHOTT.x, z: CHOTT.z, rx: CHOTT.rx, rz: CHOTT.rz, m: 600, y: 'auto' },
  { id: 'megaramp', type: 'rect', x0: MEGA_RAMP_AREA.x0, x1: MEGA_RAMP_AREA.x1, z0: MEGA_RAMP_AREA.z0, z1: MEGA_RAMP_AREA.z1, m: [220, 220, 220, 220], y: 'auto' },
];

// Points d'intérêt (carte, voyage rapide, noms de lieux)
export const POIS = [
  { id: 'alger', name: 'Alger Centre', ar: 'الجزائر العاصمة', x: -3240, z: -8800, icon: 'city' },
  { id: 'port', name: "Port d'Alger", ar: 'ميناء الجزائر', x: -3300, z: -10300, icon: 'port' },
  { id: 'djamaa', name: 'Djamaa El Djazaïr', ar: 'جامع الجزائر', x: -1500, z: -9600, icon: 'landmark' },
  { id: 'maqam', name: 'Maqam Echahid', ar: 'مقام الشهيد', x: MONUMENT.x, z: MONUMENT.z, icon: 'landmark' },
  { id: 'airport', name: 'Aéroport d\'Alger', ar: 'مطار الجزائر', x: 5650, z: -9000, icon: 'airport' },
  { id: 'stunt', name: 'Stunt Park', ar: 'حديقة الاستعراض', x: 10400, z: -5100, icon: 'stunt' },
  { id: 'a1', name: 'Autoroute Est-Ouest', ar: 'الطريق السيار شرق-غرب', x: -1500, z: -6550, icon: 'highway' },
  { id: 'blida', name: 'Blida', ar: 'البليدة', x: 300, z: -4580, icon: 'city' },
  { id: 'chiffa', name: 'Gorges de la Chiffa', ar: 'مضيق الشفة', x: 500, z: -1500, icon: 'mountain' },
  { id: 'chrea', name: 'Forêt de Chréa', ar: 'غابة الشريعة', x: -2200, z: -1600, icon: 'forest' },
  { id: 'chott', name: 'Chott El Hodna', ar: 'شط الحضنة', x: CHOTT.x, z: CHOTT.z, icon: 'lake' },
  { id: 'plateaux', name: 'Hauts Plateaux', ar: 'الهضاب العليا', x: 6000, z: 4500, icon: 'steppe' },
  { id: 'erg', name: 'Grand Erg Occidental', ar: 'العرق الغربي الكبير', x: -5000, z: 10800, icon: 'desert' },
  { id: 'ghardaia', name: 'Ghardaïa', ar: 'غرداية', x: OASIS.x, z: OASIS.z, icon: 'city' },
  { id: 'tassili', name: "Tassili n'Ajjer", ar: 'طاسيلي ناجر', x: 10500, z: 11800, icon: 'mountain' },
  { id: 'tipaza', name: 'Tipaza', ar: 'تيبازة', x: -12500, z: 0, icon: 'ruins' },
  { id: 'corniche', name: 'Corniche', ar: 'الكورنيش', x: -8500, z: 0, icon: 'beach' },
];
// Les POI côtiers suivent la côte
for (const p of POIS) {
  if (p.id === 'tipaza') p.z = coastZ(p.x) + 220;
  if (p.id === 'corniche') p.z = coastZ(p.x) + 200;
}

// Nom de la zone où se trouve un point (pour l'affichage HUD)
export function locationName(x, z) {
  if (x > CITY.x0 - 150 && x < CITY.x1 + 150 && z > CITY.z0 - 120 && z < CITY.z1 + 100) return 'Alger Centre';
  if (x > -5400 && x < -1600 && z < -9990 && z > -11000) return "Port d'Alger";
  if (x > AIRPORT.x0 && x < AIRPORT.x1 && z > AIRPORT.z0 && z < AIRPORT.z1) return "Aéroport d'Alger";
  if (x > STUNT_PARK.x0 - 50 && x < STUNT_PARK.x1 + 50 && z > STUNT_PARK.z0 - 50 && z < STUNT_PARK.z1 + 50) return 'Stunt Park';
  if (Math.hypot(x - MONUMENT.x, z - MONUMENT.z) < 450) return 'Riadh El Feth — Maqam Echahid';
  if (x > BLIDA.x0 - 200 && x < BLIDA.x1 + 200 && z > BLIDA.z0 - 200 && z < BLIDA.z1 + 200) return 'Blida';
  if (Math.hypot(x - OASIS.x, z - OASIS.z) < 1100) return 'Ghardaïa — Vallée du M\'Zab';
  const cz = coastZ(x);
  if (z < cz) return 'Mer Méditerranée';
  if (z < cz + 700) return x < -9000 ? 'Côte de Tipaza' : 'Corniche';
  if (((x - CHOTT.x) / (CHOTT.rx + 400)) ** 2 + ((z - CHOTT.z) / (CHOTT.rz + 400)) ** 2 < 1) return 'Chott El Hodna';
  if (z < -4600) return 'Plaine de la Mitidja';
  if (z < 3300) {
    if (x > -4500 && x < -500 && z > -4000 && z < 0) return 'Forêt de Chréa';
    if (Math.abs(x - 600) < 900) return 'Gorges de la Chiffa';
    return 'Atlas Tellien';
  }
  if (z < 7600) return 'Hauts Plateaux';
  if (x < 0) return 'Grand Erg Occidental';
  if (x > 6500) return "Tassili n'Ajjer";
  return 'Sahara — Reg';
}
