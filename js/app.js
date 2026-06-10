"use strict";

const catalogData = [
  {
    id: 1,
    nombre: "Dragon Collection Lord of Flames",
    marca: "Lord of Flames",
    categoria: "unisex",
    precio: 20000,
    imagen: "placeholder_dragon.jpg",
    descripcion: "100 ml EDP Lord of Flames - Fragancia de nicho cautivadora."
  },
  {
    id: 2,
    nombre: "Encore I Luniche",
    marca: "Luniche",
    categoria: "unisex",
    precio: 28000,
    imagen: "placeholder_encore.jpg",
    descripcion: "90 ml EDP Luniche - Una composición distinguida y moderna."
  },
  {
    id: 3,
    nombre: "Tufaah Mujer Luniche",
    marca: "Luniche",
    categoria: "femenino",
    precio: 15000,
    imagen: "placeholder_tufaah.jpg",
    descripcion: "100 ml EDP Luniche - Esencia floral frutal para una mujer audaz."
  },
  {
    id: 4,
    nombre: "Crown Hombre Matin Martin",
    marca: "Matin Martin",
    categoria: "masculino",
    precio: 24000,
    imagen: "placeholder_crown.jpg",
    descripcion: "100 ml EDP Matin Martin - Aromático verde, fresco e intenso."
  },
  {
    id: 5,
    nombre: "El Dorado Mujer Matin Martin",
    marca: "Matin Martin",
    categoria: "femenino",
    precio: 21000,
    imagen: "placeholder_eldorado.jpg",
    descripcion: "100 ml EDP Matin Martin - Un ramo de notas florales y frutales premium."
  },
  {
    id: 6,
    nombre: "Vanilla Creme Michael Malul",
    marca: "Michael Malul",
    categoria: "femenino",
    precio: 28000,
    imagen: "placeholder_vanilla.jpg",
    descripcion: "100 ml EDP Michael Malul - Aroma dulce, gourmet y sofisticado."
  },
  {
    id: 7,
    nombre: "Aristo Era Vorv",
    marca: "Vorv",
    categoria: "unisex",
    precio: 14000,
    imagen: "placeholder_aristo.jpg",
    descripcion: "100 ml EDP Vorv - Perfume amaderado oriental ideal para el día."
  }
];

const STORAGE_KEY = "perfumeria-preferencias-v1";
const VALID_CATEGORIES = new Set(["todas", "masculino", "femenino", "unisex"]);
const VALID_BRANDS = new Set([
  "todas",
  "Lord of Flames",
  "Luniche",
  "Matin Martin",
  "Michael Malul",
  "Vorv"
]);
const VALID_SORTS = new Set(["original", "ascendente", "descendente"]);
const VALID_THEMES = new Set(["light", "dark"]);

