export function fromU32Bytes(bytes: Uint8Array): number {
  return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
}

export function toU32Bytes(num: number): Uint8Array {
  const result = new Uint8Array(4);
  result[0] = (num >> 24) % 256;
  result[1] = (num >> 16) % 256;
  result[2] = (num >> 8) % 256;
  result[3] = num % 256;
  return result;
}

export function toU24Bytes(num: number): Uint8Array {
  const result = new Uint8Array(3);
  result[0] = (num >> 8) >> 8 % 256;
  result[1] = num >> 8 % 256;
  result[2] = num % 256;
  return result;
}

export function fromU24Bytes(bytes: Uint8Array): number {
  return (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
}

export function toU16Bytes(num: number): Uint8Array {
  const result = new Uint8Array(2);
  result[0] = num >> 8 % 256;
  result[1] = num % 256;
  return result;
}

export function fromU16Bytes(bytes: Uint8Array): number {
  return (bytes[0] << 8) | bytes[1];
}
