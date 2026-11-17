const crypto = require("crypto");
const { normalizeManagement, classify, scoreRange } = require('./lib/management');
const { readTargets, allows: targetAllows, normalizeTargets, targetColumns } = require('./lib/template-targets.cjs');

const DEFAULT_PASSWORD = process.env.DEFAULT_AGENCY_PASSWORD || "";
const DEFAULT_INTAKE_PASSWORD = process.env.DEFAULT_INTAKE_PASSWORD || DEFAULT_PASSWORD;
const TOKEN_TTL_SECONDS = 60 * 60 * 8;
const INTAKE_TOKEN_TTL_SECONDS = 60 * 60 * 2;
const { createAccountAI, complete: completeAccountAI, outputText: accountAIOutputText } = require('./lib/account-ai');
function accountAI() { return createAccountAI({db:supabase}); }
async function requireAiCredential(token) {
  const credential = await accountAI().resolve(token);
  if (!credential) throw httpError(412, "이 계정의 AI가 미설정이거나 사용 중지 상태입니다. AI 연동 설정을 확인해 주세요.");
  return credential;
}
const AI_FILE_MAX_BYTES = 3.5 * 1024 * 1024;
const AI_FILE_MAX_COUNT = 5;
const AI_MIN_QUESTION_COUNT = 3;
const AI_MAX_QUESTION_COUNT = 100;
const TEMPLATE_MAX_QUESTION_COUNT = 100;
const AI_PROHIBITED_PII_PATTERN = /(성명|이름|연락처|전화번호|휴대폰|생년월일|주민등록|주민번호|상세\s*주소|집\s*주소|서명)/;
const AI_FILE_TYPES = {
  "application/pdf": { extension: ".pdf", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  "image/png": { extension: ".png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], signature: [0xff, 0xd8, 0xff] },
};

const scoreRules = {
  fall: { "예": 5, "아니오": 0, "미해당": 0 },
  depression: { "없음": 0, "2~3일 이상": 1, "7일 이상": 2, "거의 매일": 3 },
  memory: { "아니오": 0, "네": 1 },
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return response(204, null);

    assertEnvironment();

    const method = event.httpMethod;
    const path = routePath(event);
    const body = parseBody(event);

    if (method === "POST" && path === "/login") return response(200, await login(body, "admin"));
    if (method === "POST" && path === "/intake/login") return response(200, await login(body, "intake"));
    if (method === "GET" && path.startsWith("/institutions/")) return response(200, await getInstitution(path));

    const token = verifyRequest(event);

    if (path === "/ai/settings" || path === "/ai/settings/verify") {
      assertAdmin(token);
      if (path === "/ai/settings" && method === "GET") return response(200, await accountAI().read(token));
      if (path === "/ai/settings/verify" && method === "POST") return response(200, await accountAI().verify(token,body));
      if (path === "/ai/settings" && method === "PATCH") return response(200, await accountAI().save(token,body));
    }
    if (method === "GET" && path === "/home-summary") return response(200, await homeSummary(token));
    if (method === "GET" && path === "/home-templates") return response(200, await listHomeTemplates(token));
    if (method === "GET" && path === "/institutions") return response(200, await listInstitutions(token));
    if (method === "POST" && path === "/institutions/bulk") return response(200, await bulkCreateInstitutions(token, body));
    if (method === "POST" && path === "/institutions") return response(201, await createInstitution(token, body));
    if (method === "PATCH" && /^\/institutions\/[^/]+\/status$/.test(path)) return response(200, await changeInstitutionStatus(token, path, body));
    if (method === "PATCH" && /^\/institutions\/[^/]+$/.test(path)) return response(200, await updateInstitution(token, path, body));
    if (method === "GET" && path === "/intake/checklist-templates") return response(200, await listActiveChecklistTemplates(token));
    if (method === "GET" && /^\/intake\/checklist-templates\/[^/]+$/.test(path)) return response(200, await getActiveChecklistTemplate(token, path));
    if (method === "GET" && path === "/submissions") return response(200, await listSubmissions(token, event.queryStringParameters || {}));
    if (method === "GET" && path === "/submissions/export") return response(200, await exportSubmissions(token, event.queryStringParameters || {}));
    if (method === "POST" && path === "/submissions") return response(201, await createSubmission(token, body));
    if (method === "POST" && path === "/submissions/export-details") return response(200, await exportSubmissionDetails(token, body));
    if (method === "GET" && /^\/submissions\/[^/]+$/.test(path)) return response(200, await getSubmission(token, path));
    if (method === "PATCH" && /^\/submissions\/[^/]+$/.test(path)) return response(200, await updateSubmission(token, path, body));
    if (method === "PATCH" && /^\/submissions\/[^/]+\/(complete|reopen)$/.test(path)) return response(200, await completeSubmission(token, path, body));
    if (method === "DELETE" && path === "/submissions") return response(200, await deleteSubmissions(token, body));
    if (method === "GET" && path === "/stats/templates") return response(200, await listStatsTemplates(token));
    if (method === "GET" && /^\/stats\/templates\/[^/]+$/.test(path)) return response(200, await getStatsTemplate(token, path));
    if (method === "GET" && path === "/stats") return response(200, await stats(token, event.queryStringParameters || {}));
    if (method === "POST" && path === "/analysis/run") return response(200, await analysisRun(token, body));
    if (method === "GET" && path === "/analysis/report/status") return response(200, await analysisReportStatus(token));
    if (method === "POST" && path === "/analysis/report") return response(200, await analysisReport(token, body));
    if (method === "POST" && path === "/analysis/recommend") return response(200, await analysisRecommend(token, body));
    if (method === "PATCH" && path === "/password") return response(200, await changePassword(token, body));
    if (method === "PATCH" && path === "/intake-password") return response(200, await changeIntakePassword(token, body));
    if (method === "GET" && path === "/checklist-templates/ai-status") return response(200, await checklistAiStatus(token));
    if (method === "POST" && path === "/checklist-templates/ai-draft") return response(200, await generateChecklistDraft(token, body));
    if (method === "POST" && path === "/checklist-templates/ai-file-draft") return response(200, await generateChecklistFileDraft(token, body));
    if (method === "GET" && path === "/checklist-target-institutions") return response(200, await listChecklistTargetInstitutions(token));
    if (method === "PATCH" && /^\/checklist-templates\/[^/]+\/targets$/.test(path)) return response(200, await updateChecklistTargets(token, path, body));
    if (method === "GET" && path === "/checklist-templates") return response(200, await listChecklistTemplates(token, event.queryStringParameters || {}));
    if (method === "POST" && path === "/checklist-templates") return response(201, await createChecklistTemplate(token, body));
    if (method === "GET" && /^\/checklist-templates\/[^/]+$/.test(path)) return response(200, await getChecklistTemplate(token, path));
    if (method === "PATCH" && /^\/checklist-templates\/[^/]+$/.test(path)) return response(200, await updateChecklistTemplate(token, path, body));
    if (method === "DELETE" && /^\/checklist-templates\/[^/]+$/.test(path)) return response(200, await deleteChecklistTemplate(token, path));
    if (method === "POST" && /^\/checklist-templates\/[^/]+\/copy$/.test(path)) return response(201, await copyChecklistTemplate(token, path, body));
    if (method === "POST" && /^\/checklist-templates\/[^/]+\/activate$/.test(path)) return response(200, await activateChecklistTemplate(token, path));
    if (method === "POST" && /^\/checklist-templates\/[^/]+\/close$/.test(path)) return response(200, await closeChecklistTemplate(token, path));

    return response(404, { message: "지원하지 않는 API 경로입니다." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return response(statusCode, { message: error.publicMessage || error.message || "서버 오류가 발생했습니다." });
  }
};

function assertEnvironment() {
  ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NETLIFY_AUTH_SECRET"].forEach((name) => {
    if (!process.env[name]) throw httpError(500, `${name} 환경변수가 필요합니다.`);
  });
}

function routePath(event) {
  const rawPath = event.rawUrl ? new URL(event.rawUrl).pathname : event.path || "/";
  const path = rawPath
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "");
  return path || "/";
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return JSON.parse(raw || "{}");
}

function corsHeaders(value = process.env.ALLOWED_ORIGIN) {
  const configured = (value || "").trim();
  if (!configured) return {};
  try {
    const url = new URL(configured);
    if (!["https:", "http:"].includes(url.protocol) || url.origin !== configured || url.username || url.password) return {};
    return { "Access-Control-Allow-Origin": url.origin };
  } catch { return {}; }
}

exports.corsHeaders = corsHeaders;

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: body === null ? "" : JSON.stringify(body),
  };
}

function httpError(statusCode, publicMessage) {
  const error = new Error(publicMessage);
  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  return error;
}

async function supabase(path, options = {}) {
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw httpError(res.status, data?.message || "Supabase 요청에 실패했습니다.");
  return data;
}

// Supabase(PostgREST)는 한 번에 돌려주는 행 수에 상한(max-rows, Supabase 기본 1,000)이 있어서
// limit 을 크게 줘도 오류 없이 앞부분만 돌려준다. 통계가 조용히 틀리지 않도록
// 전체 개수를 먼저 받고 끝까지 나눠 읽는다. 너무 많으면 틀린 숫자 대신 오류로 멈춘다.
const SUPABASE_PAGE_SIZE = 1000;
const SUBMISSION_READ_LIMIT = 20000;

async function supabaseCount(path) {
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
  const res = await fetch(url, {
    method: "HEAD",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) throw httpError(res.status, "Supabase 개수 조회에 실패했습니다.");
  const range = res.headers && typeof res.headers.get === "function" ? res.headers.get("content-range") : null;
  const match = String(range || "").match(/\/(\d+)\s*$/);
  return match ? Number(match[1]) : null; // null = 개수를 알 수 없음 → 빈 페이지가 나올 때까지 읽는다
}

function tooManyRowsError(count, limit) {
  const n = (value) => Number(value).toLocaleString("ko-KR");
  return httpError(
    413,
    `조건에 맞는 제출건이 ${n(count)}건으로, 한 번에 집계할 수 있는 ${n(limit)}건을 넘습니다. 기간이나 기관을 좁혀 주세요.`
  );
}

async function supabaseAllRows(path, { pageSize = SUPABASE_PAGE_SIZE, maxRows = SUBMISSION_READ_LIMIT } = {}) {
  const total = await supabaseCount(path);
  if (total !== null && total > maxRows) throw tooManyRowsError(total, maxRows);
  const joiner = path.includes("?") ? "&" : "?";
  const rows = [];
  for (;;) {
    const page = await supabase(`${path}${joiner}order=id.asc&limit=${pageSize}&offset=${rows.length}`);
    const list = Array.isArray(page) ? page : [];
    rows.push(...list);
    if (list.length === 0 || (total !== null && rows.length >= total)) break;
    if (rows.length > maxRows) throw tooManyRowsError(rows.length, maxRows);
  }
  return rows;
}

function passwordHash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
}

