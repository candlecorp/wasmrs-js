export enum HostProtocolMethods {
  OP_LIST = '__op_list',
  INIT_BUFFERS = '__init_buffers',
  CONSOLE_LOG = '__console_log',
  SEND = '__send',
}

export interface WasmRsHostProtocol {
  [HostProtocolMethods.CONSOLE_LOG](ptr: number, len: number): void;
  [HostProtocolMethods.INIT_BUFFERS](
    guestBufferPtr: number,
    hostBufferPtr: number
  ): void;
  [HostProtocolMethods.SEND](length: number): void;
  [HostProtocolMethods.OP_LIST](ptr: number, length: number): void;
}

export enum GuestProtocolMethods {
  START = '_start',
  OP_LIST_REQUEST = '__wasmrs_op_list_request',
  INIT = '__wasmrs_init',
  SEND = '__wasmrs_send',
}

export interface WasmRsGuestProtocol {
  [GuestProtocolMethods.START](): void;
  [GuestProtocolMethods.OP_LIST_REQUEST](): void;
  [GuestProtocolMethods.INIT](guest: number, host: number, mtu: number): void;
  [GuestProtocolMethods.SEND](length: number): void;
}
