from __future__ import annotations

import argparse
import io
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FALLBACK_REPORT_PATH = PROJECT_ROOT / "data" / "audits" / "fallback-image-report.json"
WEB_REPORT_PATH = PROJECT_ROOT / "data" / "audits" / "web-image-sync-report.json"
IMAGE_ROOT = (PROJECT_ROOT / "img" / "perfumes").resolve()
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 Chrome/136 Safari/537.36"
)
BAD_HOST_HINTS = {
    "alamy",
    "freepik",
    "imdb",
    "pinterest",
    "sciencephoto",
    "wallpaper",
    "youtube",
}
GENERIC_WORDS = {
    "de",
    "del",
    "el",
    "la",
    "le",
    "los",
    "las",
    "the",
    "for",
    "and",
    "by",
    "edp",
    "edt",
    "ml",
    "mujer",
    "hombre",
    "unisex",
    "perfume",
    "fragrance",
    "cologne",
    "spray",
}


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def tokens(value: str) -> set[str]:
    return {
        token
        for token in normalize(value).split()
        if len(token) > 1 and token not in GENERIC_WORDS
    }


def request_text(url: str, referer: str | None = None) -> str:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "es-CR,es;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer

    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read().decode("utf-8", "ignore")


def request_bytes(url: str, referer: str | None = None) -> bytes:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "es-CR,es;q=0.9,en;q=0.8",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer

    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(12_000_000)
        if len(data) < 4_000:
            raise ValueError("imagen demasiado pequeña")
        return data


def duckduckgo_vqd(query: str) -> tuple[str, str]:
    search_url = "https://duckduckgo.com/?" + urllib.parse.urlencode(
        {"q": query, "iax": "images", "ia": "images"}
    )
    html = request_text(search_url)
    match = re.search(r"vqd=([\d-]+)&", html) or re.search(
        r'vqd="([^"]+)"',
        html,
    )
    if not match:
        raise ValueError("DuckDuckGo no devolvió token vqd")
    return match.group(1), search_url


def image_search(query: str) -> list[dict[str, str]]:
    vqd, referer = duckduckgo_vqd(query)
    api_url = "https://duckduckgo.com/i.js?" + urllib.parse.urlencode(
        {
            "l": "us-en",
            "o": "json",
            "q": query,
            "vqd": vqd,
            "f": ",,,",
            "p": "1",
        }
    )
    payload = json.loads(request_text(api_url, referer=referer))
    return payload.get("results", [])


def candidate_score(item: dict[str, str], product: str, brand: str) -> float:
    image_url = item.get("image", "")
    page_url = item.get("url", "")
    title = item.get("title", "")
    joined = normalize(f"{title} {image_url} {page_url}")
    host = urllib.parse.urlparse(image_url).netloc.lower()

    if not image_url.startswith(("http://", "https://")):
        return -10.0

    if any(hint in host for hint in BAD_HOST_HINTS):
        return -5.0

    product_tokens = tokens(product)
    brand_tokens = tokens(brand)
    shared_product = sum(1 for token in product_tokens if token in joined)
    shared_brand = sum(1 for token in brand_tokens if token in joined)
    score = shared_product * 2.0 + shared_brand * 3.0

    if "perfume" in joined or "fragrance" in joined or "cologne" in joined:
        score += 1.2
    if "bottle" in joined or "edp" in joined or "edt" in joined:
        score += 0.8
    if image_url.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        score += 0.5

    required_brand = max(1, min(2, len(brand_tokens)))
    if shared_brand < required_brand:
        score -= 3.0
    if product_tokens and shared_product == 0:
        score -= 4.0

    return score


def normalize_product_image(data: bytes, target: Path) -> dict[str, int | str]:
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        source = image.convert("RGBA")

    if source.width < 220 or source.height < 220:
        raise ValueError(f"imagen muy pequeña: {source.width}x{source.height}")

    source.thumbnail((680, 540), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (760, 600), "#ffffff")
    x = (760 - source.width) // 2
    y = (600 - source.height) // 2

    if source.mode == "RGBA":
        canvas.paste(source.convert("RGB"), (x, y), source.getchannel("A"))
    else:
        canvas.paste(source.convert("RGB"), (x, y))

    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, "WEBP", quality=90, method=6)
    return {"width": source.width, "height": source.height}


