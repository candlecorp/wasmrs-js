/* eslint-disable @typescript-eslint/no-explicit-any */

import DEBUG from 'debug';
import { SetupRequest, SetupResponse } from '../worker-transport.js';
import { FrameEvent, WasmRsInstance, WasmRsModule } from '../wasmrs.js';
const debug = DEBUG('wasmrs:worker');

class WorkerInstance {
  constructor(private instance: WasmRsInstance, scope: any) {
    scope.addEventListener('message', (msg: MessageEvent<Buffer>) => {
      this.handleMessage(msg);
    });
    instance.addEventListener('frame', (e: Event) => {
      const msg = e as FrameEvent;
      scope.postMessage(msg.payload);
    });
    const setupResponse: SetupResponse = {
      success: true,
      operations: instance.operations,
    };
    debug('started');
    scope.postMessage(setupResponse);
  }

  handleMessage(msg: MessageEvent<Buffer>) {
    debug('received frame ');
    this.instance.send(msg.data);
  }
}

export function main(scope: any) {
  DEBUG.enabled('wasmrs:worker*');
  // using {once:true} is inconsistent between node and browser so we need
  // to manually add and remove our bound init listener.
  const init = async (msg: MessageEvent<SetupRequest>) => {
    scope.removeEventListener('message', init);
    debug('received init message %o', { wasi: msg.data.wasi });
    const mod = WasmRsModule.from(msg.data.module);
    const instance = await mod.instantiate({ wasi: msg.data.wasi });
    new WorkerInstance(instance, scope);
  };

  debug('starting');
  scope.addEventListener('message', init);
}
