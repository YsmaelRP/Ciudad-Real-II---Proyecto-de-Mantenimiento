import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config.js';

test('la configuración permite iniciar localmente sin archivo env', () => {
  assert.deepEqual(readConfig({}), {
    host: '127.0.0.1', port: 3001, frontendOrigin: 'http://localhost:8443', databaseUrl: undefined,
  });
});

test('valida DATABASE_URL sin incluir credenciales en los errores', () => {
  assert.equal(readConfig({ DATABASE_URL: '' }).databaseUrl, undefined);
  const url = 'postgresql://usuario:clave-ficticia@localhost:5432/ciudad_real_ii';
  assert.equal(readConfig({ DATABASE_URL: url }).databaseUrl, url);
  for (const value of ['no-es-una-url', 'https://usuario:clave-ficticia@localhost/base', 'postgresql://localhost']) {
    assert.throws(() => readConfig({ DATABASE_URL: value }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DATABASE_URL/);
      assert.ok(!error.message.includes('clave-ficticia'));
      return true;
    });
  }
});

test('rechaza puertos inválidos', () => {
  for (const port of ['', '0', '-1', '65536', '3.5', '3001abc']) {
    assert.throws(() => readConfig({ PORT: port }), /PORT/);
  }
});

test('rechaza host vacío y orígenes con ruta o protocolo no HTTP', () => {
  assert.throws(() => readConfig({ HOST: ' ' }), /HOST/);
  for (const origin of ['*', '', 'ftp://localhost', 'http://localhost:8443/api']) {
    assert.throws(() => readConfig({ FRONTEND_ORIGIN: origin }), /FRONTEND_ORIGIN/);
  }
});
