from __future__ import annotations

import ast
import csv
import difflib
import hashlib
import html
import json
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse


SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1K0fPgNhIHEVGe-jXJEIzmcuIG8pJMCrmEe1aVFMM4xA/gviz/tq?tqx=out:csv"
)

STANDARD_NOTES = [
    "Amaderado",
    "Cítrico",
    "Floral",
    "Frutal",
    "Oriental",
    "Gourmand",
    "Especiado",
    "Cuero",
    "Almizclado",
    "Verde",
]

AUDIENCE_PATTERN = re.compile(
    r"\b(?:UNISEX|UNSIEX|MUJER(?:ES)?|HOMBRE(?:S)?|MASCULINO|"
    r"FEMENINO|NIÑ(?:O|OS|A|AS)|INFANTIL)\b",
    re.IGNORECASE,
)
SIZE_PATTERN = re.compile(r"\b\d+(?:[.,]\d+)?\s*ML\b", re.IGNORECASE)
TYPE_PATTERN = re.compile(
    r"\b(?:EDP|EDT|EDC|PARFUM|PERFUME|PERFUM|EXTRAIT|ACEITE|OIL|"
    r"COLONIA)\b\s+(.+)$",
    re.IGNORECASE,
)
NON_PERFUME_PATTERN = re.compile(
    r"^(?:ESTUCHE|MINI(?:S)?|SPLASH|CREMA|SHOWER|ATOMIZADOR(?:ES)?|"
    r"DECANT|HAIR|BODY|BRILLO|GEL|DESODORANTE|COSMETIQUERA|BOLSO)\b",
    re.IGNORECASE,
)

BRAND_ALIASES = {
    "abercrombie fitch": "abercrombie and fitch",
    "al haramain perfumes": "al haramain",
    "animale parliux": "animale",
    "antonnio banderas": "antonio banderas",
    "armani": "giorgio armani",
    "bvlgary": "bvlgari",
    "cristiano rolando": "cristiano ronaldo",
    "dkny": "donna karan",
    "dolce and gababana": "dolce gabbana",
    "dolce and gabanna": "dolce gabbana",
    "dolce and gabbana": "dolce gabbana",
    "dolce and gabbbana": "dolce gabbana",
    "emporio armani": "giorgio armani",
    "ferragamo": "salvatore ferragamo",
    "jean paul": "jean paul gaultier",
    "lacoste fragrances": "lacoste",
    "lataffa": "lattafa",
    "lattafa perfumes": "lattafa",
    "maison al hambra": "maison alhambra",
    "michael malul london": "michael malul",
    "mont blanc": "montblanc",
    "mugler": "thierry mugler",
    "paco rabanne": "paco rabanne",
    "rabanne": "paco rabanne",
    "roja perfumes": "roja dove",
    "roja perfums": "roja dove",
    "swiss army victorinox": "victorinox swiss army",
    "thierry mugler": "thierry mugler",
    "victoria s": "victoria s secret",
    "victoria s secret": "victoria s secret",
    "viktor rolf": "viktor and rolf",
}

GENERIC_NAME_WORDS = {
    "de",
    "del",
    "el",
    "la",
    "le",
    "new",
    "nuevo",
    "nueva",
    "original",
}

OPTIONAL_MATCH_WORDS = {
    "by",
    "cologne",
    "d",
    "de",
    "eau",
    "edc",
    "edp",
    "edt",
    "for",
    "parfum",
    "perfume",
    "pour",
    "the",
    "toilette",
}

SHORT_BRAND_FORMS = {
    "carolina herrera": {"ch", "herrera"},
    "giorgio armani": {"armani", "emporio armani"},
    "hugo boss": {"boss"},
    "jean paul gaultier": {"jean paul"},
    "narciso rodriguez": {"narciso"},
    "salvatore ferragamo": {"ferragamo"},
    "victoria s secret": {"victoria secret"},
    "yves saint laurent": {"ysl"},
}

