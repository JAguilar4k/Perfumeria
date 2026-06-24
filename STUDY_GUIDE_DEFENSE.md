# STUDY_GUIDE_DEFENSE.md

## Archivum Parfums

Guía técnica para defensa oral ante el profesor Bryan Chaves. El proyecto fue
construido con HTML5 semántico, CSS nativo y JavaScript puro, consumiendo datos
vivos desde Google Sheets y renderizando el catálogo de forma segura, accesible
y mantenible.

## Technical Defense Matrix

### 1. Semántica HTML5 Avanzada

#### ¿Por qué se utiliza?

Se utiliza para que la estructura del documento tenga significado real:
`<header>` identifica la cabecera, `<nav>` la navegación, `<main>` el contenido
principal, `<section>` las zonas temáticas, `<article>` cada perfume del
catálogo y `<footer>` el cierre institucional. Esto mejora SEO, accesibilidad,
lectura con tecnologías asistivas y mantiene un árbol del DOM limpio. Además,
atributos como `aria-live`, `aria-busy` y etiquetas asociadas permiten que los
cambios dinámicos del inventario se comuniquen sin depender solo de lo visual.

#### ¿Por qué se eligió sobre las alternativas?

Se eligió sobre la maquetación clásica con tablas porque las tablas son para
datos tabulares, no para construir la estructura completa de una página. También
se eligió sobre el abuso de `<div>` y `<span>` porque ese patrón produce un DOM
sin intención semántica, más difícil de defender, mantener y navegar con lector
de pantalla. HTML5 semántico resuelve estructura y accesibilidad desde el
lenguaje base.

### 2. Combinación de CSS Grid Layout + Flexbox

#### ¿Por qué se utiliza?

CSS Grid se utiliza para organizar las tarjetas del catálogo en dos dimensiones:
filas y columnas. La regla `repeat(auto-fit, minmax(280px, 1fr))` permite que
las tarjetas ocupen el espacio disponible sin dejar huecos visuales cuando los
filtros devuelven pocos resultados. Flexbox se utiliza para distribuciones
unidimensionales: menús, botones, chips de notas, metadatos de tarjetas y fila
de filtros.

#### ¿Por qué se eligió sobre las alternativas?

Se eligió sobre `float: left` porque los flotantes fueron diseñados para envolver
texto, no para sistemas completos de interfaz. Se eligió sobre posicionamientos
absolutos porque romperían la adaptabilidad del catálogo en móviles y pantallas
grandes. Usar solo Grid o solo Flexbox para todo sería forzar una herramienta en
problemas que no le corresponden; la combinación demuestra criterio técnico.

### 3. CSS Puro con Variables y Media Queries Nativas

#### ¿Por qué se utiliza?

CSS puro con variables permite controlar colores, fondos, bordes, sombras,
espaciados y estados de tema desde un sistema centralizado. Las media queries
nativas hacen que la interfaz responda a móviles, tabletas y escritorio sin
dependencias externas. El fondo adaptativo usa imágenes locales con gradientes de
alta opacidad para proteger la lectura y sostener el objetivo de contraste
WCAG 2.2 AAA en los textos principales.

#### ¿Por qué se eligió sobre las alternativas?

Se eligió sobre Bootstrap o Tailwind porque esos frameworks agregan peso,
clases utilitarias y selectores innecesarios para un proyecto académico que
exige dominio de tecnologías nativas. Además, un framework obligaría a
sobrescribir reglas para lograr la identidad visual premium y el contraste
exigido. Las variables CSS dan control absoluto de la cascada con mejor
rendimiento y sin dependencias de red.

### 4. Manipulación Segura del DOM con `createElement` y `textContent`

#### ¿Por qué se utiliza?

Los datos del catálogo provienen de Google Sheets, por lo que se tratan como
entrada externa. Cada tarjeta se arma con `document.createElement()`,
`append()`, `replaceChildren()` y asignación de textos por `textContent`. Este
patrón inserta contenido como texto literal, valida rutas de imagen antes de
usarlas y reduce el riesgo de DOM-based XSS.

#### ¿Por qué se eligió sobre las alternativas?

