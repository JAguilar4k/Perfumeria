"use strict";

const SHEET_ID = "1K0fPgNhIHEVGe-jXJEIzmcuIG8pJMCrmEe1aVFMM4xA";
const SHEET_API_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
const STORAGE_KEY = "archivum-parfums-preferencias-v5";
const FETCH_TIMEOUT_MS = 15000;

const VALID_AUDIENCES = new Set(["todas", "masculino", "femenino", "unisex"]);
const VALID_SORTS = new Set(["original", "ascendente", "descendente"]);
const VALID_THEMES = new Set(["light", "dark"]);

/*
 * Taxonomía amplia de acordes inspirada en clasificaciones usadas por
 * Fragrantica. El filtro no muestra esta lista completa: después de cargar la
 * hoja se publican únicamente las notas que tienen coincidencias reales.
 */
const NOTE_DEFINITIONS = [
  { key: "acuatico", label: "Acuático", pattern: /\b(acuatic\w*|aquatic|water)\b/i },
  { key: "aldehidico", label: "Aldehídico", pattern: /\b(aldehid\w*)\b/i },
  { key: "almizclado", label: "Almizclado", pattern: /\b(almizcl\w*|musk\w*)\b/i },
  { key: "amaderado", label: "Amaderado", pattern: /\b(amaderad\w*|madera|wood\w*)\b/i },
  { key: "ambarado", label: "Ámbar", pattern: /\b(ambar\w*|amber\w*)\b/i },
  { key: "aromatico", label: "Aromático", pattern: /\b(aromatic\w*)\b/i },
  { key: "atalcado", label: "Atalcado", pattern: /\b(atalcad\w*|powdery)\b/i },
  { key: "avainillado", label: "Avainillado", pattern: /\b(avainill\w*|vainill\w*|vanilla)\b/i },
  { key: "balsamico", label: "Balsámico", pattern: /\b(balsam\w*)\b/i },
  { key: "cafe", label: "Café", pattern: /\b(cafe|coffee|cofee)\b/i },
  { key: "citrico", label: "Cítrico", pattern: /\b(citric\w*|citrus|limon|naranja|bergamota|mandarina|pomelo|mojito)\b/i },
  { key: "coco", label: "Coco", pattern: /\b(coco|coconut)\b/i },
  { key: "cuero", label: "Cuero", pattern: /\b(cuero|leather|gamuza|suede)\b/i },
  { key: "dulce", label: "Dulce", pattern: /\b(dulce|sweet|caramelo|candy)\b/i },
  { key: "especiado", label: "Especiado", pattern: /\b(especiad\w*|spicy|saffron|azafran|canela|pimienta)\b/i },
  { key: "floral", label: "Floral", pattern: /\b(floral\w*|flor\w*|rosa|rose|jazmin|tuberosa|violeta)\b/i },
  { key: "fougere", label: "Fougère", pattern: /\b(fougere|fouger)\b/i },
  { key: "fresco", label: "Fresco", pattern: /\b(fresco|fresh)\b/i },
  { key: "frutal", label: "Frutal", pattern: /\b(frutal\w*|frut\w*|mango|cherry|cereza|blueberry|pina|pomegranate|manzana|pera)\b/i },
  { key: "gourmand", label: "Gourmand", pattern: /\b(gourmand|gourmet|tonka|toffee|chocolate|baklava|postre)\b/i },
  { key: "herbal", label: "Herbal", pattern: /\b(herbal|hierba|lavanda|romero|salvia)\b/i },
  { key: "iris", label: "Iris", pattern: /\b(iris|orris)\b/i },
  { key: "marino", label: "Marino", pattern: /\b(marin\w*|marine|ocean\w*)\b/i },
  { key: "oriental", label: "Oriental", pattern: /\b(oriental\w*|oud)\b/i },
  { key: "ozonico", label: "Ozónico", pattern: /\b(ozonic\w*|ozono)\b/i },
  { key: "tabaco", label: "Tabaco", pattern: /\b(tabaco|tobacco)\b/i },
  { key: "terroso", label: "Terroso", pattern: /\b(terros\w*|earthy|patchouli|vetiver)\b/i },
  { key: "tropical", label: "Tropical", pattern: /\b(tropical\w*|tahiti|pina colada)\b/i },
  { key: "verde", label: "Verde", pattern: /\b(verde|green|hoja\w*)\b/i }
];

const NOTE_KEYS = new Set(NOTE_DEFINITIONS.map((note) => note.key));
const NOTE_LABELS = new Map(
  NOTE_DEFINITIONS.map((note) => [note.key, note.label])
);
const NOTE_KEYS_BY_LABEL = new Map(
  NOTE_DEFINITIONS.map((note) => [normalizeText(note.label), note.key])
);

/*
 * Esta tabla no reemplaza el inventario: únicamente enriquece filas obtenidas
 * por fetch. Las claves reproducen los perfiles solicitados en la
 * especificación v6.0 y los fallbacks apuntan a recursos locales uniformes.
 */
