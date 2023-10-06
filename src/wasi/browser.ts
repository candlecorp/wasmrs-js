import {
  PreopenDirectory,
  File,
  WASI as WasiShim,
} from '@bjorn3/browser_wasi_shim';
import { WasiInterface, WasiOptions } from '../wasi';

export class WASI implements WasiInterface {
  private wasi: WasiShim;
  constructor(options: WasiOptions) {
    const files = Object.entries(options.preopens || {}).map(
      ([to, from]) =>
        new PreopenDirectory(to, {
          'README.md': new File(
            new TextEncoder().encode(
              `# Hello world, this shuold map to ${from}`
            )
          ),
        })
    );
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.wasi = new WasiShim(options.args || [], options.env, files);
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
