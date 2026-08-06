import fs from 'fs';
import zlib from 'zlib';

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = -1;
  for (const b of buf) {
    crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function createPng(width, height, drawPixel) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const idx = rowStart + 1 + x * 4;
      const [r, g, b, a] = drawPixel(x, y, width, height);
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([header, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function drawIcon(x, y, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const bg = [11, 11, 11, 255];
  const card = [255, 255, 255, 255];
  const mark = [255, 193, 7, 255];

  const outerRadius = width * 0.42;
  const innerRadius = width * 0.31;
  if (dist > outerRadius) return bg;
  if (dist < innerRadius) {
    const px = (x - width * 0.44) / width;
    const py = (y - height * 0.4) / height;
    const check = px > 0 && py > -0.25 && px < 0.24 && py < 0.24;
    const tick = x > width * 0.45 && x < width * 0.73 && y > height * 0.28 && y < height * 0.62 && (y - height * 0.45) > Math.abs((x - width * 0.55) * 0.6);
    if (check || tick) return mark;
    return card;
  }

  return [33, 33, 33, 255];
}

const sizes = [192, 512];
for (const size of sizes) {
  const image = createPng(size, size, drawIcon);
  fs.writeFileSync(`public/icon-${size}.png`, image);
}
console.log('Generated PWA icons: icon-192.png and icon-512.png');