const fragranticaEnrichment = Object.freeze({
  "Dragon Collection Lord of Flames": {
    notas: ["Oriental", "Especiado", "Amaderado"],
    fallbackImg: "assets/products/product-000.webp"
  },
  "Encore I Luniche": {
    notas: ["Floral", "Cítrico", "Almizclado"],
    fallbackImg: "assets/products/product-001.webp"
  },
  "Tufaah Mujer Luniche": {
    notas: ["Frutal", "Floral", "Gourmand"],
    fallbackImg: "assets/products/product-014.webp"
  },
  "Crown Hombre Matin Martin": {
    notas: ["Cítrico", "Amaderado", "Especiado"],
    fallbackImg: "assets/products/product-071.webp"
  },
  "El Dorado Mujer Matin Martin": {
    notas: ["Floral", "Frutal", "Oriental"],
    fallbackImg: "assets/products/product-073.webp"
  },
  "Vanilla Creme Michael Malul": {
    notas: ["Gourmand", "Oriental", "Almizclado"],
    fallbackImg: "assets/products/product-040.webp"
  },
  "Aristo Era Vorv": {
    notas: ["Amaderado", "Oriental", "Cítrico"],
    fallbackImg: "assets/products/product-052.webp"
  }
});

const FRAGRANTICA_ENRICHMENT_BY_KEY = new Map(
  Object.entries(fragranticaEnrichment).map(([productKey, enrichment]) => {
    return [normalizeText(productKey), enrichment];
  })
);

const AUDIENCE_PATTERN =
  /\b(?:UNISEX|UNSIEX|MUJER(?:ES)?|HOMBRE(?:S)?|MASCULINO|FEMENINO|NIÑ(?:O|OS|A|AS)|INFANTIL)\b/i;

const elements = {
  search: document.querySelector("#search"),
  audience: document.querySelector("#audience"),
  brand: document.querySelector("#brand"),
  sort: document.querySelector("#sort"),
  noteFilter: document.querySelector("#note-filter"),
  noteOptions: document.querySelector("#note-options"),
  noteSearch: document.querySelector("#note-search"),
  noteSummary: document.querySelector("#note-summary"),
  clearNotesButton: document.querySelector("#clear-notes"),
  clearButton: document.querySelector("#clear-filters"),
  productGrid: document.querySelector("#product-grid"),
  emptyState: document.querySelector("#empty-state"),
  resultCount: document.querySelector("#result-count"),
  sourceNote: document.querySelector("#source-note"),
  themeButton: document.querySelector("#theme-toggle"),
  themeIcon: document.querySelector("#theme-icon"),
  themeText: document.querySelector("#theme-text"),
  currentYear: document.querySelector("#current-year")
};

const priceFormatter = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const integerFormatter = new Intl.NumberFormat("es-CR");

const defaultState = {
  search: "",
  audience: "todas",
  brand: "todas",
  sort: "original",
  selectedNotes: [],
  theme: getPreferredTheme()
};

let inventory = [];
let appState = loadState();
let inventoryRequestId = 0;

function getPreferredTheme() {
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  return prefersDark ? "dark" : "light";
}

/*
 * Web Storage no es una fuente confiable: puede estar bloqueado, corrupto o
 * modificado manualmente. La lectura valida tipos y valores antes de usarlos.
 */
