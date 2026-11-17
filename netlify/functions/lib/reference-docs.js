"use strict";

// STEP 4 참고자료 받기. 받는 형식: 텍스트 PDF · DOCX · HWPX (최대 5개 · 합계 3.5MB)
//   - 텍스트 PDF: AI 에 파일 그대로 보낸다 (AI 가 글자와 쪽 이미지를 함께 본다).
//     스캔한 PDF 는 글자 인식 오류가 생기므로 받지 않는다. 암호가 걸린 PDF 도 받지 않는다.
//   - DOCX · HWPX: 서버가 글자로 풀어서 보낸다. 표는 셀 단위로 살린다. 어느 AI 제공사든 똑같이 받을 수 있고,
//     AI 로 보내기 전에 휴대전화·주민등록번호 형태를 서버가 먼저 가린다.
//   - PNG · JPG · 구형 한글(HWP) 은 받지 않고 바꾸는 방법을 알려 준다.

const crypto = require("crypto");
const zlib = require("zlib");
const { readZipTexts } = require("./zip-read.js");

const REFERENCE_MAX_FILES = 5;
const REFERENCE_MAX_BYTES = 3.5 * 1024 * 1024;
const REFERENCE_MAX_TEXT_CHARS = 60000; // DOCX·HWPX 에서 푼 글자 전체 상한 (넘으면 잘라 내고 알린다)

const SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  zip: [0x50, 0x4b, 0x03, 0x04], // PK..  (DOCX · HWPX)
  ole: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // 구형 HWP · DOC
  png: [0x89, 0x50, 0x4e, 0x47],
  jpg: [0xff, 0xd8, 0xff],
};

function referenceError(statusCode, message, code = "INVALID_REFERENCE") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const startsWith = (buffer, bytes) => bytes.every((byte, i) => buffer[i] === byte);

// ── 개인정보 형태 가리기 ──────────────────────────────────────────────────────
// 사업 지침에 흔한 기관 대표번호·기관 이메일은 개인정보가 아니라 두고,
// 휴대전화번호와 주민(외국인)등록번호 형태만 가린다.
const PERSONAL_PATTERNS = [
  ["휴대전화번호", /(?<!\d)01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g],
  ["주민등록번호", /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[-\s]?[1-8]\d{6}(?!\d)/g],
];

function maskPersonalInfo(text) {
  const found = {};
  let masked = String(text ?? "");
  for (const [label, pattern] of PERSONAL_PATTERNS) {
    masked = masked.replace(pattern, () => {
      found[label] = (found[label] || 0) + 1;
      return `[${label} 가림]`;
    });
  }
  return { text: masked, found };
}

// ── XML 문서에서 글자 뽑기 (DOCX: w:  /  HWPX: hp:) ────────────────────────────
const XML_ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return XML_ENTITIES[body] ?? whole;
  });
}

// 문단은 한 줄, 표는 "| 칸 | 칸 |" 한 줄씩. 칸 안의 여러 문단은 " / " 로 잇는다.
function extractMarkupText(xml, tags) {
  const lines = [];
  const tables = []; // 표 안의 표까지 대응: [{ rows, row, cell }]
  let paragraph = "";
  let inText = 0;
  let inTabStops = 0;

  const place = (text) => {
    const table = tables[tables.length - 1];
    if (table && table.cell) table.cell.push(text);
    else lines.push(text);
  };
  const flushParagraph = () => {
    const text = paragraph.replace(/[ \t ]+/g, " ").trim();
    paragraph = "";
    if (text) place(text);
  };
  const closeTable = () => {
    flushParagraph();
    const table = tables.pop();
    if (!table) return;
    if (table.row && table.row.length) table.rows.push(table.row);
    const rendered = table.rows.map((cells) => `| ${cells.join(" | ")} |`);
    if (!rendered.length) return;
    const parent = tables[tables.length - 1];
    if (parent && parent.cell) parent.cell.push(rendered.join(" "));
    else lines.push(...rendered);
  };

  const re = /<(\/?)([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\b[^>]*?(\/?)>|<[^>]*>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, closing, name, selfClosing, textNode] = m;
    if (textNode !== undefined) {
      if (inText > 0) paragraph += decodeXml(textNode);
      continue;
    }
    if (!name) continue; // 처리 지시문 · 주석 · 접두사 없는 태그
    const isClose = closing === "/";
    const isSelf = selfClosing === "/";
    if (tags.tabStops && name === tags.tabStops) { if (!isSelf) inTabStops += isClose ? -1 : 1; continue; }
    if (name === tags.text) { if (!isSelf) inText = Math.max(0, inText + (isClose ? -1 : 1)); continue; }
    if (tags.tab.includes(name)) { if (!isClose && inTabStops === 0) paragraph += "\t"; continue; }
    if (tags.lineBreak.includes(name)) { if (!isClose) paragraph += " "; continue; }
    if (name === tags.paragraph) { if (isClose || isSelf) flushParagraph(); continue; }
    if (name === tags.table) {
      if (isClose) closeTable();
      else if (!isSelf) { flushParagraph(); tables.push({ rows: [], row: null, cell: null }); }
      continue;
    }
    const table = tables[tables.length - 1];
    if (!table) continue;
    if (name === tags.row) {
      if (isClose) { if (table.row) table.rows.push(table.row); table.row = null; }
      else if (!isSelf) table.row = [];
      continue;
    }
    if (name === tags.cell) {
      if (isClose) {
        flushParagraph();
        if (!table.row) table.row = [];
        table.row.push((table.cell || []).join(" / "));
        table.cell = null;
      } else if (!isSelf) table.cell = [];
    }
  }
  flushParagraph();
  while (tables.length) closeTable();
  return lines.join("\n");
}