CATEGORY_PATTERNS = {
    "Amaderado": (
        "wood",
        "woody",
        "cedar",
        "sandalwood",
        "vetiver",
        "patchouli",
        "oud",
        "moss",
    ),
    "Cítrico": (
        "citrus",
        "lemon",
        "lime",
        "bergamot",
        "orange",
        "mandarin",
        "grapefruit",
        "yuzu",
    ),
    "Floral": (
        "floral",
        "flower",
        "rose",
        "jasmine",
        "tuberose",
        "violet",
        "iris",
        "orchid",
        "neroli",
    ),
    "Frutal": (
        "fruity",
        "fruit",
        "apple",
        "pear",
        "peach",
        "plum",
        "berry",
        "berries",
        "mango",
        "pineapple",
        "cherry",
        "melon",
        "coconut",
    ),
    "Oriental": (
        "amber",
        "balsamic",
        "resin",
        "incense",
        "labdanum",
        "myrrh",
        "benzoin",
        "oriental",
        "oud",
    ),
    "Gourmand": (
        "gourmand",
        "sweet",
        "vanilla",
        "caramel",
        "chocolate",
        "cacao",
        "coffee",
        "honey",
        "praline",
        "lactonic",
        "nutty",
        "tonka",
    ),
    "Especiado": (
        "spicy",
        "spice",
        "pepper",
        "cinnamon",
        "cardamom",
        "clove",
        "saffron",
        "nutmeg",
        "ginger",
    ),
    "Cuero": ("leather", "suede"),
    "Almizclado": ("musky", "musk"),
    "Verde": (
        "green",
        "aromatic",
        "herbal",
        "lavender",
        "mint",
        "grass",
        "leaf",
        "leaves",
        "fougere",
    ),
}

COMMON_TRANSLATIONS = {
    "amber": "ámbar",
    "ambergris": "ámbar gris",
    "apple": "manzana",
    "bergamot": "bergamota",
    "black currant": "grosella negra",
    "black pepper": "pimienta negra",
    "caramel": "caramelo",
    "cardamom": "cardamomo",
    "cedar": "cedro",
    "citruses": "cítricos",
    "coconut": "coco",
    "coffee": "café",
    "ginger": "jengibre",
    "grapefruit": "pomelo",
    "green apple": "manzana verde",
    "green notes": "notas verdes",
    "jasmine": "jazmín",
    "lavender": "lavanda",
    "leather": "cuero",
    "lemon": "limón",
    "lily of the valley": "lirio de los valles",
    "mandarin orange": "mandarina",
    "musk": "almizcle",
    "orange blossom": "flor de azahar",
    "patchouli": "pachulí",
    "pear": "pera",
    "pink pepper": "pimienta rosa",
    "rose": "rosa",
    "saffron": "azafrán",
    "sandalwood": "sándalo",
    "tonka bean": "haba tonka",
    "tuberose": "nardo",
    "vanilla": "vainilla",
    "vetiver": "vetiver",
    "violet": "violeta",
    "woody notes": "notas amaderadas",
}

VERIFIED_OVERRIDES = {
    "CK ONE ESSENCE UNISEX 100ML EDP CALVIN KLEIN": {
        "notas": [
            "Cítrico",
            "Verde",
            "Especiado",
            "Floral",
            "Amaderado",
            "Almizclado",
            "Oriental",
        ],
        "descripcion": (
            "Salida: té blanco, bergamota, naranja sanguina y pimienta negra. "
            "Corazón: té verde, menta y geranio. Fondo: almizcle, sándalo "
            "australiano, incienso y musgo."
        ),
        "sourceUrl": (
            "https://www.fragrantica.es/perfume/Calvin-Klein/"
            "CK-One-Essence-95956.html"
        ),
    }
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def canonical_name(value: object) -> str:
    text = re.sub(r"\b(?:19|20)\d{2}\b", " ", normalize(value))
    return re.sub(r"\s+", " ", text).strip()


def canonical_brand(value: object) -> str:
    brand = canonical_name(value)
    return BRAND_ALIASES.get(brand, brand)


def clean_note(value: object) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" .;,")


def parse_note_list(value: object) -> list[str]:
    text = clean_note(value)
    if not text or normalize(text) in {"unknown", "nan", "none"}:
        return []
    text = re.sub(r"\s+(?:and|y)\s+", ", ", text, flags=re.IGNORECASE)
    return [
        clean_note(note)
        for note in text.split(",")
        if clean_note(note)
        and normalize(clean_note(note)) not in {"unknown", "nan", "none"}
    ]


