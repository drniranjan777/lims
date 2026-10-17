import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env';

/** `next dev` with the e2e build directory points next-env.d.ts at .next-e2e — point it back at .next. */
export default function globalTeardown() {
  const file = path.join(ROOT, 'apps/web/next-env.d.ts');
  if (fs.existsSync(file)) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('./.next-e2e/types/', './.next/types/'));
}
