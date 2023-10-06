import { RSocketConnector } from 'rsocket-core';
import { WasmRsTransport } from '../src/wasmrs-transport';
import path from 'path';
import { Codec } from 'rsocket-messaging';
import { decode, encode } from '@msgpack/msgpack';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { WorkerClientTransport } from '../src/worker-transport.js';
import { WasiOptions, WasiVersions } from '../src/wasi';
import { WasmRsModule } from '../src/node/index.js';
import { RxRequestersFactory } from '@candlecorp/rsocket-adapter-rxjs';
import { interval, map, take } from 'rxjs';
import { Operation, OperationList } from '../src/wasmrs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function newConnector(
  file: string
): Promise<[RSocketConnector, OperationList]> {
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
  const mod = await WasmRsModule.compile(bytes);
  const instance = await mod.instantiate({ wasi });

  const connector = new RSocketConnector({
    setup: {
      keepAlive: 10000,
      lifetime: 20 * 1000,
    },
    transport: new WasmRsTransport({
      instance,
    }),
  });

  console.log({ operations: instance.operations });
  return [connector, instance.operations];
}

export async function newWorker(
  file: string
): Promise<[RSocketConnector, OperationList]> {
  const wasi: WasiOptions = {
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
  const mod = await WasmRsModule.compile(bytes);
  const instance = await mod.instantiate({ wasi });

  const connector = new RSocketConnector({
    setup: {
      keepAlive: 10000,
      lifetime: 20 * 1000,
    },

    transport: new WorkerClientTransport({
      workerUrl: path.join(__dirname, '..', 'dist', 'worker-node.esm.js'),
      module: mod,
      wasi,
      options: {
        wasi,
      },
    }),
  });
  console.log({ operations: instance.operations });
  return [connector, instance.operations];
}

export class MessagePackCodec implements Codec<unknown> {
  readonly mimeType: string = 'application/json';

  decode(buffer: Buffer): unknown {
    return decode(buffer);
  }

  encode(entity: string): Buffer {
    return Buffer.from(encode(entity));
  }
}

export const MESSAGEPACK_CODEC = new MessagePackCodec();

export class JsonCodec implements Codec<unknown> {
  readonly mimeType: string = 'application/json';

  decode(buffer: Buffer): unknown {
    return JSON.parse(buffer.toString('utf-8'));
  }

  encode(entity: string): Buffer {
    return Buffer.from(JSON.stringify(entity));
  }
}

export const JSON_CODEC = new JsonCodec();

export async function testStream(
  op: Operation,
  connector: RSocketConnector
): Promise<null> {
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

    metadata.set(0xca, op.asEncoded());
    let ok: boolean | null = null;
    let i = 0;
    request(rsocket, metadata).subscribe({
      next(response) {
        if (response === `Hello World ${i++}`.split('').reverse().join('')) {
          if (ok !== false) {
            ok = true;
          }
        } else {
          ok = false;
        }
      },
      complete() {
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
}

export async function testRequest(
  op: Operation,
  connector: RSocketConnector
): Promise<null> {
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
}
