// Run after scripts/rebuild_name.py re-exports static/areas/areas.glb.
// Restores three things the Blender re-export can't reproduce from the .blend,
// using exact values taken from the originally committed areas.glb:
//   1. refWaterfallParticles emitter line (faceless geometry, dropped by exporter)
//   2. cuboid.082-.086 root-level colliders (unparented in the scene, so the
//      area-based export selection never picks them up)
//   3. removes stray Cube.002 under cookiePhysicalFixed (excluded by the
//      original pipeline, would render as a bare gray mesh)
// Idempotent: each fix is skipped when already applied.
import { NodeIO, VertexLayout } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const GLB = 'static/areas/areas.glb'
// SEPARATE is required: the game feeds geometry.attributes.position.array
// straight into Rapier trimesh/hull colliders, which breaks (WASM panic)
// if attributes are interleaved.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setVertexLayout(VertexLayout.SEPARATE)
const doc = await io.read(GLB)
const root = doc.getRoot()
const scene = root.listScenes()[0]
const find = name => root.listNodes().find(n => n.getName() === name)

// 1. Waterfall particle emitter: 2-vertex LINES primitive
const wf = find('refWaterfallParticles')
if (!wf) throw new Error('refWaterfallParticles node not found')
if (wf.getMesh()) {
  console.log('waterfall: already has a mesh, skipped')
} else {
  const X = 1.3636797666549683
  const buffer = root.listBuffers()[0]
  const position = doc.createAccessor('wfPos').setType('VEC3')
    .setArray(new Float32Array([-X, 0, 0, X, 0, 0])).setBuffer(buffer)
  const indices = doc.createAccessor('wfIdx').setType('SCALAR')
    .setArray(new Uint16Array([0, 1])).setBuffer(buffer)
  const prim = doc.createPrimitive().setMode(1)
    .setAttribute('POSITION', position).setIndices(indices)
  wf.setMesh(doc.createMesh('refWaterfallParticles').addPrimitive(prim))
  console.log('waterfall: emitter line restored')
}

// 2. Root-level colliders
const ROOT_CUBOIDS = [
  { name: 'cuboid.082', t: [42.509803771972656, 0.8675821423530579, 41.468013763427734], r: [0, 0.21643956005573273, 0, 0.976296067237854], s: [0.3437093496322632, 1.44215726852417, 0.4422047436237335] },
  { name: 'cuboid.083', t: [42.80539321899414, 1.1290086507797241, 41.330177307128906], r: [0, 0.21643954515457153, 0, 0.9762960076332092], s: [0.9943757057189941, 0.9213417768478394, 0.4422047436237335] },
  { name: 'cuboid.084', t: [44.287899017333984, 0.8675821423530579, 40.638877868652344], r: [0, 0.21643951535224915, 0, 0.9762960076332092], s: [1.7573579549789429, 1.4421570301055908, 0.4422047436237335] },
  { name: 'cuboid.085', t: [45.71802520751953, 0.3282207250595093, 39.97199630737305], r: [0, 0.21643954515457153, 0, 0.976296067237854], s: [1.2210370302200317, 0.35525402426719666, 0.4422047436237335] },
  { name: 'cuboid.086', t: [45.71802520751953, 0.9974501132965088, 39.97199630737305], r: [0, 0.21643954515457153, 0, 0.9762960076332092], s: [0.44249072670936584, 1.1489536762237549, 0.4422047436237335] },
]
for (const c of ROOT_CUBOIDS) {
  if (find(c.name)) { console.log(c.name + ': already present, skipped'); continue }
  const node = doc.createNode(c.name).setTranslation(c.t).setRotation(c.r).setScale(c.s)
  scene.addChild(node)
  console.log(c.name + ': restored at scene root')
}

// 3. Career timeline: bar positions/lengths encode years (1 road unit = 1
//    year; the year counter reads 2017 at refYear z=7.43). The labels were
//    re-textured for Prakash's career but the bars still had the original
//    timeline. Start year = 2017 + (7.43 - z); duration = size.
const YEAR_Z = 7.43
const START_YEAR = 2017
const CAREER = [
  { name: 'refLine', start: 2017, size: 4, hasEnd: true },        // VIT B.Tech 2017-2021
  { name: 'refLine.001', start: 2020, size: 2, hasEnd: true },    // Skilalogy Jan 2020-Dec 2021
  { name: 'refLine.002', start: 2022.5, size: 2, hasEnd: true },  // UT Dallas MS Aug 2022-May 2024
  { name: 'refLine.004', start: 2023.5, size: 0.5, hasEnd: true },// Imperium Data Aug-Dec 2023
  { name: 'refLine.003', start: 2024.5, size: 2, hasEnd: false }, // AAA National Aug 2024-present
  { name: 'refLine.005', start: 2023, size: 3.5, hasEnd: false }, // Gen AI skills banner, ongoing
]
for (const c of CAREER) {
  const node = find(c.name)
  if (!node) { console.log(c.name + ': NOT FOUND, skipped'); continue }
  const t = node.getTranslation()
  const z = +(YEAR_Z - (c.start - START_YEAR)).toFixed(3)
  node.setTranslation([t[0], t[1], z])
  node.setExtras({ ...node.getExtras(), size: c.size, hasEnd: c.hasEnd })
  console.log(`${c.name}: ${c.start} -> +${c.size}yr (z=${z}, hasEnd=${c.hasEnd})`)
}

// 4. Stray Cube.002
const stray = find('Cube.002')
if (stray) {
  const mesh = stray.getMesh()
  stray.dispose()
  if (mesh && mesh.listParents().every(p => p.propertyType === 'Root')) mesh.dispose()
  console.log('Cube.002: removed')
} else {
  console.log('Cube.002: not present, skipped')
}

await io.write(GLB, doc)
console.log('wrote', GLB)

// 5. Regenerate the draco variant served in production (VITE_COMPRESSED_MODELS)
const { draco } = await import('@gltf-transform/functions')
const draco3d = await import('draco3dgltf')
const ioDraco = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  })
const docDraco = await ioDraco.read(GLB)
await docDraco.transform(draco({
  method: 'edgebreaker',
  quantizationVolume: 'mesh',
  quantizePosition: 12,
  quantizeNormal: 6,
  quantizeTexcoord: 6,
  quantizeColor: 2,
  quantizeGeneric: 2,
}))
const COMPRESSED = GLB.replace('.glb', '-compressed.glb')
await ioDraco.write(COMPRESSED, docDraco)
console.log('wrote', COMPRESSED)
