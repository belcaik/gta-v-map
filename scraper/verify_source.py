import json
import time
from pathlib import Path
from urllib.parse import urlparse

from selenium.webdriver.support.ui import WebDriverWait

from scraper.browser import Browser
from scraper.media import save_json


def inspect():
    output = Path("data/source-verification")
    output.mkdir(parents=True, exist_ok=True)
    browser = Browser("https://gta-5-map.com/")
    try:
        capture = browser.capture(output)
        driver = browser.driver
        source = driver.execute_script("""
          return {sources:window.map.getStyle().sources, center:window.map.getCenter(), zoom:window.map.getZoom(),
            icons:['ammu_nation','barber','hidden_package','parachute','actor'].map(name=>{
              const element=document.querySelector('.icon-'+name);
              if(!element)return {name,missing:true};
              const css=getComputedStyle(element),before=getComputedStyle(element,'::before');
              return {name,background:css.backgroundImage,position:css.backgroundPosition,size:css.backgroundSize,
                width:css.width,height:css.height,before:before.content,font:before.fontFamily};
            })};
        """)
        save_json(output / "styles.json", source)
        points = {point["id"]: point for point in capture["locations"]["locations"]}
        projections = []
        for zoom in (3, 4, 5):
            driver.execute_script("window.map.jumpTo({center:[-130,70],zoom:arguments[0],bearing:0,pitch:0})", zoom)
            probes = [points[identifier] for identifier in (12684, 12815, 13236, 13607)]
            projections.append(driver.execute_script("""
              return {zoom:window.map.getZoom(),center:window.map.getCenter(),
                width:window.map.getContainer().clientWidth,height:window.map.getContainer().clientHeight,
                points:arguments[0].map(point=>({id:point.id,latitude:Number(point.latitude),longitude:Number(point.longitude),
                  pixel:window.map.project([Number(point.longitude),Number(point.latitude)])}))};
            """, probes))
        save_json(output / "projections.json", projections)
        results = []
        for identifier in (12627, 13607, 12684, 12815, 13236):
            point = points[identifier]
            driver.get("https://gta-5-map.com/?locationIds=" + str(identifier))
            WebDriverWait(driver, 40).until(lambda current: current.execute_script("return !!window.map && !!window.map.loaded && window.map.loaded()"))
            time.sleep(1)
            evidence = driver.execute_script("""
              return {title:document.querySelector('.maplibregl-popup')?.textContent || document.querySelector('.mapboxgl-popup')?.textContent,
                images:[...document.querySelectorAll('.marker-image')].map(element=>({src:element.src,srcset:element.srcset,lazy:element.getAttribute('data-src')})),
                center:window.map.getCenter(),zoom:window.map.getZoom()};
            """)
            responses = []
            for entry in driver.get_log("performance"):
                message = json.loads(entry["message"])["message"]
                if message["method"] == "Network.responseReceived":
                    url = message["params"]["response"]["url"]
                    if urlparse(url).hostname in {"gta-5-map.com", "media.mapgenie.io"} and ("/api/" in url or "/storage/media/" in url):
                        responses.append(url)
            evidence.update(id=identifier, name=point["title"], latitude=point["latitude"], longitude=point["longitude"], responses=responses)
            results.append(evidence)
            driver.save_screenshot(str(output / f"point-{identifier}.png"))
            save_json(output / "details.json", results)
        print(json.dumps(results, indent=2))
    finally:
        browser.close()


if __name__ == "__main__":
    inspect()