def parse_url_parts(url: object) -> tuple[str, str]:
    parts = urlparse(str(url or "")).path.strip("/").split("/")
    if len(parts) < 3:
        return "", ""
    brand = parts[-2].replace("-", " ")
    perfume = re.sub(r"-\d+\.html$", "", parts[-1]).replace("-", " ")
    return canonical_brand(brand), canonical_name(perfume)


def parse_description_pyramid(description: object) -> tuple[list[str], list[str], list[str]]:
    text = clean_note(description)
    patterns = [
        (
            r"top notes? (?:are|is) (.*?);",
            r"middle notes? (?:are|is) (.*?);",
            r"base notes? (?:are|is) (.*?)(?:\.|$)",
        ),
        (
            r"top notes? (?:include|contain) (.*?);",
            r"middle notes? (?:include|contain) (.*?);",
            r"base notes? (?:include|contain) (.*?)(?:\.|$)",
        ),
    ]
    for top_pattern, middle_pattern, base_pattern in patterns:
        top_match = re.search(top_pattern, text, re.IGNORECASE)
        middle_match = re.search(middle_pattern, text, re.IGNORECASE)
        base_match = re.search(base_pattern, text, re.IGNORECASE)
        if top_match or middle_match or base_match:
            return (
                parse_note_list(top_match.group(1) if top_match else ""),
                parse_note_list(middle_match.group(1) if middle_match else ""),
                parse_note_list(base_match.group(1) if base_match else ""),
            )
    return [], [], []


def parse_accords(value: object) -> list[str]:
    if isinstance(value, list):
        return [clean_note(item) for item in value if clean_note(item)]
    text = str(value or "").strip()
    if not text:
        return []
    try:
        parsed = ast.literal_eval(text)
        if isinstance(parsed, list):
            return [clean_note(item) for item in parsed if clean_note(item)]
    except (SyntaxError, ValueError):
        pass
    return parse_note_list(text)


def canonical_gender(value: object) -> str:
    text = canonical_name(value)
    tokens = set(text.split())
    if "unisex" in tokens or (
        tokens & {"women", "woman", "female", "femenino", "mujer"}
        and tokens & {"men", "man", "male", "masculino", "hombre"}
    ):
        return "unisex"
    if tokens & {"women", "woman", "female", "femenino", "mujer", "her"}:
        return "femenino"
    if tokens & {"men", "man", "male", "masculino", "hombre", "him"}:
        return "masculino"
    return ""


def detect_concentration(value: object) -> str:
    text = canonical_name(value)
    if re.search(r"\b(?:eau de toilette|edt)\b", text):
        return "edt"
    if re.search(r"\b(?:eau de cologne|edc|cologne)\b", text):
        return "edc"
    if re.search(r"\b(?:eau de parfum|edp)\b", text):
        return "edp"
    if re.search(r"\b(?:extrait|le parfum|parfum|perfume)\b", text):
        return "parfum"
    return ""


def parse_sheet_product(descriptor: str) -> tuple[str, str, str, str]:
    audience_match = AUDIENCE_PATTERN.search(descriptor)
    audience = canonical_gender(audience_match.group(0) if audience_match else "")
    if audience_match:
        product = descriptor[: audience_match.start()]
        after_audience = descriptor[audience_match.end() :]
    else:
        size_match = SIZE_PATTERN.search(descriptor)
        product = descriptor[: size_match.start()] if size_match else descriptor
        after_audience = descriptor

    type_match = TYPE_PATTERN.search(after_audience)
    brand = type_match.group(1) if type_match else ""
    brand = re.sub(
        r"^(?:EDP|EDT|EDC|PARFUM|PERFUME|PERFUM|EXTRAIT|ACEITE|OIL|"
        r"COLONIA)\s+",
        "",
        brand,
        flags=re.IGNORECASE,
    )
    brand = re.sub(r"^(?:\d+(?:[.,]\d+)?\s*ML\s*)+", "", brand)

    product_name = canonical_name(product)
    brand_name = canonical_brand(brand)
    concentration_match = re.search(
        r"\b(?:EDP|EDT|EDC|PARFUM|PERFUME|PERFUM|EXTRAIT|COLONIA)\b",
        after_audience,
        re.IGNORECASE,
    )
    concentration = detect_concentration(
        concentration_match.group(0) if concentration_match else ""
    )
    return (
        product_name.strip(),
        brand_name.strip(),
        audience,
        concentration,
    )


