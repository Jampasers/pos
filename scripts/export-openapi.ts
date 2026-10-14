import { writeFile } from 'node:fs/promises';
import { createOpenApiDocument } from '../packages/contracts/src/openapi.js';

await writeFile(new URL('../docs/openapi.json', import.meta.url), `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`);
console.info('OpenAPI contracts exported');
