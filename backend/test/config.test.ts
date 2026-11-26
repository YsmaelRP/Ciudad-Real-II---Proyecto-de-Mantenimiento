import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config.js';

test('la configuración permite iniciar localmente sin archivo env', () => {
  assert.deepEqual(readConfig({}), {
    host: '127.0.0.1', port: 3001, frontendOrigin: 'http://localhost:8443',
  });
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
