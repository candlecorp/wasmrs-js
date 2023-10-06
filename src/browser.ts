export {
  instantiate,
  instantiateStreaming,
  WasmRsInstance as WasmRsHost,
} from './wasmrs.js';
export { WasmRsTransport } from './wasmrs-transport.js';
export { WasmRsDuplexConnection } from './wasmrs-connection.js';
export * as errors from './errors.js';
export { WASI } from './wasi/browser.js';
import { WasmRsInstance } from './wasmrs.js';
import { WASI } from './wasi/browser.js';

WasmRsInstance.setWasi(WASI);
