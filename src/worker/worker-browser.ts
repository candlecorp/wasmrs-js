declare const self: DedicatedWorkerGlobalScope;
export {};

import { WasmRsInstance } from '../wasmrs.js';
import { WASI } from '../wasi/browser.js';
import { main } from '../worker/worker.js';

WasmRsInstance.setWasi(WASI);
main(self);