function loadState() {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY);

    if (storedValue === null) {
      return { ...defaultState };
    }

    const parsedValue = JSON.parse(storedValue);

    if (typeof parsedValue !== "object" || parsedValue === null) {
      return { ...defaultState };
    }

    const safeNotes = Array.isArray(parsedValue.selectedNotes)
      ? parsedValue.selectedNotes.filter((note) => NOTE_KEYS.has(note))
      : [];

    return {
      search: typeof parsedValue.search === "string"
        ? parsedValue.search.slice(0, 100)
        : defaultState.search,
      audience: VALID_AUDIENCES.has(parsedValue.audience)
        ? parsedValue.audience
        : defaultState.audience,
      brand: typeof parsedValue.brand === "string"
        ? parsedValue.brand.slice(0, 100)
        : defaultState.brand,
      sort: VALID_SORTS.has(parsedValue.sort)
        ? parsedValue.sort
        : defaultState.sort,
      selectedNotes: [...new Set(safeNotes)],
      theme: VALID_THEMES.has(parsedValue.theme)
        ? parsedValue.theme
        : defaultState.theme
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch {
    // La interfaz continúa funcionando aunque el navegador bloquee el storage.
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CR")
    .trim();
}

function getCatalogImageKey(descriptor) {
  const normalizedDescriptor = normalizeText(descriptor).replace(/\s+/g, " ");
  let hash = 0xcbf29ce484222325n;

  for (let index = 0; index < normalizedDescriptor.length; index += 1) {
    hash ^= BigInt(normalizedDescriptor.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(36);
}

function cleanText(value, maximumLength = 500) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

function toDisplayCase(value) {
  const text = cleanText(value, 120);

  if (text !== text.toLocaleUpperCase("es-CR")) {
    return text;
  }

  return text
    .toLocaleLowerCase("es-CR")
    .replace(/(^|[\s/+-])(\p{L})/gu, (match, separator, letter) => {
      return `${separator}${letter.toLocaleUpperCase("es-CR")}`;
    });
}

function readCell(row, index) {
  if (!Number.isInteger(index) || index < 0 || !row || !Array.isArray(row.c)) {
    return "";
  }

  const cell = row.c[index];

  if (!cell) {
    return "";
  }

  if (cell.f !== undefined && cell.f !== null && cell.f !== "") {
    return cell.f;
  }

  return cell.v ?? "";
}

function findColumnIndex(labels, aliases) {
  return labels.findIndex((label) => {
    return aliases.some((alias) => label.includes(alias));
  });
}

function resolveColumnMap(table) {
  const labels = table.cols.map((column) => normalizeText(column.label));

  const detected = {
    id: findColumnIndex(labels, ["id", "codigo"]),
    nombre: findColumnIndex(labels, ["nombre", "producto", "fragancia"]),
    marca: findColumnIndex(labels, ["marca", "brand"]),
    audiencia: findColumnIndex(labels, [
      "audiencia",
      "publico objetivo",
      "genero",
      "sexo"
    ]),
    precio: findColumnIndex(labels, ["precio", "valor"]),
    imagen: findColumnIndex(labels, ["imagen", "foto", "image"]),
    notas: findColumnIndex(labels, [
      "notas",
      "familia olfativa",
      "perfil olfativo",
      "acordes"
    ]),
    descripcion: findColumnIndex(labels, [
      "descripcion",
      "detalle",
      "inspiracion"
    ]),
    ocasion: findColumnIndex(labels, ["ocasion", "uso recomendado"])
  };

  /*
   * La hoja actual usa nombres genéricos de columna. Estos respaldos reflejan
   * su estructura pública: A producto, C descripción, D familia, E ocasión,
   * I precio. Si aparecen encabezados semánticos, siempre tienen prioridad.
   */
  return {
    id: detected.id,
    nombre: detected.nombre >= 0 ? detected.nombre : 0,
    marca: detected.marca,
    audiencia: detected.audiencia,
    precio: detected.precio >= 0 ? detected.precio : 8,
    imagen: detected.imagen >= 0 ? detected.imagen : 1,
    notas: detected.notas >= 0 ? detected.notas : 3,
    descripcion: detected.descripcion >= 0 ? detected.descripcion : 2,
    ocasion: detected.ocasion >= 0 ? detected.ocasion : 4,
    hasSemanticName: detected.nombre >= 0
  };
}

/*
 * Google Visualization envuelve el JSON en una llamada JavaScript.
 * Se extrae únicamente el objeto comprendido entre la primera y última llave;
 * después JSON.parse valida la sintaxis sin ejecutar el contenido recibido.
 */
function parseVisualizationResponse(responseText) {
  const objectStart = responseText.indexOf("{");
  const objectEnd = responseText.lastIndexOf("}");

  if (objectStart < 0 || objectEnd <= objectStart) {
    throw new Error("La respuesta del inventario no contiene JSON válido.");
  }

  const parsedResponse = JSON.parse(
    responseText.slice(objectStart, objectEnd + 1)
  );

  return validateVisualizationPayload(parsedResponse);
}

function validateVisualizationPayload(payload) {
  if (payload?.status !== "ok" || !payload.table) {
    throw new Error("Google Sheets devolvió una respuesta sin datos.");
  }

  return payload.table;
}

/*
 * fetch es la vía principal. Google no siempre envía permisos CORS, por lo que
 * algunos navegadores lo bloquean especialmente al abrir index.html con
 * file://. El AbortController evita una espera indefinida.
 */
async function fetchInventoryTable() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch(SHEET_API_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`El inventario respondió con estado ${response.status}.`);
    }

    return parseVisualizationResponse(await response.text());
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/*
 * Respaldo compatible con file://:
 * Google Visualization devuelve JavaScript que llama a
 * google.visualization.Query.setResponse. Un <script> externo no depende de
 * CORS, así que esta ruta recupera exactamente la misma tabla cuando fetch
 * está bloqueado. La función previa se restaura al terminar.
 */
function loadInventoryTableWithScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const googleNamespace = window.google ?? {};
    const visualizationNamespace = googleNamespace.visualization ?? {};
    const queryNamespace = visualizationNamespace.Query ?? {};
    const previousCallback = queryNamespace.setResponse;
    let settled = false;

    window.google = googleNamespace;
    googleNamespace.visualization = visualizationNamespace;
    visualizationNamespace.Query = queryNamespace;

    const cleanup = () => {
      script.remove();

      if (previousCallback) {
        queryNamespace.setResponse = previousCallback;
      } else {
        delete queryNamespace.setResponse;
      }
    };

    const finish = (callback) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      callback();
    };

    queryNamespace.setResponse = (payload) => {
      finish(() => {
        try {
          resolve(validateVisualizationPayload(payload));
        } catch (error) {
          reject(error);
        }
      });
    };

    script.async = true;
    script.src = `${SHEET_API_URL}&cacheBust=${Date.now()}`;
    script.onerror = () => {
      finish(() => reject(new Error("No fue posible conectar con Google Sheets.")));
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("La carga alternativa tardó demasiado.")));
    }, FETCH_TIMEOUT_MS);

    document.head.append(script);
  });
}