const DOCX_TAGS = { paragraph: "w:p", text: "w:t", table: "w:tbl", row: "w:tr", cell: "w:tc", tab: ["w:tab"], lineBreak: ["w:br", "w:cr"], tabStops: "w:tabs" };
const HWPX_TAGS = { paragraph: "hp:p", text: "hp:t", table: "hp:tbl", row: "hp:tr", cell: "hp:tc", tab: ["hp:tab"], lineBreak: ["hp:lineBreak"] };

function extractDocxText(buffer) {
  const { texts } = readZipTexts(buffer, (name) => name === "word/document.xml");
  const xml = texts["word/document.xml"];
  if (!xml) throw referenceError(400, "DOCX 문서 본문을 찾지 못했습니다. 워드에서 다시 저장해 올려 주세요.");
  return extractMarkupText(xml, DOCX_TAGS);
}

function extractHwpxText(buffer) {
  const sectionName = /^Contents\/section(\d+)\.xml$/i;
  const { entries, texts } = readZipTexts(buffer, (name) => sectionName.test(name) || name === "mimetype");
  const mimetype = texts.mimetype || "";
  const sections = entries
    .map((entry) => entry.name)
    .filter((name) => sectionName.test(name))
    .sort((a, b) => Number(a.match(sectionName)[1]) - Number(b.match(sectionName)[1]));
  if (!sections.length || (mimetype && !/hwp/i.test(mimetype))) {
    throw referenceError(400, "HWPX 문서 본문을 찾지 못했습니다. 한글에서 HWPX로 다시 저장해 올려 주세요.");
  }
  return sections.map((name) => extractMarkupText(texts[name], HWPX_TAGS)).filter(Boolean).join("\n");
}

// ── PDF: 글자층이 있는지 (스캔본인지) ──────────────────────────────────────────
// 내용 스트림(대부분 Flate 압축)을 풀어 "글자 쓰기 명령(BT … Tj/TJ)"이 있는지 본다.
// 종이를 스캔한 PDF 는 쪽마다 이미지만 그리므로(… Do) 글자 쓰기 명령이 없다.
function pdfTextLayerStatus(buffer) {
  if (!startsWith(buffer, SIGNATURES.pdf)) return "invalid";
  const raw = buffer.toString("latin1");
  if (/\/Encrypt\b/.test(raw)) return "encrypted";
  const streamStart = /stream\r?\n/g;
  let match;
  let inspected = 0;
  while ((match = streamStart.exec(raw)) && inspected < 4000) {
    inspected += 1;
    const dataStart = match.index + match[0].length;
    const dataEnd = raw.indexOf("endstream", dataStart);
    if (dataEnd < 0) break;
    streamStart.lastIndex = dataEnd;
    const header = raw.slice(Math.max(0, raw.lastIndexOf("obj", match.index)), match.index);
    let data = buffer.subarray(dataStart, dataEnd);
    if (/\/FlateDecode\b/.test(header)) {
      try {
        data = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: 16 * 1024 * 1024 });
      } catch {
        continue;
      }
    } else if (/\/Filter\b/.test(header)) {
      continue; // 이미지(DCT 등) 같은 다른 압축은 글자층이 아니다
    }
    const content = data.toString("latin1");
    if (/\bBT\b/.test(content) && /(?:\)|>|\])\s*T[jJ]\b/.test(content)) return "text";
  }
  return "scanned";
}

