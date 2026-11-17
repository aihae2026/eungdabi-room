const intakeInstitutionMaster = window.INSTITUTION_MASTER || [];
const DEFAULT_INTAKE_AGENCY_CODE = intakeInstitutionMaster.find((item) => item.type === "agency")?.code || "SAMPLEAG001";
const DEFAULT_INTAKE_PASSWORD = "";
const INTAKE_TOKEN_KEY = "lifeSafetyIntakeToken";
const INTAKE_AGENCY_CODE_KEY = "lifeSafetyIntakeAgencyCode";
const API_BASE_URL = "/api";

function requestAgencyCode() {
  return String(new URLSearchParams(location.search).get("agency") || "").trim().toUpperCase();
}

let intakeAgency = {
  code: requestAgencyCode(),
  name: "기관 정보 확인 중",
  sido: "",
  sigungu: "",
  type: "agency",
};

function isLocalPreview() {
  return location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
}

const intakeChecklistDefs = {
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

let selectedChecklistType = "";
let selectedAnswers = [];
let selectedOptionTexts = {};
let activeDynamicTemplates = [];
let selectedDynamicTemplate = null;

const $ = (selector) => document.querySelector(selector);

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function intakeToken() {
  if (sessionStorage.getItem(INTAKE_AGENCY_CODE_KEY) !== intakeAgency.code) return "";
  return sessionStorage.getItem(INTAKE_TOKEN_KEY) || "";
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = intakeToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 로컬 테스트 환경이거나 네트워크 연결을 확인해 주세요.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "요청을 처리하지 못했습니다.");
  }
  return payload;
}

function disableIntakeAccess(message) {
  $("#workerAgencyName").textContent = "접속할 수 없는 기관";
  $("#intakeAccessMessage").textContent = message;
  $("#intakeAccessMessage").classList.remove("is-hidden");
  $("#workerAgencyPassword").disabled = true;
  $("#verifyAgencyPassword").disabled = true;
}

async function initializeIntakeAgency() {
  const code = requestAgencyCode();
  if (!code) {
    disableIntakeAccess("기관 접속 링크가 올바르지 않습니다. 기관에서 안내받은 링크로 다시 접속해 주세요.");
    return false;
  }

  try {
    const payload = await apiRequest(`/institutions/${encodeURIComponent(code)}`);
    if (!payload.agency || payload.agency.type !== "agency" || payload.agency.code !== code) {
      throw new Error("기관담당자 정보를 확인할 수 없습니다.");
    }
    intakeAgency = payload.agency;
    $("#workerAgencyName").textContent = intakeAgency.name;
    $("#workerAgencyPassword").disabled = false;
    $("#verifyAgencyPassword").disabled = false;
    return true;
  } catch (error) {
    if (isLocalPreview()) {
      const localAgency = intakeInstitutionMaster.find((item) => item.type === "agency" && item.code === code);
      if (localAgency) {
        intakeAgency = localAgency;
        $("#workerAgencyName").textContent = intakeAgency.name;
        $("#workerAgencyPassword").disabled = false;
        $("#verifyAgencyPassword").disabled = false;
        return true;
      }
    }
    disableIntakeAccess(error.message || "기관 정보를 확인하지 못했습니다. 기관담당자에게 문의해 주세요.");
    return false;
  }
}

function showStep(stepId, recordHistory = true) {
  if (recordHistory && history.state?.intakeStep !== stepId) {
    history.pushState({intakeStep: stepId}, '', location.href);
  }
  document.querySelectorAll(".worker-step").forEach((step) => step.classList.remove("is-active"));
  $(stepId).classList.add("is-active");
}

history.replaceState({intakeStep: '#passwordStep'}, '', location.href);
window.addEventListener('popstate', () => {
  let step = history.state?.intakeStep;
  if (!['#passwordStep', '#selectStep', '#questionStep'].includes(step)) return;
  if (!intakeToken()) step = '#passwordStep';
  if (step === '#questionStep' && !selectedChecklistType && !selectedDynamicTemplate) step = '#selectStep';
  history.replaceState({intakeStep: step}, '', location.href);
  showStep(step, false);
  scrollToWorkerTop();
});

