import { newConnector, newWorker, testRequest, testStream } from './utils';

describe('wasmrs', () => {
  test('dummy test to disable jest magic', async () => {
    expect(1).toBe(1);
  });

  const wasmfile = 'baseline.wasm';

  describe('wasm transport', () => {
    test(`${wasmfile} requestResponse`, async () => {
      const [connector, ops] = await newConnector(wasmfile);
      await testRequest(ops.getExport('greeting', 'sayHello'), connector);
    });

    test(`${wasmfile} requestChannel`, async () => {
      const [connector, ops] = await newConnector(wasmfile);

      await testStream(ops.getExport('echo', 'reverse'), connector);
    });
  });

  describe('worker transport', () => {
    test(`${wasmfile} requestResponse`, async () => {
      const [connector, ops] = await newWorker(wasmfile);
      await testRequest(ops.getExport('greeting', 'sayHello'), connector);
    });

    test(`${wasmfile} requestChannel`, async () => {
      const [connector, ops] = await newWorker(wasmfile);

      await testStream(ops.getExport('echo', 'reverse'), connector);
    });
  });
});
