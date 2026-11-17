window.initialWorkspaceHash = location.hash;
const checklistDefs = {
  fall: {
    label: "낙상 체크리스트",
    max: 100,
    options: [
      { label: "예", value: 5 },
      { label: "아니오", value: 0 },
      { label: "미해당", value: 0 },
    ],
    questions: [
      "출입문 주변의 이동 공간이 좁아 몸이나 보행 보조기구가 걸릴 수 있다.",
      "신발이나 생활용품이 출입 동선 바닥에 놓여 있다.",
      "방과 복도 사이의 바닥 높이가 달라 발이 걸릴 수 있다.",
      "바닥 매트나 작은 깔개가 쉽게 밀리거나 들려 있다.",
      "전선이나 충전선이 사람이 자주 다니는 길을 가로지른다.",
      "가구 사이 통로가 좁거나 모서리를 피해서 이동하기 어렵다.",
      "자주 쓰는 물건이 손이 닿기 어려운 높은 곳에 보관되어 있다.",
      "조리 공간 바닥에 물기나 기름기가 남아 있는 경우가 있다.",
      "세면 또는 목욕 후 욕실 바닥의 물기가 오래 남는다.",
      "변기나 샤워 공간에서 몸을 지지할 고정된 부분이 부족하다.",
      "침실에서 화장실로 이동하는 야간 동선이 어둡다.",
      "누운 상태나 앉은 상태에서 가까운 조명을 바로 켜기 어렵다.",
      "계단의 높이가 고르지 않거나 디딤면에 물건이 놓여 있다.",
      "계단이나 경사진 곳에서 안정적으로 잡을 수 있는 부분이 부족하다.",
      "침대나 의자의 높이가 맞지 않아 앉고 일어날 때 몸이 흔들린다.",
      "자리에서 일어날 때 지지할 가구나 보조기구가 가까이 없다.",
      "실내에서 발에 고정되지 않는 슬리퍼나 미끄러운 양말을 착용한다.",
      "이동할 때 바닥에 닿을 정도로 긴 옷을 입는 경우가 있다.",
      "시야가 흐린 상황에서도 안경이나 필요한 시각 보조도구를 사용하지 않는다.",
      "어지러움이나 다리 힘 빠짐을 느껴도 곧바로 이동하는 경우가 있다.",
    ],
  },
  depression: {
    label: "우울 체크리스트",
    max: 27,
    options: [
      { label: "없음", value: 0 },
      { label: "2~3일 이상", value: 1 },
      { label: "7일 이상", value: 2 },
      { label: "거의 매일", value: 3 },
    ],
    questions: [
      "최근 일상에서 마음이 평소보다 무겁게 느껴진 날이 있었다.",
      "계획했던 일을 시작하는 과정이 유난히 부담스럽게 느껴졌다.",
      "평소 즐기던 활동을 찾거나 참여하는 횟수가 줄었다.",
      "가족이나 지인과 대화하거나 연락하는 일을 피하고 싶었다.",
      "하루의 생활 리듬을 일정하게 유지하기가 어려웠다.",
      "잠을 자거나 쉬어도 충분히 회복되었다는 느낌이 적었다.",
      "식사, 정리, 외출 준비 같은 기본적인 생활 관리를 미룬 적이 있었다.",
      "작은 선택이나 결정을 내리는 일도 크게 부담스럽게 느껴졌다.",
      "가까운 미래의 일을 긍정적으로 기대하기 어려웠다.",
    ],
  },
  memory: {
    label: "기억 체크리스트",
    max: 14,
    options: [
      { label: "아니오", value: 0 },
      { label: "네", value: 1 },
    ],
    questions: [
      "가까운 날짜의 일정도 메모하지 않으면 지나치는 경우가 있습니까?",
      "방금 들은 안내를 다시 물어본 경우가 있습니까?",
      "어떤 일을 하려고 방에 들어간 뒤 목적을 잊은 적이 있습니까?",
      "자주 쓰는 물건을 평소와 다른 곳에 두고 오래 찾은 적이 있습니까?",
      "하던 일이 중단된 뒤 무엇을 하고 있었는지 떠올리기 어려운 경우가 있습니까?",
      "메모 없이 장을 보면 사려던 물건을 빠뜨리는 경우가 있습니까?",
      "익숙한 장소에서도 표지나 방향을 잠시 혼동한 적이 있습니까?",
      "대화를 마친 뒤 이야기의 순서를 떠올리기 어려운 경우가 있습니까?",
      "같은 내용을 이미 물어본 사실을 모르고 다시 질문한 적이 있습니까?",
      "가전제품이나 조리기구를 껐는지 확신하지 못해 다시 확인한 적이 있습니까?",
      "정해진 납부일이나 복약 시간을 놓친 적이 있습니까?",
      "알고 지내던 사람의 이름이 바로 떠오르지 않아 곤란한 적이 있습니까?",
      "오늘 날짜나 요일을 잘못 알고 있었던 적이 있습니까?",
      "기억의 변화 때문에 평소 생활 절차를 수행하는 데 불편을 느낀 적이 있습니까?",
    ],
  },
};

let institutionMaster = window.INSTITUTION_MASTER || [];
const CENTRAL_ADMIN_CODE = "SAMPLECENTRAL";
const CENTRAL_ADMIN = {
  sido: "가상전국",
  sigungu: "중앙관리자",
  name: "가상 중앙관리자",
  code: CENTRAL_ADMIN_CODE,
  type: "central",
  parentCode: null,
  active: true,
  managedTargetCount: 0,
};
const DEFAULT_AGENCY_CODE = institutionMaster.find((item) => item.type === "agency")?.code || "SAMPLEAG001";
const DEFAULT_PASSWORD = "";

function findInstitutionByCode(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (normalizedCode === CENTRAL_ADMIN_CODE) return CENTRAL_ADMIN;
  return institutionMaster.find((item) => String(item.code).toUpperCase() === normalizedCode);
}

function normalizeInstitution(institution) {
  const fallback = institutionMaster.find((item) => item.code === DEFAULT_AGENCY_CODE) || {
    sido: "가상특별시",
    sigungu: "가상구 A",
    name: "가상 기관담당자 001",
    code: DEFAULT_AGENCY_CODE,
    type: "agency",
  };
  const source = institution || fallback;
  return {
    sido: source.sido,
    sigungu: source.sigungu,
    name: source.name,
    code: source.code,
    type: source.type,
    parentCode: source.parentCode ?? source.parent_code ?? null,
    active: source.active !== false,
    managedTargetCount: source.managedTargetCount ?? source.managed_target_count ?? 250,
    password: DEFAULT_PASSWORD,
  };
}

let agency = normalizeInstitution();
let selectedMasterAgencyCode = agency.code;
let masterAgencySearchTerm = "";
let masterLevelFilter = "all";
let masterStateFilter = "all";
const expandedMasterRegions = new Set();
const expandedRegionalFilterRegions = new Set();
let masterRegionsInitialized = false;

const AUTH_SESSION_KEY = "lifeSafetyAdminAuthenticated";
const AUTH_AGENCY_CODE_KEY = "lifeSafetyAdminAgencyCode";
const AUTH_TOKEN_KEY = "lifeSafetyAdminToken";
const AUTH_AGENCY_DATA_KEY = "lifeSafetyAdminAgency";
const API_BASE_URL = "/api";
const PASSWORD_STORAGE_PREFIX = "lifeSafetyAgencyPassword:";
const PASSWORD_UPDATED_AT_PREFIX = "lifeSafetyAgencyPasswordUpdatedAt:";
const INTAKE_PASSWORD_STORAGE_PREFIX = "lifeSafetyIntakePassword:";
const INTAKE_PASSWORD_UPDATED_AT_PREFIX = "lifeSafetyIntakePasswordUpdatedAt:";

let submissions = [
  {
    id: 1007,
    agencyCode: DEFAULT_AGENCY_CODE,
    type: "fall",
    date: "2026-07-06 09:30",
    workerName: "김민정",
    workerPhone: "010-2345-1111",
    clientName: "오영자",
    clientGender: "여",
    clientBirth: "1941-03-21",
    clientId: "",
    status: "확인 대기",
    answers: [
      "예",
      "아니오",
      "예",
      "예",
      "예",
      "미해당",
      "아니오",
      "예",
      "예",
      "예",
      "아니오",
      "아니오",
      "예",
      "예",
      "아니오",
      "예",
      "예",
      "아니오",
      "예",
      "아니오",
    ],
    memo: "화장실 손잡이 설치 필요. 야간 조명 교체 권고.",
  },
  {
    id: 1006,
    agencyCode: DEFAULT_AGENCY_CODE,
    type: "depression",
    date: "2026-07-06 10:10",
    workerName: "박성호",
    workerPhone: "010-2345-2222",
    clientName: "이정순",
    clientGender: "여",
    clientBirth: "1939-11-02",
    clientId: "C-24018",
    status: "확인 완료",
    answers: ["7일 이상", "2~3일 이상", "거의 매일", "2~3일 이상", "없음", "7일 이상", "2~3일 이상", "없음", "없음"],
    memo: "정기 방문 시 정서 지원 필요.",
  },
  {
    id: 1005,
    agencyCode: DEFAULT_AGENCY_CODE,
    type: "memory",
    date: "2026-07-05 15:00",
    workerName: "최은영",
    workerPhone: "010-2345-3333",
    clientName: "한길수",
    clientGender: "남",
    clientBirth: "1944-07-14",
    clientId: "C-24102",
    status: "확인 완료",
    answers: ["네", "네", "아니오", "네", "네", "아니오", "아니오", "아니오", "네", "아니오", "아니오", "아니오", "네", "아니오"],
    memo: "제출 내용 확인 완료. 추가 관리 여부는 별도 검토.",
  },
];

const PAGE_SIZE = 20;
let currentPage = 1;
let submissionPagination = { page: 1, limit: PAGE_SIZE, totalCount: 0, totalPages: 1, start: 0, end: 0 };
let activeStatsTab = "overview";
let homeSummaryData = null;
let submissionsLoaded = false;
let appliedSubmissionFilters = null;
let submissionTemplateChoices = [];
let submissionRequestSequence = 0;
let submissionDetailsExporting = false;
let submissionsLoading = false;
let submissionsError = "";
let statsResults = { overview: null, distribution: null };
let statsLoading = { overview: false, distribution: false };
let statsDirty = { overview: true, distribution: true };
let checklistTemplates = [];
let selectedTemplateId = "";
let templateStatusFilter = "";
let checklistTemplatesLoaded = false;
let aiDraftFiles = [];
const AI_DRAFT_FILE_LIMIT = 5;
const AI_DRAFT_TOTAL_BYTES = 3.5 * 1024 * 1024;
const AI_DRAFT_ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
let excelModulePromise = null;
let bulkInstitutionUploadState = null;
const selectedSubmissionIds = new Set();
const DELETED_SUBMISSION_IDS_KEY = "lifeSafetyDeletedSubmissionIds";
const COMPLETION_STATE_KEY = "lifeSafetySubmissionCompletionState";

function normalizeChecklistType(value) {
  const text = String(value || "").trim();
  if (["fall", "depression", "memory"].includes(text)) return text;
  if (text.includes("낙상")) return "fall";
  if (text.includes("우울") || text.includes("PHQ")) return "depression";
  if (text.includes("기억") || text.includes("치매")) return "memory";
  return text;
}

function checklistTypeOf(item) {
  if (item?.templateId) return `template:${item.templateId}`;
  return normalizeChecklistType(item?.type || item?.checklistType);
}

function checklistDefOf(item) {
  return (
    checklistDefs[checklistTypeOf(item)] || {
      label: item?.checklistTitle || "중앙관리자 점검 양식",
      max: item?.maxScore ?? null,
      options: [],
      questions: [],
      dynamic: true,
    }
  );
}

function submissionUsesScoring(item) {
  return !item?.templateId || item.scoringEnabled !== false;
}

function deletedSubmissionIds() {
  return new Set(JSON.parse(localStorage.getItem(DELETED_SUBMISSION_IDS_KEY) || "[]").map(String));
}

function saveDeletedSubmissionIds(ids) {
  localStorage.setItem(DELETED_SUBMISSION_IDS_KEY, JSON.stringify(Array.from(ids)));
}

function completionStateMap() {
  return JSON.parse(localStorage.getItem(COMPLETION_STATE_KEY) || "{}");
}

function saveCompletionStateMap(map) {
  localStorage.setItem(COMPLETION_STATE_KEY, JSON.stringify(map));
}

function persistSubmissionCompletion(item) {
  const completionMap = completionStateMap();
  completionMap[String(item.id)] = {
    clientId: item.clientId,
    status: item.status,
    completedAt: new Date().toISOString(),
  };
  saveCompletionStateMap(completionMap);

  const storedWorkerSubmissions = JSON.parse(localStorage.getItem("lifeSafetyWorkerSubmissions") || "[]");
  const nextWorkerSubmissions = storedWorkerSubmissions.map((entry, index) => {
    const entryId = String(entry.id || `worker-${entry.submittedAt || index}`);
    if (entryId !== String(item.id)) return entry;
    return {
      ...entry,
      clientId: item.clientId,
      status: item.status,
    };
  });
  localStorage.setItem("lifeSafetyWorkerSubmissions", JSON.stringify(nextWorkerSubmissions));
}

function formatSubmittedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function todayDateKey() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isSubmittedToday(item) {
  return String(item.date || "").slice(0, 10) === todayDateKey();
}

function loadWorkerSubmittedItems() {
  const stored = JSON.parse(localStorage.getItem("lifeSafetyWorkerSubmissions") || "[]");
  return stored.map((item, index) => ({
    id: item.id || `worker-${item.submittedAt || index}`,
    agencyCode: item.agencyCode || DEFAULT_AGENCY_CODE,
    type: normalizeChecklistType(item.checklistType || item.type),
    date: formatSubmittedAt(item.submittedAt),
    workerName: item.workerName,
    workerPhone: item.workerPhone,
    clientName: item.clientName || "",
    clientGender: item.clientGender || "",
    clientBirth: item.clientBirth || "",
    clientId: item.clientId || "",
    status: item.status || "확인 대기",
    answers: item.answers || [],
    score: item.score ?? item.totalScore,
    memo: item.memo || "",
  }));
}

submissions = [...loadWorkerSubmittedItems(), ...submissions];
const persistedCompletionState = completionStateMap();
submissions = submissions.map((item) => {
  const state = persistedCompletionState[String(item.id)];
  if (!state) return item;
  return {
    ...item,
    clientId: state.clientId || item.clientId,
    status: state.status || item.status,
  };
});
submissions = submissions.filter((item) => !deletedSubmissionIds().has(String(item.id)));

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function answerLabel(answer) {
  if (answer && typeof answer === "object") {
    return answer.answerLabel || answer.answer || answer.label || "";
  }
  return answer;
}

function optionScore(type, answer) {
  if (answer && typeof answer === "object" && Number.isFinite(Number(answer.score))) {
    return Number(answer.score);
  }
  const def = checklistDefs[normalizeChecklistType(type)];
  if (!def) return 0;
  const option = def.options.find((item) => item.label === answerLabel(answer));
  return option ? option.value : 0;
}

function totalScore(item) {
  if ((!item.answers || item.answers.length === 0) && Number.isFinite(Number(item.score))) {
    return Number(item.score);
  }
  if ((!item.answers || item.answers.length === 0) && Number.isFinite(Number(item.totalScore))) {
    return Number(item.totalScore);
  }
  return (item.answers || []).reduce((sum, answer) => sum + optionScore(checklistTypeOf(item), answer), 0);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function authToken() {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = authToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  if (response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("AI 응답 스트림을 읽을 수 없습니다.");
    const decoder = new TextDecoder();
    let buffer = "";
    let finalPayload = null;
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "error") {
          const errorPayload = event.payload || {};
          throw new Error(errorPayload.error || errorPayload.message || "AI 요청을 처리하지 못했습니다.");
        }
        if (event.type === "result") finalPayload = event.payload;
      }
      if (done) break;
    }
    if (!finalPayload) throw new Error("AI가 완료된 응답을 반환하지 않았습니다.");
    return finalPayload;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.streamedError) {
    const error = new Error(payload.error || payload.message || "요청을 처리하지 못했습니다.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function mapApiAnswer(answer) {
  return {
    questionId: answer.questionId ?? answer.question_id ?? "",
    questionNo: answer.questionNo ?? answer.question_no,
    questionText: answer.questionText ?? answer.question_text,
    answerLabel: answer.answerLabel ?? answer.answer_label ?? answer.answer,
    score: Number(answer.score || 0),
  };
}

function mapApiSubmission(item) {
  return {
    id: item.id,
    agencyCode: item.agencyCode || item.institution_code || item.institutionCode || DEFAULT_AGENCY_CODE,
    institutionName: item.institutionName || item.institution_name || "",
    institutionSido: item.sido || item.institutionSido || "",
    institutionSigungu: item.sigungu || item.institutionSigungu || "",
    type: normalizeChecklistType(item.checklistType || item.checklist_type || item.type),
    templateId: item.templateId || item.template_id || "",
    checklistTitle: item.checklistTitle || item.checklist_title || "",
    templateGenerationMethod: item.templateGenerationMethod || item.template_generation_method || "",
    managementLabel: item.managementLabel ?? item.management_label ?? null,
    scoringEnabled:
      item.templateId || item.template_id
        ? (item.scoringEnabled ?? item.scoring_enabled ?? true)
        : true,
    date: formatSubmittedAt(item.submittedAt || item.submitted_at),
    workerName: item.workerName || item.worker_name || "",
    workerPhone: item.workerPhone || item.worker_phone || "",
    clientName: item.clientName || item.client_name || "",
    clientGender: item.clientGender || item.client_gender || "",
    clientBirth: item.clientBirth || item.client_birth || "",
    clientId: item.clientId || item.client_id || "",
    status: item.status || "확인 대기",
    answers: (item.answers || item.submission_answers || []).map(mapApiAnswer),
    score: Number(item.totalScore ?? item.total_score ?? item.score ?? 0),
    maxScore: item.maxScore ?? item.max_score ?? null,
    memo: item.fieldMemo || item.field_memo || item.memo || "",
  };
}

async function loadRemoteSubmissions() {
  if (!authToken() || !appliedSubmissionFilters) return;
  const sequence = ++submissionRequestSequence;
  submissionsLoading = true;
  submissionsError = "";
  renderDashboard();
  try {
    const query = submissionQueryParams();
    const payload = await apiRequest(`/submissions?${query.toString()}`);
    if (sequence !== submissionRequestSequence) return;
    submissions = (payload.rows || []).map(mapApiSubmission);
    submissionPagination = {
      page: Number(payload.pagination?.page || currentPage),
      limit: Number(payload.pagination?.limit || PAGE_SIZE),
      totalCount: Number(payload.pagination?.totalCount || 0),
      totalPages: Number(payload.pagination?.totalPages || 1),
      start: Number(payload.pagination?.start || 0),
      end: Number(payload.pagination?.end || 0),
    };
    currentPage = submissionPagination.page;
    populateChecklistFilter();
    submissionsLoaded = true;
  } catch (error) {
    if (sequence !== submissionRequestSequence) return;
    submissionsError = error.message || "제출 목록을 불러오지 못했습니다.";
    throw error;
  } finally {
    if (sequence === submissionRequestSequence) {
      submissionsLoading = false;
      renderDashboard();
    }
  }
}

function pendingSubmissionFilters() {
  return {
    sido: $("#filterSido")?.value,
    sigungu: $("#filterSigungu")?.value,
    agencyCode: $("#filterAgencyCode")?.value.trim(),
    agencyName: $("#filterAgencyName")?.value.trim(),
    type: $("#filterType")?.value,
    status: $("#filterStatus")?.value,
    startDate: $("#filterStartDate")?.value,
    endDate: $("#filterEndDate")?.value,
    search: $("#searchInput")?.value.trim(),
  };
}

function submissionFiltersDirty() {
  return JSON.stringify(pendingSubmissionFilters()) !== JSON.stringify(appliedSubmissionFilters);
}

function canExportSubmissionDetails() {
  return !submissionDetailsExporting && submissionsLoaded && !submissionsLoading && !submissionsError && !submissionFiltersDirty()
    && /^template:[0-9a-f-]{36}$/i.test(appliedSubmissionFilters?.type || '');
}

function querySubmissions() {
  const filters = pendingSubmissionFilters();
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    showToast('시작일자는 종료일자보다 늦을 수 없습니다.'); return;
  }
  appliedSubmissionFilters = filters;
  selectedSubmissionIds.clear();
  currentPage = 1;
  return refreshRemoteData();
}

