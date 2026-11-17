/* Client-side guidance; the server remains the authority for saved forms. */
(function(root){
  function errors(form) {
    const list=[], add=(selector,message)=>list.push({selector,message});
    if (!String(form.title||'').trim()) add('#templateTitle','설문 제목을 입력해 주세요.');
    if (form.estimatedMinutes !== '' && form.estimatedMinutes != null &&
       (!Number.isInteger(Number(form.estimatedMinutes)) || Number(form.estimatedMinutes)<1 || Number(form.estimatedMinutes)>120))
      add('#templateEstimatedMinutes','예상 시간은 1~120 사이의 정수로 입력해 주세요.');
    if (!form.questions?.length) add('#addTemplateQuestionButton','문항을 한 개 이상 추가해 주세요.');
    (form.questions||[]).forEach((q,i)=>{
      const base='.template-question-card:nth-child('+(i+1)+')';
      if (!q.questionText.trim()) add(base+' [data-question-field="questionText"]',(i+1)+'번 문항을 입력해 주세요.');
      if (!['single_choice','multiple_choice'].includes(q.answerType)) return;
      if (q.options.length<2) add(base+' [data-question-field="questionText"]',(i+1)+'번 문항에 선택지를 두 개 이상 추가해 주세요.');
      const seen=new Set();
      q.options.forEach((o,j)=>{
        const selector=base+' .template-option-row:nth-child('+(j+1)+')';
        const label=String(o.optionText||'').trim();
        if (!label || seen.has(label)) add(selector+' [data-option-field="optionText"]',(i+1)+'번 문항의 '+(j+1)+'번 선택지를 '+(!label?'입력해 주세요.':'다르게 입력해 주세요. 앞선 선택지와 같습니다.'));
        seen.add(label);
        if (String(o.score).trim()==='' || !Number.isFinite(Number(o.score))) add(selector+' [data-option-field="score"]',(i+1)+'번 문항의 선택지 점수를 숫자로 입력해 주세요.');
      });
    });
    return list;
  }
  if (typeof module!=='undefined') module.exports={errors};
  if (typeof document==='undefined') return;
  function summary(){
    let el=document.querySelector('#v8FormErrors');
    if (!el){el=document.createElement('div');el.id='v8FormErrors';el.setAttribute('role','alert');el.tabIndex=-1;document.querySelector('#templateEditor').prepend(el);}
    return el;
  }
  function focus(el){if(!el)return;el.style.scrollMarginTop='160px';el.focus({preventScroll:true});el.scrollIntoView({block:'center'});}
  function clear(){
    document.querySelectorAll('[data-v8-field-error]').forEach(el=>el.remove());
    document.querySelectorAll('[data-v8-invalid]').forEach(el=>{
      const id=el.dataset.v8Invalid;
      const rest=(el.getAttribute('aria-describedby')||'').split(' ').filter(x=>x&&x!==id).join(' ');
      if(rest)el.setAttribute('aria-describedby',rest);else el.removeAttribute('aria-describedby');
      el.removeAttribute('aria-invalid');delete el.dataset.v8Invalid;
    });summary().replaceChildren();
  }
  function validate(){
    clear();
    const form=collectTemplateForm();
    form.questions.forEach((q,i)=>q.options.forEach((o,j)=>{
      o.score=document.querySelectorAll('.template-question-card')[i].querySelectorAll('[data-option-field="score"]')[j].value;
    }));
    const problems=errors(form);
    if(!problems.length)return true;
    const heading=document.createElement('strong');heading.textContent='입력 내용을 '+problems.length+'곳 확인해 주세요.';summary().append(heading);
    const ul=document.createElement('ul');summary().append(ul);
    let first;
    problems.forEach((p,i)=>{
      const control=document.querySelector(p.selector);
      if(control){first ||= control;const error=document.createElement('span');error.id='v8-field-error-'+i;error.dataset.v8FieldError='';error.className='field-error';error.textContent=p.message;
        control.after(error);control.setAttribute('aria-invalid','true');control.dataset.v8Invalid=error.id;
        control.setAttribute('aria-describedby',[control.getAttribute('aria-describedby'),error.id].filter(Boolean).join(' '));}
      const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=p.message;button.onclick=()=>focus(control||summary());li.append(button);ul.append(li);
    });focus(first||summary());return false;
  }
  root.V8FormValidation={validate,serverError(message){summary().textContent=message;focus(summary());}};
  document.addEventListener('template-editor-loaded',clear);
})(typeof window==='undefined'?globalThis:window);

