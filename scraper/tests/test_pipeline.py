import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from PIL import Image

from scraper.contract import validate
from scraper.browser import Browser
from scraper.demo import demo
from scraper.media import atomic, download, png, safe_url, store_image, valid_existing
from scraper.normalize import description_images, normalize


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.data = demo(self.root)

    def test_common_contract_cases(self):
        for case in json.loads(Path("fixtures/contract-cases.json").read_text()):
            with self.subTest(case=case["name"]):
                data = copy.deepcopy(self.data)
                parent = data
                for key in case["path"][:-1]:
                    parent = parent[key]
                parent[case["path"][-1]] = case["value"]
                if case["valid"]:
                    validate(data)
                else:
                    with self.assertRaises(Exception):
                        validate(data)

    def test_non_finite_and_duplicate_ids(self):
        data = copy.deepcopy(self.data)
        data["waypoints"][0]["coordinates"]["x"] = float("nan")
        with self.assertRaisesRegex(ValueError, "Non-finite"):
            validate(data)
        data = copy.deepcopy(self.data)
        data["waypoints"].append(copy.deepcopy(data["waypoints"][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            validate(data)

    def test_dedup_decode_corruption_and_atomic_resume(self):
        buffer = io.BytesIO()
        Image.new("RGB", (20, 10), "red").save(buffer, "PNG")
        first = store_image(buffer.getvalue(), "image/png", "waypoint-image", self.root)
        second = store_image(buffer.getvalue(), "image/png", "waypoint-image", self.root)
        self.assertEqual(first["path"], second["path"])
        self.assertTrue(valid_existing(first, self.root))
        (self.root / first["path"]).write_bytes(b"interrupted")
        self.assertFalse(valid_existing(first, self.root))
        restored = store_image(buffer.getvalue(), "image/png", "waypoint-image", self.root)
        self.assertTrue(valid_existing(restored, self.root))
        with patch("pathlib.Path.replace", side_effect=OSError("interruption")):
            with self.assertRaises(OSError):
                atomic(self.root / "interrupted.png", b"test")
        self.assertFalse(list(self.root.glob("*.tmp")))
        with self.assertRaises(Exception):
            png(b"<html>error</html>", "image/png")
        with self.assertRaises(ValueError):
            png(buffer.getvalue(), "text/html")

    def test_retries_429_404_and_disconnect(self):
        browser = Browser.__new__(Browser)
        browser.driver = MagicMock()
        browser.driver.execute_async_script.return_value = {"status": 429, "retryAfter": None}
        browser.driver.get_log.return_value = [{"message": json.dumps({"message": {
            "method": "Network.responseReceived",
            "params": {"response": {"url": "https://media.mapgenie.io/test", "status": 429, "headers": {"Retry-After": "7"}}},
        }})}]
        with patch("scraper.browser.safe_url"):
            self.assertEqual(browser.fetch("https://media.mapgenie.io/test")["retryAfter"], "7")
        responses = iter([dict(status=429, retryAfter="2"), dict(status=200, body=b"ok", mime="image/png")])
        waits = []
        self.assertEqual(download(lambda _: next(responses), "fixture", sleep=waits.append)[0], b"ok")
        self.assertEqual(waits, [2])
        with self.assertRaisesRegex(ValueError, "HTTP 404"):
            download(lambda _: dict(status=404), "fixture", sleep=waits.append)
        calls = []

        def interrupted(_):
            calls.append(1)
            if len(calls) == 1:
                raise OSError("connection reset")
            return dict(status=200, body=b"ok", mime="image/png")

        self.assertEqual(download(interrupted, "fixture", sleep=lambda _: None)[0], b"ok")
        self.assertEqual(len(calls), 2)
        with self.assertRaisesRegex(ValueError, "Retry-After"):
            download(lambda _: dict(status=429, retryAfter="999"), "fixture", sleep=lambda _: None)

    def test_destinations_and_relative_images(self):
        for url in ("http://gta-5-map.com/", "https://127.0.0.1/", "file:///tmp/image", "https://evil.test/", "https://user@gta-5-map.com/"):
            with self.assertRaises(ValueError):
                safe_url(url)
        with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("127.0.0.1", 443))]):
            with self.assertRaisesRegex(ValueError, "Non-public"):
                safe_url("https://gta-5-map.com/")
        self.assertEqual(description_images('<img data-src="/relative.png"><img srcset="small.png 1x, large.png 2x"> ![photo](other.jpg)'), ["/relative.png", "large.png", "other.jpg"])

    def test_observed_structure_synthetic_content(self):
        capture = json.loads(Path("fixtures/source-capture.json").read_text())
        data = normalize(capture, sample=0, zooms=(3,))
        validate(data)
        self.assertEqual([point["id"] for point in data["waypoints"]], ["100", "101", "102"])
        self.assertEqual([point["imageDiscovery"] for point in data["waypoints"]], ["none", "present", "uninspected"])
        self.assertEqual(len(data["waypoints"][1]["images"]), 2)
        self.assertEqual([image["order"] for image in data["waypoints"][1]["images"]], [0, 1])
        self.assertEqual(data["assets"][1]["sourceUrl"], "https://gta-5-map.com/fixture/photo.png")
        self.assertNotIn("icon", [asset["kind"] for asset in data["assets"]])
