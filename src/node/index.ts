export * from '../common.js';
export * as worker from './worker/worker.js';
import { WasmRsInstance } from '../wasmrs.js';
import { WASI } from './wasi.js';

WasmRsInstance.setWasi(WASI);
