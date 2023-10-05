import { RSocketConnector } from 'rsocket-core';
import { WASI } from 'wasi';
import { WasmRsTransport } from '../src/transport';
import path from 'path';
import { Codec } from 'rsocket-messaging';
import { decode, encode } from '@msgpack/msgpack';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function newConnector(file: string): RSocketConnector {
  const wasi = new WASI({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    version: 'preview1',
    args: [],
    env: { RUST_LOG: 'trace' },
    preopens: {
      '/sandbox': __dirname,
    },
    stdin: 0,
    stdout: 1,
    stderr: 2,
  });
  const bytes = readFileSync(path.join(__dirname, file));

  const connector = new RSocketConnector({
    setup: {
      keepAlive: 10000,
      lifetime: 20 * 1000,
    },

    transport: new WasmRsTransport({
      bytes: bytes.buffer,
      options: {
        wasi,
      },
    }),
  });
  return connector;
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
