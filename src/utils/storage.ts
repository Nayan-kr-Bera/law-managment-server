export const BYTES_PER_GB = 1024 * 1024 * 1024;

export const gbToBytes = (gb: number) =>
  gb * BYTES_PER_GB;

export const bytesToGb = (bytes: number) =>
  bytes / BYTES_PER_GB;