import { debug } from './debug.js';
import { HostProtocolMethods, WasmRsHostProtocol } from './protocol.js';
import { fromU24Bytes } from './utils.js';
import { FrameEvent, WasmRsHost } from './wasmrs-host.js';

export function linkHostExports(
  instance: WasmRsHost
): WasmRsHostProtocol & WebAssembly.ModuleImports {
  return {
    [HostProtocolMethods.CONSOLE_LOG](ptr: number, len: number) {
      debug('<<< __console_log %o bytes @ %o', len, ptr);
      const buffer = new Uint8Array(instance.getCallerMemory().buffer);
      const bytes = buffer.slice(ptr, ptr + len);
      console.log(instance.textDecoder.decode(bytes));
    },

    [HostProtocolMethods.INIT_BUFFERS](
      guestBufferPtr: number,
      hostBufferPtr: number
    ): void {
      debug('<<< __init_buffers(%o, %o)', guestBufferPtr, hostBufferPtr);
      instance.guestBufferStart = guestBufferPtr;
      instance.hostBufferStart = hostBufferPtr;
    },

    [HostProtocolMethods.SEND](length: number) {
      debug('<<< __send(%o)', length);

      const buffer = new Uint8Array(instance.getCallerMemory().buffer);
      const bytes = buffer.slice(
        instance.hostBufferStart,
        instance.hostBufferStart + length
      );

      debug(
        `onFrame ${bytes.length} bytes`,
        Array.from(bytes)
          .map((n) => {
            if (n > 16 && n < 127) {
              return String.fromCharCode(n);
            } else {
              return `\\x${n.toString(16)}`;
            }
          })
          .join('')
      );
      let done = false;
      let index = 0;
      while (!done) {
        const len = fromU24Bytes(bytes.slice(index, 3));
        const frame = bytes.slice(index + 3, index + 3 + len);
        instance.dispatchEvent(new FrameEvent('frame', frame));
        index += 3 + len;
        done = index >= bytes.length;
      }
    },

    [HostProtocolMethods.OP_LIST](ptr: number, length: number) {
      debug('<<< __op_list(%o)', ptr);

      const mem = instance.getCallerMemory();
      const buffer = new Uint8Array(mem.buffer);
      const opListData = instance.textDecoder.decode(
        buffer.slice(ptr, ptr + length)
      );
      debug(`${opListData}`);
    },
  };
}
