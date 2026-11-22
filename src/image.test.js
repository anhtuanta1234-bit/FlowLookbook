const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { imageDimensionsFromBuffer, imageExtFromBuffer, is2kDimensions, validate2kFile } = require('./image');

test('reads PNG dimensions and recognizes portrait 2K by its long edge', () => {
  const png = Buffer.alloc(24);
  png.write('\x89PNG\r\n\x1a\n', 0, 'binary');
  png.writeUInt32BE(1536, 16);
  png.writeUInt32BE(2752, 20);

  const dimensions = imageDimensionsFromBuffer(png);
  assert.deepEqual(dimensions, { width: 1536, height: 2752 });
  assert.equal(is2kDimensions(dimensions), true);
});

test('reads JPEG dimensions and rejects an undersized image', () => {
  const jpeg = Buffer.alloc(16);
  jpeg[0] = 0xff; jpeg[1] = 0xd8;
  jpeg[2] = 0xff; jpeg[3] = 0xc0;
  jpeg.writeUInt16BE(11, 4);
  jpeg.writeUInt16BE(1536, 7);
  jpeg.writeUInt16BE(1024, 9);

  const dimensions = imageDimensionsFromBuffer(jpeg);
  assert.deepEqual(dimensions, { width: 1024, height: 1536 });
  assert.equal(is2kDimensions(dimensions), false);
  assert.equal(is2kDimensions({ width: 2048, height: 1024 }), true);
});

test('reads extended WebP dimensions', () => {
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'ascii');
  webp.write('WEBP', 8, 'ascii');
  webp.write('VP8X', 12, 'ascii');
  webp.writeUInt32LE(10, 16);
  webp.writeUIntLE(1536 - 1, 24, 3);
  webp.writeUIntLE(2752 - 1, 27, 3);

  assert.deepEqual(imageDimensionsFromBuffer(webp), { width: 1536, height: 2752 });
});

test('unrecognized image data is not treated as 2K', () => {
  assert.equal(imageDimensionsFromBuffer(Buffer.from('not an image')), null);
  assert.equal(is2kDimensions(null), false);
});

test('2K file validation rejects a valid image that is too small', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlookbook-image-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'small.png');
  const png = Buffer.alloc(24);
  png.write('\x89PNG\r\n\x1a\n', 0, 'binary');
  png.writeUInt32BE(1536, 16);
  png.writeUInt32BE(1024, 20);
  fs.writeFileSync(file, png);

  assert.throws(() => validate2kFile(file), /chưa đạt độ phân giải 2K/);
});

test('2K means both a long edge >= 2048 and a short edge >= 1024', () => {
  assert.equal(is2kDimensions({ width: 2048, height: 100 }), false);
  assert.equal(is2kDimensions({ width: 2752, height: 1536 }), true);
  assert.equal(is2kDimensions({ width: 1536, height: 2048 }), true);
  assert.equal(is2kDimensions({ width: 2047, height: 1536 }), false);
});

test('detects the real image format from bytes, not the file name', () => {
  const png = Buffer.alloc(24);
  png.write('\x89PNG\r\n\x1a\n', 0, 'binary');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'ascii');
  webp.write('WEBP', 8, 'ascii');

  assert.equal(imageExtFromBuffer(png), 'png');
  assert.equal(imageExtFromBuffer(jpeg), 'jpg');
  assert.equal(imageExtFromBuffer(webp), 'webp');
  assert.equal(imageExtFromBuffer(Buffer.from('GIF89a')), null);
});

test('validate2kFile accepts a real portrait 2K image', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlookbook-image-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'ok.png');
  const png = Buffer.alloc(24);
  png.write('\x89PNG\r\n\x1a\n', 0, 'binary');
  png.writeUInt32BE(1536, 16);
  png.writeUInt32BE(2752, 20);
  fs.writeFileSync(file, png);

  assert.deepEqual(validate2kFile(file), { width: 1536, height: 2752 });
});
