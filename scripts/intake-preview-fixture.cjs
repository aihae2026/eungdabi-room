// Explicit local preview only: synthetic records, no production connection or persistence.
const agency = {code:'PREVIEW001',name:'디자인 미리보기 기관',type:'agency'};
const template = {id:'preview-wellbeing',title:'안부 확인',scoringEnabled:false,questions:[
  {id:'mood',questionText:'오늘 기분은 어떠신가요?',answerType:'single_choice',required:true,options:[
    {id:'good',optionText:'좋아요',score:0},{id:'normal',optionText:'보통이에요',score:0},{id:'bad',optionText:'좋지 않아요',score:0}
  ]},
  {id:'support',questionText:'어떤 도움이 필요하신가요?',answerType:'multiple_choice',required:false,options:[
    {id:'talk',optionText:'이야기를 나누고 싶어요',score:0},{id:'walk',optionText:'산책을 함께 하고 싶어요',score:0}
  ]},
  {id:'note',questionText:'전하고 싶은 이야기가 있나요?',answerType:'textarea',required:false,options:[]}
]};
module.exports=(pathname,method,body)=>{
 if(pathname==='/api/institutions/PREVIEW001')return {body:{agency}};
 if(pathname==='/api/intake/login')return body.agencyCode===agency.code&&body.password==='mock1234'?{body:{agency,token:'local-design-preview'}}:{status:401,body:{message:'미리보기 비밀번호는 mock1234입니다.'}};
 if(pathname==='/api/intake/checklist-templates')return {body:{templates:[template]}};
 if(pathname==='/api/intake/checklist-templates/'+template.id)return {body:{template}};
 if(pathname==='/api/submissions'&&method==='POST')return {body:{id:'preview-only-not-saved'}};
 return null;
};
