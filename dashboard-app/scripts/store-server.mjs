import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'loja');
const port = 5500;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const server = http.createServer(async (request, response) => {
  const requestedPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.slice(1);
  const filePath = path.resolve(rootDirectory, relativePath);

  if (!filePath.startsWith(`${rootDirectory}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Loja: http://localhost:${port}`);
});

process.once('SIGINT', () => server.close(() => process.exit(0)));
process.once('SIGTERM', () => server.close(() => process.exit(0)));