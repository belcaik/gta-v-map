import argparse
import hashlib
from pathlib import Path

from PIL import Image, ImageDraw

from scraper.contract import validate
from scraper.media import atomic, save_json, store_image
from scraper.normalize import asset
from scraper.run import report


def demo(output):
    output.mkdir(parents=True, exist_ok=True)
    assets = []
    categories = []
    for index, name in enumerate(("Cuadrado", "Círculo", "Triángulo")):
        image = Image.new("RGBA", (32, 37))
        draw = ImageDraw.Draw(image)
        color = ("#2a6438", "#933848", "#404c9b")[index]
        if index == 0:
            draw.rectangle((5, 4, 27, 26), fill=color)
        elif index == 1:
            draw.ellipse((4, 3, 28, 27), fill=color)
        else:
            draw.polygon([(16, 3), (29, 28), (3, 28)], fill=color)
        draw.polygon([(11, 25), (21, 25), (16, 36)], fill=color)
        import io
        buffer = io.BytesIO()
        image.save(buffer, "PNG")
        record = asset("demo-icon-" + str(index), "category-icon", "https://example.com/synthetic/icon-" + str(index))
        record.update(store_image(buffer.getvalue(), "image/png", record["kind"], output))
        assets.append(record)
        categories.append(dict(id="demo-" + str(index), name=name + " (demo)", group="Fixtures sintéticas", iconAssetId=record["id"], iconReason=None))
    for index in range(2):
        image = Image.new("RGB", (640, 360), ("#d8e2ce", "#d1dfeb")[index])
        draw = ImageDraw.Draw(image)
        draw.text((35, 35), f"SYNTHETIC FIXTURE / PHOTO {index + 1}", fill="#203020", font_size=24)
        draw.rectangle((160, 120, 470, 300), outline="#344838", width=8)
        import io
        buffer = io.BytesIO()
        image.save(buffer, "PNG")
        record = asset("demo-photo-" + str(index), "waypoint-image", "https://example.com/synthetic/photo-" + str(index))
        record.update(store_image(buffer.getvalue(), "image/png", record["kind"], output))
        assets.append(record)
    failed = asset("demo-failed", "waypoint-image", "https://example.com/synthetic/missing.png")
    failed.update(status="failed", error="Controlled fixture 404")
    assets.append(failed)
    points = []
    for index, title in enumerate(("Sin imágenes", "Una imagen", "Varias imágenes", "Descubrimiento fallido", "Sin inspeccionar", "Archivo fallido")):
        ids = {1: ["demo-photo-0"], 2: ["demo-photo-0", "demo-photo-1"], 5: ["demo-failed"]}.get(index, [])
        state = "present" if ids else {3: "failed", 4: "uninspected"}.get(index, "none")
        points.append(dict(id=str(100 + index), mapId="demo", categoryId="demo-" + str(index % 3), title=title,
                           description="**Fixture sintética.** No es una ubicación de GTA V.\n\n[Enlace seguro](https://example.com/)\n\n<script>alert('unsafe')</script>",
                           descriptionFormat="markdown", coordinates=dict(x=-80 - (index // 3) * 90, y=55 + (index % 3) * 65),
                           sourceUrl="https://example.com/synthetic/" + str(100 + index),
                           images=[dict(assetId=identifier, order=order, caption=None, attribution=None) for order, identifier in enumerate(ids)],
                           imageDiscovery=state, discoveryError="Controlled failure" if state == "failed" else None))
    tiles = []
    for zoom in range(3):
        for tile_x in range(2 ** zoom):
            for tile_y in range(2 ** zoom):
                image = Image.new("RGB", (256, 256), "#cbd7c2")
                draw = ImageDraw.Draw(image)
                draw.line([(0, 128), (256, 128)], fill="#fffce7", width=16)
                draw.line([(128, 0), (128, 256)], fill="#fffce7", width=16)
                draw.text((10, 10), "DEMO / NOT GTA V", fill="#263522", font_size=16)
                import io
                buffer = io.BytesIO()
                image.save(buffer, "PNG")
                content = buffer.getvalue()
                relative = f"tiles/demo/{zoom}/{tile_x}/{tile_y}.png"
                atomic(output / relative, content)
                tiles.append(dict(mapId="demo", z=zoom, x=tile_x, y=tile_y, sourceUrl="https://example.com/" + relative,
                                  path=relative, sha256=hashlib.sha256(content).hexdigest(), status="downloaded", error=None))
    data = dict(schemaVersion=1, gameId="gta-v", source=dict(url="https://example.com/synthetic", kind="synthetic", evidence="Generated test geometry; no external assets"),
                extractedAt="2026-09-21T00:00:00Z", runId="synthetic-v1",
                maps=[dict(id="demo", name="Mapa sintético", crs="simple", axes="x=north, y=east", transform=[1, 0, 0, 0, 1, 0],
                           bounds=[[-256, 0], [0, 256]], tileSize=256, minZoom=0, maxZoom=2, tileScheme="xyz",
                           tileTemplate="/tiles/demo/{z}/{x}/{y}.png", evidence="Synthetic control grid")],
                categories=categories, waypoints=points, assets=assets, tiles=tiles,
                coverage=dict(complete=False, filters=["synthetic"], discovered=len(points), omissions=["Controlled failures for tests"]))
    validate(data)
    save_json(output / "dataset.json", data)
    save_json(output / "report.json", report(data))
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate explicitly synthetic local test images and tiles")
    parser.add_argument("--output", type=Path, default=Path("data/demo"))
    demo(parser.parse_args().output)
