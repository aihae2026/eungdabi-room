/* Injected ONLY by the local review server, never referenced by product HTML. */
(() => {
 if (!['127.0.0.1','localhost'].includes(location.hostname)) return;
 let state={enabled:false,provider:'',model:'',connections:{},revision:0};
 const clone=v=>JSON.parse(JSON.stringify(v));
 window.RecoveryAIScenario={verifyFailure:false,saveFailure:false,conflict:false};
 const services=[['gemini','Google Gemini'],['openai','OpenAI'],['anthropic','Anthropic Claude'],['xai','xAI Grok'],['other','기타 AI 서비스']].map(([id,name])=>({id,name,models:['fixture-'+id+'-model']}));
 window.RecoveryAIAdapter={localDemo:true,
  async read(){return {state:clone(state),services,canManage:true};},
  async verify({provider,input}){await new Promise(r=>setTimeout(r,80));if(window.RecoveryAIScenario.verifyFailure)throw Error('합성 연결 실패 · 기존 설정은 유지됩니다.');if(input!=='DEMO_ONLY_NOT_A_KEY')throw Error('합성 입력만 허용합니다.');return {verified:true,handle:'fixture-connection-'+provider};},
  async save(draft){await new Promise(r=>setTimeout(r,80));if(window.RecoveryAIScenario.conflict)throw Error('다른 관리자가 설정을 변경했습니다. 취소 후 새로고침해 주세요.');if(window.RecoveryAIScenario.saveFailure)throw Error('합성 저장 실패 · 입력한 설정과 기존 적용 상태는 유지됩니다.');if(draft.revision!==state.revision)throw Error('설정 버전이 변경되었습니다.');state={...clone(draft),revision:state.revision+1};return clone(state);}
 };
})();

