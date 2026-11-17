/* Presentation-only shell bindings; production authorization stays in the existing API. */
(() => {
  const menu=document.querySelector('#mobileWorkMenu');
  const account=document.querySelector('.account-area');
  document.querySelector('.sidebar').append(account);
  function sync(){
    const buttons=[...document.querySelectorAll('.nav-tab')].filter(b=>!b.hidden&&b.style.display!=='none');
    const active=buttons.find(b=>b.classList.contains('is-active'));
    menu.replaceChildren(...buttons.map(b=>new Option(b.textContent.trim(),b.dataset.view)));
    if(active)menu.value=active.dataset.view;
  }
  menu.addEventListener('change',()=>{document.querySelector(`.nav-tab[data-view="${CSS.escape(menu.value)}"]`)?.click();sync();});
  document.addEventListener('workspace-view-changed',sync);
  new MutationObserver(sync).observe(document.querySelector('#appShell'),{attributes:true,attributeFilter:['class']});
  let baseline='';
  document.addEventListener('template-editor-loaded',()=>{baseline=JSON.stringify(collectTemplateForm());});
  function unsaved(){
    if(!document.querySelector('#view-checklist-templates').classList.contains('is-active'))return false;
    const editor=document.querySelector('#templateEditorPanel');
    if(!editor.classList.contains('is-hidden')){
      const value=collectTemplateForm();
      if(!document.querySelector('#templateId').value)return Boolean(value.title||value.description||value.questions.some(q=>q.questionText.trim()));
      return baseline&&JSON.stringify(value)!==baseline;
    }
    if(!document.querySelector('#aiDraftPanel').classList.contains('is-hidden'))return Boolean(document.querySelector('#aiDraftTopic').value.trim()||document.querySelector('#aiDraftRequirements').value.trim());
    if(!document.querySelector('#aiFileDraftPanel').classList.contains('is-hidden'))return aiDraftFiles.length>0;
    return false;
  }
  // Disabled can mean no AI connection or a read-only form, not an in-flight request.
  const busy=()=>Boolean(document.querySelector('#view-checklist-templates [data-processing="true"]'));
  const leaving='[data-v8-area],[data-template-id],.template-filter,[data-v8-forms],[data-v8-template],.nav-tab,#logoutButton,#backToTemplateLibrary,#newTemplateButton,#openAiDraftButton,#openAiFileDraftButton,#closeAiDraftButton,#closeAiFileDraftButton';
  document.addEventListener('click',event=>{
    if(!event.target.closest(leaving))return;
    if(busy()){event.preventDefault();event.stopImmediatePropagation();showToast('진행 중인 작업이 끝난 뒤 이동해 주세요.');sync();return;}
    if(unsaved()&&!window.confirm('저장하지 않은 변경을 버리고 이동할까요? 취소하면 계속 작성합니다.')){event.preventDefault();event.stopImmediatePropagation();sync();}
  },true);
  window.addEventListener('popstate',event=>{
    if(busy()||(unsaved()&&!window.confirm('저장하지 않은 변경을 버리고 이동할까요? 취소하면 계속 작성합니다.'))){
      event.stopImmediatePropagation();
      history.pushState({view:'checklist-templates'},'',location.pathname+location.search+'#checklist-templates');
    }
  },true);
  window.addEventListener('beforeunload',event=>{if(unsaved()||busy()){event.preventDefault();event.returnValue='';}});
  document.querySelector('#backToTemplateLibrary').addEventListener('click',()=>{
    setTemplateWorkspaceMode('list');
    document.querySelector('#pageTitle').scrollIntoView({block:'start'});
  });
  const aliases={forms:'checklist-templates',submissions:'dashboard',list:'dashboard',statistics:'stats',orgs:'master',agencies:'master',management:'master',progress:'stats'};
  function alias(){const route=location.hash.slice(1);if(aliases[route])activateView(aliases[route],{replace:true});}
  window.addEventListener('hashchange',alias);alias();sync();
})();
