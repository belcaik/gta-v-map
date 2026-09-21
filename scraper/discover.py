import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def discover(url, output):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "gta-5-map.com":
        raise ValueError("Discovery only supports the observed gta-5-map.com origin")
    output.mkdir(parents=True, exist_ok=True)
    options = Options()
    options.binary_location = "/usr/bin/google-chrome-stable"
    options.add_argument("--headless=new")
    options.add_argument("--disable-dev-shm-usage")
    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
    with webdriver.Chrome(options=options) as browser:
        browser.set_page_load_timeout(40)
        browser.get(url)
        WebDriverWait(browser, 30).until(lambda driver: driver.execute_script("return !!window.mapData"))
        snapshot = browser.execute_script("return {mapData:window.mapData, globals:Object.keys(window).filter(k=>/map|location|categor/i.test(k))}")
        (output / "window.json").write_text(json.dumps(snapshot, indent=2))
        responses = []
        for entry in browser.get_log("performance"):
            message = json.loads(entry["message"])["message"]
            if message["method"] == "Network.responseReceived":
                response = message["params"]["response"]
                host = urlparse(response["url"]).hostname
                if host not in {"gta-5-map.com", "cdn.mapgenie.io", "tiles.mapgenie.io", "media.mapgenie.io"}:
                    continue
                responses.append({key: response.get(key) for key in ("url", "status", "mimeType")})
                if "/api/" in response["url"] or "markers.json" in response["url"] or "/js/map.js" in response["url"] or "gta5-icons.css" in response["url"]:
                    payload = browser.execute_cdp_cmd("Network.getResponseBody", {"requestId": message["params"]["requestId"]})
                    name = "locations.json" if "/api/" in response["url"] else ("map.js" if "/js/map.js" in response["url"] else ("icons.css" if "gta5-icons.css" in response["url"] else "sprite.json"))
                    (output / name).write_text(payload["body"])
        evidence = {
            "url": url, "title": browser.title, "responses": responses,
            "body": browser.find_element("tag name", "body").text[:2000],
        }
        (output / "discovery.json").write_text(json.dumps(evidence, indent=2))
        (output / "page.html").write_text(browser.page_source)
        browser.save_screenshot(str(output / "source.png"))
        print(json.dumps(evidence, indent=2))
        if any(item["status"] in (401, 403, 429) for item in responses):
            raise SystemExit("Source blocked; no bypass attempted. Supply a legitimate capture.")
        raise SystemExit("Capture saved. Source-specific parser requires inspected evidence; no endpoint guessed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect the public source with ordinary Selenium, without bypass.")
    parser.add_argument("--source-url", default="https://gta-5-map.com/")
    parser.add_argument("--output", type=Path, default=Path("data/discovery"))
    args = parser.parse_args()
    discover(args.source_url, args.output)
