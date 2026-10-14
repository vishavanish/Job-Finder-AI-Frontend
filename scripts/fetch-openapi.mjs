// Refreshes the committed OpenAPI snapshot from a running backend, then
// regenerate types with `npm run gen:api`.
//
//   npm run api:snapshot                         # http://127.0.0.1:8000
//   OPENAPI_URL=https://host/openapi.json npm run api:snapshot
import { writeFile } from "node:fs/promises";

const url = process.env.OPENAPI_URL || "http://127.0.0.1:8000/openapi.json";
const out = new URL("../openapi/backend-openapi.json", import.meta.url);

const res = await fetch(url);
if (!res.ok) {
  console.error(`Could not fetch ${url}: HTTP ${res.status}`);
  process.exit(1);
}
const schema = await res.json();
await writeFile(out, JSON.stringify(schema, null, 2) + "\n");
console.log(`Saved ${Object.keys(schema.paths ?? {}).length} paths from ${url}`);