function signToken(payload, ttlSeconds) {
  const tokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = base64url(JSON.stringify(tokenPayload));
  const signature = crypto.createHmac("sha256", process.env.NETLIFY_AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyRequest(event) {
  const header = event.headers.authorization || event.headers.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw httpError(401, "인증 토큰이 필요합니다.");

  const [encoded, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", process.env.NETLIFY_AUTH_SECRET).update(encoded).digest("base64url");
  if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw httpError(401, "유효하지 않은 인증 토큰입니다.");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw httpError(401, "인증 토큰이 만료되었습니다.");
  return payload;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function login(body, scope) {
  const agencyCode = String(body.agencyCode || "").trim().toUpperCase();
  const password = String(body.password || "");
  const passwordLabel = scope === "intake" ? "조사자용 접속링크 비밀번호" : "어드민 비밀번호";
  if (!agencyCode || !password) throw httpError(400, `기관코드와 ${passwordLabel}를 입력해 주세요.`);

  const institutions = await supabase(`institutions?code=eq.${encodeURIComponent(agencyCode)}&active=is.true&select=*`);
  const institution = institutions[0];
  if (!institution) throw httpError(401, `기관코드 또는 ${passwordLabel}를 확인해 주세요.`);

  const accounts = await supabase(`agency_accounts?institution_code=eq.${encodeURIComponent(agencyCode)}&active=is.true&select=*`);
  const account = accounts[0];
  const allowDefaultFallback = process.env.ALLOW_DEFAULT_PASSWORD_FALLBACK === "Y";
  const valid = validateLoginPassword(account, password, scope, allowDefaultFallback);
  if (!valid) throw httpError(401, `기관코드 또는 ${passwordLabel}를 확인해 주세요.`);

  const token = signToken(
    {
      scope,
      agencyCode: institution.code,
      role: institution.type,
      sido: institution.sido,
      parentCode: institution.parent_code,
    },
    scope === "intake" ? INTAKE_TOKEN_TTL_SECONDS : TOKEN_TTL_SECONDS
  );

  return {
    token,
    agency: publicInstitution(institution),
  };
}

async function getInstitution(path) {
  const code = decodeURIComponent(path.split("/").pop()).toUpperCase();
  const rows = await supabase(`institutions?code=eq.${encodeURIComponent(code)}&active=is.true&select=code,name,sido,sigungu,type,managed_target_count`);
  if (!rows[0]) throw httpError(404, "기관 정보를 찾을 수 없습니다.");
  return { agency: publicInstitution(rows[0]) };
}

function publicInstitution(row) {
  return {
    code: row.code,
    name: row.name,
    sido: row.sido,
    sigungu: row.sigungu,
    type: row.type,
    parentCode: row.parent_code || null,
    managedTargetCount: row.managed_target_count,
    active: row.active !== false,
  };
}

function requiredText(value, label, maxLength = 120) {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, `${label}을(를) 입력해 주세요.`);
  if (text.length > maxLength) throw httpError(400, `${label}은(는) ${maxLength}자 이하여야 합니다.`);
  return text;
}

function institutionCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!code) throw httpError(400, "기관코드를 입력해 주세요.");
  if (!/^[A-Z0-9]+$/.test(code)) throw httpError(400, "기관코드는 영문과 숫자만 입력할 수 있습니다.");
  return code;
}

function newPassword(value, label, minimum) {
  const password = String(value || "");
  if (password.length < minimum) throw httpError(400, `${label}는 ${minimum}자리 이상이어야 합니다.`);
  return password;
}

function pathInstitutionCode(path, suffix = "") {
  const parts = path.split("/").filter(Boolean);
  const raw = suffix ? parts.at(-2) : parts.at(-1);
  return institutionCode(decodeURIComponent(raw));
}

async function institutionByCode(code, includeInactive = true) {
  const activeFilter = includeInactive ? "" : "&active=is.true";
  const rows = await supabase(`institutions?code=eq.${encodeURIComponent(code)}${activeFilter}&select=*`);
  return rows[0] || null;
}

async function assertInstitutionManagementScope(token, target, action = "수정") {
  assertAdmin(token);
  if (!target || target.type === "central") throw httpError(403, `${action}할 수 없는 기관입니다.`);
  if (token.role === "central") return;
  if (token.role === "regional" && target.type === "regional" && target.code === token.agencyCode && action === "수정") return;
  if (token.role === "regional" && target.type === "agency" && target.parent_code === token.agencyCode) return;
  if (token.role === "agency" && target.code === token.agencyCode && action === "수정") return;
  throw httpError(403, `해당 기관을 ${action}할 권한이 없습니다.`);
}

async function listInstitutions(token) {
  assertAdmin(token);
  let filter = "";
  if (token.role === "regional") filter = `&or=(code.eq.${encodeURIComponent(token.agencyCode)},parent_code.eq.${encodeURIComponent(token.agencyCode)})`;
  if (token.role === "agency") filter = `&code=eq.${encodeURIComponent(token.agencyCode)}`;
  const rows = await supabase(`institutions?select=code,name,sido,sigungu,type,parent_code,managed_target_count,active,created_at,updated_at${filter}&order=type.asc,name.asc`);
  return { institutions: rows.map(publicInstitution) };
}

async function createInstitution(token, body) {
  assertAdmin(token);
  if (!['central', 'regional'].includes(token.role)) throw httpError(403, "하위 기관을 등록할 권한이 없습니다.");

  const code = institutionCode(body.code);
  const type = String(body.type || "").trim();
  if (token.role === "regional" && type !== "agency") throw httpError(403, "광역관리자는 기관담당자만 등록할 수 있습니다.");
  if (token.role === "central" && !["regional", "agency"].includes(type)) throw httpError(400, "광역관리자 또는 기관담당자 유형만 등록할 수 있습니다.");
  if (await institutionByCode(code)) throw httpError(409, "이미 사용 중인 기관코드입니다.");

  const parentCode = type === "regional" ? token.agencyCode : token.role === "regional" ? token.agencyCode : institutionCode(body.parentCode);
  const parent = await institutionByCode(parentCode, false);
  const expectedParentType = type === "regional" ? "central" : "regional";
  if (!parent || parent.type !== expectedParentType) throw httpError(400, "올바른 소속 상위 기관을 선택해 주세요.");

  const adminPassword = newPassword(body.adminPassword, "어드민 초기 비밀번호", 8);
  const intakePassword = type === "agency" ? newPassword(body.intakePassword, "제출 페이지 초기 비밀번호", 8) : adminPassword;
  const row = {
    code,
    name: requiredText(body.name, "기관명"),
    sido: type === "agency" ? requiredText(parent.sido, "소속 광역관리자 시도", 60) : requiredText(body.sido, "시도", 60),
    sigungu: type === "regional" ? "" : requiredText(body.sigungu, "시군구", 60),
    type,
    parent_code: parentCode,
    managed_target_count: Math.max(Number(body.managedTargetCount || 250), 0),
    active: true,
    updated_at: new Date().toISOString(),
  };
  const inserted = await supabase("institutions", { method: "POST", body: JSON.stringify(row) });
  const adminSalt = crypto.randomBytes(16).toString("hex");
  const intakeSalt = crypto.randomBytes(16).toString("hex");
  try {
    await supabase("agency_accounts", {
      method: "POST",
      body: JSON.stringify({
        institution_code: code,
        password_hash: passwordHash(adminPassword, adminSalt),
        password_salt: adminSalt,
        intake_password_hash: passwordHash(intakePassword, intakeSalt),
        intake_password_salt: intakeSalt,
        active: true,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    await supabase(`institutions?code=eq.${encodeURIComponent(code)}`, { method: "DELETE" }).catch(() => null);
    throw error;
  }
  await audit(token, "create_institution", "institutions", code, null, row);
  return { institution: publicInstitution(inserted[0] || row) };
}

function bulkInstitutionErrorField(message) {
  const text = String(message || "");
  if (text.includes("기관코드")) return "기관코드";
  if (text.includes("소속") || text.includes("상위 기관")) return "소속 광역기관 코드";
  if (text.includes("어드민")) return "어드민 초기 비밀번호";
  if (text.includes("제출 페이지")) return "제출 페이지 초기 비밀번호";
  if (text.includes("시군구")) return "시군구";
  if (text.includes("시도")) return "시도";
  if (text.includes("기관명")) return "기관명";
  if (text.includes("권한") || text.includes("등록할 수")) return "기관 단계";
  return "등록 처리";
}

async function bulkCreateInstitutions(token, body) {
  assertAdmin(token);
  if (!["central", "regional"].includes(token.role)) throw httpError(403, "하위 기관을 등록할 권한이 없습니다.");
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) throw httpError(400, "등록할 기관 데이터가 없습니다.");
  if (rows.length > 500) throw httpError(400, "한 번에 최대 500개 기관을 등록할 수 있습니다.");
  const requestedType = String(body.type || "").trim();
  const type = token.role === "regional" ? "agency" : requestedType;
  if (!['regional', 'agency'].includes(type)) throw httpError(400, "등록할 기관 단계를 선택해 주세요.");
  if (token.role === "regional" && requestedType && requestedType !== "agency") {
    throw httpError(403, "광역관리자는 기관담당자만 등록할 수 있습니다.");
  }

  const normalizedCodes = rows.map((row) => String(row?.code || "").trim().toUpperCase());
  const codeCounts = normalizedCodes.reduce((counts, code) => {
    if (code) counts.set(code, (counts.get(code) || 0) + 1);
    return counts;
  }, new Map());
  const results = new Array(rows.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < rows.length) {
      const index = nextIndex++;
      const source = rows[index] || {};
      const rowNumber = Number(source.rowNumber) || index + 2;
      const code = normalizedCodes[index];
      if (code && codeCounts.get(code) > 1) {
        results[index] = { rowNumber, code, success: false, errorField: "기관코드", message: "같은 파일에 기관코드가 중복되어 있습니다." };
        continue;
      }
      try {
        const payload = await createInstitution(token, { ...source, code, type });
        results[index] = { rowNumber, code: payload.institution.code, name: payload.institution.name, success: true };
      } catch (error) {
        const message = error.publicMessage || error.message || "기관을 등록하지 못했습니다.";
        results[index] = { rowNumber, code, success: false, errorField: bulkInstitutionErrorField(message), message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, rows.length) }, () => worker()));
  const successCount = results.filter((result) => result.success).length;
  return {
    totalCount: results.length,
    successCount,
    failureCount: results.length - successCount,
    results,
  };
}

async function updateInstitution(token, path, body) {
  const code = pathInstitutionCode(path);
  const before = await institutionByCode(code);
  await assertInstitutionManagementScope(token, before, "수정");
  const updates = { name: requiredText(body.name, "기관명"), updated_at: new Date().toISOString() };
  const selfNameOnly = ["regional", "agency"].includes(token.role) && before.code === token.agencyCode;
  if (before.type === "regional") {
    updates.sigungu = "";
  }
  if (!selfNameOnly) {
    if (before.type !== "agency") updates.sido = requiredText(body.sido, "시도", 60);
    if (before.type !== "regional") updates.sigungu = requiredText(body.sigungu, "시군구", 60);
  }
  const rows = await supabase(`institutions?code=eq.${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify(updates) });
  await audit(token, "update_institution", "institutions", code, before, rows[0] || { ...before, ...updates });
  return { institution: publicInstitution(rows[0] || { ...before, ...updates }) };
}

async function changeInstitutionStatus(token, path, body) {
  const code = pathInstitutionCode(path, "status");
  const before = await institutionByCode(code);
  if (typeof body.active !== "boolean") throw httpError(400, "활성 상태 값이 올바르지 않습니다.");
  await assertInstitutionManagementScope(token, before, body.active === false ? "비활성화" : "활성화");
  if (token.role === "agency") throw httpError(403, "기관담당자는 활성 상태를 변경할 수 없습니다.");
  const active = body.active === true;
  if (!active && before.type === "regional") {
    const children = await supabase(`institutions?parent_code=eq.${encodeURIComponent(code)}&active=is.true&select=code&limit=1`);
    if (children[0]) throw httpError(409, "활성 상태인 하위 기관담당자를 먼저 비활성화해 주세요.");
  }
  if (active) {
    const parent = await institutionByCode(before.parent_code, false);
    if (!parent) throw httpError(409, "상위 기관이 비활성 상태이므로 활성화할 수 없습니다.");
  }
  const updatedAt = new Date().toISOString();
  const rows = await supabase(`institutions?code=eq.${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify({ active, updated_at: updatedAt }) });
  try {
    await supabase(`agency_accounts?institution_code=eq.${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify({ active, updated_at: updatedAt }) });
  } catch (error) {
    await supabase(`institutions?code=eq.${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify({ active: before.active, updated_at: before.updated_at }) }).catch(() => null);
    throw error;
  }
  await audit(token, active ? "activate_institution" : "deactivate_institution", "institutions", code, before, rows[0] || { ...before, active });
  return { institution: publicInstitution(rows[0] || { ...before, active }) };
}

function assertAdmin(token) {
  if (token.scope !== "admin") throw httpError(403, "관리자 권한이 필요합니다.");
}

function assertAgencyAdmin(token) {
  assertAdmin(token);
  if (token.role !== "agency") throw httpError(403, "기관담당자만 처리할 수 있습니다.");
}

function assertCentralAdmin(token) {
  assertAdmin(token);
  if (token.role !== "central") {
    throw httpError(403, "중앙관리자 권한이 필요합니다.");
  }
}

function assertSubmissionDeleteAdmin(token) {
  assertAdmin(token);
  if (!["agency", "central"].includes(token.role)) throw httpError(403, "제출건 삭제 권한이 없습니다.");
}

function validateLoginPassword(account, password, scope, allowDefaultFallback) {
  if (!account) {
    return allowDefaultFallback && password === (scope === "intake" ? DEFAULT_INTAKE_PASSWORD : DEFAULT_PASSWORD);
  }

  if (scope === "intake") {
    if (account.intake_password_hash && account.intake_password_salt) {
      return passwordHash(password, account.intake_password_salt) === account.intake_password_hash;
    }
    return passwordHash(password, account.password_salt) === account.password_hash;
  }

  return passwordHash(password, account.password_salt) === account.password_hash;
}

async function assertCanManageInstitutionPassword(token, institutionCode) {
  assertAdmin(token);

  if (token.role === "regional") {
    if (institutionCode === token.agencyCode) return;

    const rows = await supabase(
      `institutions?code=eq.${encodeURIComponent(institutionCode)}&parent_code=eq.${encodeURIComponent(token.agencyCode)}&type=eq.agency&active=is.true&select=code`
    );
    if (!rows[0]) throw httpError(403, "관할 기관담당자의 비밀번호만 변경할 수 있습니다.");
    return;
  }

  if (token.role === "central") {
    const rows = await supabase(`institutions?code=eq.${encodeURIComponent(institutionCode)}&active=is.true&select=code`);
    if (!rows[0]) throw httpError(403, "등록된 기관의 비밀번호만 변경할 수 있습니다.");
    return;
  }

  if (institutionCode !== token.agencyCode) {
    throw httpError(403, "본인 기관의 비밀번호만 변경할 수 있습니다.");
  }
}

function assertIntakeOrAdmin(token) {
  if (!["admin", "intake"].includes(token.scope)) throw httpError(403, "제출 권한이 필요합니다.");
}

async function scopedInstitutionCodes(token) {
  if (token.role === "central") return null;
  if (token.role !== "regional") return [token.agencyCode];

  const rows = await supabase(`institutions?parent_code=eq.${encodeURIComponent(token.agencyCode)}&type=eq.agency&select=code`);
  return rows.map((row) => row.code);
}

async function institutionFilter(token) {
  const codes = await scopedInstitutionCodes(token);
  if (codes === null) return null;
  if (codes.length === 0) return "institution_code=eq.__NO_SCOPE__";
  if (codes.length === 1) return `institution_code=eq.${encodeURIComponent(codes[0])}`;
  return `institution_code=in.(${codes.map(encodeURIComponent).join(",")})`;
}

async function listSubmissions(token, query) {
  assertAdmin(token);
  return pagedSubmissionResult(token, query, Math.min(Math.max(Number(query.limit || 20), 1), 100));
}

function optionalQueryText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function optionalDate(value, label) {
  const text = optionalQueryText(value);
  if (!text) return null;
  if (!isValidDateText(text)) throw httpError(400, `${label}은 YYYY-MM-DD 형식이어야 합니다.`);
  return text;
}

function normalizeRpcObject(payload) {
  if (Array.isArray(payload)) return payload[0] || {};
  return payload || {};
}

async function homeSummary(token) {
  assertAdmin(token);
  const codes = await scopedInstitutionCodes(token);
  const payload = await supabase("rpc/admin_home_summary", {
    method: "POST",
    body: JSON.stringify({ p_institution_codes: codes }),
  });
  const result = normalizeRpcObject(payload);
  return {
    ...result,
    recent: (result.recent || []).map((row) => ({
      id: row.id,
      checklistType: row.checklist_type,
      templateId: row.template_id || "",
      checklistTitle: row.checklist_title || "",
      clientName: row.client_name || "",
      submittedAt: row.submitted_at,
    })),
  };
}

async function pagedSubmissionResult(token, query, limitOverride) {
  const startDate = optionalDate(query.startDate, '제출 시작일');
  const endDate = optionalDate(query.endDate, '제출 종료일');
  if (startDate && endDate && startDate > endDate) throw httpError(400, '시작일자는 종료일자보다 늦을 수 없습니다.');
  const page = Math.max(Number(query.page || 1), 1);
  const limit = limitOverride || Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const codes = await scopedInstitutionCodes(token);
  const payload = await supabase("rpc/admin_list_submissions", {
    method: "POST",
    body: JSON.stringify({
      p_institution_codes: codes,
      p_page: page,
      p_limit: limit,
      p_sido: optionalQueryText(query.sido),
      p_sigungu: optionalQueryText(query.sigungu),
      p_agency_code: optionalQueryText(query.agencyCode),
      p_agency_name: optionalQueryText(query.agencyName),
      p_checklist_filter: optionalQueryText(query.type),
      p_status: optionalQueryText(query.status),
      p_start_date: startDate,
      p_end_date: endDate,
      p_search: optionalQueryText(query.search),
    }),
  });
  const result = normalizeRpcObject(payload);
  return {
    rows: (result.rows || []).map(mapSubmission),
    pagination: result.pagination || { page, limit, totalCount: 0, totalPages: 1, start: 0, end: 0 },
  };
}

async function exportSubmissions(token, query) {
  const result = await pagedSubmissionResult(token, { ...query, page: 1 }, 5000);
  return { rows: result.rows, totalCount: result.pagination.totalCount, truncated: result.pagination.totalCount > 5000 };
}

async function getSubmission(token, path) {
  assertAdmin(token);
  const id = path.split("/")[2];
  const scopeFilter = await institutionFilter(token);
  const filters = [
    `id=eq.${encodeURIComponent(id)}`,
    ...(scopeFilter ? [scopeFilter] : []),
    "deleted_at=is.null",
    "select=*,institutions(name,sido,sigungu),checklist_templates(title,scoring_enabled,generation_method),submission_answers(*)",
  ];
  const rows = await supabase(`submissions?${filters.join("&")}`);
  if (!rows[0]) throw httpError(404, "제출건을 찾을 수 없습니다.");
  return { submission: mapSubmission(rows[0]) };
}

async function exportSubmissionDetails(token, body) {
  assertAdmin(token);
  const templateId = validUuid(body.templateId, '조회한 설문 양식 ID');
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    throw httpError(400, "다운로드할 제출건을 선택해 주세요.");
  }
  const ids = Array.from(new Set(body.ids.map((id) => validUuid(id, "제출건 ID"))));
  if (ids.length > 100) {
    throw httpError(400, "상세 제출건은 한 번에 최대 100건까지 조회할 수 있습니다.");
  }

  const scopeFilter = await institutionFilter(token);
  const filters = [
    `id=in.(${ids.join(",")})`,
    `template_id=eq.${templateId}`,
    ...(scopeFilter ? [scopeFilter] : []),
    "deleted_at=is.null",
    "select=*,institutions(name,sido,sigungu),checklist_templates(title,scoring_enabled,generation_method),submission_answers(*)",
    "order=submitted_at.asc",
    `limit=${ids.length}`,
  ];
  const rows = await supabase(`submissions?${filters.join("&")}`);
  if (rows.length !== ids.length || rows.some(row => row.template_id !== templateId)) {
    throw httpError(400, '선택한 설문과 제출건이 일치하지 않거나 조회 권한이 없습니다. 다시 조회해 주세요.');
  }
  return { rows: rows.map(mapSubmission) };
}

async function createSubmission(token, body) {
  assertIntakeOrAdmin(token);
  const dynamicTemplateId = body.templateId ? validUuid(body.templateId, "체크리스트 양식 ID") : null;
  if (!dynamicTemplateId) throw httpError(409, '설문 목록을 새로고침한 후 운영 중인 양식을 선택해 주세요.');
  const template = await loadChecklistTemplate(dynamicTemplateId);
  await assertChecklistSubmissionTarget(token, template);
  const personalInfo = validateSubmissionPersonalInfo(body);
  const answers = dynamicTemplateId
    ? await normalizeDynamicAnswers(dynamicTemplateId, body.answers, template)
    : normalizeAnswers(body.checklistType, body.answers);
  const totalScore = answers.reduce((sum, answer) => sum + answer.score, 0);

  const submissionRows = await supabase("submissions", {
    method: "POST",
    body: JSON.stringify({
      institution_code: token.agencyCode,
      checklist_type: dynamicTemplateId ? null : body.checklistType,
      template_id: dynamicTemplateId,
      survey_date: body.surveyDate || new Date().toISOString().slice(0, 10),
      ...personalInfo,
      total_score: totalScore,
      template_snapshot: template,
      management_label: classify(template, totalScore),
      status: "확인 대기",
    }),
  });

  const submission = submissionRows[0];
  await supabase("submission_answers", {
    method: "POST",
    body: JSON.stringify(
      answers.map((answer) => ({
        submission_id: submission.id,
        question_no: answer.questionNo,
        question_text: answer.questionText,
        question_id: answer.questionId || null,
        answer_label: answer.answerLabel || null,
        answer_value: answer.answerValue || null,
        score: answer.score,
      }))
    ),
  });

  await audit(token, "create_submission", "submissions", submission.id, null, submission);
  return { submission: mapSubmission({ ...submission, submission_answers: answers }) };
}

async function completeSubmission(token, path, body) {
  assertAgencyAdmin(token);
  const id = validUuid(path.split("/")[2], '제출건 ID');
  const reopen = path.endsWith('/reopen');

  const scopeFilter = await institutionFilter(token);
  const beforeRows = await supabase(`submissions?id=eq.${encodeURIComponent(id)}&${scopeFilter}&deleted_at=is.null&select=*`);
  if (!beforeRows[0]) throw httpError(404, "제출건을 찾을 수 없습니다.");

  const rows = await supabase(`submissions?id=eq.${encodeURIComponent(id)}&${scopeFilter}&deleted_at=is.null&status=eq.${encodeURIComponent(beforeRows[0].status)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(Object.hasOwn(body, 'clientId') ? {client_id: String(body.clientId ?? '').trim() || null} : {}),
      status: reopen ? '확인 대기' : '확인 완료',
      completed_at: reopen ? null : new Date().toISOString(),
      completed_by: reopen ? null : token.agencyCode,
    }),
  });
  if (!rows[0]) throw httpError(409, '제출 상태가 변경되었거나 삭제되었습니다. 다시 조회해 주세요.');
  await audit(token, reopen ? 'reopen_submission' : 'complete_submission', 'submissions', id, beforeRows[0], rows[0]);
  return { submission: mapSubmission(rows[0]) };
}

async function listActiveChecklistTemplates(token) {
  assertIntakeOrAdmin(token);
  const institution = await institutionByCode(token.agencyCode, false);
  if (!institution || institution.type !== 'agency') throw httpError(403, '활성 기관담당자의 제출 링크로 접속해 주세요.');
  const rows = await supabase(
    `checklist_templates?status=eq.active&or=(submission_target_mode.eq.all,and(submission_target_mode.eq.selected,submission_target_codes.cs.{${encodeURIComponent(institution.code)}}))&select=id,title,description,purpose,target_audience,estimated_minutes,scoring_enabled,activated_at&order=activated_at.desc`
  );
  return { templates: rows.map(mapChecklistTemplateSummary) };
}

async function getActiveChecklistTemplate(token, path) {
  assertIntakeOrAdmin(token);
  const id = validUuid(path.split("/")[3], "체크리스트 양식 ID");
  const template = await loadChecklistTemplate(id);
  if (template.status !== "active") throw httpError(404, "운영 중인 체크리스트 양식을 찾을 수 없습니다.");
  await assertChecklistSubmissionTarget(token, template);
  const {submissionTargets, ...publicTemplate} = template;
  return { template: publicTemplate };
}

async function assertChecklistSubmissionTarget(token, template) {
  if (template.status !== 'active') throw httpError(409, '현재 운영 중인 양식만 제출할 수 있습니다.');
  const institution = await institutionByCode(token.agencyCode, false);
  if (!targetAllows(template.submissionTargets, institution)) throw httpError(403, '현재 이 기관은 해당 양식의 제출 대상이 아닙니다. 기관이 비활성화되었거나 제출 대상이 변경되었을 수 있습니다.');
}

async function listChecklistTargetInstitutions(token) {
  assertCentralAdmin(token);
  const institutions = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await supabase(`institutions?type=in.(agency,regional)&select=code,name,type,parent_code,active&order=code.asc&limit=500&offset=${offset}`);
    institutions.push(...rows);
    if (institutions.length > 20000) throw httpError(413, '기관 목록 조회 한도를 초과했습니다.');
    if (rows.length < 500) break;
  }
  return {institutions:institutions.map(publicInstitution)};
}

async function updateChecklistTargets(token, path, body) {
  assertCentralAdmin(token);
  const id = checklistTemplateIdFromPath(path);
  const before = await loadChecklistTemplate(id);
  if (!['draft','active'].includes(before.status)) throw httpError(409, '종료된 양식의 제출 대상은 변경할 수 없습니다.');
  if (!body.submissionTargets) throw httpError(400, '제출 대상 설정이 필요합니다.');
  const targets = await normalizeTargets(body.submissionTargets, supabase, before.submissionTargets);
  const rows = await supabase(`checklist_templates?id=eq.${encodeURIComponent(id)}&status=eq.${before.status}&submission_target_revision=eq.${targets.revision}`, {
    method:'PATCH', body:JSON.stringify({...targetColumns(targets),updated_at:new Date().toISOString()}),
  });
  if (!rows[0]) throw httpError(409, '양식이 변경되었습니다. 다시 열어 주세요.');
  await audit(token,'update_checklist_targets','checklist_templates',id,before.submissionTargets,readTargets(rows[0]));
  return {submissionTargets:readTargets(rows[0])};
}

async function normalizeDynamicAnswers(templateId, answers, loadedTemplate) {
  if (!Array.isArray(answers)) throw httpError(400, "문항 응답이 필요합니다.");
  const template = loadedTemplate || await loadChecklistTemplate(templateId);
  if (template.status !== "active") throw httpError(409, "현재 운영 중인 양식만 제출할 수 있습니다.");

  const submittedQuestionIds = answers.map((answer) => String(answer.questionId || ""));
  if (new Set(submittedQuestionIds).size !== submittedQuestionIds.length) {
    throw httpError(400, "중복된 문항 응답이 있습니다.");
  }
  const answerMap = new Map(
    answers.map((answer) => [String(answer.questionId || ""), answer])
  );
  const unknownQuestion = answers.find(
    (answer) => !template.questions.some((question) => String(question.id) === String(answer.questionId))
  );
  if (unknownQuestion) throw httpError(400, "양식에 포함되지 않은 문항 응답이 있습니다.");

  return template.questions.map((question) => {
    const submitted = answerMap.get(String(question.id)) || {};
    const normalized = normalizeDynamicAnswer(question, submitted);
    if (question.required && normalized.isEmpty) {
      throw httpError(400, `${question.questionNo}번 필수 문항에 응답해 주세요.`);
    }
    return {
      questionId: question.id,
      questionNo: question.questionNo,
      questionText: question.questionText,
      answerLabel: normalized.answerLabel,
      answerValue: normalized.answerValue,
      score: normalized.score,
    };
  });
}

function normalizeDynamicAnswer(question, submitted) {
  if (["text", "textarea"].includes(question.answerType)) {
    const text = String(submitted.value?.text ?? submitted.answerValue?.text ?? submitted.text ?? "").trim();
    if (text.length > 4000) throw httpError(400, `${question.questionNo}번 문항 응답은 4,000자 이하여야 합니다.`);
    return {
      isEmpty: !text,
      answerLabel: text || null,
      answerValue: text ? { text } : { text: "" },
      score: 0,
    };
  }

  const rawIds =
    submitted.value?.optionIds ??
    submitted.answerValue?.optionIds ??
    submitted.optionIds ??
    [];
  const optionIds = Array.isArray(rawIds) ? rawIds.map(String) : [String(rawIds || "")].filter(Boolean);
  const uniqueIds = [...new Set(optionIds)];
  const selected = question.options.filter((option) => uniqueIds.includes(String(option.id)));
  if (selected.length !== uniqueIds.length) {
    throw httpError(400, `${question.questionNo}번 문항에 올바르지 않은 선택지가 있습니다.`);
  }
  if (question.answerType === "single_choice" && selected.length > 1) {
    throw httpError(400, `${question.questionNo}번 문항은 하나만 선택할 수 있습니다.`);
  }
  const rawOptionTexts =
    submitted.value?.optionTexts ??
    submitted.answerValue?.optionTexts ??
    submitted.optionTexts ??
    {};
  const optionTexts = rawOptionTexts && typeof rawOptionTexts === "object" && !Array.isArray(rawOptionTexts)
    ? rawOptionTexts
    : {};
  const selectedIds = new Set(selected.map((option) => String(option.id)));
  const invalidTextOptionId = Object.keys(optionTexts).find((optionId) => !selectedIds.has(String(optionId)));
  if (invalidTextOptionId) {
    throw httpError(400, `${question.questionNo}번 문항의 추가 입력 대상이 올바르지 않습니다.`);
  }
  const normalizedOptionTexts = {};
  selected.forEach((option) => {
    if (!option.requiresText) return;
    const text = String(optionTexts[String(option.id)] ?? optionTexts[option.id] ?? "").trim();
    if (!text) {
      throw httpError(400, `${question.questionNo}번 문항의 '${option.optionText}' 내용을 입력해 주세요.`);
    }
    if (text.length > 1000) {
      throw httpError(400, `${question.questionNo}번 문항의 추가 입력 내용은 1,000자 이하여야 합니다.`);
    }
    normalizedOptionTexts[String(option.id)] = text;
  });
  return {
    isEmpty: selected.length === 0,
    answerLabel:
      selected
        .map((option) => {
          const extraText = normalizedOptionTexts[String(option.id)];
          return extraText ? `${option.optionText}: ${extraText}` : option.optionText;
        })
        .join(", ") || null,
    answerValue: {
      optionIds: selected.map((option) => option.id),
      labels: selected.map((option) => option.optionText),
      optionTexts: normalizedOptionTexts,
    },
    score: selected.reduce((sum, option) => sum + Number(option.score || 0), 0),
  };
}

async function updateSubmission(token, path, body) {
  assertAgencyAdmin(token);
  const id = path.split("/")[2];
  const clientId = String(body.clientId || "").trim();

  const clientGender = required(body.clientGender, "대상자 성별");
  if (!["남", "여"].includes(clientGender)) throw httpError(400, "대상자 성별 값이 올바르지 않습니다.");

  const clientBirth = required(body.clientBirth, "대상자 생년월일");
  if (!isValidDateText(clientBirth)) {
    throw httpError(400, "대상자 생년월일은 YYYY-MM-DD 형식이어야 합니다.");
  }

  const scopeFilter = await institutionFilter(token);
  const beforeRows = await supabase(`submissions?id=eq.${encodeURIComponent(id)}&${scopeFilter}&deleted_at=is.null&select=*`);
  if (!beforeRows[0]) throw httpError(404, "제출건을 찾을 수 없습니다.");

  const rows = await supabase(`submissions?id=eq.${encodeURIComponent(id)}&${scopeFilter}`, {
    method: "PATCH",
    body: JSON.stringify({
      worker_name: validPersonName(body.workerName, "조사자 성명"),
      worker_phone: validPhoneNumber(body.workerPhone, "조사자 전화번호"),
      client_name: validPersonName(body.clientName, "대상자 성명"),
      client_gender: clientGender,
      client_birth: clientBirth,
      client_id: clientId || null,
    }),
  });

  await audit(token, "update_submission", "submissions", id, beforeRows[0], rows[0]);
  return { submission: mapSubmission(rows[0]) };
}

async function deleteSubmissions(token, body) {
  assertSubmissionDeleteAdmin(token);
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (ids.length === 0) throw httpError(400, "삭제할 제출건 ID가 필요합니다.");

  const scopeFilter = await institutionFilter(token);
  const filters = [`id=in.(${ids.map(encodeURIComponent).join(",")})`, ...(scopeFilter ? [scopeFilter] : [])];
  const rows = await supabase(`submissions?${filters.join("&")}`, {
    method: "PATCH",
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });

  await audit(token, "delete_submissions", "submissions", ids.join(","), null, { ids });
  return { deletedCount: rows.length };
}

const BUILTIN_CHECKLIST_TYPES = ["fall", "depression", "memory"];
const STATS_TEMPLATE_STATUSES = ["active", "closed"];

// 제출건 조회 조건 → PostgREST 필터 목록. 권한 범위(codes)는 scopedInstitutionCodes 결과를 그대로 받는다.
// 시도·시군구는 기관 테이블을 inner 로 붙여 거른다 (DB 함수가 기관을 조인해 거르는 것과 같은 뜻).
function submissionReadPath({ codes, sido, sigungu, agencyCode, type, templateId, onlyTemplates, startDate, endDate, statusMode, columns }) {
  const filters = ["deleted_at=is.null"];
  if (codes !== null && codes !== undefined) {
    if (codes.length === 0) filters.push("institution_code=eq.__NO_SCOPE__");
    else if (codes.length === 1) filters.push(`institution_code=eq.${encodeURIComponent(codes[0])}`);
    else filters.push(`institution_code=in.(${codes.map(encodeURIComponent).join(",")})`);
  }
  if (templateId) filters.push(`template_id=eq.${encodeURIComponent(templateId)}`);
  else if (type) filters.push(`checklist_type=eq.${encodeURIComponent(type)}`);
  else if (onlyTemplates) filters.push("template_id=not.is.null");
  if (startDate) filters.push(`survey_date=gte.${startDate}`);
  if (endDate) filters.push(`survey_date=lte.${endDate}`);
  if (agencyCode) filters.push(`institution_code=eq.${encodeURIComponent(agencyCode)}`);
  if (sido) filters.push(`institutions.sido=eq.${encodeURIComponent(sido)}`);
  if (sigungu) filters.push(`institutions.sigungu=eq.${encodeURIComponent(sigungu)}`);
  if (statusMode === "completed") filters.push(`status=eq.${encodeURIComponent("확인 완료")}`);
  const select = sido || sigungu ? `${columns},institutions!inner(name,sido,sigungu)` : columns;
  return `submissions?${filters.join("&")}&select=${select}`;
}

function statsFiltersFromQuery(query) {
  return {
    sido: optionalQueryText(query.sido),
    sigungu: optionalQueryText(query.sigungu),
    agencyCode: optionalQueryText(query.agencyCode),
    type: optionalQueryText(query.type),
    startDate: optionalDate(query.startDate, "조사 시작일"),
    endDate: optionalDate(query.endDate, "조사 종료일"),
  };
}

async function stats(token, query) {
  assertAdmin(token);
  const view = query.view === "distribution" ? "distribution" : "overview";
  const codes = await scopedInstitutionCodes(token);
  const filters = statsFiltersFromQuery(query);
  const templateId = optionalQueryText(query.templateId);
  if (view === 'distribution') {
    if (!templateId) throw httpError(400, '관리구분 분포를 조회할 설문을 선택해 주세요.');
    const template = await loadStatsTemplate(templateId);
    if (!template.managementEnabled) return {view,templateId,managementEnabled:false,rows:[],queriedAt:new Date().toISOString()};
    const rows = await supabase('rpc/survey_management_distribution', {method:'POST',body:JSON.stringify({p_template_id:templateId,p_institution_codes:codes,p_sido:filters.sido,p_sigungu:filters.sigungu,p_agency_code:filters.agencyCode,p_start_date:filters.startDate,p_end_date:filters.endDate})});
    return {view,templateId,managementEnabled:true,rows,queriedAt:new Date().toISOString()};
  }
  if (templateId) return templateStatsOverview(codes, validUuid(templateId, "설문 양식 ID"), filters);

  const payload = normalizeRpcObject(await supabase("rpc/admin_submission_stats", {
    method: "POST",
    body: JSON.stringify({
      p_institution_codes: codes,
      p_view: view,
      p_sido: filters.sido,
      p_sigungu: filters.sigungu,
      p_agency_code: filters.agencyCode,
      p_checklist_type: filters.type,
      p_start_date: filters.startDate,
      p_end_date: filters.endDate,
    }),
  }));
  if (view !== "overview") return payload;

  // 제출 건수·대상자 수와 기본 3종의 확인 상태는 DB 함수가 정확하게 세어 준다.
  // DB 함수에는 자체 설문 제출건의 확인 상태 집계가 없으므로, 그 제출건만 직접 읽어 더한다.
  // (기본 설문 하나를 골랐다면 자체 설문 제출건은 범위 밖이라 읽지 않는다.)
  let extra = new Map();
  if (!filters.type) {
    try {
      extra = await templateStatusByInstitution(codes, filters);
    } catch (error) {
      if (error.statusCode !== 413) throw error;
      payload.templateStatusSkipped = true; // 너무 많아 못 읽었음을 화면에 알린다 (숫자를 몰래 빼지 않는다)
    }
  }
  (payload.rows || []).forEach((row) => {
    const add = extra.get(row.institution_code) || { waiting: 0, done: 0 };
    row.waiting_total = BUILTIN_CHECKLIST_TYPES.reduce((n, key) => n + Number(row[`${key}_waiting`] || 0), 0) + add.waiting;
    row.done_total = BUILTIN_CHECKLIST_TYPES.reduce((n, key) => n + Number(row[`${key}_done`] || 0), 0) + add.done;
  });
  return payload;
}

async function templateStatusByInstitution(codes, filters) {
  const rows = await supabaseAllRows(submissionReadPath({ codes, ...filters, onlyTemplates: true, columns: "institution_code,status" }));
  const byCode = new Map();
  rows.forEach((row) => {
    const counts = byCode.get(row.institution_code) || { waiting: 0, done: 0 };
    if (row.status === "확인 완료") counts.done += 1;
    else if (row.status === "확인 대기") counts.waiting += 1;
    byCode.set(row.institution_code, counts);
  });
  return byCode;
}

// 자체 설문 하나를 골랐을 때: DB 함수는 양식으로 거를 수 없으므로 그 양식의 제출건만 읽어 기관별로 센다.
async function templateStatsOverview(codes, templateId, filters) {
  const rows = await supabaseAllRows(
    submissionReadPath({ codes, ...filters, type: "", templateId, columns: "institution_code,client_id,status" })
  );
  const byCode = new Map();
  rows.forEach((row) => {
    const item = byCode.get(row.institution_code) || { institution_code: row.institution_code, total: 0, clients: new Set(), waiting_total: 0, done_total: 0 };
    item.total += 1;
    if (row.client_id) item.clients.add(row.client_id);
    if (row.status === "확인 완료") item.done_total += 1;
    else if (row.status === "확인 대기") item.waiting_total += 1;
    byCode.set(row.institution_code, item);
  });
  return {
    view: "overview",
    templateId,
    rows: [...byCode.values()].map(({ clients, ...rest }) => ({ ...rest, unique_clients: clients.size })),
    queriedAt: new Date().toISOString(),
  };
}

// 집계 및 통계의 '설문 양식' 목록. 모든 관리자 권한이 볼 수 있고, 작성 중인 양식은 뺀다.
async function listStatsTemplates(token) {
  assertAdmin(token);
  const rows = await supabase(
    `checklist_templates?status=in.(${STATS_TEMPLATE_STATUSES.join(",")})&select=id,title,status,scoring_enabled,generation_method,management_enabled,management_bands&order=title.asc`
  );
  return {
    templates: (rows || []).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      scoringEnabled: Boolean(row.scoring_enabled),
      generationMethod: row.generation_method,
      managementEnabled: Boolean(row.management_enabled),
      managementBands: row.management_bands || [],
    })),
  };
}

function statsTemplateView(template) {
  return {
    id: template.id,
    title: template.title,
    status: template.status,
    scoringEnabled: Boolean(template.scoringEnabled),
    managementEnabled: Boolean(template.managementEnabled),
    managementBands: template.managementBands || [],
    questions: (template.questions || []).map((question) => ({
      questionNo: question.questionNo,
      questionText: question.questionText,
      answerType: question.answerType,
      options: (question.options || []).map((option) => ({ optionText: option.optionText, score: option.score })),
    })),
  };
}

async function loadStatsTemplate(id) {
  const template = await loadChecklistTemplate(validUuid(id, "설문 양식 ID"));
  if (!STATS_TEMPLATE_STATUSES.includes(template.status)) throw httpError(404, "통계에서 볼 수 있는 설문 양식이 아닙니다.");
  return template;
}

async function getStatsTemplate(token, path) {
  assertAdmin(token);
  return { template: statsTemplateView(await loadStatsTemplate(path.split("/")[3])) };
}

// 설문 결과 분석(AI 통계 탭): 조건에 맞는 제출건을 읽어 코드로 교차 집계한다.
// 새 테이블·RPC 없이 기존 submissions 테이블만 조회한다.
async function analysisRun(token, body) {
  const analysis = await computeAnalysis(token, body);
  return {
    recordCount: analysis.records.length,
    statusMode: analysis.statusMode,
    summary: analysis.summary,
    itemRates: analysis.itemRates,
    tables: analysis.tables,
    filters: analysis.filters,
  };
}

// STEP 3 과 STEP 4 가 같은 계산을 쓴다. STEP 4 는 화면이 보낸 숫자를 믿지 않고 이 함수로 다시 계산한다.
async function computeAnalysis(token, body) {
  const { computeCrosstab, validateSpec } = require("./lib/crosstab.js");
  const { normalizeSubmissions, summarize, itemRates, primaryLabelsFromTemplate } = require("./lib/analysis.js");
  assertAdmin(token);

  if (!Array.isArray(body.specs) || body.specs.length === 0 || body.specs.length > 8) throw httpError(400, "분석 기준은 1개 이상 8개 이하로 선택해 주세요.");
  let specs;
  try {
    specs = body.specs.map(validateSpec);
  } catch (error) {
    if (error.code === 'INVALID_ANALYSIS_SPEC') throw httpError(400, error.message);
    throw error;
  }

  const checklistType = optionalQueryText(body.checklistType);
  const templateId = optionalQueryText(body.templateId);
  if (!checklistType && !templateId) throw httpError(400, "분석할 설문지를 선택해 주세요.");

  const startDate = optionalDate(body.startDate, "조사 시작일");
  const endDate = optionalDate(body.endDate, "조사 종료일");
  const sido = optionalQueryText(body.sido);
  const sigungu = optionalQueryText(body.sigungu);
  const agencyCode = optionalQueryText(body.agencyCode);
  const statusMode = body.status === "completed" ? "completed" : "all";

  // 자체 설문은 운영 중·종료된 양식만 분석한다. 배점이 있는 양식이면 배점이 가장 높은 보기를 대표 응답으로 쓴다.
  const template = templateId ? await loadStatsTemplate(templateId) : null;

  const codes = await scopedInstitutionCodes(token);
  const columns = `id,total_score,client_gender,client_birth,survey_date,status,checklist_type,template_id,institution_code,institutions(name,sido,sigungu),submission_answers(question_no,answer_label,answer_value)`;
  const path = submissionReadPath({
    codes, sido, sigungu, agencyCode, startDate, endDate, statusMode,
    type: template ? "" : checklistType,
    templateId: template ? template.id : "",
    // 시도·시군구로 거를 때는 submissionReadPath 가 institutions!inner 를 붙이므로 여기서는 이름만 함께 읽는다.
    columns: sido || sigungu ? columns.replace(",institutions(name,sido,sigungu)", "") : columns,
  });
  const rows = await supabaseAllRows(path);

  const records = normalizeSubmissions(rows);
  const tables = specs.map((spec) => ({ spec, ...computeCrosstab(records, spec) }));

  return {
    template,
    rows,
    records,
    statusMode,
    summary: summarize(records),
    itemRates: template
      ? itemRates(records, { primaryByQuestion: primaryLabelsFromTemplate(template), builtinOrder: false })
      : itemRates(records),
    tables,
    filters: { checklistType: template ? "" : checklistType, templateId: template ? template.id : "", startDate, endDate, sido, sigungu, agencyCode, status: statusMode },
  };
}

// ── STEP 4 결과 분석 ──────────────────────────────────────────────────────────
// 분석 및 설문 생성은 로그인 계정의 단일 설정을 공유한다.
// 키 원문은 서버 내부에서만 사용하며 상위 계정이나 프로젝트 공용 키로 대체하지 않는다.
async function resolveAnalysisAiCredential(token) {
  return accountAI().resolve(token);
}

const ANALYSIS_AI_KEY_MISSING = "이 계정의 AI가 미설정이거나 사용 중지 상태입니다. AI 연동 설정을 확인해 주세요.";

async function analysisReportStatus(token) {
  assertAdmin(token);
  const credential = await resolveAnalysisAiCredential(token);
  if (!credential) return { available: false, reason: "AI_KEY_NOT_CONFIGURED", message: ANALYSIS_AI_KEY_MISSING };
  return { available: true, provider: credential.provider, model: credential.model, files:credential.files };
}

async function analysisReport(token, body) {
  const { normalizeReferenceFiles } = require("./lib/reference-docs.js");
  const { BUILTIN_SURVEY_TITLES, buildReportContext, buildReportRequest, requestAnalysisReport, validateAnalysisReport } = require("./lib/analysis-report.js");
  assertAdmin(token);

  // ① 참고자료 검사 (선택사항 · 네트워크 없이 먼저)
  const references = normalizeReferenceFiles(body.files);

  // ② 계정 AI 설정. 없으면 통계를 읽거나 AI 를 부르기 전에 멈춘다.
  const credential = await resolveAnalysisAiCredential(token);
  if (!credential) throw httpError(412, ANALYSIS_AI_KEY_MISSING);


  // ③ 통계를 서버에서 다시 계산한다 (화면이 보낸 숫자를 믿지 않는다)
  const analysis = await computeAnalysis(token, body);
  // 분석할 응답이 없으면 AI 를 부르지 않는다 (기관 키 비용만 쓰고 쓸 수 있는 결과가 없다)
  if (!analysis.records.length) throw httpError(400, "분석할 응답이 없습니다. 조회 조건을 바꿔 통계 결과를 다시 만든 뒤 요청해 주세요.");
  const questions = analysis.template
    ? analysis.template.questions.map((question) => ({ questionNo: question.questionNo, questionText: question.questionText }))
    : await builtinQuestionTexts(analysis.rows);
  const institutionNames = {};
  analysis.records.forEach((record) => { if (record.institution && record.institutionName) institutionNames[record.institution] = record.institutionName; });
  const context = buildReportContext({
    surveyTitle: analysis.template ? analysis.template.title : BUILTIN_SURVEY_TITLES[analysis.filters.checklistType] || analysis.filters.checklistType,
    questions,
    filters: analysis.filters,
    statusMode: analysis.statusMode,
    recordCount: analysis.records.length,
    summary: analysis.summary,
    itemRates: analysis.itemRates,
    tables: analysis.tables,
    institutionNames,
    // 기관담당자 계정은 본인 기관만 보므로 '권한 범위의 전체 기관' 대신 기관 이름을 쓴다 (STEP 1 화면과 같게)
    scopeName: token.role === "agency" ? institutionNames[token.agencyCode] || token.agencyCode : "",
  });

  // ④ AI 요청 → ⑤ 답 검사
  const model = credential.model;
  const raw = await requestAnalysisReport({ credential, body: buildReportRequest({ model, context, references: references.files }) });
  if (raw && raw.blocked === true) {
    throw httpError(422, "참고자료에 개인정보로 보이는 내용이 있어 분석하지 않았습니다. 개인정보를 지운 뒤 다시 올려 주세요.");
  }
  const { report, warnings } = validateAnalysisReport(raw, { context, hasReferences: references.files.length > 0 });
  return {
    report,
    warnings: [...references.warnings, ...warnings],
    mode: references.files.length ? "with_references" : "statistics_only",
    referenceCount: references.files.length,
    model,
    generatedAt: new Date().toISOString(),
  };
}

// ── STEP 2 AI에게 추천 더 받기 ────────────────────────────────────────────────
// 규칙 추천은 화면이 그대로 만들고, 여기서는 AI 가 문항의 뜻을 보고 덧붙일 기준만 만든다.
// STEP 4 와 같은 계정 AI 설정(resolveAnalysisAiCredential)을 쓰고, 공용 키로 대신 부르지 않는다.
async function analysisRecommend(token, body) {
  const { buildRecommendContext, buildRecommendRequest, validateRecommendations, sanitizeExisting } = require("./lib/analysis-recommend.js");
  const { BUILTIN_SURVEY_TITLES, requestAnalysisReport } = require("./lib/analysis-report.js");
  assertAdmin(token);

  // ① 계정 AI 설정. 없으면 통계를 읽거나 AI 를 부르기 전에 멈춘다.
  const credential = await resolveAnalysisAiCredential(token);
  if (!credential) throw httpError(412, ANALYSIS_AI_KEY_MISSING);


  // ② 통계를 서버에서 다시 센다 (화면이 보낸 요약은 믿지 않는다). 표는 필요 없어 전체 1칸만 센다.
  const analysis = await computeAnalysis(token, { ...body, specs: [{ row: { kind: "all" }, col: { kind: "all" }, cells: ["count"] }] });
  if (!analysis.records.length) throw httpError(400, "추천할 응답이 없습니다. 조회 조건을 바꿔 주세요.");
  const questions = analysis.template
    ? analysis.template.questions
    : (await builtinQuestionTexts(analysis.rows)).map((question) => ({
        ...question,
        answerType: "single_choice",
        options: (analysis.itemRates.find((rate) => String(rate.questionNo) === String(question.questionNo))?.distribution || []).map((item) => ({ optionText: item.label })),
      }));
  const hasScore = analysis.template ? Boolean(analysis.template.scoringEnabled) : true;
  const facts = {
    sigunguCount: new Set(analysis.records.map((record) => record.sigungu).filter(Boolean)).size,
    statusKinds: new Set(analysis.records.map((record) => record.status).filter(Boolean)).size,
  };
  const existing = sanitizeExisting(body.existing);
  const context = buildRecommendContext({
    survey: analysis.template
      ? { title: analysis.template.title, description: analysis.template.description, purpose: analysis.template.purpose, targetAudience: analysis.template.targetAudience, scoringEnabled: hasScore }
      : { title: BUILTIN_SURVEY_TITLES[analysis.filters.checklistType] || analysis.filters.checklistType, scoringEnabled: true },
    questions,
    summary: analysis.summary,
    itemRates: analysis.itemRates,
    facts,
    existing,
  });

  // ③ AI 요청 → ④ 답 검사
  const model = credential.model;
  const raw = await requestAnalysisReport({ credential, body: buildRecommendRequest({ model, context }), task: "기준 추천" });
  const result = validateRecommendations(raw, { context, questions, itemRates: analysis.itemRates, summary: analysis.summary, facts, hasScore, existing });
  return { ...result, model, generatedAt: new Date().toISOString() };
}

// 기본 설문의 문항 문장은 제출건마다 함께 저장돼 있으므로 한 건에서만 읽는다.
async function builtinQuestionTexts(rows) {
  const sampleId = rows.find((row) => row.id)?.id;
  if (!sampleId) return [];
  const answers = await supabase(`submission_answers?submission_id=eq.${encodeURIComponent(sampleId)}&select=question_no,question_text&order=question_no.asc`);
  return (answers || []).map((answer) => ({ questionNo: answer.question_no, questionText: answer.question_text }));
}

async function changePassword(token, body) {
  const institutionCode = String(body.institutionCode || token.agencyCode || "").trim().toUpperCase();
  await assertCanManageInstitutionPassword(token, institutionCode);

  const password = String(body.password || "");
  if (password.length < 8) throw httpError(400, "어드민 접속 비밀번호는 8자리 이상이어야 합니다.");

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = passwordHash(password, salt);
  const rows = await supabase(`agency_accounts?institution_code=eq.${encodeURIComponent(institutionCode)}`, {
    method: "PATCH",
    body: JSON.stringify({
      password_hash: hash,
      password_salt: salt,
      password_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  await audit(token, "change_password", "agency_accounts", institutionCode, null, { institution_code: institutionCode });
  return { account: { institutionCode, passwordUpdatedAt: rows[0]?.password_updated_at } };
}

async function changeIntakePassword(token, body) {
  const institutionCode = String(body.institutionCode || token.agencyCode || "").trim().toUpperCase();
  await assertCanManageInstitutionPassword(token, institutionCode);

  const password = String(body.password || "");
  if (password.length < 8) throw httpError(400, "조사자용 접속링크 비밀번호는 8자리 이상이어야 합니다.");

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = passwordHash(password, salt);
  const rows = await supabase(`agency_accounts?institution_code=eq.${encodeURIComponent(institutionCode)}`, {
    method: "PATCH",
    body: JSON.stringify({
      intake_password_hash: hash,
      intake_password_salt: salt,
      intake_password_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  await audit(token, "change_intake_password", "agency_accounts", institutionCode, null, { institution_code: institutionCode });
  return { account: { institutionCode, intakePasswordUpdatedAt: rows[0]?.intake_password_updated_at } };
}

async function listHomeTemplates(token) {
  assertAdmin(token);
  if (!['central', 'regional', 'agency'].includes(token.role)) throw httpError(403, '관리자 권한이 필요합니다.');
  let institutions = [];
  if (token.role !== 'central') {
    const filter = token.role === 'regional'
      ? `parent_code=eq.${encodeURIComponent(token.agencyCode)}`
      : `code=eq.${encodeURIComponent(token.agencyCode)}`;
    institutions = await supabase(`institutions?${filter}&type=eq.agency&active=is.true&select=code,type,active`);
    if (!institutions.length) return { templates: [] };
  }
  const rows = await supabase('checklist_templates?status=eq.active&select=id,title,status,description,estimated_minutes,submission_target_mode,submission_target_codes&order=title.asc');
  return { templates: rows.filter(row => row.status === 'active' && (token.role === 'central' || institutions.some(institution => targetAllows(readTargets(row), institution))))
    .map(row => ({id: row.id, title: row.title, status: row.status, description: row.description || '', estimatedMinutes: row.estimated_minutes})) };
}

async function listChecklistTemplates(token, query) {
  assertCentralAdmin(token);
  const filters = ["select=*", "order=created_at.desc"];
  if (query.status) filters.push(`status=eq.${encodeURIComponent(normalizeTemplateStatus(query.status))}`);
  const rows = await supabase(`checklist_templates?${filters.join("&")}`);
  return { templates: rows.map(mapChecklistTemplateSummary) };
}

async function getChecklistTemplate(token, path) {
  assertCentralAdmin(token);
  return { template: await loadChecklistTemplate(checklistTemplateIdFromPath(path)) };
}

async function createChecklistTemplate(token, body) {
  assertCentralAdmin(token);
  const input = normalizeChecklistTemplateInput(body);
  input.submissionTargets = await normalizeTargets(body.submissionTargets, supabase);
  const generationMethod = ["ai_text", "ai_file"].includes(body.generationMethod) ? body.generationMethod : "manual";
  const template = await insertChecklistTemplate(token, input, {
    generationMethod,
    copiedFromId: null,
  });
  if (body.generationLogId) {
    const generationLogId = Number(body.generationLogId);
    if (Number.isInteger(generationLogId) && generationLogId > 0) {
      await supabase(
        `ai_generation_logs?id=eq.${generationLogId}&created_by=eq.${encodeURIComponent(token.agencyCode)}&template_id=is.null`,
        { method: "PATCH", body: JSON.stringify({ template_id: template.id }) }
      );
    }
  }
  await audit(token, "create_checklist_template", "checklist_templates", template.id, null, template);
  return { template };
}

async function checklistAiStatus(token) {
  assertAdmin(token);
  const credential = await accountAI().resolve(token);
  return {configured:Boolean(credential),connectionVerified:Boolean(credential),provider:credential?.provider || '',model:credential?.model || '',files:Boolean(credential?.files),questionCount:{min:AI_MIN_QUESTION_COUNT,max:AI_MAX_QUESTION_COUNT}};
}

async function generateChecklistDraft(token, body) {
  assertCentralAdmin(token);
  const request = normalizeAiDraftRequest(body);
  const credential = await requireAiCredential(token);
  const startedAt = Date.now();
  let usage = {};

  try {
    const completion = await callChecklistAi(request, credential);
    usage = completion.usage || {};
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw httpError(502, "AI가 초안 내용을 반환하지 않았습니다.");

    const parsed = parseAiJson(content);
    const draft = normalizeChecklistTemplateInput({
      ...parsed,
      title: parsed.title || request.topic,
      targetAudience: parsed.targetAudience || request.targetAudience,
      scoringEnabled: Boolean(parsed.scoringEnabled),
    });
    assertAiDraftSafety(draft);
    const logRows = await writeAiGenerationLog(token, {
      status: "success",
      model: credential.model,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      metadata: {
        topic_length: request.topic.length,
        requested_question_count: request.questionCount,
        generated_question_count: draft.questions.length,
        elapsed_ms: Date.now() - startedAt,
      },
    });
    return {
      draft: {
        ...draft,
        status: "draft",
        generationMethod: "ai_text",
      },
      generationLogId: logRows[0]?.id || null,
      model: credential.model,
    };
  } catch (error) {
    await writeAiGenerationLog(token, {
      status: "failed",
      model: credential.model,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      errorCode: String(error.statusCode || "AI_GENERATION_FAILED"),
      metadata: {
        topic_length: request.topic.length,
        requested_question_count: request.questionCount,
        elapsed_ms: Date.now() - startedAt,
      },
    }).catch(() => {});
    if (error.statusCode) throw error;
    throw httpError(502, "AI 체크리스트 초안을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

async function generateChecklistFileDraft(token, body) {
  assertCentralAdmin(token);
  const request = normalizeAiFileDraftRequest(body);
  const credential = await requireAiCredential(token);
  if (!credential.files) throw httpError(400,"선택한 AI 연결은 파일 초안 생성을 지원하지 않습니다.");
  const startedAt = Date.now();
  let usage = {};

  try {
    const aiResponse = await callChecklistFileAi(request, credential);
    usage = aiResponse.usage || {};
    const content = extractResponseText(aiResponse);
    if (!content) throw httpError(502, "AI가 파일 분석 결과를 반환하지 않았습니다.");

    const parsed = parseAiJson(content);
    if (parsed.blocked) {
      throw httpError(422, parsed.blockedReason || "파일에서 개인정보로 보이는 내용이 확인되어 초안을 생성하지 않았습니다.");
    }
    const source = sanitizeAiGeneratedTemplate(parsed.draft || parsed, request);
    const draft = normalizeChecklistTemplateInput({
      ...source,
      title: source.title || request.topic || "파일 기반 체크리스트",
      targetAudience: source.targetAudience || request.targetAudience,
      scoringEnabled: Boolean(source.scoringEnabled),
    });
    assertAiDraftSafety(draft);

    const logRows = await writeAiGenerationLog(token, {
      action: "import_file",
      status: "success",
      model: credential.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      metadata: {
        file_count: request.files.length,
        mime_types: request.files.map((file) => file.mimeType),
        file_sizes_bytes: request.files.map((file) => file.buffer.length),
        file_sha256: request.files.map((file) => file.sha256),
        total_file_size_bytes: request.totalBytes,
        requested_question_count: request.questionCount,
        generated_question_count: draft.questions.length,
        elapsed_ms: Date.now() - startedAt,
      },
    });
    return {
      draft: { ...draft, status: "draft", generationMethod: "ai_file" },
      generationLogId: logRows[0]?.id || null,
      model: credential.model,
    };
  } catch (error) {
    await writeAiGenerationLog(token, {
      action: "import_file",
      status: "failed",
      model: credential.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      errorCode: String(error.statusCode || "AI_FILE_GENERATION_FAILED"),
      metadata: {
        file_count: request.files.length,
        mime_types: request.files.map((file) => file.mimeType),
        file_sizes_bytes: request.files.map((file) => file.buffer.length),
        file_sha256: request.files.map((file) => file.sha256),
        total_file_size_bytes: request.totalBytes,
        requested_question_count: request.questionCount,
        elapsed_ms: Date.now() - startedAt,
      },
    }).catch(() => {});
    if (error.statusCode) throw error;
    throw httpError(502, "파일을 분석해 체크리스트 초안을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

function normalizeAiFileDraftRequest(body) {
  const sourceFiles = Array.isArray(body.files) && body.files.length
    ? body.files
    : [{ filename: body.filename, mimeType: body.mimeType, fileBase64: body.fileBase64 }];
  if (sourceFiles.length > AI_FILE_MAX_COUNT) {
    throw httpError(400, `파일은 최대 ${AI_FILE_MAX_COUNT}개까지 사용할 수 있습니다.`);
  }
  const files = sourceFiles.map((source, index) => normalizeAiSourceFile(source, index));
  const totalBytes = files.reduce((sum, file) => sum + file.buffer.length, 0);
  if (totalBytes > AI_FILE_MAX_BYTES) {
    throw httpError(413, "파일 전체 크기는 3.5MB 이하여야 합니다.");
  }

  const questionCount = Number(body.questionCount || 10);
  if (!Number.isInteger(questionCount) || questionCount < AI_MIN_QUESTION_COUNT || questionCount > AI_MAX_QUESTION_COUNT) {
    throw httpError(400, `AI 생성 문항 수는 ${AI_MIN_QUESTION_COUNT}개에서 ${AI_MAX_QUESTION_COUNT}개 사이여야 합니다.`);
  }
  return {
    files,
    totalBytes,
    topic: optionalText(body.topic, 500, "조사 주제") || "",
    targetAudience: optionalText(body.targetAudience, 300, "조사 대상") || "생활안전점검 대상자",
    requirements: optionalText(body.requirements, 1000, "추가 요청사항") || "",
    questionCount,
  };
}

function normalizeAiSourceFile(source, index) {
  const filename = required(source?.filename, `${index + 1}번째 파일명`);
  const mimeType = required(source?.mimeType, `${index + 1}번째 파일 형식`).toLowerCase();
  const type = AI_FILE_TYPES[mimeType];
  if (!type) throw httpError(400, "PDF, PNG, JPG 파일만 사용할 수 있습니다.");

  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const allowedExtensions = type.extensions || [type.extension];
  if (!allowedExtensions.includes(extension)) throw httpError(400, "파일 확장자와 형식이 일치하지 않습니다.");

  const encoded = String(source?.fileBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw httpError(400, "파일 데이터가 올바르지 않습니다.");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > AI_FILE_MAX_BYTES) throw httpError(413, "개별 파일 크기는 3.5MB 이하여야 합니다.");
  if (!type.signature.every((byte, index) => buffer[index] === byte)) {
    throw httpError(400, "파일 내용과 선택한 파일 형식이 일치하지 않습니다.");
  }
  return {
    filename,
    mimeType,
    buffer,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

async function callChecklistFileAi(request, credential) {

  const fileContents = request.files.map((file, index) => {
    const dataUrl = `data:${file.mimeType};base64,${file.buffer.toString("base64")}`;
    return file.mimeType === "application/pdf"
      ? { type: "input_file", filename: `source-${index + 1}.pdf`, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl, detail: "high" };
  });
  const instructions = [
    "당신은 공공 돌봄 분야의 안전점검 체크리스트 설계 전문가입니다.",
    "첨부 자료를 참고해 현장조사자가 이해하기 쉬운 한국어 체크리스트 초안을 만드세요.",
    "여러 파일이 첨부된 경우 모든 자료를 하나의 조사 자료 묶음으로 보고, 문서 순서를 유지하면서 중복 문항은 합쳐 하나의 통합 초안을 만드세요.",
    "첨부 자료에 이름, 연락처, 생년월일, 주민등록번호, 상세 주소 등 개인을 식별할 수 있는 정보가 있으면 blocked를 true로 하고 blockedReason에 이유만 설명하세요. 그 개인정보를 출력하지 마세요.",
    "개인정보가 없으면 blocked는 false, blockedReason은 빈 문자열, draft에는 체크리스트를 반환하세요.",
    "진단이나 확정적 의료 판단은 하지 말고 관찰 가능한 사실과 생활환경만 질문하세요.",
    "JSON 객체만 반환하세요.",
    "형식: {blocked,blockedReason,draft:{title,description,purpose,targetAudience,estimatedMinutes,scoringEnabled,questions:[{questionNo,questionText,required,answerType,helpText,options:[{optionText,score,displayOrder,requiresText,textPlaceholder}]}]}}",
    "answerType은 text, textarea, single_choice, multiple_choice 중 하나입니다.",
  ].join("\n");
  const complexSurveyInstructions = [
    "다음 규칙은 앞선 일반 규칙보다 우선합니다.",
    "첨부 파일이 빈 설문 양식이면 이름, 서명, 연락처, 생년월일, 주소, List ID 같은 조사 기본정보 입력란과 조사 참여 동의란만 제외하고 설문 문항은 계속 생성하세요.",
    "빈 개인정보 입력란이 있다는 이유만으로 blocked=true로 처리하지 마세요. 실제 사람의 개인정보가 이미 기입된 파일일 때만 blocked=true로 처리하세요.",
    "표, 행렬, 척도형 문항은 응답 가능한 각 행을 하나의 독립 문항으로 평탄화하세요. 모든 행에 같은 척도가 있으면 각 문항에 동일한 선택지를 반복하세요.",
    "대문항, 소제목, 원래 문항번호와 하위번호는 questionText 앞부분 또는 helpText에 보존하세요.",
    "조건부 후속문항은 독립 문항으로 만들고 helpText에 응답 조건을 명확히 적으세요.",
    "복수응답은 multiple_choice, 단일 척도와 예/아니오는 single_choice, 짧은 직접입력은 text, 사유나 의견은 textarea를 사용하세요.",
    "선택지에 '기타'와 직접입력란이 함께 있으면 별도 문항을 추가하지 말고 해당 기타 선택지에 requiresText=true와 textPlaceholder='기타 내용을 입력해 주세요.'를 지정하세요.",
    "요청 문항 수는 문서에서 실제 응답이 필요한 입력 단위의 최대 개수입니다. 문서의 순서대로 누락 없이 생성하되 요청 수를 넘기지 마세요.",
    "questionNo는 1부터 시작하는 중복 없는 연속 정수로 다시 부여하세요.",
    "JSON 형식은 {blocked,blockedReason,draft:{title,description,purpose,targetAudience,estimatedMinutes,scoringEnabled,questions:[{questionNo,questionText,required,answerType,helpText,options:[{optionText,score,displayOrder,requiresText,textPlaceholder}]}]}} 입니다.",
    "answerType은 text, textarea, single_choice, multiple_choice 중 하나만 사용하세요.",
  ].join("\n");
  const prompt = [
    `조사 주제: ${request.topic || "첨부 자료에서 파악"}`,
    `조사 대상: ${request.targetAudience}`,
    `문항 수: ${request.questionCount}`,
    `추가 요청사항: ${request.requirements || "없음"}`,
    "응답은 위에서 지정한 JSON 객체 형식으로만 작성하세요.",
  ].join("\n");

  return completeAccountAI(credential, {
      model: credential.model,
      instructions: `${instructions}\n${complexSurveyInstructions}`,
      input: [{ role: "user", content: [...fileContents, { type: "input_text", text: prompt }] }],
      text: { format: { type: "json_object" } },
    });
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function assertAiDraftSafety(draft) {
  const unsafeQuestion = draft.questions.find((question) => AI_PROHIBITED_PII_PATTERN.test(question.questionText));
  if (unsafeQuestion) {
    throw httpError(422, `${unsafeQuestion.questionNo}번 문항에 불필요한 개인정보 요청이 포함되어 AI 초안을 사용할 수 없습니다.`);
  }
}

function normalizeAiDraftRequest(body) {
  const topic = required(body.topic, "조사 주제");
  if (topic.length > 500) throw httpError(400, "조사 주제는 500자 이하여야 합니다.");
  const targetAudience = optionalText(body.targetAudience, 300, "조사 대상") || "생활안전점검 대상자";
  const requirements = optionalText(body.requirements, 1000, "추가 요청사항") || "";
  const questionCount = Number(body.questionCount || 10);
  if (!Number.isInteger(questionCount) || questionCount < AI_MIN_QUESTION_COUNT || questionCount > AI_MAX_QUESTION_COUNT) {
    throw httpError(400, `AI 생성 문항 수는 ${AI_MIN_QUESTION_COUNT}개에서 ${AI_MAX_QUESTION_COUNT}개 사이여야 합니다.`);
  }
  return { topic, targetAudience, requirements, questionCount };
}

async function callChecklistAi(request, credential) {
  const requestBody = {
      model: credential.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "당신은 공공 돌봄 분야의 안전점검 체크리스트 설계 전문가입니다.",
            "개인정보(이름, 연락처, 생년월일, 주민번호, 주소)를 묻는 문항은 절대 생성하지 마세요.",
            "진단이나 확정적 의료 판단을 하지 말고 관찰 가능한 사실과 생활환경만 질문하세요.",
            "반드시 JSON 객체만 반환하세요.",
            "스키마: {title,description,purpose,targetAudience,estimatedMinutes,scoringEnabled,questions:[{questionNo,questionText,required,answerType,helpText,options:[{optionText,score,displayOrder,requiresText,textPlaceholder}]}]}",
            "기타 선택 후 내용을 입력해야 하는 경우 별도 text 문항을 만들지 말고 기타 선택지에 requiresText=true와 textPlaceholder를 지정하세요.",
            "answerType은 text, textarea, single_choice, multiple_choice 중 하나입니다.",
            "선택형 문항은 선택지를 2개 이상 포함하고, 텍스트형 문항의 options는 빈 배열이어야 합니다.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `조사 주제: ${request.topic}`,
            `조사 대상: ${request.targetAudience}`,
            `문항 수: ${request.questionCount}`,
            `추가 요청사항: ${request.requirements || "없음"}`,
            "현장조사자가 이해하기 쉬운 간결한 한국어 문항으로 작성하세요.",
          ].join("\n"),
        },
      ],
    };
  const result = await completeAccountAI(credential, {
    instructions:requestBody.messages[0].content,
    input:[{role:'user',content:[{type:'input_text',text:requestBody.messages[1].content}]}],
    text:{format:{type:'json_object'}}
  });
  return {choices:[{message:{content:accountAIOutputText(result)}}],usage:{prompt_tokens:result.usage?.input_tokens,completion_tokens:result.usage?.output_tokens}};
}

function parseAiJson(content) {
  try {
    return JSON.parse(String(content).replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim());
  } catch {
    throw httpError(502, "AI가 반환한 초안 형식을 해석하지 못했습니다.");
  }
}

function writeAiGenerationLog(token, details) {
  return supabase("ai_generation_logs", {
    method: "POST",
    body: JSON.stringify({
      template_id: null,
      action: details.action || "generate",
      model: details.model || null,
      status: details.status,
      input_tokens: Number.isFinite(Number(details.inputTokens)) ? Number(details.inputTokens) : null,
      output_tokens: Number.isFinite(Number(details.outputTokens)) ? Number(details.outputTokens) : null,
      request_metadata: details.metadata || {},
      error_code: details.errorCode || null,
      created_by: token.agencyCode,
    }),
  });
}

async function updateChecklistTemplate(token, path, body) {
  assertCentralAdmin(token);
  const id = checklistTemplateIdFromPath(path);
  const before = await loadChecklistTemplate(id);
  assertDraftTemplate(before);
  const input = normalizeChecklistTemplateInput(body);
  const targets = await normalizeTargets(body.submissionTargets, supabase, before.submissionTargets);
  let written = null;

  try {
    const rows = await supabase(`checklist_templates?id=eq.${encodeURIComponent(id)}&status=eq.draft&submission_target_revision=eq.${targets.revision}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        purpose: input.purpose,
        target_audience: input.targetAudience,
        estimated_minutes: input.estimatedMinutes,
        scoring_enabled: input.scoringEnabled,
        management_enabled: input.managementEnabled,
        management_bands: input.managementBands,
        ...targetColumns(targets),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!rows[0]) throw httpError(409, "작성 중인 양식만 수정할 수 있습니다.");
    written = rows[0];

    await supabase(`template_questions?template_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    await insertTemplateQuestions(id, input.questions);
  } catch (error) {
    if (written) await restoreDraftTemplate(before, written.submission_target_revision);
    throw error;
  }

  const after = await loadChecklistTemplate(id);
  await audit(token, "update_checklist_template", "checklist_templates", id, before, after);
  return { template: after };
}

async function deleteChecklistTemplate(token, path) {
  assertCentralAdmin(token);
  const id = checklistTemplateIdFromPath(path);
  const before = await loadChecklistTemplate(id);
  assertDraftTemplate(before);

  const rows = await supabase(`checklist_templates?id=eq.${encodeURIComponent(id)}&status=eq.draft`, {
    method: "DELETE",
  });
  if (!rows[0]) throw httpError(409, "작성 중인 양식만 삭제할 수 있습니다.");

  await audit(token, "delete_checklist_template", "checklist_templates", id, before, null);
  return { deleted: true, id };
}

async function copyChecklistTemplate(token, path, body) {
  assertCentralAdmin(token);
  const sourceId = checklistTemplateIdFromPath(path);
  const source = await loadChecklistTemplate(sourceId);
  // Copying must not silently broaden an institution-restricted form.
  await normalizeTargets({...source.submissionTargets,revision:0}, supabase, {...source.submissionTargets,revision:0});
  const requestedTitle = String(body.title || "").trim();
  const input = normalizeChecklistTemplateInput({
    title: requestedTitle || `${source.title} 복사본`,
    description: source.description,
    purpose: source.purpose,
    targetAudience: source.targetAudience,
    estimatedMinutes: source.estimatedMinutes,
    scoringEnabled: source.scoringEnabled,
    managementEnabled: source.managementEnabled,
    managementBands: source.managementBands,
    questions: source.questions,
  });

  const template = await insertChecklistTemplate(token, input, {
    generationMethod: "manual",
    copiedFromId: sourceId,
    submissionTargets: source.submissionTargets,
  });
  await audit(token, "copy_checklist_template", "checklist_templates", template.id, source, template);
  return { template };
}

async function activateChecklistTemplate(token, path) {
  assertCentralAdmin(token);
  const id = checklistTemplateIdFromPath(path);
  const before = await loadChecklistTemplate(id);
  assertDraftTemplate(before);
  normalizeChecklistTemplateInput(before);

  const now = new Date().toISOString();
  const rows = await supabase(`checklist_templates?id=eq.${encodeURIComponent(id)}&status=eq.draft`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "active",
      approved_by: token.agencyCode,
      activated_at: now,
      updated_at: now,
    }),
  });
  if (!rows[0]) throw httpError(409, "작성 중인 양식만 운영할 수 있습니다.");

  const after = await loadChecklistTemplate(id);
  await audit(token, "activate_checklist_template", "checklist_templates", id, before, after);
  return { template: after };
}

async function closeChecklistTemplate(token, path) {
  assertCentralAdmin(token);
  const id = checklistTemplateIdFromPath(path);
  const before = await loadChecklistTemplate(id);
  if (before.status !== "active") throw httpError(409, "운영 중인 양식만 종료할 수 있습니다.");

  const now = new Date().toISOString();
  const rows = await supabase(`checklist_templates?id=eq.${encodeURIComponent(id)}&status=eq.active`, {
    method: "PATCH",
    body: JSON.stringify({ status: "closed", closed_at: now, updated_at: now }),
  });
  if (!rows[0]) throw httpError(409, "운영 중인 양식만 종료할 수 있습니다.");

  const after = await loadChecklistTemplate(id);
  await audit(token, "close_checklist_template", "checklist_templates", id, before, after);
  return { template: after };
}

async function insertChecklistTemplate(token, input, options) {
  const rows = await supabase("checklist_templates", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      purpose: input.purpose,
      target_audience: input.targetAudience,
      status: "draft",
      generation_method: options.generationMethod,
      estimated_minutes: input.estimatedMinutes,
      scoring_enabled: input.scoringEnabled,
      management_enabled: input.managementEnabled,
      management_bands: input.managementBands,
      created_by: token.agencyCode,
      copied_from_id: options.copiedFromId,
      ...targetColumns(options.submissionTargets || input.submissionTargets || {mode:'all',codes:[]}),
    }),
  });
  const created = rows[0];

  try {
    await insertTemplateQuestions(created.id, input.questions);
  } catch (error) {
    await supabase(`checklist_templates?id=eq.${encodeURIComponent(created.id)}&status=eq.draft`, {
      method: "DELETE",
    });
    throw error;
  }

  return loadChecklistTemplate(created.id);
}

async function insertTemplateQuestions(templateId, questions) {
  for (const question of questions) {
    const questionRows = await supabase("template_questions", {
      method: "POST",
      body: JSON.stringify({
        template_id: templateId,
        question_no: question.questionNo,
        question_text: question.questionText,
        required: question.required,
        answer_type: question.answerType,
        help_text: question.helpText,
      }),
    });

    if (question.options.length > 0) {
      await supabase("question_options", {
        method: "POST",
        body: JSON.stringify(
          question.options.map((option) => ({
            question_id: questionRows[0].id,
            option_text: option.optionText,
            score: option.score,
            display_order: option.displayOrder,
            requires_text: option.requiresText,
            text_placeholder: option.textPlaceholder,
          }))
        ),
      });
    }
  }
}

async function loadChecklistTemplate(id) {
  const templateRows = await supabase(`checklist_templates?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!templateRows[0]) throw httpError(404, "체크리스트 양식을 찾을 수 없습니다.");

  const questionRows = await supabase(
    `template_questions?template_id=eq.${encodeURIComponent(id)}&select=*&order=question_no.asc`
  );
  const questionIds = questionRows.map((row) => row.id);
  const optionRows = questionIds.length === 0
    ? []
    : await supabase(
        `question_options?question_id=in.(${questionIds.map((questionId) => encodeURIComponent(questionId)).join(",")})&select=*&order=display_order.asc`
      );

  const optionsByQuestion = new Map();
  optionRows.forEach((row) => {
    const values = optionsByQuestion.get(String(row.question_id)) || [];
    values.push(mapQuestionOption(row));
    optionsByQuestion.set(String(row.question_id), values);
  });

  return {
    ...mapChecklistTemplateSummary(templateRows[0]),
    questions: questionRows.map((row) => ({
      id: row.id,
      questionNo: row.question_no,
      questionText: row.question_text,
      required: row.required,
      answerType: row.answer_type,
      helpText: row.help_text || "",
      options: optionsByQuestion.get(String(row.id)) || [],
    })),
  };
}

async function restoreDraftTemplate(template, targetRevision) {
  try {
    const currentRows = await supabase(
      `checklist_templates?id=eq.${encodeURIComponent(template.id)}&select=id,status,submission_target_revision`
    );
    if (!currentRows[0] || currentRows[0].status !== "draft") return;
    if (targetRevision !== undefined && currentRows[0].submission_target_revision !== targetRevision) return;

    await supabase(`template_questions?template_id=eq.${encodeURIComponent(template.id)}`, { method: "DELETE" });
    await supabase(`checklist_templates?id=eq.${encodeURIComponent(template.id)}&status=eq.draft`, {
      method: "PATCH",
      body: JSON.stringify({
        title: template.title,
        description: template.description,
        purpose: template.purpose,
        target_audience: template.targetAudience,
        estimated_minutes: template.estimatedMinutes,
        scoring_enabled: template.scoringEnabled,
        management_enabled: template.managementEnabled,
        management_bands: template.managementBands,
        ...targetColumns(template.submissionTargets),
        updated_at: template.updatedAt,
      }),
    });
    await insertTemplateQuestions(template.id, normalizeChecklistQuestions(template.questions));
  } catch (restoreError) {
    console.error("Failed to restore checklist template draft", {
      templateId: template.id,
      message: restoreError.message,
    });
  }
}

function normalizeChecklistTemplateInput(body) {
  const title = required(body.title, "양식명");
  if (title.length > 120) throw httpError(400, "양식명은 120자 이하여야 합니다.");

  const questions = normalizeChecklistQuestions(body.questions);
  if (questions.length === 0) throw httpError(400, "체크리스트 문항이 한 개 이상 필요합니다.");
  if (questions.length > TEMPLATE_MAX_QUESTION_COUNT) {
    throw httpError(400, `체크리스트 문항은 최대 ${TEMPLATE_MAX_QUESTION_COUNT}개까지 만들 수 있습니다.`);
  }

  const estimatedMinutes =
    body.estimatedMinutes === null || body.estimatedMinutes === undefined || body.estimatedMinutes === ""
      ? null
      : Number(body.estimatedMinutes);
  if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 120)) {
    throw httpError(400, "예상 소요시간은 1분에서 120분 사이여야 합니다.");
  }

  let management;
  try { management = normalizeManagement(body, questions); }
  catch (error) { throw httpError(400, error.message); }
  return {
    ...management,
    title,
    description: optionalText(body.description, 2000, "양식 설명"),
    purpose: optionalText(body.purpose, 2000, "점검 목적"),
    targetAudience: optionalText(body.targetAudience, 1000, "점검 대상"),
    estimatedMinutes,
    scoringEnabled: Boolean(body.scoringEnabled),
    questions,
  };
}

