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
import { WasmRsDuplexConnection } from './duplex-connection';
import { Options, WasmRsHost, instantiate } from './wasmrs-host';
import { promises } from 'fs';
import { debug } from './debug';
const { readFile } = promises;

export type ClientOptions = {
  path: string;
  hostCreator?: (path: string, options?: Options) => WasmRsHost;
  debug?: boolean;
  options?: Options;
};

export class WasmRsTransport implements ClientTransport {
  private readonly path: string;
  // private readonly factory: (path: string) => WasmRsHost;

  constructor(private options: ClientOptions) {
    this.path = options.path;
    // this.factory = options.wsCreator ?? ((url: string) => new WebSocket(url));
  }

  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection> {
    return new Promise((resolve, reject) => {
      readFile(this.path)
        .then((buffer) => {
          debug(() => [`starting reading bytes from ${this.path}`]);
          return instantiate(buffer, this.options.options).then((instance) => {
            debug(() => [`instantiated wasm from ${this.path}`]);
            resolve(
              new WasmRsDuplexConnection(
                instance,
                new Deserializer(),
                multiplexerDemultiplexerFactory
              )
            );
          });
        })
        .catch(reject);
    });
  }
}
