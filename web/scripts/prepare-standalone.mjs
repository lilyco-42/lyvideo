import {cpSync, existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
if (!existsSync(standalone)) {
  console.error('standalone build missing: ' + standalone);
  process.exit(1);
}

const staticSrc = path.join(root, '.next', 'static');
const staticDst = path.join(standalone, '.next', 'static');
if (existsSync(staticSrc)) {
  mkdirSync(path.dirname(staticDst), {recursive: true});
  cpSync(staticSrc, staticDst, {recursive: true});
}

const publicSrc = path.join(root, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, path.join(standalone, 'public'), {recursive: true});
}

console.log('standalone prepared:', standalone);