function sanitizeAiGeneratedTemplate(source, request = {}) {
  const raw = source && typeof source === "object" ? source : {};
  const allowedTypes = new Set(["text", "textarea", "single_choice", "multiple_choice"]);
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .slice(0, TEMPLATE_MAX_QUESTION_COUNT)
    .map((question, index) => {
      const item = question && typeof question === "object" ? question : {};
      const questionText = String(item.questionText || "").trim().slice(0, 1000);
      if (!questionText) return null;

      const uniqueOptions = [];
      const optionTexts = new Set();
      for (const [optionIndex, option] of (Array.isArray(item.options) ? item.options : []).entries()) {
        if (uniqueOptions.length >= 20) break;
        const optionText = String(option?.optionText || option?.text || "").trim().slice(0, 500);
        if (!optionText || optionTexts.has(optionText)) continue;
        optionTexts.add(optionText);
        const rawScore = Number(option?.score);
        const requiresText = Boolean(option?.requiresText) || /^기타(?:\s*\(|\s*$)/.test(optionText);
        uniqueOptions.push({
          optionText,
          score: Number.isInteger(rawScore) && rawScore >= -1000 && rawScore <= 1000 ? rawScore : 0,
          displayOrder: uniqueOptions.length + 1,
          requiresText,
          textPlaceholder: requiresText
            ? String(option?.textPlaceholder || "기타 내용을 입력해 주세요.").trim().slice(0, 200)
            : null,
        });
      }

      let answerType = allowedTypes.has(String(item.answerType || "").trim())
        ? String(item.answerType).trim()
        : uniqueOptions.length >= 2
          ? "single_choice"
          : "text";
      const isChoice = answerType === "single_choice" || answerType === "multiple_choice";
      if (isChoice && uniqueOptions.length < 2) answerType = "text";

      return {
        questionNo: index + 1,
        questionText,
        required: Boolean(item.required),
        answerType,
        helpText: String(item.helpText || "").trim().slice(0, 500) || null,
        options: answerType === "single_choice" || answerType === "multiple_choice" ? uniqueOptions : [],
      };
    })
    .filter((question) => question && !AI_PROHIBITED_PII_PATTERN.test(question.questionText))
    .map((question, index) => ({ ...question, questionNo: index + 1 }));

  const estimatedMinutes = Number(raw.estimatedMinutes);
  return {
    ...raw,
    title: String(raw.title || request.topic || "AI 생성 체크리스트").trim().slice(0, 120),
    description: String(raw.description || "").trim().slice(0, 2000),
    purpose: String(raw.purpose || "").trim().slice(0, 2000),
    targetAudience: String(raw.targetAudience || request.targetAudience || "").trim().slice(0, 1000),
    estimatedMinutes:
      Number.isInteger(estimatedMinutes) && estimatedMinutes >= 1 && estimatedMinutes <= 120
        ? estimatedMinutes
        : null,
    scoringEnabled: Boolean(raw.scoringEnabled),
    questions,
  };
}

function normalizeChecklistQuestions(questions) {
  if (!Array.isArray(questions)) throw httpError(400, "체크리스트 문항 목록이 필요합니다.");
  const allowedTypes = new Set(["text", "textarea", "single_choice", "multiple_choice"]);
  const questionNos = new Set();

  return questions.map((question, index) => {
    const questionNo = Number(question.questionNo ?? index + 1);
    if (!Number.isInteger(questionNo) || questionNo < 1) {
      throw httpError(400, `${index + 1}번 문항번호가 올바르지 않습니다.`);
    }
    if (questionNos.has(questionNo)) throw httpError(400, `${questionNo}번 문항번호가 중복되었습니다.`);
    questionNos.add(questionNo);

    const questionText = required(question.questionText, `${questionNo}번 문항`);
    if (questionText.length > 1000) throw httpError(400, `${questionNo}번 문항은 1,000자 이하여야 합니다.`);

    const answerType = String(question.answerType || "").trim();
    if (!allowedTypes.has(answerType)) throw httpError(400, `${questionNo}번 문항의 답변 형식이 올바르지 않습니다.`);

    const options = normalizeQuestionOptions(question.options, questionNo);
    const isChoice = answerType === "single_choice" || answerType === "multiple_choice";
    if (isChoice && options.length < 2) {
      throw httpError(400, `${questionNo}번 선택형 문항에는 두 개 이상의 선택지가 필요합니다.`);
    }
    if (!isChoice && options.length > 0) {
      throw httpError(400, `${questionNo}번 텍스트형 문항에는 선택지를 만들 수 없습니다.`);
    }

    return {
      questionNo,
      questionText,
      required: Boolean(question.required),
      answerType,
      helpText: optionalText(question.helpText, 500, `${questionNo}번 도움말`),
      options,
    };
  });
}

function normalizeQuestionOptions(options, questionNo) {
  if (options === null || options === undefined) return [];
  if (!Array.isArray(options)) throw httpError(400, `${questionNo}번 문항의 선택지가 올바르지 않습니다.`);
  if (options.length > 20) throw httpError(400, `${questionNo}번 문항은 선택지를 최대 20개까지 만들 수 있습니다.`);

  const displayOrders = new Set();
  const optionTexts = new Set();
  return options.map((option, index) => {
    const optionText = required(option.optionText || option.text, `${questionNo}번 문항 ${index + 1}번째 선택지`);
    if (optionText.length > 500) throw httpError(400, "선택지는 500자 이하여야 합니다.");
    if (optionTexts.has(optionText)) throw httpError(400, `${questionNo}번 문항에 중복 선택지가 있습니다.`);
    optionTexts.add(optionText);

    const displayOrder = Number(option.displayOrder ?? index + 1);
    if (!Number.isInteger(displayOrder) || displayOrder < 1 || displayOrders.has(displayOrder)) {
      throw httpError(400, `${questionNo}번 문항의 선택지 순서가 올바르지 않습니다.`);
    }
    displayOrders.add(displayOrder);

    const score = option.score === null || option.score === undefined || option.score === "" ? 0 : Number(option.score);
    if (!Number.isInteger(score) || score < -1000 || score > 1000) {
      throw httpError(400, `${questionNo}번 문항의 선택지 점수가 올바르지 않습니다.`);
    }
    const requiresText = Boolean(option.requiresText);
    const textPlaceholder = requiresText
      ? optionalText(option.textPlaceholder, 200, `${questionNo}번 문항 추가 입력 안내`) || "기타 내용을 입력해 주세요."
      : null;
    return { optionText, score, displayOrder, requiresText, textPlaceholder };
  });
}

function optionalText(value, maxLength, label) {
  const text = String(value || "").trim();
  if (text.length > maxLength) throw httpError(400, `${label}은(는) ${maxLength.toLocaleString()}자 이하여야 합니다.`);
  return text || null;
}

function normalizeTemplateStatus(value) {
  const status = String(value || "").trim();
  if (!["draft", "active", "closed"].includes(status)) throw httpError(400, "지원하지 않는 양식 상태입니다.");
  return status;
}

function checklistTemplateIdFromPath(path) {
  return validUuid(path.split("/")[2], "체크리스트 양식 ID");
}

function validUuid(value, label) {
  const id = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw httpError(400, `${label}가 올바르지 않습니다.`);
  }
  return id;
}

