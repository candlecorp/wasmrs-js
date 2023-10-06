import { WASI as NodeWasi } from 'wasi';
import { WasiInterface, WasiOptions } from '../wasi';

export class WASI implements WasiInterface {
  private wasi: NodeWasi;
  constructor(options: WasiOptions) {
    this.wasi = new NodeWasi(options);
  }
  create(options: WasiOptions): WasiInterface {
    return new WASI(options);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  start(instance: any): void {
    this.wasi.start(instance);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialize(instance: any): void {
    this.wasi.initialize(instance);
  }

  getImports(): WebAssembly.ModuleImports {
    return this.wasi.wasiImport;
  }
}
