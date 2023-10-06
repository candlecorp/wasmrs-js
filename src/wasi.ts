export interface WasiInterface {
  start(instance: object): void;
  initialize(instance: object): void;
  getImports(): WebAssembly.ModuleImports;
}

export type Wasi = new (options: WasiOptions) => WasiInterface;

export type WasiOptions = WasiV1Options;

export enum WasiVersions {
  SnapshotPreview1 = 'preview1',
}

export interface WasiV1Options {
  version: WasiVersions.SnapshotPreview1;
  args?: string[];
  env?: Record<string, string>;
  preopens?: Record<string, string>;
  stdin?: number | undefined;
  stdout?: number | undefined;
  stderr?: number | undefined;
}