// ── 파일 한 개 받기 ───────────────────────────────────────────────────────────
// 여러 개를 올렸을 때 어느 파일이 문제인지 알 수 있게 거절 안내 앞에 파일 이름을 붙인다.
// (파일 이름은 올린 사람에게만 돌려주고 AI 에는 보내지 않는다.)
function normalizeReferenceFile(source, index) {
  const filename = String(source?.filename || "").trim();
  if (!filename) throw referenceError(400, `${index + 1}번째 참고자료의 파일명이 없습니다.`);
  const reject = (statusCode, message) => referenceError(statusCode, `${filename}: ${message}`);
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
  const encoded = String(source?.fileBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw reject(400, "파일 데이터가 올바르지 않습니다.");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw reject(400, "파일이 비어 있습니다.");
  if (buffer.length > REFERENCE_MAX_BYTES) throw reject(413, "참고자료 파일 하나의 크기는 3.5MB 이하여야 합니다.");

  if ([".png", ".jpg", ".jpeg"].includes(extension) || startsWith(buffer, SIGNATURES.png) || startsWith(buffer, SIGNATURES.jpg)) {
    throw reject(400, "이미지 파일은 글자 인식 오류가 생길 수 있어 참고자료로 받지 않습니다. 텍스트 PDF · DOCX · HWPX로 올려 주세요.");
  }
  if (extension === ".hwp" || (extension !== ".docx" && extension !== ".hwpx" && startsWith(buffer, SIGNATURES.ole))) {
    throw reject(400, "구형 한글(HWP) 파일은 받지 않습니다. 한글에서 '다른 이름으로 저장'으로 PDF 또는 HWPX로 저장해 올려 주세요.");
  }

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  if (extension === ".pdf") {
    if (!startsWith(buffer, SIGNATURES.pdf)) throw reject(400, "파일 내용이 PDF 형식이 아닙니다.");
    const status = pdfTextLayerStatus(buffer);
    if (status === "encrypted") throw reject(400, "암호가 걸린 PDF는 받지 않습니다. 암호를 풀어 다시 저장해 올려 주세요.");
    if (status !== "text") {
      throw reject(400, "스캔한 PDF로 보입니다. 글자 인식 오류가 생길 수 있어 받지 않습니다. 원본 한글·워드 파일에서 'PDF로 저장'해 올려 주세요.");
    }
    return { filename, kind: "pdf", bytes: buffer.length, sha256, buffer };
  }
  if (extension === ".docx" || extension === ".hwpx") {
    if (!startsWith(buffer, SIGNATURES.zip)) throw reject(400, `파일 내용이 ${extension.slice(1).toUpperCase()} 형식이 아닙니다.`);
    let text;
    try {
      text = extension === ".docx" ? extractDocxText(buffer) : extractHwpxText(buffer);
    } catch (error) {
      if (error.statusCode) throw reject(error.statusCode, error.message);
      throw reject(400, `파일을 읽지 못했습니다. ${error.code === "INVALID_ZIP" ? error.message : "파일이 손상되었을 수 있습니다."}`);
    }
    if (!text.trim()) throw reject(400, "읽을 수 있는 글자가 없습니다.");
    return { filename, kind: extension.slice(1), bytes: buffer.length, sha256, text };
  }
  throw reject(400, "참고자료는 텍스트 PDF · DOCX · HWPX 파일만 받습니다.");
}

// ── 여러 파일 받기 → { files, warnings } ──────────────────────────────────────
function normalizeReferenceFiles(sourceFiles) {
  const list = Array.isArray(sourceFiles) ? sourceFiles : [];
  if (list.length > REFERENCE_MAX_FILES) throw referenceError(400, `참고자료는 최대 ${REFERENCE_MAX_FILES}개까지 올릴 수 있습니다.`);
  const files = list.map((source, index) => normalizeReferenceFile(source, index));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > REFERENCE_MAX_BYTES) throw referenceError(413, "참고자료 전체 크기는 3.5MB 이하여야 합니다.");

  const warnings = [];
  let remaining = REFERENCE_MAX_TEXT_CHARS;
  files.forEach((file, index) => {
    if (file.text === undefined) return;
    const { text, found } = maskPersonalInfo(file.text);
    const kinds = Object.entries(found).map(([kind, count]) => `${kind} ${count}건`);
    if (kinds.length) warnings.push(`참고자료 ${index + 1}(${file.filename})에서 ${kinds.join(", ")}을 가린 뒤 분석에 사용했습니다.`);
    if (text.length > remaining) {
      file.text = text.slice(0, remaining);
      warnings.push(remaining > 0
        ? `참고자료 ${index + 1}(${file.filename})의 글자가 많아 앞부분만 분석에 사용했습니다.`
        : `참고자료 ${index + 1}(${file.filename}): 앞선 참고자료의 글자가 많아 분석에 쓰지 못했습니다.`);
    } else {
      file.text = text;
    }
    remaining = Math.max(0, remaining - file.text.length);
  });
  return { files, totalBytes, warnings };
}

module.exports = {
  REFERENCE_MAX_FILES,
  REFERENCE_MAX_BYTES,
  normalizeReferenceFiles,
  normalizeReferenceFile,
  extractDocxText,
  extractHwpxText,
  extractMarkupText,
  pdfTextLayerStatus,
  maskPersonalInfo,
};
