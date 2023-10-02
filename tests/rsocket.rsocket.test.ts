import { RxRequestersFactory } from 'rsocket-adapter-rxjs';
import { JSON_CODEC, newConnector } from './utils';

describe.skip('rsocket transport impl', () => {
  test('new wasm requestChannel', async () => {
    const connector = newConnector('wasm_guest.wasm');
    const rsocket = await connector.connect();
    const request = RxRequestersFactory.requestResponse(
      { message: ['Hello World'] },
      JSON_CODEC,
      JSON_CODEC
    );

    return new Promise((resolve, reject) => {
      let ok = false;
      request(rsocket).subscribe({
        next(response) {
          expect(response).toBe('Hello! You sent me 1 messages.');
          ok = true;
          resolve(null);
        },
        complete() {
          rsocket.close();
          if (!ok) {
            reject('not completed');
          }
        },
        error(err) {
          reject(err);
        },
      });
    });
  });
});
