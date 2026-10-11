// Catalogue des véhicules (noms fictifs). Profils de carrosserie + caractéristiques mécaniques.

const SEDAN = {
  top: [[0, 0.62], [0.03, 0.74], [0.08, 0.8], [0.27, 0.88], [0.31, 0.92], [0.44, 1.43], [0.62, 1.45], [0.76, 1.13], [0.8, 1.06], [0.94, 1.04], [0.985, 0.95], [1, 0.8]],
  bottom: [[0, 0.32], [0.05, 0.22], [0.95, 0.24], [1, 0.38]],
  width: [[0, 0.84], [0.05, 0.96], [0.15, 1], [0.85, 1], [0.96, 0.96], [1, 0.86]],
  belt: 0.98, tumble: 0.78, ws: [0.31, 0.44], rw: [0.62, 0.77],
};

export const CARS = [
  {
    id: 'atlas', name: 'Atlas Classic', cat: 'Berline', price: 0, desc: "La berline familiale qu'on voit partout, de Tlemcen à Annaba.",
    body: { ...SEDAN, L: 4.45, W: 1.74, WB: 2.62, front: 0.88, R: 0.31, RW: 0.2 },
    extras: [], color: '#c9ccd1', finish: 'metal', rim: 'steel',
    phys: { mass: 1150, hp: 110, top: 185, drive: 'FWD', grip: 1.0, gears: 5, redline: 6300, susp: { hz: 1.55, zeta: 0.42, travel: 0.2, rest: 0.32 }, brake: 1.0, cyl: 4, sound: 'i4' },
  },
  {
    id: 'taxi', name: 'Taxi Alger', cat: 'Berline', price: 0, desc: 'Le fidèle taxi jaune de la capitale. Increvable.',
    body: { ...SEDAN, L: 4.3, W: 1.72, WB: 2.6, front: 0.84, R: 0.3, RW: 0.19 },
    extras: ['taxi'], color: '#f2c40f', finish: 'gloss', rim: 'steel',
    phys: { mass: 1100, hp: 95, top: 175, drive: 'FWD', grip: 0.98, gears: 5, redline: 6000, susp: { hz: 1.5, zeta: 0.4, travel: 0.2, rest: 0.32 }, brake: 0.95, cyl: 4, sound: 'i4' },
  },
  {
    id: 'kasbah', name: 'Kasbah Hatch R', cat: 'Citadine sportive', price: 1800000, desc: 'Petite, nerveuse, parfaite pour les ruelles et les cols.',
    body: {
      L: 4.15, W: 1.8, WB: 2.58, front: 0.84, R: 0.33, RW: 0.23,
      top: [[0, 0.6], [0.04, 0.74], [0.25, 0.86], [0.28, 0.9], [0.43, 1.4], [0.8, 1.42], [0.88, 1.34], [0.96, 1.08], [1, 0.84]],
      bottom: [[0, 0.28], [0.05, 0.18], [0.95, 0.2], [1, 0.34]],
      width: [[0, 0.86], [0.05, 0.97], [0.15, 1], [0.85, 1], [0.96, 0.97], [1, 0.9]],
      belt: 0.96, tumble: 0.76, ws: [0.28, 0.43], rw: [0.82, 0.96],
    },
    extras: ['spoilerSmall', 'dualExhaust'], color: '#d0312d', finish: 'gloss', rim: 'sport5',
    phys: { mass: 1280, hp: 245, top: 250, drive: 'FWD', grip: 1.08, gears: 6, redline: 7000, susp: { hz: 2.0, zeta: 0.5, travel: 0.16, rest: 0.28 }, brake: 1.15, cyl: 4, sound: 'i4turbo', turbo: true },
  },
  {
    id: 'hoggar', name: 'Hoggar Pickup 4x4', cat: 'Pick-up', price: 2600000, desc: 'Le roi des pistes du Sud. Rien ne l\'arrête.',
    body: {
      L: 5.25, W: 1.9, WB: 3.1, front: 0.95, R: 0.39, RW: 0.27,
      top: [[0, 0.88], [0.03, 1.04], [0.22, 1.13], [0.27, 1.17], [0.37, 1.8], [0.54, 1.82], [0.56, 1.28], [0.985, 1.26], [1, 1.08]],
      bottom: [[0, 0.5], [0.05, 0.44], [0.95, 0.46], [1, 0.56]],
      width: [[0, 0.88], [0.04, 0.98], [0.12, 1], [0.9, 1], [1, 0.98]],
      belt: 1.3, tumble: 0.86, ws: [0.27, 0.37], rw: [0.535, 0.55],
    },
    extras: ['bed', 'bullbar', 'snorkel', 'mudflaps'], color: '#f4f2ea', finish: 'gloss', rim: 'offroad',
    phys: { mass: 2050, hp: 220, top: 180, drive: 'AWD', split: 0.5, grip: 0.98, gears: 6, redline: 4800, susp: { hz: 1.35, zeta: 0.45, travel: 0.32, rest: 0.42 }, brake: 1.0, cyl: 6, sound: 'diesel', offroad: true, tires: 'offroad' },
  },
  {
    id: 'buggy', name: 'Erg Dune Buggy', cat: 'Buggy', price: 3200000, desc: 'Léger, suspensions à grand débattement. Les dunes sont à vous.',
    body: {
      L: 3.7, W: 1.95, WB: 2.5, front: 0.6, R: 0.42, RW: 0.3,
      top: [[0, 0.72], [0.08, 0.86], [0.35, 0.96], [0.7, 0.96], [0.9, 1.02], [1, 0.95]],
      bottom: [[0, 0.52], [0.1, 0.46], [0.9, 0.48], [1, 0.6]],
      width: [[0, 0.62], [0.12, 0.8], [0.3, 0.86], [0.75, 0.86], [1, 0.7]],
      belt: 2.0, tumble: 0.9, ws: [0.2, 0.3], rw: [0.9, 0.95], noGlass: true,
    },
    extras: ['cage', 'engineOpen', 'lightbarRoof'], color: '#ff7f11', finish: 'matte', rim: 'offroad',
    phys: { mass: 920, hp: 260, top: 190, drive: 'RWD', grip: 1.0, gears: 5, redline: 7500, susp: { hz: 1.25, zeta: 0.42, travel: 0.42, rest: 0.5 }, brake: 1.0, cyl: 4, sound: 'boxer', offroad: true, tires: 'offroad' },
  },
  {
    id: 'cruiser', name: 'Sahara Cruiser V8', cat: 'SUV 4x4', price: 5000000, desc: 'Puissant, robuste, climatisé. La traversée du Sahara en tout confort.',
    body: {
      L: 4.95, W: 1.98, WB: 2.85, front: 0.95, R: 0.41, RW: 0.28,
      top: [[0, 0.88], [0.03, 1.02], [0.22, 1.14], [0.27, 1.2], [0.38, 1.84], [0.9, 1.86], [0.97, 1.76], [1, 1.25]],
      bottom: [[0, 0.5], [0.05, 0.44], [0.95, 0.46], [1, 0.56]],
      width: [[0, 0.88], [0.04, 0.98], [0.12, 1], [0.9, 1], [1, 0.97]],
      belt: 1.3, tumble: 0.86, ws: [0.27, 0.38], rw: [0.9, 0.975],
    },
    extras: ['roofrack', 'spare', 'bullbar'], color: '#2f3a33', finish: 'metal', rim: 'multi',
    phys: { mass: 2350, hp: 330, top: 205, drive: 'AWD', split: 0.4, grip: 1.0, gears: 6, redline: 5800, susp: { hz: 1.35, zeta: 0.45, travel: 0.3, rest: 0.4 }, brake: 1.1, cyl: 8, sound: 'v8', offroad: true, tires: 'offroad' },
  },
  {
    id: 'rally', name: 'Djurdjura Rally WRX', cat: 'Rallye', price: 7500000, desc: 'Préparée pour le rallye de l\'Atlas. Glisse sur la terre comme sur l\'asphalte.',
    body: {
      L: 4.2, W: 1.88, WB: 2.6, front: 0.82, R: 0.34, RW: 0.24,
      top: [[0, 0.6], [0.04, 0.74], [0.25, 0.86], [0.28, 0.9], [0.43, 1.4], [0.8, 1.42], [0.88, 1.34], [0.96, 1.08], [1, 0.84]],
      bottom: [[0, 0.32], [0.05, 0.24], [0.95, 0.26], [1, 0.38]],
      width: [[0, 0.86], [0.05, 0.97], [0.15, 1], [0.85, 1], [0.96, 0.97], [1, 0.9]],
      belt: 0.96, tumble: 0.76, ws: [0.28, 0.43], rw: [0.82, 0.96],
    },
    extras: ['wingBig', 'roofScoop', 'mudflaps', 'hoodLights', 'rallyLivery'], color: '#1d4fa0', finish: 'gloss', rim: 'multi',
    phys: { mass: 1250, hp: 360, top: 230, drive: 'AWD', split: 0.45, grip: 1.08, gears: 6, redline: 7800, susp: { hz: 1.85, zeta: 0.5, travel: 0.25, rest: 0.34 }, brake: 1.25, cyl: 4, sound: 'rally', turbo: true, tires: 'rally' },
  },
  {
    id: 'muscle', name: 'Tassili Muscle 6.4', cat: 'Muscle car', price: 9000000, desc: 'V8 atmosphérique, propulsion. Burnouts garantis.',
    body: {
      L: 4.85, W: 1.95, WB: 2.9, front: 0.92, R: 0.36, RW: 0.27,
      top: [[0, 0.7], [0.03, 0.86], [0.38, 0.95], [0.42, 0.98], [0.55, 1.33], [0.68, 1.34], [0.84, 1.02], [0.97, 1.0], [1, 0.85]],
      bottom: [[0, 0.3], [0.05, 0.2], [0.95, 0.22], [1, 0.34]],
      width: [[0, 0.9], [0.04, 0.98], [0.12, 1], [0.88, 1], [1, 0.95]],
      belt: 0.9, tumble: 0.74, ws: [0.42, 0.55], rw: [0.68, 0.84],
    },
    extras: ['hoodScoop', 'dualExhaust', 'stripes', 'spoilerSmall'], color: '#111214', finish: 'gloss', rim: 'turbine',
    phys: { mass: 1750, hp: 580, top: 290, drive: 'RWD', grip: 1.02, gears: 6, redline: 6500, susp: { hz: 1.8, zeta: 0.45, travel: 0.18, rest: 0.3 }, brake: 1.25, cyl: 8, sound: 'v8muscle' },
  },
  {
    id: 'police', name: 'Patrouille Interceptor', cat: 'Police', price: 11000000, desc: 'Intercepteur de la Sûreté nationale. Gyrophares et sirène inclus.',
    body: { ...SEDAN, L: 4.75, W: 1.86, WB: 2.85, front: 0.9, R: 0.34, RW: 0.24, top: SEDAN.top.map(([t, y]) => [t, y * 0.97]) },
    extras: ['lightbar', 'pushbar', 'policeLivery'], color: '#f5f6f8', finish: 'gloss', rim: 'multi',
    phys: { mass: 1750, hp: 450, top: 280, drive: 'AWD', split: 0.35, grip: 1.1, gears: 6, redline: 6800, susp: { hz: 1.9, zeta: 0.5, travel: 0.18, rest: 0.3 }, brake: 1.25, cyl: 6, sound: 'v6', turbo: true, siren: true },
  },
  {
    id: 'gt', name: 'Corniche GT', cat: 'Grand tourisme', price: 14000000, desc: 'Coupé grand tourisme, élégant et rapide. Taillé pour la côte.',
    body: {
      L: 4.72, W: 1.94, WB: 2.78, front: 0.9, R: 0.35, RW: 0.27,
      top: [[0, 0.55], [0.03, 0.66], [0.3, 0.8], [0.34, 0.84], [0.5, 1.27], [0.62, 1.29], [0.82, 0.98], [0.95, 0.95], [1, 0.8]],
      bottom: [[0, 0.26], [0.05, 0.16], [0.95, 0.18], [1, 0.3]],
      width: [[0, 0.86], [0.05, 0.96], [0.2, 1], [0.7, 1.02], [0.95, 0.97], [1, 0.88]],
      belt: 0.88, tumble: 0.7, ws: [0.34, 0.5], rw: [0.62, 0.82],
    },
    extras: ['quadExhaust', 'lipSpoiler'], color: '#8a1020', finish: 'pearl', rim: 'multi',
    phys: { mass: 1650, hp: 560, top: 315, drive: 'RWD', grip: 1.14, gears: 7, redline: 7200, susp: { hz: 2.1, zeta: 0.55, travel: 0.15, rest: 0.26 }, brake: 1.35, cyl: 8, sound: 'v8', downforce: 0.4 },
  },
  {
    id: 'mirage', name: 'Mirage S', cat: 'Supercar', price: 25000000, desc: 'Moteur central V10. Un mirage dans le désert.',
    body: {
      L: 4.5, W: 2.0, WB: 2.65, front: 1.0, R: 0.35, RW: 0.3,
      top: [[0, 0.48], [0.04, 0.6], [0.24, 0.72], [0.28, 0.78], [0.44, 1.13], [0.55, 1.14], [0.7, 1.0], [0.86, 0.94], [0.97, 0.9], [1, 0.7]],
      bottom: [[0, 0.2], [0.05, 0.13], [0.95, 0.15], [1, 0.28]],
      width: [[0, 0.82], [0.06, 0.95], [0.25, 0.98], [0.65, 1.03], [0.9, 1], [1, 0.9]],
      belt: 0.82, tumble: 0.66, ws: [0.28, 0.44], rw: [0.55, 0.7],
    },
    extras: ['sideIntakes', 'wingBig', 'quadExhaust', 'diffuser'], color: '#f2a900', finish: 'pearl', rim: 'sport5',
    phys: { mass: 1450, hp: 780, top: 340, drive: 'RWD', grip: 1.2, gears: 7, redline: 8500, susp: { hz: 2.4, zeta: 0.6, travel: 0.13, rest: 0.22 }, brake: 1.5, cyl: 10, sound: 'v10', downforce: 0.9 },
  },
  {
    id: 'fennec', name: 'Fennec X Hyper', cat: 'Hypercar', price: 60000000, desc: 'Le fennec du désert : 1350 ch hybrides, transmission intégrale.',
    body: {
      L: 4.75, W: 2.06, WB: 2.75, front: 1.02, R: 0.36, RW: 0.32,
      top: [[0, 0.44], [0.04, 0.56], [0.26, 0.7], [0.3, 0.76], [0.45, 1.1], [0.55, 1.11], [0.72, 0.96], [0.9, 0.9], [0.98, 0.88], [1, 0.66]],
      bottom: [[0, 0.18], [0.05, 0.11], [0.95, 0.13], [1, 0.26]],
      width: [[0, 0.8], [0.06, 0.96], [0.25, 0.97], [0.6, 1.04], [0.9, 1.01], [1, 0.9]],
      belt: 0.8, tumble: 0.62, ws: [0.3, 0.45], rw: [0.55, 0.72],
    },
    extras: ['sideIntakes', 'wingBig', 'diffuser', 'centerExhaust', 'finSpine'], color: '#e8e2d0', finish: 'pearl', rim: 'turbine',
    phys: { mass: 1500, hp: 1350, top: 420, drive: 'AWD', split: 0.32, grip: 1.3, gears: 8, redline: 9000, susp: { hz: 2.6, zeta: 0.62, travel: 0.12, rest: 0.2 }, brake: 1.7, cyl: 12, sound: 'v12', downforce: 1.4, turbo: true },
  },
];

