import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pageSchemaModel } from "./index.ts";

const outputUrl = new URL("../../../fixtures/page-schema-v1.json", import.meta.url);
const outputPath = fileURLToPath(outputUrl);

await mkdir(new URL("../../../fixtures/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(pageSchemaModel, null, 2)}\n`, "utf8");

console.log(`Exported ${outputPath}`);

