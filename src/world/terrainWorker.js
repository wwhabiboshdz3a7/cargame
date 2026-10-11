import { WorldGen } from './worldgen.js';
import { buildChunk, buildMapImage } from './terrainBuild.js';

let world = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    world = new WorldGen(m.data);
    self.postMessage({ type: 'ready' });
  } else if (m.type === 'chunk') {
    const r = buildChunk(world, m.x0, m.z0, m.size);
    self.postMessage({ type: 'chunk', key: m.key, ...r }, [r.pos.buffer, r.nor.buffer, r.spl.buffer, r.col.buffer]);
  } else if (m.type === 'map') {
    const img = buildMapImage(world, m.N, m.x0, m.z0, m.x1, m.z1);
    self.postMessage({ type: 'map', key: m.key, img, N: m.N }, [img.buffer]);
  }
};