function returnToSelect() {
  if (history.state?.intakeStep === '#questionStep') history.back();
  else showStep('#selectStep');
}

function scrollToWorkerTop() {
  $(".worker-screen").scrollIntoView({ block: "start" });
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function renderPicker() {
  const legacyChoices = Object.entries(intakeChecklistDefs)
    .map(
      ([type, def]) => `
        <button class="checklist-choice" type="button" data-checklist-type="${type}">
          <strong>${def.label}</strong>
          <span>${def.questions.length}문항</span>
        </button>`
    );
  const dynamicChoices = activeDynamicTemplates.map(
    (template) => `
      <button class="checklist-choice dynamic-checklist-choice" type="button" data-template-id="${escapeMarkup(template.id)}">
        <strong>${escapeMarkup(template.title)}</strong>
        <span>운영기관 자체 조사${template.estimatedMinutes ? ` · 약 ${template.estimatedMinutes}분` : ""}</span>
      </button>`
  );
  $("#checklistPicker").innerHTML = dynamicChoices.join("") || '<p>현재 운영 중인 설문이 없습니다. 기관담당자에게 문의해 주세요.</p>';
}

function renderQuestions(type) {
  selectedChecklistType = type;
  selectedDynamicTemplate = null;
  const def = intakeChecklistDefs[type];
  selectedAnswers = def.questions.map(() => "");
  selectedOptionTexts = {};
  $("#selectedChecklistTitle").textContent = def.label;
  $("#selectedScaleMax").textContent = `${def.questions.length}문항`;
  $("#fieldMemo").value = "";
  $("#workerQuestionList").innerHTML = def.questions
    .map(
      (question, index) => `
        <section class="worker-question">
          <strong>${index + 1}. ${question}</strong>
          <div class="worker-options">
            ${def.options
              .map(
                (option) => `
                  <button class="worker-option" type="button"
                    data-question-index="${index}" data-answer="${option.label}">
                    ${option.label}
                  </button>`
              )
              .join("")}
          </div>
        </section>`
    )
    .join("");
  updateScore();
  showStep("#questionStep");
  requestAnimationFrame(scrollToWorkerTop);
}

async function loadDynamicTemplates() {
  const payload = await apiRequest("/intake/checklist-templates");
  activeDynamicTemplates = payload.templates || [];
  renderPicker();
}

async function renderDynamicQuestions(templateId) {
  const payload = await apiRequest(`/intake/checklist-templates/${encodeURIComponent(templateId)}`);
  const template = payload.template;
  selectedChecklistType = "";
  selectedDynamicTemplate = template;
  selectedAnswers = template.questions.map((question) =>
    question.answerType === "multiple_choice" ? [] : ""
  );
  selectedOptionTexts = {};
  $("#selectedChecklistTitle").textContent = template.title;
  $("#selectedScaleMax").textContent = `${template.questions.length}문항`;
  $("#fieldMemo").value = "";
  $("#workerQuestionList").innerHTML = template.questions
    .map((question, index) => dynamicQuestionMarkup(question, index))
    .join("");
  updateScore();
  showStep("#questionStep");
  requestAnimationFrame(scrollToWorkerTop);
}

function dynamicQuestionMarkup(question, index) {
  const requirementClass = question.required ? "is-required" : "is-optional";
  const requiredLabel = `<em class="worker-required ${requirementClass}">${question.required ? "필수" : "선택"}</em>`;
  const responseHint = ["text","textarea"].includes(question.answerType) ? `<p class="worker-question-help">${question.required ? "이 문항은 반드시 답해 주세요." : "추가할 내용이 있을 때 작성해 주세요."}</p>` : "";
  const help = question.helpText ? `<p class="worker-question-help">${escapeMarkup(question.helpText)}</p>` : "";
  let answerControl = "";
  if (question.answerType === "text") {
    answerControl = `<input class="worker-dynamic-text" data-question-index="${index}" type="text" maxlength="4000" placeholder="답변을 입력해 주세요." />`;
  } else if (question.answerType === "textarea") {
    answerControl = `<textarea class="worker-dynamic-text" data-question-index="${index}" rows="4" maxlength="4000" placeholder="내용을 입력해 주세요."></textarea>`;
  } else {
    answerControl = `
      <div class="worker-options">
        ${question.options
          .map(
            (option) => `
              <div class="worker-option-group">
                <button class="worker-option" type="button"
                  data-question-index="${index}" data-option-id="${option.id}"
                  data-multiple="${question.answerType === "multiple_choice"}"
                  data-requires-text="${Boolean(option.requiresText)}">
                  ${escapeMarkup(option.optionText)}
                </button>
                ${
                  option.requiresText
                    ? `<div class="worker-option-text-wrap is-hidden" data-option-text-wrap="${option.id}">
                        <label>
                          <span>${escapeMarkup(option.textPlaceholder || "기타 내용을 입력해 주세요.")}</span>
                          <input class="worker-option-extra-text" type="text" maxlength="1000"
                            data-question-index="${index}" data-option-id="${option.id}"
                            placeholder="${escapeMarkup(option.textPlaceholder || "기타 내용을 입력해 주세요.")}" />
                        </label>
                      </div>`
                    : ""
                }
              </div>`
          )
          .join("")}
      </div>`;
  }
  return `
    <section class="worker-question">
      <strong>${index + 1}. ${escapeMarkup(question.questionText)} ${requiredLabel}</strong>
      ${help}${responseHint}
      ${answerControl}
    </section>`;
}

function escapeMarkup(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function optionScore(type, answer) {
  if (selectedDynamicTemplate) {
    const questionIndex = selectedAnswers.indexOf(answer);
    const question = selectedDynamicTemplate.questions[questionIndex];
    if (!question || !Array.isArray(answer)) return 0;
    return question.options
      .filter((option) => answer.map(String).includes(String(option.id)))
      .reduce((sum, option) => sum + Number(option.score || 0), 0);
  }
  const option = intakeChecklistDefs[type].options.find((item) => item.label === answer);
  return option ? option.value : 0;
}

function totalScore() {
  if (selectedDynamicTemplate) {
    return selectedAnswers.reduce((sum, answer, index) => {
      const question = selectedDynamicTemplate.questions[index];
      if (!question || !Array.isArray(answer)) return sum;
      return (
        sum +
        question.options
          .filter((option) => answer.map(String).includes(String(option.id)))
          .reduce((optionSum, option) => optionSum + Number(option.score || 0), 0)
      );
    }, 0);
  }
  return selectedAnswers.reduce((sum, answer) => sum + optionScore(selectedChecklistType, answer), 0);
}

function updateScore() {
  updateAnswerProgress();
  $("#workerTotalScore").textContent = totalScore();
  const scoreBox = document.querySelector(".worker-score");
  if (scoreBox) {
    scoreBox.classList.toggle("is-hidden", Boolean(selectedDynamicTemplate && !selectedDynamicTemplate.scoringEnabled));
  }
}

function updateAnswerProgress() {
  const count = selectedAnswers.filter((answer, index) => {
    if (!Array.isArray(answer)) return Boolean(String(answer || '').trim());
    if (!answer.length) return false;
    const question = selectedDynamicTemplate?.questions[index];
    return !question?.options.some(option => option.requiresText && answer.map(String).includes(String(option.id)) && !String(selectedOptionTexts[`${index}:${option.id}`] || '').trim());
  }).length;
  $('#workerAnswerProgress').textContent = `응답 ${count} / 전체 ${selectedAnswers.length}문항`;
}

function fillBirthDateOptions() {
  $("#clientBirthMonthInput").innerHTML =
    '<option value="">월</option>' +
    Array.from({ length: 12 }, (_, index) => {
      const value = String(index + 1).padStart(2, "0");
      return `<option value="${value}">${index + 1}월</option>`;
    }).join("");
  fillBirthDayOptions();
}

function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

function fillBirthDayOptions() {
  const previousDay = $("#clientBirthDayInput").value;
  const year = $("#clientBirthYearInput").value;
  const month = $("#clientBirthMonthInput").value;
  const maxDay = daysInMonth(year, month);
  $("#clientBirthDayInput").innerHTML =
    '<option value="">일</option>' +
    Array.from({ length: maxDay }, (_, index) => {
      const value = String(index + 1).padStart(2, "0");
      return `<option value="${value}">${index + 1}일</option>`;
    }).join("");
  if (previousDay && Number(previousDay) <= maxDay) {
    $("#clientBirthDayInput").value = previousDay;
  }
}

function syncClientBirthInput() {
  const year = $("#clientBirthYearInput").value;
  const month = $("#clientBirthMonthInput").value;
  const day = $("#clientBirthDayInput").value;
  $("#clientBirthInput").value = year.length === 4 && month && day ? `${year}-${month}-${day}` : "";
}

function validateWorkerInfo() {
  if (!$("#workerNameInput").value.trim()) {
    showToast("조사자 이름을 입력해 주세요.");
    return false;
  }
  if (!$("#workerPhoneInput").value.trim()) {
    showToast("조사자 전화번호를 입력해 주세요.");
    return false;
  }
  if (!$("#clientNameInput").value.trim()) {
    showToast("대상자 성명을 입력해 주세요.");
    return false;
  }
  if (!$("#clientGenderInput").value) {
    showToast("대상자 성별을 선택해 주세요.");
    return false;
  }
  if (!$("#clientBirthInput").value) {
    showToast("대상자 생년월일을 생년 4자리, 월, 일 순서로 입력해 주세요.");
    return false;
  }
  return true;
}

async function submitChecklist() {
  if (!selectedChecklistType && !selectedDynamicTemplate) return;
  const unansweredIndex = selectedAnswers.findIndex((answer, index) => {
    if (!selectedDynamicTemplate) return !answer;
    const required = selectedDynamicTemplate.questions[index].required;
    const empty = Array.isArray(answer) ? answer.length === 0 : !String(answer || "").trim();
    return required && empty;
  });
  if (unansweredIndex >= 0) {
    showToast(`${unansweredIndex + 1}번 문항을 선택해 주세요.`);
    return;
  }
  if (selectedDynamicTemplate) {
    const missingExtraText = selectedDynamicTemplate.questions
      .map((question, questionIndex) => {
        const selectedIds = Array.isArray(selectedAnswers[questionIndex])
          ? selectedAnswers[questionIndex].map(String)
          : [];
        const option = question.options.find(
          (item) =>
            item.requiresText &&
            selectedIds.includes(String(item.id)) &&
            !String(selectedOptionTexts[`${questionIndex}:${item.id}`] || "").trim()
        );
        return option ? { questionIndex, option } : null;
      })
      .find(Boolean);
    if (missingExtraText) {
      showToast(`${missingExtraText.questionIndex + 1}번 문항의 '${missingExtraText.option.optionText}' 내용을 입력해 주세요.`);
      return;
    }
  }

  const def = selectedDynamicTemplate ? null : intakeChecklistDefs[selectedChecklistType];
  const submitted = {
    ...(selectedDynamicTemplate
      ? {
          templateId: selectedDynamicTemplate.id,
          answers: selectedDynamicTemplate.questions.map((question, index) => ({
            questionId: question.id,
            value: ["text", "textarea"].includes(question.answerType)
              ? { text: String(selectedAnswers[index] || "").trim() }
              : {
                  optionIds: selectedAnswers[index],
                  optionTexts: Object.fromEntries(
                    question.options
                      .filter((option) => option.requiresText && selectedOptionTexts[`${index}:${option.id}`])
                      .map((option) => [
                        String(option.id),
                        String(selectedOptionTexts[`${index}:${option.id}`]).trim(),
                      ])
                  ),
                },
          })),
        }
      : {
          checklistType: selectedChecklistType,
          answers: selectedAnswers.map((answer, index) => ({
            questionNo: index + 1,
            questionText: def.questions[index],
            answerLabel: answer,
          })),
        }),
    workerName: $("#workerNameInput").value.trim(),
    workerPhone: $("#workerPhoneInput").value.trim(),
    clientName: $("#clientNameInput").value.trim(),
    clientGender: $("#clientGenderInput").value,
    clientBirth: $("#clientBirthInput").value,
    fieldMemo: $("#fieldMemo").value.trim(),
  };

  const submitButton = $("#submitChecklist");
  submitButton.disabled = true;
  submitButton.textContent = "제출 중...";
  try {
    await apiRequest("/submissions", {
      method: "POST",
      body: submitted,
    });
    selectedChecklistType = "";
    selectedDynamicTemplate = null;
    selectedAnswers = [];
    showToast("체크리스트를 제출했습니다.");
    returnToSelect();
  } catch (error) {
    showToast(error.message || "체크리스트를 제출하지 못했습니다.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "제출";
  }
}

function resetClientInfo() {
  ['clientNameInput', 'clientGenderInput', 'clientBirthInput', 'clientBirthYearInput', 'clientBirthMonthInput', 'clientBirthDayInput', 'fieldMemo'].forEach(id => { $(`#${id}`).value = ''; });
  $('#sameAsWorker').checked = false;
  $('#clientNameInput').readOnly = false;
  document.querySelectorAll('.gender-choice').forEach(button => {
    button.classList.remove('is-selected');
    button.setAttribute('aria-checked', 'false');
  });
  fillBirthDayOptions();
  selectedChecklistType = '';
  selectedDynamicTemplate = null;
  selectedAnswers = [];
  selectedOptionTexts = {};
  $('#workerQuestionList').innerHTML = '';
  updateAnswerProgress();
  scrollToWorkerTop();
  $('#clientNameInput').focus();
}

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

async function verifyAgencyPassword() {
  const button = $("#verifyAgencyPassword");
  button.disabled = true;
  button.textContent = "접속 중...";
  try {
    const payload = await apiRequest("/intake/login", {
      method: "POST",
      body: {
        agencyCode: intakeAgency.code,
        password: $("#workerAgencyPassword").value,
      },
    });
    if (payload.agency?.code !== intakeAgency.code) {
      throw new Error("접속 링크와 로그인 기관 정보가 일치하지 않습니다.");
    }
    sessionStorage.setItem(INTAKE_TOKEN_KEY, payload.token);
    sessionStorage.setItem(INTAKE_AGENCY_CODE_KEY, intakeAgency.code);
    await loadDynamicTemplates();
    showStep("#selectStep");
  } catch (error) {
    if (isLocalPreview() && $("#workerAgencyPassword").value === DEFAULT_INTAKE_PASSWORD) {
      sessionStorage.setItem(INTAKE_TOKEN_KEY, "local-preview-token");
      sessionStorage.setItem(INTAKE_AGENCY_CODE_KEY, intakeAgency.code);
      showToast("로컬 테스트 모드로 접속했습니다.");
      showStep("#selectStep");
      return;
    }
    showToast(error.message || "조사자용 접속링크 비밀번호를 확인해 주세요.");
  } finally {
    button.disabled = false;
    button.textContent = "접속하기";
  }
}

$("#verifyAgencyPassword").addEventListener("click", verifyAgencyPassword);

$("#workerAgencyPassword").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  verifyAgencyPassword();
});

$("#checklistPicker").addEventListener("click", (event) => {
  const button = event.target.closest("[data-checklist-type], [data-template-id]");
  if (!button || !validateWorkerInfo()) return;
  if (button.dataset.templateId) {
    renderDynamicQuestions(button.dataset.templateId).catch((error) => showToast(error.message));
    return;
  }
  renderQuestions(button.dataset.checklistType);
});

$("#workerQuestionList").addEventListener("click", (event) => {
  const button = event.target.closest(".worker-option");
  if (!button) return;
  const questionIndex = Number(button.dataset.questionIndex);
  if (selectedDynamicTemplate) {
    const optionId = button.dataset.optionId;
    const multiple = button.dataset.multiple === "true";
    if (multiple) {
      const selected = Array.isArray(selectedAnswers[questionIndex]) ? selectedAnswers[questionIndex] : [];
      selectedAnswers[questionIndex] = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId];
      button.classList.toggle("is-selected", selectedAnswers[questionIndex].includes(optionId));
      if (!selectedAnswers[questionIndex].includes(optionId)) {
        delete selectedOptionTexts[`${questionIndex}:${optionId}`];
      }
    } else {
      selectedAnswers[questionIndex] = [optionId];
      button.closest(".worker-options").querySelectorAll(".worker-option").forEach((option) => option.classList.remove("is-selected"));
      button.classList.add("is-selected");
      Object.keys(selectedOptionTexts)
        .filter((key) => key.startsWith(`${questionIndex}:`) && key !== `${questionIndex}:${optionId}`)
        .forEach((key) => delete selectedOptionTexts[key]);
    }
    button
      .closest(".worker-options")
      .querySelectorAll(".worker-option-text-wrap")
      .forEach((wrap) => {
        const selected = selectedAnswers[questionIndex].map(String).includes(String(wrap.dataset.optionTextWrap));
        wrap.classList.toggle("is-hidden", !selected);
        if (!selected) {
          const input = wrap.querySelector(".worker-option-extra-text");
          if (input) input.value = "";
        }
      });
    updateScore();
    return;
  }
  selectedAnswers[questionIndex] = button.dataset.answer;
  button.parentElement.querySelectorAll(".worker-option").forEach((option) => option.classList.remove("is-selected"));
  button.classList.add("is-selected");
  updateScore();
});

