import { debug } from './debug.js';
import { HostCallNotImplementedError } from './errors.js';
import {
  GuestProtocolMethods,
  HostProtocolMethods,
  WasmRsGuestProtocol,
  WasmRsHostProtocol,
} from './protocol.js';
import { Wasi, WasiInterface, WasiOptions } from './wasi.js';
import { fromU24Bytes, toU24Bytes } from './utils.js';

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

let WASI: Wasi | undefined = undefined;

export class WasmRsModule {
  constructor(private module: WebAssembly.Module) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static from(any: any): WasmRsModule {
    if (any instanceof WasmRsModule) {
      return any;
    }
    if (any instanceof WebAssembly.Module) {
      return new WasmRsModule(any);
    }
    if ('module' in any && any.module instanceof WebAssembly.Module) {
      return new WasmRsModule(any.module);
    }
    throw new Error(`cannot convert ${any} to WasmRsModule`);
  }

  static async compile(source: ArrayBufferLike): Promise<WasmRsModule> {
    const module = WebAssembly.compile(source);
    return new WasmRsModule(await module);
  }

  static async compileStreaming(source: Response): Promise<WasmRsModule> {
    if (!WebAssembly.compileStreaming) {
      console.warn(
        'WebAssembly.compileStreaming is not supported on this browser, wasm execution will be impacted.'
      );
      const bytes = new Uint8Array(await (await source).arrayBuffer());
      return WasmRsModule.compile(bytes);
    }
    const module = WebAssembly.compileStreaming(source);
    return new WasmRsModule(await module);
  }

  async instantiate(options: Options = {}): Promise<WasmRsInstance> {
    const host = new WasmRsInstance(options);
    let wasi: WasiInterface | undefined = undefined;
    if (options.wasi) {
      if (!WASI) {
        throw new Error(
          'Wasi options provided but no WASI implementation found'
        );
      }
      wasi = new WASI(options.wasi);
    }
    const imports = linkImports(host, wasi);
    debug('instantiating wasm module');
    const instance = await WebAssembly.instantiate(this.module, imports);
    if (wasi) {
      wasi.initialize(instance);
    }
    await host.initialize(instance);

    return host;
  }
}

export class WasmRsInstance extends EventTarget {
  guestBufferStart = 0;
  hostBufferStart = 0;

  state: ModuleState;
  guestSend: WasmRsGuestProtocol[GuestProtocolMethods.SEND];
  guestOpListRequest: WasmRsGuestProtocol[GuestProtocolMethods.OP_LIST_REQUEST];
  textEncoder: TextEncoder;
  textDecoder: TextDecoder;
  instance!: WebAssembly.Instance;

  constructor(options: Options = {}) {
    super();
    this.state = new ModuleState(options.hostCall, options.writer);
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder('utf-8');
    this.guestSend = () => undefined;
    this.guestOpListRequest = () => undefined;
  }

  static setWasi(wasi: Wasi): void {
    WASI = wasi;
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

function linkImports(
  instance: WasmRsInstance,
  wasi?: WasiInterface
): WebAssembly.Imports {
  if (wasi) {
    debug('enabling wasi');
    // This looks like a broken types issue in the wasi module.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return {
      wasi_snapshot_preview1: wasi.getImports(),
      wasmrs: linkHostExports(instance),
    };
  } else {
    debug('disabling wasi');
    return {
      wasmrs: linkHostExports(instance),
    };
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
  wasi?: WasiOptions;
}

export async function instantiate(
  source: ArrayBufferLike,
  options: Options = {}
): Promise<WasmRsInstance> {
  const module = await WasmRsModule.compile(source);
  return await module.instantiate(options);
}

export async function instantiateStreaming(
  source: Response | Promise<Response>,
  options: Options = {}
): Promise<WasmRsInstance> {
  const module = await WasmRsModule.compileStreaming(await source);
  return await module.instantiate(options);
}

function linkHostExports(
  instance: WasmRsInstance
): WasmRsHostProtocol & WebAssembly.ModuleImports {
  return {
    [HostProtocolMethods.CONSOLE_LOG](ptr: number, len: number) {
      debug('<<< __console_log %o bytes @ %o', len, ptr);
      const buffer = new Uint8Array(instance.getCallerMemory().buffer);
      const bytes = buffer.slice(ptr, ptr + len);
      console.log(instance.textDecoder.decode(bytes));
    },

    [HostProtocolMethods.INIT_BUFFERS](
      guestBufferPtr: number,
      hostBufferPtr: number
    ): void {
      debug('<<< __init_buffers(%o, %o)', guestBufferPtr, hostBufferPtr);
      instance.guestBufferStart = guestBufferPtr;
      instance.hostBufferStart = hostBufferPtr;
    },

    [HostProtocolMethods.SEND](length: number) {
      debug('<<< __send(%o)', length);

      const buffer = new Uint8Array(instance.getCallerMemory().buffer);
      const bytes = buffer.slice(
        instance.hostBufferStart,
        instance.hostBufferStart + length
      );

      debug(
        `'frame' event: ${bytes.length} bytes`,
        Array.from(bytes)
          .map((n) => {
            if (n > 16 && n < 127) {
              return String.fromCharCode(n);
            } else {
              return `\\x${n.toString(16)}`;
            }
          })
          .join('')
      );
      let done = false;
      let index = 0;
      while (!done) {
        const len = fromU24Bytes(bytes.slice(index, 3));
        const frame = bytes.slice(index + 3, index + 3 + len);
        instance.dispatchEvent(new FrameEvent('frame', frame));
        index += 3 + len;
        done = index >= bytes.length;
      }
    },

    [HostProtocolMethods.OP_LIST](ptr: number, length: number) {
      debug('<<< __op_list(%o)', ptr);

      const mem = instance.getCallerMemory();
      const buffer = new Uint8Array(mem.buffer);
      const opListData = instance.textDecoder.decode(
        buffer.slice(ptr, ptr + length)
      );
      debug(`${opListData}`);
    },
  };
}
