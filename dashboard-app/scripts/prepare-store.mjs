import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const appDirectory = process.cwd();
const storeDirectory = path.resolve(appDirectory, '..', 'loja');
const publicDirectory = path.join(appDirectory, 'public');

await mkdir(publicDirectory, { recursive: true });
await Promise.all([
  cp(path.join(storeDirectory, 'index.html'), path.join(publicDirectory, 'index.html')),
  cp(path.join(storeDirectory, 'categoria.html'), path.join(publicDirectory, 'categoria.html')),
  cp(path.join(storeDirectory, 'category.js'), path.join(publicDirectory, 'category.js')),
  cp(path.join(storeDirectory, 'analytics-consent.js'), path.join(publicDirectory, 'analytics-consent.js')),
  cp(path.join(appDirectory, 'lib', 'content-moderation.js'), path.join(publicDirectory, 'content-moderation.js')),
  cp(path.join(storeDirectory, 'script.js'), path.join(publicDirectory, 'script.js')),
  cp(path.join(storeDirectory, 'pwa-register.js'), path.join(publicDirectory, 'pwa-register.js')),
  cp(path.join(storeDirectory, 'service-worker.js'), path.join(publicDirectory, 'service-worker.js')),
  cp(path.join(storeDirectory, 'manifest.webmanifest'), path.join(publicDirectory, 'manifest.webmanifest')),
  cp(path.join(storeDirectory, 'offline.html'), path.join(publicDirectory, 'offline.html')),
  cp(path.join(storeDirectory, 'style.css'), path.join(publicDirectory, 'style.css')),
  cp(path.join(storeDirectory, 'politica-de-privacidade.html'), path.join(publicDirectory, 'politica-de-privacidade.html')),
  cp(path.join(storeDirectory, 'termos-de-uso.html'), path.join(publicDirectory, 'termos-de-uso.html')),
  cp(path.join(storeDirectory, 'robots.txt'), path.join(publicDirectory, 'robots.txt')),
  cp(path.join(storeDirectory, 'sitemap.xml'), path.join(publicDirectory, 'sitemap.xml')),
  cp(path.join(storeDirectory, 'imagens'), path.join(publicDirectory, 'imagens'), { recursive: true }),
]);

await rm(path.join(publicDirectory, '.gitkeep'), { force: true });
console.log('Loja estática preparada em dashboard-app/public.');