export const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));

export const PAINTS = [
  '#f5f6f8', '#c9ccd1', '#6b7076', '#111214', '#d0312d', '#8a1020', '#ff7f11', '#f2c40f', '#f2a900',
  '#1f8a4c', '#0d5c35', '#2f3a33', '#1d4fa0', '#0b2a5c', '#39a7d6', '#6a2c91', '#e85d9c', '#7a5230', '#d9c49a', '#e8e2d0',
];
export const FINISHES = [
  { id: 'gloss', name: 'Brillant' }, { id: 'metal', name: 'Métallisé' }, { id: 'pearl', name: 'Nacré' },
  { id: 'matte', name: 'Mat' }, { id: 'chrome', name: 'Chrome' },
];
export const RIMS = [
  { id: 'sport5', name: 'Sport 5 branches' }, { id: 'multi', name: 'Multi-rayons' }, { id: 'mesh', name: 'Mesh' },
  { id: 'turbine', name: 'Turbine' }, { id: 'offroad', name: 'Tout-terrain' }, { id: 'steel', name: 'Tôle + enjoliveur' },
];
export const RIM_COLORS = [
  { id: 'silver', name: 'Argent', c: '#c8ccd2' }, { id: 'black', name: 'Noir', c: '#1a1b1d' }, { id: 'gold', name: 'Or', c: '#c9a24a' },
  { id: 'bronze', name: 'Bronze', c: '#8c6239' }, { id: 'chrome', name: 'Chrome', c: '#eeeeee' }, { id: 'white', name: 'Blanc', c: '#f0f0f0' },
  { id: 'red', name: 'Rouge', c: '#c0262d' },
];
export const LIVERIES = [
  { id: 'none', name: 'Aucune' }, { id: 'stripes', name: 'Bandes course' }, { id: 'side', name: 'Bande latérale' },
  { id: 'dz', name: 'Drapeau DZ' }, { id: 'rally', name: 'Rallye' },
];
export const NEONS = [
  { id: 'none', name: 'Aucun', c: null }, { id: 'green', name: 'Vert', c: '#00ff88' }, { id: 'blue', name: 'Bleu', c: '#2a7bff' },
  { id: 'red', name: 'Rouge', c: '#ff2040' }, { id: 'purple', name: 'Violet', c: '#b040ff' }, { id: 'white', name: 'Blanc', c: '#ffffff' },
];
export const TIRES = [
  { id: 'road', name: 'Route', grip: { asphalt: 1.0, dirt: 0.72, sand: 0.58, grass: 0.7 } },
  { id: 'sport', name: 'Sport', grip: { asphalt: 1.1, dirt: 0.66, sand: 0.5, grass: 0.62 } },
  { id: 'slick', name: 'Semi-slick', grip: { asphalt: 1.22, dirt: 0.55, sand: 0.42, grass: 0.52 } },
  { id: 'rally', name: 'Rallye', grip: { asphalt: 1.02, dirt: 0.92, sand: 0.78, grass: 0.82 } },
  { id: 'offroad', name: 'Tout-terrain', grip: { asphalt: 0.92, dirt: 0.98, sand: 0.95, grass: 0.9 } },
];
export const SUSPENSIONS = [
  { id: 'comfort', name: 'Confort', hz: 0.85, travel: 1.15, zeta: 0.9, height: 0.02 },
  { id: 'stock', name: 'Origine', hz: 1, travel: 1, zeta: 1, height: 0 },
  { id: 'sport', name: 'Sport', hz: 1.25, travel: 0.85, zeta: 1.15, height: -0.03 },
  { id: 'rally', name: 'Rallye', hz: 0.95, travel: 1.4, zeta: 1.1, height: 0.06 },
];

