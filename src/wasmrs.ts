import { debug } from './debug.js';
import { HostCallNotImplementedError } from './errors.js';
import {
  GuestProtocolMethods,
  HostProtocolMethods,
  WasmRsGuestProtocol,
  WasmRsHostProtocol,
} from './protocol.js';
import { Wasi, WasiInterface, WasiOptions } from './wasi.js';
import {
  fromU16Bytes,
  fromU24Bytes,
  fromU32Bytes,
  toU24Bytes,
  toU32Bytes,
} from './utils.js';

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
    const mod = WebAssembly.compile(source);
    return new WasmRsModule(await mod);
  }

  static async compileStreaming(source: Response): Promise<WasmRsModule> {
    if (!WebAssembly.compileStreaming) {
      console.warn(
        'WebAssembly.compileStreaming is not supported on this browser, wasm execution will be impacted.'
      );
      const bytes = new Uint8Array(await (await source).arrayBuffer());
      return WasmRsModule.compile(bytes);
    }
    const mod = WebAssembly.compileStreaming(source);
    return new WasmRsModule(await mod);
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
      wasi = await WASI.create(options.wasi);
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
  operations = new OperationList([], []);

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
    const init = this.getProtocolExport(GuestProtocolMethods.INIT);
    const size = 512 * 1024;
    debug(`>>>`, `${GuestProtocolMethods.INIT}(${size},${size},${size})`);
    init(size, size, size);

    const opList = this.getProtocolExport(GuestProtocolMethods.OP_LIST_REQUEST);
    if (opList != null) {
      debug(`>>>`, `${GuestProtocolMethods.OP_LIST_REQUEST}()`);
      opList();
    }

    this.guestSend = this.getProtocolExport(GuestProtocolMethods.SEND);

    this.guestOpListRequest = this.getProtocolExport(
      GuestProtocolMethods.OP_LIST_REQUEST
    );
    debug('initialized wasm module');
  }

  getProtocolExport<N extends keyof WasmRsGuestProtocol>(
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
      debug('<<< __op_list(%o,%o)', ptr, length);
      const buffer = new Uint8Array(instance.getCallerMemory().buffer);
      const bytes = buffer.slice(ptr, ptr + length);
      if (length === 0) {
        return;
      }
      if (bytes.slice(0, 4).toString() !== OP_MAGIC_BYTES.toString()) {
        throw new Error('invalid op_list magic bytes');
      }
      const version = fromU16Bytes(bytes.slice(4, 6));

      debug(`op_list bytes: %o`, bytes);

      if (version == 1) {
        const ops = decodeV1Operations(bytes.slice(6), instance.textDecoder);
        debug('module operations: %o', ops);
        instance.operations = ops;
      }
    },
  };
}

function decodeV1Operations(
  buffer: Uint8Array,
  decoder: TextDecoder
): OperationList {
  const imports = [];
  const exports = [];
  let numOps = fromU32Bytes(buffer.slice(0, 4));
  debug(`decoding %o operations`, numOps);
  let index = 4;

  while (numOps > 0) {
    const kind = buffer[index++];
    const dir = buffer[index++];
    const opIndex = fromU32Bytes(buffer.slice(index, index + 4));
    index += 4;
    const nsLen = fromU16Bytes(buffer.slice(index, index + 2));
    index += 2;
    const namespace = decoder.decode(buffer.slice(index, index + nsLen));
    index += nsLen;
    const opLen = fromU16Bytes(buffer.slice(index, index + 2));
    index += 2;
    const operation = decoder.decode(buffer.slice(index, index + opLen));
    index += opLen;
    const reservedLen = fromU16Bytes(buffer.slice(index, index + 2));
    index += 2 + reservedLen;
    const op = new Operation(opIndex, kind, namespace, operation);
    if (dir === 1) {
      exports.push(op);
    } else {
      imports.push(op);
    }
    numOps--;
  }

  return new OperationList(imports, exports);
}

export class OperationList {
  imports: Operation[];
  exports: Operation[];
  constructor(imports: Operation[], exports: Operation[]) {
    this.imports = imports;
    this.exports = exports;
  }

  getExport(namespace: string, operation: string): Operation {
    const op = this.exports.find(
      (op) => op.namespace === namespace && op.operation === operation
    );

    if (!op) {
      throw new Error(
        `operation ${namespace}::${operation} not found in exports`
      );
    }

    return op;
  }

  getImport(namespace: string, operation: string): Operation {
    const op = this.imports.find(
      (op) => op.namespace === namespace && op.operation === operation
    );

    if (!op) {
      throw new Error(
        `operation ${namespace}::${operation} not found in imports`
      );
    }

    return op;
  }
}

export class Operation {
  index: number;
  kind: OperationType;
  namespace: string;
  operation: string;
  constructor(
    index: number,
    kind: OperationType,
    namespace: string,
    operation: string
  ) {
    this.index = index;
    this.kind = kind;
    this.namespace = namespace;
    this.operation = operation;
  }

  asEncoded(): Uint8Array {
    const index = toU32Bytes(this.index);
    const encoded = new Uint8Array(index.length + 4);
    encoded.set(index);
    encoded.set(toU32Bytes(0), index.length);
    return encoded;
  }
}

enum OperationType {
  RR = 0,
  FNF = 1,
  RS = 2,
  RC = 3,
}

/*

  fn decode_v1(mut buf: Bytes) -> Result<Self, Error> {
    let num_ops = from_u32_bytes(&buf.split_to(4));
    let mut imports = Vec::new();
    let mut exports = Vec::new();
    for _ in 0..num_ops {
      let kind = buf.split_to(1)[0];
      let kind: OperationType = kind.into();
      let dir = buf.split_to(1)[0];
      let index = from_u32_bytes(&buf.split_to(4));
      let ns_len = from_u16_bytes(&buf.split_to(2));
      let namespace = String::from_utf8(buf.split_to(ns_len as _).to_vec())?;
      let op_len = from_u16_bytes(&buf.split_to(2));
      let operation = String::from_utf8(buf.split_to(op_len as _).to_vec())?;
      let _reserved_len = from_u16_bytes(&buf.split_to(2));
      let op = Operation {
        index,
        kind,
        namespace,
        operation,
      };
      if dir == 1 {
        exports.push(op);
      } else {
        imports.push(op);
      }
    }
    Ok(Self { imports, exports })
  }
*/

const OP_MAGIC_BYTES = Uint8Array.from([0x00, 0x77, 0x72, 0x73]);
