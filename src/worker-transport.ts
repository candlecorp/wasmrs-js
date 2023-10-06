import Worker from 'web-worker';
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
import { WorkerDuplexConnection } from './worker-connection';
import { Options, WasmRsModule } from './wasmrs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WasiOptions } from './wasi';
import { debug } from './debug';

export interface SetupResponse {
  success: boolean;
}

export interface SetupRequest {
  module: WasmRsModule;
  wasi?: WasiOptions;
}

export type ClientOptions = {
  worker_url: string | URL;
  module: WasmRsModule;
  options?: Options;

  workerFactory?: () => Promise<Worker>;
  debug?: boolean;
};
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class WorkerClientTransport implements ClientTransport {
  private readonly factory: () => Promise<Worker>;

  constructor(options: ClientOptions) {
    this.factory =
      options.workerFactory ??
      (async () => {
        const worker_url =
          options.worker_url || path.join(__dirname, 'worker.js');
        const worker = new Worker(worker_url, { type: 'module' });
        const setupPromise = new Promise<MessageEvent<SetupResponse>>(
          (resolve, reject) => {
            worker.addEventListener('message', resolve, { once: true });
            worker.addEventListener('error', reject, { once: true });
            worker.addEventListener('messageerror', reject, { once: true });
          }
        );

        const setup: SetupRequest = {
          module: options.module,
          wasi: options.options?.wasi,
        };

        worker.postMessage(setup);
        return setupPromise.then((msg) => {
          if (!msg.data.success) {
            throw new Error('failed to setup worker');
          }
          debug('worker started');
          return worker;
        });
      });
  }

  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection> {
    return this.factory().then((worker) => {
      debug('starting worker connection');
      return new WorkerDuplexConnection(
        worker,
        new Deserializer(),
        multiplexerDemultiplexerFactory
      );
    });
  }
}
