export interface WASI {
  start(instance: object): void;
  initialize(instance: object): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly wasiImport: NodeJS.Dict<any>;
}
