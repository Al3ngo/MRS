import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/** The worker's source, relative to the project root. */
const TEMPLATE = 'pwa/service-worker.js';
const OUTPUT = 'sw.js';

/** Files in the build output that must not be part of the offline set. */
const SKIP = [/^sw\.js$/, /\.map$/, /(^|\/)\.[^/]+$/];

function listFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, root));
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

/**
 * Writes dist/sw.js after a production build: the worker in pwa/service-worker.js with the list of
 * every built file and a version derived from their contents. Same source, same version; any change
 * to any file, a new version.
 */
export function serviceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'mrm:service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const files = listFiles(outDir)
        .filter((file) => !SKIP.some((pattern) => pattern.test(file)))
        .sort();
      if (!files.includes('index.html')) {
        throw new Error(`service worker: no index.html in ${outDir}, refusing to write ${OUTPUT}`);
      }

      const digest = createHash('sha256');
      for (const file of files) {
        digest.update(file).update('\0').update(readFileSync(join(outDir, file))).update('\0');
      }
      const template = readFileSync(resolve(config.root, TEMPLATE), 'utf8');
      digest.update(template);
      const version = digest.digest('hex').slice(0, 12);

      const worker = template
        .replace("'__SW_VERSION__'", JSON.stringify(version))
        .replace('/* __SW_FILES__ */ []', JSON.stringify(files));
      if (worker.includes('__SW_VERSION__') || worker.includes('__SW_FILES__')) {
        throw new Error('service worker: a placeholder in pwa/service-worker.js was not filled in');
      }
      writeFileSync(join(outDir, OUTPUT), worker);

      const bytes = files.reduce((sum, file) => sum + statSync(join(outDir, file)).size, 0);
      config.logger.info(
        `service worker: ${OUTPUT} v${version}, ${files.length} files, ${(bytes / 1024).toFixed(0)} kB cached for offline play`,
      );
    },
  };
}
