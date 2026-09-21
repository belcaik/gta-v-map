import json
import math
from pathlib import Path

from jsonschema import Draft7Validator

SCHEMA = json.loads((Path(__file__).resolve().parents[1] / "schemas/dataset.schema.json").read_text())


def validate(data):
    Draft7Validator(SCHEMA).validate(data)

    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def unique(values, label):
        require(len(set(values)) == len(values), "Duplicate " + label)

    for key in ("maps", "categories", "assets"):
        unique([item["id"] for item in data[key]], key)
    unique([(item["mapId"], item["id"]) for item in data["waypoints"]], "waypoint")
    unique([(item["mapId"], item["z"], item["x"], item["y"]) for item in data["tiles"]], "tile")
    require(data["maps"], "At least one map required")
    require(data["coverage"]["discovered"] >= len(data["waypoints"]), "Invalid discovered count")
    assets = {item["id"]: item for item in data["assets"]}
    maps = {item["id"]: item for item in data["maps"]}
    categories = {item["id"] for item in data["categories"]}
    for config in data["maps"]:
        require(config["minZoom"] <= config["maxZoom"] <= 22, "Invalid zoom")
        bounds = config["bounds"]
        require(all(math.isfinite(value) for corner in bounds for value in corner), "Non-finite bounds")
        require(bounds[0][0] < bounds[1][0] and bounds[0][1] < bounds[1][1], "Invalid bounds")
        require(config["tileTemplate"] == "/tiles/" + config["id"] + "/{z}/{x}/{y}.png", "Invalid local tile template")
        require(all(math.isfinite(value) for value in config["transform"]), "Non-finite transform")
    for asset in data["assets"]:
        if asset["status"] == "downloaded":
            require(all(asset[key] for key in ("path", "sha256", "mime", "bytes", "width", "height")), "Downloaded asset lacks metadata")
            folder = "icons/" if asset["kind"] == "category-icon" else "images/"
            require(asset["path"] == folder + asset["sha256"] + ".png", "Asset path/hash mismatch")
        else:
            require(asset["path"] is None, "Undownloaded asset has path")
        require(asset["status"] != "failed" or asset["error"], "Failed asset lacks reason")
    for category in data["categories"]:
        require(assets.get(category["iconAssetId"], {}).get("kind") == "category-icon" if category["iconAssetId"] else category["iconReason"], "Invalid category icon")
    for point in data["waypoints"]:
        require(point["mapId"] in maps and point["categoryId"] in categories, "Orphan waypoint")
        coord = point["coordinates"]
        require(all(math.isfinite(value) for value in coord.values()), "Non-finite coordinates")
        config = maps[point["mapId"]]
        lat_x, lat_y, lat_offset, lng_x, lng_y, lng_offset = config["transform"]
        latitude = lat_x * coord["x"] + lat_y * coord["y"] + lat_offset
        longitude = lng_x * coord["x"] + lng_y * coord["y"] + lng_offset
        bounds = config["bounds"]
        require(bounds[0][0] <= latitude <= bounds[1][0] and bounds[0][1] <= longitude <= bounds[1][1], "Coordinates outside bounds")
        unique([image["order"] for image in point["images"]], "image order")
        require(all(assets.get(image["assetId"], {}).get("kind") == "waypoint-image" for image in point["images"]), "Orphan or wrong-kind image")
        require(bool(point["images"]) == (point["imageDiscovery"] == "present"), "Discovery/images mismatch")
        require(point["imageDiscovery"] != "failed" or point["discoveryError"], "Failed discovery lacks reason")
    for tile in data["tiles"]:
        config = maps.get(tile["mapId"])
        require(config and config["minZoom"] <= tile["z"] <= config["maxZoom"], "Invalid tile map/zoom")
        if tile["status"] == "downloaded":
            require(tile["sha256"] and tile["path"] == "tiles/{mapId}/{z}/{x}/{y}.png".format(**tile), "Invalid downloaded tile")
        else:
            require(tile["path"] is None, "Undownloaded tile has path")
        require(tile["status"] != "failed" or tile["error"], "Failed tile lacks reason")
    coverage = data["coverage"]
    if coverage["complete"]:
        require(not coverage["filters"] and not coverage["omissions"] and coverage["discovered"] == len(data["waypoints"]), "Incomplete coverage")
        require(all(item["imageDiscovery"] in ("none", "present") for item in data["waypoints"]), "Incomplete discovery")
        require(all(item["status"] == "downloaded" for item in data["assets"] + data["tiles"]), "Incomplete downloads")
    return data
