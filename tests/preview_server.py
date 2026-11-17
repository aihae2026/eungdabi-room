"""Local synthetic review only. Does not load .env or call external services."""
from pathlib import Path
import argparse,sys,copy,json,subprocess
from http.server import ThreadingHTTPServer
parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4332);parser.add_argument('--ai-source',type=Path)
args=parser.parse_args();root=Path(__file__).resolve().parents[1]
if args.ai_source: args.ai_source=args.ai_source.resolve()
sys.path.insert(0,str(Path(__file__).resolve().parent/'support'))
from synthetic_fixture import make_handler
Base=make_handler(root,root/'tests/support')
class Review(Base):
 sessions={}
 templates={}
 def reply(self,data,status=200):
  if self.path=='/api/login' and isinstance(data,dict) and data.get('token'):
   self.sessions[data['token']]=data['agency']['type']
  if isinstance(data,dict) and 'templates' in data:
   data=copy.deepcopy(data)
   extra=list(self.templates.values())
   if '/intake/' in self.path:extra=[x for x in extra if x['status']=='active']
   data['templates'].extend(copy.deepcopy(extra))
  return super().reply(data,status)
 def api(self):
  from urllib.parse import urlsplit
  path=urlsplit(self.path).path
  token=self.headers.get('Authorization','').removeprefix('Bearer ')
  custom=path in ['/api/checklist-templates/ai-status','/api/checklist-templates/ai-draft'] or '/checklist-templates/local-r9-' in path or (path=='/api/checklist-templates' and self.command=='POST')
  if custom and self.sessions.get(token)!='central':return self.reply({'message':'중앙기관 합성 검토 세션이 필요합니다.'},403)
  if path=='/api/checklist-templates' and self.command=='POST':
   body=self.read_body()
   if body is None:return
   ident='local-r9-'+str(len(self.templates)+1)
   self.templates[ident]={**body,'id':ident,'status':'draft','updatedAt':'2026-09-09T16:00:00+09:00'}
   return self.reply({'template':self.templates[ident]},201)
  if '/checklist-templates/local-r9-' in path:
   ident=path.split('/')[3];template=self.templates.get(ident)
   if not template:return self.reply({'message':'양식이 없습니다.'},404)
   if self.command=='PATCH':
    body=self.read_body()
    if body is None:return
    self.templates[ident]={**template,**body,'id':ident,'status':template['status']}
   elif self.command=='POST' and path.endswith('/activate'):template['status']='active'
   elif self.command=='POST' and path.endswith('/close'):template['status']='closed'
   return self.reply({'template':self.templates[ident]})
  if self.path=='/api/checklist-templates/ai-status' and self.command=='GET':
   return self.reply({'configured':True,'connectionVerified':False,'model':'local-fixture-model','provider':'local-fixture','questionCount':{'min':3,'max':100}})
  if self.path=='/api/checklist-templates/ai-draft' and self.command=='POST':
   body=self.read_body()
   if body is None:return
   count=body.get('questionCount',10)
   if not isinstance(count,int) or not 3<=count<=100:return self.reply({'message':'문항 수는 3~100개입니다.'},400)
   return self.reply({'model':'local-fixture-model','draft':{'title':'[로컬 테스트] '+body.get('topic','설문'),'description':'외부 API 호출 없는 합성 응답','targetAudience':body.get('targetAudience','합성 참여자'),'status':'draft','generationMethod':'ai_text','questions':[{'questionNo':i+1,'questionText':f'{i+1}. 합성 서비스 안내를 이해하기 쉬웠나요?','answerType':'single_choice','required':True,'options':[{'optionText':'예','score':0,'displayOrder':1},{'optionText':'아니오','score':0,'displayOrder':2}]} for i in range(count)]}})
  return super().api()
class Preview(Review):
 def reply(self,data,status=200):
  if self.path=='/api/fixture-info':
   data={**data,'fixtureBaseSha':data.get('sourceSha'),'sourceSha':subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip(),'workingTreeChanges':True,'localDraftWrites':True}
  return super().reply(data,status)
 def do_GET(self):
  from urllib.parse import urlsplit
  route=urlsplit(self.path).path
  target=None
  if route=='/favicon.ico':
   self.send_response(204);self.end_headers();return
  if route=='/__review_source':
   return self.reply({'uiPath':str(root),'uiBranch':subprocess.check_output(['git','-C',str(root),'branch','--show-current'],text=True).strip(),'base':subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip(),'aiPath':str(args.ai_source) if args.ai_source else None,'synthetic':True})
  if route=='/index.html':
   data=(root/'index.html').read_text()
   if args.ai_source:
    marker='<script src="assets/ai-status-workspace.js'
    data=data.replace(marker,'<script src="assets/ai-settings-state.js"></script><script src="/review-ai-demo.js"></script>'+marker)
   body=data.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(body);return
  if args.ai_source and route in ['/assets/ai-status-workspace.js','/assets/v8-ai-settings.css','/assets/ai-settings-state.js','/assets/ai-connection.js']:
   target=args.ai_source/route.lstrip('/')
  elif args.ai_source and route=='/review-ai-demo.js':target=args.ai_source/'tests/support/ai-settings-demo.js'
  elif route=='/assets/v8-form-validation.js':target=root/'assets/v8-form-validation.js'
  if target:
   body=target.read_bytes();self.send_response(200);self.send_header('Content-Type',self.guess_type(str(target)));self.end_headers();self.wfile.write(body);return
  return super().do_GET()
print('Synthetic review: http://127.0.0.1:'+str(args.port)+'/github-bridge.html?role=central&view=home&auto=1',flush=True)
ThreadingHTTPServer(('127.0.0.1',args.port),Preview).serve_forever()