async function requestInventoryTable() {
  const forceScriptTransport =
    window.location.protocol === "file:" ||
    new URLSearchParams(window.location.search).has("scriptTransport");

  if (forceScriptTransport) {
    return loadInventoryTableWithScript();
  }

  try {
    return await fetchInventoryTable();
  } catch {
    return loadInventoryTableWithScript();
  }
}

function parsePrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const cleanedValue = cleanText(value, 40).replace(/[^\d.,-]/g, "");

  if (/^\d{1,3}(?:\.\d{3})+$/.test(cleanedValue)) {
    return Number(cleanedValue.replace(/\./g, ""));
  }

  if (/^\d{1,3}(?:,\d{3})+$/.test(cleanedValue)) {
    return Number(cleanedValue.replace(/,/g, ""));
  }

  const numericValue = Number(cleanedValue.replace(",", "."));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeAudience(value) {
  const normalizedValue = normalizeText(value);

  if (/mujer|femenin/.test(normalizedValue)) {
    return "femenino";
  }

  if (/hombre|masculin/.test(normalizedValue)) {
    return "masculino";
  }

  return "unisex";
}

function extractProductName(descriptor) {
  const audienceMatch = descriptor.match(AUDIENCE_PATTERN);

  if (audienceMatch && audienceMatch.index !== undefined) {
    return toDisplayCase(descriptor.slice(0, audienceMatch.index));
  }

  const sizeMatch = descriptor.match(/\b\d+(?:[.,]\d+)?\s?ML\b/i);

  if (sizeMatch && sizeMatch.index !== undefined) {
    return toDisplayCase(descriptor.slice(0, sizeMatch.index));
  }

  return toDisplayCase(descriptor);
}

function extractBrand(descriptor) {
  const audienceMatch = descriptor.match(AUDIENCE_PATTERN);
  const textAfterAudience = audienceMatch && audienceMatch.index !== undefined
    ? descriptor.slice(audienceMatch.index + audienceMatch[0].length)
    : descriptor;

  const fragranceTypeMatch = textAfterAudience.match(
    /\b(?:EDP|EDT|PARFUM|PERFUME|PERFUM|EXTRAIT|ACEITE|OIL|COLONIA)\b\s+(.+)$/i
  );

  let brandCandidate = fragranceTypeMatch ? fragranceTypeMatch[1] : "";

  brandCandidate = brandCandidate.replace(
    /^(?:EDP|EDT|PARFUM|PERFUME|PERFUM|EXTRAIT|ACEITE|OIL|COLONIA)\s+/i,
    ""
  );

  if (!brandCandidate) {
    const sizeMatch = textAfterAudience.match(
      /^\s*(?:\d+\s?PZS?\s+)?\d+(?:[.,]\d+)?\s?ML\s+(.+)$/i
    );

    brandCandidate = sizeMatch ? sizeMatch[1] : "";
    brandCandidate = brandCandidate.replace(
      /^(?:EDP|EDT|PARFUM|PERFUME|PERFUM|EXTRAIT|ACEITE|OIL|COLONIA)\s+/i,
      ""
    );
  }

  brandCandidate = cleanText(brandCandidate, 80);

  const invalidCandidate =
    brandCandidate.startsWith("+") ||
    /\b\d+(?:[.,]\d+)?\s?ML\b/i.test(brandCandidate) ||
    brandCandidate.length > 45;

  if (brandCandidate && !invalidCandidate) {
    return toDisplayCase(brandCandidate);
  }

  const productName = extractProductName(descriptor);

  if (normalizeText(productName).startsWith("estuche ")) {
    const words = productName.replace(/^Estuche\s+/i, "").split(/\s+/);
    const probableBrand = words.slice(0, 2);

    if (
      probableBrand.length === 2 &&
      normalizeText(probableBrand[0]) === normalizeText(probableBrand[1])
    ) {
      probableBrand.pop();
    }

    return probableBrand.join(" ") || "Marca no indicada";
  }

  return "Marca no indicada";
}

/*
 * La fuente puede separar acordes con comas, guiones, barras o espacios.
 * Esta función transforma todos esos formatos en un arreglo uniforme de
 * tokens. El texto unido conserva además expresiones compuestas, por ejemplo
 * "amaderado oriental", para validar las expresiones de NOTE_DEFINITIONS.
 */
