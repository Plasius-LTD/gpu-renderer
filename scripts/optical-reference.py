"""Offline Cycles attribution, never a production renderer or fallback.

Input: retained explicit shared-interface triangles from the package's original
glass geometry. No private room models. PNG display is not linear image truth.
"""
import argparse
import array
import hashlib
import json
import math
import os
import sys
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output-dir", required=True)
parser.add_argument("--width", type=int, default=512)
parser.add_argument("--height", type=int, default=288)
parser.add_argument("--spp", type=int, default=256)
parser.add_argument("--depth", type=int, default=20)
parser.add_argument("--radiance", type=float, default=.75)
parser.add_argument("--pedestal", type=float, default=.35)
parser.add_argument("--mode", choices=["filled", "empty", "index-one"], default="filled")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
depth_fields = ["max_bounces", "transmission_bounces", "glossy_bounces", "transparent_max_bounces", "min_light_bounces"]
depth_limit = min(bpy.context.scene.cycles.bl_rna.properties[field].hard_max for field in depth_fields)
if not (128 <= args.width <= 3840 and 128 <= args.height <= 2160 and 1 <= args.spp <= 4096 and 1 <= args.depth <= depth_limit):
    raise ValueError("Invalid reference settings")
if not all(math.isfinite(v) and 0 <= v <= 100 for v in [args.radiance, args.pedestal]):
    raise ValueError("Invalid reference radiance")
with open(args.input, "rb") as stream:
    source = stream.read()
data = json.loads(source)
if not os.path.isdir(args.output_dir) or os.listdir(args.output_dir):
    raise ValueError("An existing empty output directory is required; evidence cannot be overwritten")
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.render.threads_mode = "FIXED"
scene.render.threads = 4
scene.cycles.samples = args.spp
scene.cycles.use_denoising = False
scene.cycles.use_adaptive_sampling = False
scene.cycles.seed = 7
for field in depth_fields:
    setattr(scene.cycles, field, args.depth)
actual_depth_policy = {field: getattr(scene.cycles, field) for field in depth_fields}
if any(value != args.depth for value in actual_depth_policy.values()):
    raise RuntimeError("Independent reference depth policy was clamped")
scene.render.resolution_x = args.width
scene.render.resolution_y = args.height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "OPEN_EXR"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "32"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
world = bpy.data.worlds.new("Known uniform radiance")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (args.radiance, args.radiance, args.radiance, 1)
scene.world = world

def coordinate(v):
    return (v[0], -v[2], v[1])

water_ior = 1 if args.mode in ["empty", "index-one"] else data["settings"]["waterIor"]
iors = {"glass-air": data["settings"]["glassIor"], "glass-water": data["settings"]["glassIor"]/water_ior, "water-air": water_ior}
for kind in ["stand", "glass-air", "glass-water", "water-air"]:
    if kind == "water-air" and args.mode == "empty":
        continue
    vertices = [v for piece in data["pieces"] if piece["kind"] == kind for v in piece["vertices"]]
    mesh = bpy.data.meshes.new(kind)
    mesh.from_pydata([coordinate(v["p"]) for v in vertices], [], [(i,i+1,i+2) for i in range(0,len(vertices),3)])
    mesh.update()
    obj = bpy.data.objects.new(kind, mesh)
    scene.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.use_auto_smooth = True
    mesh.normals_split_custom_set_from_vertices([coordinate(v["n"]) for v in vertices])
    material = bpy.data.materials.new(kind)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeEmission" if kind == "stand" else "ShaderNodeBsdfGlass")
    if kind == "stand":
        shader.inputs["Color"].default_value = (args.pedestal,args.pedestal,args.pedestal,1)
    else:
        shader.distribution = "GGX"
        shader.inputs["Roughness"].default_value = 0
        shader.inputs["IOR"].default_value = iors[kind]
    material.node_tree.links.new(shader.outputs[0], output.inputs["Surface"])
    mesh.materials.append(material)
camera_data = bpy.data.cameras.new("Receipt camera")
camera = bpy.data.objects.new("Receipt camera", camera_data)
scene.collection.objects.link(camera)
camera.location = coordinate(data["camera"]["position"])
target = Vector(coordinate(data["camera"]["target"]))
camera.rotation_euler = (target-camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.sensor_fit = "VERTICAL"
camera_data.sensor_height = 32
camera_data.lens = 16/math.tan(math.radians(data["camera"]["fovYDegrees"])/2)
scene.camera = camera
scene.render.filepath = os.path.join(args.output_dir,"reference.exr")
bpy.ops.render.render(write_still=True)
# Blender image rows are bottom-up. Retain linear scene-referred float32, with
# an explicit top-left origin, independent of the PNG display transfer.
# Background Blender does not expose the internal Render Result pixel buffer.
# Load the retained full-float EXR; never substitute display-encoded PNG pixels.
linear = bpy.data.images.load(scene.render.filepath,check_existing=False)
pixels = array.array("f", linear.pixels[:])
stride = args.width*4
ordered = array.array("f")
for y in reversed(range(args.height)):
    ordered.extend(pixels[y*stride:(y+1)*stride])
if sys.byteorder != "little":
    ordered.byteswap()
raw = ordered.tobytes()
if len(raw) != args.width*args.height*16:
    raise RuntimeError("Missing independent linear reference")
with open(os.path.join(args.output_dir,"reference.f32"),"xb") as stream:
    stream.write(raw)
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "8"
bpy.data.images["Render Result"].save_render(os.path.join(args.output_dir,"reference.png"),scene=scene)
with open(__file__,"rb") as stream:
    script_sha256 = hashlib.sha256(stream.read()).hexdigest()
metadata = {"status":"rendered-attribution-not-full-scene-qualified", "settings":vars(args), "actualDepthPolicy":actual_depth_policy, "supportedDepthLimit":depth_limit, "blender":bpy.app.version_string,
            "engine":"CYCLES", "device":"CPU", "camera":data["camera"], "inputSha256":hashlib.sha256(source).hexdigest(),
            "linearSha256":hashlib.sha256(raw).hexdigest(), "scriptSha256":script_sha256, "format":"rgba-f32-le-top-left", "geometrySources":data["nativeSources"],
            "differences":["explicit shared interfaces instead of priority overlaps", "independent random sampling and roulette", "different bounce-limit semantics", "no room, floor or checker geometry", "PNG uses independent display transform"]}
with open(os.path.join(args.output_dir,"receipt.json"),"x",encoding="utf-8") as stream:
    json.dump(metadata,stream,indent=2)
print("OPTICAL_REFERENCE_METADATA "+json.dumps(metadata))