// Améliorations : niveaux et coût relatif (fraction du prix de base, avec minimum)
export const UPGRADES = {
  engine: { name: 'Moteur', levels: ['Origine', 'Stage 1', 'Stage 2', 'Stage 3'], power: [1, 1.1, 1.22, 1.36], cost: [0, 0.12, 0.25, 0.45] },
  turbo: { name: 'Turbo', levels: ['Aucun', 'Turbo', 'Bi-turbo'], power: [1, 1.12, 1.25], cost: [0, 0.15, 0.3] },
  brakes: { name: 'Freins', levels: ['Origine', 'Sport', 'Carbone-céramique'], mult: [1, 1.18, 1.38], cost: [0, 0.06, 0.18] },
  weight: { name: 'Allègement', levels: ['Origine', '-5 %', '-10 %'], mult: [1, 0.95, 0.9], cost: [0, 0.1, 0.24] },
  nitro: { name: 'Nitro', levels: ['Aucun', 'Simple', 'Course'], cap: [0, 1, 1.8], cost: [0, 0.05, 0.14] },
};
export const upgradeCost = (car, key, level) => Math.round(Math.max(60000, car.price * 0.9 + 600000) * UPGRADES[key].cost[level] / 1000) * 1000;
export const tireCost = (car, id) => (id === 'road' ? 0 : Math.round((car.price * 0.03 + 120000) / 1000) * 1000);
export const suspCost = (car, id) => (id === 'stock' ? 0 : Math.round((car.price * 0.04 + 150000) / 1000) * 1000);

