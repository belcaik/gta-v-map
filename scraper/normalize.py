import hashlib
import math
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin


class DescriptionImages(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        if tag == "img":
            attrs = dict(attributes)
            url = attrs.get("data-src") or attrs.get("src")
            if not url and attrs.get("srcset"):
                url = attrs["srcset"].split(",")[-1].strip().split()[0]
            if url:
                self.urls.append(url)


def description_images(text):
    parser = DescriptionImages()
    parser.feed(text)
    return parser.urls + re.findall(r"!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)", text)


def asset(identifier, kind, url):
    return dict(id=identifier, kind=kind, sourceUrl=url, path=None, mime=None, bytes=None,
                width=None, height=None, sha256=None, status="pending", error=None)


def normalize(capture, sample=0, category_ids=(), layer="Atlas", zooms=(3, 4, 5)):
    window = capture["window"]["mapData"]
    source = capture["sourceUrl"].split("?")[0]
    if window["map"]["id"] != 27:
        raise ValueError("Only observed Los Santos map 27 is supported")
    tile_set = next((item for item in window["mapConfig"]["tile_sets"] if item["name"] == layer), None)
    if not tile_set or any(zoom < tile_set["min_zoom"] or zoom > tile_set["max_zoom"] for zoom in zooms):
        raise ValueError("Layer/zoom outside observed configuration")
    maximum = tile_set["bounds"][str(tile_set["max_zoom"])]
    extent = 2 ** tile_set["max_zoom"]
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (maximum["y"]["max"] + 1) / extent))))
    east = (maximum["x"]["max"] + 1) / extent * 360 - 180
    config = dict(id="27", name="Los Santos / " + layer, crs="EPSG3857",
                  axes="x=source latitude, y=source longitude; web map coordinates, not Earth locations",
                  transform=[1, 0, 0, 0, 1, 0], bounds=[[south, -180], [85.0511287798066, east]],
                  tileSize=256, minZoom=min(zooms), maxZoom=max(zooms), tileScheme="xyz",
                  tileTemplate="/tiles/27/{z}/{x}/{y}.png",
                  evidence="Observed mapData.mapConfig tile bounds and MapLibre raster source, 2026-09-21")
    all_points = capture["locations"]["locations"]
    points = [item for item in all_points if not category_ids or str(item["category_id"]) in category_ids]
    if sample:
        preferred = ["12627", "13607", "471053", "12684", "12815", "13236"]
        points.sort(key=lambda item: (str(item["id"]) not in preferred, preferred.index(str(item["id"])) if str(item["id"]) in preferred else 0))
        points = points[:sample]
    groups = {item["id"]: item["title"] for item in window["groups"]}
    assets = {}
    omissions = []
    categories = []
    sprite_url = next(item["url"] for item in capture["responses"] if "/images/games/gta5/markers.png" in item["url"])
    for category in window["categories"].values():
        identifier = str(category["id"])
        if category_ids and identifier not in category_ids:
            continue
        icon_id = "icon-" + identifier
        sprite = capture["sprite"].get(category["icon"])
        if sprite:
            assets[icon_id] = asset(icon_id, "category-icon", sprite_url)
            assets[icon_id]["sprite"] = dict(name=category["icon"], **{key: sprite[key] for key in ("x", "y", "width", "height")})
        categories.append(dict(id=identifier, name=category["title"], group=groups.get(category["group_id"]),
                               iconAssetId=icon_id if sprite else None, iconReason=None if sprite else "Symbol missing in source sprite"))
    waypoints = []
    for point in points:
        latitude, longitude = float(point["latitude"]), float(point["longitude"])
        if not (south <= latitude <= config["bounds"][1][0] and -180 <= longitude <= east):
            omissions.append(f"waypoint {point['id']}: source coordinates outside tile extent ({latitude},{longitude})")
            continue
        images = []
        discovery = "none" if "media" in point else "uninspected"
        for media in sorted(point.get("media", []), key=lambda item: item.get("order", 0)):
            if media["type"] != "image":
                omissions.append(f"waypoint {point['id']}: unsupported media type {media['type']}")
                continue
            identifier = "media-" + str(media["id"])
            resolved = urljoin(source, media["url"])
            if identifier in assets and assets[identifier]["sourceUrl"] != resolved:
                raise ValueError("Conflicting source media ID " + identifier)
            assets[identifier] = asset(identifier, "waypoint-image", resolved)
            images.append(dict(assetId=identifier, order=len(images), caption=media.get("title") or None, attribution=media.get("attribution") or None))
        for url in description_images(point.get("description") or ""):
            resolved = urljoin(source, url)
            identifier = "description-" + hashlib.sha256(resolved.encode()).hexdigest()
            assets[identifier] = asset(identifier, "waypoint-image", resolved)
            if not any(image["assetId"] == identifier for image in images):
                images.append(dict(assetId=identifier, order=len(images), caption=None, attribution=None))
        if images:
            discovery = "present"
        waypoints.append(dict(id=str(point["id"]), mapId="27", categoryId=str(point["category_id"]),
                              title=point["title"], description=point.get("description") or "", descriptionFormat="markdown",
                              coordinates=dict(x=latitude, y=longitude), sourceUrl=source + "?locationIds=" + str(point["id"]),
                              images=images, imageDiscovery=discovery, discoveryError=None))
    filters = [f"layer={layer}", "zooms=" + ",".join(map(str, zooms))]
    if sample:
        filters.append(f"sample={sample}")
    if category_ids:
        filters.append("categories=" + ",".join(category_ids))
    tiles = []
    for zoom in zooms:
        bounds = tile_set["bounds"][str(zoom)]
        for tile_x in range(bounds["x"]["min"], bounds["x"]["max"] + 1):
            for tile_y in range(bounds["y"]["min"], bounds["y"]["max"] + 1):
                url = capture["window"]["tilesCdnUrl"] + tile_set["pattern"].format(z=zoom, x=tile_x, y=tile_y)
                tiles.append(dict(mapId="27", z=zoom, x=tile_x, y=tile_y, sourceUrl=url, path=None, sha256=None, status="pending", error=None))
    now = datetime.now(timezone.utc).isoformat()
    return dict(schemaVersion=1, gameId="gta-v", source=dict(url=source, kind="live", evidence="Selenium capture.json; map data endpoint and sprite observed"),
                extractedAt=now, runId=hashlib.sha256(now.encode()).hexdigest()[:16], maps=[config], categories=categories,
                waypoints=waypoints, assets=list(assets.values()), tiles=tiles,
                coverage=dict(complete=False, filters=filters, discovered=len(all_points), omissions=omissions))