const elements = {
  search: document.querySelector("#search"),
  category: document.querySelector("#category"),
  brand: document.querySelector("#brand"),
  sort: document.querySelector("#sort"),
  clearButton: document.querySelector("#clear-filters"),
  productGrid: document.querySelector("#product-grid"),
  emptyState: document.querySelector("#empty-state"),
  resultCount: document.querySelector("#result-count"),
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

const defaultState = {
  search: "",
  category: "todas",
  brand: "todas",
  sort: "original",
  theme: getPreferredTheme()
};

let appState = loadState();

function getPreferredTheme() {
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  return prefersDark ? "dark" : "light";
}

/*
 * localStorage puede contener datos modificados o de versiones anteriores.
 * Por eso se comprueba el tipo y se aceptan únicamente valores conocidos.
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

    return {
      search: typeof parsedValue.search === "string"
        ? parsedValue.search.slice(0, 100)
        : defaultState.search,
      category: VALID_CATEGORIES.has(parsedValue.category)
        ? parsedValue.category
        : defaultState.category,
      brand: VALID_BRANDS.has(parsedValue.brand)
        ? parsedValue.brand
        : defaultState.brand,
      sort: VALID_SORTS.has(parsedValue.sort)
        ? parsedValue.sort
        : defaultState.sort,
      theme: VALID_THEMES.has(parsedValue.theme)
        ? parsedValue.theme
        : defaultState.theme
    };
  } catch (error) {
    console.warn("No fue posible recuperar las preferencias guardadas.", error);
    return { ...defaultState };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (error) {
    console.warn("No fue posible guardar las preferencias.", error);
  }
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CR")
    .trim();
}

function getFilteredProducts() {
  const normalizedSearch = normalizeText(appState.search);

  const filteredProducts = catalogData.filter((product) => {
    const matchesName =
      normalizedSearch === "" ||
      normalizeText(product.nombre).includes(normalizedSearch);
    const matchesCategory =
      appState.category === "todas" ||
      product.categoria === appState.category;
    const matchesBrand =
      appState.brand === "todas" ||
      product.marca === appState.brand;

    return matchesName && matchesCategory && matchesBrand;
  });

  return filteredProducts.sort((firstProduct, secondProduct) => {
    if (appState.sort === "ascendente") {
      return firstProduct.precio - secondProduct.precio;
    }

    if (appState.sort === "descendente") {
      return secondProduct.precio - firstProduct.precio;
    }

    return firstProduct.id - secondProduct.id;
  });
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

/*
 * Motor de renderizado anti-XSS:
 * cada nodo se crea con createElement y los datos se asignan con textContent.
 * No se usa innerHTML, por lo que una cadena maliciosa se muestra como texto
 * y el navegador no la interpreta como etiquetas o scripts ejecutables.
 */
function createProductCard(product) {
  const article = document.createElement("article");
  article.className = "product-card";
  article.setAttribute("aria-labelledby", `product-title-${product.id}`);

  const visual = document.createElement("div");
  visual.className = "product-visual";
  visual.setAttribute("role", "img");
  visual.setAttribute("aria-label", `Presentación de ${product.nombre}`);
  visual.dataset.imageReference = product.imagen;
  visual.append(createTextElement("span", "", product.marca));

  const body = document.createElement("div");
  body.className = "product-body";

  const brand = createTextElement("p", "product-brand", product.marca);
  const title = createTextElement("h3", "", product.nombre);
  title.id = `product-title-${product.id}`;
  const description = createTextElement(
    "p",
    "product-description",
    product.descripcion
  );

  const meta = document.createElement("div");
  meta.className = "product-meta";
  const category = createTextElement(
    "span",
    "product-category",
    product.categoria
  );
  const price = createTextElement(
    "p",
    "product-price",
    priceFormatter.format(product.precio)
  );

  meta.append(category, price);
  body.append(brand, title, description, meta);
  article.append(visual, body);

  return article;
}

function updateResultCount(total) {
  const label = total === 1 ? "1 fragancia encontrada" : `${total} fragancias encontradas`;
  elements.resultCount.textContent = label;
  elements.productGrid.setAttribute(
    "aria-label",
    `Resultados del catálogo: ${label}`
  );
}

function renderCatalog() {
  const products = getFilteredProducts();
  const fragment = document.createDocumentFragment();

  elements.productGrid.setAttribute("aria-busy", "true");

  for (const product of products) {
    fragment.append(createProductCard(product));
  }

  /*
   * replaceChildren acepta nodos ya construidos. Vacía el catálogo anterior
   * sin convertir cadenas en HTML, por lo que mantiene la protección anti-XSS.
   */
  elements.productGrid.replaceChildren(fragment);
  elements.emptyState.hidden = products.length !== 0;
  updateResultCount(products.length);
  elements.productGrid.setAttribute("aria-busy", "false");
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
  elements.category.value = appState.category;
  elements.brand.value = appState.brand;
  elements.sort.value = appState.sort;
}

function updateFilters() {
  appState = {
    ...appState,
    search: elements.search.value.slice(0, 100),
    category: VALID_CATEGORIES.has(elements.category.value)
      ? elements.category.value
      : "todas",
    brand: VALID_BRANDS.has(elements.brand.value)
      ? elements.brand.value
      : "todas",
    sort: VALID_SORTS.has(elements.sort.value)
      ? elements.sort.value
      : "original"
  };

  saveState();
  renderCatalog();
}

function clearFilters() {
  appState = {
    ...appState,
    search: "",
    category: "todas",
    brand: "todas",
    sort: "original"
  };

  syncControlsWithState();
  saveState();
  renderCatalog();
  elements.search.focus();
}

function toggleTheme() {
  appState.theme = appState.theme === "dark" ? "light" : "dark";
  applyTheme(appState.theme);
  saveState();
}

function initializeApp() {
  syncControlsWithState();
  applyTheme(appState.theme);
  renderCatalog();
  elements.currentYear.textContent = String(new Date().getFullYear());

  elements.search.addEventListener("input", updateFilters);
  elements.category.addEventListener("change", updateFilters);
  elements.brand.addEventListener("change", updateFilters);
  elements.sort.addEventListener("change", updateFilters);
  elements.clearButton.addEventListener("click", clearFilters);
  elements.themeButton.addEventListener("click", toggleTheme);
}

initializeApp();
