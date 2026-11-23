const fs = require('fs');

function imageDimensionsFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) { i++; continue; }
      const marker = buffer[i + 1];
      i += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (i + 4 > buffer.length) break;
      const length = buffer.readUInt16BE(i);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(i + 3), width: buffer.readUInt16BE(i + 5) };
      }
      if (length < 2) break;
      i += length;
    }
  }

  if (buffer.length >= 30 && buffer.toString('ascii', 8, 12) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const kind = buffer.toString('ascii', offset, offset + 4);
      const length = buffer.readUInt32LE(offset + 4);
      const data = offset + 8;
      if (data + length > buffer.length) break;
      if (kind === 'VP8X' && length >= 10) {
        return {
          width: 1 + buffer[data + 4] + (buffer[data + 5] << 8) + (buffer[data + 6] << 16),
          height: 1 + buffer[data + 7] + (buffer[data + 8] << 8) + (buffer[data + 9] << 16),
        };
      }
      if (kind === 'VP8 ' && length >= 10 && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
        return {
          width: buffer.readUInt16LE(data + 6) & 0x3fff,
          height: buffer.readUInt16LE(data + 8) & 0x3fff,
        };
      }
      if (kind === 'VP8L' && length >= 5 && buffer[data] === 0x2f) {
        return {
          width: 1 + (((buffer[data + 2] & 0x3f) << 8) | buffer[data + 1]),
          height: 1 + (((buffer[data + 4] & 0x0f) << 10) | (buffer[data + 3] << 2) | ((buffer[data + 2] & 0xc0) >> 6)),
        };
      }
      offset = data + length + (length & 1);
    }
  }

  return null;
}

function imageDimensions(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const stat = fs.fstatSync(fd);
    // Chỉ cần phần đầu file (PNG/JPEG/WebP đều ghi kích thước ở header).
    // Đọc tối đa 256 KB thay vì cả ảnh 2K vài MB — rất quan trọng khi quét nhiều ảnh song song.
    const n = Math.min(stat.size, 256 * 1024);
    const buf = Buffer.alloc(n);
    const got = fs.readSync(fd, buf, 0, n, 0);
    const head = got === n ? buf : buf.subarray(0, got);
    let size = imageDimensionsFromBuffer(head);
    // Trường hợp hiếm: JPEG có EXIF thumbnail lớn đẩy marker kích thước ra sau 256 KB.
    if (!size && stat.size > n) size = imageDimensionsFromBuffer(fs.readFileSync(file));
    return size;
  } catch (_) {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
  }
}

// Đuôi file thật theo nội dung (không tin tên file người dùng tải lên).
function imageExtFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function is2kDimensions(size) {
  if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height)) return false;
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  // 2K thật: cạnh dài >= 2048 VÀ cạnh ngắn >= 1024 (loại ảnh dải 2048×100, ảnh dẹt…).
  return long >= 2048 && short >= 1024;
}

// Ảnh ĐÃ CHỌN / cắt gọn dùng làm tham chiếu cho bước sau: vẫn cần cạnh dài 2K,
// nhưng cạnh ngắn chỉ cần 512px — cắt sát hai bên từ bản 2K vẫn giữ đủ chi tiết.
// Chuẩn 2K của ảnh tải về / tự tải (is2kDimensions, validate2kFile) GIỮ NGUYÊN 1024px.
const REFERENCE_SHORT_EDGE = 512;
function is2kForReference(size) {
  if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height)) return false;
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  return long >= 2048 && short >= REFERENCE_SHORT_EDGE;
}

function validate2kFile(file) {
  const size = imageDimensions(file);
  if (!size) throw new Error('File không phải ảnh JPEG, PNG hoặc WebP hợp lệ.');
  if (!is2kDimensions(size)) {
    throw new Error(`Ảnh ${size.width}×${size.height}, chưa đạt độ phân giải 2K (cạnh dài cần ít nhất 2048 px và cạnh ngắn ít nhất 1024 px).`);
  }
  return size;
}

module.exports = { imageDimensionsFromBuffer, imageDimensions, imageExtFromBuffer, is2kDimensions, is2kForReference, validate2kFile };
