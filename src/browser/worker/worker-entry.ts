import { WasmRsInstance } from '../../wasmrs.js';
import { WASI } from '../wasi.js';
import { main } from './worker.js';

WasmRsInstance.setWasi(WASI);

main();