def load_previous_report() -> dict[str, dict[str, str]]:
    if not WEB_REPORT_PATH.exists():
        return {}

    report = json.loads(WEB_REPORT_PATH.read_text(encoding="utf-8"))
    return {
        item["target"]: item
        for item in report.get("products", [])
        if item.get("result") == "downloaded"
    }


def write_report(products: list[dict[str, str]], started_at: float) -> None:
    summary: dict[str, int | float] = {
        "processed": len(products),
        "elapsedSeconds": round(time.time() - started_at, 2),
    }
    for item in products:
        result = item.get("result", "unknown")
        summary[result] = int(summary.get(result, 0)) + 1

    WEB_REPORT_PATH.write_text(
        json.dumps(
            {
                "summary": summary,
                "products": products,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def build_queries(product: str, brand: str, descriptor: str) -> list[str]:
    base_product = " ".join(product.split())
    base_brand = " ".join(brand.split())
    return [
        f"{base_brand} {base_product} perfume bottle",
        f"{base_brand} {base_product} fragrance",
        f"{descriptor} perfume bottle",
    ]


def process_item(item: dict[str, str]) -> dict[str, str]:
    target = (PROJECT_ROOT / item["target"]).resolve()

    if IMAGE_ROOT not in target.parents:
        return {**item, "result": "skipped-invalid-target"}

    product = item.get("product", "")
    brand = item.get("brand", "")
    descriptor = item.get("descriptor", "")
    candidates: list[tuple[float, dict[str, str]]] = []
    seen_images: set[str] = set()

    for query in build_queries(product, brand, descriptor):
        try:
            for candidate in image_search(query):
                image_url = candidate.get("image", "")
                if image_url in seen_images:
                    continue
                seen_images.add(image_url)
                score = candidate_score(candidate, product, brand)
                if score >= 3.5:
                    candidates.append((score, candidate))
        except Exception as error:  # noqa: BLE001
            last_error = str(error)
        time.sleep(0.25)

        if candidates and max(score for score, _ in candidates) >= 5.0:
            break

    candidates.sort(key=lambda pair: pair[0], reverse=True)

    if not candidates or candidates[0][0] < 4.0:
        return {
            **item,
            "result": "not-found",
            "score": round(candidates[0][0], 3) if candidates else 0,
            "error": locals().get("last_error", "sin candidato suficiente"),
        }

    errors = []
    for score, candidate in candidates[:8]:
        image_url = candidate.get("image", "")
        page_url = candidate.get("url", "")

        try:
            image_data = request_bytes(image_url, referer=page_url or None)
            dimensions = normalize_product_image(image_data, target)
        except Exception as error:  # noqa: BLE001
            errors.append(f"{image_url}: {error}")
            continue

        return {
            **item,
            "result": "downloaded",
            "score": round(score, 3),
            "imageUrl": image_url,
            "sourceUrl": page_url,
            "title": candidate.get("title", ""),
            **dimensions,
        }

    return {
        **item,
        "result": "download-failed",
        "score": round(candidates[0][0], 3),
        "imageUrl": candidates[0][1].get("image", ""),
        "sourceUrl": candidates[0][1].get("url", ""),
        "title": candidates[0][1].get("title", ""),
        "error": " | ".join(errors[:3]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--offset", type=int, default=0)
    args = parser.parse_args()

    fallback_report = json.loads(FALLBACK_REPORT_PATH.read_text(encoding="utf-8"))
    previous_downloads = load_previous_report()
    queue = [
        item
        for item in fallback_report.get("products", [])
        if item["target"] not in previous_downloads
    ]

    if args.offset:
        queue = queue[args.offset:]
    if args.limit:
        queue = queue[: args.limit]

    started_at = time.time()
    products = list(previous_downloads.values())

    for index, item in enumerate(queue, start=1):
        result = process_item(item)
        products.append(result)
        write_report(products, started_at)
        print(
            json.dumps(
                {
                    "index": index,
                    "target": item["target"],
                    "product": item.get("product"),
                    "brand": item.get("brand"),
                    "result": result.get("result"),
                    "score": result.get("score"),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
        time.sleep(0.4)

    write_report(products, started_at)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