export function defaultConfig(car) {
  return {
    color: car.color, finish: car.finish, rim: car.rim, rimColor: car.rim === 'steel' ? 'silver' : 'silver', caliper: '#c0262d',
    tint: 1, livery: car.extras.includes('rallyLivery') ? 'rally' : 'none', neon: 'none', plate: randomPlate(),
    tires: car.phys.tires || 'road', susp: 'stock', rideHeight: 0, brakeBias: 0.62, steerSens: 1, split: car.phys.split ?? 0.5,
    upgrades: { engine: 0, turbo: car.phys.turbo ? 1 : 0, brakes: 0, weight: 0, nitro: 1 },
    owned: { tires: [car.phys.tires || 'road'], susp: ['stock'], upgrades: { engine: 0, turbo: car.phys.turbo ? 1 : 0, brakes: 0, weight: 0, nitro: 1 } },
  };
}

export function randomPlate() {
  const n = String(Math.floor(10000 + Math.random() * 89999));
  const y = String(100 + Math.floor(Math.random() * 25)).padStart(3, '1');
  return `${n} ${y}`;
}

// Statistiques affichées (0..1)
export function carStats(car, cfg) {
  const p = derivePhysics(car, cfg);
  const pw = (p.powerKW * 1000) / p.mass; // W/kg
  return {
    speed: Math.min(1, (p.topSpeed * 3.6 - 150) / 280),
    accel: Math.min(1, Math.max(0.05, (pw - 60) / 560)),
    handling: Math.min(1, (p.grip * 0.6 + p.downforce * 0.12 + (p.susp.hz - 1.2) * 0.18) - 0.15),
    braking: Math.min(1, (p.brakeMult - 0.8) / 1.2),
    offroad: Math.min(1, (p.tireGrip.sand * 0.6 + p.susp.travel * 1.3 + (p.offroad ? 0.15 : 0)) - 0.25),
    topKmh: Math.round(p.topSpeed * 3.6), hp: Math.round(p.powerKW / 0.7457), mass: Math.round(p.mass),
  };
}

