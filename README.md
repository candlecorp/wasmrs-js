# WasmRS-JS host

This is a JavaScript implementation of WasmRS's RSocket-over-wasm protocol in JavaScript. It defines two new transports for RSocket-js:

## Usage

Check the `tests/` folder for working examples. Below is a script that combines rsocket, messagepack, rxjs, and wasmrs-js transports to instantiate a WebAssembly module and make a request-response call.

```ts
import { WasiOptions, WasiVersions,WasmRsTransport,WasmRsModule } from '@candlecorp/wasmrs-js';
import { RxRequestersFactory } from '@candlecorp/rsocket-adapter-rxjs';
import { RSocketConnector } from 'rsocket-core';
import { Codec } from 'rsocket-messaging';
import { decode, encode } from '@msgpack/msgpack';

const wasi = {
  version: WasiVersions.SnapshotPreview1,
  args: [],
  env: { RUST_LOG: 'trace' },
  preopens: {
    '/sandbox': __dirname,
  },
  stdin: 0,
  stdout: 1,
  stderr: 2,
};

const bytes = readFileSync(path.join(__dirname, file));

const wasmModule = await WasmRsModule.compile(bytes);
const instance = await wasmModule.instantiate({ wasi });

const connector = new RSocketConnector({
  setup: {
    keepAlive: 10000,
    lifetime: 20 * 1000,
  },
  transport: new WasmRsTransport({
    instance,
  }),
});

class MessagePackCodec implements Codec<unknown> {
  readonly mimeType: string = 'application/x-msgpack';

  decode(buffer: Buffer): unknown {
    return decode(buffer);
  }

  encode(entity: string): Buffer {
    return Buffer.from(encode(entity));
  }
}

const MESSAGEPACK_CODEC = new MessagePackCodec();

const rsocket = await connector.connect();
const request = RxRequestersFactory.requestResponse(
  { message: ['Hello World'] },
  MESSAGEPACK_CODEC,
  MESSAGEPACK_CODEC
);

return new Promise((resolve, reject) => {
  const metadata = new Map();
  metadata.set(0xca, op.asEncoded());
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

```

