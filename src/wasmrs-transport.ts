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
import { WasmRsDuplexConnection } from './wasmrs-connection.js';
import { WasmRsInstance } from './wasmrs.js';

export type ClientOptions = {
  instance: WasmRsInstance;
  debug?: boolean;
};

export class WasmRsTransport implements ClientTransport {
  private readonly instance: WasmRsInstance;

  constructor(private options: ClientOptions) {
    this.instance = options.instance;
  }

  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection> {
    return Promise.resolve(
      new WasmRsDuplexConnection(
        this.instance,
        new Deserializer(),
        multiplexerDemultiplexerFactory
      )
    );
  }
}
