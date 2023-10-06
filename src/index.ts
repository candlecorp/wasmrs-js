export {
  instantiate,
  instantiateStreaming,
  WasmRsInstance as WasmRsHost,
  WasmRsModule,
} from './wasmrs.js';
export { WasmRsTransport } from './wasmrs-transport.js';
export { WasmRsDuplexConnection } from './wasmrs-connection.js';
export * as errors from './errors.js';
export { WASI } from './wasi/node.js';

import { WasmRsInstance } from './wasmrs.js';
import { WASI } from './wasi/node.js';

WasmRsInstance.setWasi(WASI);
