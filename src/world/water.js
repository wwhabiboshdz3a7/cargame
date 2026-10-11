// Mer Méditerranée : grand plan avec double normal map défilante et reflets d'environnement.
import * as THREE from 'three';
import { waterNormalTexture } from './textures.js';

export function createSea(scene) {
  const normal = waterNormalTexture();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a4a68, roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.9, envMapIntensity: 0.55,
    normalMap: normal, normalScale: new THREE.Vector2(0.55, 0.55),
  });
  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position,1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uTime;')
      .replace('#include <normal_fragment_maps>', `
vec2 wp = vWP.xz;
vec3 n1 = texture2D(normalMap, wp * 0.045 + vec2(uTime * 0.012, uTime * 0.008)).xyz * 2.0 - 1.0;
vec3 n2 = texture2D(normalMap, wp * 0.013 - vec2(uTime * 0.006, -uTime * 0.01)).xyz * 2.0 - 1.0;
vec3 n3 = texture2D(normalMap, wp * 0.0021 + vec2(uTime * 0.002, 0.0)).xyz * 2.0 - 1.0;
vec3 mapN = normalize(vec3((n1.xy + n2.xy * 0.8 + n3.xy * 0.6) * normalScale, 1.0));
float dist = length(vWP - cameraPosition);
mapN.xy *= mix(1.0, 0.35, smoothstep(200.0, 3000.0, dist));
normal = normalize(tbn * mapN);
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float fres = pow(1.0 - max(0.0, dot(normalize(cameraPosition - vWP), vec3(0.0,1.0,0.0))), 3.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.18, 0.28), fres * 0.6);
diffuseColor.a = mix(0.82, 0.97, fres);
`);
  };
  const geo = new THREE.PlaneGeometry(64000, 64000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, update: (t) => { uniforms.uTime.value = t; } };
}
