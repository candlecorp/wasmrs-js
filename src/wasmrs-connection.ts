/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
import { FrameEvent, WasmRsInstance } from './wasmrs.js';
import DEBUG from 'debug';
export const debug = DEBUG('wasmrs:connection:wasm');

export class WasmRsDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound
{
  readonly multiplexerDemultiplexer: Multiplexer & Demultiplexer & FrameHandler;

  constructor(
    private host: WasmRsInstance,
    private deserializer: Deserializer,
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ) {
    super();
    host.addEventListener('frame', (e) => {
      const event = e as FrameEvent;
      debug(
        `received frame event (%o bytes), %o`,
        event.payload.length,
        event.payload
      );

      const frame = this.deserializer.deserializeFrame(
        Buffer.from(event.payload)
      );
      debug(`decoded to %o`, frame);
      this.handleIncomingFrame(frame);
    });

    this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(this);
  }

  handleIncomingFrame(frame: Frame): void {
    debug(`received frame`, JSON.stringify(frame));

    this.multiplexerDemultiplexer.handle(frame);
  }

  get availability(): number {
    return this.done ? 0 : 1;
  }

  close(error?: Error) {
    if (this.done) {
      debug(`closing wasm connection`, error);
      super.close(error);
      return;
    }

    this.host.close();

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
        debug(
          `responding to keepalive from duplex connection`,
          JSON.stringify(frame)
        );
        if ((frame.flags & Flags.RESPOND) == Flags.RESPOND) {
          frame.flags ^= Flags.RESPOND;
          this.handleIncomingFrame(frame);
        }
        return;
      default:
        debug(`ignoring frame`, JSON.stringify(frame));
        return;
    }

    debug(`sending frame`, JSON.stringify(frame));
    if (this.done) {
      return;
    }

    const buffer = serializeFrame(frame);

    this.host.send(buffer);
  }
}
