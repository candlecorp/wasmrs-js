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
import { WorkerDuplexConnection } from './worker-connection.js';
import { OperationList, Options, WasmRsModule } from './wasmrs.js';
import { WasiOptions } from './wasi.js';
import { debug } from './debug.js';
import Worker from 'web-worker';

export interface SetupResponse {
  success: boolean;
  operations: OperationList;
}

export interface SetupRequest {
  module: WasmRsModule;
  wasi?: WasiOptions;
}

export type ClientOptions = {
  options?: Options;
  module: WasmRsModule;
  wasi?: WasiOptions;
  workerUrl: string | URL;

  workerFactory?: () => Promise<Worker>;
  debug?: boolean;
};

export class WorkerClientTransport implements ClientTransport {
  private readonly factory: () => Promise<Worker>;
  module: WasmRsModule;
  wasiOptions?: WasiOptions;

  constructor(options: ClientOptions) {
    this.module = options.module;
    this.wasiOptions = options.wasi;
    if (!options.workerFactory && options.workerUrl) {
      this.factory = async () => {
        const workerUrl = options.workerUrl;
        const worker = new Worker(workerUrl, { type: 'module' });
        return worker;
      };
    } else if (options.workerFactory && !options.workerUrl) {
      this.factory = options.workerFactory;
    } else {
      throw new Error(
        'WorkerClientTransport requires either a workerFactory or a workerOptions'
      );
    }
  }

  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection> {
    return this.factory().then((worker) => {
      const promise: Promise<Worker> = new Promise((res, rej) => {
        const resolve = (msg: MessageEvent<SetupResponse>) => {
          debug('received setup response %o', msg.data);
          worker.removeEventListener('message', resolve);
          worker.removeEventListener('error', reject);
          worker.removeEventListener('messageerror', reject);
          res(worker);
        };
        const reject = (msg: unknown) => {
          debug('failed to initialize worker %o', msg);
          worker.removeEventListener('message', resolve);
          worker.removeEventListener('error', reject);
          worker.removeEventListener('messageerror', reject);
          worker.terminate();

          rej(msg);
        };
        worker.addEventListener('message', resolve);
        worker.addEventListener('error', reject);
        worker.addEventListener('messageerror', reject);
      });
      const setup: SetupRequest = {
        module: this.module,
        wasi: this.wasiOptions,
      };
      worker.postMessage(setup);
      return promise.then((worker) => {
        debug('starting worker connection');
        return new WorkerDuplexConnection(
          worker,
          new Deserializer(),
          multiplexerDemultiplexerFactory
        );
      });
    });
  }
}
