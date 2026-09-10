import { deflateSync } from 'node:zlib';

export function createStandardItemAuditPng(seed: string): Buffer {
  const width = 256;
  const height = 256;
  const hash = [...seed].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 17);
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * (width * 4 + 1);
    pixels[rowOffset] = 0;
    for (let column = 0; column < width; column += 1) {
      const pixelOffset = rowOffset + 1 + column * 4;
      const checker = (Math.floor(row / 32) + Math.floor(column / 32)) % 2;
      pixels[pixelOffset] = checker ? hash & 0xff : 255 - (hash & 0xff);
      pixels[pixelOffset + 1] = checker ? (hash >>> 8) & 0xff : 255 - ((hash >>> 8) & 0xff);
      pixels[pixelOffset + 2] = (column + row + ((hash >>> 16) & 0xff)) % 256;
      pixels[pixelOffset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    standardItemPngChunk('IHDR', header),
    standardItemPngChunk('IDAT', deflateSync(pixels)),
    standardItemPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function standardItemPngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBytes, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(standardItemPngCrc32(payload), 8 + data.length);
  return chunk;
}

function standardItemPngCrc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