function normalizeOlfactorySource(...sources) {
  const normalizedSources = sources
    .map((source) => normalizeText(cleanText(source, 400)))
    .filter(Boolean);

  const tokens = normalizedSources
    .flatMap((source) => source.split(/[^\p{L}\p{N}]+/u))
    .filter(Boolean);

  return {
    tokens: [...new Set(tokens)],
    searchableText: normalizedSources.join(" ")
  };
}

function extractNotes(rawNotes, descriptor, rawDescription) {
  const olfactorySource = normalizeOlfactorySource(
    rawNotes,
    rawDescription,
    descriptor
  );

  return NOTE_DEFINITIONS
    .filter((definition) => {
      return (
        definition.pattern.test(olfactorySource.searchableText) ||
        olfactorySource.tokens.some((token) => definition.pattern.test(token))
      );
    })
    .map((definition) => definition.key);
}

function getFragranticaEnrichment(productName, brand, audience) {
  const audienceLabel = audience === "femenino"
    ? "Mujer"
    : audience === "masculino"
      ? "Hombre"
      : "";
  const lookupCandidates = [
    `${productName} ${brand}`,
    `${productName} ${audienceLabel} ${brand}`
  ];

  for (const candidate of lookupCandidates) {
    const enrichment = FRAGRANTICA_ENRICHMENT_BY_KEY.get(
      normalizeText(candidate)
    );

    if (enrichment) {
      return enrichment;
    }
  }

  return null;
}

function mergeProductNotes(inferredNotes, enrichment) {
  if (!enrichment) {
    return inferredNotes;
  }

  const enrichedNotes = enrichment.notas
    .map((noteLabel) => NOTE_KEYS_BY_LABEL.get(normalizeText(noteLabel)))
    .filter((noteKey) => NOTE_KEYS.has(noteKey));

  return enrichedNotes.length > 0
    ? [...new Set(enrichedNotes)]
    : inferredNotes;
}

function sanitizeImageUrl(value) {
  const candidate = cleanText(value, 1000);

  if (!candidate) {
    return "";
  }

  try {
    const parsedUrl = new URL(candidate);
    return ["http:", "https:"].includes(parsedUrl.protocol)
      ? parsedUrl.href
      : "";
  } catch {
    return "";
  }
}

function resolveProductImage(sheetImage, descriptor, enrichmentFallback = "") {
  const remoteImage = sanitizeImageUrl(sheetImage);

  if (remoteImage) {
    return remoteImage;
  }

  const catalogImageKey = getCatalogImageKey(descriptor);

  if (
    typeof CATALOG_IMAGE_KEYS !== "undefined" &&
    CATALOG_IMAGE_KEYS.has(catalogImageKey)
  ) {
    return `assets/catalog/${catalogImageKey}.webp`;
  }

  if (enrichmentFallback) {
    return enrichmentFallback;
  }

  return "";
}

function buildDescription(rawDescription, rawNotes, occasion) {
  const description = cleanText(rawDescription, 280);

  if (description) {
    return occasion
      ? `${description} Uso sugerido: ${cleanText(occasion, 80)}.`
      : description;
  }

  if (rawNotes) {
    const noteDescription = `Perfil olfativo: ${cleanText(rawNotes, 120)}.`;
    return occasion
      ? `${noteDescription} Uso sugerido: ${cleanText(occasion, 80)}.`
      : noteDescription;
  }

  return "Consultá los detalles y la disponibilidad en el inventario oficial.";
}

function parseInventoryRows(table) {
  const columns = resolveColumnMap(table);

  return table.rows
    .map((row, rowIndex) => {
      const descriptor = cleanText(readCell(row, columns.nombre), 240);
      const price = parsePrice(readCell(row, columns.precio));

      if (!descriptor || price <= 0) {
        return null;
      }

      const explicitAudience = readCell(row, columns.audiencia);
      const explicitBrand = cleanText(readCell(row, columns.marca), 100);
      const rawNotes = cleanText(readCell(row, columns.notas), 200);
      const rawDescription = cleanText(
        readCell(row, columns.descripcion),
        300
      );
      const occasion = cleanText(readCell(row, columns.ocasion), 100);
      const productName = columns.hasSemanticName
        ? toDisplayCase(descriptor)
        : extractProductName(descriptor);
      const brand = explicitBrand
        ? toDisplayCase(explicitBrand)
        : extractBrand(descriptor);
      const audience = explicitAudience
        ? normalizeAudience(explicitAudience)
        : normalizeAudience(descriptor);
      const enrichment = getFragranticaEnrichment(
        productName,
        brand,
        audience
      );
      const notes = mergeProductNotes(
        extractNotes(rawNotes, descriptor, rawDescription),
        enrichment
      );
      const searchableNotes = notes
        .map((note) => NOTE_LABELS.get(note) ?? note)
        .join(" ");

      return {
        id: cleanText(readCell(row, columns.id), 60) || String(rowIndex + 1),
        nombre: productName || `Fragancia ${rowIndex + 1}`,
        marca: brand,
        audiencia: audience,
        precio: price,
        imagen: resolveProductImage(
          readCell(row, columns.imagen),
          descriptor,
          enrichment?.fallbackImg
        ),
        notas: notes,
        descripcion: buildDescription(rawDescription, rawNotes, occasion),
        searchText: normalizeText(
          `${descriptor} ${brand} ${rawDescription} ${rawNotes} ` +
          `${occasion} ${searchableNotes}`
        ),
        sourceOrder: rowIndex
      };
    })
    .filter(Boolean);
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  element.textContent = text;
  return element;
}

