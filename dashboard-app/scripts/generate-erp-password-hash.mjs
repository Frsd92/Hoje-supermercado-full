import { createErpPasswordHash } from '../features/erp/password.js';

const { stdin, stdout } = process;

if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
  throw new Error('Execute este comando em um terminal interativo para digitar a senha sem exibi-la.');
}

stdout.write('Nova senha do ERP (mínimo 12 caracteres): ');
stdin.setRawMode(true);
stdin.setEncoding('utf8');
stdin.resume();

let password = '';

function finish() {
  stdin.setRawMode(false);
  stdin.pause();
  stdout.write('\n');
}

stdin.on('data', async (chunk) => {
  for (const character of chunk) {
    if (character === '\u0003') {
      finish();
      process.exit(1);
    }
    if (character === '\r' || character === '\n') {
      finish();
      try {
        const hash = await createErpPasswordHash(password);
        stdout.write(`ERP_CEO_PASSWORD_HASH=${hash}\n`);
        stdout.write('Copie o hash para o ambiente local e para as variáveis de ambiente de produção. Não compartilhe a senha.\n');
      } catch (error) {
        stdout.write(`${error.message}\n`);
        process.exitCode = 1;
      }
      password = '';
      return;
    }
    if (character === '\u007f' || character === '\b') {
      password = password.slice(0, -1);
      continue;
    }
    if (character >= ' ') password += character;
  }
});
