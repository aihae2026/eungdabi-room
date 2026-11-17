/* Final V8/r9 page composition. Data and writes use the existing authenticated API. */
(() => {
  const q = (selector) => document.querySelector(selector);
  const E = escapeMarkup;
  const N = (value) => Number(value || 0);
  const sum = (rows, key) => rows.reduce((n, row) => n + N(row[key]), 0);
  // 확인 대기·완료: 서버가 자체 설문까지 합친 waiting_total/done_total 을 주면 그것을 쓴다.
  // (예전 응답처럼 없으면 기본 3종 칸을 더한다.)
  const waiting = (row) => (row.waiting_total != null ? N(row.waiting_total) : ['fall', 'depression', 'memory'].reduce((n, k) => n + N(row[k + '_waiting']), 0));
  const done = (row) => (row.done_total != null ? N(row.done_total) : ['fall', 'depression', 'memory'].reduce((n, k) => n + N(row[k + '_done']), 0));
  const metric = (label, value, unit, note, action = '') => `<${action ? 'button type="button"' : 'article'} class="v8-metric" ${action}><span>${E(label)}</span><strong>${E(value)}<small>${E(unit)}</small></strong><p>${E(note)}</p></${action ? 'button' : 'article'}>`;
  const panelHeading = (title, desc, action = '') => `<div class="v8-panel-heading"><div><h2>${title}</h2><p>${desc}</p></div>${action}</div>`;
  const link = (view, text) => `<button type="button" class="v8-text-button" data-v8-view="${view}">${text}</button>`;
  let homeState = { key: '', source: null, loading: false, rows: null, forms: null, error: '' };
  let appliedFilters = {};
  let statsErrors = {};
  let anStep = 1, anResult = null, anRecs = [], anLoading = false, anError = '', anCustomOpts = null;
  // STEP 4 결과 분석 상태. key = 로그인한 기관 (계정이 바뀌면 사용 가능 여부·파일·결과를 다시 시작한다)
  // rejected = 받지 않은 파일 안내, requestSeq = 보낸 분석 요청 번호 (늦게 도착한 이전 요청의 답을 버리는 데 쓴다)
  let anReport = { key: '', status: null, statusLoading: false, files: [], rejected: [], loading: false, error: '', result: null, requestSeq: 0 };
  // AI 통계 결과를 만든 로그인 기관. 새로고침 없이 다른 계정으로 로그인하면 이전 기관의 분석 표를 비운다.
  let anOwner = '';
  // STEP 2 'AI에게 추천 더 받기' 상태. seq = 보낸 요청 번호 (추천 목록이 새로 만들어지면 늦게 온 답을 버린다)
  let anAiRec = { loading: false, error: '', rejected: [], warnings: [], count: null, seq: 0 };

  // 집계 및 통계의 '설문 양식' 선택값. 기본 3종은 'fall' 같은 이름, 자체 설문은 'template:<양식 ID>'
  // (app.js 의 checklistTypeOf 와 같은 형식). 자체 설문 목록은 모든 권한이 /stats/templates 로 받는다.
  let statsTemplates = { key: '', list: [], loading: null };
  const anTemplateDetails = new Map();
  let builtinSurveyOptions = '';
  function surveyChoice(value = q('#statsFilterType')?.value || '') {
    return value.startsWith('template:') ? { key: value, type: '', templateId: value.slice(9) } : { key: value, type: value, templateId: '' };
  }
  function surveyLabel(value) {
    const choice = surveyChoice(value);
    if (!choice.key) return '';
    if (choice.templateId) return statsTemplates.list.find((t) => t.id === choice.templateId)?.title || anTemplateDetails.get(choice.templateId)?.title || '자체 설문';
    return checklistDefs[choice.type]?.label || choice.type;
  }
  function renderSurveyOptions() {
    const select = q('#statsFilterType');
    if (!select) return;
    builtinSurveyOptions = '<option value="">전체 설문</option>';
    const current = select.value;
    const custom = statsTemplates.list.map((t) => `<option value="template:${E(t.id)}">${E(t.title)}${t.status === 'closed' ? ' · 종료' : ''}</option>`).join('');
    select.innerHTML = builtinSurveyOptions + (custom ? `<optgroup label="자체 설문">${custom}</optgroup>` : '');
    select.value = [...select.options].some((o) => o.value === current) ? current : '';
  }
  function loadStatsTemplates() {
    const key = agency.code;
    if (statsTemplates.key === key) return statsTemplates.loading || Promise.resolve(statsTemplates.list);
    statsTemplates = { key, list: [], loading: null };
    anTemplateDetails.clear();
    renderSurveyOptions(); // 다른 계정의 목록이 남지 않게 먼저 비운다
    statsTemplates.loading = apiRequest('/stats/templates')
      .then((payload) => { if (statsTemplates.key === key) statsTemplates.list = Array.isArray(payload.templates) ? payload.templates : []; })
      .catch(() => {})
      .finally(() => { if (statsTemplates.key !== key) return; statsTemplates.loading = null; renderSurveyOptions(); });
    return statsTemplates.loading;
  }


  // Move the existing controls without replacing their IDs or bound listeners.
  const toolbar = q('#view-dashboard .toolbar');
  const filterPanel = document.createElement('section');
  filterPanel.className = 'v8-filter-panel';
  q('#view-dashboard').prepend(filterPanel);
  filterPanel.append(toolbar);
  const fieldLabels = {searchInput:'검색',filterSido:'시도',filterSigungu:'시군구',filterAgencyCode:'기관담당자 코드',filterAgencyName:'기관담당자',filterType:'설문',filterStatus:'확인 상태',statsFilterSido:'시도',statsFilterSigungu:'시군구',statsFilterAgencyCode:'기관담당자',statsFilterType:'설문 양식',analysisFilterStatus:'처리 상태 (AI 통계 전용)'};
  document.querySelectorAll('.toolbar').forEach((bar) => {
    [...bar.children].filter((el) => el.matches('input,select')).forEach((el) => {
      const label = document.createElement('label');
      label.className = el.className;
      label.append(document.createTextNode(fieldLabels[el.id] || el.getAttribute('aria-label') || '조회 조건'));
      el.before(label); label.append(el);
      if (el.id === 'searchInput') { label.classList.add('v8-search-field'); bar.prepend(label); }
    });
  });
  const filterActions = document.createElement('div');
  const surveyRowBreak = document.createElement('span');
  surveyRowBreak.className = 'v8-submission-filter-break';
  surveyRowBreak.setAttribute('aria-hidden', 'true');
  q('#filterType').closest('label').before(surveyRowBreak);
  filterActions.className = 'v8-filter-buttons';
  filterActions.innerHTML = '<button type="button" class="primary-button" id="v8QuerySubmissions">조회</button><button type="button" id="v8ResetSubmissions">초기화</button>';
  toolbar.append(filterActions);
  q('#v8QuerySubmissions').addEventListener('click', querySubmissions);
  q('#v8ResetSubmissions').addEventListener('click', () => {
    toolbar.querySelectorAll('input,select').forEach(el => { el.value = ''; });
    refreshSigunguFilter('#filterSido', '#filterSigungu');
    renderDashboard();
  });
  const masterPanel=q('#view-master .regional-master-panel');
  const masterControls=q('#view-master .master-list-controls');
  masterControls.prepend(q('#masterAgencySearch').closest('label'));
  masterControls.append(q('#masterStateFilter').closest('label'));
  masterControls.insertAdjacentHTML('beforeend','<button type="button" id="v8MasterSearch">검색</button>');
  q('#v8MasterSearch').onclick=renderMasterAgencyList;
  const masterResult=document.createElement('div');masterResult.className='v8-master-result';masterResult.append(q('#regionalMasterCount'));
  masterResult.insertAdjacentHTML('beforeend','<button type="button" id="v8ResetMaster">조건 초기화</button>');
  masterControls.after(masterResult);
  q('#v8ResetMaster').onclick=()=>{masterAgencySearchTerm='';masterLevelFilter='all';masterStateFilter='all';q('#masterAgencySearch').value='';q('#masterLevelFilter').value='all';q('#masterStateFilter').value='all';renderMasterAgencyList();};
  const masterActions=document.createElement('div');masterActions.className='v8-master-heading-actions';
  masterActions.append(q('#bulkInstitutionButton'),q('#addInstitutionButton'));q('#v8Header').append(masterActions);
  masterPanel.querySelector('.section-title').hidden=true;
  const statsPanel=q('#view-stats .v8-stats-results');
  const statsTabbar=document.createElement('div');statsTabbar.className='v8-stats-tabbar';
  statsTabbar.append(q('#view-stats .stats-tabs'),q('#exportStatsExcel'));statsPanel.before(statsTabbar);
  const institutionDialog = document.createElement('dialog');
  institutionDialog.id = 'v8InstitutionDetail';
  institutionDialog.className = 'v8-base-dialog';
  institutionDialog.setAttribute('aria-labelledby', 'v8InstitutionTitle');
  institutionDialog.innerHTML = '<div class="v8-panel-heading"><div><h2 id="v8InstitutionTitle">기관 정보·접속 관리</h2><p id="v8InstitutionMeta"></p></div><button type="button" id="v8CloseInstitution">닫기</button></div><div class="v8-institution-tabs" role="tablist" aria-label="기관 상세"><button type="button" data-v8-institution-tab="0" role="tab" aria-selected="true">기관 정보</button><button type="button" data-v8-institution-tab="1" role="tab" aria-selected="false">조사자용 제출 링크</button><button type="button" data-v8-institution-tab="2" role="tab" aria-selected="false">비밀번호 관리</button></div>';
  const panels = [...q('#view-master .page-grid').children].filter(el => !el.classList.contains('regional-master-panel'));
  const linkPanel = document.createElement('section'); linkPanel.className = 'panel';
  linkPanel.innerHTML = '<h3>조사자용 제출 링크</h3><p id="v8LinkContext"></p><div id="v8ChildLinks"></div>';
  linkPanel.append(q('#masterUrl').closest('label'), panels[0].querySelector('.notice-box'));
  const accessPanel = document.createElement('section'); accessPanel.className = 'panel';
  accessPanel.append(panels[1], panels[2]);
  [panels[0], linkPanel, accessPanel].forEach((panel,index) => {
    panel.dataset.institutionPanel = index; panel.setAttribute('role','tabpanel');
    panel.id = 'v8-institution-panel-' + index;
    const tab = institutionDialog.querySelector(`[data-v8-institution-tab="${index}"]`);
    tab.id = 'v8-institution-tab-' + index; tab.setAttribute('aria-controls',panel.id);
    panel.setAttribute('aria-labelledby',tab.id); panel.hidden = index !== 0; institutionDialog.append(panel);
  });
  document.body.append(institutionDialog);
  for (const id of ['currentPassword','currentIntakePassword']) q('#' + id).closest('label').hidden = true;
  panels[0].insertAdjacentHTML('beforeend','<div id="v8InstitutionActions" class="button-row"></div>');
  document.body.append(institutionDialog);
  const passwordDraft = () => ['newPassword','confirmPassword','newIntakePassword','confirmIntakePassword'].some(id => q('#'+id).value);
  function closeInstitutionSurface() {
    if (passwordDraft() && !window.confirm('입력 중인 비밀번호를 버리고 닫을까요?')) return;
    ['newPassword','confirmPassword','newIntakePassword','confirmIntakePassword'].forEach(id => {q('#'+id).value = '';});
    institutionDialog.close();
  }
  q('#v8CloseInstitution').addEventListener('click',closeInstitutionSurface);
  institutionDialog.addEventListener('cancel',event => {event.preventDefault(); closeInstitutionSurface();});
  function institutionSurface() {
    const target = masterTargetInstitution();
    q('#v8InstitutionTitle').textContent = target.name;
    const parent = institutionMaster.find(o => o.code === target.parentCode);
    q('#v8InstitutionMeta').textContent = `${target.code} · ${target.type === 'regional' ? '광역관리자' : '기관담당자'} · ${parent?.name || '소속 기관'} · ${target.active ? '사용 중' : '사용 중지'}`;
    q('#masterInstitutionStatus').textContent = target.active ? '사용 중' : '사용 중지';
    q('#v8LinkContext').textContent = target.type === 'agency' ? '이 기관에 제출할 조사자용 링크입니다.' : '조사자용 제출은 기관담당자를 선택해 주세요.';
    q('#masterUrl').closest('label').hidden = target.type !== 'agency';
    linkPanel.querySelector('.notice-box').hidden = target.type !== 'agency';
    q('#v8ChildLinks').innerHTML = target.type === 'regional' ? institutionMaster.filter(o => o.type === 'agency' && o.parentCode === target.code).map(o => `<button type="button" data-v8-child="${E(o.code)}">${E(o.name)} 링크 확인 →</button>`).join('') || '<p>소속 기관담당자가 없습니다.</p>' : '';
    panels[2].hidden = target.type !== 'agency';
    q('#v8InstitutionActions').innerHTML = ((canManageInstitution(target) || target.code === agency.code) ? '<button type="button" data-v8-edit-org>기관 정보 수정</button>' : '') + (canManageInstitution(target) ? `<button type="button" data-v8-state-org>${target.active ? '사용 중지' : '사용 재개'}</button>` : '') + '<p class="v8-muted">사용 상태를 변경해도 기존 제출은 보존됩니다. 하위 기관의 상태는 일괄 변경하지 않습니다.</p>';
  }
  q('#institutionDialog').addEventListener('close', () => {if(institutionDialog.open) institutionSurface();});
  function institutionTab(index) {
    institutionDialog.querySelectorAll('[data-institution-panel]').forEach(panel => {panel.hidden = panel.dataset.institutionPanel !== index;});
    institutionDialog.querySelectorAll('[data-v8-institution-tab]').forEach(tab => {tab.setAttribute('aria-selected',String(tab.dataset.v8InstitutionTab === index));});
  }
  const ownInfo = document.createElement('section');
  ownInfo.className = 'v8-own-institution';
  ownInfo.innerHTML = '<h2>우리 기관 정보·접속 관리</h2><p>기관 정보와 조사자용 제출 링크를 확인하세요.</p><button type="button" data-v8-institution-open>내 기관 정보·접속</button>';
  q('#view-master').append(ownInfo);

  function home() {
    if (!isAuthenticated()) return;
    const key = agency.code;
    if (homeState.key !== key || homeState.source !== homeSummaryData) {
      homeState = { key, source: homeSummaryData, loading: true, rows: null, forms: null, error: '' };
      const state = homeState;
      Promise.all([apiRequest('/stats?view=overview'), apiRequest(isCentralRole() ? '/checklist-templates' : '/home-templates')])
        .then(([stats, templates]) => { if (homeState !== state) return; state.rows = stats.rows || []; state.forms = templates?.templates || []; })
        .catch((error) => { if (homeState === state) state.error = error.message || '자료를 불러오지 못했습니다.'; })
        .finally(() => { if (homeState === state) { state.loading = false; home(); renderMasterAgencyList(); } });
    }
    const central = isCentralRole();
    const agencies = scopedAgencies();
    const regions = institutionMaster.filter((o) => o.type === 'regional');
    const orgs = central ? [...regions, ...agencies] : agencies;
    const rows = homeState.rows || [];
    const drafts = (homeState.forms || []).filter((f) => f.status === 'draft');
    const active = (homeState.forms || []).filter((f) => f.status === 'active');
    const ready = !homeState.loading && !homeState.error;
    const value = (n) => ready ? String(n) : '—';
    q('#homeSummaryGrid').innerHTML = central
      ? metric('관리 대상 기관', orgs.length, '개', `광역관리자 ${regions.length}개 · 기관담당자 ${agencies.length}개`, 'data-v8-view="master"') + metric('운영 중인 설문', value(active.length), '개', '직접 작성 및 AI 활용 설문', 'data-v8-forms="active"') + metric('작성 중인 초안', value(drafts.length), '개', '내용 검토 후 운영 여부 결정', 'data-v8-forms="draft"')
      : metric(isRegionalRole() ? '소속 기관담당자' : '전체 접수', isRegionalRole() ? agencies.length : value(sum(rows, 'total')), isRegionalRole() ? '개' : '건', isRegionalRole() ? `사용 중 ${agencies.filter((o) => o.active).length}개` : '우리 기관에 제출된 설문', 'data-v8-view="dashboard"') + metric(isRegionalRole() ? '전체 접수' : '확인 완료', value(isRegionalRole() ? sum(rows, 'total') : rows.reduce((n, r) => n + done(r), 0)), '건', isRegionalRole() ? '전체 기간 · 접수 기록' : '모든 설문 기준', 'data-v8-view="stats"') + metric('확인 대기', value(rows.reduce((n, r) => n + waiting(r), 0)), '건', '모든 설문 · 검토가 남은 기록', 'data-v8-pending');
    const tableTitle = central ? '광역관리자별 기관·접수 현황' : isRegionalRole() ? '기관담당자별 진행 현황' : '최근 제출 현황';
    const groups = central ? regions : agencies;
    let content;
    if (homeState.error) content = `<div class="v8-empty" role="alert"><h3>자료를 불러오지 못했습니다</h3><p>${E(homeState.error)}</p><button type="button" data-v8-home-retry>다시 불러오기</button></div>`;
    else if (homeState.loading) content = '<p class="v8-empty" role="status">기관과 접수 현황을 불러오는 중입니다.</p>';
    else if (isAgencyRole()) content = `<div class="table-wrap"><table><thead><tr><th>설문</th><th>대상자</th><th>접수일</th><th>상세</th></tr></thead><tbody>${recentHomeSubmissions().map((r) => `<tr><td>${E(checklistDefOf(r).label)}</td><td>${E(r.clientName || '—')}</td><td>${E(r.date)}</td><td><button data-v8-detail="${E(r.id)}">응답 보기</button></td></tr>`).join('') || '<tr><td colspan="4">최근 제출된 설문이 없습니다.</td></tr>'}</tbody></table></div>`;
    else content = `<div class="table-wrap"><table><thead><tr><th>${central ? '광역관리자' : '기관담당자'}</th>${central ? '<th>기관담당자</th>' : ''}<th>전체 접수</th><th>확인 완료</th><th>확인 대기</th></tr></thead><tbody>${groups.map((o) => {
      const children = central ? agencies.filter((a) => a.parentCode === o.code) : [o];
      const selected = rows.filter((r) => children.some((a) => a.code === r.institution_code));
      const total = sum(selected, 'total'), completed = selected.reduce((n, r) => n + done(r), 0), pending = selected.reduce((n, r) => n + waiting(r), 0);
      return `<tr><td><strong>${E(o.name)}</strong><small>${E(o.code)}</small></td>${central ? `<td>${children.length}개</td>` : ''}<td>${total}건</td><td>${completed}건<div class="v8-progress"><span style="width:${total ? Math.min(100, completed / total * 100) : 0}%"></span></div></td><td><span class="state waiting">${pending}건 대기</span></td></tr>`;
    }).join('') || `<tr><td colspan="5">등록된 소속 기관이 없습니다.</td></tr>`}</tbody></table></div>`;
    const surveyList = homeState.loading ? '<p class="v8-empty" role="status">운영 중인 설문을 불러오는 중입니다.</p>'
      : homeState.error ? '<p class="v8-empty" role="alert">설문 목록을 불러오지 못했습니다.</p><button type="button" data-v8-home-retry>다시 불러오기</button>'
      : active.map(f => `<div class="v8-queue-item"><h3>${E(f.title)}</h3><span class="state active">운영 중</span>${f.description ? `<p>${E(f.description)}</p>` : ''}${central ? `<button type="button" class="v8-text-button" data-v8-template="${E(f.id)}">설문 내용 보기 →</button>` : ''}</div>`).join('') || '<p class="v8-empty">제출 대상 범위에 해당하는 운영 중인 설문이 없습니다.</p>';
    q('#v8HomeBody').innerHTML = `<div class="v8-overview-grid"><section class="v8-home-table">${panelHeading(tableTitle, '전체 기간 · 접수 기록 기준', link('master', '기관 관리 →'))}${content}<p class="v8-notice">확인 대기·완료 수는 자체 설문을 포함한 모든 제출건 기준입니다. 확인 완료는 위험 해소를 뜻하지 않습니다.</p></section><aside class="v8-queue">${panelHeading('운영 중인 설문', central ? '전체 제출 대상의 운영 중인 설문입니다.' : isRegionalRole() ? '관할 기관담당자가 제출할 수 있는 설문입니다.' : '우리 기관이 제출할 수 있는 설문입니다.')}${surveyList}</aside></div>`;
  }

  function templates() {
    if (checklistTemplatesLoaded && homeState.key === agency.code) homeState.forms = checklistTemplates;
    const all = checklistTemplates;
    const visible = all.filter((f) => !templateStatusFilter || f.status === templateStatusFilter);
    q('#v8FormsCount').textContent = all.length;
    document.querySelectorAll('[data-template-status]').forEach((b) => {
      const status = b.dataset.templateStatus;
      b.innerHTML = `${{'':'전체',draft:'작성 중',active:'운영 중',closed:'종료'}[status]} <span>${all.filter((f) => !status || f.status === status).length}</span>`;
      b.classList.toggle('is-active', status === templateStatusFilter);
      b.setAttribute('aria-pressed', String(status === templateStatusFilter));
    });
    q('#templateList').innerHTML = visible.map((f) => `<article class="v8-form-row"><div><h3>${E(f.title)}</h3><p>${f.generationMethod === 'manual' ? '직접 작성' : 'AI 활용 작성'} · ${E(f.targetAudience || '응답 대상 미지정')} · ${f.questions?.length ?? f.questionCount ?? '—'}문항</p></div><span class="state ${templateStatusClass(f.status)}">${{active:'운영 중',draft:'작성 중',closed:'종료'}[f.status] || E(f.status)}</span><button type="button" data-template-id="${E(f.id)}">${f.status === 'draft' ? '이어서 작성' : '내용 보기'} →</button></article>`).join('') || '<p class="v8-empty">조건에 맞는 설문 양식이 없습니다.</p>';
  }

  function stats() {
    const view = activeStatsTab, result = statsResults[view];
    const statsError = statsErrors[view] || "";
    document.querySelectorAll('.stats-tab').forEach((b) => { b.classList.toggle('is-active', b.dataset.statsTab === view); b.setAttribute('aria-selected', String(b.dataset.statsTab === view)); });
    // 기관담당자 계정은 본인 기관만 보이므로 '기관담당자명으로 찾기'가 필요 없다.
    const findHidden = view !== 'overview' || isAgencyRole();
    q('#v8StatsFindLabel').hidden = findHidden;
    q('#v8StatsFindNote').hidden = findHidden;
    q('#statsTableWrap').hidden = view === 'ai';
    q('#v8Analysis').hidden = view !== 'ai';
    // 통계 Excel은 제출 현황·관리구분 분포에서만 내려받는다.
    q('#exportStatsExcel').hidden = view === 'ai';
    // 조회 조건 패널은 세 탭이 그대로 공유한다. '처리 상태'는 지금 AI 통계에만 효력이 있어
    // 라벨과 패널 아래 안내문으로 그 사실을 밝힌다 (#statsStatusNote).
    // AI 통계 탭은 /stats 집계가 아니라 4단계 분석 마법사를 쓴다. 조회 조건은 위 패널을 그대로 공유한다.
    if (view === 'ai') {
      anResetForAccount();
      q('#v8StatsResultTitle').textContent = 'AI 통계 · 4단계 분석';
      q('#v8StatsResultDescription').textContent = '위 조회 조건을 그대로 사용합니다. 계산은 코드가 하고, 분석 기준은 규칙으로 추천합니다. AI는 원할 때 받는 추가 추천(STEP 2)과 결과 분석(STEP 4)에만 씁니다.';
      q('#exportStatsExcel').disabled = true;
      q('#v8StatsSummary').hidden = true;
      q('#statsTableNote').textContent = '';
      anRender();
      return;
    }
    q('#exportStatsExcel').disabled = !result || statsDirty[view] || statsLoading[view] || Boolean(statsError);
    q('#v8StatsSummary').hidden = view === 'distribution';
    if (view === 'distribution') {
      q('#v8StatsResultTitle').textContent = '설문별 관리구분 분포';
      q('#v8StatsResultDescription').textContent = '제출 당시 저장된 판정 결과입니다. 다른 설문의 구간과 합산하지 않습니다.';
      q('#statsHead').innerHTML = '<tr><th>관리구분</th><th>제출 건수</th></tr>';
      q('#statsRows').innerHTML = result?.managementEnabled ? result.rows.map(r => `<tr><td>${E(r.management_label)}</td><td>${N(r.total)}건</td></tr>`).join('') || '<tr><td colspan="2">제출 기록이 없습니다.</td></tr>' : '<tr><td colspan="2">관리구분을 사용하는 설문을 선택하고 조회해 주세요.</td></tr>';
      q('#statsTableNote').textContent = statsError || (statsDirty[view] ? '조회 조건을 선택한 후 조건 적용을 눌러 주세요.' : '');
      return;
    }
    const rows = result ? V8Data.scopeStats(result.rows || [], scopedAgencies(), appliedFilters[view] || {}) : [];
    q('#v8StatsSummary').innerHTML = metric('제출 기관담당자', result ? rows.filter((r) => N(r.total) > 0).length : '—', result ? ` / ${rows.length}개` : '', '제출한 기관담당자 수') + metric('제출 건수', result ? sum(rows, 'total') : '—', '건', '한 사람의 여러 설문은 각각 집계') + metric('대상자 수', result ? sum(rows, 'unique_clients') : '—', '명', '관리번호가 부여된 대상자 수') + metric('확인 대기', result ? rows.reduce((n, r) => n + waiting(r), 0) : '—', '건', '확인 완료 미처리 건수');
    const skippedNote = result?.templateStatusSkipped ? ' · 자체 설문 제출건이 너무 많아 확인 대기·완료에는 기본 설문만 반영했습니다. 기간이나 기관을 좁히면 모두 반영됩니다.' : '';
    q('#statsTableNote').textContent = statsError || (statsDirty[view] && result ? '조건이 변경되었습니다. 조건 적용을 눌러 결과를 갱신하세요.' : result ? `조회 시각: ${formatSubmittedAt(result.queriedAt)}${skippedNote}` : '');
    q('#v8StatsResultTitle').textContent = '제출 현황';
    q('#v8StatsResultDescription').textContent = '';
    if (statsLoading[view] || !result || statsError) {
      const message = statsLoading[view] ? '집계 데이터를 조회하고 있습니다.' : statsError || '조회 조건을 선택한 후 조건 적용을 눌러 주세요.';
      q('#statsHead').innerHTML = '<tr><th>조회 상태</th></tr>';
      q('#statsRows').innerHTML = `<tr><td class="v8-empty" role="status">${E(message)}</td></tr>`;
      q('#v8StatsSummary').hidden = Boolean(statsError);
      return;
    }
    q('#v8StatsSummary').hidden = false;
    q('#statsHead').innerHTML = '<tr><th>기관담당자</th><th>제출 건수</th><th>대상자 수</th><th>확인 대기</th><th>확인 완료</th><th>제출 상세</th></tr>';
    const query = findHidden ? '' : q('#v8StatsFind').value.trim().toLowerCase();
    const filtered = rows.filter((r) => `${r.institution_name} ${r.institution_code}`.toLowerCase().includes(query));
    q('#statsRows').innerHTML = filtered.map((r) => `<tr><td><strong>${E(r.institution_name)}</strong><small>${E(r.institution_code)}</small></td><td>${N(r.total)}건</td><td>${N(r.unique_clients)}명</td><td>${waiting(r)}건</td><td>${done(r)}건</td><td><button type="button" data-v8-stat-agency="${E(r.institution_code)}">제출 보기</button></td></tr>`).join('') || '<tr><td colspan="6" class="v8-empty">조건에 맞는 기관이 없습니다.</td></tr>';
  }

  // ── 분석 화면 (STEP 1 대상 설정 → 2 기준 검토 → 3 통계 결과 → 4 결과 분석) ──
  // 계산은 서버(POST /analysis/run)의 코드가 하고, 여기서는 조건을 모아 보내고 표로 그린다.
  const AN_DIM_LABEL = { age: '연령대', score: '총점 구간', question: '문항 응답별', gender: '성별', institution: '기관담당자별', sigungu: '시군구', status: '처리 상태', month: '조사 월', all: '전체' };
  // 총점 구간 기본 경계값은 집계 DB 함수(admin_submission_stats)가 쓰는 위험 구간과 같은 기준으로 맞춘다.
  const AN_RISK_BOUNDS = { fall: [26, 60], depression: [5, 10, 20], memory: [6] };
  const AN_RISK_NAMES = { fall: '저위험 · 중위험 · 고위험', depression: '우울아님 · 가벼운 우울 · 중간정도의 우울 · 심한 우울', memory: '정상 · 위험군' };
  const AN_AGE_BOUNDS = [75, 85];

  // 설문 양식에 정해진 위험 구간이 있으면 그것을, 없으면 관측된 총점 범위를 3등분한다.
  function anScoreBounds(type, summary) {
    const template = statsTemplates.list.find(t => `template:${t.id}` === type);
    if (template?.managementEnabled) return template.managementBands.slice(1).map(b => b.min);
    if (AN_RISK_BOUNDS[type]) return AN_RISK_BOUNDS[type].slice();
    const min = summary?.minScore, max = summary?.maxScore;
    if (min == null || max == null || max - min < 3) return [];
    const step = (max - min) / 3;
    return [Math.round(min + step), Math.round(min + step * 2)];
  }

  // 총점 구간이 이 설문의 검증된 위험 구간인지. 자체 설문의 3등분이나 경계값을 바꾼 구간은 위험 수준이 아니라 참고 구간이다.
  const AN_REFERENCE_BAND_NOTE = '총점 구간은 점수 범위를 나눈 참고 구간입니다 (검증된 위험 기준 아님).';
  function anScoreBandsValidated(key, dim) {
    const bounds = AN_RISK_BOUNDS[surveyChoice(key).type];
    const actual = [...new Set((dim?.boundaries || []).map(Number))].sort((a, b) => a - b);
    return Boolean(bounds) && actual.length === bounds.length && actual.every((value, i) => value === bounds[i]);
  }
  const anUsesScore = (spec) => [spec.row, spec.col].some((dim) => dim?.kind === 'number_bins' && dim.field === 'score');

  function anDim(kind, opts = {}) {
    if (kind === 'age') return { kind: 'number_bins', field: 'age', boundaries: opts.ageBounds || AN_AGE_BOUNDS.slice() };
    if (kind === 'score') return { kind: 'number_bins', field: 'score', boundaries: opts.scoreBounds || [] };
    if (kind === 'question') return { kind: 'question', questionNo: String(opts.questionNo || 1) };
    if (kind === 'all' || kind === 'month') return { kind };
    return { kind: 'attribute', field: kind };
  }
  function anDimKind(dim) {
    if (dim.kind === 'number_bins') return dim.field === 'age' ? 'age' : 'score';
    if (dim.kind === 'attribute') return dim.field;
    return dim.kind;
  }
  function anDimLabel(dim) {
    if (dim.kind === 'question') return `문항 ${dim.questionNo} 응답`;
    return AN_DIM_LABEL[anDimKind(dim)] || anDimKind(dim);
  }
  function anSpecTitle(spec) { return `${anDimLabel(spec.row)} × ${anDimLabel(spec.col)}`; }

  // 조회 조건은 [집계 및 통계] 위쪽 패널 하나만 쓴다. 차이 나는 '처리 상태'만 그 패널에 추가돼 있다.
  function anFilters() {
    const survey = surveyChoice();
    return {
      checklistType: survey.type || undefined,
      templateId: survey.templateId || undefined,
      status: q('#analysisFilterStatus').value === 'completed' ? 'completed' : 'all',
      sido: q('#statsFilterSido').value || undefined,
      sigungu: q('#statsFilterSigungu').value || undefined,
      agencyCode: q('#statsFilterAgencyCode').value || undefined,
      startDate: q('#statsFilterStartDate').value || undefined,
      endDate: q('#statsFilterEndDate').value || undefined,
    };
  }
  function anCondRows() {
    const f = anFilters();
    const agencyName = f.agencyCode ? institutionMaster.find((o) => o.code === f.agencyCode)?.name || f.agencyCode : '';
    return [
      ['설문지', surveyLabel(surveyChoice().key) || '설문 양식 미선택', !surveyChoice().key],
      ['분석 대상 기간', f.startDate || f.endDate ? `${f.startDate || '처음'} ~ ${f.endDate || '현재'}` : '전체 기간', false],
      ['기관담당자 범위', agencyName || f.sigungu || f.sido || (isAgencyRole() ? agency.name : '전체 기관담당자'), false],
      ['처리 상태', f.status === 'completed' ? '확인 완료 건만 (대상자ID 입력·검토가 끝난 건)' : '전체 (확인 대기 + 확인 완료)', false],
    ];
  }
  function anRun(specs) { return apiRequest('/analysis/run', { method: 'POST', body: { ...anFilters(), specs } }); }

  // 분석에 쓸 수 있는 문항 [{ no, text, multi }].
  // 자체 설문은 선택형(단일·복수)만 쓴다. 서술형은 사람마다 문장이 달라 칸으로 나눌 수 없고 개인정보가 섞일 수 있다.
  function anQuestions(key = surveyChoice().key) {
    const survey = surveyChoice(key);
    if (survey.templateId) {
      return (anTemplateDetails.get(survey.templateId)?.questions || [])
        .filter((question) => ['single_choice', 'multiple_choice'].includes(question.answerType))
        .map((question) => ({ no: String(question.questionNo), text: question.questionText, multi: question.answerType === 'multiple_choice' }));
    }
    return (checklistDefs[survey.type]?.questions || []).map((text, i) => ({ no: String(i + 1), text, multi: false }));
  }
  function anQuestionShort(key, questionNo) {
    const question = anQuestions(key).find((item) => item.no === String(questionNo));
    if (!question) return `문항 ${questionNo}`;
    return `문항 ${questionNo}${question.multi ? '(복수 선택)' : ''} · ${question.text.length > 26 ? question.text.slice(0, 26) + '…' : question.text}`;
  }
  // 문항 응답을 기준(행·열)으로 쓴 표는 제목의 '문항 N'만으로는 어떤 문항인지 알 수 없어,
  // STEP 3 표 제목 아래와 CSV에 문항 전체 문구를 한 줄씩 붙인다. 예: "행 · 문항 3: 야간 조명은 충분한가요?"
  function anQuestionLines(spec, surveyKey) {
    const questions = anQuestions(surveyKey);
    return [['row', '행'], ['col', '열']].flatMap(([axis, name]) => {
      const dim = spec?.[axis];
      if (dim?.kind !== 'question') return [];
      const question = questions.find((item) => item.no === String(dim.questionNo));
      return question ? [`${name} · 문항 ${question.no}${question.multi ? '(복수 선택)' : ''}: ${question.text}`] : [];
    });
  }
  // 기본 3종은 늘 총점이 있다. 자체 설문은 배점을 쓰는 양식일 때만 '총점 구간'이 의미가 있다.
  function anHasScore(key) {
    const survey = surveyChoice(key);
    return survey.templateId ? Boolean(anTemplateDetails.get(survey.templateId)?.scoringEnabled) : Boolean(survey.type);
  }

  // STEP 2 의 분석 기준 추천 (규칙 기반).
  // 고정 목록이 아니라 ① 선택한 설문 양식의 문항·위험 구간과 ② 이 조건으로 실제 읽어 온
  // 데이터(probe: 요약 + 문항별 응답률)를 함께 보고 기준을 만든다. 쓸모없는 기준은 빼고,
  // 문항 기준은 응답률이 높은 실제 문항을 고른다.
  // AI 추천(POST /analysis/recommend)은 이 규칙 추천을 바꾸지 않고 목록 끝에 덧붙인다 (anRequestAiRecs).
  function anBuildRecs(key, probe) {
    const s = probe.summary || {};
    const questions = anQuestions(key);
    const usable = new Set(questions.map((question) => question.no));
    // 이 조건에서 응답이 한 가지뿐인 문항은 표의 축으로 쓰면 한 칸짜리 표가 되어 나눠 볼 것이 없다.
    const rates = (probe.itemRates || []).filter((item) => (!questions.length || usable.has(String(item.questionNo))) && (item.distribution?.length ?? 2) > 1);
    const hasScore = anHasScore(key);
    const scoreBounds = anScoreBounds(key, s);
    const cells = ['count', 'pct'];
    const opts = { scoreBounds, ageBounds: AN_AGE_BOUNDS.slice(), questionNo: rates[0]?.questionNo || questions[0]?.no || '1' };
    const validatedBands = Boolean(AN_RISK_BOUNDS[key]);
    const bandNote = validatedBands ? ` 구간은 이 설문의 위험 구간(${AN_RISK_NAMES[key]})과 같은 기준입니다.` : ` ${AN_REFERENCE_BAND_NOTE}`;
    const rateText = (rate) => `"${rate.primaryLabel}" 응답이 ${rate.primaryRate}%${rate.multi ? '(응답자 대비)' : ''}`;
    // 배점을 쓰지 않는 자체 설문은 총점이 모두 0이라 '총점 구간'이 쓸모없다. 가장 두드러진 문항을 기준 축으로 쓴다.
    const measure = hasScore ? anDim('score', opts) : rates[0] ? anDim('question', { questionNo: rates[0].questionNo }) : null;
    const measureText = hasScore ? '총점' : '이 문항 응답';
    const recs = [];

    if (s.ageKnown > 0 && measure) {
      recs.push({ id: 'r-age', checked: true,
        why: `응답 ${s.n}건 중 ${s.ageKnown}건에서 나이를 계산할 수 있습니다. 연령과 ${hasScore ? '총점' : `${anQuestionShort(key, rates[0].questionNo)} 응답`}의 관계를 먼저 봅니다.${hasScore ? bandNote : ''}`,
        spec: { row: anDim('age', opts), col: measure, cells } });
    }
    if (rates[0] && hasScore) {
      recs.push({ id: 'r-item1', checked: true,
        why: `${anQuestionShort(key, rates[0].questionNo)} 의 ${rateText(rates[0])} 로 이 설문에서 가장 높습니다. ${validatedBands ? '위험 수준별로' : '총점 참고 구간별로'} 이 항목이 얼마나 흔한지 봅니다.`,
        spec: { row: anDim('score', opts), col: anDim('question', { questionNo: rates[0].questionNo }), cells } });
    }
    if (rates[1] && s.ageKnown > 0) {
      recs.push({ id: 'r-item2', checked: !hasScore,
        why: `${anQuestionShort(key, rates[1].questionNo)} 의 ${rateText(rates[1])} 로 두 번째로 높습니다. 연령대별로 나눠 봅니다.`,
        spec: { row: anDim('age', opts), col: anDim('question', { questionNo: rates[1].questionNo }), cells } });
    }
    if (s.institutionCount > 1 && measure) {
      recs.push({ id: 'r-inst', checked: false,
        why: `이 조건에 기관담당자가 ${s.institutionCount}개 있습니다. 기관담당자별 ${measureText}을 봅니다. 기관담당자 단위 현황 파악·업무 배분에 유용합니다.`,
        warn: '기관담당자 간 차이는 이용자 구성 차이일 수 있어 기관담당자의 특성으로 해석할 수 없습니다.',
        spec: { row: anDim('institution'), col: measure, cells } });
    }
    if (s.genderKnown > 0 && measure) {
      recs.push({ id: 'r-gender', checked: false,
        why: `성별이 기록된 건이 ${s.genderKnown}건입니다.`,
        warn: '성별 분포가 치우친 조사에서는 참고용으로만 보세요.',
        spec: { row: anDim('gender'), col: measure, cells } });
    }
    if (s.monthCount > 1 && measure) {
      recs.push({ id: 'r-month', checked: false,
        why: `조사 시점이 ${s.monthCount}개 월에 걸쳐 있습니다. 시기별 추이를 봅니다.`,
        warn: '월별 건수가 고르지 않으면 추이로 읽기 어렵습니다. 합계를 함께 보세요.',
        spec: { row: anDim('month'), col: measure, cells } });
    }
    // 어떤 조건도 맞지 않는 데이터라면 최소한 분포 하나는 낸다.
    if (!recs.length && (hasScore || rates[0])) {
      const only = hasScore ? anDim('score', opts) : anDim('question', { questionNo: rates[0].questionNo });
      recs.push({ id: 'r-score', checked: true, why: `이 조건에서는 나눠 볼 수 있는 항목이 없어 ${hasScore ? '총점' : '문항 응답'} 분포만 냅니다.${hasScore ? bandNote : ''}`,
        spec: { row: only, col: anDim('all'), cells } });
    }
    // 배점도, 응답이 나뉘는 선택형 문항도 없는 설문(서술형만 있는 설문 등). 총점 표는 전부 0점이라 뜻이 없으니 응답 수만 낸다.
    if (!recs.length) {
      recs.push({ id: 'r-count', checked: true, why: '이 설문에는 배점이나 응답이 나뉘는 선택형 문항이 없어 응답 수만 냅니다. 서술형 답은 사람마다 문장이 달라 표로 나누지 않습니다.',
        spec: { row: anDim('all'), col: anDim('all'), cells: ['count'] } });
    }
    recs.forEach((rec) => {
      if (!validatedBands && anUsesScore(rec.spec) && !rec.why.includes(AN_REFERENCE_BAND_NOTE)) rec.why += ` ${AN_REFERENCE_BAND_NOTE}`;
      rec.opts = anOptsFromSpec(rec.spec, opts);
    });
    return recs;
  }

  // 행·열이 바뀌어도 직전에 쓰던 세부 설정(경계값·문항)을 기억해 둔다.
  // 행과 열은 서로 독립이다 — 행=문항A × 열=문항B 처럼 같은 종류를 양쪽에 둘 수 있어야 한다.
  function anAxisOpts(dim, seed) {
    const isScore = dim.kind === 'number_bins' && dim.field === 'score';
    const isAge = dim.kind === 'number_bins' && dim.field === 'age';
    return {
      scoreBounds: (isScore ? dim.boundaries : seed?.scoreBounds || []).slice(),
      ageBounds: (isAge ? dim.boundaries : seed?.ageBounds || AN_AGE_BOUNDS).slice(),
      questionNo: String(dim.kind === 'question' ? dim.questionNo : seed?.questionNo || '1'),
    };
  }
  function anOptsFromSpec(spec, seed) {
    return { row: anAxisOpts(spec.row, seed), col: anAxisOpts(spec.col, seed) };
  }
  function anCloneOpts(opts) { return { row: { ...opts.row, scoreBounds: opts.row.scoreBounds.slice(), ageBounds: opts.row.ageBounds.slice() }, col: { ...opts.col, scoreBounds: opts.col.scoreBounds.slice(), ageBounds: opts.col.ageBounds.slice() } }; }

  // 기관 차원은 기관코드로 집계된다(집계 함수가 받는 필드가 institution). 화면에는 기관 이름을 함께 보여 준다.
  function anLabelText(dim, label) {
    if (dim && dim.kind === 'attribute' && dim.field === 'institution') {
      const found = institutionMaster.find((o) => o.code === label);
      if (found) return `${found.name} (${label})`;
    }
    return label;
  }

  // 숫자가 0으로 가득 찬 표는 "0명"과 "집계할 수 없음"을 구분해 주지 못한다.
  // 통계 화면에서 그 둘을 헷갈리면 안 되므로, 나눌 값이 없거나 전부 제외된 경우는
  // 빈 격자 대신 이유를 밝힌다.
  function anEmptyTableHtml(table) {
    const name = (axis) => (table.spec?.[axis] ? anDimLabel(table.spec[axis]) : axis === 'row' ? '행' : '열');
    if (!table.rowLabels.length || !table.colLabels.length) {
      const axis = !table.rowLabels.length ? 'row' : 'col';
      return `<p class="v8-empty"><b>${E(name(axis))}</b>(${axis === 'row' ? '행' : '열'})에 값이 기록된 응답이 없어 표를 만들 수 없습니다.<br>다른 기준을 고르거나 위 <b>조회 조건</b>의 범위를 넓혀 보세요.</p>`;
    }
    if (!table.grandTotal) {
      const reason = table.droppedRecords
        ? `응답 <b>${table.droppedRecords}건</b>이 모두 <b>${E(name('row'))}</b> 또는 <b>${E(name('col'))}</b> 값이 없어 집계에서 빠졌습니다.`
        : '이 조회 조건에 해당하는 응답이 없습니다.';
      return `<p class="v8-empty">집계할 수 있는 응답이 없습니다.<br>${reason}</p>`;
    }
    return '';
  }

  function anTableHtml(table) {
    const empty = anEmptyTableHtml(table);
    if (empty) return empty;
    const cell = (c) => `${c.count}${c.pct != null ? ` (${c.pct}%)` : ''}${c.mean != null ? ` · 평균 ${c.mean}` : ''}`;
    // 복수 선택이 들어 있으면 한 사람이 여러 칸에 셀 수 있다. 오른쪽 끝·아래 '전체'는 칸의 합이 아니라 사람 수다.
    const multi = Boolean(table.rowMulti || table.colMulti);
    const totalHead = multi ? '응답자 수' : '합계';
    const head = `<tr><th></th>${table.colLabels.map((c) => `<th>${E(anLabelText(table.spec?.col, c))}</th>`).join('')}<th>${totalHead}</th></tr>`;
    const body = table.rowLabels.map((label, ri) => `<tr><td><strong>${E(anLabelText(table.spec?.row, label))}</strong></td>${table.cells[ri].map((c) => `<td>${cell(c)}</td>`).join('')}<td>${table.rowTotals[ri]}</td></tr>`).join('');
    const total = `<tr class="v8-total-row"><td><strong>전체</strong></td>${table.colTotals.map((c) => `<td>${c}</td>`).join('')}<td>${table.grandTotal}</td></tr>`;
    const multiNote = multi ? '<p class="v8-muted v8-multi-note">복수 선택 문항: 한 사람이 여러 보기에 셀 수 있어, 비율(행의 응답자 대비)을 한 행에서 더하면 100%를 넘을 수 있습니다. <b>응답자 수</b>와 <b>전체</b>는 칸의 합이 아니라 사람 수입니다.</p>' : '';
    const dropped = table.droppedRecords ? `<p class="v8-muted">${table.droppedRecords}건은 이 기준에 해당하는 값이 없어 제외했습니다.</p>` : '';
    return `${multiNote}<div class="table-wrap"><table class="stats-table">${head}${body}${total}</table></div>${dropped}`;
  }

  function anQuestionOptions(selected) {
    const questions = anQuestions();
    if (!questions.length) return `<option value="${E(selected)}">문항 ${E(selected)}</option>`;
    return questions.map((question) => `<option value="${E(question.no)}"${question.no === String(selected) ? ' selected' : ''}>${E(question.no)}. ${E(question.text)}${question.multi ? ' (복수 선택)' : ''}</option>`).join('');
  }

  // 세부 설정은 행과 열을 각각 따로 낸다.
  // 총점 구간 → 경계값 / 연령대 → 연령 경계값 / 문항 응답별 → 문항 선택.
  // 설정할 값이 없는 종류(성별·기관담당자별 등)도 "설정할 값 없음"을 그 축 자리에 그대로 보여 준다.
  // 그래야 행이 무시된 게 아니라는 것이 화면에서 드러난다.
  // 한 축의 세부 설정. 그 축의 선택 상자 바로 밑에 붙는다.
  function anAxisField(rec, axis) {
    const kind = anDimKind(rec.spec[axis]);
    const o = rec.opts[axis];
    const at = ` data-an-rec="${rec.id}"`;
    if (kind === 'score') return `<label>총점 구간 경계값<input type="text" data-an-edit="${axis}:scoreBounds"${at} value="${E(o.scoreBounds.join(','))}" inputmode="numeric" placeholder="예: 26,60"></label><p class="v8-axis-hint">쉼표로 구분합니다. 경계 2개 → 3구간 (개수 자유).</p>`;
    if (kind === 'age') return `<label>연령 구간 경계값<input type="text" data-an-edit="${axis}:ageBounds"${at} value="${E(o.ageBounds.join(','))}" inputmode="numeric" placeholder="예: 75,85"></label><p class="v8-axis-hint">쉼표로 구분합니다. 경계 2개 → 3구간 (개수 자유).</p>`;
    if (kind === 'question') return `<label>어느 문항의 응답으로 나눌지<select class="v8-q-select" data-an-edit="${axis}:questionNo"${at}>${anQuestionOptions(o.questionNo)}</select></label><p class="v8-axis-hint">이 문항의 <b>응답 보기</b>가 표의 ${axis === 'row' ? '행' : '열'}이 됩니다. 예: “예 / 아니오 / 미해당”.</p>`;
    return `<p class="v8-axis-none"><b>${E(AN_DIM_LABEL[kind] || kind)}</b> 은 추가로 설정할 값이 없습니다.</p>`;
  }

  function anEditHtml(rec) {
    const options = (selected) => Object.entries(AN_DIM_LABEL).map(([key, label]) => `<option value="${key}"${key === selected ? ' selected' : ''}>${label}</option>`).join('');
    // 행 → 행 세부 → 열 → 열 세부 순서. 세부 설정이 어느 축의 것인지 자리로 드러난다.
    const block = (axis) => `<div class="v8-axis-block">
        <div class="v8-edit-row"><span class="el">${axis === 'row' ? '행' : '열'}</span><select data-an-edit="${axis}" data-an-rec="${rec.id}">${options(anDimKind(rec.spec[axis]))}</select></div>
        <div class="v8-axis-detail">${anAxisField(rec, axis)}</div>
      </div>`;
    return `${block('row')}${block('col')}
      <div class="v8-edit-row"><span class="el"></span><button type="button" data-an-refresh="${rec.id}">미리보기 갱신</button></div>`;
  }

  // 화면의 편집 칸 → rec.spec. 지금 화면에 없는 세부 설정은 rec.opts 에 기억된 값을 그대로 쓴다.
  function anReadEdit(rec) {
    const ctl = (name) => document.querySelector(`[data-an-edit="${name}"][data-an-rec="${rec.id}"]`);
    // 경계값은 정수만 쓴다 (집계 함수가 정수만 받고, 소수 경계는 구간 이름이 어색해진다).
    // 빈 칸과 연속 쉼표는 버린다. Number('') 은 0 이라, 그냥 두면 "20,,40" 이 없던 0 경계를
    // 만들어 "-1점 이하" 같은 가짜 구간이 조용히 생긴다.
    const nums = (el) => String(el.value || '').split(',').map((v) => v.trim()).filter((v) => v !== '')
      .map((v) => Math.round(Number(v))).filter(Number.isSafeInteger);
    ['row', 'col'].forEach((axis) => {
      const sb = ctl(`${axis}:scoreBounds`), ab = ctl(`${axis}:ageBounds`), qn = ctl(`${axis}:questionNo`);
      if (sb) rec.opts[axis].scoreBounds = nums(sb);
      if (ab) rec.opts[axis].ageBounds = nums(ab);
      if (qn) rec.opts[axis].questionNo = qn.value;
    });
    const row = ctl('row')?.value || anDimKind(rec.spec.row);
    const col = ctl('col')?.value || anDimKind(rec.spec.col);
    rec.spec = { row: anDim(row, rec.opts.row), col: anDim(col, rec.opts.col), cells: rec.spec.cells };
  }

  function anRecHtml(rec, index) {
    const preview = rec.table ? anTableHtml(rec.table)
      : rec.previewFailed ? '<p class="v8-empty">미리보기를 만들지 못했습니다. \'미리보기 갱신\'을 눌러 주세요.</p>'
      : '<p class="v8-empty">미리보기를 준비하는 중입니다.</p>';
    const badge = rec.source === 'ai' ? '<span class="v8-rec-badge is-ai">AI 추천</span>'
      : `<span class="v8-rec-badge">${rec.id.startsWith('c') ? '직접 추가' : '추천 ' + (index + 1)}</span>`;
    return `<div class="v8-rec">
      <input type="checkbox" class="v8-rec-chk" data-an-rec="${rec.id}" ${rec.checked ? 'checked' : ''} aria-label="${E(anSpecTitle(rec.spec))} 선택">
      <div>
        <div class="v8-rec-title">${E(anSpecTitle(rec.spec))} ${badge}</div>
        <div class="v8-rec-why">근거: ${E(rec.why)}</div>
        ${rec.warn ? `<div class="v8-rec-warn">⚠ ${E(rec.warn)}</div>` : ''}
        <details class="v8-rec-edit" data-an-rec="${rec.id}"><summary>수정 · 미리보기 ▾</summary><div class="v8-rec-edit-body">${anEditHtml(rec)}${preview}</div></details>
      </div>
    </div>`;
  }

  function anUpdateSelCount() {
    const selected = anRecs.filter((rec) => rec.checked);
    q('#anSelCount').textContent = selected.length
      ? `선택한 기준 ${selected.length}개 — ${selected.map((rec) => anSpecTitle(rec.spec)).join(' · ')}`
      : '선택한 기준이 없습니다.';
  }

  function anRenderStep1() {
    const rows = anCondRows();
    const needsType = rows[0][2];
    q('#anCondSummary').innerHTML = rows.map(([key, value, warn]) => `<div><dt>${E(key)}</dt><dd${warn ? ' class="v8-warn-text"' : ''}>${E(value)}</dd></div>`).join('');
    q('#anCondHint').innerHTML = needsType
      ? '위 <b>조회 조건</b>을 열어 설문 양식을 하나 고른 뒤 다시 오세요. 분석은 설문 한 종류씩 진행합니다.'
      : '조건을 바꾸려면 위 <b>조회 조건</b>에서 수정하세요. 조건이 바뀌면 분석 결과는 처음으로 되돌아갑니다.';
    q('#anToStep2').disabled = needsType;
  }

  function anRenderStep2() {
    anRenderAiRec();
    const state = q('#anDataState');
    if (anLoading) { state.textContent = '데이터를 확인하는 중입니다.'; q('#anRecList').innerHTML = ''; return; }
    if (anError) { state.textContent = anError; q('#anRecList').innerHTML = ''; return; }
    if (!anResult) { state.textContent = 'STEP 1에서 조건을 정한 뒤 "다음"을 누르세요.'; return; }
    const s = anResult.summary;
    const noScore = s.n - s.withScore, noAge = s.n - s.ageKnown;
    state.innerHTML = `<b>데이터 상태</b> 응답 <b>${s.n}건</b> (확인 완료 ${s.statusCounts['확인 완료'] || 0} · 확인 대기 ${s.statusCounts['확인 대기'] || 0}) · 기관담당자 ${s.institutionCount}개 · 총점 범위${s.minScore ?? '—'}~${s.maxScore ?? '—'}`
      + (noScore || noAge ? `<br><b class="v8-warn-text">확인 필요</b> — 총점 없는 건 ${noScore}건 · 생년월일로 나이를 계산할 수 없는 건 ${noAge}건 (해당 기준의 표에서만 제외됩니다)` : '');
    // 목록을 다시 그려도 열어 둔 '수정 · 미리보기' 토글은 그대로 열린 채 둔다.
    const openIds = new Set([...document.querySelectorAll('#anRecList .v8-rec-edit[open]')].map((d) => d.dataset.anRec));
    q('#anRecList').innerHTML = anRecs.map(anRecHtml).join('');
    openIds.forEach((id) => { const d = document.querySelector(`#anRecList .v8-rec-edit[data-an-rec="${CSS.escape(id)}"]`); if (d) d.open = true; });
    anRenderCustomDetail();
    anUpdateSelCount();
  }

  // ── STEP 2 AI에게 추천 더 받기 ──────────────────────────────────────────────
  // 규칙 추천은 그대로 두고, AI 추천을 목록 끝에 'AI 추천' 배지로 덧붙인다(기본은 선택 해제).
  // 조합·문항 검사는 서버가 한다. 총점·연령 경계값은 AI 가 아니라 규칙의 참고 구간을 쓴다.
  // 계정 AI 사용 가능 여부는 STEP 4 와 같은 상태 확인(anReportLoadStatus)을 쓴다.
  const anAxisRef = (dim) => (dim.kind === 'question' ? { kind: 'question', questionNo: String(dim.questionNo) } : { kind: anDimKind(dim) });

  function anAiRecReset() {
    anAiRec = { loading: false, error: '', rejected: [], warnings: [], count: null, seq: anAiRec.seq + 1 };
  }

  function anRenderAiRec() {
    if (!q('#anAiRec')) return;
    anReportLoadStatus();
    const status = anReport.status;
    const hasData = Boolean(anResult) && N(anResult.summary?.n) > 0;
    const button = q('#anAiRecommend');
    button.disabled = !status?.available || !hasData || anLoading || anAiRec.loading;
    button.textContent = anAiRec.loading ? 'AI가 추천을 만드는 중…' : anAiRec.count != null ? 'AI에게 추천 다시 받기' : 'AI에게 추천 더 받기';
    q('#anAiRecNote').textContent = !status ? 'AI를 쓸 수 있는지 확인하는 중입니다.'
      : !status.available ? '이 계정의 AI가 미설정이거나 사용 중지 상태입니다. AI 연동 설정을 확인해 주세요. 위 규칙 추천은 그대로 쓸 수 있습니다.'
      : anLoading || !anResult ? ''
      : !hasData ? '응답이 없어 AI 추천을 받을 수 없습니다.'
      : anAiRec.loading ? '문항의 뜻을 보고 규칙 추천에 없는 조합을 찾고 있습니다. 조금 걸릴 수 있습니다.'
      : '규칙 추천에 없는 조합을 AI가 문항의 뜻을 보고 덧붙입니다. AI 추천은 기본으로 선택되지 않습니다.';
    const parts = [];
    if (anAiRec.error) parts.push(`<p class="v8-warn-text" role="alert">${E(anAiRec.error)}</p>`);
    if (!anAiRec.loading && !anAiRec.error && anAiRec.count != null) {
      parts.push(`<p class="v8-muted" role="status">${anAiRec.count ? `AI 추천 ${anAiRec.count}개를 위 목록 끝에 덧붙였습니다. 필요한 것만 선택하세요.` : 'AI가 덧붙일 만한 새 조합을 찾지 못했습니다.'}</p>`);
    }
    if (anAiRec.rejected.length) {
      parts.push(`<div class="v8-notice v8-report-warnings"><b>서버가 걸러 낸 AI 추천 ${anAiRec.rejected.length}개</b><ul>${anAiRec.rejected.map((item) => `<li>${E(item.기준)} — ${E(item.이유)}</li>`).join('')}</ul></div>`);
    }
    if (anAiRec.warnings.length) {
      parts.push(`<div class="v8-notice v8-report-warnings"><b>서버 검사 결과</b><ul>${anAiRec.warnings.map((warning) => `<li>${E(warning)}</li>`).join('')}</ul></div>`);
    }
    q('#anAiRecResult').innerHTML = parts.join('');
  }

  async function anRequestAiRecs() {
    if (!anResult || anLoading || anAiRec.loading) return;
    const seq = anAiRec.seq + 1;
    const isCurrent = () => anAiRec.seq === seq;
    const key = surveyChoice().key, summary = anResult.summary;
    anAiRec = { loading: true, error: '', rejected: [], warnings: [], count: anAiRec.count, seq };
    anRenderAiRec();
    try {
      // 선택하지 않은 이전 AI 추천은 새 추천으로 바꾸고, 선택해 둔 AI 추천은 남긴다.
      const kept = anRecs.filter((rec) => rec.source !== 'ai' || rec.checked);
      const payload = await apiRequest('/analysis/recommend', {
        method: 'POST',
        body: { ...anFilters(), existing: kept.map((rec) => ({ row: anAxisRef(rec.spec.row), col: anAxisRef(rec.spec.col) })) },
      });
      if (!isCurrent()) return;
      const base = { scoreBounds: anScoreBounds(key, summary), ageBounds: AN_AGE_BOUNDS.slice() };
      const dim = (axis) => anDim(axis.kind, { ...base, questionNo: axis.questionNo });
      const added = (payload.recommendations || []).map((item, i) => {
        const spec = { row: dim(item.row), col: dim(item.col), cells: ['count', 'pct'] };
        const why = anUsesScore(spec) && !anScoreBandsValidated(key, [spec.row, spec.col].find((d) => d.field === 'score')) ? `${item.why} ${AN_REFERENCE_BAND_NOTE}` : item.why;
        return { id: `ai-${seq}-${i + 1}`, source: 'ai', checked: false, why, warn: item.warn || '', spec, opts: anOptsFromSpec(spec, { ...base, questionNo: item.row.questionNo || item.col.questionNo }) };
      });
      anRecs = [...anRecs.filter((rec) => rec.source !== 'ai' || rec.checked), ...added];
      anAiRec.count = added.length;
      anAiRec.rejected = payload.rejected || [];
      anAiRec.warnings = payload.warnings || [];
      anRenderStep2();
      if (added.length) {
        try {
          const preview = await anRun(added.map((rec) => rec.spec));
          if (!isCurrent()) return;
          added.forEach((rec, i) => { rec.table = preview.tables[i]; });
        } catch {
          if (!isCurrent()) return;
          added.forEach((rec) => { rec.previewFailed = true; });
        }
      }
    } catch (error) {
      if (isCurrent()) anAiRec.error = error.message || 'AI 추천을 받지 못했습니다.';
    } finally {
      if (isCurrent()) { anAiRec.loading = false; anRenderStep2(); }
    }
  }

  function anItemRatesHtml(rates, surveyKey) {
    if (!rates || !rates.length) return '';
    const questions = anQuestions(surveyKey);
    const usable = new Set(questions.map((question) => question.no));
    const shown = rates.filter((item) => !questions.length || usable.has(String(item.questionNo))).slice(0, 10);
    if (!shown.length) return '';
    const rows = shown.map((item) => {
      const question = questions.find((entry) => entry.no === String(item.questionNo));
      const multi = item.multi || question?.multi;
      return `<tr><td>문항 ${E(item.questionNo)}${question ? ' · ' + E(question.text) : ''}${multi ? ' <small>(복수 선택)</small>' : ''}</td><td>${E(item.primaryLabel)} ${item.primaryRate}%</td></tr>`;
    }).join('');
    const survey = surveyChoice(surveyKey);
    const basis = survey.templateId
      ? (anHasScore(surveyKey) ? '대표 응답은 배점이 가장 높은 보기입니다.' : '이 양식은 배점이 없어 가장 많이 나온 응답을 대표로 보여 줍니다.')
      : '대표 응답은 위험 쪽 응답(예 · 거의 매일 등)입니다.';
    const multiNote = shown.some((item) => item.multi) ? ' 복수 선택 문항의 비율은 그 문항 응답자 대비입니다.' : '';
    return `<section class="v8-result-block"><h3>문항별 응답 분포 (상위 10)</h3><div class="table-wrap"><table class="stats-table"><tr><th>문항</th><th>대표 응답 비율</th></tr>${rows}</table></div><p class="v8-muted">${basis}${multiNote}</p></section>`;
  }

  function anRenderStep3() {
    if (anLoading) { q('#anSummary').innerHTML = ''; q('#anTables').innerHTML = '<p class="v8-empty" role="status">집계하는 중입니다.</p>'; q('#anItemRates').innerHTML = ''; q('#anRepro').textContent = ''; return; }
    if (anError) { q('#anSummary').innerHTML = ''; q('#anTables').innerHTML = `<p class="v8-empty" role="alert">${E(anError)}</p>`; q('#anItemRates').innerHTML = ''; q('#anRepro').textContent = ''; return; }
    if (!anResult) return;
    const r = anResult, s = r.summary;
    q('#anSummary').innerHTML = metric('응답 건수', s.n, '건', `확인 완료 ${s.statusCounts['확인 완료'] || 0} · 확인 대기 ${s.statusCounts['확인 대기'] || 0}`)
      + metric('평균 총점', s.meanScore ?? '—', s.meanScore != null ? '점' : '', `중앙값 ${s.medianScore ?? '—'}점`)
      + metric('점수 있는 건', s.withScore, '건', `전체 ${s.n}건 중`)
      + metric('기관담당자 수', s.institutionCount, '개', '');
    const surveyKey = r.filters.templateId ? `template:${r.filters.templateId}` : r.filters.checklistType;
    q('#anTables').innerHTML = r.tables.map((table, i) => {
      const scoreDim = [table.spec?.row, table.spec?.col].find((dim) => dim?.kind === 'number_bins' && dim.field === 'score');
      const bandNote = scoreDim && !anScoreBandsValidated(surveyKey, scoreDim) ? `<p class="v8-muted v8-band-note">${AN_REFERENCE_BAND_NOTE}</p>` : '';
      const questionNote = anQuestionLines(table.spec, surveyKey).map((line) => `<p class="v8-question-note">${E(line)}</p>`).join('');
      return `<section class="v8-result-block"><h3>표 ${i + 1} · ${E(anSpecTitle(table.spec))}</h3>${questionNote}${bandNote}${anTableHtml(table)}</section>`;
    }).join('');
    q('#anItemRates').innerHTML = anItemRatesHtml(r.itemRates, surveyKey);
    q('#anRepro').innerHTML = `<b>처리 상태</b> ${r.statusMode === 'completed' ? '확인 완료 건만' : '전체 (확인 대기 + 확인 완료)'} · <b>사용 데이터</b> ${r.recordCount}건 · <b>가정</b> 배점 0인 보기(아니오·미해당 등)는 0점 · <b>집계 기준</b> ${E(r.tables.map((t) => anSpecTitle(t.spec)).join(' / '))}`;
  }

  // ── STEP 4 결과 분석 ────────────────────────────────────────────────────────
  // 참고자료는 선택사항이다. 없으면 통계 결과만으로 분석한다. 형식 검사·통계 재계산·AI 답 검사는 서버가 한다.
  const AN_REPORT_TYPES = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.hwpx': 'application/hwp+zip' };
  const AN_REPORT_MAX_FILES = 5;
  const AN_REPORT_MAX_BYTES = 3.5 * 1024 * 1024;
  const AN_SUFFICIENCY_CLASS = { 충분: 'is-strong', 부분적: 'is-partial', 불충분: 'is-weak' };

  function anReportLoadStatus() {
    const key = agency.code;
    if (anReport.key === key && (anReport.status || anReport.statusLoading)) return;
    anReport = { key, status: null, statusLoading: true, files: [], rejected: [], loading: false, error: '', result: null, requestSeq: 0 };
    apiRequest('/analysis/report/status')
      .then((status) => { if (anReport.key === key) anReport.status = status; })
      .catch((error) => { if (anReport.key === key) anReport.status = { available: false, message: error.message || '결과 분석을 사용할 수 있는지 확인하지 못했습니다.' }; })
      .finally(() => { if (anReport.key !== key) return; anReport.statusLoading = false; if (anStep === 4) anRenderStep4(); if (anStep === 2) anRenderAiRec(); });
  }

  document.addEventListener('account-ai-settings-changed', () => {
    anReport.key='';
    anReportLoadStatus();
  });

  const anFileSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);
  const readFileBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;base64,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  // 받지 않는 형식은 서버와 같은 안내로 바로 알려 준다. 스캔본 여부 같은 내용 검사는 서버가 한다.
  function anReportRejectReason(ext) {
    if (['.png', '.jpg', '.jpeg'].includes(ext)) return '이미지 파일은 글자 인식 오류가 생길 수 있어 받지 않습니다. 텍스트 PDF · DOCX · HWPX로 올려 주세요.';
    if (ext === '.hwp') return "구형 한글(HWP) 파일은 받지 않습니다. 한글에서 '다른 이름으로 저장'으로 PDF 또는 HWPX로 저장해 올려 주세요.";
    return '텍스트 PDF · DOCX · HWPX 파일만 올릴 수 있습니다.';
  }

  // 화면에서는 개수·크기·확장자만 먼저 거른다. 받지 않은 파일은 곧 사라지는 알림 대신 목록 아래에 이유와 함께 남긴다.
  async function anReportAddFiles(fileList) {
    const target = anReport, rejected = [];
    for (const file of [...(fileList || [])]) {
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
      if (!AN_REPORT_TYPES[ext]) { rejected.push(`${file.name}: ${anReportRejectReason(ext)}`); continue; }
      if (target.files.some((f) => f.name === file.name && f.size === file.size)) continue;
      if (target.files.length >= AN_REPORT_MAX_FILES) { rejected.push(`${file.name}: 참고자료는 최대 ${AN_REPORT_MAX_FILES}개까지 올릴 수 있습니다.`); continue; }
      if (target.files.reduce((sum, f) => sum + f.size, 0) + file.size > AN_REPORT_MAX_BYTES) { rejected.push(`${file.name}: 참고자료 전체 크기는 3.5MB 이하여야 합니다.`); continue; }
      try {
        target.files.push({ name: file.name, size: file.size, mimeType: AN_REPORT_TYPES[ext], fileBase64: await readFileBase64(file) });
      } catch {
        rejected.push(`${file.name}: 파일을 읽지 못했습니다.`);
      }
    }
    if (anReport !== target) return; // 파일을 읽는 사이 다른 계정으로 바뀌었다
    target.rejected = rejected; target.result = null; target.error = '';
    anRenderStep4();
  }

  // STEP 3 통계가 새로 만들어지면 그 전의 분석 결과와 아직 기다리는 요청은 새 통계의 결과가 아니다.
  // 요청 번호를 올려 두면 이전 요청의 답이 늦게 도착해도 화면에 쓰지 않는다.
  function anReportReset({ keepFiles }) {
    anReport.requestSeq += 1;
    anReport.loading = false; anReport.result = null; anReport.error = ''; anReport.rejected = [];
    if (!keepFiles) anReport.files = [];
  }

  async function anRequestReport() {
    if (!anResult || anReport.loading) return;
    const target = anReport, seq = ++target.requestSeq;
    const isCurrent = () => anReport === target && target.requestSeq === seq;
    target.loading = true; target.error = ''; target.result = null; target.rejected = [];
    anRenderStep4();
    try {
      const result = await apiRequest('/analysis/report', {
        method: 'POST',
        body: { ...anFilters(), specs: anResult.tables.map((table) => table.spec), files: target.files.map((f) => ({ filename: f.name, mimeType: f.mimeType, fileBase64: f.fileBase64 })) },
      });
      if (isCurrent()) target.result = result;
    } catch (error) {
      if (isCurrent()) target.error = error.message || '결과 분석을 만들지 못했습니다.';
    } finally {
      if (isCurrent()) { target.loading = false; anRenderStep4(); }
    }
  }

  function anReportHtml(result) {
    const report = result.report || {};
    const modeNote = result.mode === 'statistics_only' ? '참고자료 없이 통계 결과만으로 분석했습니다.' : `참고자료 ${N(result.referenceCount)}개와 통계 결과로 분석했습니다.`;
    const overview = Object.entries(report.조사_개요 || {}).map(([key, value]) => `<div><dt>${E(key.replace(/_/g, ' '))}</dt><dd>${E(value)}</dd></div>`).join('');
    const warnings = (result.warnings || []).length
      ? `<div class="v8-notice v8-report-warnings"><b>서버 검사 결과</b><ul>${result.warnings.map((warning) => `<li>${E(warning)}</li>`).join('')}</ul></div>` : '';
    const items = (report.분석_항목 || []).map((item, i) => {
      const badge = item.근거_충분도 === '불충분' ? '판단 보류' : item.근거_충분도;
      const check = item.검증
        ? `<p class="v8-warn-text v8-report-check">⚠ 인용한 수치 ${E(item.검증.찾지_못한_수치.join(', '))}을(를) 통계 결과에서 찾지 못해 판단 보류로 표시했습니다. (AI가 매긴 근거 충분도: ${E(item.검증.원래_근거_충분도)})</p>` : '';
      const reference = item.참고자료_근거
        ? `<blockquote>${E(item.참고자료_근거)}</blockquote>`
        : `<span class="v8-muted">${result.mode === 'statistics_only' ? '참고자료 없이 분석했습니다.' : '참고자료에서 관련 근거를 찾지 못했습니다.'}</span>`;
      return `<article class="v8-report-item">
        <header><span class="v8-report-badge ${AN_SUFFICIENCY_CLASS[item.근거_충분도] || 'is-weak'}">${E(badge)}</span><h3>${i + 1}. ${E(item.분석_결과)}</h3></header>
        ${check}
        <dl class="v8-report-fields">
          <div><dt>사용한 통계값</dt><dd><ul>${(item.사용한_통계값 || []).map((value) => `<li>${E(value)}</li>`).join('')}</ul></dd></div>
          <div><dt>참고자료 근거</dt><dd>${reference}</dd></div>
          <div><dt>해석</dt><dd>${E(item.해석)}</dd></div>
          <div><dt>주의사항</dt><dd>${E(item.주의사항)}</dd></div>
        </dl>
      </article>`;
    }).join('');
    return `<section class="v8-result-block">
        <div class="v8-panel-heading"><div><h3>조사 개요</h3><p class="v8-muted">${E(modeNote)}${result.model ? ` · ${E(result.model)}` : ''}</p></div>
          <div class="v8-report-actions"><button type="button" id="anCopyReport">JSON 복사</button><button type="button" id="anDownloadReport">JSON 내려받기</button></div></div>
        <dl class="v8-cond-summary">${overview}</dl>
      </section>${warnings}${items}`;
  }

  function anReportJson() { return JSON.stringify(anReport.result?.report || {}, null, 2); }
  async function anCopyReport() {
    try { await navigator.clipboard.writeText(anReportJson()); showToast('분석 결과 JSON을 복사했습니다.'); }
    catch { showToast('복사하지 못했습니다. JSON 내려받기를 이용해 주세요.'); }
  }
  function anDownloadReport() {
    const url = URL.createObjectURL(new Blob([anReportJson()], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = '응다비룸_결과분석.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function anRenderStep4() {
    anReportLoadStatus();
    const statusBox = q('#anReportStatus'), form = q('#anReportForm'), out = q('#anReport');
    const status = anReport.status;
    if (!status) {
      statusBox.hidden = false; statusBox.textContent = '결과 분석을 사용할 수 있는지 확인하는 중입니다.';
      form.hidden = true; out.innerHTML = '';
      return;
    }
    if (!status.available) {
      statusBox.hidden = false;
      statusBox.innerHTML = `<b class="v8-warn-text">결과 분석을 사용할 수 없습니다</b><br>${E(status.message || '')}<br><span class="v8-muted">AI가 연결되면 이 단계를 쓸 수 있습니다. STEP 3의 통계 결과와 CSV는 그대로 쓸 수 있습니다.</span>`;
      form.hidden = true; out.innerHTML = '';
      return;
    }
    statusBox.hidden = true;
    form.hidden = false;
    // 'AI 분석의 참고자료 근거'가 "참고자료 1"처럼 번호로 인용하므로 목록에도 같은 번호를 붙인다.
    q('#anReportFileList').innerHTML = anReport.files.map((f, i) => `<li><b>참고자료 ${i + 1}</b><span>${E(f.name)}</span><small>${anFileSize(f.size)}</small><button type="button" data-an-report-remove="${i}" aria-label="${E(f.name)} 빼기" ${anReport.loading ? 'disabled' : ''}>빼기</button></li>`).join('');
    const noRecords = Boolean(anResult) && !N(anResult.recordCount); // 응답이 없으면 분석할 것이 없다 (서버도 AI 를 부르지 않는다)
    q('#anReportMode').textContent = noRecords ? 'STEP 3 통계에 응답이 없어 분석을 요청할 수 없습니다'
      : anReport.files.length ? `참고자료 ${anReport.files.length}개와 통계 결과로 분석합니다` : '참고자료 없이 통계 결과만으로 분석합니다';
    q('#anReportFiles').disabled = anReport.loading || !anReport.status?.available || anReport.status?.files === false;
    q('#anReportFiles').title = anReport.status?.files === false ? '선택한 AI 연결은 파일 입력을 지원하지 않습니다. 참고파일 없이 분석해 주세요.' : '';
    const button = q('#anRequestReport');
    button.disabled = anReport.loading || !anResult || noRecords;
    button.textContent = anReport.loading ? '분석하는 중…' : '결과 분석 요청';
    const rejected = anReport.rejected.length
      ? `<div class="v8-notice v8-report-warnings" role="alert"><b class="v8-warn-text">올리지 않은 파일</b><ul>${anReport.rejected.map((message) => `<li>${E(message)}</li>`).join('')}</ul></div>` : '';
    if (anReport.loading) { out.innerHTML = '<p class="v8-empty" role="status">AI가 통계 결과를 분석하고 있습니다. 참고자료가 많으면 1분 가까이 걸릴 수 있습니다.</p>'; return; }
    if (anReport.error) { out.innerHTML = `<p class="v8-empty" role="alert">${E(anReport.error)}</p>`; return; }
    out.innerHTML = rejected + (anReport.result ? anReportHtml(anReport.result) : '');
  }

  function anRender() {
    document.querySelectorAll('.v8-astep').forEach((b) => {
      const on = Number(b.dataset.astep) === anStep;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
      b.disabled = Number(b.dataset.astep) >= anStep;
    });
    document.querySelectorAll('[data-astep-panel]').forEach((panel) => { panel.hidden = Number(panel.getAttribute('data-astep-panel')) !== anStep; });
    if (anStep === 1) anRenderStep1();
    if (anStep === 2) anRenderStep2();
    if (anStep === 3) anRenderStep3();
    if (anStep === 4) anRenderStep4();
  }

  function anGoto(step, fromNextButton = false) {
    // 상단 탭과 이전 버튼은 뒤로만 이동한다. 앞으로는 명시적인 다음 버튼만 허용한다.
    if (!Number.isInteger(step) || step < 1 || step > 4 || step === anStep) return;
    if (step > anStep && (!fromNextButton || step !== anStep + 1 || anLoading || anError || !anResult)) return;
    if (step > 1 && !anResult && !anLoading) { showToast('STEP 1에서 설문지를 고르고 "다음"을 눌러 주세요.'); return; }
    anStep = step;
    anRender();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function anStart() {
    const survey = surveyChoice();
    if (!survey.key) { showToast('위 조회 조건에서 분석할 설문 양식을 하나 선택해 주세요.'); return; }
    anRecs = []; anLoading = true; anError = ''; anResult = null; anStep = 2;
    anReportReset({ keepFiles: true }); // 통계가 새로 만들어지므로 이전 분석은 비운다 (참고자료는 둔다)
    anAiRecReset(); // 추천 목록도 새로 만들어지므로 기다리던 AI 추천은 버린다
    anRender();
    try {
      // 자체 설문은 문항 종류(단일·복수·서술형)와 배점 사용 여부를 먼저 받아야 추천과 문항 목록을 만들 수 있다.
      if (survey.templateId && !anTemplateDetails.has(survey.templateId)) {
        const detail = await apiRequest(`/stats/templates/${encodeURIComponent(survey.templateId)}`);
        anTemplateDetails.set(survey.templateId, detail.template);
      }
      // ① 이 조건의 데이터를 먼저 한 번 읽는다. 요약과 문항별 응답률이 추천의 근거가 된다.
      const probe = await anRun([{ row: { kind: 'all' }, col: { kind: 'all' }, cells: ['count'] }]);
      anRecs = anBuildRecs(survey.key, probe);
      // ② 그렇게 만든 추천들의 미리보기 표를 한 번에 받아 온다.
      const payload = await anRun(anRecs.map((rec) => rec.spec));
      anResult = payload;
      anRecs.forEach((rec, i) => { rec.table = payload.tables[i]; });
    } catch (error) {
      anError = error.message || '데이터를 불러오지 못했습니다.';
    } finally {
      anLoading = false;
      anRender();
    }
  }

  async function anApply() {
    const selected = anRecs.filter((rec) => rec.checked);
    if (!selected.length) { showToast('분석 기준을 하나 이상 선택해 주세요.'); return; }
    anLoading = true; anError = ''; anStep = 3;
    anReportReset({ keepFiles: true }); // 승인한 기준이 바뀌면 이전 분석은 그 표의 결과가 아니다
    anRender();
    try {
      anResult = await anRun(selected.map((rec) => rec.spec));
    } catch (error) {
      anError = error.message || '집계하지 못했습니다.';
    } finally {
      anLoading = false;
      anRender();
    }
  }

  async function anRefreshRec(id) {
    const rec = anRecs.find((item) => item.id === id);
    if (!rec) return;
    anReadEdit(rec);
    try {
      const payload = await anRun([rec.spec]);
      rec.table = payload.tables[0];
      anRenderStep2(); // 열어 둔 토글은 anRenderStep2 가 그대로 유지한다.
    } catch (error) {
      showToast(error.message || '미리보기를 갱신하지 못했습니다.');
    }
  }

  // '직접 기준 추가' 폼도 추천 카드와 완전히 같은 구조(행·열 각각의 세부 설정)를 쓴다.
  function anCustomDraft(cells) {
    if (!anCustomOpts) {
      const seed = { scoreBounds: anScoreBounds(q('#statsFilterType').value, anResult?.summary), ageBounds: AN_AGE_BOUNDS.slice(), questionNo: anQuestions()[0]?.no || '1' };
      anCustomOpts = { row: anAxisOpts({ kind: 'all' }, seed), col: anAxisOpts({ kind: 'all' }, seed) };
    }
    return { id: 'custom', opts: anCustomOpts, spec: { row: anDim(q('#anCustomRow').value, anCustomOpts.row), col: anDim(q('#anCustomCol').value, anCustomOpts.col), cells: cells || ['count'] } };
  }
  function anRenderCustomDetail() {
    if (!q('#anCustomRowDetail')) return;
    anReadEdit(anCustomDraft()); // 화면에 남아 있는 값을 anCustomOpts 로 흡수
    const draft = anCustomDraft();
    q('#anCustomRowDetail').innerHTML = anAxisField(draft, 'row');
    q('#anCustomColDetail').innerHTML = anAxisField(draft, 'col');
  }

  async function anAddCustom() {
    anReadEdit(anCustomDraft());
    const cells = ['count'];
    if (q('#anCustomPct').checked) cells.push('pct');
    if (q('#anCustomMean').checked) cells.push('mean');
    const spec = anCustomDraft(cells).spec;
    const rec = { id: 'c' + Date.now(), checked: true, why: '직접 추가한 기준입니다.', spec, opts: anCloneOpts(anCustomOpts) };
    anRecs.push(rec);
    q('#anCustom').open = false;
    try {
      const payload = await anRun([rec.spec]);
      rec.table = payload.tables[0];
    } catch (error) {
      showToast(error.message || '미리보기를 만들지 못했습니다.');
    }
    anRenderStep2();
  }

  function anExportCsv() {
    if (!anResult) { showToast('먼저 통계 결과를 산출해 주세요.'); return; }
    const rows = [];
    const surveyKey = anResult.filters.templateId ? `template:${anResult.filters.templateId}` : anResult.filters.checklistType;
    anResult.tables.forEach((table, i) => {
      rows.push([`표 ${i + 1}`, anSpecTitle(table.spec)]);
      anQuestionLines(table.spec, surveyKey).forEach((line) => rows.push(['', line]));
      rows.push(['', ...table.colLabels.map((c) => anLabelText(table.spec?.col, c)), table.rowMulti || table.colMulti ? '응답자 수' : '합계']);
      table.rowLabels.forEach((label, ri) => rows.push([anLabelText(table.spec?.row, label), ...table.cells[ri].map((c) => c.count), table.rowTotals[ri]]));
      rows.push(['전체', ...table.colTotals, table.grandTotal]);
      rows.push([]);
    });
    const url = URL.createObjectURL(new Blob(['﻿' + rows.map((row) => row.map(V8Data.csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = '응다비룸_분석결과.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 조회 조건이 바뀌면 이전 분석 결과는 더 이상 그 조건의 결과가 아니므로 STEP 1로 되돌린다.
  function anResetForScope() {
    anResult = null; anRecs = []; anError = ''; anLoading = false; anStep = 1;
    anCustomOpts = null; // 총점 경계값 기본치가 설문 양식마다 달라서 같이 비운다.
    anReportReset({ keepFiles: false }); // 조건이 바뀌면 이전 분석은 그 조건의 결과가 아니다
    anAiRecReset();
    stats(); // 위쪽 요약 줄(조회 조건)까지 함께 갱신한다.
  }

  // 로그아웃 후 새로고침 없이 다른 기관으로 로그인하면 이전 기관의 추천·표·분석이 메모리에 남아 있다.
  // AI 통계 탭을 그릴 때 로그인 기관이 바뀌었으면 처음(STEP 1)으로 되돌린다.
  function anResetForAccount() {
    if (anOwner === agency.code) return;
    if (anOwner) {
      anResult = null; anRecs = []; anError = ''; anLoading = false; anStep = 1; anCustomOpts = null;
      anReportReset({ keepFiles: false });
      anAiRecReset();
    }
    anOwner = agency.code;
  }

  function analysis() { anRender(); }

  function shell() {
    if (!q('#v8Breadcrumb')) return;
    const view = q('.view.is-active')?.id.replace('view-', '') || 'home';
    const role = isCentralRole() ? '중앙관리자' : isRegionalRole() ? '광역관리자' : '기관담당자';
    q('#v8Breadcrumb').textContent = `${role} / ${viewTitle(view).trim()}`;
    q('#v8NavLabel').textContent = `${role} 업무`;
    q('#v8PageEyebrow').textContent = view === 'home' && isCentralRole() ? '전체 관할 한눈에' : agency.name;
    const descriptions = {home:isCentralRole() ? '소속 기관의 상태와 운영할 설문 양식을 살펴보세요.' : '접수된 설문과 소속 기관의 조사 진행을 살펴보세요.',dashboard:'기관과 대상자, 문항별 응답을 확인하세요.','checklist-templates':'등록된 양식을 관리하거나, 새 설문을 만들어 초안으로 검토하세요.',master:'기관을 선택해 소속 정보와 조사자용 제출 링크, 접속 정보를 관리하세요.','ai-settings':'사용할 AI의 연결 상태를 확인하세요.'};
    q('#v8PageDescription').textContent = view === 'dashboard' ? '' : descriptions[view] || '';
    q('#v8PageDescription').hidden = view === 'dashboard';
    masterActions.hidden = view !== 'master' || !isWideScopeRole();
    q('#v8FooterRole').textContent = role;
    q('#accountAgencyName').textContent = agency.name;
    q('#v8Header').hidden = view === 'checklist-templates' && !['list','create'].includes(q('#view-checklist-templates').dataset.workspaceMode || 'list');
  }

  function setFormsArea(area) {
    q('#view-checklist-templates').dataset.formsArea = area;
    q('#v8FormsLibraryTab').setAttribute('aria-selected', String(area === 'library'));
    q('#v8FormsCreateTab').setAttribute('aria-selected', String(area === 'create'));
    setTemplateWorkspaceMode(area === 'library' ? 'list' : 'create');
  }
  function openBase(id) {
    const f = checklistDefs[id];
    if (!f) return;
    q('#v8BaseTitle').textContent = f.label;
    q('#v8BaseQuestions').innerHTML = f.questions.map((text, i) => `<li><h3>${i + 1}. ${E(text)}</h3><p>${f.options.map((o) => E(o.label)).join(' · ')}</p></li>`).join('');
    q('#v8BaseDialog').showModal();
  }
  document.addEventListener('click', async (event) => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-v8-institution-open')) { selectedMasterAgencyCode = agency.code; applyMasterTargetToView(); }
    if (b.hasAttribute('data-master-agency-code') || b.hasAttribute('data-v8-institution-open')) { institutionSurface(); institutionTab('0'); institutionDialog.showModal(); }
    if (b.dataset.v8InstitutionTab !== undefined) institutionTab(b.dataset.v8InstitutionTab);
    if (b.hasAttribute('data-v8-edit-org')) openInstitutionDialog(masterTargetInstitution());
    if (b.hasAttribute('data-v8-state-org')) {const target = masterTargetInstitution(); await toggleInstitutionStatus(target.code, !target.active); institutionSurface();}
    if (b.dataset.v8Child) {if (passwordDraft() && !window.confirm('입력을 버리고 다른 기관을 볼까요?')) return; selectedMasterAgencyCode = b.dataset.v8Child; applyMasterTargetToView(); institutionSurface(); institutionTab('1');}
    // AI 통계 탭은 /stats 집계를 쓰지 않으므로 그 탭으로 넘어갈 때는 조회하지 않는다.
    // Switching tabs never sends a query; the explicit query button does.
    if (b.dataset.astep) anGoto(Number(b.dataset.astep));
    if (b.id === 'anToStep2') anStart();
    if (b.id === 'anToStep3') anApply();
    if (b.id === 'anToStep4') anGoto(4, true);
    if (b.id === 'anBackTo1') anGoto(1);
    if (b.id === 'anBackTo2') anGoto(2);
    if (b.id === 'anBackTo3') anGoto(3);
    if (b.id === 'anAddCustom') anAddCustom();
    if (b.dataset.anRefresh) anRefreshRec(b.dataset.anRefresh);
    if (b.id === 'anExportCsv') anExportCsv();
    if (b.id === 'anAiRecommend') anRequestAiRecs();
    if (b.id === 'anRequestReport') anRequestReport();
    if (b.dataset.anReportRemove !== undefined && !anReport.loading) { anReport.files.splice(Number(b.dataset.anReportRemove), 1); anReport.result = null; anReport.error = ''; anReport.rejected = []; anRenderStep4(); }
    if (b.id === 'anCopyReport') anCopyReport();
    if (b.id === 'anDownloadReport') anDownloadReport();
    if (b.dataset.v8View) q(`.nav-tab[data-view="${b.dataset.v8View}"]`)?.click();
    if (b.hasAttribute('data-v8-home-retry')) { homeState.source = Symbol(); home(); }
    if (b.hasAttribute('data-v8-add-org')) { q('.nav-tab[data-view="master"]').click(); q('#addInstitutionButton').click(); }
    if (b.dataset.v8Detail) openDetail(b.dataset.v8Detail);
    if (b.dataset.v8Base) openBase(b.dataset.v8Base);
    if (b.dataset.v8Area) setFormsArea(b.dataset.v8Area);
    if (b.dataset.v8Forms !== undefined || b.dataset.v8Template) {
      q('.nav-tab[data-view="checklist-templates"]').click();
      setFormsArea('library');
      try { await loadChecklistTemplates(); if (b.dataset.v8Template) { q(`[data-template-id="${CSS.escape(b.dataset.v8Template)}"]`)?.click(); } else q(`[data-template-status="${b.dataset.v8Forms}"]`)?.click(); } catch (error) { showToast(error.message); }
    }
    if (b.hasAttribute('data-v8-pending') || b.dataset.v8StatAgency) {
      toolbar.querySelectorAll('input,select').forEach((el) => { el.value = ''; });
      q('#filterStatus').value = b.hasAttribute('data-v8-pending') ? '확인 대기' : '';
      q('#filterAgencyCode').value = b.dataset.v8StatAgency || '';
      if (b.dataset.v8StatAgency) {
        const scope = appliedFilters[activeStatsTab] || {};
        q('#filterStartDate').value = scope.startDate || '';
        q('#filterEndDate').value = scope.endDate || '';
        q('#filterType').value = scope.type || '';
      }
      q('.nav-tab[data-view="dashboard"]').click(); renderDashboard();
    }
  });
  document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.matches('.v8-rec-chk[data-an-rec]')) {
      const rec = anRecs.find((item) => item.id === el.dataset.anRec);
      if (rec) { rec.checked = el.checked; anUpdateSelCount(); }
    }
    // 편집 칸: 행·열이 바뀌면 그 축의 세부 설정 구성도 달라지므로 다시 그린다.
    if (el.dataset.anEdit && el.dataset.anRec) {
      const axisChanged = el.dataset.anEdit === 'row' || el.dataset.anEdit === 'col';
      if (el.dataset.anRec === 'custom') {
        if (axisChanged) anRenderCustomDetail(); else anReadEdit(anCustomDraft());
      } else {
        const rec = anRecs.find((item) => item.id === el.dataset.anRec);
        if (rec) { anReadEdit(rec); if (axisChanged) anRenderStep2(); }
      }
    }
    if (el.closest('.stats-filter-bar') && activeStatsTab === 'ai') anResetForScope();
    if (el.id === 'anReportFiles') { anReportAddFiles(el.files); el.value = ''; }
  });
  // 참고자료 끌어다 놓기
  const reportDrop = q('#anReportDrop');
  if (reportDrop) {
    ['dragenter', 'dragover'].forEach((type) => reportDrop.addEventListener(type, (event) => { event.preventDefault(); reportDrop.classList.add('is-dragging'); }));
    ['dragleave', 'drop'].forEach((type) => reportDrop.addEventListener(type, () => reportDrop.classList.remove('is-dragging')));
    reportDrop.addEventListener('drop', (event) => { event.preventDefault(); if (!anReport.loading) anReportAddFiles(event.dataTransfer?.files); });
  }
  document.addEventListener('workspace-view-changed', () => {
    shell();
    if (q('#view-home').classList.contains('is-active')) home();
    if (q('#view-checklist-templates').classList.contains('is-active')) setFormsArea('library');
    if (!q('#view-stats').classList.contains('is-active')) return;
    loadStatsTemplates(); // 설문 양식 선택지에 자체 설문을 채운다 (계정이 바뀌면 다시 받는다)
    if (activeStatsTab === 'ai') stats();
    // Entering statistics loads only survey choices, not submission aggregates.
  });
  q('#v8StatsFind').addEventListener('input', stats);
  document.addEventListener('template-workspace-changed', shell);
  window.FinalWorkspace = { home, templates, stats, shell, analysis,
    institutionSummary(code) {
      if (homeState.loading || homeState.error || !homeState.rows) return null;
      const row = homeState.rows.find(r => r.institution_code === code);
      return {total: N(row?.total), waiting: row ? waiting(row) : 0};
    },
    statsRowsForExport(view) { return V8Data.scopeStats(statsResults[view]?.rows || [], scopedAgencies(), appliedFilters[view] || {}); },
    statsStart(view) { statsErrors[view] = ''; },
    statsSuccess(view, params) {
      const values = Object.fromEntries(params);
      appliedFilters[view] = values;
    },
    statsFailure(error, view) { statsErrors[view] = error.message || '통계를 불러오지 못했습니다. 다시 시도해 주세요.'; }

  };
  shell(); if (isAuthenticated()) { home(); templates(); }
})();
