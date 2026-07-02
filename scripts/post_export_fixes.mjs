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

// 3. Stray Cube.002
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
