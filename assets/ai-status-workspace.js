/* Account-owned AI settings. Raw credentials are cleared after verification. */
(() => {
 const q=s=>document.querySelector(s), E=escapeMarkup;
 const demo=['127.0.0.1','localhost'].includes(location.hostname)&&window.RecoveryAIAdapter?.localDemo===true;
 const adapter=demo?window.RecoveryAIAdapter:{
  async read(){return apiRequest('/ai/settings');},
  async verify(body){return apiRequest('/ai/settings/verify',{method:'POST',body});},
  async save(body){return apiRequest('/ai/settings',{method:'PATCH',body});}
 };
 const controller=new AISettingsState(adapter);
 const button=document.createElement('button');button.type='button';button.className='nav-tab';button.dataset.view='ai-settings';
 button.hidden=false;
 button.innerHTML='<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"></svg></span><span>AI 연동 설정</span>';q('.nav-tabs').append(button);
 const section=document.createElement('section');section.id='view-ai-settings';section.className='view';
 section.innerHTML=`
 <div class="v8-ai-surface">
  <p class="ai-demo-note" ${demo?'':'hidden'}>로컬 합성 테스트 · 설정은 이 탭의 메모리에만 유지되며 실제 AI를 호출하지 않습니다.</p>
  <section class="ai-control-card"><div><h2>AI 기능 사용</h2><p id="ai-readiness" role="status"></p><div id="ai-usage-guide"><p>AI 기능을 켜면(ON) 연결한 AI를 설문 생성과 AI 통계 추천·분석에 사용할 수 있습니다.</p><p>AI가 연결되어 있지 않거나 사용 중지된 경우(OFF) AI 호출 기능은 비활성화됩니다.</p><div class="ai-usage-notes"><p>※ AI가 생성한 결과는 참고용이며, 최종 반영 전 담당자의 검토가 필요합니다.</p><p>※ 설정한 AI 기능은 해당 로그인 계정에만 적용됩니다. 연동 설정 시 선택 모델을 실제 호출해 사용하며, 사용량에 따른 API 비용이 발생할 수 있습니다.</p></div></div></div><div class="ai-control-actions"><button id="start-ai" class="ai-usage-switch" type="button" role="switch" aria-checked="false" aria-label="AI 기능 사용" aria-describedby="ai-usage-guide"><span class="ai-switch-track" aria-hidden="true"></span><span>OFF</span></button><button id="stop-ai" class="ai-usage-switch" type="button" role="switch" aria-checked="true" aria-label="AI 기능 사용" aria-describedby="ai-usage-guide" hidden><span class="ai-switch-track" aria-hidden="true"></span><span>ON</span></button></div></section>
  <section class="ai-connection-card"><div class="section-heading"><div><h2>사용할 AI</h2><p>연결한 서비스와 모델을 확인하고 설정을 변경하세요.</p></div><button id="show-ai-settings" type="button">연결 설정 변경</button></div><div id="ai-provider-list"></div><button id="refresh-ai-readiness" type="button">설정 상태 새로고침</button></section>
  <p id="ai-feedback" role="status" tabindex="-1"></p>
  <dialog id="ai-settings-dialog" aria-labelledby="ai-settings-title">
   <header class="dialog-header"><div><h2 id="ai-settings-title">AI 연결 설정</h2><p>AI 서비스와 모델을 선택하고 API 키 연결을 확인한 뒤 저장하세요.</p></div><button type="button" id="close-ai-settings" aria-label="AI 설정 닫기">×</button></header>
   <div class="ai-setup-body">
    <p id="ai-setup-readonly" class="callout">AI 설정 저장소 또는 암호화 설정을 사용할 수 없습니다. 운영관리자에게 문의해 주세요.</p>
    <label>1. AI 서비스<select id="ai-service"></select></label>
    <section class="ai-key-section"><h3>2. API 키 연결</h3><p id="ai-key-state">연결할 서비스를 선택해 주세요.</p>
     <input id="ai-key-input" type="password" autocomplete="off" placeholder="선택한 서비스의 API 키 입력" aria-label="API 키 연결 상태">
     <div class="ai-key-actions"><button type="button" id="ai-fill-demo">합성 키 사용</button><button type="button" id="ai-test-key">연결 확인</button><button type="button" id="ai-replace-key">키 교체</button><button type="button" id="ai-delete-key">키 삭제</button></div><p id="ai-test-feedback" role="status"></p>
    </section>
    <label>3. AI 모델<select id="ai-model"></select></label>
    <p id="ai-file-support" class="callout" hidden></p>
    <p id="ai-setup-feedback" role="alert" tabindex="-1"></p>
   </div>
   <footer class="dialog-actions"><p id="ai-save-state"></p><button type="button" id="done-ai-settings">취소</button><button type="button" id="ai-save-settings">저장</button></footer>
  </dialog>
 </div>`;
 q('.workspace').insertBefore(section,q('.v8-footer'));
 let loaded=false,readSequence=0,hasDemoInput=false,keyPending=false;
 const dialog=q('#ai-settings-dialog');
 const feedback=(text,target='#ai-setup-feedback')=>{q(target).textContent=text;};
 function render(){
  const saved=controller.saved,d=controller.draft,editable=controller.canManage&&!controller.busy;
  const name=id=>controller.services.find(s=>s.id===id)?.name||'AI 미설정';
  if(loaded)q('#ai-readiness').textContent=demo?'로컬 합성 설정 · 외부 호출 없음':'';
  q('#ai-provider-list').innerHTML=`<article class="ai-service-row"><div><strong>${E(name(saved.provider))}</strong><p>설정된 모델 <span id="ai-configured-model">${E(saved.model||'미설정')}</span></p></div><span id="ai-provider-state" class="badge" role="status"></span></article>`;
  q('#ai-provider-state').textContent=!loaded?'확인 필요':saved.enabled===null?'서버에서 관리':saved.enabled?'사용 중':'사용 안 함';
  q('#start-ai').hidden=saved.enabled===true;q('#stop-ai').hidden=saved.enabled!==true;
  q('#start-ai').disabled=!loaded||!controller.canManage||controller.busy;q('#stop-ai').disabled=!loaded||!controller.canManage||controller.busy;
  q('.ai-control-card').dataset.enabled=String(loaded&&saved.enabled===true);
  q('#ai-provider-state').dataset.enabled=String(loaded&&saved.enabled===true);
  if(loaded&&!saved.enabled&&!saved.connections[saved.provider]?.verified)q('#ai-provider-state').textContent='연결 필요';
  const options=(id,rows,value)=>{const el=q(id);el.replaceChildren(...rows.map(([v,t])=>new Option(t,v)));el.value=value;};
  options('#ai-service',[['','AI 서비스를 선택해 주세요'],...controller.services.map(s=>[s.id,s.name])],d.provider);
  options('#ai-model',[['','AI 모델을 선택해 주세요'],...(controller.services.find(s=>s.id===d.provider)?.models||[]).map(m=>[m,m])],d.model);
  q('#ai-service').disabled=!editable;q('#ai-model').disabled=!editable||!d.connections[d.provider]?.verified;
  q('#ai-model').title=controller.services.find(s=>s.id===d.provider)?.files===false?'이 연결은 파일 입력을 지원하지 않습니다. 텍스트 생성·추천·참고파일 없는 분석을 사용할 수 있습니다.':'';
  q('#ai-file-support').textContent=q('#ai-model').title;q('#ai-file-support').hidden=!q('#ai-model').title;
  q('#ai-setup-readonly').hidden=controller.canManage;
  q('#ai-key-input').disabled=!editable||!d.provider;
  const connection=d.connections[d.provider];
  q('#ai-key-state').textContent=connection?.verified?`연결 확인됨${connection.maskedKey?`(${connection.maskedKey})`:''}\u00a0\u00a0\u00a0※ 연결된 API 키는 일부만 표시됩니다.`:!controller.canManage?'키 관리 연결 준비 중':'연결을 확인해 주세요.';
  q('#ai-fill-demo').hidden=!demo;q('#ai-fill-demo').disabled=!editable||!d.provider;
  q('#ai-test-key').disabled=!editable||!hasDemoInput;
  q('#ai-replace-key').disabled=!editable||!connection;
  q('#ai-delete-key').disabled=!editable||!connection;
  q('#ai-save-settings').disabled=!editable||!controller.dirty||keyPending||(d.enabled&&!controller.ready);
  q('#ai-save-settings').textContent=controller.busy?'처리 중…':d.enabled&&!saved.enabled?'저장하고 사용':'저장';
  q('#ai-save-state').textContent=controller.dirty?'변경사항이 있습니다. 저장 전에는 적용되지 않습니다.':'현재 적용된 설정입니다.';
 }
 async function refresh(){
  if(!isAuthenticated())return;
  const id=++readSequence,code=agency.code;
  loaded=false;render();
  q('#refresh-ai-readiness').disabled=true;
  q('#ai-readiness').textContent='';
  try{await controller.load();if(id!==readSequence||code!==agency.code||!isAuthenticated())return;loaded=true;
   q('#ai-readiness').textContent=demo?'로컬 합성 설정 · 외부 호출 없음':'';
   render();
  }catch(error){if(id!==readSequence)return;loaded=false;controller.canManage=false;render();q('#ai-readiness').textContent=error.message||'상태를 조회하지 못했습니다.';q('#ai-provider-state').textContent='조회 실패';}
  finally{if(id===readSequence)q('#refresh-ai-readiness').disabled=false;}
 }
 function open(activate=false){if(!loaded)return;controller.open(activate);hasDemoInput=false;keyPending=false;q('#ai-key-input').value='';feedback('');feedback('','#ai-test-feedback');render();dialog.showModal();q('#close-ai-settings').focus();}
 function close(){
  if(controller.busy){feedback('처리가 끝난 뒤 닫아 주세요.');return;}
  if((controller.dirty||keyPending)&&!window.confirm('변경사항을 저장하지 않고 닫을까요?'))return;
  controller.cancel();hasDemoInput=false;keyPending=false;q('#ai-key-input').value='';dialog.close();
 }
 button.addEventListener('click',event=>{event.stopImmediatePropagation();if(isAuthenticated())activateView('ai-settings');});
 document.addEventListener('workspace-view-changed',event=>{if(event.detail==='ai-settings')refresh();});
 q('#refresh-ai-readiness').onclick=refresh;
 q('#show-ai-settings').onclick=()=>open();q('#start-ai').onclick=()=>open(true);
 q('#close-ai-settings').onclick=close;q('#done-ai-settings').onclick=close;
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 q('#ai-service').onchange=()=>{controller.choose(q('#ai-service').value);hasDemoInput=false;keyPending=false;q('#ai-key-input').value='';feedback('','#ai-test-feedback');render();};
 q('#ai-key-input').oninput=()=>{hasDemoInput=Boolean(q('#ai-key-input').value.trim());keyPending=true;render();};
 q('#ai-model').onchange=()=>{controller.draft.model=q('#ai-model').value;render();};
 q('#ai-fill-demo').onclick=()=>{hasDemoInput=true;keyPending=true;q('#ai-key-input').value='DEMO_ONLY_NOT_A_KEY';render();};
 q('#ai-replace-key').onclick=()=>{hasDemoInput=false;keyPending=true;q('#ai-key-input').value='';feedback('새 API 키를 입력한 뒤 연결을 확인해 주세요. 기존 연결은 저장 전까지 유지됩니다.','#ai-test-feedback');render();};
 q('#ai-delete-key').onclick=()=>{if(!window.confirm('이 연결을 삭제할까요? 저장하면 AI 사용이 중지됩니다.'))return;controller.remove();hasDemoInput=false;keyPending=false;render();};
 q('#ai-test-key').onclick=async()=>{
  const input=q('#ai-key-input').value;q('#ai-key-input').value='';hasDemoInput=false;
  const pending=controller.verify(input);render();feedback('연결 확인 중…','#ai-test-feedback');
  try{if(await pending){keyPending=false;feedback(demo?'합성 연결 확인 완료 · 실제 AI 호출 없음':'API 키 확인 완료 · 모델 선택 후 저장 시 실제 모델 호출을 검증합니다.','#ai-test-feedback');}}
  catch(error){feedback(error.message,'#ai-test-feedback');}finally{render();}
 };
 async function save(){
  const pending=controller.save();render();
  try{await pending;dialog.close();q('#ai-key-input').value='';feedback(demo?'로컬 합성 설정을 저장했습니다.':'이 계정의 AI 설정을 저장했습니다.','#ai-feedback');document.dispatchEvent(new Event('account-ai-settings-changed'));}
  catch(error){feedback(error.message);q('#ai-setup-feedback').focus();}
  finally{render();}
 }
 q('#ai-save-settings').onclick=save;
 q('#stop-ai').onclick=async()=>{
  if(!window.confirm('AI 사용을 중지할까요? 기존 설문과 제출은 유지됩니다.'))return;
  controller.open();controller.draft.enabled=false;
  const pending=controller.save();render();
  try{await pending;feedback(demo?'로컬 합성 AI 사용을 중지했습니다.':'이 계정의 AI 사용을 중지했습니다.','#ai-feedback');document.dispatchEvent(new Event('account-ai-settings-changed'));}
  catch(error){feedback(error.message,'#ai-feedback');}finally{render();}
 };
 window.addEventListener('beforeunload',event=>{if(dialog.open&&(controller.dirty||keyPending||controller.busy)){event.preventDefault();event.returnValue='';}});
 if((window.initialWorkspaceHash||location.hash)==='#ai-settings'&&isAuthenticated()){activateView('ai-settings',{replace:true});refresh();}
})();
