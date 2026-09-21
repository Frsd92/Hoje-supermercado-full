import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const appDirectory = process.cwd();
const workspaceDirectory = path.resolve(appDirectory, '..');
const publicDirectory = path.join(appDirectory, 'public');

await mkdir(publicDirectory, { recursive: true });
await Promise.all([
  cp(path.join(workspaceDirectory, 'index.html'), path.join(publicDirectory, 'index.html')),
  cp(path.join(workspaceDirectory, 'categoria.html'), path.join(publicDirectory, 'categoria.html')),
  cp(path.join(workspaceDirectory, 'category.js'), path.join(publicDirectory, 'category.js')),
  cp(path.join(workspaceDirectory, 'script.js'), path.join(publicDirectory, 'script.js')),
  cp(path.join(workspaceDirectory, 'style.css'), path.join(publicDirectory, 'style.css')),
  cp(path.join(workspaceDirectory, 'imagens'), path.join(publicDirectory, 'imagens'), { recursive: true }),
]);

await rm(path.join(publicDirectory, '.gitkeep'), { force: true });
console.log('Loja estática preparada em dashboard-app/public.');