/*
 * Capa anti-XSS:
 * todos los nodos se crean con createElement y los textos externos se asignan
 * con textContent. Nunca se interpreta una cadena de la hoja como HTML.
 */
function createProductCard(product) {
  const article = document.createElement("article");
  const titleId = `product-title-${product.sourceOrder + 1}`;
  article.className = "product-card perfume-card";
  article.setAttribute("aria-labelledby", titleId);

  const visual = document.createElement("div");
  visual.className = "product-visual image-container";

  if (product.imagen) {
    visual.classList.add("has-image");
    const image = document.createElement("img");
    image.src = product.imagen;
    image.alt = `Presentación de ${product.nombre}`;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener(
      "error",
      () => {
        visual.classList.remove("has-image");
        image.remove();
      },
      { once: true }
    );
    visual.append(image);
  }

  const visualLabel = createTextElement(
    "span",
    "product-placeholder",
    product.marca
  );
  visual.append(visualLabel);

  const body = document.createElement("div");
  body.className = "product-body";

  const brand = createTextElement("p", "product-brand", product.marca);
  const title = createTextElement("h3", "", product.nombre);
  title.id = titleId;

  const description = createTextElement(
    "p",
    "product-description",
    product.descripcion
  );

  body.append(brand, title, description);

  if (product.notas.length > 0) {
    const noteList = document.createElement("ul");
    noteList.className = "product-notes";
    noteList.setAttribute("aria-label", "Notas olfativas");

    for (const note of product.notas) {
      noteList.append(
        createTextElement("li", "", NOTE_LABELS.get(note) ?? note)
      );
    }

    body.append(noteList);
  }

  const meta = document.createElement("div");
  meta.className = "product-meta";

  const audience = createTextElement(
    "span",
    "product-audience",
    product.audiencia
  );
  const price = createTextElement(
    "p",
    "product-price",
    priceFormatter.format(product.precio)
  );

  meta.append(audience, price);
  body.append(meta);
  article.append(visual, body);

  return article;
}

function renderStatus(status, message) {
  const statusCard = document.createElement("div");
  statusCard.className = "status-card";
  statusCard.dataset.status = status;

  if (status === "loading") {
    const indicator = document.createElement("span");
    indicator.className = "loading-indicator";
    indicator.setAttribute("aria-hidden", "true");
    statusCard.append(indicator);
  }

  statusCard.append(createTextElement("p", "", message));

  if (status === "error") {
    statusCard.setAttribute("role", "alert");
    const retryButton = createTextElement(
      "button",
      "secondary-button",
      "Reintentar conexión"
    );
    retryButton.type = "button";
    retryButton.addEventListener("click", loadInventory);
    statusCard.append(retryButton);
  }

  elements.productGrid.replaceChildren(statusCard);
  elements.emptyState.hidden = true;
}

function getNoteInputs() {
  return Array.from(elements.noteOptions.querySelectorAll('input[name="note"]'));
}

function renderNoteStatus(message, status = "loading") {
  const paragraph = createTextElement(
    "p",
    status === "error" ? "note-empty" : "note-loading",
    message
  );

  elements.noteOptions.replaceChildren(paragraph);
  elements.noteSearch.disabled = true;
  elements.clearNotesButton.disabled = true;
  elements.noteSummary.textContent =
    status === "error" ? "No disponibles" : "Cargando opciones…";
}

function updateNoteSummary() {
  const selectedTotal = getSelectedNotes().length;

  if (selectedTotal === 0) {
    elements.noteSummary.textContent = "Todas las notas";
  } else if (selectedTotal === 1) {
    elements.noteSummary.textContent = "1 seleccionada";
  } else {
    elements.noteSummary.textContent = `${selectedTotal} seleccionadas`;
  }

  elements.clearNotesButton.disabled = selectedTotal === 0;
}

