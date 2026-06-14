"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

async function main() {
  const [projectArgument, planArgument] = process.argv.slice(2);

  if (!projectArgument || !planArgument) {
    throw new Error(
      "Uso: node materialize_enrichment_images.js PROJECT_ROOT IMAGE_PLAN_JSON"
    );
  }

  const projectRoot = path.resolve(projectArgument);
  const planPath = path.resolve(planArgument);
  const targetRoot = path.resolve(projectRoot, "img", "perfumes");
  const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
  const placeholderSvg = Buffer.from(`
    <svg width="760" height="600" viewBox="0 0 760 600"
         xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f4efe6"/>
          <stop offset="1" stop-color="#dfd2bd"/>
        </linearGradient>
      </defs>
      <rect width="760" height="600" fill="url(#bg)"/>
      <rect x="250" y="110" width="260" height="300" rx="42"
            fill="none" stroke="#795f42" stroke-width="7"/>
      <rect x="325" y="68" width="110" height="54" rx="14"
            fill="#795f42"/>
      <text x="380" y="280" text-anchor="middle"
            font-family="Georgia, serif" font-size="76"
            font-weight="700" fill="#795f42">AP</text>
      <text x="380" y="490" text-anchor="middle"
            font-family="Arial, sans-serif" font-size="25"
            letter-spacing="3" fill="#503f2e">ARCHIVUM PARFUMS</text>
      <text x="380" y="535" text-anchor="middle"
            font-family="Arial, sans-serif" font-size="21"
            fill="#795f42">Imagen no disponible</text>
    </svg>
  `);
  const placeholder = await sharp(placeholderSvg)
    .webp({ quality: 86 })
    .toBuffer();

  await fs.mkdir(targetRoot, { recursive: true });

  let copied = 0;
  let placeholders = 0;

  for (const item of plan) {
    const target = path.resolve(projectRoot, item.target);

    if (!target.startsWith(`${targetRoot}${path.sep}`)) {
      throw new Error(`Ruta de destino fuera del catálogo: ${item.target}`);
    }

    await fs.mkdir(path.dirname(target), { recursive: true });

    if (item.source) {
      const source = path.resolve(projectRoot, item.source);

      try {
        const metadata = await sharp(source).metadata();
        if (metadata.width === 760 && metadata.height === 600) {
          await fs.copyFile(source, target);
        } else {
          await sharp(source)
            .resize(760, 600, {
              fit: "contain",
              background: "#f4efe6"
            })
            .webp({ quality: 88 })
            .toFile(target);
        }
        copied += 1;
        continue;
      } catch {
        // A missing or invalid source is represented by the neutral placeholder.
      }
    }

    await fs.writeFile(target, placeholder);
    placeholders += 1;
  }

  process.stdout.write(
    JSON.stringify(
      {
        planned: plan.length,
        copied,
        placeholders,
        targetRoot
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