function assertDraftTemplate(template) {
  if (template.status !== "draft") throw httpError(409, "작성 중인 양식만 수정하거나 삭제할 수 있습니다.");
}

function mapChecklistTemplateSummary(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    purpose: row.purpose || "",
    targetAudience: row.target_audience || "",
    status: row.status,
    generationMethod: row.generation_method,
    estimatedMinutes: row.estimated_minutes,
    scoringEnabled: row.scoring_enabled,
    managementEnabled: Boolean(row.management_enabled),
    managementBands: row.management_bands || [],
    createdBy: row.created_by,
    approvedBy: row.approved_by || "",
    copiedFromId: row.copied_from_id || "",
    activatedAt: row.activated_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submissionTargets: readTargets(row),
  };
}

function mapQuestionOption(row) {
  return {
    id: row.id,
    optionText: row.option_text,
    score: row.score,
    displayOrder: row.display_order,
    requiresText: Boolean(row.requires_text),
    textPlaceholder: row.text_placeholder || "",
  };
}

function normalizeAnswers(type, answers) {
  if (!scoreRules[type]) throw httpError(400, "지원하지 않는 체크리스트 유형입니다.");
  if (!Array.isArray(answers) || answers.length === 0) throw httpError(400, "문항 응답이 필요합니다.");

  return answers.map((answer, index) => {
    const answerLabel = String(answer.answerLabel || answer.answer || "");
    if (!(answerLabel in scoreRules[type])) throw httpError(400, `${index + 1}번 문항 응답값이 올바르지 않습니다.`);
    return {
      questionNo: Number(answer.questionNo || index + 1),
      questionText: required(answer.questionText, `${index + 1}번 문항`),
      answerLabel,
      score: scoreRules[type][answerLabel],
    };
  });
}

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, `${label}을(를) 입력해 주세요.`);
  return text;
}