function submissionQueryParams(options = {}) {
  const params = new URLSearchParams({page: String(options.page || currentPage), limit: String(options.limit || PAGE_SIZE)});
  Object.entries(appliedSubmissionFilters || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params;
}

async function loadHomeSummary(options = {}) {
  if (!authToken()) return;
  const owner = authToken();
  const payload = await apiRequest("/home-summary", options);
  if (authToken() !== owner) return;
  homeSummaryData = payload;
}

async function loadSubmissionDetail(id) {
  const payload = await apiRequest(`/submissions/${encodeURIComponent(id)}`);
  const detail = mapApiSubmission(payload.submission || {});
  const exists = submissions.some((item) => String(item.id) === String(id));
  submissions = exists
    ? submissions.map((item) => (String(item.id) === String(id) ? { ...item, ...detail } : item))
    : [...submissions, detail];
  return detail;
}

function clearLegacyPasswords() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    keys.filter(key => key && (key.startsWith(PASSWORD_STORAGE_PREFIX) || key.startsWith(INTAKE_PASSWORD_STORAGE_PREFIX)))
      .forEach(key => localStorage.removeItem(key));
  } catch { /* Storage may be unavailable; never read or restore a password. */ }
}

function clearPasswordFields() {
  document.querySelectorAll('input[type="password"]').forEach(input => { input.value = ""; });
}

function agencyPasswordUpdatedAtKey(code = agency.code) {
  return `${PASSWORD_UPDATED_AT_PREFIX}${code}`;
}


function intakePasswordUpdatedAtKey(code = agency.code) {
  return `${INTAKE_PASSWORD_UPDATED_AT_PREFIX}${code}`;
}


function getPasswordUpdatedAt(code = agency.code) {
  return localStorage.getItem(agencyPasswordUpdatedAtKey(code)) || "2026-07-06 11:20";
}

function setPasswordUpdatedAt(value, code = agency.code) {
  localStorage.setItem(agencyPasswordUpdatedAtKey(code), value);
}

function getIntakePasswordUpdatedAt(code = agency.code) {
  return localStorage.getItem(intakePasswordUpdatedAtKey(code)) || getPasswordUpdatedAt(code);
}

function setIntakePasswordUpdatedAt(value, code = agency.code) {
  localStorage.setItem(intakePasswordUpdatedAtKey(code), value);
}

function isAuthenticated() {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === "Y" && Boolean(authToken());
}

function roleLabel() {
  if (isCentralRole()) return "중앙관리자";
  return agency.type === "regional" ? "광역관리자" : "기관담당자";
}

function workspaceRoleTitle() {
  if (isCentralRole()) return "중앙관리자 관리 화면";
  if (isRegionalRole()) return "광역관리자 관리 화면";
  return "전담사회복지사 관리 화면";
}

function isCentralRole() {
  return agency.type === "central";
}

function isRegionalRole() {
  return agency.type === "regional";
}

function isAgencyRole() {
  return agency.type === "agency";
}

function isWideScopeRole() {
  return isRegionalRole() || isCentralRole();
}

function agencyInstitutionMap() {
  return new Map(institutionMaster.map((institution) => [institution.code, institution]));
}

function submissionInstitution(item) {
  return agencyInstitutionMap().get(item.agencyCode) || normalizeInstitution({
    code: item.agencyCode || agency.code,
    name: item.institutionName || agency.name,
    sido: item.institutionSido || agency.sido,
    sigungu: item.institutionSigungu || agency.sigungu,
    type: "agency",
  });
}

function scopedAgencies() {
  if (isCentralRole()) {
    return institutionMaster.filter((institution) => institution.type === "agency");
  }
  if (!isRegionalRole()) {
    return [agency];
  }
  return institutionMaster.filter((institution) => institution.type === "agency" && institution.parentCode === agency.code);
}

async function loadInstitutionMaster(options = {}) {
  const owner = authToken();
  const payload = await apiRequest("/institutions", options);
  if (authToken() !== owner) return;
  institutionMaster = (payload.institutions || []).map(normalizeInstitution);
  const current = institutionMaster.find((institution) => institution.code === agency.code);
  if (current) agency = { ...agency, ...current };
  masterRegionsInitialized = false;
  expandedMasterRegions.clear();
  ensureMasterTarget();
}

function masterManageableInstitutions() {
  if (isCentralRole()) {
    return institutionMaster.filter((institution) => ["agency", "regional"].includes(institution.type));
  }
  if (!isRegionalRole()) return [agency];
  return scopedAgencies();
}

function scopeManagedTargetCount() {
  if (!isWideScopeRole()) return agency.managedTargetCount;
  return scopedAgencies().reduce((sum, institution) => sum + (institution.managedTargetCount || 250), 0);
}

function intakeUrlForCode(code = agency.code) {
  const isGas = location.pathname.includes("/exec") || location.pathname.includes("/dev");
  if (isGas) return `?page=intake&agency=${code}`;
  return new URL(`intake.html?agency=${encodeURIComponent(code)}`, window.location.href).href;
}

function ensureMasterTarget() {
  if (isRegionalRole() && selectedMasterAgencyCode === agency.code) return;
  if (!isWideScopeRole()) {
    selectedMasterAgencyCode = agency.code;
    return;
  }

  const agencies = masterManageableInstitutions();
  if (!agencies.some((institution) => institution.code === selectedMasterAgencyCode)) {
    selectedMasterAgencyCode = agencies[0]?.code || agency.code || "";
  }
}

function masterTargetInstitution() {
  ensureMasterTarget();
  if (isRegionalRole() && selectedMasterAgencyCode === agency.code) return agency;
  if (!isWideScopeRole()) return agency;
  return masterManageableInstitutions().find((institution) => institution.code === selectedMasterAgencyCode) || agency;
}

function matchesMasterSearch(institution, includeLocation = false) {
  const keyword = masterAgencySearchTerm.trim().toLowerCase();
  if (!keyword) return true;
  const values = [institution.name, institution.code];
  if (includeLocation) values.push(institution.sido, institution.sigungu);
  return values.some((value) => String(value || "").toLowerCase().includes(keyword));
}

function masterAgencyButton(institution, target, extraClass = "") {
  const e = escapeMarkup;
  const totals = window.FinalWorkspace?.institutionSummary(institution.code);
  return `<div class="master-agency-item ${extraClass} ${institution.code === target.code ? 'is-selected' : ''}">
    <div class="v8-org-name"><strong>${e(institution.name)}</strong><small>${e(institution.code)} · ${e(institution.sigungu || institution.sido || '')}</small></div>
    <div class="v8-org-count"><small>전체 접수</small><strong>${totals ? totals.total + '건' : '—'}</strong></div>
    <div class="v8-org-count"><small>확인 대기</small><strong>${totals ? totals.waiting + '건' : '—'}</strong></div>
    <span class="state ${institution.active ? 'active' : ''}">${institution.active ? '사용 중' : '사용 중지'}</span>
    <button type="button" data-master-agency-code="${e(institution.code)}" aria-label="${e(institution.name)} 상세 보기">상세 보기 →</button>
  </div>`;
}
function matchesMasterState(institution) {
  return masterStateFilter === 'all' || Boolean(institution.active) === (masterStateFilter === 'active');
}

function canManageInstitution(institution) {
  if (isCentralRole()) return institution.type !== "central";
  return isRegionalRole() && institution.type === "agency" && institution.parentCode === agency.code;
}

function masterInstitutionActions(institution) {
  if (!canManageInstitution(institution)) return "";
  return `<div class="institution-row-actions">
    <button class="secondary-button compact-button" type="button" data-edit-institution="${escapeAttribute(institution.code)}">수정</button>
    <label class="institution-status-toggle ${institution.active ? "is-active" : "is-inactive"}" title="${institution.active ? "활성화 상태" : "비활성화 상태"}">
      <input type="checkbox" data-toggle-institution="${escapeAttribute(institution.code)}" ${institution.active ? "checked" : ""} aria-label="${escapeAttribute(institution.name)} 활성화 상태" />
      <span class="institution-status-track" aria-hidden="true"><span class="institution-status-knob"></span></span>
      <span class="institution-status-text">${institution.active ? "ON" : "OFF"}</span>
    </label>
  </div>`;
}

function centralMasterTree(target) {
  const regions = institutionMaster.filter(o => o.type === 'regional');
  const agencies = institutionMaster.filter(o => o.type === 'agency');
  if (!masterRegionsInitialized) {regions.forEach(r=>expandedMasterRegions.add(r.code));masterRegionsInitialized=true;}
  const keyword = masterAgencySearchTerm.trim();
  const e = escapeMarkup;
  // 광역 필터는 광역관리자만 표시한다. 하위 기관 탐색은 전체 기관에서 제공한다.
  if (masterLevelFilter === 'regional') {
    const visibleRegions = regions.filter(region => matchesMasterState(region) && (!keyword || matchesMasterSearch(region, true)));
    return {
      html: visibleRegions.map(region => `<section class="master-region-group"><div class="master-region-head">
        <div><strong>${e(region.name)}</strong><small>${e(region.code)} · ${e(region.sido || '')}</small></div>
        <div class="master-region-actions"><span class="state ${region.active ? 'active' : ''}">${region.active ? '사용 중' : '사용 중지'}</span><button type="button" data-master-agency-code="${e(region.code)}">광역관리자 상세 →</button></div>
      </div></section>`).join(''),
      visible: visibleRegions.length,
      total: regions.length,
    };
  }
  const group = (region, children) => {
    const parentMatches = region && matchesMasterSearch(region, true);
    const showParent = region && masterLevelFilter !== 'agency' && matchesMasterState(region) && (!keyword || parentMatches);
    const visibleChildren = masterLevelFilter === 'regional' ? [] : children.filter(o => matchesMasterState(o) && (!keyword || parentMatches || matchesMasterSearch(o, true)));
    if (!showParent && !visibleChildren.length) return null;
    const expanded = !region || Boolean(keyword) || masterLevelFilter !== 'all' || expandedMasterRegions.has(region.code);
    return {visible: Number(Boolean(showParent)) + visibleChildren.length, html: `<section class="master-region-group">
      <div class="master-region-head">${region ? `<button type="button" class="master-region-toggle" data-master-region-toggle="${e(region.code)}" aria-expanded="${expanded}"><span aria-hidden="true">${expanded ? "⌄" : "›"}</span><span><strong>${e(region.name)}</strong><small>${e(region.code)} · 기관담당자 ${children.length}개</small></span></button>` : "<strong>소속 광역관리자 미지정</strong>"}
      ${showParent ? `<div class="master-region-actions"><span class="state ${region.active ? 'active' : ''}">${region.active ? '사용 중' : '사용 중지'}</span><button type="button" data-master-agency-code="${e(region.code)}">광역관리자 상세 →</button></div>` : ''}</div>
      <div class="master-region-children" ${expanded ? "" : "hidden"}>${visibleChildren.map(o => masterAgencyButton(o, target)).join('')}</div></section>`};
  };
  const groups = regions.map(r => group(r, agencies.filter(o => o.parentCode === r.code)));
  const orphans = agencies.filter(o => !regions.some(r => r.code === o.parentCode));
  if (orphans.length) groups.push(group(null, orphans));
  const visible = groups.filter(Boolean);
  return {html: visible.map(g => g.html).join(''), visible: visible.reduce((n,g) => n + g.visible, 0), total: masterLevelFilter === 'regional' ? regions.length : masterLevelFilter === 'agency' ? agencies.length : regions.length + agencies.length};
}

function renderMasterAgencyList() {
  const list = $("#masterAgencyList");
  const count = $("#regionalMasterCount");
  if (!list || !count) return;

  if (!isWideScopeRole()) {
    list.innerHTML = "";
    count.textContent = "0개";
    return;
  }

  const allAgencies = masterManageableInstitutions();
  const target = masterTargetInstitution();
  if (isCentralRole()) {
    const result = centralMasterTree(target);
    count.textContent = `${result.visible}/${result.total}개`;
    list.innerHTML = result.html || `<div class="master-agency-empty">검색 결과가 없습니다.</div>`;
    return;
  }

  const agencies = allAgencies.filter((institution) => matchesMasterSearch(institution) && matchesMasterState(institution));
  count.textContent = `${agencies.length}/${allAgencies.length}개`;
  list.innerHTML = agencies.length
    ? agencies.map((institution) => masterAgencyButton(institution, target, "is-agency-item")).join("")
    : `<div class="master-agency-empty">검색 결과가 없습니다.</div>`;
}

function applyMasterTargetToView() {
  const target = masterTargetInstitution();
  $("#agencySido").value = target.sido || "";
  $("#agencySigungu").value = target.type === "regional" ? "" : target.sigungu || "";
  $("#agencyName").value = target.name || "";
  $("#agencyCode").value = target.code || "";
  $("#masterUrl").value = intakeUrlForCode(target.code);
  $("#passwordUpdatedAt").textContent = getPasswordUpdatedAt(target.code);
  $("#intakePasswordUpdatedAt").textContent = getIntakePasswordUpdatedAt(target.code);
  const status = $("#masterInstitutionStatus");
  status.textContent = target.active ? "사용 중" : "비활성";
  status.classList.toggle("active", target.active);
  ["savePassword", "saveIntakePassword", "newPassword", "confirmPassword", "newIntakePassword", "confirmIntakePassword"].forEach((id) => {
    $("#" + id).disabled = !target.active;
  });
}

function activeRegionalInstitutions() {
  return institutionMaster.filter((institution) => institution.type === "regional" && institution.active);
}

function refreshInstitutionParentOptions(selectedCode = "") {
  const select = $("#institutionParentCode");
  const regions = activeRegionalInstitutions();
  select.innerHTML = regions.map((region) => `<option value="${escapeAttribute(region.code)}">${escapeMarkup(region.name)} (${escapeMarkup(region.code)})</option>`).join("");
  if (selectedCode && regions.some((region) => region.code === selectedCode)) select.value = selectedCode;
}

function syncInstitutionSidoFromParent() {
  const createAgency = $("#institutionFormMode").value === "create" && $("#institutionType").value === "agency";
  if (!createAgency) return;
  const parentCode = isRegionalRole() ? agency.code : $("#institutionParentCode").value;
  const parent = institutionMaster.find((institution) => institution.type === "regional" && institution.code === parentCode);
  $("#institutionSido").value = parent?.sido || (isRegionalRole() ? agency.sido : "");
}

function refreshInstitutionFormVisibility() {
  const form = $("#institutionForm");
  const create = $("#institutionFormMode").value === "create";
  const type = $("#institutionType").value;
  form.classList.toggle("is-edit", !create);
  $(".institution-parent-field").classList.toggle("is-hidden", !create || type !== "agency" || isRegionalRole());
  $(".institution-intake-password-field").classList.toggle("is-hidden", type !== "agency");
  $("#institutionType").disabled = !create || isRegionalRole();
  $("#institutionCode").readOnly = !create;
  const ownInstitutionEdit = !create && (isAgencyRole() || isRegionalRole()) && $("#institutionCode").value === agency.code;
  const inheritedAgencySido = type === "agency";
  const regionalSigungu = type === "regional";
  $("#institutionSido").readOnly = ownInstitutionEdit || inheritedAgencySido;
  $("#institutionSigungu").readOnly = ownInstitutionEdit || regionalSigungu;
  $("#institutionSigungu").required = !regionalSigungu;
  $("#institutionSigungu").placeholder = regionalSigungu ? "광역관리자는 입력하지 않습니다." : "";
  if (regionalSigungu) $("#institutionSigungu").value = "";
  syncInstitutionSidoFromParent();
}

function openInstitutionDialog(institution = null) {
  const editing = Boolean(institution);
  const target = institution || {};
  $("#institutionForm").reset();
  $("#institutionFormMode").value = editing ? "edit" : "create";
  $("#institutionDialogTitle").textContent = editing ? "기관 정보 수정" : "기관 추가";
  $("#institutionType").value = editing ? target.type : "agency";
  $("#institutionSido").value = target.sido || (isRegionalRole() ? agency.sido : "");
  $("#institutionSigungu").value = target.sigungu || "";
  $("#institutionName").value = target.name || "";
  $("#institutionCode").value = target.code || "";
  refreshInstitutionParentOptions(target.parentCode || (isRegionalRole() ? agency.code : ""));
  refreshInstitutionFormVisibility();
  $("#institutionFormHelp").textContent = editing
    ? (isAgencyRole() || (isRegionalRole() && target.code === agency.code)) ? "본인 기관은 기관명만 변경할 수 있습니다." : "기관코드는 등록 후 변경할 수 없습니다."
    : "기관코드는 영문과 숫자만 사용할 수 있으며 등록 후 변경할 수 없습니다.";
  $("#institutionDialog").showModal();
}

function closeInstitutionDialog() {
  clearPasswordFields();
  $("#institutionDialog").close();
}

async function saveInstitution(event) {
  event.preventDefault();
  const mode = $("#institutionFormMode").value;
  const code = $("#institutionCode").value.trim().toUpperCase();
  const type = $("#institutionType").value;
  const body = {
    code,
    type,
    parentCode: $("#institutionParentCode").value,
    sido: $("#institutionSido").value.trim(),
    sigungu: $("#institutionSigungu").value.trim(),
    name: $("#institutionName").value.trim(),
  };
  if (mode === "create") {
    body.adminPassword = $("#institutionAdminPassword").value;
    body.intakePassword = $("#institutionIntakePassword").value;
  }
  const button = $("#saveInstitutionButton");
  button.disabled = true;
  try {
    const payload = await apiRequest(mode === "create" ? "/institutions" : `/institutions/${encodeURIComponent(code)}`, {
      method: mode === "create" ? "POST" : "PATCH",
      body,
    });
    selectedMasterAgencyCode = payload.institution?.code || code;
    await loadInstitutionMaster();
    if (agency.code === selectedMasterAgencyCode) {
      agency = { ...agency, ...masterTargetInstitution() };
      sessionStorage.setItem(AUTH_AGENCY_DATA_KEY, JSON.stringify(agency));
    }
    applyAgencyToView();
    closeInstitutionDialog();
    showToast(mode === "create" ? "기관을 등록했습니다." : "기관 정보를 수정했습니다.");
  } catch (error) {
    showToast(error.message || "기관 정보를 저장하지 못했습니다.");
  } finally {
    button.disabled = false;
  }
}

async function toggleInstitutionStatus(code, active) {
  const target = institutionMaster.find((institution) => institution.code === code);
  if (!target) return;
  const action = active ? "활성화" : "비활성화";
  if (!window.confirm(`${target.name} 기관을 ${action}할까요?`)) return;
  try {
    await apiRequest(`/institutions/${encodeURIComponent(code)}/status`, { method: "PATCH", body: { active } });
    await loadInstitutionMaster();
    applyAgencyToView();
    showToast(`기관을 ${action}했습니다.`);
  } catch (error) {
    showToast(error.message || `기관을 ${action}하지 못했습니다.`);
  }
}

