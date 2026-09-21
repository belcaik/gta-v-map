import base64
import json
import time
from pathlib import Path
from urllib.parse import urlparse

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

from scraper.media import MAX_BYTES, safe_url, save_json


class Browser:
    def __init__(self, source, timeout=40):
        safe_url(source)
        if urlparse(source).hostname != "gta-5-map.com":
            raise ValueError("Expected GTA V source")
        options = Options()
        options.page_load_strategy = "eager"
        options.add_argument("--headless=new")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1440,1000")
        options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
        self.driver = webdriver.Chrome(options=options)
        self.driver.set_page_load_timeout(timeout)
        self.driver.set_script_timeout(timeout)
        self.driver.execute_cdp_cmd("Network.enable", {"maxTotalBufferSize": 100_000_000, "maxResourceBufferSize": 20_000_000})
        try:
            self.driver.get(source)
        except Exception:
            self.driver.quit()
            raise

    def close(self):
        self.driver.quit()

    def fetch(self, url):
        safe_url(url)
        result = self.driver.execute_async_script("""
          const [url, limit, done] = arguments;
          fetch(url, {redirect:'error', credentials:'omit'}).then(async response => {
            if (!response.ok) return done({status:response.status,retryAfter:response.headers.get('Retry-After')});
            const reader = response.body.getReader(); let length = 0; const chunks = [];
            while (true) {
              const part = await reader.read(); if (part.done) break;
              length += part.value.length;
              if (length > limit) { await reader.cancel(); throw new Error('Size limit'); }
              chunks.push(part.value);
            }
            let binary = '';
            for (const chunk of chunks) for (let offset=0; offset<chunk.length; offset+=8192)
              binary += String.fromCharCode(...chunk.subarray(offset,offset+8192));
            done({status:response.status,mime:response.headers.get('Content-Type'),body:btoa(binary)});
          }).catch(error => done({status:0,error:String(error)}));
        """, url, MAX_BYTES)
        if result["status"] in (429, 503) and not result.get("retryAfter"):
            for entry in self.driver.get_log("performance"):
                message = json.loads(entry["message"])["message"]
                if message["method"] == "Network.responseReceived":
                    response = message["params"]["response"]
                    if response["url"] == url and response["status"] == result["status"]:
                        headers = {key.lower(): value for key, value in response.get("headers", {}).items()}
                        result["retryAfter"] = headers.get("retry-after")
        if result.get("body"):
            result["body"] = base64.b64decode(result["body"])
        return result

    def capture(self, output):
        WebDriverWait(self.driver, 40).until(lambda driver: driver.execute_script("return !!window.mapData && !!window.mapReady"))
        captures = {}
        responses = []
        pending = {}
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            for entry in self.driver.get_log("performance"):
                message = json.loads(entry["message"])["message"]
                if message["method"] != "Network.responseReceived":
                    continue
                response = message["params"]["response"]
                url = response["url"]
                if urlparse(url).hostname not in {"gta-5-map.com", "cdn.mapgenie.io", "tiles.mapgenie.io", "media.mapgenie.io"}:
                    continue
                responses.append({key: response.get(key) for key in ("url", "status", "mimeType")})
                key = "locations" if "/api/v1/maps/27/data" in url else ("sprite" if "markers.json" in url else None)
                if key and response["status"] == 200:
                    pending[key] = message["params"]["requestId"]
            for key, request_id in list(pending.items()):
                try:
                    body = self.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": request_id})
                    captures[key] = json.loads(body["body"])
                    del pending[key]
                except Exception:
                    continue
            if "locations" in captures and "sprite" in captures:
                break
            time.sleep(0.2)
        if not {"locations", "sprite"} <= captures.keys():
            raise ValueError("Required observed responses missing; source blocked or changed")
        captures["window"] = self.driver.execute_script("return {mapData:window.mapData, tilesCdnUrl:window.tilesCdnUrl}")
        captures["responses"] = responses
        captures["sourceUrl"] = self.driver.current_url
        save_json(output / "capture.json", captures)
        return captures
