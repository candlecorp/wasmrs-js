import { RxRequestersFactory } from 'rsocket-adapter-rxjs';
import { MESSAGEPACK_CODEC, newConnector } from './utils';
import { interval, map, take } from 'rxjs';

describe.skip('wasmrs impl', () => {
  test('baseline.wasm requestResponse', async () => {
    const connector = newConnector('baseline.wasm');

    const rsocket = await connector.connect();
    const request = RxRequestersFactory.requestResponse(
      { message: ['Hello World'] },
      MESSAGEPACK_CODEC,
      MESSAGEPACK_CODEC
    );

    return new Promise((resolve, reject) => {
      const metadata = new Map();
      metadata.set(-1, Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]));
      let ok = false;
      request(rsocket, metadata).subscribe({
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

  test('baseline.wasm requestChannel', async () => {
    const connector = newConnector('baseline.wasm');

    const rsocket = await connector.connect();
    const request = RxRequestersFactory.requestChannel(
      interval(10)
        .pipe(take(50))
        .pipe(map((i) => `Hello World ${i}`)),
      MESSAGEPACK_CODEC,
      MESSAGEPACK_CODEC
    );

    return new Promise((resolve, reject) => {
      const metadata = new Map();
      metadata.set(-1, Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]));
      let ok: boolean | null = null;
      let i = 0;
      request(rsocket, metadata).subscribe({
        next(response) {
          console.log({ response });
          if (response === `Hello World ${i++}`.split('').reverse().join('')) {
            if (ok !== false) {
              ok = true;
            }
          } else {
            ok = false;
          }
        },
        complete() {
          console.log('done');
          rsocket.close();
          if (ok) {
            resolve(null);
          } else {
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
