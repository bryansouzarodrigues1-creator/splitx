import { copyFile, mkdir } from 'node:fs/promises';

await mkdir(new URL('../dist/vendor/', import.meta.url), { recursive: true });

const files = [
  ['../node_modules/jszip/dist/jszip.min.js', '../dist/vendor/jszip.min.js'],
  ['../node_modules/pdf-lib/dist/pdf-lib.esm.min.js', '../dist/vendor/pdf-lib.esm.min.js'],
  ['../node_modules/pdfjs-dist/build/pdf.min.mjs', '../dist/vendor/pdf.min.mjs'],
  ['../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', '../dist/vendor/pdf.worker.min.mjs']
];

for (const [source, target] of files) {
  await copyFile(new URL(source, import.meta.url), new URL(target, import.meta.url));
}

console.log('Bibliotecas locais preparadas em dist/vendor.');