@lru_cache(maxsize=None)
def brand_surface_forms(brand: str) -> frozenset[str]:
    forms = {canonical_name(brand)}
    forms.update(
        alias
        for alias, canonical in BRAND_ALIASES.items()
        if canonical == canonical_name(brand)
    )
    forms.update(SHORT_BRAND_FORMS.get(canonical_name(brand), set()))
    return frozenset(form for form in forms if form)


@lru_cache(maxsize=None)
def strip_brand_phrases(name: str, brand: str) -> str:
    cleaned = f" {canonical_name(name)} "
    for form in sorted(brand_surface_forms(brand), key=len, reverse=True):
        cleaned = re.sub(
            rf"\s+(?:(?:de|by)\s+)?{re.escape(form)}(?=\s+)",
            " ",
            cleaned,
        )
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if brand == "dolce gabbana" and cleaned == "dolce k":
        return "k"
    return cleaned


@lru_cache(maxsize=None)
def name_variants(name: str, brand: str) -> frozenset[str]:
    base = canonical_name(name)
    without_brand = strip_brand_phrases(base, brand)
    variants = {without_brand or base}
    for value in list(variants):
        tokens = value.split()
        variants.add(
            " ".join(token for token in tokens if token not in GENERIC_NAME_WORDS)
        )
    return frozenset(
        re.sub(r"\s+", " ", variant).strip()
        for variant in variants
        if variant.strip()
    )


def similarity(left: str, right: str, brand: str) -> tuple[float, int]:
    best_score = 0.0
    best_shared = 0
    for left_variant in name_variants(left, brand):
        for right_variant in name_variants(right, brand):
            left_tokens = set(left_variant.split())
            right_tokens = set(right_variant.split())
            shared = len(left_tokens & right_tokens)
            union = max(1, len(left_tokens | right_tokens))
            smallest = max(1, min(len(left_tokens), len(right_tokens)))
            sequence = difflib.SequenceMatcher(None, left_variant, right_variant).ratio()
            containment = shared / smallest
            jaccard = shared / union
            score = max(sequence, 0.72 * containment + 0.28 * jaccard)
            if score > best_score:
                best_score = score
                best_shared = shared
    return best_score, best_shared


def meaningful_name(name: str) -> str:
    return " ".join(
        token for token in name.split() if token not in OPTIONAL_MATCH_WORDS
    )


def gender_markers(value: str) -> set[str]:
    return set(value.split()) & {
        "femme",
        "her",
        "him",
        "homme",
        "lady",
        "man",
        "men",
        "woman",
        "women",
    }


def is_safe_match(
    product_name: str,
    candidate_name: str,
    brand: str,
    sheet_audience: str,
    candidate_audience: str,
    sheet_concentration: str,
    candidate_concentration: str,
) -> bool:
    if (
        sheet_audience in {"femenino", "masculino"}
        and candidate_audience in {"femenino", "masculino"}
        and sheet_audience != candidate_audience
    ):
        return False
    if (
        sheet_audience == "unisex"
        and candidate_audience in {"femenino", "masculino"}
    ):
        return False
    if (
        sheet_concentration
        and candidate_concentration
        and sheet_concentration != candidate_concentration
    ):
        return False

    for product_variant in name_variants(product_name, brand):
        for candidate_variant in name_variants(candidate_name, brand):
            product_gender = gender_markers(product_variant)
            candidate_gender = gender_markers(candidate_variant)
            if (
                product_gender
                and candidate_gender
                and product_gender != candidate_gender
            ):
                continue

            product_meaningful = meaningful_name(product_variant)
            candidate_meaningful = meaningful_name(candidate_variant)
            if product_gender and not candidate_gender:
                product_meaningful = " ".join(
                    token
                    for token in product_meaningful.split()
                    if token not in product_gender
                )
            elif candidate_gender and not product_gender:
                candidate_meaningful = " ".join(
                    token
                    for token in candidate_meaningful.split()
                    if token not in candidate_gender
                )

            if not product_meaningful or not candidate_meaningful:
                continue
            if product_meaningful == candidate_meaningful:
                return True

            product_tokens = product_meaningful.split()
            candidate_tokens = candidate_meaningful.split()
            if len(product_tokens) != len(candidate_tokens):
                continue

            sequence = difflib.SequenceMatcher(
                None,
                product_meaningful,
                candidate_meaningful,
            ).ratio()
            shared = len(set(product_tokens) & set(candidate_tokens))
            required_shared = max(0, len(product_tokens) - 1)
            if sequence >= 0.92 and shared >= required_shared:
                return True
    return False