function isValidDateText(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function todayDateKey() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function submittedDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function riskSummaryPercent(rows, type) {
  const typed = rows.filter((row) => row.checklist_type === type);
  if (typed.length === 0) return 0;
  const riskCount = typed.filter((row) => isRiskSubmission(type, Number(row.total_score || 0))).length;
  return Math.round((riskCount / typed.length) * 100);
}

function isRiskSubmission(type, score) {
  if (type === "fall") return score >= 60;
  if (type === "depression") return score >= 10;
  if (type === "memory") return score >= 6;
  return false;
}

function validateSubmissionPersonalInfo(body) {
  const clientGender = required(body.clientGender, "대상자 성별");
  if (!["남", "여"].includes(clientGender)) throw httpError(400, "대상자 성별 값이 올바르지 않습니다.");
  const clientBirth = required(body.clientBirth, "대상자 생년월일");
  if (!isValidDateText(clientBirth)) throw httpError(400, "대상자 생년월일 값이 올바르지 않습니다.");
  const memo = body.fieldMemo ?? "";
  if (typeof memo !== "string" || memo.length > 2000) throw httpError(400, "현장 메모는 2,000자 이하의 문자열로 입력해 주세요.");
  return {
    worker_name: validPersonName(body.workerName, "조사자 성명"),
    worker_phone: validPhoneNumber(body.workerPhone, "조사자 전화번호"),
    client_name: validPersonName(body.clientName, "대상자 성명"),
    client_gender: clientGender,
    client_birth: clientBirth,
    field_memo: memo,
  };
}

function validPersonName(value, label) {
  if (typeof value !== "string") throw httpError(400, `${label}은(는) 문자열로 입력해 주세요.`);
  const text = required(value, label);
  if (!/^[가-힣a-zA-Z\s]{2,30}$/.test(text)) {
    throw httpError(400, `${label}은(는) 한글 또는 영문 이름으로 입력해 주세요.`);
  }
  return text;
}

function validPhoneNumber(value, label) {
  if (typeof value !== "string") throw httpError(400, `${label}은(는) 문자열로 입력해 주세요.`);
  const text = required(value, label).replace(/^(01[016789])(\d{3,4})(\d{4})$/, "$1-$2-$3");
  if (!/^01[016789]-\d{3,4}-\d{4}$/.test(text)) {
    throw httpError(400, `${label}은(는) 010-0000-0000 형식으로 입력해 주세요.`);
  }
  return text;
}

function mapSubmission(row) {
  const answers = [...(row.submission_answers || [])].sort(
    (a, b) => Number(a.questionNo ?? a.question_no ?? 0) - Number(b.questionNo ?? b.question_no ?? 0)
  );
  return {
    id: row.id,
    agencyCode: row.institution_code,
    institutionName: row.institution_name || row.institutions?.name || "",
    sido: row.sido || row.institutions?.sido || "",
    sigungu: row.sigungu || row.institutions?.sigungu || "",
    checklistType: row.checklist_type,
    templateId: row.template_id || "",
    checklistTitle: row.template_snapshot?.title || row.snapshot_title || row.checklist_title || row.checklist_templates?.title || "",
    templateGenerationMethod: row.template_snapshot?.generationMethod || row.template_generation_method || row.checklist_templates?.generation_method || "",
    scoringEnabled: row.template_id ? (row.template_snapshot?.scoringEnabled ?? row.scoring_enabled ?? row.checklist_templates?.scoring_enabled) !== false : true,
    managementLabel: row.management_label ?? null,
    surveyDate: row.survey_date,
    workerName: row.worker_name,
    workerPhone: row.worker_phone,
    clientName: row.client_name,
    clientGender: row.client_gender,
    clientBirth: row.client_birth,
    clientId: row.client_id || "",
    status: row.status,
    fieldMemo: row.field_memo || "",
    totalScore: row.total_score,
    maxScore: row.max_score ?? (Array.isArray(row.template_snapshot?.questions) ? scoreRange(row.template_snapshot.questions).max : null),
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    answers: answers.map((answer) => ({
      ...answer,
      answerLabel: answer.answerLabel ?? answer.answer_label ?? "",
      answerValue: answer.answerValue ?? answer.answer_value ?? null,
    })),
  };
}

async function audit(token, action, targetTable, targetId, beforeData, afterData) {
  await supabase("audit_logs", {
    method: "POST",
    body: JSON.stringify({
      institution_code: token.agencyCode,
      actor_code: token.agencyCode,
      action,
      target_table: targetTable,
      target_id: String(targetId || ""),
      before_data: beforeData,
      after_data: afterData,
    }),
  });
}
