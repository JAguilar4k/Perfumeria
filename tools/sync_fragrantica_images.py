from __future__ import annotations

import hashlib
import io
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image


PLACEHOLDER_SHA256 = (
    "6c241f154577d66c788b6d57438477835302c5b62d6628d3db25a486b09b6f12"
)
CONCURRENCY = 6
REQUEST_TIMEOUT_SECONDS = 20

PROJECT_ROOT = (
    Path(sys.argv[1]).resolve()
    if len(sys.argv) > 1
    else Path(__file__).resolve().parent.parent
)
AUDIT_DIR = PROJECT_ROOT / "data" / "audits"
AUDIT_PATH = AUDIT_DIR / "fragrantica-enrichment-audit.json"
PLAN_PATH = AUDIT_DIR / "fragrantica-image-plan.json"
REPORT_PATH = AUDIT_DIR / "image-sync-report.json"
IMAGE_ROOT = (PROJECT_ROOT / "img" / "perfumes").resolve()


def fragrance_id(source_url: str) -> str:
    match = re.search(r"-(\d+)\.html(?:[?#].*)?$", source_url or "")
    return match.group(1) if match else ""


def file_sha256(file_path: Path) -> str:
    return hashlib.sha256(file_path.read_bytes()).hexdigest()


def download_image(url: str) -> bytes:
    request = Request(
        url,
        headers={
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Referer": "https://www.fragrantica.com/",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/136 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return response.read()


def materialize(item: dict[str, str]) -> dict[str, str]:
    perfume_id = fragrance_id(item.get("sourceUrl", ""))
    target = (PROJECT_ROOT / item["target"]).resolve()
    image_url = (
        f"https://fimgs.net/mdimg/perfume-thumbs/375x500.{perfume_id}.jpg"
    )
    result = {**item, "imageUrl": image_url}

    if (
        not perfume_id
        or IMAGE_ROOT not in target.parents
        or not target.exists()
    ):
        return {**result, "result": "skipped-invalid"}

    try:
        if file_sha256(target) != PLACEHOLDER_SHA256:
            return {**result, "result": "kept-existing"}

        with Image.open(io.BytesIO(download_image(image_url))) as source:
            source.load()
            converted = source.convert("RGB")
            converted.thumbnail((760, 600), Image.Resampling.LANCZOS)
            canvas = Image.new("RGB", (760, 600), "#ffffff")
            position = (
                (760 - converted.width) // 2,
                (600 - converted.height) // 2,
            )
            canvas.paste(converted, position)
            canvas.save(target, "WEBP", quality=90, method=6)

        return {**result, "result": "downloaded"}
    except Exception as error:  # noqa: BLE001 - every failure belongs in the audit.
        return {**result, "result": "failed", "error": str(error)}


def main() -> None:
    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    target_by_descriptor = {
        item["descriptor"]: item["target"]
        for item in plan
    }
    queue = [
        {
            "descriptor": item["descriptor"],
            "sourceUrl": item["sourceUrl"],
            "target": target_by_descriptor[item["descriptor"]],
        }
        for item in audit["products"]
        if item.get("status") == "matched"
        and fragrance_id(item.get("sourceUrl", ""))
        and item["descriptor"] in target_by_descriptor
    ]
    results: list[dict[str, str]] = []

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = [executor.submit(materialize, item) for item in queue]
        for future in as_completed(futures):
            results.append(future.result())

    summary: dict[str, int] = {"planned": len(queue)}
    for item in results:
        key = item["result"]
        summary[key] = summary.get(key, 0) + 1

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "products": results,
    }
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
