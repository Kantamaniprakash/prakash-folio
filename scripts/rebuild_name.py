import bpy
import math
import sys
from mathutils import Vector

BLEND = 'C:/Users/praka/prakash-folio/resources/prakash-folio.blend'
# Archivo Black matches the original letters' glyph shapes (0.89 IoU vs 0.84
# for Pally-Bold, measured against the original meshes) — see _match_font.py
FONT = 'C:/Users/praka/prakash-folio/resources/ArchivoBlack-Regular.ttf'
OUT = 'C:/Users/praka/prakash-folio/static/areas/areas.glb'
RENDER_OUT = 'C:/Users/praka/prakash-folio/scripts/letters_preview.png'
NAME = 'PRAKASH KANTAMANI'
SPAN_EXTEND = 0.10     # extend the original letter row by 10% on each end
# Original letters: height = 1.04x their spacing, widths up to 1.08x spacing
# (near-touching). Reproduce the same proportions at our tighter spacing.
HEIGHT_RATIO = 1.04
MAX_W_RATIO = 1.08

bpy.ops.wm.open_mainfile(filepath=BLEND)

landing = bpy.data.objects['landing']

# ── Harvest reference data from the ORIGINAL letters ──────────────
old = sorted(
    [o for o in bpy.data.objects if o.name.startswith('refLettersPhysicalDynamic')],
    key=lambda o: o.name)
assert len(old) == 10, f'expected 10 pristine letters, found {len(old)} — .blend not restored?'

for o in old:
    print(f'  {o.name} loc={tuple(round(v, 3) for v in o.location)} '
          f'dims={tuple(round(v, 3) for v in o.dimensions)} parent={o.parent.name}')

palette_mat = old[0].data.materials[0]
print(f'material: {palette_mat.name}')

uv_src = old[0].data.uv_layers.active
sample_uv = tuple(uv_src.data[0].uv)
print(f'sample uv: {sample_uv}')

H_ORIG = max(o.dimensions.z for o in old)
DEPTH = old[0].dimensions.y
assert 1.2 < H_ORIG < 1.8, f'unexpected original height {H_ORIG} — axis assumption wrong'
print(f'original height={H_ORIG:.3f} depth={DEPTH:.3f}')

mpi = old[0].matrix_parent_inverse.copy()

# Reading order: .019 is the first character (left from camera), .010 the last
first = old[-1].location.copy()
last = old[0].location.copy()
direction = last - first
first = first - direction * SPAN_EXTEND
last = last + direction * SPAN_EXTEND

slots = len(NAME)  # 17 (space at index 7)
step_vec = (last - first) / (slots - 1)
HEIGHT = step_vec.length * HEIGHT_RATIO
MAX_W = step_vec.length * MAX_W_RATIO
print(f'span={(last - first).length:.2f} step={step_vec.length:.3f} height={HEIGHT:.3f} max_w={MAX_W:.3f}')

# ── Delete original letters (+ their collider children) ──────────
for o in old:
    for child in list(o.children):
        bpy.data.objects.remove(child, do_unlink=True)
    md = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if md and md.users == 0:
        bpy.data.meshes.remove(md)
print('deleted original letters')

font = bpy.data.fonts.load(FONT)
landing_collections = list(landing.users_collection)

# ── Build the new letters ─────────────────────────────────────────
mesh_index = 10
cuboid_index = 900  # fresh range, only the ^cuboid prefix matters to the game
for i, char in enumerate(NAME):
    if char == ' ':
        continue

    pos = first + step_vec * i

    bpy.ops.object.text_add(location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.data.body = char
    obj.data.font = font
    obj.data.size = 1.0
    obj.data.extrude = 0.1
    obj.data.align_x = 'CENTER'
    obj.data.align_y = 'CENTER'
    obj.data.resolution_u = 2  # low-poly curves, like the original letters
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.active_object
    # Original letters are smooth-shaded with hard edges from split normals
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(30))
    except Exception:
        bpy.ops.object.shade_smooth()

    # Stand it upright: glyph face +Z -> -Y (toward the game camera), up -> +Z.
    # Pure rotation keeps winding/normals correct — no mirroring.
    obj.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    bpy.context.view_layer.update()

    # Scale: uniform to target height, depth to match originals, cap width
    s = HEIGHT / obj.dimensions.z
    obj.scale = (s, DEPTH / obj.dimensions.y, s)
    bpy.ops.object.transform_apply(scale=True)
    bpy.context.view_layer.update()
    if obj.dimensions.x > MAX_W:
        obj.scale = (MAX_W / obj.dimensions.x, 1, 1)
        bpy.ops.object.transform_apply(scale=True)
        bpy.context.view_layer.update()

    # Material + flat UV pointing at the same palette color as the originals.
    # Reuse the auto-created UV layer — it exports as TEXCOORD_0, which is
    # the slot the palette material samples. Keep exactly one layer.
    obj.data.materials.append(palette_mat)
    while len(obj.data.uv_layers) > 1:
        obj.data.uv_layers.remove(obj.data.uv_layers[-1])
    uv = obj.data.uv_layers[0] if len(obj.data.uv_layers) else obj.data.uv_layers.new(name='UVMap')
    for loop in uv.data:
        loop.uv = sample_uv

    obj.name = f'refLettersPhysicalDynamic.{mesh_index:03d}'
    obj.data.name = obj.name
    obj['mass'] = 0.2
    obj.parent = landing
    obj.matrix_parent_inverse = mpi
    obj.location = pos

    # Physics collider child (game reads full dims from empty scale)
    dims = obj.dimensions.copy()
    bpy.ops.object.empty_add(type='CUBE', location=(0, 0, 0))
    cub = bpy.context.active_object
    cub.name = f'cuboid.{cuboid_index:03d}'
    cub.parent = obj
    cub.matrix_parent_inverse.identity()
    cub.location = (0, 0, 0)
    cub.scale = (dims.x, dims.y, dims.z)

    for col in landing_collections:
        for target in (obj, cub):
            if target.name not in col.objects:
                try:
                    col.objects.link(target)
                except Exception:
                    pass

    print(f"'{char}' -> {obj.name} w={obj.dimensions.x:.2f} h={obj.dimensions.z:.2f} "
          f"at {tuple(round(v, 2) for v in pos)}")
    mesh_index += 1
    cuboid_index += 1

