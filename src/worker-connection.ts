import Worker from 'web-worker';

import {
  Closeable,
  Deferred,
  Demultiplexer,
  Deserializer,
  DuplexConnection,
  Flags,
  Frame,
  FrameHandler,
  FrameTypes,
  Multiplexer,
  Outbound,
  serializeFrame,
} from 'rsocket-core';
import DEBUG from 'debug';
export const debug = DEBUG('wasmrs:connection:worker');

export class WorkerDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound
{
  readonly multiplexerDemultiplexer: Multiplexer & Demultiplexer & FrameHandler;

  constructor(
    private worker: Worker,
    private deserializer: Deserializer,
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ) {
    super();

    worker.addEventListener('error', this.handleError);
    worker.addEventListener('message', this.handleMessage);
    worker.addEventListener('messageerror', this.handleMessageError);

    this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(this);
  }

  get availability(): number {
    return this.done ? 0 : 1;
  }

  close(error?: Error) {
    debug('closing worker connection');
    if (this.done) {
      super.close(error);
      return;
    }

    this.worker.removeEventListener('error', this.handleError);
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('messageerror', this.handleMessageError);
    this.worker.terminate();

    super.close(error);
  }

  send(frame: Frame): void {
    // Only send frame types supported by WasmRS
    switch (frame.type) {
      case FrameTypes.REQUEST_RESPONSE:
      case FrameTypes.REQUEST_CHANNEL:
      case FrameTypes.REQUEST_FNF:
      case FrameTypes.REQUEST_STREAM:
      case FrameTypes.REQUEST_N:
      case FrameTypes.CANCEL:
      case FrameTypes.ERROR:
      case FrameTypes.PAYLOAD:
        break;
      case FrameTypes.KEEPALIVE:
        if ((frame.flags & Flags.RESPOND) == Flags.RESPOND) {
          frame.flags ^= Flags.RESPOND;

          this.multiplexerDemultiplexer.handle(frame);
        }
        return;
      default:
        debug(`ignoring frame`, JSON.stringify(frame));
        return;
    }

    if (this.done) {
      debug(`notice: got frame after connection complete`);
      return;
    }

    const buffer = serializeFrame(frame);

    debug(`sending frame`, JSON.stringify(frame));
    this.worker.postMessage(buffer);
  }

  private handleError = (e: ErrorEvent): void => {
    debug('error in worker: %o', e);
    this.close(new Error(e.message));
  };

  private handleMessageError = (e: MessageEvent): void => {
    debug('error handling message from worker: %o', e);
    this.close(e.data);
  };

  private handleMessage = (message: MessageEvent): void => {
    try {
      const buffer = Buffer.from(message.data);
      const frame = this.deserializer.deserializeFrame(buffer);
      debug('got frame from worker %o', frame);

      this.multiplexerDemultiplexer.handle(frame);
    } catch (error: unknown) {
      debug('error handling message from worker: %s from: %o', error, message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.close(error as any);
    }
  };
}
