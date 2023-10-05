import { debug } from './debug.js';
import * as errors from './errors.js';
import { linkHostExports } from './callbacks.js';
import { HostCallNotImplementedError } from './errors.js';
import { GuestProtocolMethods, WasmRsGuestProtocol } from './protocol.js';
import { WASI } from './wasi.js';
import { toU24Bytes } from './utils.js';

type HostCall = (
  binding: string,
  namespace: string,
  operation: string,
  payload: Uint8Array
) => Uint8Array;
type Writer = (message: string) => void;

interface Invocation {
  operation: string;
  operationEncoded: Uint8Array;
  msg: Uint8Array;
}

class ModuleState {
  guestRequest?: Invocation;
  guestResponse?: Uint8Array;
  hostResponse?: Uint8Array;
  guestError?: string;
  hostError?: string;
  hostCallback: HostCall;
  writer: Writer;

  constructor(hostCall?: HostCall, writer?: Writer) {
    this.hostCallback =
      hostCall ||
      ((binding, namespace, operation) => {
        throw new HostCallNotImplementedError(binding, namespace, operation);
      });
    this.writer = writer || (() => undefined);
  }
}

export class WasmRsHost extends EventTarget {
  guestBufferStart = 0;
  hostBufferStart = 0;

  buffer!: Uint8Array;
  instance!: WebAssembly.Instance;
  state: ModuleState;
  guestSend: WasmRsGuestProtocol[GuestProtocolMethods.SEND];
  guestOpListRequest: WasmRsGuestProtocol[GuestProtocolMethods.OP_LIST_REQUEST];
  textEncoder: TextEncoder;
  textDecoder: TextDecoder;

  constructor(options: Options = {}) {
    super();
    this.state = new ModuleState(options.hostCall, options.writer);
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder('utf-8');
    this.guestSend = () => undefined;
    this.guestOpListRequest = () => undefined;
  }

  async instantiate(source: ArrayBufferLike, wasi?: WASI): Promise<WasmRsHost> {
    const imports = this.getImports(wasi);
    const result = await WebAssembly.instantiate(source, imports).catch((e) => {
      throw new errors.InvalidWasm(e);
    });
    if (wasi) {
      wasi.initialize(result.instance);
    }

    this.initialize(result.instance);

    return this;
  }

  async instantiateStreaming(
    source: Response,
    wasi?: WASI
  ): Promise<WasmRsHost> {
    const imports = this.getImports(wasi);
    if (!WebAssembly.instantiateStreaming) {
      debug(
        'WebAssembly.instantiateStreaming is not supported on this browser, wasm execution will be impacted.'
      );
      const bytes = new Uint8Array(await (await source).arrayBuffer());
      return this.instantiate(bytes, wasi);
    } else {
      const result = await WebAssembly.instantiateStreaming(
        source,
        imports
      ).catch((e) => {
        throw new errors.StreamingFailure(e);
      });
      if (wasi) {
        wasi.start(result.instance);
      }
      this.initialize(result.instance);
      return this;
    }
  }

  getImports(wasi?: WASI): WebAssembly.Imports {
    if (wasi) {
      debug('enabling wasi');
      // This looks like a broken types issue in the wasi module.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return {
        wasi_snapshot_preview1: wasi.wasiImport,
        wasmrs: linkHostExports(this),
      };
    } else {
      debug('disabling wasi');
      return {
        wasmrs: linkHostExports(this),
      };
    }
  }

  initialize(instance: WebAssembly.Instance): void {
    this.instance = instance;
    const start = this.instance.exports[
      GuestProtocolMethods.START
    ] as CallableFunction;
    if (start != null) {
      debug(`>>>`, `${GuestProtocolMethods.START}()`);
      start([]);
    }

    const init = this.getExport(GuestProtocolMethods.INIT);
    const size = 512 * 1024;
    debug(`>>>`, `${GuestProtocolMethods.INIT}(${size},${size},${size})`);
    init(size, size, size);

    this.guestSend = this.getExport(GuestProtocolMethods.SEND);

    this.guestOpListRequest = this.getExport(
      GuestProtocolMethods.OP_LIST_REQUEST
    );
    debug('initialized wasm module');
  }

  getExport<N extends keyof WasmRsGuestProtocol>(
    name: N
  ): WasmRsGuestProtocol[N] {
    const fn = this.instance.exports[name] as unknown as WasmRsGuestProtocol[N];

    if (fn == null) {
      throw new Error(`WebAssembly module does not export ${name}`);
    }
    return fn;
  }

  send(payload: Buffer): void {
    const memory = this.getCallerMemory();
    const buffer = new Uint8Array(memory.buffer);
    debug(
      `writing ${payload.length} bytes to guest memory buffer`,
      payload,
      this.guestBufferStart
    );
    buffer.set(toU24Bytes(payload.length), this.guestBufferStart);
    buffer.set(payload, this.guestBufferStart + 3);
    debug(`>>>`, ` ${GuestProtocolMethods.SEND}(${payload.length})`);
    this.guestSend(payload.length);
  }

  getCallerMemory(): WebAssembly.Memory {
    return this.instance.exports.memory as WebAssembly.Memory;
  }

  close() {
    //
  }
}

export class FrameEvent extends Event {
  constructor(type: string, public payload: Uint8Array) {
    super(type);
  }
}

export interface Options {
  hostCall?: HostCall;
  writer?: Writer;
  wasi?: WASI;
}

export async function instantiate(
  source: ArrayBufferLike,
  options: Options = {}
): Promise<WasmRsHost> {
  const host = new WasmRsHost(options);
  await host.instantiate(source, options.wasi);

  return host;
}

export async function instantiateStreaming(
  source: Response | Promise<Response>,
  options: Options = {}
): Promise<WasmRsHost> {
  const host = new WasmRsHost(options);
  await host.instantiateStreaming(await source, options.wasi);

  return host;
}
