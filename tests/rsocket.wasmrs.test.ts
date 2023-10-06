import { newConnector, newWorker, testRequest, testStream } from './utils';

describe('wasmrs', () => {
  test('dummy test to disable jest magic', async () => {
    expect(1).toBe(1);
  });

  const wasmfile = 'baseline.wasm';

  describe('wasm transport', () => {
    test(`${wasmfile} requestResponse`, async () => {
      const connector = await newConnector(wasmfile);
      await testRequest(connector);
    });

    test(`${wasmfile} requestChannel`, async () => {
      const connector = await newConnector(wasmfile);

      await testStream(connector);
    });
  });

  describe('worker transport', () => {
    test(`${wasmfile} requestResponse`, async () => {
      const connector = await newWorker(wasmfile);
      await testRequest(connector);
    });

    test(`${wasmfile} requestChannel`, async () => {
      const connector = await newWorker(wasmfile);

      await testStream(connector);
    });
  });
});
