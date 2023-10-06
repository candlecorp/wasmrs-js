import { WasmRsInstance } from '../../wasmrs.js';
import { WASI } from '../wasi.js';
import { main as realMain } from '../../worker/worker.js';

WasmRsInstance.setWasi(WASI);
export const main = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realMain(self as any);
};
