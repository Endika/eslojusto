import { crc32, deflateSync } from 'node:zlib';

const chunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

// A grey PNG of a fictitious page: lines of solid word blocks on paper, like printed text from
// afar, and light enough as JPEG for fifteen to fit one request.
// The defaults read as a sharp, well-lit photo of the usual size; dark paper reads as dark.
export function syntheticPhoto({
  width = 1176,
  height = 1568,
  paper = 225,
  ink = 30,
} = {}): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(width + 1, paper);
    row[0] = 0;
    const line = y > 60 && y < height - 60 && y % 30 < 10;
    if (line)
      for (let x = 60; x < width - 60; x += 1)
        if (Math.floor(x / 70) % 4 !== 3 && x % 70 < 55) row[x + 1] = ink;
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