function populateNoteOptions() {
  const noteCounts = new Map();

  for (const product of inventory) {
    for (const note of product.notas) {
      noteCounts.set(note, (noteCounts.get(note) ?? 0) + 1);
    }
  }

  const availableNotes = NOTE_DEFINITIONS
    .filter((definition) => (noteCounts.get(definition.key) ?? 0) > 0)
    .sort((firstNote, secondNote) => {
      return firstNote.label.localeCompare(secondNote.label, "es-CR", {
        sensitivity: "base"
      });
    });

  const availableKeys = new Set(availableNotes.map((note) => note.key));
  appState.selectedNotes = appState.selectedNotes.filter((note) => {
    return availableKeys.has(note);
  });

  if (availableNotes.length === 0) {
    renderNoteStatus(
      "El inventario cargó, pero no contiene notas reconocibles.",
      "error"
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const definition of availableNotes) {
    const option = document.createElement("label");
    option.className = "note-option";
    option.dataset.searchText = normalizeText(definition.label);

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "note";
    input.value = definition.key;
    input.checked = appState.selectedNotes.includes(definition.key);
    input.addEventListener("change", updateFilters);

    const label = createTextElement("span", "note-name", definition.label);
    const count = createTextElement(
      "small",
      "note-count",
      integerFormatter.format(noteCounts.get(definition.key))
    );
    count.setAttribute(
      "aria-label",
      `${integerFormatter.format(noteCounts.get(definition.key))} fragancias`
    );

    option.append(input, label, count);
    fragment.append(option);
  }

  elements.noteOptions.replaceChildren(fragment);
  elements.noteSearch.disabled = false;
  elements.noteSearch.value = "";
  updateNoteSummary();
}

function filterNoteOptions() {
  const query = normalizeText(elements.noteSearch.value);
  const options = Array.from(
    elements.noteOptions.querySelectorAll(".note-option")
  );
  let visibleTotal = 0;

  for (const option of options) {
    const isVisible =
      query === "" || option.dataset.searchText.includes(query);
    option.hidden = !isVisible;

    if (isVisible) {
      visibleTotal += 1;
    }
  }

  const previousEmpty = elements.noteOptions.querySelector(".note-empty");

  if (visibleTotal === 0 && !previousEmpty) {
    elements.noteOptions.append(
      createTextElement(
        "p",
        "note-empty",
        "No hay notas que coincidan con esa búsqueda."
      )
    );
  } else if (visibleTotal > 0 && previousEmpty) {
    previousEmpty.remove();
  }
}

function getSelectedNotes() {
  return getNoteInputs()
    .filter((input) => input.checked && NOTE_KEYS.has(input.value))
    .map((input) => input.value);
}

function clearNoteSelection() {
  for (const input of getNoteInputs()) {
    input.checked = false;
  }

  appState.selectedNotes = [];
  saveState();
  updateNoteSummary();

  if (inventory.length > 0) {
    renderCatalog();
  }
}

function getFilteredProducts() {
  const normalizedSearch = normalizeText(appState.search);

  const matchingProducts = inventory.filter((product) => {
    const matchesSearch =
      normalizedSearch === "" ||
      product.searchText.includes(normalizedSearch);
    const matchesAudience =
      appState.audience === "todas" ||
      product.audiencia === appState.audience;
    const matchesBrand =
      appState.brand === "todas" ||
      product.marca === appState.brand;
    const matchesNotes =
      appState.selectedNotes.length === 0 ||
      appState.selectedNotes.some((note) => product.notas.includes(note));

    return matchesSearch && matchesAudience && matchesBrand && matchesNotes;
  });

  matchingProducts.sort((firstProduct, secondProduct) => {
    if (appState.sort === "ascendente") {
      return firstProduct.precio - secondProduct.precio;
    }

    if (appState.sort === "descendente") {
      return secondProduct.precio - firstProduct.precio;
    }

    return firstProduct.sourceOrder - secondProduct.sourceOrder;
  });

  return {
    total: matchingProducts.length,
    // La vista nunca supera las 12 tarjetas exigidas por la especificación.
    visible: matchingProducts.slice(0, 12)
  };
}

function updateResultCount(total, visibleTotal) {
  let label;

  if (total === 0) {
    label = "0 fragancias encontradas";
  } else if (total === 1) {
    label = "1 fragancia encontrada";
  } else if (total > visibleTotal) {
    label =
      `Mostrando ${integerFormatter.format(visibleTotal)} de ` +
      `${integerFormatter.format(total)} fragancias`;
  } else {
    label = `${integerFormatter.format(total)} fragancias encontradas`;
  }

  elements.resultCount.textContent = label;
  elements.productGrid.setAttribute(
    "aria-label",
    `Resultados del catálogo: ${label}`
  );
}

function renderCatalog() {
  const { total, visible } = getFilteredProducts();
  const fragment = document.createDocumentFragment();

  elements.productGrid.setAttribute("aria-busy", "true");

  for (const product of visible) {
    fragment.append(createProductCard(product));
  }

  /*
   * replaceChildren recibe nodos ya construidos y evita convertir cadenas
   * externas en marcado ejecutable.
   */
  elements.productGrid.replaceChildren(fragment);
  elements.emptyState.hidden = total !== 0;
  updateResultCount(total, visible.length);
  elements.productGrid.setAttribute("aria-busy", "false");
}

function populateBrandOptions() {
  const brands = [...new Set(inventory.map((product) => product.marca))]
    .sort((firstBrand, secondBrand) => {
      return firstBrand.localeCompare(secondBrand, "es-CR", {
        sensitivity: "base"
      });
    });

  const fragment = document.createDocumentFragment();
  const allBrandsOption = document.createElement("option");
  allBrandsOption.value = "todas";
  allBrandsOption.textContent = "Todas las marcas";
  fragment.append(allBrandsOption);

  for (const brand of brands) {
    const option = document.createElement("option");
    option.value = brand;
    option.textContent = brand;
    fragment.append(option);
  }

  elements.brand.replaceChildren(fragment);
  elements.brand.disabled = false;

  if (!brands.includes(appState.brand)) {
    appState.brand = "todas";
  }
}

function applyTheme(theme) {
  const isDark = theme === "dark";

  document.documentElement.dataset.theme = theme;
  elements.themeButton.setAttribute("aria-pressed", String(isDark));
  elements.themeButton.setAttribute(
    "aria-label",
    isDark ? "Activar tema claro" : "Activar tema oscuro"
  );
  elements.themeText.textContent = isDark ? "Tema claro" : "Tema oscuro";
  elements.themeIcon.textContent = isDark ? "☀" : "◐";
}

function syncControlsWithState() {
  elements.search.value = appState.search;
  elements.audience.value = appState.audience;
  elements.sort.value = appState.sort;

  if (
    !elements.brand.disabled &&
    Array.from(elements.brand.options).some(
      (option) => option.value === appState.brand
    )
  ) {
    elements.brand.value = appState.brand;
  }

  for (const input of getNoteInputs()) {
    input.checked = appState.selectedNotes.includes(input.value);
  }

  updateNoteSummary();
}

function updateFilters() {
  appState = {
    ...appState,
    search: elements.search.value.slice(0, 100),
    audience: VALID_AUDIENCES.has(elements.audience.value)
      ? elements.audience.value
      : "todas",
    brand: elements.brand.disabled ? "todas" : elements.brand.value,
    sort: VALID_SORTS.has(elements.sort.value)
      ? elements.sort.value
      : "original",
    selectedNotes: getSelectedNotes()
  };

  saveState();
  updateNoteSummary();

  if (inventory.length > 0) {
    renderCatalog();
  }
}

function clearFilters() {
  appState = {
    ...appState,
    search: "",
    audience: "todas",
    brand: "todas",
    sort: "original",
    selectedNotes: []
  };

  elements.noteSearch.value = "";
  filterNoteOptions();
  syncControlsWithState();
  saveState();

  if (inventory.length > 0) {
    renderCatalog();
  }

  elements.search.focus();
}

function toggleTheme() {
  appState.theme = appState.theme === "dark" ? "light" : "dark";
  applyTheme(appState.theme);
  saveState();
}

async function loadInventory() {
  const currentRequestId = ++inventoryRequestId;

  elements.brand.disabled = true;
  elements.productGrid.setAttribute("aria-busy", "true");
  elements.resultCount.textContent = "Conectando con el inventario…";
  renderStatus("loading", "Cargando fragancias desde Google Sheets…");
  renderNoteStatus("Cargando notas desde el inventario…");

  try {
    const table = await requestInventoryTable();
    const parsedInventory = parseInventoryRows(table);

    if (parsedInventory.length === 0) {
      throw new Error("El inventario no contiene fragancias disponibles.");
    }

    if (currentRequestId !== inventoryRequestId) {
      return;
    }

    inventory = parsedInventory;
    populateBrandOptions();
    populateNoteOptions();
    syncControlsWithState();
    saveState();
    elements.sourceNote.textContent =
      `Fuente: ${integerFormatter.format(inventory.length)} registros ` +
      "del inventario público de Google Sheets.";
    renderCatalog();
  } catch (error) {
    if (currentRequestId !== inventoryRequestId) {
      return;
    }

    inventory = [];
    elements.resultCount.textContent = "Inventario no disponible";
    elements.sourceNote.textContent =
      "No se pudo consultar la fuente externa en este momento.";

    const message =
      "No pudimos cargar el inventario. Revisá la conexión, reintentá o " +
      "abrí el catálogo oficial.";

    renderStatus("error", message);
    renderNoteStatus("Las notas estarán disponibles al cargar el catálogo.", "error");
  } finally {
    if (currentRequestId === inventoryRequestId) {
      elements.productGrid.setAttribute("aria-busy", "false");
    }
  }
}

function initializeApp() {
  syncControlsWithState();
  applyTheme(appState.theme);
  elements.currentYear.textContent = String(new Date().getFullYear());

  elements.search.addEventListener("input", updateFilters);
  elements.audience.addEventListener("change", updateFilters);
  elements.brand.addEventListener("change", updateFilters);
  elements.sort.addEventListener("change", updateFilters);
  elements.noteSearch.addEventListener("input", filterNoteOptions);
  elements.clearNotesButton.addEventListener("click", clearNoteSelection);
  elements.clearButton.addEventListener("click", clearFilters);
  elements.themeButton.addEventListener("click", toggleTheme);

  loadInventory();
}

initializeApp();
