import argparse
import hashlib
import io
import json
from collections import Counter
from pathlib import Path

from PIL import Image

from scraper.browser import Browser
from scraper.contract import validate
from scraper.media import atomic, download, png, safe_url, save_json, store_image, valid_existing
from scraper.normalize import normalize


def report(data):
    return dict(categories=len(data["categories"]), discoveredWaypoints=data["coverage"]["discovered"],
                missingIcons=[dict(id=item["id"], reason=item["iconReason"]) for item in data["categories"] if not item["iconAssetId"]],
                importableWaypoints=len(data["waypoints"]), complete=data["coverage"]["complete"],
                filters=data["coverage"]["filters"], omissions=data["coverage"]["omissions"],
                icons=dict(Counter(item["status"] for item in data["assets"] if item["kind"] == "category-icon")),
                photos=dict(Counter(item["status"] for item in data["assets"] if item["kind"] == "waypoint-image")),
                imageDiscovery=dict(Counter(item["imageDiscovery"] for item in data["waypoints"])),
                tiles=dict(Counter(item["status"] for item in data["tiles"])),
                failures=[dict(id=item.get("id", item.get("sourceUrl")), error=item["error"]) for item in data["assets"] + data["tiles"] if item["status"] == "failed"])


def run(args):
    args.output.mkdir(parents=True, exist_ok=True)
    if args.phase == "validate":
        data = validate(json.loads((args.output / "dataset.json").read_text()))
        for item in data["assets"] + data["tiles"]:
            if item["status"] == "downloaded" and not valid_existing(item, args.output):
                raise ValueError("Downloaded file failed validation: " + str(item.get("path")))
        save_json(args.output / "report.json", report(data))
        print(json.dumps(report(data), indent=2))
        return
    capture_path = args.capture or args.output / "capture.json"
    browser = None
    data = None
    try:
        if capture_path.exists():
            capture = json.loads(capture_path.read_text())
            if capture_path != args.output / "capture.json":
                save_json(args.output / "capture.json", capture)
        else:
            print("discover", flush=True)
            browser = Browser(args.source_url, args.timeout)
            capture = browser.capture(args.output)
        dataset_path = args.output / "dataset.json"
        if args.resume and dataset_path.exists():
            data = validate(json.loads(dataset_path.read_text()))
        else:
            print("normalize", flush=True)
            data = normalize(capture, args.sample, args.categories.split(",") if args.categories else (), args.layer, tuple(args.zoom))
            if args.capture:
                data["source"]["kind"] = "capture"
            validate(data)
            save_json(dataset_path, data)
        if args.phase == "normalize":
            save_json(args.output / "report.json", report(data))
            return
        if args.phase == "download":
            print("download", flush=True)
            def fetch(url):
                nonlocal browser
                safe_url(url)
                if browser is None:
                    browser = Browser(args.source_url, args.timeout)
                return browser.fetch(url)

            sprite_cache = {}
            source_categories = capture["window"]["mapData"]["categories"]
            for index, item in enumerate(data["assets"] + data["tiles"]):
                if valid_existing(item, args.output):
                    continue
                try:
                    if item.get("kind") == "category-icon":
                        url = item["sourceUrl"]
                        if url not in sprite_cache:
                            content, mime = download(fetch, url, args.retries)
                            validated, _, _ = png(content, mime)
                            sprite_cache[url] = Image.open(io.BytesIO(validated))
                        category = source_categories[item["id"].removeprefix("icon-")]
                        crop = capture["sprite"][category["icon"]]
                        bounds = (crop["x"], crop["y"], crop["x"] + crop["width"], crop["y"] + crop["height"])
                        image = sprite_cache[url]
                        if bounds[2] > image.width or bounds[3] > image.height:
                            raise ValueError("Sprite bounds exceed source")
                        buffer = io.BytesIO()
                        image.crop(bounds).save(buffer, "PNG")
                        item.update(store_image(buffer.getvalue(), "image/png", item["kind"], args.output))
                    else:
                        content, mime = download(fetch, item["sourceUrl"], args.retries)
                        if "kind" in item:
                            item.update(store_image(content, mime, item["kind"], args.output))
                        else:
                            content, width, height = png(content, mime)
                            if width != 256 or height != 256:
                                raise ValueError("Unexpected tile size")
                            relative = "tiles/{mapId}/{z}/{x}/{y}.png".format(**item)
                            atomic(args.output / relative, content)
                            item.update(path=relative, sha256=hashlib.sha256(content).hexdigest(), status="downloaded", error=None)
                except Exception as error:
                    item.update(path=None, status="failed", error=str(error)[:400])
                save_json(dataset_path, data)
                if index % 25 == 0:
                    print(f"media {index + 1}/{len(data['assets']) + len(data['tiles'])}", flush=True)
        print("validate/export", flush=True)
        for item in data["assets"] + data["tiles"]:
            if item["status"] == "downloaded" and not valid_existing(item, args.output):
                raise ValueError("Downloaded file failed validation: " + str(item.get("path")))
        validate(data)
        save_json(dataset_path, data)
        summary = report(data)
        save_json(args.output / "report.json", summary)
        print(json.dumps(summary, indent=2))
    finally:
        if data is not None:
            save_json(args.output / "report.json", report(data))
        if browser:
            browser.close()


def parser():
    cli = argparse.ArgumentParser(description="GTA V observed-source extraction. Resume reuses the original selection.")
    cli.add_argument("--source-url", default="https://gta-5-map.com/")
    cli.add_argument("--output", type=Path, default=Path("data/extraction"))
    cli.add_argument("--capture", type=Path, help="Legitimate capture.json from scraper.browser")
    cli.add_argument("--sample", type=int, default=12, help="Waypoint limit, 0 for all discovered")
    cli.add_argument("--categories", default="", help="Comma-separated source category IDs")
    cli.add_argument("--layer", choices=["Atlas", "Satellite", "Road", "UV"], default="Atlas")
    cli.add_argument("--zoom", type=int, nargs="+", default=[3, 4, 5])
    cli.add_argument("--timeout", type=int, default=40)
    cli.add_argument("--retries", type=int, choices=range(0, 5), default=2)
    cli.add_argument("--concurrency", type=int, choices=[1], default=1, help="Serialized browser transport")
    cli.add_argument("--resume", action="store_true")
    cli.add_argument("--phase", choices=["normalize", "download", "validate"], default="download")
    return cli


if __name__ == "__main__":
    arguments = parser().parse_args()
    if arguments.sample < 0 or arguments.timeout < 1:
        raise SystemExit("sample must be >= 0 and timeout positive")
    run(arguments)
