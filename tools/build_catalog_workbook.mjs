import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const sourceCsvPath = path.join(
  process.env.TEMP,
  "sheet.csv"
);
const auditPath = path.join(
  projectRoot,
  "data",
  "audits",
  "fragrantica-enrichment-audit.json"
);
const enrichmentPath = path.join(
  projectRoot,
  "js",
  "fragrantica-enrichment.js"
);
const outputDir = path.join(projectRoot, "docs");
const outputPath = path.join(outputDir, "catalogo_archivum_legible.xlsx");
const previewDir = path.join(projectRoot, "docs", "previews");

const PALETTE = {
  ink: "#25231F",
  primary: "#4A3525",
  primaryDark: "#302219",
  gold: "#B88945",
  cream: "#F7F2E9",
  creamStrong: "#EDE2D1",
  white: "#FFFFFF",
  line: "#D9CDBD",
  green: "#DDEBDD",
  greenText: "#285A35",
  amber: "#FFF0CF",
  amberText: "#805A16",
  gray: "#ECEAE6",
  grayText: "#5B5750",
  red: "#F6DEDA",
  redText: "#7B342C",
};

const BRAND_ALIASES = new Map(
  Object.entries({
    "abercrombie fitch": "Abercrombie & Fitch",
    "abercrombie and fitch": "Abercrombie & Fitch",
    "al haramain perfumes": "Al Haramain",
    "animale parliux": "Animale",
    "antonnio banderas": "Antonio Banderas",
    "armani": "Giorgio Armani",
    "beneton": "Benetton",
    "bueberry": "Burberry",
    "bvlgary": "Bvlgari",
    "cristiano rolando": "Cristiano Ronaldo",
    "dkny": "Donna Karan",
    "dolce and gababana": "Dolce & Gabbana",
    "dolce and gabanna": "Dolce & Gabbana",
    "dolce and gabbana": "Dolce & Gabbana",
    "dolce and gabbbana": "Dolce & Gabbana",
    "dolce gabbana": "Dolce & Gabbana",
    "guerlainb": "Guerlain",
    "gulf orquid": "Gulf Orchid",
    "jean paul": "Jean Paul Gaultier",
    "lataffa": "Lattafa",
    "maison al hambra": "Maison Alhambra",
    "marciso rodriguez": "Narciso Rodriguez",
    "mast perfums": "Mast Perfumes",
    "mont blanc": "Montblanc",
    "rayhann": "Rayhaan",
    "roja perfumes": "Roja Dove",
    "roja perfums": "Roja Dove",
    "victoria s": "Victoria's Secret",
    "victoria s secret": "Victoria's Secret",
    "victoria secret": "Victoria's Secret",
    "viktor and rolf": "Viktor & Rolf",
    "yves sint laurent": "Yves Saint Laurent",
  })
);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleCase(value) {
  const smallWords = new Set(["de", "del", "la", "las", "el", "los", "y"]);
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && smallWords.has(word)) {
        return word;
      }
      if (/^(edp|edt|edc|ck|ch|dkny|ysl|oud|nº|no\.)$/i.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function displayProduct(descriptor) {
  const cleaned = String(descriptor || "").replace(/^\.+/, "").trim();
  const audience = cleaned.match(
    /\b(?:UNISEX|UNSIEX|MUJER(?:ES)?|HOMBRE(?:S)?|MASCULINO|FEMENINO|NIÑ(?:O|OS|A|AS)|INFANTIL)\b/i
  );
  const size = cleaned.match(/\b\d+(?:[.,]\d+)?\s*ML\b/i);
  const boundary = audience?.index ?? size?.index ?? cleaned.length;
  return titleCase(cleaned.slice(0, boundary));
}

function displayAudience(value) {
  if (value === "masculino") return "Hombre";
  if (value === "femenino") return "Mujer";
  return "Unisex";
}

function displayConcentration(descriptor, parsedValue) {
  const match = String(descriptor).match(
    /\b(EDP|EDT|EDC|PARFUM|PERFUME|PERFUM|EXTRAIT|ACEITE|OIL|COLONIA)\b/i
  );
  if (match) {
    const normalized = match[1].toUpperCase();
    if (["PERFUME", "PERFUM", "EXTRAIT"].includes(normalized)) return "Parfum";
    if (["ACEITE", "OIL"].includes(normalized)) return "Aceite";
    if (normalized === "COLONIA") return "Colonia";
    return normalized;
  }
  return parsedValue ? parsedValue.toUpperCase() : "No indicada";
}

function displayPresentation(descriptor) {
  const sizes = [
    ...String(descriptor).matchAll(/\b(\d+(?:[.,]\d+)?)\s*ML\b/gi),
  ].map((match) => `${match[1].replace(",", ".")} ml`);
  const pieces = String(descriptor).match(/\b(\d+)\s*PZS?\b/i);
  const values = [...new Set(sizes)];
  if (pieces) values.unshift(`${pieces[1]} pzs.`);
  return values.join(" + ") || "No indicada";
}

function productType(descriptor, status) {
  const text = String(descriptor).trim().toUpperCase();
  if (status !== "not-an-individual-perfume") return "Perfume";
  if (text.startsWith("ESTUCHE")) return "Estuche";
  if (text.startsWith("MINI")) return "Miniatura";
  if (text.startsWith("SPLASH")) return "Splash";
  if (text.startsWith("CREMA")) return "Cuidado corporal";
  if (text.startsWith("SHOWER") || text.startsWith("GEL")) return "Baño";
  if (text.startsWith("ATOMIZADOR") || text.startsWith("DECANT")) return "Formato de viaje";
  if (text.startsWith("HAIR")) return "Cuidado capilar";
  return "Set / complemento";
}

function verificationLabel(status) {
  if (status === "matched") return "Ficha verificada";
  if (status === "not-an-individual-perfume") return "No aplica";
  return "Pendiente";
}

function canonicalBrand(value) {
  const normalized = normalize(value);
  return BRAND_ALIASES.get(normalized) || titleCase(value);
}

function resolveBrand(descriptor, auditItem, knownBrandForms) {
  const normalizedDescriptor = ` ${normalize(descriptor)} `;
  const matches = knownBrandForms
    .filter((item) => normalizedDescriptor.includes(` ${item.form} `))
    .map((item) => ({
      ...item,
      index: normalizedDescriptor.indexOf(` ${item.form} `),
    }))
    .sort((left, right) => {
      return right.index - left.index || right.form.length - left.form.length;
    });

  if (matches[0]) {
    return matches[0].display;
  }

  const parsedBrand = normalize(auditItem.parsedBrand);
  const parsedBrandLooksInvalid =
    !parsedBrand ||
    parsedBrand.length > 40 ||
    /\b(?:ml|edp|edt|edc|pzs|gel|crema|after|shave|atomizador|cosmetiquera|nuevo|variedad)\b/.test(
      parsedBrand
    );
  return parsedBrandLooksInvalid
    ? "Marca no indicada"
    : canonicalBrand(auditItem.parsedBrand);
}

function duplicateLabel(count) {
  return count > 1 ? `Repetido ${count} veces` : "Único";
}

function setColumnWidths(sheet, columns) {
  for (const [column, width] of Object.entries(columns)) {
    sheet.getRange(`${column}:${column}`).format.columnWidthPx = width;
  }
}

function styleTitle(sheet, range, fontSize = 20) {
  range.format.fill = PALETTE.primaryDark;
  range.format.font = {
    bold: true,
    color: PALETTE.white,
    size: fontSize,
  };
  range.format.horizontalAlignment = "center";
  range.format.verticalAlignment = "center";
}

function styleSubtitle(range) {
  range.format.fill = PALETTE.creamStrong;
  range.format.font = {
    color: PALETTE.primary,
    italic: true,
    size: 10,
  };
  range.format.horizontalAlignment = "center";
  range.format.verticalAlignment = "center";
}

function styleTableHeader(range) {
  range.format.fill = PALETTE.primary;
  range.format.font = {
    bold: true,
    color: PALETTE.white,
    size: 10,
  };
  range.format.horizontalAlignment = "center";
  range.format.verticalAlignment = "center";
  range.format.wrapText = true;
  range.format.borders = {
    preset: "all",
    style: "thin",
    color: PALETTE.primaryDark,
  };
}

function styleBody(range) {
  range.format.font = {
    color: PALETTE.ink,
    size: 9,
  };
  range.format.verticalAlignment = "center";
  range.format.borders = {
    preset: "all",
    style: "thin",
    color: PALETTE.line,
  };
}

function toTsv(matrix) {
  return matrix
    .map((row) => {
      return row
        .map((value) => {
          return String(value ?? "")
            .replace(/\t/g, " ")
            .replace(/\r?\n/g, " ");
        })
        .join("\t");
    })
    .join("\n");
}

async function loadEnrichment() {
  const source = await fs.readFile(enrichmentPath, "utf8");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${source}\nglobalThis.__enrichment = fragranticaEnrichment;`,
    context
  );
  return context.__enrichment;
}

async function main() {
  const [csvText, auditText, enrichment] = await Promise.all([
    fs.readFile(sourceCsvPath, "utf8"),
    fs.readFile(auditPath, "utf8"),
    loadEnrichment(),
  ]);
  const sourceWorkbook = await Workbook.fromCSV(csvText, {
    sheetName: "Origen",
  });
  const sourceValues = sourceWorkbook
    .worksheets
    .getItem("Origen")
    .getUsedRange(true)
    .values;
  const audit = JSON.parse(auditText);
  const auditByDescriptor = new Map(
    audit.products.map((item) => [item.descriptor, item])
  );
  const knownBrandForms = [];
  const seenBrandForms = new Set();
  for (const item of audit.products) {
    const normalizedBrand = normalize(item.parsedBrand);
    if (
      item.status === "not-an-individual-perfume" ||
      !item.parsedBrand ||
      item.parsedBrand.length > 40 ||
      normalizedBrand.split(" ").length > 5 ||
      /\b(?:ml|edp|edt|edc|pzs|gel|crema|after|shave|atomizador|cosmetiquera|nuevo|variedad)\b/.test(
        normalizedBrand
      )
    ) {
      continue;
    }
    const canonical = canonicalBrand(item.parsedBrand);
    const forms = [
      normalize(item.parsedBrand),
      ...[...BRAND_ALIASES.entries()]
        .filter(([, display]) => display === canonical)
        .map(([form]) => form),
    ];
    for (const form of forms) {
      if (!form || seenBrandForms.has(`${form}|${canonical}`)) continue;
      seenBrandForms.add(`${form}|${canonical}`);
      knownBrandForms.push({ form, display: canonical });
    }
  }

  const rawRows = sourceValues
    .slice(1)
    .map((row, sourceIndex) => ({
      descriptor: String(row[0] || "").trim(),
      price: Number(String(row[8] || "").replace(/[^\d]/g, "")) || 0,
      sourceOrder: sourceIndex + 1,
    }))
    .filter((row) => row.descriptor && row.price > 0);

  const duplicateCounts = new Map();
  for (const row of rawRows) {
    duplicateCounts.set(
      row.descriptor,
      (duplicateCounts.get(row.descriptor) || 0) + 1
    );
  }

  const rows = rawRows
    .map((row, index) => {
      const auditItem = auditByDescriptor.get(row.descriptor) || {};
      const detail = enrichment[row.descriptor] || {};
      const brand = resolveBrand(
        row.descriptor,
        auditItem,
        knownBrandForms
      );
      return {
        id: `AP-${String(index + 1).padStart(4, "0")}`,
        perfume: displayProduct(row.descriptor),
        brand,
        audience: displayAudience(auditItem.parsedAudience),
        presentation: displayPresentation(row.descriptor),
        concentration: displayConcentration(
          row.descriptor,
          auditItem.parsedConcentration
        ),
        notes: Array.isArray(detail.notas) ? detail.notas.join(" · ") : "",
        price: row.price,
        type: productType(row.descriptor, auditItem.status),
        verification: verificationLabel(auditItem.status),
        descriptor: row.descriptor,
        description: detail.descripcion || "",
        image: detail.fallbackImg || "",
        sourceUrl: auditItem.sourceUrl || "",
        sourceOrder: row.sourceOrder,
        duplicate: duplicateLabel(duplicateCounts.get(row.descriptor) || 1),
      };
    })
    .sort((left, right) => {
      return (
        left.brand.localeCompare(right.brand, "es") ||
        left.perfume.localeCompare(right.perfume, "es") ||
        left.presentation.localeCompare(right.presentation, "es")
      );
    });

  const uniqueBrands = new Set(rows.map((row) => row.brand));
  const verifiedCount = rows.filter(
    (row) => row.verification === "Ficha verificada"
  ).length;
  const pendingCount = rows.filter(
    (row) => row.verification === "Pendiente"
  ).length;
  const nonPerfumeCount = rows.filter((row) => row.type !== "Perfume").length;
  const uniqueDescriptorCount = new Set(rows.map((row) => row.descriptor)).size;

  const audienceCounts = ["Hombre", "Mujer", "Unisex"].map((audience) => [
    audience,
    rows.filter((row) => row.audience === audience).length,
  ]);
  const brandCounts = [...uniqueBrands]
    .map((brand) => [
      brand,
      rows.filter((row) => row.brand === brand).length,
    ])
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10);

  const workbook = Workbook.create();
  const catalog = workbook.worksheets.add("CATÁLOGO");
  const summary = workbook.worksheets.add("RESUMEN");
  const technical = workbook.worksheets.add("DATOS TÉCNICOS");

  catalog.showGridLines = false;
  catalog.mergeCells("A1:M1");
  catalog.mergeCells("A2:M2");
  catalog.mergeCells("A3:M3");
  catalog.getRange("A1").values = [
    ["ARCHIVUM PARFUMS | CATÁLOGO MAYORISTA"],
  ];
  catalog.getRange("A2").values = [
    [
      "Inventario organizado para lectura, búsqueda y filtros. Precios expresados en colones costarricenses.",
    ],
  ];
  catalog.getRange("A3").values = [
    [
      "Consejo: filtrá por marca, público, concentración o estado de ficha desde los encabezados.",
    ],
  ];
  styleTitle(catalog, catalog.getRange("A1:M1"), 20);
  styleSubtitle(catalog.getRange("A2:M2"));
  catalog.getRange("A3:M3").format.fill = PALETTE.cream;
  catalog.getRange("A3:M3").format.font = {
    color: PALETTE.grayText,
    size: 9,
  };
  catalog.getRange("A3:M3").format.horizontalAlignment = "center";
  catalog.getRange("A1:M1").format.rowHeightPx = 42;
  catalog.getRange("A2:M2").format.rowHeightPx = 28;
  catalog.getRange("A3:M3").format.rowHeightPx = 25;

  const catalogHeaders = [
    "Código",
    "Perfume",
    "Marca",
    "Público",
    "Presentación",
    "Concentración",
    "Notas principales",
    "Precio mayorista",
    "Tipo",
    "Estado de ficha",
    "Descripción",
    "Imagen",
    "Nombre original exacto",
  ];
  catalog.getRange("A4:M4").values = [catalogHeaders];
  styleTableHeader(catalog.getRange("A4:M4"));
  catalog.getRange("A4:M4").format.rowHeightPx = 35;

  const catalogData = rows.map((row) => [
    row.id,
    row.perfume,
    row.brand,
    row.audience,
    row.presentation,
    row.concentration,
    row.notes || "Sin clasificar",
    row.price,
    row.type,
    row.verification,
    row.description,
    row.image,
    row.descriptor,
  ]);
  const catalogEndRow = catalogData.length + 4;
  catalog.getRange(`A5:M${catalogEndRow}`).values = catalogData;
  styleBody(catalog.getRange(`A5:M${catalogEndRow}`));
  catalog.getRange(`B5:C${catalogEndRow}`).format.font = {
    color: PALETTE.ink,
    size: 9,
  };
  catalog.getRange(`B5:B${catalogEndRow}`).format.font = {
    bold: true,
    color: PALETTE.primaryDark,
    size: 9,
  };
  catalog.getRange(`D5:F${catalogEndRow}`).format.horizontalAlignment = "center";
  catalog.getRange(`H5:J${catalogEndRow}`).format.horizontalAlignment = "center";
  catalog.getRange(`G5:G${catalogEndRow}`).format.wrapText = true;
  catalog.getRange(`K5:M${catalogEndRow}`).format.wrapText = true;
  catalog.getRange(`A5:M${catalogEndRow}`).format.rowHeightPx = 30;
  setColumnWidths(catalog, {
    A: 82,
    B: 230,
    C: 165,
    D: 90,
    E: 115,
    F: 105,
    G: 265,
    H: 125,
    I: 125,
    J: 130,
    K: 390,
    L: 330,
    M: 390,
  });
  catalog.freezePanes.freezeRows(4);
  catalog.freezePanes.freezeColumns(2);
  const catalogTable = catalog.tables.add(
    `A4:M${catalogEndRow}`,
    true,
    "CatalogoArchivum"
  );
  catalogTable.style = "TableStyleMedium2";
  catalogTable.showFilterButton = true;
  catalogTable.showBandedRows = true;
  catalog.getRange(`H5:H${catalogEndRow}`).format.numberFormat = "#,##0";

  catalog.getRange(`D5:D${catalogEndRow}`).dataValidation = {
    rule: { type: "list", values: ["Hombre", "Mujer", "Unisex"] },
  };
  catalog.getRange(`F5:F${catalogEndRow}`).dataValidation = {
    rule: {
      type: "list",
      values: ["EDP", "EDT", "EDC", "Parfum", "Aceite", "Colonia", "No indicada"],
    },
  };
  catalog.getRange(`J5:J${catalogEndRow}`).dataValidation = {
    rule: {
      type: "list",
      values: ["Ficha verificada", "Pendiente", "No aplica"],
    },
  };
  catalog
    .getRange(`J5:J${catalogEndRow}`)
    .conditionalFormats
    .add("containsText", {
      text: "Ficha verificada",
      format: {
        fill: PALETTE.green,
        font: { color: PALETTE.greenText, bold: true },
      },
    });
  catalog
    .getRange(`J5:J${catalogEndRow}`)
    .conditionalFormats
    .add("containsText", {
      text: "Pendiente",
      format: {
        fill: PALETTE.amber,
        font: { color: PALETTE.amberText, bold: true },
      },
    });
  catalog
    .getRange(`J5:J${catalogEndRow}`)
    .conditionalFormats
    .add("containsText", {
      text: "No aplica",
      format: {
        fill: PALETTE.gray,
        font: { color: PALETTE.grayText },
      },
    });

  technical.showGridLines = false;
  technical.mergeCells("A1:H1");
  technical.mergeCells("A2:H2");
  technical.getRange("A1").values = [
    ["DATOS TÉCNICOS Y TRAZABILIDAD"],
  ];
  technical.getRange("A2").values = [
    [
      "Esta pestaña conserva el texto original, la descripción olfativa, la ruta de imagen y la fuente de verificación.",
    ],
  ];
  styleTitle(technical, technical.getRange("A1:H1"), 18);
  styleSubtitle(technical.getRange("A2:H2"));
  technical.getRange("A1:H1").format.rowHeightPx = 38;
  technical.getRange("A2:H2").format.rowHeightPx = 28;
  const technicalHeaders = [
    "Código",
    "Nombre original exacto",
    "Descripción olfativa",
    "Ruta de imagen",
    "Fuente",
    "Orden original",
    "Control de duplicado",
    "Estado de ficha",
  ];
  technical.getRange("A4:H4").values = [technicalHeaders];
  styleTableHeader(technical.getRange("A4:H4"));
  technical.getRange("A4:H4").format.rowHeightPx = 35;
  const technicalData = rows.map((row) => [
    row.id,
    row.descriptor,
    row.description,
    row.image,
    row.sourceUrl,
    row.sourceOrder,
    row.duplicate,
    row.verification,
  ]);
  const technicalEndRow = technicalData.length + 4;
  technical.getRange(`A5:H${technicalEndRow}`).values = technicalData;
  styleBody(technical.getRange(`A5:H${technicalEndRow}`));
  technical.getRange(`B5:E${technicalEndRow}`).format.wrapText = true;
  technical.getRange(`F5:H${technicalEndRow}`).format.horizontalAlignment = "center";
  technical.getRange(`A5:H${technicalEndRow}`).format.rowHeightPx = 42;
  setColumnWidths(technical, {
    A: 82,
    B: 360,
    C: 420,
    D: 340,
    E: 360,
    F: 100,
    G: 140,
    H: 130,
  });
  technical.freezePanes.freezeRows(4);
  technical.freezePanes.freezeColumns(2);
  const technicalTable = technical.tables.add(
    `A4:H${technicalEndRow}`,
    true,
    "DatosTecnicosArchivum"
  );
  technicalTable.style = "TableStyleMedium2";
  technicalTable.showFilterButton = true;
  technicalTable.showBandedRows = true;
  technical
    .getRange(`G5:G${technicalEndRow}`)
    .conditionalFormats
    .add("beginsWith", {
      text: "Repetido",
      format: {
        fill: PALETTE.red,
        font: { color: PALETTE.redText, bold: true },
      },
    });

  summary.showGridLines = false;
  summary.mergeCells("A1:H1");
  summary.mergeCells("A2:H2");
  summary.getRange("A1").values = [
    ["RESUMEN DEL INVENTARIO"],
  ];
  summary.getRange("A2").values = [
    ["Corte de datos: 14 de junio de 2026 · Archivum Parfums"],
  ];
  styleTitle(summary, summary.getRange("A1:H1"), 20);
  styleSubtitle(summary.getRange("A2:H2"));
  summary.getRange("A1:H1").format.rowHeightPx = 42;
  summary.getRange("A2:H2").format.rowHeightPx = 28;
  for (const range of ["A4:B4", "C4:D4", "E4:F4", "G4:H4"]) {
    summary.mergeCells(range);
  }
  for (const range of ["A5:B5", "C5:D5", "E5:F5", "G5:H5"]) {
    summary.mergeCells(range);
  }
  summary.getRange("A4").values = [["Presentaciones"]];
  summary.getRange("C4").values = [["Perfumes únicos"]];
  summary.getRange("E4").values = [["Marcas"]];
  summary.getRange("G4").values = [["Precio promedio"]];
  summary.getRange("A5").values = [[rows.length]];
  summary.getRange("C5").values = [[uniqueDescriptorCount]];
  summary.getRange("E5").values = [[uniqueBrands.size]];
  const averagePrice = Math.round(
    rows.reduce((sum, row) => sum + row.price, 0) / rows.length
  );
  summary.getRange("G5").values = [[
    `₡${averagePrice.toLocaleString("es-CR")}`,
  ]];
  summary.getRange("A4:H4").format.fill = PALETTE.primary;
  summary.getRange("A4:H4").format.font = {
    bold: true,
    color: PALETTE.white,
    size: 10,
  };
  summary.getRange("A4:H4").format.horizontalAlignment = "center";
  summary.getRange("A4:H4").format.verticalAlignment = "center";
  summary.getRange("A4:H4").format.borders = {
    preset: "all",
    style: "thin",
    color: PALETTE.gold,
  };
  summary.getRange("A5:H5").format.fill = PALETTE.creamStrong;
  summary.getRange("A5:H5").format.font = {
    bold: true,
    color: PALETTE.primaryDark,
    size: 15,
  };
  summary.getRange("A5:H5").format.horizontalAlignment = "center";
  summary.getRange("A5:H5").format.verticalAlignment = "center";
  summary.getRange("A5:H5").format.borders = {
    preset: "all",
    style: "thin",
    color: PALETTE.gold,
  };
  summary.getRange("A4:H4").format.rowHeightPx = 28;
  summary.getRange("A5:H5").format.rowHeightPx = 38;

  summary.getRange("A8:D8").values = [
    ["Estado de datos", "Cantidad", "Tipo de producto", "Cantidad"],
  ];
  styleTableHeader(summary.getRange("A8:D8"));
  summary.getRange("A9:D11").values = [
    ["Ficha verificada", verifiedCount, "Perfumes", rows.length - nonPerfumeCount],
    ["Pendiente", pendingCount, "Otros formatos", nonPerfumeCount],
    ["No aplica", rows.length - verifiedCount - pendingCount, "", ""],
  ];
  styleBody(summary.getRange("A9:D11"));
  summary.getRange("B9:B11").format.numberFormat = "#,##0";
  summary.getRange("D9:D11").format.numberFormat = "#,##0";

  summary.getRange("F8:G8").values = [["Público", "Cantidad"]];
  styleTableHeader(summary.getRange("F8:G8"));
  summary.getRange("F9:G11").values = audienceCounts;
  styleBody(summary.getRange("F9:G11"));
  summary.getRange("G9:G11").format.numberFormat = "#,##0";

  summary.getRange("A14:B14").values = [["Top 10 marcas", "Presentaciones"]];
  styleTableHeader(summary.getRange("A14:B14"));
  summary.getRange("A15:B24").values = brandCounts;
  styleBody(summary.getRange("A15:B24"));
  summary.getRange("B15:B24").format.numberFormat = "#,##0";
  setColumnWidths(summary, {
    A: 185,
    B: 110,
    C: 165,
    D: 110,
    E: 120,
    F: 120,
    G: 110,
    H: 130,
  });
  const chart = summary.charts.add("bar", summary.getRange("A14:B24"));
  chart.setPosition("D14", "H29");
  chart.title = "Marcas con más presentaciones";
  chart.hasLegend = false;
  chart.xAxis = { axisType: "textAxis" };
  chart.yAxis = { numberFormatCode: "#,##0" };
  summary.freezePanes.freezeRows(2);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(previewDir, { recursive: true });
  const catalogPasteMatrix = [
    [
      "ARCHIVUM PARFUMS | CATÁLOGO MAYORISTA",
      ...Array(12).fill(""),
    ],
    [
      "Inventario organizado para lectura, búsqueda y filtros. Precios expresados en colones costarricenses.",
      ...Array(12).fill(""),
    ],
    [
      "Consejo: filtrá por marca, público, concentración o estado de ficha desde los encabezados.",
      ...Array(12).fill(""),
    ],
    catalogHeaders,
    ...catalogData,
  ];
  const technicalPasteMatrix = [
    ["DATOS TÉCNICOS Y TRAZABILIDAD", ...Array(7).fill("")],
    [
      "Esta pestaña conserva el texto original, la descripción olfativa, la ruta de imagen y la fuente de verificación.",
      ...Array(7).fill(""),
    ],
    Array(8).fill(""),
    technicalHeaders,
    ...technicalData,
  ];
  const summaryPasteMatrix = Array.from(
    { length: 29 },
    () => Array(8).fill("")
  );
  summaryPasteMatrix[0][0] = "RESUMEN DEL INVENTARIO";
  summaryPasteMatrix[1][0] =
    "Corte de datos: 14 de junio de 2026 · Archivum Parfums";
  summaryPasteMatrix[3] = [
    "Presentaciones",
    "",
    "Perfumes únicos",
    "",
    "Marcas",
    "",
    "Precio promedio",
    "",
  ];
  summaryPasteMatrix[4] = [
    rows.length,
    "",
    uniqueDescriptorCount,
    "",
    uniqueBrands.size,
    "",
    `₡${averagePrice.toLocaleString("es-CR")}`,
    "",
  ];
  summaryPasteMatrix[7] = [
    "Estado de datos",
    "Cantidad",
    "Tipo de producto",
    "Cantidad",
    "",
    "Público",
    "Cantidad",
    "",
  ];
  summaryPasteMatrix[8] = [
    "Ficha verificada",
    verifiedCount,
    "Perfumes",
    rows.length - nonPerfumeCount,
    "",
    audienceCounts[0][0],
    audienceCounts[0][1],
    "",
  ];
  summaryPasteMatrix[9] = [
    "Pendiente",
    pendingCount,
    "Otros formatos",
    nonPerfumeCount,
    "",
    audienceCounts[1][0],
    audienceCounts[1][1],
    "",
  ];
  summaryPasteMatrix[10] = [
    "No aplica",
    rows.length - verifiedCount - pendingCount,
    "",
    "",
    "",
    audienceCounts[2][0],
    audienceCounts[2][1],
    "",
  ];
  summaryPasteMatrix[13] = [
    "Top 10 marcas",
    "Presentaciones",
    ...Array(6).fill(""),
  ];
  brandCounts.forEach((brand, index) => {
    summaryPasteMatrix[14 + index][0] = brand[0];
    summaryPasteMatrix[14 + index][1] = brand[1];
  });
  await Promise.all([
    fs.writeFile(
      path.join(previewDir, "catalogo.tsv"),
      toTsv(catalogPasteMatrix),
      "utf8"
    ),
    fs.writeFile(
      path.join(previewDir, "resumen.tsv"),
      toTsv(summaryPasteMatrix),
      "utf8"
    ),
    fs.writeFile(
      path.join(previewDir, "datos-tecnicos.tsv"),
      toTsv(technicalPasteMatrix),
      "utf8"
    ),
  ]);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  const catalogPreview = await workbook.render({
    sheetName: "CATÁLOGO",
    range: "A1:J22",
    scale: 1.5,
    format: "png",
  });
  await fs.writeFile(
    path.join(previewDir, "catalogo.png"),
    new Uint8Array(await catalogPreview.arrayBuffer())
  );
  const summaryPreview = await workbook.render({
    sheetName: "RESUMEN",
    range: "A1:H29",
    scale: 1.5,
    format: "png",
  });
  await fs.writeFile(
    path.join(previewDir, "resumen.png"),
    new Uint8Array(await summaryPreview.arrayBuffer())
  );
  const technicalPreview = await workbook.render({
    sheetName: "DATOS TÉCNICOS",
    range: "A1:H12",
    scale: 1.25,
    format: "png",
  });
  await fs.writeFile(
    path.join(previewDir, "datos-tecnicos.png"),
    new Uint8Array(await technicalPreview.arrayBuffer())
  );

  const catalogCheck = await workbook.inspect({
    kind: "table",
    range: "CATÁLOGO!A1:M12",
    include: "values,formulas",
    tableMaxRows: 12,
    tableMaxCols: 13,
  });
  const errorCheck = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 50 },
    summary: "final formula error scan",
  });

  console.log(
    JSON.stringify(
      {
        outputPath,
        rows: rows.length,
        uniqueDescriptors: uniqueDescriptorCount,
        brands: uniqueBrands.size,
        verifiedCount,
        pendingCount,
        nonPerfumeCount,
        catalogPreview: path.join(previewDir, "catalogo.png"),
        summaryPreview: path.join(previewDir, "resumen.png"),
        technicalPreview: path.join(previewDir, "datos-tecnicos.png"),
      },
      null,
      2
    )
  );
  console.log(catalogCheck.ndjson);
  console.log(errorCheck.ndjson);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