# ── Waterfall: replace empty with a small quad so the game gets geometry ──
waterfall = bpy.data.objects.get('refWaterfallParticles')
if waterfall and waterfall.type == 'EMPTY':
    import bmesh
    parent = waterfall.parent
    loc = waterfall.location.copy()
    mat_inv = waterfall.matrix_parent_inverse.copy()
    wf_cols = list(waterfall.users_collection)

    mesh = bpy.data.meshes.new('refWaterfallParticlesMesh')
    bm = bmesh.new()
    v0 = bm.verts.new((0, 0, 0))
    v1 = bm.verts.new((0, 0, -2))
    v2 = bm.verts.new((0.1, 0, -2))
    v3 = bm.verts.new((0.1, 0, 0))
    bm.faces.new((v0, v1, v2, v3))
    bm.to_mesh(mesh)
    bm.free()

    for col in wf_cols:
        col.objects.unlink(waterfall)
    bpy.data.objects.remove(waterfall, do_unlink=True)

    new_wf = bpy.data.objects.new('refWaterfallParticles', mesh)
    new_wf.location = loc
    if parent:
        new_wf.parent = parent
        new_wf.matrix_parent_inverse = mat_inv
    for col in wf_cols:
        col.objects.link(new_wf)
    if not wf_cols:
        bpy.context.scene.collection.objects.link(new_wf)
    print('fixed waterfall')

# ── Export (same selection logic as the committed pipeline) ──────
for o in bpy.context.view_layer.objects:
    o.select_set(False)

areas_parents = {'achievements', 'altar', 'behindTheScene', 'bowling', 'career',
                 'circuit', 'cookie', 'lab', 'landing', 'projects', 'social',
                 'toilet', 'timeMachine', 'easter'}
for o in bpy.context.view_layer.objects:
    check = o
    while check:
        if check.name in areas_parents:
            o.select_set(True)
            break
        check = check.parent

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_extras=True,
    export_draco_mesh_compression_enable=False,
)
print(f'exported {OUT}')

# ── Verify + render a readability preview ─────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=OUT)
letters = [o for o in bpy.data.objects if o.name.startswith('refLettersPhysicalDynamic')]
print(f'VERIFY: {len(letters)} letters')
for o in letters:
    mats = [m.name for m in o.data.materials] if o.type == 'MESH' else []
    print(f'  {o.name} dims={tuple(round(v, 2) for v in o.dimensions)} mats={mats}')
wf = bpy.data.objects.get('refWaterfallParticles')
print(f"VERIFY: waterfall type={wf.type if wf else 'NOT FOUND'}")

# Frame all letters with an ortho camera on the front (-Y) side
pts = []
for o in letters:
    pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
cz = (min(p.z for p in pts) + max(p.z for p in pts)) / 2
cy = min(p.y for p in pts)
w = max(p.x for p in pts) - min(p.x for p in pts)

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = w * 1.1
cam = bpy.data.objects.new('cam', cam_data)
cam.location = (cx, cy - 20, cz)
cam.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
bpy.context.scene.render.engine = 'BLENDER_WORKBENCH'
bpy.context.scene.render.resolution_x = 1800
bpy.context.scene.render.resolution_y = 260
bpy.context.scene.render.filepath = RENDER_OUT
bpy.ops.render.render(write_still=True)
print(f'preview rendered to {RENDER_OUT}')

sys.exit(0)