def hash_key(value: str) -> str:
    digest = hashlib.sha256(normalize(value).encode("utf-8")).hexdigest()
    return digest[:10]


def slugify(value: str) -> str:
    slug = normalize(value).replace(" ", "_")
    slug = slug[:88].strip("_")
    return f"{slug}_{hash_key(value)}"


def classify_categories(accords: list[str], all_notes: list[str]) -> list[str]:
    searchable = normalize(" ".join([*accords, *all_notes]))
    categories = []
    for category in STANDARD_NOTES:
        if any(keyword in searchable for keyword in CATEGORY_PATTERNS[category]):
            categories.append(category)
    return categories


def build_translation_map(notes_path: Path) -> dict[str, str]:
    translations = dict(COMMON_TRANSLATIONS)
    with notes_path.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="|"):
            source = normalize(row.get("name"))
            target = clean_note(row.get("note_name_es"))
            if source and target:
                translations[source] = target
    return translations


def translate_note(note: str, translations: dict[str, str]) -> str:
    key = normalize(note)
    translated = translations.get(key)
    if translated:
        return translated.lower()
    return clean_note(note).lower()


def format_note_group(notes: list[str], translations: dict[str, str]) -> str:
    translated = []
    for note in notes:
        value = translate_note(note, translations)
        if value and value not in translated:
            translated.append(value)
        if len(translated) == 4:
            break
    if not translated:
        return "no detallada"
    if len(translated) == 1:
        return translated[0]
    return ", ".join(translated[:-1]) + f" y {translated[-1]}"


def build_description(
    top: list[str],
    middle: list[str],
    base: list[str],
    accords: list[str],
    translations: dict[str, str],
) -> str:
    if top or middle or base:
        return (
            f"Salida: {format_note_group(top, translations)}. "
            f"Corazón: {format_note_group(middle, translations)}. "
            f"Fondo: {format_note_group(base, translations)}."
        )[:300]
    accord_text = [
        clean_note(accord).lower()
        for accord in accords[:4]
        if clean_note(accord)
    ]
    if accord_text:
        return (
            "Perfil dominado por acordes "
            + ", ".join(accord_text)
            + "; la ficha consultada no separa salida, corazón y fondo."
        )[:300]
    return (
        "La ficha consultada identifica la fragancia, pero no publica una "
        "pirámide olfativa estructurada."
    )


