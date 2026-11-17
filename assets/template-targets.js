/* Institution-level submission eligibility. Template ownership permissions are unchanged. */
(() => {
  let current = {mode:'all',codes:[],revision:0}, saved, formId = '', status = 'draft';
  let institutions = [], loaded = false, sequence = 0, pending = false;
  const el = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const value = () => ({...current,codes:[...current.codes].sort()});
  function render() {
    const editable = status !== 'closed' && !pending;
    el('templateTargetMode').disabled = !editable;
    el('templateTargetMode').value = current.mode;
    el('templateTargetSearch').disabled = !editable;
    el('templateTargetGroup').disabled = !editable;
    el('templateTargetPicker').classList.toggle('is-hidden',current.mode !== 'selected');
    const search = el('templateTargetSearch').value.trim().toLowerCase();
    const group = el('templateTargetGroup').value;
    const agencies = institutions.filter(row => row.type === 'agency');
    const filtered = agencies.filter(row => (!group || row.parentCode === group) && `${row.name} ${row.code}`.toLowerCase().includes(search));
    const groups = new Map(institutions.filter(row => row.type === 'regional').map(row => [row.code,row.name]));
    const grouped = new Map();
    for (const row of filtered) { const key = row.parentCode || ''; if (!grouped.has(key)) grouped.set(key,[]); grouped.get(key).push(row); }
    el('templateTargetList').innerHTML = [...grouped].map(([parent,rows]) => `<section class="template-target-group"><h4>${escape(groups.get(parent)||'광역관리자 미지정')}</h4>${rows.map(row => `<label class="template-target-row"><input type="checkbox" data-target-code="${escape(row.code)}" ${current.codes.includes(row.code)?'checked':''} ${!editable||(!row.active&&!current.codes.includes(row.code))?'disabled':''}><span>${escape(row.name)} <small>${escape(row.code)}${row.active?'':' · 비활성'}</small></span></label>`).join('')}</section>`).join('') || '<p>검색 결과가 없습니다.</p>';
    const selected = current.codes.map(code => {const row=agencies.find(item=>item.code===code);return `${row?.name||code} (${code})${row&&!row.active?' · 비활성':''}`;});
    el('templateTargetSummary').textContent = current.mode === 'all' ? '전체 활성 기관담당자 · 이후 신규 기관도 포함' : `${selected.length}개 기관 선택${selected.length?' — '+selected.join(', '):''}`;
    for (const id of ['templateTargetSelectAll','templateTargetClear']) el(id).disabled = !editable || !loaded;
    const save = el('saveTemplateTargetsButton');
    save.classList.toggle('is-hidden',status !== 'active');
    save.disabled = !editable || JSON.stringify(value()) === JSON.stringify(saved);
    el('templateTargetHint').textContent = status === 'active' ? '제출 대상만 변경할 수 있습니다. 제외해도 기존 제출 이력은 유지됩니다.' : status === 'closed' ? '종료된 양식의 제출 대상은 변경할 수 없습니다.' : '제출 대상 설정은 아래 양식 저장 버튼으로 함께 저장됩니다.';
  }
  async function load(template) {
    const ticket = ++sequence;
    formId = template.id || ''; status = template.status || 'draft'; pending = false;
    current = structuredClone(template.submissionTargets || {mode:'all',codes:[],revision:0});
    saved = value(); loaded = false; institutions = [];
    el('templateTargetSearch').value = ''; el('templateTargetGroup').innerHTML = '<option value="">전체 광역관리자</option>';
    el('templateTargetLoadStatus').textContent = '기관 목록을 불러오는 중입니다.';
    render();
    try {
      const payload = await apiRequest('/checklist-target-institutions');
      if (ticket !== sequence) return;
      institutions = payload.institutions; loaded = true;
      el('templateTargetGroup').innerHTML += institutions.filter(row=>row.type==='regional').map(row=>`<option value="${escape(row.code)}">${escape(row.name)}</option>`).join('');
      el('templateTargetLoadStatus').textContent = '';
      render();
    } catch(error) {
      if (ticket !== sequence) return;
      el('templateTargetLoadStatus').textContent = '기관 목록을 불러오지 못했습니다. 양식을 다시 열어 주세요.';
      el('templateTargetList').textContent = '';
    }
  }
  function validate() {
    if (current.mode === 'selected' && !current.codes.length) throw Error('제출 대상 기관을 최소 1개 선택해 주세요.');
    if (current.mode === 'selected' && !loaded) throw Error('기관 목록을 불러온 뒤 저장해 주세요.');
  }
  function changed() {render(); updateTemplateSaveFlow();}
  el('templateTargetMode').addEventListener('change',()=>{current.mode=el('templateTargetMode').value;current.codes=[];changed();});
  el('templateTargetSearch').addEventListener('input',render);
  el('templateTargetGroup').addEventListener('change',render);
  el('templateTargetList').addEventListener('change',event=>{
    const code=event.target.dataset.targetCode;if(!code)return;
    current.codes=current.codes.filter(item=>item!==code);if(event.target.checked)current.codes.push(code);changed();
  });
  el('templateTargetSelectAll').addEventListener('click',()=>{
    const codes=[...el('templateTargetList').querySelectorAll('[data-target-code]:not(:disabled)')].map(input=>input.dataset.targetCode).filter(code=>institutions.some(row=>row.code===code&&row.active));
    current.codes=[...new Set([...current.codes,...codes])];changed();
  });
  el('templateTargetClear').addEventListener('click',()=>{current.codes=[];changed();});
  el('saveTemplateTargetsButton').addEventListener('click',async()=>{
    if(pending)return;
    try {validate();} catch(error){showToast(error.message);return;}
    const ticket=sequence, button=el('saveTemplateTargetsButton');pending=true;button.dataset.processing='true';render();
    try {
      const result=await apiRequest(`/checklist-templates/${encodeURIComponent(formId)}/targets`,{method:'PATCH',body:{submissionTargets:value()}});
      if(ticket!==sequence)return;
      current=result.submissionTargets;saved=value();
      templateSavedForm=JSON.stringify(collectTemplateForm());
      document.dispatchEvent(new Event('template-editor-loaded'));
      showToast('제출 대상 기관을 저장했습니다.');
    } catch(error){showToast(error.message||'제출 대상 저장에 실패했습니다. 선택 내용은 유지됩니다.');}
    finally{delete button.dataset.processing;if(ticket===sequence){pending=false;render();}}
  });
  window.TemplateTargets={load,value,validate};
})();
