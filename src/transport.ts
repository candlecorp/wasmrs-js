import {
  ClientTransport,
  Closeable,
  Demultiplexer,
  Deserializer,
  DuplexConnection,
  FrameHandler,
  Multiplexer,
  Outbound,
} from 'rsocket-core';
import { WasmRsDuplexConnection } from './duplex-connection.js';
import { Options, WasmRsHost, instantiate } from './wasmrs-host.js';
import { debug } from './debug.js';

export type ClientOptions = {
  bytes?: ArrayBufferLike;
  byteStream?: ReadableStream<Uint8Array>;
  hostCreator?: (path: string, options?: Options) => WasmRsHost;
  debug?: boolean;
  options?: Options;
};

export class WasmRsTransport implements ClientTransport {
  private readonly byteStream?: ReadableStream<ArrayBufferLike>;
  private readonly bytes?: ArrayBufferLike;

  constructor(private options: ClientOptions) {
    this.bytes = options.bytes;
  }

  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection> {
    return new Promise((resolve, reject) => {
      if (this.bytes) {
        debug(`starting reading bytes from memory`);
        instantiate(this.bytes, this.options.options)
          .then((instance) => {
            debug(`instantiated wasm from memory`);
            resolve(
              new WasmRsDuplexConnection(
                instance,
                new Deserializer(),
                multiplexerDemultiplexerFactory
              )
            );
          })
          .catch(reject);
        return;
      } else if (this.byteStream) {
        debug(`instantiating from stream`);
        throw new Error('not implemented');
        // return instantiateStreaming(
        //   new Response(ReadableStream.from(this.byteStream)),
        //   this.options.options
        // ).then((instance) => {
        //   debug(() => [`instantiated wasm from stream`);
        //   resolve(
        //     new WasmRsDuplexConnection(
        //       instance,
        //       new Deserializer(),
        //       multiplexerDemultiplexerFactory
        //     )
        //   );
        // });
      }
    });
  }
}
