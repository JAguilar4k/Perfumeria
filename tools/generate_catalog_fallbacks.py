from __future__ import annotations

import hashlib
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PLACEHOLDER_SHA256 = (
    "6c241f154577d66c788b6d57438477835302c5b62d6628d3db25a486b09b6f12"
)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
AUDIT_DIR = PROJECT_ROOT / "data" / "audits"
AUDIT_PATH = AUDIT_DIR / "fragrantica-enrichment-audit.json"
PLAN_PATH = AUDIT_DIR / "fragrantica-image-plan.json"
REPORT_PATH = AUDIT_DIR / "fallback-image-report.json"
SYNC_REPORT_PATH = AUDIT_DIR / "image-sync-report.json"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    windows_font = Path("C:/Windows/Fonts") / name
    return ImageFont.truetype(str(windows_font), size=size)


def display_text(value: str, fallback: str) -> str:
    cleaned = " ".join(str(value or "").replace("_", " ").split())
    return cleaned.title() if cleaned else fallback


def file_sha256(file_path: Path) -> str:
    return hashlib.sha256(file_path.read_bytes()).hexdigest()


def centered_multiline(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    selected_font: ImageFont.FreeTypeFont,
    fill: str,
    width: int,
) -> int:
    lines = textwrap.wrap(text, width=width)[:3]
    line_height = selected_font.size + 8
    for line in lines:
        box = draw.textbbox((0, 0), line, font=selected_font)
        x = (760 - (box[2] - box[0])) // 2
        draw.text((x, y), line, font=selected_font, fill=fill)
        y += line_height
    return y


def render_card(product_name: str, brand: str, target: Path) -> None:
    image = Image.new("RGB", (760, 600), "#f6f0e7")
    draw = ImageDraw.Draw(image)
    title_font = font("georgiab.ttf", 42)
    brand_font = font("arialbd.ttf", 21)
    detail_font = font("arial.ttf", 17)
    monogram_font = font("georgiab.ttf", 62)

    draw.rounded_rectangle(
        (225, 62, 535, 338),
        radius=42,
        fill="#fffdf9",
        outline="#6f1839",
        width=6,
    )
    draw.rounded_rectangle(
        (320, 34, 440, 88),
        radius=14,
        fill="#6f1839",
    )
    draw.text(
        (380, 188),
        "AP",
        anchor="mm",
        font=monogram_font,
        fill="#6f1839",
    )

    y = centered_multiline(
        draw,
        product_name,
        380,
        title_font,
        "#241b18",
        28,
    )
    brand_box = draw.textbbox((0, 0), brand.upper(), font=brand_font)
    draw.text(
        ((760 - (brand_box[2] - brand_box[0])) // 2, y + 5),
        brand.upper(),
        font=brand_font,
        fill="#8a5c24",
    )
    note = "Fotografía pendiente de verificación"
    note_box = draw.textbbox((0, 0), note, font=detail_font)
    draw.text(
        ((760 - (note_box[2] - note_box[0])) // 2, 558),
        note,
        font=detail_font,
        fill="#6e625d",
    )
    image.save(target, "WEBP", quality=88, method=3)


def main() -> None:
    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    sync_report = json.loads(SYNC_REPORT_PATH.read_text(encoding="utf-8"))
    downloaded_targets = {
        item["target"]
        for item in sync_report["products"]
        if item["result"] == "downloaded"
    }
    audit_by_descriptor = {
        item["descriptor"]: item
        for item in audit["products"]
    }
    generated = []
    fallback_products = []

    for plan_item in plan:
        if plan_item.get("source") or plan_item["target"] in downloaded_targets:
            continue

        target = PROJECT_ROOT / plan_item["target"]
        audit_item = audit_by_descriptor.get(plan_item["descriptor"], {})
        product_name = display_text(
            audit_item.get("parsedProduct", ""),
            "Fragancia Archivum",
        )
        brand = display_text(
            audit_item.get("parsedBrand", ""),
            "Marca por confirmar",
        )
        product = {
            "descriptor": plan_item["descriptor"],
            "target": plan_item["target"],
            "product": product_name,
            "brand": brand,
        }
        fallback_products.append(product)

        if target.exists() and file_sha256(target) == PLACEHOLDER_SHA256:
            render_card(product_name, brand, target)
            generated.append(product)

    REPORT_PATH.write_text(
        json.dumps(
            {
                "fallbackCards": len(fallback_products),
                "generatedThisRun": len(generated),
                "products": fallback_products,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "fallbackCards": len(fallback_products),
                "generatedThisRun": len(generated),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