def load_dataset(clean_path: Path, full_path: Path) -> dict[tuple[str, str], dict]:
    records: dict[tuple[str, str], dict] = {}

    with full_path.open("r", encoding="latin1", newline="") as handle:
        for row in csv.DictReader(handle):
            brand, perfume = parse_url_parts(row.get("url"))
            if not brand or not perfume:
                continue
            top, middle, base = parse_description_pyramid(row.get("Description"))
            records[(brand, perfume)] = {
                "brand": brand,
                "name": perfume,
                "url": row.get("url", ""),
                "audience": canonical_gender(row.get("Gender")),
                "concentration": detect_concentration(perfume),
                "accords": parse_accords(row.get("Main Accords")),
                "top": top,
                "middle": middle,
                "base": base,
                "dataset": "fragrantica-full",
            }

    with clean_path.open("r", encoding="cp1252", newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            brand = canonical_brand(row.get("Brand"))
            perfume = canonical_name(row.get("Perfume"))
            if not brand or not perfume:
                continue
            records[(brand, perfume)] = {
                "brand": brand,
                "name": perfume,
                "url": row.get("url", ""),
                "audience": canonical_gender(row.get("Gender")),
                "concentration": detect_concentration(perfume),
                "accords": [
                    clean_note(row.get(f"mainaccord{index}"))
                    for index in range(1, 6)
                    if clean_note(row.get(f"mainaccord{index}"))
                ],
                "top": parse_note_list(row.get("Top")),
                "middle": parse_note_list(row.get("Middle")),
                "base": parse_note_list(row.get("Base")),
                "dataset": "fragrantica-pyramid",
            }
    return records


def load_sheet_rows(sheet_path: Path) -> list[dict]:
    if not sheet_path.exists():
        urllib.request.urlretrieve(SHEET_URL, sheet_path)
    with sheet_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        headers = next(reader)
        rows = []
        for source_order, values in enumerate(reader):
            descriptor = values[0] if values else ""
            price_text = values[-1] if values else ""
            price_digits = re.sub(r"[^\d]", "", price_text)
            price = int(price_digits) if price_digits else 0
            if descriptor.strip() and price > 0:
                rows.append(
                    {
                        "sourceOrder": source_order,
                        "descriptor": descriptor.strip(),
                        "price": price,
                    }
                )
    return rows


def main() -> int:
    if len(sys.argv) != 7:
        raise SystemExit(
            "Usage: build_fragrantica_enrichment.py CLEAN_CSV FULL_CSV "
            "NOTES_CSV SHEET_CSV CATALOG_AUDIT_JSON OUTPUT_DIR"
        )

    clean_path = Path(sys.argv[1])
    full_path = Path(sys.argv[2])
    notes_path = Path(sys.argv[3])
    sheet_path = Path(sys.argv[4])
    catalog_audit_path = Path(sys.argv[5])
    output_dir = Path(sys.argv[6])
    output_dir.mkdir(parents=True, exist_ok=True)

    translations = build_translation_map(notes_path)
    records = load_dataset(clean_path, full_path)
    by_brand: dict[str, list[dict]] = defaultdict(list)
    for (brand, _), record in records.items():
        by_brand[brand].append(record)

    sheet_rows = load_sheet_rows(sheet_path)
    catalog_audit = json.loads(catalog_audit_path.read_text(encoding="utf-8"))
    image_by_descriptor = {
        normalize(item["descriptor"]): item.get("image")
        for item in catalog_audit["products"]
        if item.get("image")
    }

    object_rows: dict[str, dict] = {}
    audit_rows = []
    image_plan = []

    for row in sheet_rows:
        descriptor = row["descriptor"]
        if descriptor in object_rows:
            continue

        product_name, brand, audience, concentration = parse_sheet_product(descriptor)
        non_perfume = bool(NON_PERFUME_PATTERN.search(descriptor))
        best_record = None
        best_score = 0.0
        best_shared = 0
        best_rank = -1.0

        if not non_perfume and brand in by_brand:
            for candidate in by_brand[brand]:
                score, shared = similarity(product_name, candidate["name"], brand)
                metadata_bonus = 0.0
                if concentration and candidate["concentration"] == concentration:
                    metadata_bonus += 0.35
                if audience and candidate["audience"] == audience:
                    metadata_bonus += 0.05
                rank = score + metadata_bonus
                if (
                    rank > best_rank
                    and is_safe_match(
                        product_name,
                        candidate["name"],
                        brand,
                        audience,
                        candidate["audience"],
                        concentration,
                        candidate["concentration"],
                    )
                ):
                    best_record = candidate
                    best_score = score
                    best_shared = shared
                    best_rank = rank

        source_image = image_by_descriptor.get(normalize(descriptor))
        image_name = f"{slugify(descriptor)}.webp"
        fallback_image = f"img/perfumes/{image_name}"
        image_plan.append(
            {
                "descriptor": descriptor,
                "target": fallback_image,
                "source": source_image,
            }
        )

        if best_record:
            all_notes = [
                *best_record["top"],
                *best_record["middle"],
                *best_record["base"],
            ]
            categories = classify_categories(best_record["accords"], all_notes)
            description = build_description(
                best_record["top"],
                best_record["middle"],
                best_record["base"],
                best_record["accords"],
                translations,
            )
            match_status = "matched"
        elif non_perfume:
            categories = []
            description = (
                "Registro comercial de estuche, miniatura o cuidado corporal; "
                "no corresponde a una ficha individual de perfume en Fragrantica."
            )
            match_status = "not-an-individual-perfume"
        else:
            categories = []
            description = (
                "Sin ficha individual verificable en el conjunto de Fragrantica "
                "consultado; no se asigna una pirámide para evitar datos inventados."
            )
            match_status = "unmatched"

        verified_override = VERIFIED_OVERRIDES.get(descriptor)
        if verified_override:
            categories = verified_override["notas"]
            description = verified_override["descripcion"]
            match_status = "matched"

        object_rows[descriptor] = {
            "notas": categories,
            "fallbackImg": fallback_image,
            "descripcion": description,
        }
        audit_rows.append(
            {
                "descriptor": descriptor,
                "parsedProduct": product_name,
                "parsedBrand": brand,
                "parsedAudience": audience,
                "parsedConcentration": concentration,
                "status": match_status,
                "score": round(best_score, 4) if best_record else 0,
                "matchedBrand": best_record["brand"] if best_record else None,
                "matchedPerfume": best_record["name"] if best_record else None,
                "matchedAudience": best_record["audience"] if best_record else None,
                "matchedConcentration": (
                    best_record["concentration"] if best_record else None
                ),
                "sourceUrl": (
                    verified_override["sourceUrl"]
                    if verified_override
                    else best_record["url"] if best_record else None
                ),
                "dataset": (
                    "fragrantica-es-direct"
                    if verified_override
                    else best_record["dataset"] if best_record else None
                ),
            }
        )

    summary = {
        "sheetProductRows": len(sheet_rows),
        "uniqueKeys": len(object_rows),
        "matched": sum(row["status"] == "matched" for row in audit_rows),
        "unmatched": sum(row["status"] == "unmatched" for row in audit_rows),
        "nonIndividualProducts": sum(
            row["status"] == "not-an-individual-perfume" for row in audit_rows
        ),
        "pyramidMatches": sum(
            row.get("dataset") == "fragrantica-pyramid" for row in audit_rows
        ),
        "fullDatasetMatches": sum(
            row.get("dataset") == "fragrantica-full" for row in audit_rows
        ),
    }

    output_lines = [
        "/**",
        " * ARCHIVUM PARFUMS - DICTIONARY ENGINE (FRAGRANTICA REAL DATA)",
        " * Diccionario de enriquecimiento de datos para el inventario dinámico.",
        " * Mapeo uno por uno sin omisiones.",
        " */",
        "const fragranticaEnrichment = {",
    ]
    entries = list(object_rows.items())
    for index, (descriptor, enrichment) in enumerate(entries):
        comma = "," if index < len(entries) - 1 else ""
        output_lines.append(f"  {json.dumps(descriptor, ensure_ascii=False)}: {{")
        output_lines.append(
            "    notas: "
            + json.dumps(enrichment["notas"], ensure_ascii=False)
            + ","
        )
        output_lines.append(
            "    fallbackImg: "
            + json.dumps(enrichment["fallbackImg"], ensure_ascii=False)
            + ","
        )
        output_lines.append(
            "    descripcion: "
            + json.dumps(enrichment["descripcion"], ensure_ascii=False)
        )
        output_lines.append(f"  }}{comma}")
    output_lines.append("};")
    output_lines.append("")

    (output_dir / "fragrantica-enrichment.js").write_text(
        "\n".join(output_lines),
        encoding="utf-8",
    )
    (output_dir / "fragrantica-enrichment-audit.json").write_text(
        json.dumps({"summary": summary, "products": audit_rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "fragrantica-image-plan.json").write_text(
        json.dumps(image_plan, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