function applyAgencyToView() {
  document.body.dataset.role = isCentralRole() ? "central" : isRegionalRole() ? "regional" : "agency";
  const role = roleLabel();
  const centralRole = isCentralRole();
  $("#appShell").classList.toggle("is-regional", isRegionalRole());
  $("#appShell").classList.toggle("is-central", centralRole);
  $("#appShell").classList.toggle("is-agency", isAgencyRole());
  $$(".central-only-nav").forEach((item) => {
    item.hidden = !centralRole;
    item.style.display = centralRole ? "flex" : "none";
    item.setAttribute("aria-hidden", centralRole ? "false" : "true");
  });
  $("#workspaceRoleTitle").textContent = workspaceRoleTitle();
  $("#accountRoleLabel").textContent = role;
  $("#accountAgencyName").textContent = isCentralRole() ? "시스템 관리자" : agency.name;
  $("#editOwnInstitutionButton").textContent = isRegionalRole() ? "광역관리자명 수정" : "기관담당자명 수정";
  $("#passwordAdminName").textContent = `${role} ${agency.name}`;
  $("#intakePasswordAdminName").textContent = `${role} ${agency.name}`;
  $("#centralPasswordUpdatedAt").textContent = getPasswordUpdatedAt(CENTRAL_ADMIN_CODE);
  ensureMasterTarget();
  renderMasterAgencyList();
  applyMasterTargetToView();
  $("#statsAgencyName").textContent = `${role}: ${agency.name}`;
  $("#statsAgencyCode").textContent = `기관코드: ${agency.code}`;
  $("#statsSectionTitle").textContent = isWideScopeRole() ? "기관담당자별 조사지 제출 현황" : "전체 조사건수";
  $("#masterLevelFilter").value = masterLevelFilter;
  $("#masterAgencySearch").placeholder = isCentralRole()
    ? "기관명, 기관코드, 시도, 시군구 검색"
    : "기관담당자명 또는 기관코드 검색";
  refreshRegionalFilters();
}

function resetToHomeView() {
  activateView("home", { replace: true });
}

