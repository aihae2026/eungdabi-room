/* Existing authenticated API contract. No provider credentials enter the browser. */
(function(root){
  'use strict';
  function validate(request){
    const topic=String(request.topic||'').trim(), targetAudience=String(request.targetAudience||'').trim();
    const requirements=String(request.requirements||'').trim(), questionCount=Number(request.questionCount);
    if(!topic||topic.length>500)throw new Error('조사 주제를 1~500자로 입력해 주세요.');
    if(!targetAudience||targetAudience.length>300)throw new Error('조사 대상을 1~300자로 입력해 주세요.');
    if(requirements.length>1000)throw new Error('추가 요구사항은 1,000자 이하여야 합니다.');
    if(!Number.isInteger(questionCount)||questionCount<3||questionCount>100)throw new Error('문항 수를 3~100 사이의 정수로 입력해 주세요.');
    return {topic,targetAudience,requirements,questionCount};
  }
  async function status(api){
    if (typeof location !== 'undefined' && ['127.0.0.1','localhost'].includes(location.hostname) && root.RecoveryAIAdapter?.localDemo === true) {
      const {state}=await root.RecoveryAIAdapter.read();
      return {configured:state.enabled === true && Boolean(state.connections[state.provider]?.verified) && Boolean(state.model), model:state.model, connectionVerified:false, localDemo:true};
    }
    return api('/checklist-templates/ai-status');
  }
  async function generateText(api,request){
    const body=validate(request);
    const state=await status(api);
    if(!state.configured)throw new Error('AI 연동 설정에서 이 계정의 AI를 연결하고 사용 설정해 주세요. 입력한 요청은 유지됩니다.');
    const result=await api('/checklist-templates/ai-draft',{method:'POST',body});
    if(!result?.draft||result.draft.status!=='draft'||!Array.isArray(result.draft.questions)||!result.draft.questions.length)throw new Error('AI 초안 응답 형식을 확인할 수 없습니다. 기존 문항은 유지됩니다.');
    return result;
  }
  const api=Object.freeze({validate,status,generateText});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.EungdabiroomAI=api;
})(globalThis);

// UI gating is advisory; every server AI route independently checks this account.
if (typeof document !== 'undefined') (() => {
  let sequence=0;
  async function refresh() {
    const id=++sequence;
    const text=document.querySelector('#generateAiDraftButton'), file=document.querySelector('#generateAiFileDraftButton');
    if(!text||!file||typeof isAuthenticated!=='function'||!isAuthenticated())return;
    const code=agency.code;
    text.disabled=true;file.disabled=true;
    try {
      const state=await EungdabiroomAI.status(apiRequest);
      if(id!==sequence||code!==agency.code)return;
      text.disabled=text.dataset.processing==='true'||!state.configured;file.disabled=file.dataset.processing==='true'||!state.configured||!state.files;
      text.title=state.configured?'':'AI 연동 설정에서 이 계정의 AI를 연결하고 사용 설정해 주세요.';
      file.title=!state.configured?text.title:!state.files?'선택한 AI 연결은 파일 입력을 지원하지 않습니다.':'';
      if(!state.configured) document.querySelector('#aiDraftStatus').textContent=text.title;
      if(file.disabled) document.querySelector('#aiFileDraftStatus').textContent=file.title;
    } catch(e) {
      if(id!==sequence||code!==agency.code)return;
      text.title=file.title=e.message;
      document.querySelector('#aiDraftStatus').textContent=e.message;
      document.querySelector('#aiFileDraftStatus').textContent=e.message;
    }
  }
  document.addEventListener('template-workspace-changed',refresh);
  document.addEventListener('account-ai-settings-changed',refresh);
  document.addEventListener('account-ai-readiness-refresh',refresh);
  document.addEventListener('workspace-view-changed',event=>{if(event.detail==='checklist-templates')refresh();});
})();
