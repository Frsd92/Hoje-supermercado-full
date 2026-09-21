import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const nextCommand = process.execPath;
const nextPath = path.resolve('node_modules', 'next', 'dist', 'bin', 'next');
const nextArguments = ['dev', '--hostname', '0.0.0.0', '--port', '3003'];
const storePath = path.resolve('scripts', 'store-server.mjs');
let stopping = false;
let child;
let storeChild;

function startNext() {
  if (!storeChild) {
    storeChild = spawn(process.execPath, [storePath], {
      stdio: 'inherit',
      env: process.env,
    });
  }

  child = spawn(nextCommand, [nextPath, ...nextArguments], {
    stdio: 'inherit',
    env: process.env,
  });

  child.once('exit', (code, signal) => {
    if (stopping) return;

    const reason = signal ? `sinal ${signal}` : `código ${code ?? 'desconhecido'}`;
    console.warn(`Servidor Next encerrado (${reason}). Reiniciando em 1 segundo...`);
    setTimeout(startNext, 1000);
  });
}

function stop() {
  if (stopping) return;
  stopping = true;
  child?.kill('SIGINT');
  storeChild?.kill('SIGINT');
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
startNext();