// Calcul des paramètres physiques effectifs à partir du catalogue + configuration
export function derivePhysics(car, cfg = defaultConfig(car)) {
  const ph = car.phys;
  const U = UPGRADES;
  const up = cfg.upgrades || {};
  const powerMult = U.engine.power[up.engine || 0] * (ph.turbo ? (up.turbo >= 1 ? U.turbo.power[up.turbo] / U.turbo.power[1] : 0.9) : U.turbo.power[up.turbo || 0]);
  const powerKW = ph.hp * 0.7457 * powerMult;
  const mass = ph.mass * U.weight.mult[up.weight || 0];
  const susp = SUSPENSIONS.find((s) => s.id === cfg.susp) || SUSPENSIONS[1];
  const tire = TIRES.find((t) => t.id === cfg.tires) || TIRES[0];
  const topBase = ph.top / 3.6;
  const topSpeed = topBase * Math.pow(powerMult, 0.28);
  const body = car.body;
  // aéro : CdA tel que la puissance équilibre la traînée à la vitesse max
  const rho = 1.225;
  const CdA = (2 * powerKW * 1000 * 0.82) / (rho * topSpeed ** 3);
  const gears = [];
  const n = ph.gears;
  const first = 3.4 + (n - 5) * 0.25;
  const last = 0.72 - (n - 5) * 0.04;
  for (let i = 0; i < n; i++) gears.push(first * Math.pow(last / first, i / (n - 1)));
  const redline = ph.redline;
  const finalDrive = ((redline * 0.97 * 2 * Math.PI) / 60) * body.R / (topSpeed * 1.04 * gears[n - 1]);
  return {
    mass, powerKW, topSpeed, CdA, gears, finalDrive, redline, idle: ph.cyl >= 8 ? 750 : 850,
    maxTorque: (powerKW * 1000) / (0.9 * ((redline * 0.85 * 2 * Math.PI) / 60)),
    drive: ph.drive, split: cfg.split ?? ph.split ?? 0.5,
    grip: ph.grip * (tire.grip.asphalt), tireGrip: tire.grip, tire: tire.id,
    susp: {
      hz: ph.susp.hz * susp.hz, zeta: ph.susp.zeta * susp.zeta, travel: ph.susp.travel * susp.travel,
      rest: ph.susp.rest, height: susp.height + (cfg.rideHeight || 0),
    },
    brakeMult: ph.brake * U.brakes.mult[up.brakes || 0], brakeBias: cfg.brakeBias ?? 0.62,
    downforce: ph.downforce || 0.1, offroad: !!ph.offroad, nitroCap: U.nitro.cap[up.nitro ?? 1],
    steerSens: cfg.steerSens ?? 1, cyl: ph.cyl, sound: ph.sound, turbo: (up.turbo || 0) > 0, siren: !!ph.siren,
    body,
  };
}