function viewFromLocation() {
  const view = location.hash.replace(/^#/, "");
  return document.querySelector(`#view-${view}`) ? view : "home";
}

function viewTitle(view) {
  const navButton = document.querySelector(`.nav-tab[data-view="${view}"]`);
  if (navButton) return navButton.textContent;
  if (view === "central-password") return "비밀번호 변경";
  return "조사 현황";
}

function activateView(view, options = {}) {
  if (!closeDetail()) {
    const current = $(".view.is-active")?.id.replace("view-", "") || "home";
    history.replaceState({view:current}, "", location.pathname + location.search + '#' + current);
    return;
  }
  const centralOnlyView = ["central-password", "checklist-templates"].includes(view);
  clearPasswordFields();
  const requestedView = centralOnlyView && !isCentralRole() ? "home" : view;
  const nextView = document.querySelector(`#view-${requestedView}`) ? requestedView : "home";
  $$(".nav-tab").forEach((item) => item.classList.toggle("is-active", item.dataset.view === nextView));
  $$(".view").forEach((item) => item.classList.remove("is-active"));
  $(`#view-${nextView}`).classList.add("is-active");
  $("#pageTitle").textContent = viewTitle(nextView);
  document.dispatchEvent(new CustomEvent("workspace-view-changed",{detail:nextView}));

  if (nextView === "checklist-templates") {
    setTemplateWorkspaceMode("list");
    loadChecklistTemplates().catch((error) => showToast(error.message));
  }

  if (nextView === "dashboard") {
    renderDashboard();
    const owner = authToken();
    apiRequest('/stats/templates').then(payload => {
      if (owner !== authToken()) return;
      submissionTemplateChoices = (payload.templates || []).map(t => ({templateId: t.id, checklistTitle: t.title, templateGenerationMethod: t.generationMethod || t.generation_method}));
      populateChecklistFilter();
    }).catch(error => showToast(error.message || '설문 필터를 불러오지 못했습니다.'));
  }

  if (nextView === "stats") renderStats();

  window.scrollTo({top: 0, behavior: "instant"});
  if (options.skipHistory) return;
  const url = `${location.pathname}${location.search}#${nextView}`;
  const state = { view: nextView };
  if (options.replace) {
    history.replaceState(state, "", url);
    return;
  }
  history.pushState(state, "", url);
}

function renderAuthState() {
  $("#loginScreen").classList.toggle("is-hidden", isAuthenticated());
  $("#appShell").classList.toggle("is-hidden", !isAuthenticated());
  document.documentElement.classList.remove('auth-booting');
  clearTimeout(window.authBootTimer);
}

async function handleLogin(event) {
  event.preventDefault();

  const loginId = $("#loginId").value.trim().toUpperCase();
  const password = $("#loginPassword").value;
  const submitButton = $("#loginSubmitButton");
  submitButton.disabled = true;
  submitButton.textContent = "로그인 중...";
  try {
    const payload = await apiRequest("/login", {
      method: "POST",
      body: { agencyCode: loginId, password },
    });
    agency = normalizeInstitution(payload.agency || findInstitutionByCode(loginId));
    sessionStorage.setItem(AUTH_SESSION_KEY, "Y");
    sessionStorage.setItem(AUTH_AGENCY_CODE_KEY, agency.code);
    sessionStorage.setItem(AUTH_TOKEN_KEY, payload.token);
    sessionStorage.setItem(AUTH_AGENCY_DATA_KEY, JSON.stringify(agency));
    $("#loginPassword").value = "";
    homeSummaryData = null;
    submissions = [];
    submissionsLoaded = false;
    appliedSubmissionFilters = null; submissionTemplateChoices = []; submissionRequestSequence++; submissionsLoading = false;
    submissionsError = "";
    submissionPagination = { page: 1, limit: PAGE_SIZE, totalCount: 0, totalPages: 1, start: 0, end: 0 };
    statsResults = { overview: null, distribution: null };
    statsDirty = { overview: true, distribution: true };
    resetToHomeView();
    applyAgencyToView();
    renderAuthState();
    renderHome();
    loadStartupData();
    showToast("로그인되었습니다.");
    return;
  } catch (error) {
    showToast(error.message || "기관코드 또는 어드민 비밀번호를 확인해 주세요.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "로그인";
  }
}

function logout({ redirectToLanding = true } = {}) {
  if (!closeDetail()) return;
  clearPasswordFields();
  clearLegacyPasswords();
  startupController?.abort();
  $("#startupError").hidden = true;
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  sessionStorage.removeItem(AUTH_AGENCY_CODE_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_AGENCY_DATA_KEY);
  submissions = [];
  submissionsLoaded = false;
  appliedSubmissionFilters = null; submissionTemplateChoices = []; submissionRequestSequence++; submissionsLoading = false;
  submissionsError = "";
  submissionPagination = { page: 1, limit: PAGE_SIZE, totalCount: 0, totalPages: 1, start: 0, end: 0 };
  statsResults = { overview: null, distribution: null };
  statsDirty = { overview: true, distribution: true };
  selectedSubmissionIds.clear();
  $("#loginId").value = "";
  $("#loginPassword").value = "";
  if (redirectToLanding) {
    window.location.replace('/landing#welcome');
    return;
  }
  resetToHomeView();
  renderAuthState();
  showToast("로그아웃되었습니다.");
}

function initializeAuth() {
  const storedAgency = sessionStorage.getItem(AUTH_AGENCY_DATA_KEY);
  const sessionAgencyCode = sessionStorage.getItem(AUTH_AGENCY_CODE_KEY);
  if (storedAgency) {
    try {
      agency = normalizeInstitution(JSON.parse(storedAgency));
    } catch {
      agency = normalizeInstitution(findInstitutionByCode(sessionAgencyCode));
    }
  } else if (sessionAgencyCode) {
    agency = normalizeInstitution(findInstitutionByCode(sessionAgencyCode));
  }
  $("#loginId").value = isAuthenticated() ? agency.code : "";
  applyAgencyToView();
  renderAuthState();
  activateView(isAuthenticated() ? viewFromLocation() : "home", { replace: true });
}

function populateChecklistFilter() {
  const select = $("#filterType");
  const selectedValue = select.value;
  select.innerHTML = `<option value="">전체 설문</option>`;


  const dynamicTemplates = Array.from(
    new Map(
      [...submissions, ...submissionTemplateChoices]
        .filter((item) => item.templateId && item.checklistTitle)
        .map((item) => [
          String(item.templateId),
          {
            title: item.checklistTitle,
            generationMethod: item.templateGenerationMethod,
          },
        ])
    )
  ).sort((a, b) => String(a[1].title).localeCompare(String(b[1].title), "ko"));

  const appendTemplateGroup = (label, allValue, allLabel, templates) => {
    const group = document.createElement("optgroup");
    group.label = label;
    const allOption = document.createElement("option");
    allOption.value = allValue;
    allOption.textContent = allLabel;
    group.appendChild(allOption);
    templates.forEach(([templateId, template]) => {
      const option = document.createElement("option");
      option.value = `template:${templateId}`;
      option.textContent = template.title;
      group.appendChild(option);
    });
    select.appendChild(group);
  };

  appendTemplateGroup(
    "직접 작성 양식",
    "manual-template",
    "직접 작성 전체",
    dynamicTemplates.filter(([, template]) => template.generationMethod === "manual")
  );
  appendTemplateGroup(
    "AI 설문 양식",
    "dynamic",
    "AI 설문 전체",
    dynamicTemplates.filter(([, template]) => template.generationMethod !== "manual")
  );

  if (selectedValue && !Array.from(select.options).some((option) => option.value === selectedValue)) {
    const option = document.createElement("option");
    option.value = selectedValue;
    option.textContent = "선택한 동적 양식";
    select.appendChild(option);
  }
  select.value = selectedValue;
}

function setSelectOptions(selector, options, defaultLabel) {
  const select = $(selector);
  select.innerHTML = `<option value="">${defaultLabel}</option>`;
  options.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function sigungusBySido(agencies, sido) {
  return Array.from(new Set(agencies.filter((item) => !sido || item.sido === sido).map((item) => item.sigungu))).sort();
}

function refreshSigunguFilter(sidoSelector, sigunguSelector) {
  const agencies = scopedAgencies();
  const sido = $(sidoSelector).value;
  const previousSigungu = $(sigunguSelector).value;
  const sigungus = sigungusBySido(agencies, sido);
  setSelectOptions(sigunguSelector, sigungus, "전체 시군구");
  if (sigungus.includes(previousSigungu)) {
    $(sigunguSelector).value = previousSigungu;
  }
}

function refreshRegionalFilters() {
  ["#filterSido", "#filterSigungu", "#filterAgencyCode", "#filterAgencyName", "#statsFilterSido", "#statsFilterSigungu", "#statsFilterAgencyCode"].forEach((selector) => {
    const input = $(selector);
    if (input) input.value = "";
  });

  if (!isWideScopeRole()) return;

  const agencies = scopedAgencies();
  const sidos = Array.from(new Set(agencies.map((item) => item.sido))).sort();
  setSelectOptions("#filterSido", sidos, "전체 시도");
  setSelectOptions("#statsFilterSido", sidos, "전체 시도");
  $("#filterSido").value = isRegionalRole() ? agency.sido : "";
  $("#statsFilterSido").value = isRegionalRole() ? agency.sido : "";
  refreshSigunguFilter("#filterSido", "#filterSigungu");
  refreshSigunguFilter("#statsFilterSido", "#statsFilterSigungu");
  refreshStatsAgencyFilter();
}

function refreshStatsAgencyFilter() {
  const select = $("#statsFilterAgencyCode");
  if (!select) return;
  const previous = select.value;
  const sido = $("#statsFilterSido")?.value || "";
  const sigungu = $("#statsFilterSigungu")?.value || "";
  const agencies = scopedAgencies().filter((item) => (!sido || item.sido === sido) && (!sigungu || item.sigungu === sigungu));
  select.innerHTML = `<option value="">전체 기관담당자</option>${agencies.map((item) => `<option value="${escapeAttribute(item.code)}">${escapeMarkup(item.name)} (${escapeMarkup(item.code)})</option>`).join("")}`;
  if (agencies.some((item) => item.code === previous)) select.value = previous;
}

function statsScopedAgencies() {
  const sido = $("#statsFilterSido").value;
  const sigungu = $("#statsFilterSigungu").value;
  return scopedAgencies().filter((institution) => {
    const matchesSido = !sido || institution.sido === sido;
    const matchesSigungu = !sigungu || institution.sigungu === sigungu;
    return matchesSido && matchesSigungu;
  });
}

function statsVisibleSubmissions() {
  if (!isWideScopeRole()) return visibleSubmissions();
  const scopedCodes = new Set(statsScopedAgencies().map((institution) => institution.code));
  return visibleSubmissions().filter((item) => scopedCodes.has(item.agencyCode));
}

function filteredSubmissions() {
  return submissions;
}

function visibleSubmissions() {
  if (!isWideScopeRole()) {
    return submissions.filter((item) => item.agencyCode === agency.code);
  }
  const scopedCodes = new Set(scopedAgencies().map((institution) => institution.code));
  return submissions.filter((item) => scopedCodes.has(item.agencyCode));
}

function maxDashboardPage() {
  return Math.max(1, Number(submissionPagination.totalPages || 1));
}

function dashboardPageRows() {
  return submissions;
}

function stateClass(status) {
  if (status === "확인 완료") return "state done";
  return "state waiting";
}

function fallRisk(score) {
  if (score <= 25) {
    return { label: "저위험", className: "risk-low" };
  }
  if (score >= 60) {
    return { label: "고위험", className: "risk-high" };
  }
  return { label: "중위험", className: "risk-medium" };
}

function depressionRisk(score) {
  if (score <= 4) {
    return { label: "우울아님", className: "risk-none" };
  }
  if (score <= 9) {
    return { label: "가벼운 우울", className: "risk-low" };
  }
  if (score <= 19) {
    return { label: "중간정도의 우울", className: "risk-medium" };
  }
  return { label: "심한 우울", className: "risk-high" };
}

function memoryRisk(score) {
  if (score <= 5) {
    return { label: "정상", className: "risk-low" };
  }
  return { label: "위험군", className: "risk-high" };
}

function riskAssessment(item, score) {
  if (item.templateId) return item.managementLabel ? {label:item.managementLabel,className:'risk-none'} : null;
  const type = checklistTypeOf(item);
  if (type === "fall") return fallRisk(score);
  if (type === "depression") return depressionRisk(score);
  if (type === "memory") return memoryRisk(score);
  return null;
}

function riskBadge(item, score) {
  const risk = riskAssessment(item, score);
  return risk ? `<span class="risk-badge ${risk.className}">${escapeMarkup(risk.label)}</span>` : "";
}

function riskLabel(item, score) {
  const risk = riskAssessment(item, score);
  return risk ? risk.label : "";
}

function riskDetailLabel(type) {
  if (type === "fall") return "낙상 위험도";
  if (type === "depression") return "우울 위험도";
  if (type === "memory") return "기억감퇴 위험도";
  return "";
}

function summaryCardsHtml() {
  const items = visibleSubmissions();
  const todayItems = items.filter(isSubmittedToday);
  const remote = homeSummaryData?.summary;
  const summary = [
    {
      type: "total",
      label: "전체 제출",
      total: remote?.total?.total ?? items.length,
      todayLabel: "오늘 총 제출건수",
      today: remote?.total?.today ?? todayItems.length,
    },
    {
      type: "fall",
      label: "낙상",
      total: remote?.fall?.total ?? items.filter((item) => checklistTypeOf(item) === "fall").length,
      todayLabel: "오늘 낙상 제출건수",
      today: remote?.fall?.today ?? todayItems.filter((item) => checklistTypeOf(item) === "fall").length,
    },
    {
      type: "depression",
      label: "우울",
      total: remote?.depression?.total ?? items.filter((item) => checklistTypeOf(item) === "depression").length,
      todayLabel: "오늘 우울 제출건수",
      today: remote?.depression?.today ?? todayItems.filter((item) => checklistTypeOf(item) === "depression").length,
    },
    {
      type: "memory",
      label: "기억",
      total: remote?.memory?.total ?? items.filter((item) => checklistTypeOf(item) === "memory").length,
      todayLabel: "오늘 기억 제출건수",
      today: remote?.memory?.today ?? todayItems.filter((item) => checklistTypeOf(item) === "memory").length,
    },
  ];

  return summary
    .map(
      (item) => `
        <div class="metric summary-metric summary-metric-${item.type}">
          <div class="summary-metric-head">
            <div>
              <span class="metric-title">${item.label}</span>
            </div>
            <span class="summary-icon" aria-hidden="true">${summaryIcon(item.type)}</span>
          </div>
          <strong class="summary-total">${item.total}</strong>
          <div class="metric-row today">
            <span>${item.todayLabel}</span>
            <strong>${item.today}</strong>
          </div>
        </div>`
    )
    .join("");
}

function renderSummary() {
  $("#summaryGrid").innerHTML = summaryCardsHtml();
}

function summaryIcon(type) {
  const icons = {
    total: '<svg viewBox="0 0 24 24" focusable="false"><path d="M9 5h6l1 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1-2Zm1.2 2-1 2H5v8h14V9h-4.2l-1-2h-3.6Zm1.8 3a3 3 0 0 1 2.83 2H17v2h-2.17A3 3 0 1 1 12 10Zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>',
    fall: '<svg viewBox="0 0 24 24" focusable="false"><path d="M13.5 4.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9.6 8.1c.4-.7 1.3-1 2-.6l2.6 1.3 1.7-1.7 1.4 1.4-2.4 2.4c-.3.3-.8.4-1.2.2l-1.2-.6-.7 3.4 2.5 2.5V21h-2v-3.8l-2.2-2.2-1.2 2.8L6 20.7l-1.4-1.4 2.7-2.7 1.1-5.3-1.6 1.1-1.3 2.6-1.8-.9 1.5-3c.1-.2.3-.4.5-.6l3.9-2.4Zm7.4 5.9h4v2h-4v-2Z"/></svg>',
    depression: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM8.5 10a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm7 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm-7.2 5.7-1.6-1.2A6.5 6.5 0 0 1 12 12a6.5 6.5 0 0 1 5.3 2.5l-1.6 1.2A4.5 4.5 0 0 0 12 14a4.5 4.5 0 0 0-3.7 1.7Z"/></svg>',
    memory: '<svg viewBox="0 0 24 24" focusable="false"><path d="M9 3a4 4 0 0 1 3 1.35A4 4 0 0 1 19 7v.3A4 4 0 0 1 20 14a4 4 0 0 1-4 5h-1v2h-2v-4h3a2 2 0 0 0 1.6-3.2l-.7-.9 1-.6A2 2 0 0 0 17 8.6l-.3-.5.2-.6A2 2 0 0 0 13 6.7V10h-2V7a2 2 0 0 0-4 0l.2.9-.8.4A2 2 0 0 0 7 12l1 .6-.6.9A2 2 0 0 0 9 17h2v4H9a4 4 0 0 1-4-5.8A4 4 0 0 1 5 7.3V7a4 4 0 0 1 4-4Z"/></svg>',
  };
  return icons[type] || icons.total;
}

function recentHomeSubmissions() {
  if (homeSummaryData?.recent) {
    return homeSummaryData.recent.map((item) => ({
      id: item.id,
      type: normalizeChecklistType(item.checklistType),
      checklistType: normalizeChecklistType(item.checklistType),
      templateId: item.templateId || "",
      checklistTitle: item.checklistTitle || "",
      clientName: item.clientName || "",
      date: formatSubmittedAt(item.submittedAt),
    }));
  }
  return [...visibleSubmissions()]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 5);
}

function riskSummaryPercent(type) {
  if (homeSummaryData?.riskSummary && type in homeSummaryData.riskSummary) {
    return Number(homeSummaryData.riskSummary[type] || 0);
  }
  const items = visibleSubmissions().filter((item) => checklistTypeOf(item) === type);
  if (items.length === 0) return 0;
  const riskCount = items.filter((item) => {
    const label = riskLabel(item, totalScore(item));
    if (type === "fall") return label === "고위험";
    if (type === "depression") return ["중간정도의 우울", "심한 우울"].includes(label);
    if (type === "memory") return label === "위험군";
    return false;
  }).length;
  return Math.round((riskCount / items.length) * 100);
}

function renderHome() {
  if (window.FinalWorkspace) return FinalWorkspace.home();
  $("#homeSummaryGrid").innerHTML = summaryCardsHtml();

  if (!homeSummaryData && authToken() && !submissionsLoaded) {
    $("#homeRecentList").innerHTML = `<div class="empty-cell home-empty">최근 제출 현황을 불러오는 중입니다.</div>`;
    $("#homeRiskSummary").innerHTML = `<div class="empty-cell home-empty">통계 요약을 불러오는 중입니다.</div>`;
    return;
  }

  const recentRows = recentHomeSubmissions();
  $("#homeRecentList").innerHTML =
    recentRows.length > 0
      ? `
        <div class="home-recent-head">
          <span>체크리스트</span>
          <span>대상자명</span>
          <span>제출일자</span>
        </div>
        ${recentRows
          .map(
            (item) => `
              <button class="home-recent-row" type="button" data-open-detail="${escapeAttribute(item.id)}">
                <span>${escapeMarkup(checklistDefOf(item).label)}</span>
                <strong>${escapeMarkup(item.clientName || "-")}</strong>
                <span>${escapeMarkup(item.date || "-")}</span>
              </button>`
          )
          .join("")}`
      : `<div class="empty-cell home-empty">최근 제출된 조사지가 없습니다.</div>`;

  const risks = [
    { label: "낙상 위험군 비율", value: riskSummaryPercent("fall"), className: "fall" },
    { label: "우울 위험군 비율", value: riskSummaryPercent("depression"), className: "depression" },
    { label: "기억 위험군 비율", value: riskSummaryPercent("memory"), className: "memory" },
  ];
  $("#homeRiskSummary").innerHTML = risks
    .map(
      (item) => `
        <div class="home-risk-item ${item.className}">
          <div>
            <span>${item.label}</span>
            <strong>${item.value}%</strong>
          </div>
          <div class="home-risk-track"><span style="width: ${item.value}%"></span></div>
        </div>`
    )
    .join("");
}

function renderDashboard() {
  const unavailable = !submissionsLoaded || submissionsLoading || Boolean(submissionsError);
  $('#exportExcel').disabled = unavailable;
  $('#exportDetailedExcel').disabled = !canExportSubmissionDetails();
  $('#exportDetailedExcel').title = '특정 설문을 선택하고 조회한 후 다운로드할 수 있습니다. 최대 500건.';
  if (!appliedSubmissionFilters || submissionsLoading) {
    $('#submissionRows').innerHTML = `<tr><td colspan="11" class="empty-cell">${submissionsLoading ? '제출 목록을 불러오는 중입니다.' : '조회 버튼을 눌러 제출 목록을 확인하세요.'}</td></tr>`;
    $('#paginationControls').innerHTML = '';
    $('#bulkDeleteButton').disabled = true;
    $('#selectPageCheckbox').disabled = true;
    return;
  }
  $('#selectPageCheckbox').disabled = unavailable;
  if (submissionsError) {
    $("#submissionRows").innerHTML = `<tr><td colspan="11" class="empty-cell"><p role="alert">${escapeMarkup(submissionsError)} 조회 실패는 결과 0건을 뜻하지 않습니다.</p><button type="button" data-retry-submissions>다시 불러오기</button></td></tr>`;
    $("#paginationControls").innerHTML = ''; $("#bulkDeleteButton").disabled = true; return;
  }
  const rows = dashboardPageRows();
  $("#submissionRows").innerHTML = rows
    .map((item, index) => {
      const def = checklistDefOf(item);
      const score = totalScore(item);
      const usesScoring = submissionUsesScoring(item);
      const institution = submissionInstitution(item);
      return `
        <tr class="clickable-row" data-id="${escapeMarkup(item.id)}">
          <td class="checkbox-cell">
            <input class="row-checkbox" type="checkbox" data-select-id="${escapeMarkup(item.id)}" aria-label="${escapeMarkup(item.clientName || "대상자")} 제출건 선택" ${selectedSubmissionIds.has(String(item.id)) ? "checked" : ""} />
          </td>
          <td>${(currentPage - 1) * PAGE_SIZE + index + 1}</td>
          <td>${escapeMarkup(institution.name)}</td>
          <td>${escapeMarkup(item.checklistTitle || def.label)}</td>
          <td>${escapeMarkup(item.date || '—')}</td>
          <td>${escapeMarkup(item.workerName || '—')}<small>${escapeMarkup(item.workerPhone || '—')}</small></td>
          <td>${escapeMarkup(item.clientName || '—')}<small>${escapeMarkup(item.clientGender || '—')} · ${escapeMarkup(item.clientBirth || '—')}</small></td>
          <td>${escapeMarkup(item.clientId || '—')}</td>
          <td class="score-cell">${usesScoring ? `<strong>${score} / ${escapeMarkup(item.maxScore ?? (item.templateId ? '—' : def.max))}</strong>${item.templateId && !item.managementLabel ? '<small>—</small>' : riskBadge(item, score)}` : '— / — / —'}</td>
          <td><span class="${stateClass(item.status)}">${escapeMarkup(item.status)}</span></td>
          <td><button type="button" data-open-detail="${escapeMarkup(item.id)}">응답 보기</button></td>
        </tr>`;
    })
    .join("") || `<tr><td colspan="11" class="empty-cell">조건에 맞는 제출이 없습니다.</td></tr>`;
  renderPagination();
  updateBulkSelectionState();
}

function renderPagination() {
  const totalRows = Number(submissionPagination.totalCount || 0);
  const maxPage = maxDashboardPage();
  const start = Number(submissionPagination.start || 0);
  const end = Number(submissionPagination.end || 0);
  const windowSize = 10;
  let windowStart = Math.max(1, currentPage - Math.floor(windowSize / 2) + 1);
  let windowEnd = Math.min(maxPage, windowStart + windowSize - 1);
  windowStart = Math.max(1, windowEnd - windowSize + 1);
  const numberedPages = Array.from({ length: Math.max(0, windowEnd - windowStart + 1) }, (_, index) => windowStart + index);
  const pageButton = (page) => `<button class="page-button ${page === currentPage ? "is-active" : ""}" type="button" data-page="${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`;

  $("#paginationControls").innerHTML = `
    <span class="page-summary">${start}-${end} / ${totalRows}건</span>
    <div class="page-buttons">
      <button class="page-button page-action" type="button" data-page-action="first" ${currentPage === 1 ? "disabled" : ""}>처음</button>
      <button class="page-button page-action" type="button" data-page-action="prev" ${currentPage === 1 ? "disabled" : ""}>이전</button>
      ${windowStart > 1 ? `${pageButton(1)}${windowStart > 2 ? '<span class="page-ellipsis">…</span>' : ""}` : ""}
      ${numberedPages.map(pageButton).join("")}
      ${windowEnd < maxPage ? `${windowEnd < maxPage - 1 ? '<span class="page-ellipsis">…</span>' : ""}${pageButton(maxPage)}` : ""}
      <button class="page-button page-action" type="button" data-page-action="next" ${currentPage === maxPage ? "disabled" : ""}>다음</button>
      <button class="page-button page-action" type="button" data-page-action="last" ${currentPage === maxPage ? "disabled" : ""}>마지막</button>
    </div>`;
}

function updateBulkSelectionState() {
  const pageIds = dashboardPageRows().map((item) => String(item.id));
  const selectedOnPage = pageIds.filter((id) => selectedSubmissionIds.has(id));
  const checkbox = $("#selectPageCheckbox");

  checkbox.checked = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  checkbox.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
  $("#bulkStatus").textContent = `선택 ${selectedSubmissionIds.size}건`;
  $("#bulkDeleteButton").disabled = selectedSubmissionIds.size === 0;
}

function statsQueryParams() {
  const params = new URLSearchParams({ view: activeStatsTab });
  // 설문 양식 선택값: 기본 3종은 "fall" 같은 이름, 자체 설문은 "template:<양식 ID>" (checklistTypeOf 와 같은 형식)
  const surveyValue = $("#statsFilterType")?.value || "";
  const isTemplate = surveyValue.startsWith("template:");
  const values = {
    sido: $("#statsFilterSido")?.value,
    sigungu: $("#statsFilterSigungu")?.value,
    agencyCode: $("#statsFilterAgencyCode")?.value,
    type: isTemplate ? "" : surveyValue,
    templateId: isTemplate ? surveyValue.slice("template:".length) : "",
    startDate: $("#statsFilterStartDate")?.value,
    endDate: $("#statsFilterEndDate")?.value,
  };
  Object.entries(values).forEach(([key, value]) => value && params.set(key, value));
  return params;
}

async function loadStats() {
  const view = activeStatsTab;
  if (statsLoading[view]) return;
  const requestParams = statsQueryParams();
  const requestAccount = agency.code;
  window.FinalWorkspace?.statsStart(view);
  if (requestParams.get("startDate") && requestParams.get("endDate") && requestParams.get("startDate") > requestParams.get("endDate")) {
    const error = new Error("시작일은 종료일보다 늦을 수 없습니다.");
    window.FinalWorkspace?.statsFailure(error, view);
    renderStats();
    throw error;
  }
  const button = $("#queryStatsButton");
  statsLoading[view] = true;
  button.disabled = true;
  button.textContent = "조회 중...";
  renderStats();
  try {
    const result = await apiRequest(`/stats?${requestParams.toString()}`);
    if (agency.code !== requestAccount) return;
    statsResults[view] = result;
    const currentParams = statsQueryParams();
    currentParams.set("view", view);
    statsDirty[view] = currentParams.toString() !== requestParams.toString();
    window.FinalWorkspace?.statsSuccess(view, requestParams);
    $("#exportStatsExcel").disabled = false;
  } catch (error) {
    window.FinalWorkspace?.statsFailure(error, view);
    throw error;
  } finally {
    statsLoading[view] = false;
    button.disabled = false;
    button.textContent = "조건 적용";
    renderStats();
  }
}

function markStatsDirty() {
  statsDirty = { overview: true, distribution: true };
  $("#exportStatsExcel").disabled = true;
  renderStats();
}

function statsPercent(part, total) {
  return total ? `${Math.round((Number(part || 0) / Number(total)) * 100)}%` : "-";
}

function renderStats() {
  if (window.FinalWorkspace) return FinalWorkspace.stats();
  $$(".stats-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.statsTab === activeStatsTab));
  const result = statsResults[activeStatsTab];
  $("#exportStatsExcel").disabled = !result || statsDirty[activeStatsTab];
  $("#statsTableWrap").classList.add("regional-stats-table-wrap");

  if (statsLoading[activeStatsTab]) {
    $("#statsHead").innerHTML = `<tr><th>집계 상태</th></tr>`;
    $("#statsRows").innerHTML = `<tr><td class="empty-cell">집계 데이터를 조회하고 있습니다.</td></tr>`;
    $("#statsTableNote").textContent = "";
    return;
  }
  if (!result) {
    $("#statsHead").innerHTML = `<tr><th>조회 안내</th></tr>`;
    $("#statsRows").innerHTML = `<tr><td class="empty-cell">조회 조건을 선택한 후 조회 버튼을 눌러주세요.</td></tr>`;
    $("#statsTableNote").textContent = "";
    return;
  }
  if (statsDirty[activeStatsTab]) {
    $("#statsTableNote").textContent = "조회 조건이 변경되었습니다. 다시 조회해 주세요.";
  } else {
    $("#statsTableNote").textContent = `조회 시각: ${formatSubmittedAt(result.queriedAt)}`;
  }
  if (activeStatsTab === "distribution") renderStatsDistribution(result.rows || []);
  else renderStatsOverview(result.rows || []);
}

function statsInstitutionCells(row) {
  if (isCentralRole()) return `<td>${row.sido}</td><td>${row.sigungu}</td><td class="agency-name-cell">${row.institution_name}</td><td>${row.institution_code}</td>`;
  if (isRegionalRole()) return `<td>${row.sigungu}</td><td class="agency-name-cell">${row.institution_name}</td><td>${row.institution_code}</td>`;
  return `<td class="agency-name-cell">${row.institution_name}</td>`;
}

function renderStatsOverview(rows) {
  const institutionColumns = isCentralRole() ? 4 : isRegionalRole() ? 3 : 1;
  $("#statsHead").innerHTML = `
    <tr><th colspan="${institutionColumns}" class="stats-group institution-group">기관정보</th><th colspan="2" class="stats-group total-group">전체</th><th colspan="3" class="stats-group">낙상</th><th colspan="3" class="stats-group">우울</th><th colspan="3" class="stats-group">기억</th></tr>
    <tr>${isCentralRole() ? "<th>시도</th><th>시군구</th><th>기관담당자</th><th>기관코드</th>" : isRegionalRole() ? "<th>시군구</th><th>기관담당자</th><th>기관코드</th>" : "<th>기관담당자</th>"}<th>총계</th><th>대상자수</th><th>소계</th><th>확인대기</th><th>확인완료</th><th>소계</th><th>확인대기</th><th>확인완료</th><th>소계</th><th>확인대기</th><th>확인완료</th></tr>`;
  $("#statsRows").innerHTML = rows.map((row) => `<tr>${statsInstitutionCells(row)}<td><strong>${row.total}</strong></td><td>${row.unique_clients}</td><td>${row.fall_total}</td><td>${row.fall_waiting}</td><td>${row.fall_done}</td><td>${row.depression_total}</td><td>${row.depression_waiting}</td><td>${row.depression_done}</td><td>${row.memory_total}</td><td>${row.memory_waiting}</td><td>${row.memory_done}</td></tr>`).join("") || `<tr><td colspan="${institutionColumns + 11}" class="empty-cell">조건에 해당하는 조사 결과가 없습니다.</td></tr>`;
}

function renderStatsDistribution(rows) {
  const institutionColumns = isCentralRole() ? 4 : isRegionalRole() ? 3 : 1;
  $("#statsHead").innerHTML = `
    <tr><th colspan="${institutionColumns}" class="stats-group institution-group">기관정보</th><th colspan="3" class="stats-group">낙상</th><th colspan="4" class="stats-group">우울</th><th colspan="2" class="stats-group">기억</th></tr>
    <tr>${isCentralRole() ? "<th>시도</th><th>시군구</th><th>기관담당자</th><th>기관코드</th>" : isRegionalRole() ? "<th>시군구</th><th>기관담당자</th><th>기관코드</th>" : "<th>기관담당자</th>"}<th>저위험</th><th>중위험</th><th>고위험</th><th>우울아님</th><th>가벼운 우울</th><th>중간 우울</th><th>심한 우울</th><th>정상</th><th>위험군</th></tr>`;
  $("#statsRows").innerHTML = rows.map((row) => `<tr>${statsInstitutionCells(row)}<td>${statsPercent(row.fall_low, row.fall_total)}</td><td>${statsPercent(row.fall_medium, row.fall_total)}</td><td>${statsPercent(row.fall_high, row.fall_total)}</td><td>${statsPercent(row.depression_none, row.depression_total)}</td><td>${statsPercent(row.depression_low, row.depression_total)}</td><td>${statsPercent(row.depression_medium, row.depression_total)}</td><td>${statsPercent(row.depression_high, row.depression_total)}</td><td>${statsPercent(row.memory_normal, row.memory_total)}</td><td>${statsPercent(row.memory_risk, row.memory_total)}</td></tr>`).join("") || `<tr><td colspan="${institutionColumns + 9}" class="empty-cell">조건에 해당하는 조사 결과가 없습니다.</td></tr>`;
}

function detailRow(label, value, trustedMarkup = false) {
  return `<div class="detail-row"><dt>${escapeMarkup(label)}</dt><dd>${trustedMarkup ? (value || "-") : escapeMarkup(value || "-")}</dd></div>`;
}

function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function isValidPersonName(value) {
  return /^[가-힣a-zA-Z\s]{2,30}$/.test(String(value || "").trim());
}

function isValidPhoneNumber(value) {
  return /^01[016789]-\d{3,4}-\d{4}$/.test(String(value || "").trim());
}

function birthDateParts(value) {
  const [year = "", month = "", day = ""] = String(value || "").split("-");
  return { year, month, day };
}

function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

function optionList(length, selected, suffix) {
  return Array.from({ length }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return `<option value="${value}" ${value === selected ? "selected" : ""}>${index + 1}${suffix}</option>`;
  }).join("");
}

function editBirthValue() {
  const year = $("#editClientBirthYear")?.value || "";
  const month = $("#editClientBirthMonth")?.value || "";
  const day = $("#editClientBirthDay")?.value || "";
  return year.length === 4 && month && day ? `${year}-${month}-${day}` : "";
}

function refreshEditBirthDayOptions() {
  const daySelect = $("#editClientBirthDay");
  if (!daySelect) return;
  const previousDay = daySelect.value;
  const year = $("#editClientBirthYear").value;
  const month = $("#editClientBirthMonth").value;
  const maxDay = daysInMonth(year, month);
  daySelect.innerHTML = `<option value="">일</option>${optionList(maxDay, previousDay, "일")}`;
  if (previousDay && Number(previousDay) > maxDay) {
    daySelect.value = "";
  }
}

function optionGuide(def) {
  return def.options.map((option) => `${option.label} ${option.value}점`).join(", ");
}

function findSubmissionById(id) {
  return submissions.find((entry) => String(entry.id) === String(id));
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderBasicInfoSection(item, institution, staticRows = "") {
  if (isWideScopeRole()) {
    return `
      <dl class="detail-list">
        ${detailRow("기관담당자", `${institution.name} (${institution.code})`)}
        ${detailRow("제출일시 (한국시간)", item.date)}
        ${detailRow("조사자", `${item.workerName} / ${item.workerPhone}`)}
        ${detailRow("대상자", `${item.clientName} (${item.clientGender}, ${item.clientBirth})`)}
        ${detailRow("대상자 관리번호", item.clientId)}
        ${staticRows}
      </dl>`;
  }

  const birth = birthDateParts(item.clientBirth);
  const completionInline =
    item.status === "확인 완료"
      ? `
        <div class="completion-box detail-completion-inline is-done">
          <strong>확인 완료 처리됨</strong>
          <span>대상자 관리번호: ${escapeMarkup(item.clientId || "-")}</span>
          <button type="button" data-reopen-submission="${escapeAttribute(item.id)}">확인 대기로 변경</button>
        </div>`
      : `
        <div class="completion-box detail-completion-inline">
          <strong>제출 내용 확인 후 확인 완료 처리</strong>
          <button class="primary-button" type="button" data-complete-submission="${escapeAttribute(item.id)}">확인 완료 처리</button>
        </div>`;
  return `
    <div class="detail-info-block detail-readonly-block">
      <h4>수정 불가 정보</h4>
      <dl class="detail-list">
        ${detailRow("기관담당자", `${institution.name} (${institution.code})`)}
        ${detailRow("제출일시 (한국시간)", item.date)}
        ${staticRows}
      </dl>
    </div>
    <div class="detail-info-block detail-editable-block">
      <h4>수정 가능 정보</h4>
    <div class="detail-edit-grid">
      <label>
        <span>조사자 성명</span>
        <input id="editWorkerName" type="text" value="${escapeAttribute(item.workerName)}" lang="ko" autocomplete="off" autocapitalize="off" spellcheck="false" />
      </label>
      <label>
        <span>조사자 전화번호</span>
        <input id="editWorkerPhone" type="tel" inputmode="numeric" value="${escapeAttribute(item.workerPhone)}" placeholder="010-0000-0000" />
      </label>
      <label>
        <span>대상자 성명</span>
        <input id="editClientName" type="text" value="${escapeAttribute(item.clientName)}" lang="ko" autocomplete="off" autocapitalize="off" spellcheck="false" />
      </label>
      <label>
        <span>대상자 성별</span>
        <select id="editClientGender">
          <option value="여" ${item.clientGender === "여" ? "selected" : ""}>여</option>
          <option value="남" ${item.clientGender === "남" ? "selected" : ""}>남</option>
        </select>
      </label>
      <label>
        <span>대상자 생년월일</span>
        <div class="detail-birth-fields">
          <div class="detail-birth-year-field">
            <input id="editClientBirthYear" type="text" inputmode="numeric" maxlength="4" pattern="\\d{4}" value="${escapeAttribute(birth.year)}" placeholder="1954" aria-label="생년" autocomplete="off" />
            <span>년</span>
          </div>
          <select id="editClientBirthMonth" aria-label="월">
            <option value="">월</option>
            ${optionList(12, birth.month, "월")}
          </select>
          <select id="editClientBirthDay" aria-label="일">
            <option value="">일</option>
            ${optionList(daysInMonth(birth.year, birth.month), birth.day, "일")}
          </select>
        </div>
      </label>
      <label>
        <span>대상자 관리번호</span>
        <input id="editClientId" type="text" value="${escapeAttribute(item.clientId || '')}" />
      </label>
      ${completionInline}
    </div>
    <button class="primary-button detail-save-button" type="button" data-save-submission="${item.id}">기본 정보 저장</button>
    </div>`;
}

let detailBaseline = {};
let detailOrigin = null;
let detailBusy = false;
let detailDisabledControls = [];

function detailValues() {
  return Object.fromEntries($$("#detailContent input, #detailContent select").map((input) => [input.id, input.value]));
}

function detailHasChanges({ ignoreClientId = false } = {}) {
  return Object.entries(detailValues()).some(([id, value]) =>
    !(ignoreClientId && ["editClientId", "detailClientId"].includes(id)) && value !== detailBaseline[id]);
}

function detailError(message = "") {
  const error = $("#detailError");
  error.textContent = message;
  error.hidden = !message;
  if (message) error.scrollIntoView({ block: "nearest" });
}

function setDetailBusy(busy) {
  detailBusy = busy;
  $("#detailDrawer").setAttribute("aria-busy", String(busy));
  if (busy) {
    detailDisabledControls = $$("#detailContent input, #detailContent select, #detailContent button").map((control) => [control, control.disabled]);
    detailDisabledControls.forEach(([control]) => { control.disabled = true; });
  } else {
    detailDisabledControls.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; });
    detailDisabledControls = [];
  }
}

function renderReadableAnswer(value) {
  const text = String(value);
  if (text.length <= 100 && text.split('\n').length <= 3) return `<p>${escapeMarkup(text)}</p>`;
  return `<details class="answer-expand"><summary><span class="answer-preview">${escapeMarkup(text.slice(0, 100))}…</span><span class="answer-more">답변 전체 보기</span><span class="answer-less">답변 접기</span></summary><p>${escapeMarkup(text)}</p></details>`;
}

async function openDetail(id, { refresh = false, origin = null } = {}) {
  if (!refresh && $("#detailDrawer").classList.contains("is-open") && !closeDetail()) return;
  const returnOrigin = origin || document.activeElement;
  let item = findSubmissionById(id);
  if (!item && authToken()) {
    try {
      item = await loadSubmissionDetail(id);
    } catch (error) {
      showToast(error.message || "상세 내용을 불러오지 못했습니다.");
      return;
    }
  }
  if (!item) return;
  if (!item.answers.length && authToken()) {
    try {
      item = await loadSubmissionDetail(id);
    } catch (error) {
      showToast(error.message || "상세 내용을 불러오지 못했습니다.");
    }
  }

  const def = checklistDefOf(item);
  const score = totalScore(item);
  const usesScoring = submissionUsesScoring(item);
  const institution = submissionInstitution(item);
  const detailQuestions = def.questions.length
    ? def.questions
    : item.answers.map((answer, index) => answer.questionText || answer.question_text || `${index + 1}번 문항`);
  const staticRows = `
    ${detailRow("척도", def.dynamic ? def.label : `${def.label} (${optionGuide(def)})`)}
    ${detailRow("합계 점수", usesScoring ? (def.dynamic ? `${score}점` : `${score} / ${def.max}`) : "-")}
    ${usesScoring && riskLabel(item, score) ? detailRow('관리구분', riskBadge(item, score), true) : ""}
    ${detailRow("처리상태", `<span class="${escapeAttribute(stateClass(item.status))}">${escapeMarkup(item.status)}</span>`, true)}
  `;

  $("#drawerTitle").textContent = `${def.label} 상세`;
  $("#detailContent").innerHTML = `
    <section class="detail-section">
      <h3>기본 정보</h3>
      ${renderBasicInfoSection(item, institution, staticRows)}
    </section>
    <section class="detail-section">
      <h3>문항별 응답</h3>
      <div class="answer-list">
        ${detailQuestions
          .map((question, index) => {
            const questionNo = index + 1;
            const answer =
              item.answers.find((entry) => Number(entry.questionNo) === questionNo) ||
              item.answers[index] ||
              "-";
            const label = answerLabel(answer) || "-";
            const answerScore = optionScore(checklistTypeOf(item), answer);
            return `
              <div class="answer-item">
                <strong>${questionNo}. ${escapeMarkup(question)}</strong>
                <div class="answer-value">${renderReadableAnswer(usesScoring ? `${label} · ${answerScore}점` : label)}</div>
              </div>`;
          })
          .join("")}
      </div>
    </section>
    <section class="detail-section">
      <h3>현장 메모</h3>
      <p class="memo">${escapeMarkup(item.memo)}</p>
    </section>
    ${renderCompletionControls(item)}
  `;

  if (!refresh) detailOrigin = {element: returnOrigin, id: String(id), containerId: returnOrigin?.closest('#submissionRows, #homeRecentList')?.id};
  detailBaseline = detailValues(); detailError();
  $("#appShell").inert = true; $("#detailDrawer").inert = false;
  $("#drawerBackdrop").hidden = false;
  $("#detailDrawer").classList.add("is-open");
  $("#detailDrawer").setAttribute("aria-hidden", "false");
  $("#closeDrawer").focus();
}

function renderCompletionControls(item) {
  return "";
}

async function completeSubmission(id, reopen = false) {
  if (detailBusy) return;
  if (isWideScopeRole()) {
    detailError(`${roleLabel()}는 제출 상세 조회만 가능합니다.`);
    return;
  }

  const item = findSubmissionById(id);
  if (!item) return;

  if (detailHasChanges({ ignoreClientId: true })) {
    detailError("수정한 기본 정보를 먼저 저장한 뒤 상태를 변경해 주세요.");
    return;
  }
  const clientIdInput = $("#detailClientId") || $("#editClientId");
  const clientId = (clientIdInput?.value || "").trim();

  detailError();
  setDetailBusy(true);
  try {
    const payload = await apiRequest(`/submissions/${encodeURIComponent(id)}/${reopen ? 'reopen' : 'complete'}`, {
      method: "PATCH",
      body: { clientId },
    });
    const nextItem = mapApiSubmission(payload.submission || {});
    if (!nextItem.answers.length) nextItem.answers = item.answers || [];
    submissions = submissions.map((entry) => (String(entry.id) === String(id) ? nextItem : entry));
    statsDirty = { overview: true, distribution: true };
    refreshHomeData();
    renderAfterDataChange();
    await openDetail(id, { refresh: true });
    showToast(reopen ? "확인 대기 상태로 변경했습니다." : "확인 완료 처리했습니다.");
  } catch (error) {
    detailError(error.message || "처리 상태를 변경하지 못했습니다.");
  } finally {
    setDetailBusy(false);
  }
}

async function saveSubmissionBasicInfo(id) {
  if (detailBusy) return;
  if (isWideScopeRole()) {
    detailError(`${roleLabel()}는 제출 상세 조회만 가능합니다.`);
    return;
  }

  const item = findSubmissionById(id);
  if (!item) return;

  const workerName = $("#editWorkerName").value.trim();
  const workerPhone = $("#editWorkerPhone").value.trim();
  const clientName = $("#editClientName").value.trim();
  const clientGender = $("#editClientGender").value;
  const clientBirth = editBirthValue();
  const clientId = $("#editClientId").value.trim();

  if (!workerName || !workerPhone || !clientName || !clientGender || !clientBirth) {
    detailError("조사자와 대상자 기본 정보를 모두 입력해 주세요.");
    return;
  }
  if (!isValidPersonName(workerName) || !isValidPersonName(clientName)) {
    detailError("조사자 성명과 대상자 성명은 한글 또는 영문 이름으로 입력해 주세요.");
    return;
  }
  if (!isValidPhoneNumber(workerPhone)) {
    detailError("조사자 전화번호는 010-0000-0000 형식으로 입력해 주세요.");
    return;
  }

  detailError();
  setDetailBusy(true);
  try {
    const payload = await apiRequest(`/submissions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: {
        workerName,
        workerPhone,
        clientName,
        clientGender,
        clientBirth,
        clientId,
      },
    });
    const nextItem = mapApiSubmission(payload.submission || {});
    if (!nextItem.answers.length) nextItem.answers = item.answers || [];
    submissions = submissions.map((entry) => (String(entry.id) === String(id) ? nextItem : entry));
    statsDirty = { overview: true, distribution: true };
    refreshHomeData();
    renderAfterDataChange();
    await openDetail(id, { refresh: true });
    showToast("제출 기본 정보를 저장했습니다.");
  } catch (error) {
    detailError(error.message || "제출 기본 정보를 저장하지 못했습니다.");
  } finally {
    setDetailBusy(false);
  }
}

function renderAfterDataChange() {
  renderHome();
  renderSummary();
  renderDashboard();
  renderStats();
}

async function refreshRemoteData() {
  try {
    await loadRemoteSubmissions();
    renderAfterDataChange();
  } catch (error) {
    renderDashboard();
    showToast(error.message || "제출 목록을 불러오지 못했습니다.");
  }
}

async function refreshHomeData() {
  try {
    await loadHomeSummary();
    renderHome();
    renderSummary();
  } catch (error) {
    showToast(error.message || "조사 현황을 불러오지 못했습니다.");
  }
}

async function deleteSelectedSubmissions() {
  if (isRegionalRole()) {
    showToast(`${roleLabel()}는 제출건을 삭제할 수 없습니다.`);
    return;
  }

  if (selectedSubmissionIds.size === 0) {
    showToast("삭제할 제출건을 선택해 주세요.");
    return;
  }

  const count = selectedSubmissionIds.size;
  const confirmed = window.confirm(`${count}개의 조사지를 삭제하시겠습니까?`);
  if (!confirmed) return;

  try {
    await apiRequest("/submissions", {
      method: "DELETE",
      body: { ids: Array.from(selectedSubmissionIds) },
    });
    selectedSubmissionIds.clear();
    closeDetail();
    await refreshRemoteData();
    if (submissions.length === 0 && currentPage > 1) {
      currentPage = Math.max(1, Math.min(currentPage - 1, maxDashboardPage()));
      await refreshRemoteData();
    }
    statsDirty = { overview: true, distribution: true };
    refreshHomeData();
    renderDashboard();
    showToast(`${count}건을 삭제했습니다.`);
  } catch (error) {
    showToast(error.message || "삭제하지 못했습니다.");
  }
}

function closeDetail() {
  if (!$("#detailDrawer").classList.contains("is-open")) return true;
  if (detailBusy) {
    detailError("처리 중입니다. 결과를 확인한 뒤 닫아 주세요.");
    return false;
  }
  if (detailHasChanges() && !window.confirm("저장하지 않은 변경을 버리고 닫을까요? 취소를 누르면 계속 작성할 수 있습니다.")) return false;
  $("#appShell").inert = false;
  const container = detailOrigin?.containerId ? document.getElementById(detailOrigin.containerId) : null;
  const replacement = container && Array.from(container.querySelectorAll("[data-open-detail]")).find((button) => button.dataset.openDetail === detailOrigin.id);
  const target = replacement || (detailOrigin?.element?.isConnected ? detailOrigin.element : null) || $(".nav-tab.is-active");
  target?.focus({ preventScroll: true });
  $("#drawerBackdrop").hidden = true;
  $("#detailDrawer").classList.remove("is-open");
  $("#detailDrawer").setAttribute("aria-hidden", "true");
  $("#detailDrawer").inert = true;
  detailBaseline = {};
  return true;
}

async function exportListExcel() {
  const button = $("#exportExcel");
  if (!submissionsLoaded || submissionsLoading || submissionsError) return;
  try {
    const params = submissionQueryParams({ page: 1, limit: 5000 });
    const payload = await apiRequest(`/submissions/export?${params.toString()}`);
    const exportItems = (payload.rows || []).map(mapApiSubmission);
    if (payload.truncated) showToast("Excel은 최대 5,000건까지 포함합니다. 조회 조건을 좁혀 주세요.");
    const rows = [
    ["연번", "기관코드", "기관담당자명", "시도", "시군구", "설문", "제출일시 (한국시간)", "조사자명", "조사자 전화번호", "대상자명", "성별", "생년월일", "관리번호", "득점", "총점", "위험도", "처리상태"],
    ...exportItems.map((item, index) => {
      const score = totalScore(item);
      const usesScoring = submissionUsesScoring(item);
      const institution = submissionInstitution(item);
      return [
        index + 1,
        institution.code,
        institution.name,
        institution.sido,
        institution.sigungu,
        checklistDefOf(item).label,
        item.date,
        item.workerName,
        item.workerPhone,
        item.clientName,
        item.clientGender,
        item.clientBirth,
        item.clientId,
        usesScoring ? score : "-",
        usesScoring ? (item.maxScore ?? (item.templateId ? '-' : checklistDefOf(item).max)) : "-",
        usesScoring ? riskLabel(item, score) : "-",
        item.status,
      ];
    }),
    ];
    await downloadExcelRows({
      button,
      filename: "제출목록.xlsx",
      sheetName: "제출목록",
      rows,
    });
  } catch (error) {
    showToast(error.message || "제출 목록을 내려받지 못했습니다.");
  }
}

function safeExcelSheetName(title, usedNames) {
  const base = String(title || "양식 상세")
    .replace(/[\\/*?:\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "양식 상세";
  let name = base;
  let suffix = 2;
  while (usedNames.has(name.toLowerCase())) {
    const marker = ` (${suffix})`;
    name = `${base.slice(0, 31 - marker.length)}${marker}`;
    suffix += 1;
  }
  usedNames.add(name.toLowerCase());
  return name;
}

function ensureExcelModule() {
  if (globalThis.ExcelJS?.Workbook) return Promise.resolve();
  if (excelModulePromise) return excelModulePromise;
  excelModulePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "assets/vendor/exceljs.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Excel 생성 모듈을 불러오지 못했습니다."));
    document.head.appendChild(script);
  }).catch((error) => {
    excelModulePromise = null;
    throw error;
  });
  return excelModulePromise;
}

function styleExcelSheet(worksheet, columnWidths = []) {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  };
  const header = worksheet.getRow(1);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF245F93" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  worksheet.columns.forEach((column, index) => {
    column.width = columnWidths[index] || 16;
    column.alignment = { vertical: "top", wrapText: true };
  });
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F8FC" } };
      });
    }
  });
}

async function downloadExcelRows({ button, filename, sheetName, rows }) {
  const originalText = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = "Excel 생성 중...";
  }
  try {
    await ensureExcelModule();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "독거노인종합지원센터";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(safeExcelSheetName(sheetName, new Set()), {
      properties: { defaultRowHeight: 20 },
    });
    rows.forEach((row) => worksheet.addRow(row));
    const widths = (rows[0] || []).map((_, columnIndex) => {
      const maxLength = rows.reduce(
        (max, row) => Math.max(max, String(row[columnIndex] ?? "").length),
        0
      );
      return Math.min(38, Math.max(10, maxLength + 2));
    });
    styleExcelSheet(worksheet, widths);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Excel 파일을 생성했습니다.");
  } catch (error) {
    showToast(error.message || "Excel 파일을 생성하지 못했습니다.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function bulkInstitutionColumns(type) {
  if (type === "regional") {
    return [
      { key: "code", label: "기관코드", width: 18 },
      { key: "name", label: "광역관리자명", width: 28 },
      { key: "sido", label: "시도", width: 18 },
      { key: "adminPassword", label: "어드민 초기 비밀번호", width: 24 },
    ];
  }
  const columns = [
    { key: "code", label: "기관코드", width: 18 },
    { key: "name", label: "기관담당자명", width: 28 },
  ];
  if (isCentralRole()) columns.push({ key: "parentCode", label: "소속 광역관리자 코드", width: 22 });
  return columns.concat([
    { key: "sigungu", label: "시군구", width: 18 },
    { key: "adminPassword", label: "어드민 초기 비밀번호", width: 24 },
    { key: "intakePassword", label: "제출 페이지 초기 비밀번호", width: 28 },
  ]);
}

function selectedBulkInstitutionType() {
  return isRegionalRole() ? "agency" : $("#bulkInstitutionType").value;
}

function updateBulkInstitutionHelp() {
  const type = selectedBulkInstitutionType();
  $("#bulkTemplateTitle").textContent = type === "regional" ? "광역관리자 등록 양식" : "기관담당자 등록 양식";
  $("#bulkTemplateHelp").textContent = type === "regional"
    ? "시군구는 입력하지 않으며 공란으로 저장됩니다."
    : isRegionalRole()
      ? "소속 광역관리자와 시도는 로그인한 기관 정보로 자동 적용됩니다."
      : "기관담당자의 시도는 선택한 소속 광역관리자에서 자동 적용됩니다.";
  $("#bulkTemplateHelp").textContent += " 초기 비밀번호는 관리자·조사자 모두 8자리 이상으로 기관마다 다르게 입력하세요.";
}

function resetBulkInstitutionResult() {
  bulkInstitutionUploadState = null;
  $("#bulkInstitutionResult").classList.add("is-hidden");
  $("#downloadInstitutionErrors").classList.add("is-hidden");
  $("#bulkTotalCount").textContent = "0";
  $("#bulkSuccessCount").textContent = "0";
  $("#bulkFailureCount").textContent = "0";
}

function openBulkInstitutionDialog() {
  $("#bulkInstitutionForm").reset();
  $("#bulkInstitutionType").value = "agency";
  resetBulkInstitutionResult();
  updateBulkInstitutionHelp();
  $("#bulkInstitutionDialog").showModal();
}

function closeBulkInstitutionDialog() {
  $("#bulkInstitutionDialog").close();
}

function institutionListRows() {
  return masterManageableInstitutions().map((institution) => [
    institution.type === "regional" ? "2단계 광역관리자" : "3단계 기관담당자",
    institution.code,
    institution.name,
    institution.parentCode || "",
    institution.sido || "",
    institution.type === "regional" ? "" : institution.sigungu || "",
    institution.active ? "활성" : "비활성",
  ]);
}

async function saveExcelWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadInstitutionTemplate() {
  const button = $("#downloadInstitutionTemplate");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "양식 생성 중...";
  try {
    await ensureExcelModule();
    const type = selectedBulkInstitutionType();
    const columns = bulkInstitutionColumns(type);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "독거노인종합지원센터";
    const registration = workbook.addWorksheet("기관등록");
    registration.addRow(columns.map((column) => column.label));
    for (let index = 0; index < 100; index += 1) registration.addRow(columns.map(() => ""));
    styleExcelSheet(registration, columns.map((column) => column.width));
    registration.autoFilter = null;
    registration.getColumn(1).numFmt = "@";
    const current = workbook.addWorksheet("현재 기관 목록");
    current.addRow(["기관 단계", "기관코드", "기관명", "소속 광역관리자 코드", "시도", "시군구", "활성 상태"]);
    institutionListRows().forEach((row) => current.addRow(row));
    styleExcelSheet(current, [22, 18, 28, 22, 18, 18, 12]);
    const typeName = type === "regional" ? "광역관리자" : "기관담당자";
    await saveExcelWorkbook(workbook, `${typeName}_일괄등록_양식.xlsx`);
    showToast("기관 일괄 등록 양식을 생성했습니다.");
  } catch (error) {
    showToast(error.message || "기관 등록 양식을 생성하지 못했습니다.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function readBulkInstitutionFile(file, type) {
  if (!file) throw new Error("등록할 엑셀 파일을 선택해 주세요.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error(".xlsx 형식의 파일만 업로드할 수 있습니다.");
  if (file.size > 6 * 1024 * 1024) throw new Error("엑셀 파일은 6MB 이하여야 합니다.");
  await ensureExcelModule();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.getWorksheet("기관등록") || workbook.worksheets[0];
  if (!worksheet) throw new Error("기관등록 시트를 찾을 수 없습니다.");
  const columns = bulkInstitutionColumns(type);
  // 이전에 다운로드한 양식의 제목 열도 계속 인식한다.
  const headerValues = worksheet.getRow(1).values.slice(1).map((value) => String(value || "").trim()
    .replaceAll('광역지원기관', '광역관리자').replaceAll('광역기관', '광역관리자').replaceAll('그룹관리자', '광역관리자')
    .replaceAll('수행기관', '기관담당자').replaceAll('운영담당자', '기관담당자').replaceAll('직원', '조사자'));
  columns.forEach((column) => {
    if (!headerValues.includes(column.label)) throw new Error(`필수 제목 열 '${column.label}'이 없습니다.`);
  });
  const columnIndexes = Object.fromEntries(columns.map((column) => [column.key, headerValues.indexOf(column.label) + 1]));
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const source = { rowNumber };
    columns.forEach((column) => {
      const cell = row.getCell(columnIndexes[column.key]);
      source[column.key] = String(cell.text ?? cell.value ?? "").trim();
    });
    if (columns.some((column) => source[column.key])) rows.push(source);
  });
  if (rows.length === 0) throw new Error("등록할 기관 정보가 없습니다.");
  if (rows.length > 500) throw new Error("한 번에 최대 500개 기관을 등록할 수 있습니다.");
  return { columns, rows };
}

async function uploadBulkInstitutions(event) {
  event.preventDefault();
  const button = $("#uploadInstitutionsButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "등록 처리 중...";
  resetBulkInstitutionResult();
  try {
    const type = selectedBulkInstitutionType();
    const parsed = await readBulkInstitutionFile($("#bulkInstitutionFile").files[0], type);
    const payload = await apiRequest("/institutions/bulk", { method: "POST", body: { type, rows: parsed.rows } });
    const failures = (payload.results || []).filter((result) => !result.success);
    bulkInstitutionUploadState = { type, columns: parsed.columns, rows: parsed.rows, failures };
    $("#bulkTotalCount").textContent = String(payload.totalCount || 0);
    $("#bulkSuccessCount").textContent = String(payload.successCount || 0);
    $("#bulkFailureCount").textContent = String(payload.failureCount || 0);
    $("#bulkInstitutionResult").classList.remove("is-hidden");
    $("#downloadInstitutionErrors").classList.toggle("is-hidden", failures.length === 0);
    if (payload.successCount) {
      await loadInstitutionMaster();
      applyAgencyToView();
    }
    showToast(`기관 일괄 등록 완료: 성공 ${payload.successCount || 0}건, 실패 ${payload.failureCount || 0}건`);
  } catch (error) {
    showToast(error.message || "기관 일괄 등록을 처리하지 못했습니다.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function downloadInstitutionErrors() {
  if (!bulkInstitutionUploadState?.failures.length) return;
  const button = $("#downloadInstitutionErrors");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "오류 파일 생성 중...";
  try {
    await ensureExcelModule();
    const { columns, rows, failures, type } = bulkInstitutionUploadState;
    const rowsByNumber = new Map(rows.map((row) => [row.rowNumber, row]));
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("기관등록");
    worksheet.addRow(columns.map((column) => column.label).concat(["원본 행 번호", "처리 결과", "오류 항목", "오류 사유"]));
    failures.forEach((failure) => {
      const source = rowsByNumber.get(failure.rowNumber) || {};
      worksheet.addRow(columns.map((column) => source[column.key] || "").concat([failure.rowNumber, "실패", failure.errorField, failure.message]));
    });
    styleExcelSheet(worksheet, columns.map((column) => column.width).concat([14, 12, 22, 44]));
    await saveExcelWorkbook(workbook, `${type === "regional" ? "광역관리자" : "기관담당자"}_일괄등록_오류.xlsx`);
    showToast("오류 결과 엑셀을 생성했습니다.");
  } catch (error) {
    showToast(error.message || "오류 결과를 내려받지 못했습니다.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function excelCommonValues(item, index) {
  const institution = submissionInstitution(item);
  const usesScoring = submissionUsesScoring(item);
  return [
    index + 1,
    item.id,
    checklistDefOf(item).label,
    item.templateGenerationMethod === "manual" ? "직접 작성" : item.templateId ? "AI 생성" : "기본 체크리스트",
    institution.code,
    institution.name,
    institution.sido,
    institution.sigungu,
    item.date,
    item.workerName,
    item.workerPhone,
    item.clientName || "-",
    item.clientGender || "-",
    item.clientBirth || "-",
    item.clientId || "-",
    item.status,
    usesScoring ? totalScore(item) : "-",
  ];
}

function buildDetailedSubmissionWorkbook(items) {
  if (!globalThis.ExcelJS?.Workbook) {
    throw new Error("Excel 생성 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "독거노인종합지원센터";
  workbook.created = new Date();

  const summaryHeaders = [
    "연번",
    "제출 ID",
    "설문명",
    "양식 생성 방식",
    "기관코드",
    "기관담당자명",
    "시도",
    "시군구",
    "제출일시 (한국시간)",
    "조사자명",
    "조사자 연락처",
    "대상자명",
    "성별",
    "생년월일",
    "대상자 관리번호",
    "처리상태",
    "총점",
  ];
  const summarySheet = workbook.addWorksheet("제출목록", { properties: { defaultRowHeight: 20 } });
  summarySheet.addRow(summaryHeaders);
  items.forEach((item, index) => summarySheet.addRow(excelCommonValues(item, index)));
  styleExcelSheet(summarySheet, [8, 38, 28, 15, 16, 24, 12, 14, 14, 14, 18, 14, 10, 14, 18, 12, 10]);

  const grouped = new Map();
  items.forEach((item) => {
    const key = item.templateId ? `template:${item.templateId}` : `legacy:${checklistTypeOf(item)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });

  const usedNames = new Set(["제출목록"]);
  grouped.forEach((groupItems) => {
    const first = groupItems[0];
    const questions = Array.from(
      new Map(
        groupItems
          .flatMap((item) => item.answers || [])
          .map((answer) => [
            `${answer.questionNo ?? ""}:${answer.questionText || ""}`,
            {
              questionNo: Number(answer.questionNo || 0),
              questionText: answer.questionText || `문항 ${answer.questionNo || ""}`,
            },
          ])
      ).values()
    ).sort((a, b) => a.questionNo - b.questionNo);
    const sheetName = safeExcelSheetName(checklistDefOf(first).label, usedNames);
    const worksheet = workbook.addWorksheet(sheetName, { properties: { defaultRowHeight: 22 } });
    const detailCommonHeaders = [
      "연번",
      "제출 ID",
      "기관코드",
      "기관담당자명",
      "제출일시 (한국시간)",
      "조사자명",
      "조사자 연락처",
      "대상자명",
      "성별",
      "생년월일",
      "대상자 관리번호",
      "처리상태",
      "총점",
    ];
    worksheet.addRow([
      ...detailCommonHeaders,
      ...questions.map((question) => `문항 ${question.questionNo}. ${question.questionText}`),
    ]);
    groupItems.forEach((item, index) => {
      const institution = submissionInstitution(item);
      const answerMap = new Map(
        (item.answers || []).map((answer) => [
          `${answer.questionNo ?? ""}:${answer.questionText || ""}`,
          answer.answerLabel || "",
        ])
      );
      worksheet.addRow([
        index + 1,
        item.id,
        institution.code,
        institution.name,
        item.date,
        item.workerName,
        item.workerPhone,
        item.clientName || "-",
        item.clientGender || "-",
        item.clientBirth || "-",
        item.clientId || "-",
        item.status,
        submissionUsesScoring(item) ? totalScore(item) : "-",
        ...questions.map((question) => answerMap.get(`${question.questionNo}:${question.questionText}`) || ""),
      ]);
    });
    styleExcelSheet(
      worksheet,
      [
        8, 38, 16, 24, 14, 14, 18, 14, 10, 14, 18, 12, 10,
        ...questions.map(() => 34),
      ]
    );
  });
  return workbook;
}

async function exportDetailedExcel() {
  const button = $("#exportDetailedExcel");
  if (!canExportSubmissionDetails()) { showToast('특정 설문을 선택하고 조회한 후 다운로드해 주세요.'); return; }
  const templateId = appliedSubmissionFilters.type.slice(9);
  submissionDetailsExporting = true;
  button.disabled = true;
  const originalText = button.textContent;
  try {
    if (!selectedSubmissionIds.size && submissionPagination.totalCount > 500) {
      showToast('상세 Excel은 최대 500건까지 가능합니다. 조건을 좁히거나 제출건을 선택해 주세요.'); return;
    }
    let selectedIds = Array.from(selectedSubmissionIds);
    if (!selectedIds.length) {
      const params = submissionQueryParams({ page: 1, limit: 5000 });
      const payload = await apiRequest(`/submissions/export?${params.toString()}`);
      selectedIds = (payload.rows || []).map((item) => String(item.id));
    }
    if (!selectedIds.length) {
      showToast("다운로드할 제출건이 없습니다.");
      return;
    }
    if (selectedIds.length > 500) {
      showToast("상세 Excel은 최대 500건까지 가능합니다. 기간이나 설문 필터를 좁혀 주세요.");
      return;
    }

    button.textContent = "Excel 모듈 준비 중...";
    await ensureExcelModule();
    const detailedRows = [];
    for (let offset = 0; offset < selectedIds.length; offset += 100) {
      const batch = selectedIds.slice(offset, offset + 100);
      button.textContent = `상세 조회 ${Math.min(offset + batch.length, selectedIds.length)}/${selectedIds.length}`;
      const payload = await apiRequest("/submissions/export-details", {
        method: "POST",
        body: { ids: batch, templateId },
      });
      detailedRows.push(...(payload.rows || []).map(mapApiSubmission));
    }
    const detailMap = new Map(detailedRows.map((item) => [String(item.id), item]));
    const orderedItems = selectedIds.map((id) => detailMap.get(String(id))).filter(Boolean);
    if (!orderedItems.length) throw new Error("다운로드 가능한 제출 상세가 없습니다.");

    button.textContent = "Excel 생성 중...";
    const workbook = buildDetailedSubmissionWorkbook(orderedItems);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `체크리스트_제출상세_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`${orderedItems.length}건의 상세 Excel을 생성했습니다.`);
  } catch (error) {
    showToast(error.message || "상세 Excel을 생성하지 못했습니다.");
  } finally {
    submissionDetailsExporting = false;
    button.textContent = originalText;
    renderDashboard();
  }
}

async function exportStatsExcel() {
  const button = $("#exportStatsExcel");
  const result = statsResults[activeStatsTab];
  if (!result || statsDirty[activeStatsTab]) {
    showToast("조회 버튼으로 최신 통계를 조회한 후 다운로드해 주세요.");
    return;
  }
  const sourceRows = window.FinalWorkspace?.statsRowsForExport(activeStatsTab) || result.rows || [];
  if (activeStatsTab === 'distribution') {
    await downloadExcelRows({button,filename:'설문_관리구분분포.xlsx',sheetName:'관리구분',rows:[['관리구분','제출 건수'],...(result.rows || []).map(r => [r.management_label,r.total])]});
    return;
  }
  const institutionInfo = (row) => isCentralRole()
    ? [row.sido, row.sigungu, row.institution_name, row.institution_code]
    : isRegionalRole()
      ? [row.sigungu, row.institution_name, row.institution_code]
      : [row.institution_name];
  const header = [...(isCentralRole() ? ["시도","시군구","기관담당자","기관코드"] : isRegionalRole() ? ["시군구","기관담당자","기관코드"] : ["기관담당자"]), "제출 건수","대상자 수","확인 대기","확인 완료"];
  const rows = sourceRows.map(row => [...institutionInfo(row),row.total,row.unique_clients,row.waiting_total ?? 0,row.done_total ?? 0]);
  await downloadExcelRows({
    button,
    filename: "생활안전점검_조사현황.xlsx",
    sheetName: "집계통계",
    rows: [header, ...rows],
  });
}

const TEMPLATE_STATUS_LABELS = {
  draft: "작성 중",
  active: "운영",
  closed: "종료",
};

const TEMPLATE_ANSWER_TYPE_LABELS = {
  text: "텍스트란",
  textarea: "비고란",
  single_choice: "단일 선택",
  multiple_choice: "복수 선택",
};

function escapeMarkup(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function templateStatusClass(status) {
  if (status === "active") return "active";
  if (status === "closed") return "done";
  return "waiting";
}

async function loadChecklistTemplates(force = false) {
  if (!isCentralRole() || (checklistTemplatesLoaded && !force)) {
    renderChecklistTemplateList();
    return;
  }
  $("#templateList").innerHTML = `<div class="template-empty">양식을 불러오는 중입니다.</div>`;
  const query = ""; // Fetch all statuses so the V8 library can show accurate filter counts.
  const payload = await apiRequest(`/checklist-templates${query}`);
  checklistTemplates = payload.templates || [];
  checklistTemplatesLoaded = true;
  renderChecklistTemplateList();
}

function renderChecklistTemplateList() {
  if (window.FinalWorkspace) return FinalWorkspace.templates();
  const list = $("#templateList");
  if (!checklistTemplates.length) {
    list.innerHTML = `<div class="template-empty">조건에 맞는 양식이 없습니다.<br />새 양식을 만들어 주세요.</div>`;
    return;
  }
  list.innerHTML = checklistTemplates
    .map(
      (template) => `
        <button class="template-list-item ${String(template.id) === String(selectedTemplateId) ? "is-selected" : ""}" type="button" data-template-id="${escapeMarkup(template.id)}">
          <span class="template-list-item-head">
            <strong>${escapeMarkup(template.title)}</strong>
            <span class="state ${templateStatusClass(template.status)}">${TEMPLATE_STATUS_LABELS[template.status] || template.status}</span>
          </span>
          <small>${template.generationMethod === "manual" ? "직접 작성" : "AI 생성"} · ${escapeMarkup(formatSubmittedAt(template.updatedAt) || "")}</small>
        </button>`
    )
    .join("");
}

function emptyTemplateQuestion(questionNo = 1) {
  return {
    questionNo,
    questionText: "",
    required: false,
    answerType: "text",
    helpText: "",
    options: [],
  };
}

function setTemplateWorkspaceMode(mode = "list") {
  const showEditor = ["editor", "new"].includes(mode);
  document.querySelector("#view-checklist-templates").dataset.workspaceMode = mode;
  document.querySelector("#backToTemplateLibrary").classList.toggle("is-hidden", mode === "list");
  const showFileDraft = mode === "file";
  const showAiDraft = mode === "ai";
  const showWorkspace = showEditor || showFileDraft || showAiDraft;
  const templateLayout = $("#templateLayout");

  if (showFileDraft) templateLayout.appendChild($("#aiFileDraftPanel"));
  if (showAiDraft) templateLayout.appendChild($("#aiDraftPanel"));

  $("#templateEditorPanel").classList.toggle("is-hidden", !showEditor);
  templateLayout.classList.toggle("is-list-only", !showWorkspace);
  $("#aiFileDraftPanel").classList.toggle("is-hidden", !showFileDraft);
  $("#aiDraftPanel").classList.toggle("is-hidden", !showAiDraft);

  $("#newTemplateButton").classList.toggle("is-active", mode === "new");
  $("#openAiFileDraftButton").classList.toggle("is-active", showFileDraft);
  $("#openAiDraftButton").classList.toggle("is-active", showAiDraft);
  $("#openAiFileDraftButton").setAttribute("aria-pressed", String(showFileDraft));
  $("#openAiDraftButton").setAttribute("aria-pressed", String(showAiDraft));

  if (showFileDraft) $("#aiDraftFile").focus();
  if (showAiDraft) $("#aiDraftTopic").focus();
  document.dispatchEvent(new Event("template-workspace-changed"));
}

function showNewTemplateEditor() {
  selectedTemplateId = "";
  renderChecklistTemplateList();
  setTemplateWorkspaceMode("new");
  populateTemplateEditor({
    id: "",
    title: "",
    description: "",
    purpose: "",
    targetAudience: "",
    status: "draft",
    estimatedMinutes: null,
    scoringEnabled: false,
    generationMethod: "manual",
    generationLogId: "",
    questions: [emptyTemplateQuestion()],
  });
  $("#templateTitle").focus();
}

async function openChecklistTemplate(id) {
  selectedTemplateId = id;
  renderChecklistTemplateList();
  setTemplateWorkspaceMode("editor");
  $("#templateEditorEmpty").classList.remove("is-hidden");
  $("#templateEditorEmpty").innerHTML = `<strong>양식을 불러오는 중입니다.</strong>`;
  $("#templateEditor").classList.add("is-hidden");
  const payload = await apiRequest(`/checklist-templates/${encodeURIComponent(id)}`);
  populateTemplateEditor(payload.template);
}

function populateTemplateEditor(template) {
  const isDraft = template.status === "draft";
  const isActive = template.status === "active";
  $("#templateEditorEmpty").classList.add("is-hidden");
  $("#templateEditor").classList.remove("is-hidden");
  $("#templateId").value = template.id || "";
  $("#templateGenerationMethod").value = template.generationMethod || "manual";
  $("#templateGenerationLogId").value = template.generationLogId || "";
  $("#templateTitle").value = template.title || "";
  $("#templateDescription").value = template.description || "";
  $("#templatePurpose").value = template.purpose || "";
  $("#templateTargetAudience").value = template.targetAudience || "";
  $("#templateEstimatedMinutes").value = template.estimatedMinutes || "";
  $("#templateScoringEnabled").checked = Boolean(template.scoringEnabled);
  $("#templateManagementEnabled").checked = Boolean(template.managementEnabled);
  renderManagementBands(template.managementBands || [], !isDraft);
  $("#templateEditorStatus").textContent = TEMPLATE_STATUS_LABELS[template.status] || "작성 중";
  $("#templateEditorStatus").className = `state ${templateStatusClass(template.status)}`;
  $("#templateEditorTitle").textContent = template.id ? template.title : "새 양식";
  $("#copyTemplateButton").classList.toggle("is-hidden", !template.id);
  $("#deleteTemplateButton").classList.toggle("is-hidden", !template.id || !isDraft);
  $("#activateTemplateButton").classList.toggle("is-hidden", !isDraft);
  $("#closeTemplateButton").classList.toggle("is-hidden", !template.id || !isActive);
  $("#saveTemplateButton").classList.toggle("is-hidden", !isDraft);
  $("#addTemplateQuestionButton").classList.toggle("is-hidden", !isDraft);
  $("#templateSaveHint").textContent = isDraft
    ? "작성 중인 양식은 언제든 수정할 수 있습니다."
    : "운영을 시작한 양식은 변경할 수 없습니다. 변경하려면 복사하여 새 양식을 만드세요.";
  renderTemplateQuestions(template.questions || [emptyTemplateQuestion()], !isDraft);
  $$("#templateEditor input, #templateEditor textarea, #templateEditor select").forEach((field) => {
    if (field.id === "templateId") return;
    field.disabled = !isDraft;
  });
  TemplateTargets.load(template);
  templateSavedForm = JSON.stringify(collectTemplateForm());
  updateTemplateSaveFlow();
  document.dispatchEvent(new Event("template-editor-loaded"));
}

function renderTemplateQuestions(questions, readonly = false) {
  $("#templateQuestionList").innerHTML = questions
    .map((question, index) => {
      const choiceType = ["single_choice", "multiple_choice"].includes(question.answerType);
      const options = question.options || [];
      return `
        <article class="template-question-card" data-question-index="${index}" aria-labelledby="template-question-title-${index}">
          <div class="template-question-head">
            <h3 id="template-question-title-${index}">문항 ${index + 1}</h3>
            <div class="template-question-actions">
              <label class="template-checkbox">
                <input data-question-field="required" type="checkbox" ${question.required ? "checked" : ""} ${readonly ? "disabled" : ""} />
                <span>필수 문항</span>
              </label>
              <button class="icon-button danger-button ${readonly ? "is-hidden" : ""}" type="button" data-remove-question="${index}" aria-label="문항 ${index + 1} 삭제">문항 삭제</button>
            </div>
          </div>
          <div class="template-question-content">
          <div class="template-question-grid">
            <label>
              <span>문항 문구 *</span>
              <input data-question-field="questionText" maxlength="1000" value="${escapeMarkup(question.questionText)}" placeholder="점검할 내용을 입력해 주세요." ${readonly ? "disabled" : ""} />
            </label>
            <label>
              <span>답변 형식 *</span>
              <select data-question-field="answerType" ${readonly ? "disabled" : ""}>
                ${Object.entries(TEMPLATE_ANSWER_TYPE_LABELS)
                  .map(([value, label]) => `<option value="${value}" ${question.answerType === value ? "selected" : ""}>${label}</option>`)
                  .join("")}
              </select>
            </label>
          </div>
          <label class="stacked-field">
            <span>입력 도움말</span>
            <input data-question-field="helpText" maxlength="500" value="${escapeMarkup(question.helpText || "")}" placeholder="조사자에게 보여줄 안내(선택)" ${readonly ? "disabled" : ""} />
          </label>
          <div class="template-options ${choiceType ? "" : "is-hidden"}">
            <strong class="template-options-heading">선택지 설정</strong>
            <div class="template-option-list">
              ${options.map((option, optionIndex) => templateOptionMarkup(option, optionIndex, readonly)).join("")}
            </div>
            <button class="secondary-button ${readonly ? "is-hidden" : ""}" type="button" data-add-option="${index}">선택지 추가</button>
          </div>
          </div>
        </article>`;
    })
    .join("");
}

function templateOptionMarkup(option = {}, optionIndex, readonly = false) {
  const requiresText = Boolean(option.requiresText);
  return `
    <div class="template-option-row" data-option-index="${optionIndex}">
      <label>
        <span>선택지 ${optionIndex + 1}</span>
        <input data-option-field="optionText" maxlength="500" value="${escapeMarkup(option.optionText || "")}" placeholder="선택지 문구" ${readonly ? "disabled" : ""} />
      </label>
      <label>
        <span>점수</span>
        <input data-option-field="score" type="number" min="-1000" max="1000" value="${Number(option.score || 0)}" ${readonly ? "disabled" : ""} />
      </label>
      <button class="icon-button danger-button ${readonly ? "is-hidden" : ""}" type="button" data-remove-option="${optionIndex}">삭제</button>
      <div class="template-option-extra">
        <label class="template-checkbox">
          <input data-option-field="requiresText" type="checkbox" ${requiresText ? "checked" : ""} ${readonly ? "disabled" : ""} />
          <span>이 답변에 추가 입력칸 표시</span>
        </label>
        <label class="template-option-placeholder ${requiresText ? "" : "is-hidden"}">
          <span>추가 입력 안내</span>
          <input data-option-field="textPlaceholder" maxlength="200"
            value="${escapeMarkup(option.textPlaceholder || "기타 내용을 입력해 주세요.")}"
            placeholder="예: 기타 내용을 입력해 주세요." ${readonly ? "disabled" : ""} />
        </label>
      </div>
    </div>`;
}

function managementBandMarkup(b = {}, readonly = false) {
  return `<div data-management-band class="template-option-row">
    <label>구간명<input data-band-name maxlength="50" value="${escapeMarkup(b.name || '')}" ${readonly ? 'disabled' : ''}></label>
    <label>최소 점수<input data-band-min type="number" step="1" value="${Number.isInteger(b.min) ? b.min : ''}" ${readonly ? 'disabled' : ''}></label>
    <label>최대 점수<input data-band-max type="number" step="1" value="${Number.isInteger(b.max) ? b.max : ''}" ${readonly ? 'disabled' : ''}></label>
    <button type="button" data-remove-band ${readonly ? 'hidden' : ''}>구간 삭제</button></div>`;
}
function renderManagementBands(bands, readonly) {
  $('#templateManagementBands').innerHTML = bands.map(b => managementBandMarkup(b, readonly)).join('');
  $('#templateManagementSettings').classList.toggle('is-hidden', !$('#templateManagementEnabled').checked);
  $('#addManagementBand').hidden = readonly;
}
$('#templateManagementEnabled').addEventListener('change', () => {
  const enabled = $('#templateManagementEnabled').checked;
  $('#templateManagementSettings').classList.toggle('is-hidden', !enabled);
  if (enabled) $('#templateScoringEnabled').checked = true;
  if (enabled && !$('#templateManagementBands').children.length) $('#templateManagementBands').insertAdjacentHTML('beforeend', managementBandMarkup());
});
$('#templateScoringEnabled').addEventListener('change', () => {
  if (!$('#templateScoringEnabled').checked) {
    $('#templateManagementEnabled').checked = false;
    $('#templateManagementSettings').classList.add('is-hidden');
  }
});
$('#addManagementBand').addEventListener('click', () => {
  if ($('#templateManagementBands').children.length < 20) $('#templateManagementBands').insertAdjacentHTML('beforeend', managementBandMarkup());
});
$('#templateManagementBands').addEventListener('click', e => {
  if (e.target.closest('[data-remove-band]')) e.target.closest('[data-management-band]').remove();
});

function collectTemplateForm() {
  const questions = $$(".template-question-card").map((card, index) => {
    const answerType = card.querySelector('[data-question-field="answerType"]').value;
    const options = Array.from(card.querySelectorAll(".template-option-row")).map((row, optionIndex) => ({
      optionText: row.querySelector('[data-option-field="optionText"]').value.trim(),
      score: Number(row.querySelector('[data-option-field="score"]').value || 0),
      displayOrder: optionIndex + 1,
      requiresText: row.querySelector('[data-option-field="requiresText"]').checked,
      textPlaceholder: row.querySelector('[data-option-field="requiresText"]').checked
        ? row.querySelector('[data-option-field="textPlaceholder"]').value.trim()
        : null,
    }));
    return {
      questionNo: index + 1,
      questionText: card.querySelector('[data-question-field="questionText"]').value.trim(),
      required: card.querySelector('[data-question-field="required"]').checked,
      answerType,
      helpText: card.querySelector('[data-question-field="helpText"]').value.trim(),
      options: ["single_choice", "multiple_choice"].includes(answerType) ? options : [],
    };
  });
  return {
    title: $("#templateTitle").value.trim(),
    submissionTargets: TemplateTargets.value(),
    description: $("#templateDescription").value.trim(),
    purpose: $("#templatePurpose").value.trim(),
    targetAudience: $("#templateTargetAudience").value.trim(),
    estimatedMinutes: $("#templateEstimatedMinutes").value || null,
    scoringEnabled: $("#templateScoringEnabled").checked,
    managementEnabled: $("#templateManagementEnabled").checked,
    managementBands: Array.from(document.querySelectorAll('[data-management-band]')).map(row => ({
      name:row.querySelector('[data-band-name]').value.trim(),
      min:row.querySelector('[data-band-min]').value === '' ? null : Number(row.querySelector('[data-band-min]').value),
      max:row.querySelector('[data-band-max]').value === '' ? null : Number(row.querySelector('[data-band-max]').value),
    })),
    generationMethod: $("#templateGenerationMethod").value || "manual",
    generationLogId: $("#templateGenerationLogId").value || null,
    questions,
  };
}

let templateSavedForm = '';
let templateActionPending = false;
function templateHasUnsavedChanges() {
  return !$("#templateId").value || JSON.stringify(collectTemplateForm()) !== templateSavedForm;
}
function updateTemplateSaveFlow() {
  const save = $("#saveTemplateButton"), activate = $("#activateTemplateButton");
  if (save.classList.contains('is-hidden')) return;
  const dirty = templateHasUnsavedChanges();
  const busy = save.dataset.processing === 'true' || templateActionPending;
  activate.disabled = dirty || busy;
  save.disabled = busy;
  save.classList.toggle('primary-button', dirty);
  save.classList.toggle('secondary-button', !dirty);
  activate.classList.toggle('primary-button', !dirty);
  activate.classList.toggle('secondary-button', dirty);
  $("#templateSaveHint").textContent = busy ? '처리 중입니다. 잠시 기다려 주세요.' : dirty
    ? '양식을 저장한 뒤 운영을 시작하세요. 운영 시작 후에는 문항을 수정할 수 없습니다.'
    : '저장 완료 · 이제 운영 시작을 누르세요. 운영 시작 후에는 문항을 수정할 수 없습니다.';
}
document.querySelector('#templateEditor').addEventListener('input', updateTemplateSaveFlow);
document.querySelector('#templateEditor').addEventListener('change', updateTemplateSaveFlow);
document.querySelector('#templateEditor').addEventListener('click', () => queueMicrotask(updateTemplateSaveFlow));
new MutationObserver(updateTemplateSaveFlow).observe(document.querySelector('#templateQuestionList'), {childList:true, subtree:true});

async function saveChecklistTemplate(event) {
  event.preventDefault();
  if (templateActionPending) return;
  try { TemplateTargets.validate(); } catch(error) { showToast(error.message); return; }
  if (!window.V8FormValidation.validate()) return;
  const id = $("#templateId").value;
  const button = $("#saveTemplateButton");
  if (button.dataset.processing === "true") return;
  button.dataset.processing = "true";
  button.disabled = true;
  button.textContent = "저장 중...";
  updateTemplateSaveFlow();
  try {
    const payload = await apiRequest(id ? `/checklist-templates/${encodeURIComponent(id)}` : "/checklist-templates", {
      method: id ? "PATCH" : "POST",
      body: collectTemplateForm(),
    });
    selectedTemplateId = payload.template.id;
    checklistTemplatesLoaded = false;
    await loadChecklistTemplates(true);
    populateTemplateEditor(payload.template);
    setTemplateWorkspaceMode("editor");
    showToast("양식을 저장했습니다.");
  } catch (error) {
    window.V8FormValidation.serverError(error.message || "양식을 저장하지 못했습니다. 입력 내용은 유지됩니다.");
  } finally {
    button.disabled = false;
    button.textContent = "양식 저장";
    delete button.dataset.processing;
    updateTemplateSaveFlow();
  }
}

async function performTemplateAction(action) {
  if (templateActionPending || $("#saveTemplateButton").dataset.processing === 'true') return;
  if (action === 'activate' && templateHasUnsavedChanges()) {
    updateTemplateSaveFlow();
    showToast('변경한 양식을 먼저 저장한 뒤 운영을 시작해 주세요.');
    return;
  }
  const id = $("#templateId").value;
  if (!id) return;
  const messages = {
    activate: ["이 양식의 운영을 시작할까요? 운영 후에는 문항을 수정할 수 없습니다.", "양식 운영을 시작했습니다."],
    close: ["이 양식의 운영을 종료할까요?", "양식 운영을 종료했습니다."],
    delete: ["작성 중인 양식을 삭제할까요?", "양식을 삭제했습니다."],
  };
  if (!window.confirm(messages[action][0])) return;
  templateActionPending = true;
  $("#activateTemplateButton").dataset.processing = "true";
  updateTemplateSaveFlow();
  const method = action === "delete" ? "DELETE" : "POST";
  try {
    const path = action === "delete" ? `/checklist-templates/${encodeURIComponent(id)}` : `/checklist-templates/${encodeURIComponent(id)}/${action}`;
    const payload = await apiRequest(path, { method });
    checklistTemplatesLoaded = false;
    if (action === "delete") {
      selectedTemplateId = "";
      $("#templateEditor").classList.add("is-hidden");
      $("#templateEditorEmpty").classList.remove("is-hidden");
      setTemplateWorkspaceMode("list");
    } else {
      populateTemplateEditor(payload.template);
    }
    await loadChecklistTemplates(true);
    showToast(messages[action][1]);
  } catch (error) {
    showToast(error.message);
  } finally {
    templateActionPending = false;
    delete $("#activateTemplateButton").dataset.processing;
    updateTemplateSaveFlow();
  }
}

async function copyCurrentTemplate() {
  const id = $("#templateId").value;
  if (!id) return;
  const suggested = `${$("#templateTitle").value} 복사본`;
  const title = window.prompt("새 양식명을 입력해 주세요.", suggested);
  if (!title) return;
  try {
    const payload = await apiRequest(`/checklist-templates/${encodeURIComponent(id)}/copy`, {
      method: "POST",
      body: { title },
    });
    selectedTemplateId = payload.template.id;
    checklistTemplatesLoaded = false;
    await loadChecklistTemplates(true);
    populateTemplateEditor(payload.template);
    setTemplateWorkspaceMode("editor");
    showToast("새 작성 중 양식으로 복사했습니다.");
  } catch (error) {
    showToast(error.message);
  }
}

function toggleAiDraftPanel(show) {
  setTemplateWorkspaceMode(show ? "ai" : "list");
}

function toggleAiFileDraftPanel(show) {
  setTemplateWorkspaceMode(show ? "file" : "list");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function renderAiDraftFiles() {
  const list = $("#aiFileList");
  if (!aiDraftFiles.length) {
    list.innerHTML = `<span class="ai-file-empty">선택된 파일이 없습니다.</span>`;
    return;
  }
  list.innerHTML = aiDraftFiles
    .map(
      (file, index) => `
        <div class="ai-file-item">
          <span class="ai-file-item-info">
            <strong title="${escapeMarkup(file.name)}">${escapeMarkup(file.name)}</strong>
            <span>${escapeMarkup(formatFileSize(file.size))}</span>
          </span>
          <button class="icon-button" type="button" data-remove-ai-file="${index}" aria-label="${escapeMarkup(file.name)} 삭제">삭제</button>
        </div>`
    )
    .join("");
}

function addAiDraftFiles(files) {
  const candidates = Array.from(files || []);
  if (!candidates.length) return;
  const invalid = candidates.find((file) => !AI_DRAFT_ALLOWED_TYPES.includes(file.type));
  if (invalid) {
    showToast(`${invalid.name}: PDF, PNG, JPG 파일만 사용할 수 있습니다.`);
    return;
  }

  const merged = [...aiDraftFiles];
  candidates.forEach((file) => {
    const duplicate = merged.some(
      (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified
    );
    if (!duplicate) merged.push(file);
  });
  if (merged.length > AI_DRAFT_FILE_LIMIT) {
    showToast(`파일은 최대 ${AI_DRAFT_FILE_LIMIT}개까지 선택할 수 있습니다.`);
    return;
  }
  const totalBytes = merged.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > AI_DRAFT_TOTAL_BYTES) {
    showToast("선택한 파일의 전체 크기는 3.5MB 이하여야 합니다.");
    return;
  }
  aiDraftFiles = merged;
  $("#aiDraftFile").value = "";
  renderAiDraftFiles();
}

async function generateAiFileChecklistDraft() {
  if (!aiDraftFiles.length) {
    showToast("분석할 PDF 또는 이미지 파일을 한 개 이상 선택해 주세요.");
    $("#aiDraftFile").focus();
    return;
  }

  const button = $("#generateAiFileDraftButton");
  if (button.dataset.processing === "true") return;
  button.dataset.processing = "true";
  const actions = $("#aiFileDraftPanel .ai-draft-actions");
  button.disabled = true;
  button.textContent = "AI가 파일 분석 중...";
  actions.classList.add("is-loading");
  $("#aiFileDraftStatus").textContent = `${aiDraftFiles.length}개 파일의 형식과 개인정보 포함 가능성을 확인하며 문항을 구성하고 있습니다.`;
  try {
    const state = await EungdabiroomAI.status(apiRequest);
    if (!state.configured || !state.files) throw new Error('AI가 미설정·사용 중지 상태이거나 파일 입력을 지원하지 않습니다. AI 연동 설정을 확인해 주세요.');
    const files = await Promise.all(
      aiDraftFiles.map(async (file) => ({
        filename: file.name,
        mimeType: file.type,
        fileBase64: arrayBufferToBase64(await file.arrayBuffer()),
      }))
    );
    const payload = await apiRequest("/checklist-templates/ai-file-draft", {
      method: "POST",
      body: {
        files,
        topic: $("#aiFileDraftTopic").value.trim(),
        targetAudience: $("#aiFileDraftTargetAudience").value.trim(),
        questionCount: Number($("#aiFileDraftQuestionCount").value || 10),
        requirements: $("#aiFileDraftRequirements").value.trim(),
      },
    });
    selectedTemplateId = "";
    renderChecklistTemplateList();
    populateTemplateEditor({
      ...payload.draft,
      id: "",
      generationMethod: "ai_file",
      generationLogId: payload.generationLogId,
    });
    $("#templateEditorTitle").textContent = "파일 기반 AI 초안";
    $("#aiFileDraftStatus").textContent = `${payload.model}이(가) ${payload.draft.questions.length}개 문항을 생성했습니다. 내용을 검토해 주세요.`;
    aiDraftFiles = [];
    renderAiDraftFiles();
    setTemplateWorkspaceMode("editor");
    $("#templateEditor").scrollIntoView({ block: "start", behavior: "smooth" });
    showToast("파일 기반 AI 초안을 생성했습니다. 검토 후 저장해 주세요.");
  } catch (error) {
    $("#aiFileDraftStatus").textContent = error.message || "파일 기반 AI 초안을 생성하지 못했습니다.";
    showToast(error.message || "파일 기반 AI 초안을 생성하지 못했습니다.");
  } finally {
    button.disabled = false;
    button.textContent = "파일 분석 및 초안 생성";
    delete button.dataset.processing;
    document.dispatchEvent(new Event("account-ai-readiness-refresh"));
    actions.classList.remove("is-loading");
  }
}

async function generateAiChecklistDraft() {
  const topic = $("#aiDraftTopic").value.trim();
  if (!topic) {
    showToast("조사 주제와 요청 내용을 입력해 주세요.");
    $("#aiDraftTopic").focus();
    return;
  }

  const button = $("#generateAiDraftButton");
  if (button.dataset.processing === "true") return;
  button.dataset.processing = "true";
  const actions = $("#aiDraftPanel .ai-draft-actions");
  button.disabled = true;
  button.textContent = "AI가 설계 중...";
  actions.classList.add("is-loading");
  $("#aiDraftStatus").textContent = "문항 구조와 개인정보 포함 여부를 검토하며 초안을 생성하고 있습니다.";
  try {
    const payload = await EungdabiroomAI.generateText(apiRequest, {
      topic,
      targetAudience: $("#aiDraftTargetAudience").value.trim(),
      questionCount: Number($("#aiDraftQuestionCount").value),
      requirements: $("#aiDraftRequirements").value.trim(),
    });
    selectedTemplateId = "";
    renderChecklistTemplateList();
    populateTemplateEditor({
      ...payload.draft,
      id: "",
      generationMethod: "ai_text",
      generationLogId: payload.generationLogId,
    });
    $("#templateEditorTitle").textContent = "AI 생성 초안";
    $("#aiDraftStatus").textContent = `${payload.model}이 ${payload.draft.questions.length}개 문항을 생성했습니다. 내용을 검토해 주세요.`;
    setTemplateWorkspaceMode("editor");
    $("#templateEditor").scrollIntoView({ block: "start", behavior: "smooth" });
    showToast("AI 초안을 생성했습니다. 검토 후 저장해 주세요.");
  } catch (error) {
    $("#aiDraftStatus").textContent = error.message || "AI 초안을 생성하지 못했습니다.";
    showToast(error.message || "AI 초안을 생성하지 못했습니다.");
  } finally {
    button.disabled = false;
    delete button.dataset.processing;
    document.dispatchEvent(new Event("account-ai-readiness-refresh"));
    button.textContent = "AI 초안 생성";
    actions.classList.remove("is-loading");
  }
}

function bindEvents() {
  $$(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => {
      activateView(button.dataset.view);
    });
  });

  $("#newTemplateButton").addEventListener("click", showNewTemplateEditor);
  $("#openAiDraftButton").addEventListener("click", () => toggleAiDraftPanel(true));
  $("#closeAiDraftButton").addEventListener("click", () => toggleAiDraftPanel(false));
  $("#generateAiDraftButton").addEventListener("click", generateAiChecklistDraft);
  $("#openAiFileDraftButton").addEventListener("click", () => toggleAiFileDraftPanel(true));
  $("#closeAiFileDraftButton").addEventListener("click", () => toggleAiFileDraftPanel(false));
  $("#generateAiFileDraftButton").addEventListener("click", generateAiFileChecklistDraft);
  $("#aiDraftFile").addEventListener("change", (event) => addAiDraftFiles(event.target.files));
  $("#aiFileDropzone").addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    $("#aiDraftFile").click();
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    $("#aiFileDropzone").addEventListener(eventName, (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      $("#aiFileDropzone").classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    $("#aiFileDropzone").addEventListener(eventName, (event) => {
      event.preventDefault();
      $("#aiFileDropzone").classList.remove("is-dragover");
      if (eventName === "drop") addAiDraftFiles(event.dataTransfer.files);
    });
  });
  $("#aiFileList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-ai-file]");
    if (!button) return;
    aiDraftFiles.splice(Number(button.dataset.removeAiFile), 1);
    renderAiDraftFiles();
  });
  $("#templateEditor").addEventListener("submit", saveChecklistTemplate);
  $("#activateTemplateButton").addEventListener("click", () => performTemplateAction("activate"));
  $("#closeTemplateButton").addEventListener("click", () => performTemplateAction("close"));
  $("#deleteTemplateButton").addEventListener("click", () => performTemplateAction("delete"));
  $("#copyTemplateButton").addEventListener("click", copyCurrentTemplate);

  $(".template-filter-row").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-template-status]");
    if (!button) return;
    templateStatusFilter = button.dataset.templateStatus;
    $$(".template-filter").forEach((item) => item.classList.toggle("is-active", item === button));
    checklistTemplatesLoaded = false;
    try {
      await loadChecklistTemplates(true);
    } catch (error) {
      showToast(error.message);
    }
  });

  $("#templateList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-template-id]");
    if (!button) return;
    openChecklistTemplate(button.dataset.templateId).catch((error) => showToast(error.message));
  });

  $("#addTemplateQuestionButton").addEventListener("click", () => {
    const current = collectTemplateForm().questions;
    current.push(emptyTemplateQuestion(current.length + 1));
    renderTemplateQuestions(current);
  });

  $("#templateQuestionList").addEventListener("change", (event) => {
    if (event.target.matches('[data-option-field="requiresText"]')) {
      const optionRow = event.target.closest(".template-option-row");
      const placeholder = optionRow.querySelector(".template-option-placeholder");
      placeholder.classList.toggle("is-hidden", !event.target.checked);
      if (event.target.checked && !placeholder.querySelector("input").value.trim()) {
        placeholder.querySelector("input").value = "기타 내용을 입력해 주세요.";
      }
      return;
    }
    if (!event.target.matches('[data-question-field="answerType"]')) return;
    const current = collectTemplateForm().questions;
    current.forEach((question) => {
      const isChoice = ["single_choice", "multiple_choice"].includes(question.answerType);
      if (isChoice && question.options.length < 2) {
        question.options = [
          { optionText: "", score: 0, displayOrder: 1 },
          { optionText: "", score: 0, displayOrder: 2 },
        ];
      }
      if (!isChoice) question.options = [];
    });
    renderTemplateQuestions(current);
  });

  $("#templateQuestionList").addEventListener("click", (event) => {
    const removeQuestion = event.target.closest("[data-remove-question]");
    const addOption = event.target.closest("[data-add-option]");
    const removeOption = event.target.closest("[data-remove-option]");
    if (!removeQuestion && !addOption && !removeOption) return;

    const current = collectTemplateForm().questions;
    if (removeQuestion) {
      if (current.length === 1) {
        showToast("양식에는 문항이 한 개 이상 필요합니다.");
        return;
      }
      current.splice(Number(removeQuestion.dataset.removeQuestion), 1);
    }
    if (addOption) {
      const question = current[Number(addOption.dataset.addOption)];
      question.options.push({
        optionText: "",
        score: 0,
        displayOrder: question.options.length + 1,
      });
    }
    if (removeOption) {
      const questionCard = removeOption.closest(".template-question-card");
      current[Number(questionCard.dataset.questionIndex)].options.splice(Number(removeOption.dataset.removeOption), 1);
    }
    renderTemplateQuestions(current);
  });

  $("#homeRecentList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-detail]");
    if (!button) return;
    openDetail(button.dataset.openDetail);
  });

  $("#openCentralPassword").addEventListener("click", () => {
    if (!isCentralRole()) return;
    activateView("central-password");
    $("#centralPasswordUpdatedAt").textContent = getPasswordUpdatedAt(CENTRAL_ADMIN_CODE);
  });

  window.addEventListener("popstate", (event) => {
    activateView(event.state?.view || viewFromLocation(), { skipHistory: true });
  });

  $("#copyLink").addEventListener("click", async () => {
    const value = $("#masterUrl").value;
    try {
      await navigator.clipboard.writeText(value);
      showToast("기관 공용 링크를 복사했습니다.");
    } catch {
      $("#masterUrl").select();
      showToast("링크 입력칸을 선택했습니다.");
    }
  });

  $$(".stats-tab").forEach((button) => {
    button.addEventListener("click", () => {
      activeStatsTab = button.dataset.statsTab;
      renderStats();
    });
  });
  $("#queryStatsButton").addEventListener("click", () => {
    // AI 통계 탭은 /stats 집계를 쓰지 않는다. 조건만 반영하고 실행은 STEP 1의 "다음"에서 한다.
    if (activeStatsTab === "ai") {
      renderStats();
      return;
    }
    loadStats().catch((error) => showToast(error.message || "통계 데이터를 조회하지 못했습니다."));
  });

  $("#masterAgencyList").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-institution]");
    if (editButton) {
      const institution = institutionMaster.find((item) => item.code === editButton.dataset.editInstitution);
      if (institution) openInstitutionDialog(institution);
      return;
    }
    const statusButton = event.target.closest("[data-toggle-institution]");
    if (statusButton) {
      const nextActive = statusButton.checked;
      statusButton.checked = !nextActive;
      toggleInstitutionStatus(statusButton.dataset.toggleInstitution, nextActive);
      return;
    }
    const toggle = event.target.closest("[data-master-region-toggle]");
    if (toggle) {
      const code = toggle.dataset.masterRegionToggle;
      const expandedRegions = masterLevelFilter === "regional" ? expandedRegionalFilterRegions : expandedMasterRegions;
      if (expandedRegions.has(code)) expandedRegions.delete(code);
      else expandedRegions.add(code);
      renderMasterAgencyList();
      return;
    }
    const button = event.target.closest("[data-master-agency-code]");
    if (!button) return;
    selectedMasterAgencyCode = button.dataset.masterAgencyCode;
    renderMasterAgencyList();
    applyMasterTargetToView();
    $("#newPassword").value = "";
    $("#confirmPassword").value = "";
    $("#newIntakePassword").value = "";
    $("#confirmIntakePassword").value = "";
  });

  $("#masterAgencySearch").addEventListener("input", (event) => {
    masterAgencySearchTerm = event.target.value;
    renderMasterAgencyList();
  });

  $("#masterStateFilter").addEventListener("change", event => { masterStateFilter = event.target.value; renderMasterAgencyList(); });

  $("#masterLevelFilter").addEventListener("change", (event) => {
    masterLevelFilter = event.target.value;
    renderMasterAgencyList();
  });

  $("#addInstitutionButton").addEventListener("click", () => openInstitutionDialog());
  $("#bulkInstitutionButton").addEventListener("click", openBulkInstitutionDialog);
  $("#editOwnInstitutionButton").addEventListener("click", () => openInstitutionDialog(agency));
  $("#closeInstitutionDialog").addEventListener("click", closeInstitutionDialog);
  $("#institutionDialog").addEventListener("close", clearPasswordFields);
  $("#cancelInstitutionDialog").addEventListener("click", closeInstitutionDialog);
  $("#institutionType").addEventListener("change", refreshInstitutionFormVisibility);
  $("#institutionParentCode").addEventListener("change", syncInstitutionSidoFromParent);
  $("#institutionCode").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  $("#institutionForm").addEventListener("submit", saveInstitution);
  $("#closeBulkInstitutionDialog").addEventListener("click", closeBulkInstitutionDialog);
  $("#cancelBulkInstitutionDialog").addEventListener("click", closeBulkInstitutionDialog);
  $("#bulkInstitutionType").addEventListener("change", () => {
    $("#bulkInstitutionFile").value = "";
    resetBulkInstitutionResult();
    updateBulkInstitutionHelp();
  });
  $("#bulkInstitutionFile").addEventListener("change", resetBulkInstitutionResult);
  $("#downloadInstitutionTemplate").addEventListener("click", downloadInstitutionTemplate);
  $("#downloadInstitutionErrors").addEventListener("click", downloadInstitutionErrors);
  $("#bulkInstitutionForm").addEventListener("submit", uploadBulkInstitutions);

  $("#savePassword").addEventListener("click", async () => {
    const next = $("#newPassword").value.trim();
    const confirm = $("#confirmPassword").value.trim();
    if (!next || next !== confirm) {
      showToast("새 비밀번호와 확인값을 다시 확인해 주세요.");
      return;
    }
    if (next.length < 8) {
      showToast("비밀번호는 8자리 이상이어야 합니다.");
      return;
    }
    const target = masterTargetInstitution();
    try {
      const payload = await apiRequest("/password", {
        method: "PATCH",
        body: { institutionCode: target.code, password: next },
      });
      $("#newPassword").value = "";
      $("#confirmPassword").value = "";
      const updatedAt = formatSubmittedAt(payload.account?.passwordUpdatedAt) || new Date().toLocaleString("ko-KR", { hour12: false });
      setPasswordUpdatedAt(updatedAt, target.code);
      $("#passwordUpdatedAt").textContent = updatedAt;
      renderMasterAgencyList();
      showToast(`${target.name} 비밀번호를 저장했습니다.`);
    } catch (error) {
      showToast(error.message || "비밀번호를 저장하지 못했습니다.");
    }
  });

  $("#resetPasswordFields").addEventListener("click", () => {
    $("#newPassword").value = "";
    $("#confirmPassword").value = "";
    showToast("비밀번호 입력을 초기화했습니다.");
  });

  $("#saveIntakePassword").addEventListener("click", async () => {
    const next = $("#newIntakePassword").value.trim();
    const confirm = $("#confirmIntakePassword").value.trim();
    if (!next || next !== confirm) {
      showToast("조사자용 새 비밀번호와 확인값을 다시 확인해 주세요.");
      return;
    }
    if (next.length < 8) {
      showToast("조사자용 접속링크 비밀번호는 8자리 이상이어야 합니다.");
      return;
    }
    const target = masterTargetInstitution();
    try {
      const payload = await apiRequest("/intake-password", {
        method: "PATCH",
        body: { institutionCode: target.code, password: next },
      });
      $("#newIntakePassword").value = "";
      $("#confirmIntakePassword").value = "";
      const updatedAt = formatSubmittedAt(payload.account?.intakePasswordUpdatedAt) || new Date().toLocaleString("ko-KR", { hour12: false });
      setIntakePasswordUpdatedAt(updatedAt, target.code);
      $("#intakePasswordUpdatedAt").textContent = updatedAt;
      renderMasterAgencyList();
      showToast(`${target.name} 조사자용 접속링크 비밀번호를 저장했습니다.`);
    } catch (error) {
      showToast(error.message || "조사자용 접속링크 비밀번호를 저장하지 못했습니다.");
    }
  });

  $("#resetIntakePasswordFields").addEventListener("click", () => {
    $("#newIntakePassword").value = "";
    $("#confirmIntakePassword").value = "";
    showToast("조사자용 접속링크 비밀번호 입력을 초기화했습니다.");
  });

  $("#saveCentralPassword").addEventListener("click", async () => {
    const next = $("#centralNewPassword").value.trim();
    const confirm = $("#centralConfirmPassword").value.trim();
    if (!next || next !== confirm) {
      showToast("중앙관리자 새 비밀번호와 확인값을 다시 확인해 주세요.");
      return;
    }
    if (next.length < 8) {
      showToast("중앙관리자 계정 비밀번호는 8자리 이상이어야 합니다.");
      return;
    }
    try {
      const payload = await apiRequest("/password", {
        method: "PATCH",
        body: { institutionCode: CENTRAL_ADMIN_CODE, password: next },
      });
      $("#centralNewPassword").value = "";
      $("#centralConfirmPassword").value = "";
      const updatedAt = formatSubmittedAt(payload.account?.passwordUpdatedAt) || new Date().toLocaleString("ko-KR", { hour12: false });
      setPasswordUpdatedAt(updatedAt, CENTRAL_ADMIN_CODE);
      $("#centralPasswordUpdatedAt").textContent = updatedAt;
      showToast("중앙관리자 계정 비밀번호를 저장했습니다.");
    } catch (error) {
      showToast(error.message || "중앙관리자 계정 비밀번호를 저장하지 못했습니다.");
    }
  });

  $("#resetCentralPasswordFields").addEventListener("click", () => {
    $("#centralNewPassword").value = "";
    $("#centralConfirmPassword").value = "";
    showToast("중앙관리자 계정 비밀번호 입력을 초기화했습니다.");
  });

  $("#filterSido").addEventListener("input", () => {
    refreshSigunguFilter("#filterSido", "#filterSigungu");
    renderDashboard();
  });

  ["#filterSigungu", "#filterAgencyCode", "#filterAgencyName", "#filterType", "#filterStatus", "#filterStartDate", "#filterEndDate"].forEach((selector) => {
    $(selector).addEventListener("input", () => {
      renderDashboard();
    });
  });
  $("#searchInput").addEventListener("input", () => {
    renderDashboard();
  });

  $("#statsFilterSido").addEventListener("input", () => {
    refreshSigunguFilter("#statsFilterSido", "#statsFilterSigungu");
    refreshStatsAgencyFilter();
    markStatsDirty();
  });

  ["#statsFilterSigungu", "#statsFilterAgencyCode", "#statsFilterType", "#statsFilterStartDate", "#statsFilterEndDate"].forEach((selector) => {
    $(selector).addEventListener("input", () => {
      if (selector === "#statsFilterSigungu") refreshStatsAgencyFilter();
      markStatsDirty();
    });
  });

  $("#submissionRows").addEventListener("click", (event) => {
    if (event.target.closest("[data-retry-submissions]")) { refreshRemoteData(); return; }
    if (event.target.closest(".row-checkbox")) return;
    const trigger = event.target.closest("[data-open-detail], .clickable-row");
    if (!trigger) return;
    const id = trigger.dataset.openDetail || trigger.dataset.id;
    openDetail(id);
  });

  $("#submissionRows").addEventListener("change", (event) => {
    const checkbox = event.target.closest(".row-checkbox");
    if (!checkbox) return;

    const id = checkbox.dataset.selectId;
    if (checkbox.checked) {
      selectedSubmissionIds.add(id);
    } else {
      selectedSubmissionIds.delete(id);
    }
    updateBulkSelectionState();
  });

  $("#selectPageCheckbox").addEventListener("change", (event) => {
    dashboardPageRows().forEach((item) => {
      if (event.target.checked) {
        selectedSubmissionIds.add(String(item.id));
      } else {
        selectedSubmissionIds.delete(String(item.id));
      }
    });
    renderDashboard();
  });

  $("#paginationControls").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.page) {
      currentPage = Number(button.dataset.page);
    }
    if (button.dataset.pageAction === "first") currentPage = 1;
    if (button.dataset.pageAction === "prev") {
      currentPage = Math.max(1, currentPage - 10);
    }
    if (button.dataset.pageAction === "next") {
      currentPage = Math.min(maxDashboardPage(), currentPage + 10);
    }
    if (button.dataset.pageAction === "last") currentPage = maxDashboardPage();
    refreshRemoteData();
  });

  $("#detailContent").addEventListener("input", (event) => {
    if (event.target.id === "editClientBirthYear") {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
      refreshEditBirthDayOptions();
      return;
    }
    if (event.target.id === "editWorkerPhone") {
      event.target.value = formatPhoneNumber(event.target.value);
    }
  });

  $("#detailContent").addEventListener("change", (event) => {
    if (event.target.id !== "editClientBirthMonth") return;
    refreshEditBirthDayOptions();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!$("#detailDrawer").classList.contains("is-open") || (!detailBusy && !detailHasChanges())) return;
    event.preventDefault();
    event.returnValue = "";
  });
  $("#detailDrawer").addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); closeDetail(); }
    if (event.key !== "Tab") return;
    const controls = $$("#detailDrawer button, #detailDrawer input, #detailDrawer select, #detailDrawer a[href]").filter((el) => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  $("#closeDrawer").addEventListener("click", closeDetail);
  $("#drawerBackdrop").addEventListener("click", closeDetail);
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#logoutButton").addEventListener("click", logout);
  $("#bulkDeleteButton").addEventListener("click", deleteSelectedSubmissions);
  $("#exportExcel").addEventListener("click", exportListExcel);
  $("#exportDetailedExcel").addEventListener("click", exportDetailedExcel);
  $("#exportStatsExcel").addEventListener("click", exportStatsExcel);
  $("#detailContent").addEventListener("click", (event) => {
    const saveButton = event.target.closest("[data-save-submission]");
    if (saveButton) {
      saveSubmissionBasicInfo(saveButton.dataset.saveSubmission);
      return;
    }
    const button = event.target.closest("[data-complete-submission]");
    if (button) { completeSubmission(button.dataset.completeSubmission); return; }
    const reopenButton = event.target.closest('[data-reopen-submission]');
    if (reopenButton) completeSubmission(reopenButton.dataset.reopenSubmission, true);
  });
}

let startupController = null;

async function loadStartupData() {
  startupController?.abort();
  const controller = new AbortController();
  startupController = controller;
  const owner = authToken();
  if (!owner) return;
  $("#startupError").hidden = true;
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    await loadInstitutionMaster({ signal: controller.signal });
    if (authToken() !== owner || startupController !== controller) return;
    applyAgencyToView();
    await loadHomeSummary({ signal: controller.signal });
    if (authToken() !== owner || startupController !== controller) return;
    renderAfterDataChange();
  } catch (error) {
    if (authToken() !== owner || startupController !== controller) return;
    if (error.status === 401) {
      logout({ redirectToLanding: false });
      showToast('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }
    $("#startupErrorMessage").textContent = controller.signal.aborted
      ? '초기 자료 조회가 지연되고 있습니다. 다시 불러오기를 눌러 주세요.'
      : '초기 자료를 불러오지 못했습니다. 다시 시도해 주세요.';
    $("#startupError").hidden = false;
  } finally {
    clearTimeout(timeout);
  }
}

function bootstrap() {
  clearLegacyPasswords();
  clearPasswordFields();
  populateChecklistFilter();
  initializeAuth();
  bindEvents();
  $("#startupRetry").addEventListener('click', loadStartupData);
  submissions = [];
  renderAfterDataChange();
  if (isAuthenticated()) loadStartupData();
}

bootstrap();
