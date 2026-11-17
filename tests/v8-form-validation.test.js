const test=require('node:test'),assert=require('node:assert/strict');
const {errors}=require('../assets/v8-form-validation.js');
const form=()=>({title:'합성 설문',estimatedMinutes:10,questions:[{questionText:'합성 질문',answerType:'single_choice',options:[{optionText:'예',score:0},{optionText:'아니오',score:1}]}]});
test('valid form has no errors',()=>assert.deepEqual(errors(form()),[]));
test('missing title and question produce separate actionable errors',()=>{const f=form();f.title='';f.questions[0].questionText='';const e=errors(f);assert.equal(e.length,2);assert.equal(e[0].selector,'#templateTitle');});
test('duplicates and invalid scores are rejected',()=>{const f=form();f.questions[0].options[1]={optionText:'예',score:'invalid'};assert.equal(errors(f).length,2);});
test('duration rejects decimals and out-of-range values',()=>{for(const n of [0,121,1.5]){const f=form();f.estimatedMinutes=n;assert.match(errors(f)[0].message,/1~120/);}});
test('empty question list has an add-question focus target',()=>{const f=form();f.questions=[];assert.equal(errors(f)[0].selector,'#addTemplateQuestionButton');});