$("#workerQuestionList").addEventListener("input", (event) => {
  const optionTextInput = event.target.closest(".worker-option-extra-text");
  if (optionTextInput) {
    selectedOptionTexts[`${optionTextInput.dataset.questionIndex}:${optionTextInput.dataset.optionId}`] = optionTextInput.value;
    updateAnswerProgress();
    return;
  }
  const input = event.target.closest(".worker-dynamic-text");
  if (!input) return;
  selectedAnswers[Number(input.dataset.questionIndex)] = input.value;
  updateAnswerProgress();
});

document.querySelectorAll(".gender-choice").forEach((button) => {
  button.addEventListener("click", () => {
    $("#clientGenderInput").value = button.dataset.clientGender;
    document.querySelectorAll(".gender-choice").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-checked", String(selected));
    });
  });
});

$("#workerPhoneInput").addEventListener("input", (event) => {
  event.target.value = formatPhoneNumber(event.target.value);
});

$("#clientBirthYearInput").addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
  fillBirthDayOptions();
  syncClientBirthInput();
});

$("#clientBirthMonthInput").addEventListener("change", () => {
  fillBirthDayOptions();
  syncClientBirthInput();
});

$("#clientBirthDayInput").addEventListener("change", syncClientBirthInput);

$('#sameAsWorker').addEventListener('change', () => {
  $('#clientNameInput').readOnly = $('#sameAsWorker').checked;
  if ($('#sameAsWorker').checked) $('#clientNameInput').value = $('#workerNameInput').value.trim();
});
$('#workerNameInput').addEventListener('input', () => {
  if ($('#sameAsWorker').checked) $('#clientNameInput').value = $('#workerNameInput').value.trim();
});
$("#backToSelect").addEventListener("click", returnToSelect);
$("#submitChecklist").addEventListener("click", submitChecklist);
$("#resetClientInfo").addEventListener("click", resetClientInfo);

renderPicker();
fillBirthDateOptions();
initializeIntakeAgency();
