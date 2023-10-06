declare const self: DedicatedWorkerGlobalScope;
export {};

import { WasmRsInstance } from '../wasmrs.js';
import { WASI } from '../wasi/node.js';
import { main } from './worker.js';

WasmRsInstance.setWasi(WASI);
main(self);
