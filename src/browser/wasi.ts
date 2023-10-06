// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import {
  PreopenDirectory,
  WASI as WasiShim,
  SyncOPFSFile,
  Fd,
} from '@candlecorp/browser_wasi_shim';
import { WasiInterface, WasiOptions } from '../wasi';

class CallbackFd extends Fd {
  constructor(private fn: (line: string) => void) {
    super();
  }
  fd_write(
    view8: Uint8Array,
    iovs: [wasi.Iovec]
  ): { ret: number; nwritten: number } {
    let nwritten = 0;
    for (const iovec of iovs) {
      const buffer = view8.slice(iovec.buf, iovec.buf + iovec.buf_len);
      this.fn(new TextDecoder().decode(buffer));
      nwritten += iovec.buf_len;
    }
    return { ret: 0, nwritten };
  }
}

class NullFd extends Fd {
  constructor() {
    super();
  }
}

async function openOpfsDirectory(
  root: FileSystemDirectoryHandle,
  to: string
): Promise<PreopenDirectory> {
  const files: Record<string, SyncOPFSFile | PreopenDirectory> = {};

  for await (const [name, item] of root.entries()) {
    console.log({ name, item });
    if (item.kind === 'file') {
      const file = item as FileSystemFileHandle;
      files[name] = new SyncOPFSFile(await file.createSyncAccessHandle());
    } else if (item.kind === 'directory') {
      files[name] = await openOpfsDirectory(item, to + '/' + name);
    } else {
      throw new Error('Unknown item kind: ' + item.kind);
    }
  }
  return new PreopenDirectory(to, files);
}

export class WASI implements WasiInterface {
  constructor(private wasi: WasiShim) {}
  static async create(options: WasiOptions): Promise<WasiInterface> {
    const opfsRoot = await navigator.storage.getDirectory();
    const files: Fd[] = [];

    if (options.stdin === 0) {
      files.push(new NullFd());
    } else if (options.stdin === undefined) {
      files.push(new NullFd());
    } else {
      throw new Error('Unsupported stdin mode');
    }

    if (options.stdout === 1) {
      files.push(new CallbackFd(console.log.bind(console, 'stdout: ')));
    } else if (options.stdin === undefined) {
      files.push(new NullFd());
    } else {
      throw new Error('Unsupported stdout mode');
    }

    if (options.stderr === 2) {
      files.push(new CallbackFd(console.error.bind(console, 'stderr: ')));
    } else if (options.stdin === undefined) {
      files.push(new NullFd());
    } else {
      throw new Error('Unsupported stderr mode');
    }

    for (const [to, from] of Object.entries(options.preopens || {})) {
      if (from.startsWith('opfs:')) {
        const opfsPath = from.slice(5);
        console.log({ opfsPath });
        if (opfsPath === '/') {
          files.push(await openOpfsDirectory(opfsRoot, to));
        } else {
          const root = await opfsRoot.getDirectoryHandle(opfsPath, {
            create: true,
          });
          files.push(await openOpfsDirectory(root, to));
        }
      }
    }
    console.log(files);
    const env = Object.entries(options.env || {}).map(
      ([key, value]) => `${key}=${value}`
    );

    return new WASI(
      new WasiShim(options.args || [], env, files, { debug: true })
    );
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
