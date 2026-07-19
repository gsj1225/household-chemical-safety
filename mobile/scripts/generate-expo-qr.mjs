import fs from 'node:fs';
import { toQR } from 'toqr';

const [content, outputPath] = process.argv.slice(2);
if (!content || !outputPath) {
  throw new Error('Usage: node generate-expo-qr.mjs <content> <output.svg>');
}

const matrix = toQR(content);
const size = Math.sqrt(matrix.length);
const quietZone = 4;
const viewSize = size + quietZone * 2;
const modules = [];

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    if (matrix[y * size + x]) {
      modules.push(`<rect x="${x + quietZone}" y="${y + quietZone}" width="1" height="1"/>`);
    }
  }
}

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges">`,
  '<rect width="100%" height="100%" fill="#fff"/>',
  '<g fill="#000">',
  ...modules,
  '</g>',
  '</svg>',
].join('');

fs.writeFileSync(outputPath, svg, 'utf8');
