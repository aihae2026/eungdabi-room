"use strict";

// DOCX · HWPX 참고자료를 읽기 위한 최소 ZIP 해제기. 외부 라이브러리 없이 Node 기본 zlib 만 쓴다.
// 사용자가 올린 파일을 서버에서 푸는 것이므로 "압축 폭탄"을 막는 상한을 먼저 건다.
//   - 항목 수, 항목 하나와 전체의 풀린 크기, ZIP64(4GB 이상) 는 받지 않는다.
//   - 필요한 항목만 이름으로 골라 푼다.

const zlib = require("zlib");

const LIMITS = {
  maxEntries: 2000,
  maxEntryBytes: 20 * 1024 * 1024,
  maxTotalBytes: 40 * 1024 * 1024,
};

function zipError(message) {
  const error = new Error(message);
  error.code = "INVALID_ZIP";
  return error;
}

// 파일 끝에서 "중앙 디렉터리 끝(EOCD)" 표식을 찾는다. 뒤에 주석이 최대 65,535바이트 붙을 수 있다.
function findEndOfCentralDirectory(buffer) {
  const minStart = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= minStart; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

// ZIP 안의 항목 목록 [{ name, method, compressedSize, size, localOffset }]
function listZipEntries(buffer, limits = LIMITS) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw zipError("압축 파일 형식이 아닙니다.");
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw zipError("압축 파일 형식이 아닙니다.");
  const count = buffer.readUInt16LE(eocd + 10);
  const dirSize = buffer.readUInt32LE(eocd + 12);
  const dirOffset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || dirOffset === 0xffffffff || dirSize === 0xffffffff) throw zipError("지원하지 않는 대용량 압축 형식입니다.");
  if (count > limits.maxEntries) throw zipError("압축 파일 안의 항목이 너무 많습니다.");
  if (dirOffset + dirSize > buffer.length) throw zipError("압축 파일이 손상되었습니다.");

  const entries = [];
  let p = dirOffset;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== 0x02014b50) throw zipError("압축 파일이 손상되었습니다.");
    const flags = buffer.readUInt16LE(p + 8);
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const size = buffer.readUInt32LE(p + 24);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const nameBytes = buffer.subarray(p + 46, p + 46 + nameLength);
    const name = nameBytes.toString(flags & 0x0800 ? "utf8" : "latin1");
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) throw zipError("지원하지 않는 대용량 압축 형식입니다.");
    if (flags & 0x0001) throw zipError("암호가 걸린 파일은 받을 수 없습니다.");
    entries.push({ name, method, compressedSize, size, localOffset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// 항목 하나를 풀어 Buffer 로 돌려준다 (저장=0, deflate=8 만 지원)
function readZipEntry(buffer, entry, limits = LIMITS) {
  if (entry.size > limits.maxEntryBytes) throw zipError("압축 파일 안의 문서가 너무 큽니다.");
  const p = entry.localOffset;
  if (p + 30 > buffer.length || buffer.readUInt32LE(p) !== 0x04034b50) throw zipError("압축 파일이 손상되었습니다.");
  const start = p + 30 + buffer.readUInt16LE(p + 26) + buffer.readUInt16LE(p + 28);
  const end = start + entry.compressedSize;
  if (end > buffer.length) throw zipError("압축 파일이 손상되었습니다.");
  const data = buffer.subarray(start, end);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) {
    try {
      // maxOutputLength: 선언된 크기를 넘게 풀리면(압축 폭탄) 멈춘다
      return zlib.inflateRawSync(data, { maxOutputLength: Math.min(limits.maxEntryBytes, Math.max(entry.size, 1)) });
    } catch {
      throw zipError("압축 파일 안의 문서를 풀지 못했습니다.");
    }
  }
  throw zipError("지원하지 않는 압축 방식입니다.");
}

// 이름 조건에 맞는 항목들만 풀어 { name: text } 로 돌려준다.
function readZipTexts(buffer, pick, limits = LIMITS) {
  const entries = listZipEntries(buffer, limits);
  const chosen = entries.filter((entry) => pick(entry.name));
  let total = 0;
  const out = {};
  for (const entry of chosen) {
    total += entry.size;
    if (total > limits.maxTotalBytes) throw zipError("압축 파일 안의 문서가 너무 큽니다.");
    out[entry.name] = readZipEntry(buffer, entry, limits).toString("utf8");
  }
  return { entries, texts: out };
}

module.exports = { listZipEntries, readZipEntry, readZipTexts, LIMITS };