Se eligió sobre `innerHTML` e `insertAdjacentHTML` porque esas APIs interpretan
cadenas como HTML. Si una celda externa incluyera marcado malicioso, podría
inyectarse en el navegador del usuario. Como el catálogo no necesita aceptar
HTML enriquecido desde la hoja, crear nodos programáticamente es más seguro,
más verificable y más fácil de defender.

### 5. Asincronía con Fetch API y API de Visualización de Google Sheets

#### ¿Por qué se utiliza?

La Fetch API consume el inventario en tiempo real desde la API de Visualización
de Google Sheets. Esto separa datos y presentación: el negocio puede actualizar
precios, nombres, notas o imágenes en la hoja sin editar el código fuente. El
proyecto usa `AbortController`, validación del payload y una ruta alternativa
por `<script>` para mantener compatibilidad cuando CORS bloquea `fetch`.

#### ¿Por qué se eligió sobre las alternativas?

Se eligió sobre quemar datos estáticos en un arreglo de JavaScript porque eso
duplicaría el inventario y obligaría a desplegar cambios por cada producto
nuevo. Se eligió sobre Axios porque Fetch ya cubre el caso sin librerías. Se
eligió sobre PapaParse porque Google Visualization ya entrega una tabla
estructurada. El resultado es un catálogo vivo, ligero y desacoplado.

### 6. Persistencia de Estados mediante `Web Storage` (`localStorage`)

#### ¿Por qué se utiliza?

Se utiliza `localStorage` para conservar preferencias no sensibles del usuario:
tema visual, búsqueda, público objetivo, marca, orden, notas activas y momento
de uso Día/Noche. La lectura se ejecuta dentro de `try/catch`, valida tipos,
listas permitidas y longitudes, y evita que un valor corrupto rompa la
aplicación al refrescar.

#### ¿Por qué se eligió sobre las alternativas?

Se eligió `localStorage` sobre `sessionStorage` porque las preferencias deben
mantenerse más allá de una sola pestaña o sesión inmediata. Se eligió sobre
cookies porque las cookies viajan en cada petición HTTP y consumen ancho de
banda sin aportar valor para filtros locales. También es mejor que no persistir
nada, porque el usuario no pierde su configuración al recargar.

### 7. Normalización Visual mediante CSS (`aspect-ratio` y `object-fit`)

#### ¿Por qué se utiliza?

Cada tarjeta reserva un contenedor visual cuadrado con `aspect-ratio: 1 / 1`.
La imagen del perfume usa `object-fit: contain`, lo que permite mostrar el frasco
completo sin deformarlo ni cortarlo. Esta normalización mantiene simetría en CSS
Grid, estabiliza la altura de tarjetas y evita que imágenes con proporciones
distintas rompan la composición del catálogo.

#### ¿Por qué se eligió sobre las alternativas?

Se eligió sobre editar manualmente miles de imágenes porque ese proceso no es
escalable. Se eligió sobre forzar `width` y `height` rígidos en HTML porque eso
puede deformar los frascos. También se eligió sobre `object-fit: cover` porque
recortaría partes importantes del producto. CSS resuelve la uniformidad sin
destruir ni rehacer los recursos gráficos.

## Defensa del Motor de Enriquecimiento

El procesamiento recorre las filas de Google Sheets una por una. Si el perfume
coincide con uno de los 13 registros curados, se respetan sus notas, uso, imagen
y descripción. Si es un producto nuevo, el sistema calcula una ruta local
normalizada, infiere notas olfativas desde el texto disponible y genera una
descripción estable. Esto protege los registros iniciales y permite crecimiento
del catálogo sin romper filtros ni tarjetas.

## Defensa del Renderizado Limitado a 12 Tarjetas

El catálogo puede contener miles de productos, pero la interfaz renderiza una
ventana activa de 12 tarjetas mediante `.slice(0, 12)`. Esta barrera reduce peso
visual, mejora rendimiento, evita saturación del DOM y conserva paginación clara.
El usuario sigue teniendo acceso al inventario completo mediante filtros,
búsqueda y controles de página.
