/**
 * Loads .env.local then .env into process.env for tsx scripts (Next.js does
 * this itself for the app). Existing environment variables win.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

for (const file of ['.env.local', '.env']) {
  const full = path.join(__dirname, '..', file);
  if (existsSync(full)) process.loadEnvFile(full);
}
