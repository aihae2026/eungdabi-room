"""Read-only synthetic API for the unmodified GitHub UI.

Launcher integration: make_handler(pack_root / 'github', pack_root / 'github-fixture').
The returned handler serves original index.html/intake.html/assets at their original
URLs and github-bridge.html/js from bridge_dir. No outbound requests or durable writes.
This is UI fixture access, not authentication, authorization, or persistence testing.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
import argparse
import copy
import json
import secrets
import threading

SOURCE_SHA = '6f6ffce2e3425756475b47e732b8b398f7f11d2c'
FIXTURE_PASSWORD = 'fixture-preview-only'
ROLE_CODES = {'central': 'SAMPLECENTRAL', 'regional': 'SAMPLEREG01',
              'agency': 'SAMPLEAG001', 'user': 'SAMPLEAG001'}


def make_fixture(source_dir):
    """Preserve the institutions, 30 responses and two templates of a_fixture_server.py."""
    raw = (source_dir / 'assets' / 'institutions.js').read_text(encoding='utf-8')
    institutions = json.loads(raw.split('=', 1)[1].strip().rstrip(';'))
    central = {'code': 'SAMPLECENTRAL', 'name': '가상 중앙지원기관', 'type': 'central',
               'sido': '전체', 'sigungu': '전체', 'active': True}
    institutions = [central] + institutions
    rows = []
    for n in range(1, 31):
        agency = next(i for i in institutions if i['code'] == ('SAMPLEAG001' if n <= 24 else 'SAMPLEAG004'))
        kind = ['fall', 'depression', 'memory'][(n - 1) % 3]
        rows.append(dict(
            id=f'S-{n:03}', agencyCode=agency['code'], institutionName=agency['name'],
            sido=agency['sido'], institutionSigungu=agency['sigungu'], checklistType=kind,
            submittedAt=f'2026-09-{2 + (n - 1) // 7:02}T09:30:00+09:00',
            workerName='가상조사자', workerPhone='010-0000-0000',
            clientName='가상대상자 ' + str(n).zfill(2), clientGender='여성',
            clientBirth='1950-01-01', clientId='100' + str(n).zfill(4),
            status='확인 대기' if n % 4 else '확인 완료', totalScore=0,
            answers=[{'questionNo': i + 1, 'questionText': q, 'answerLabel': '아니오', 'score': 0}
                     for i, q in enumerate(['실내 이동 동선에 걸려 넘어질 물건이 있나요?',
                                            '자주 사용하는 공간의 조명은 충분한가요?'])],
            fieldMemo='합성 검수 자료. 실제 점수 및 척도 검증 대상 아님.'))
    templates = [
        {'id': 'fixture-draft', 'title': '합성 직원 업무 지원 설문', 'status': 'draft',
         'generationMethod': 'manual', 'updatedAt': '2026-09-06T10:00:00+09:00',
         'description': 'UI 비교용 합성 양식', 'purpose': '직원 업무 지원',
         'targetAudience': '직원', 'estimatedMinutes': 3, 'scoringEnabled': False,
         'questions': [{'questionNo': 1, 'questionText': '업무 중 어떤 지원이 필요한가요?',
                        'required': True, 'answerType': 'multiple_choice', 'helpText': '여러 개 선택',
                        'options': [{'label': '일정 지원', 'value': 'a', 'score': 0},
                                    {'label': '교육 지원', 'value': 'b', 'score': 0}]}]},
        {'id': 'fixture-active', 'title': '합성 운영 설문', 'status': 'active',
         'generationMethod': 'manual', 'updatedAt': '2026-09-06T10:00:00+09:00',
         'description': 'UI 비교용 합성 양식', 'targetAudience': '직원', 'scoringEnabled': False,
         'questions': [{'questionNo': 1, 'questionText': '업무 안내가 충분한가요?',
                        'required': True, 'answerType': 'single_choice',
                        'options': [{'label': '충분함', 'value': 'a', 'score': 0},
                                    {'label': '부족함', 'value': 'b', 'score': 0}]}]},
    ]
    return institutions, rows, templates


def template_payload(template):
    """Adapt the old fixture labels to the original API's id/optionText contract.

    Content and stored seed data are unchanged. Original assets/app.js and
    assets/intake.js both consume netlify/functions/api-legacy.cjs's DTO shape.
    """
    result = copy.deepcopy(template)
    for index, question in enumerate(result['questions'], 1):
        question['id'] = f"{result['id']}-q{index}"
        question.setdefault('helpText', '')
        for position, option in enumerate(question['options'], 1):
            option['id'] = f"{question['id']}-o{position}"
            option['optionText'] = option['label']
            option['displayOrder'] = position
            option['requiresText'] = False
            option['textPlaceholder'] = ''
    return result


def make_handler(source_dir, bridge_dir=None):
    source = Path(source_dir).resolve()
    bridge = Path(bridge_dir or Path(__file__).parent).resolve()
    institutions, rows, templates = make_fixture(source)
    by_code = {i['code']: i for i in institutions}
    sessions = {}
    session_lock = threading.Lock()

    class GithubFixtureHandler(SimpleHTTPRequestHandler):
        """Original static bytes plus an explicitly bounded local fixture API."""
        def __init__(self, *args, **kwargs):
            kwargs.pop('directory', None)
            super().__init__(*args, directory=str(source), **kwargs)

        def log_message(self, *args):
            # Do not log bodies, credentials, query values, or submission content.
            pass

        def end_headers(self):
            port = self.server.server_port
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy',
                "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; font-src 'self'; "
                f"connect-src http://127.0.0.1:{port}/api/ http://localhost:{port}/api/; "
                "frame-src 'self'; frame-ancestors 'self' http://127.0.0.1:* http://localhost:*; "
                "form-action 'self'; base-uri 'self'; object-src 'none'; worker-src 'none'")
            super().end_headers()

        def reply(self, data, status=200):
            body = json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def send_head(self):
            path = unquote(urlsplit(self.path).path)
            if path in ('/', '/github-bridge.html', '/github-bridge.js'):
                name = 'github-bridge.html' if path == '/' else path[1:]
                target = bridge / name
            elif path in ('/index.html', '/intake.html') or path.startswith('/assets/'):
                target = (source / path.lstrip('/')).resolve()
                if not target.is_relative_to(source) or any(p.startswith('.') for p in Path(path).parts):
                    self.send_error(404)
                    return None
            else:
                self.send_error(404, 'Only original UI files are served')
                return None
            if not target.is_file():
                self.send_error(404)
                return None
            stream = target.open('rb')
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(str(target)))
            self.send_header('Content-Length', str(target.stat().st_size))
            self.end_headers()
            return stream

        def read_body(self):
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 <= size <= 1024 * 1024:
                    raise ValueError()
                body = json.loads(self.rfile.read(size) or b'{}')
                if not isinstance(body, dict):
                    raise ValueError()
                return body
            except (ValueError, UnicodeError):
                self.reply({'message': '합성 검토 요청 형식이 올바르지 않습니다.'}, 400)
                return None

        def api(self):
            parsed = urlsplit(self.path)
            path = unquote(parsed.path[4:])
            query = parse_qs(parsed.query)
            q = lambda key, default='': query.get(key, [default])[0]
            if self.command == 'GET' and path == '/fixture-info':
                return self.reply({'sourceSha': SOURCE_SHA, 'synthetic': True,
                    'fixturePassword': FIXTURE_PASSWORD, 'roleCodes': ROLE_CODES,
                    'writesSupported': False, 'responseCount': len(rows),
                    'authenticationVerified': False, 'persistenceVerified': False})
            if self.command == 'POST' and path in ('/login', '/intake/login'):
                body = self.read_body()
                if body is None:
                    return
                code = str(body.get('agencyCode', '')).strip().upper()
                agency = by_code.get(code)
                if (not agency or agency.get('active') is False
                    or body.get('password') != FIXTURE_PASSWORD
                    or (path == '/intake/login' and agency['type'] != 'agency')):
                    return self.reply({'message': '실제 비밀번호를 사용하지 마세요. 비교 진입 화면에서 합성 검토로 접속해 주세요.'}, 401)
                token = 'github-ui-fixture-' + secrets.token_urlsafe(24)
                with session_lock:
                    sessions[token] = (agency, 'intake' if path.startswith('/intake/') else 'admin')
                return self.reply({'agency': agency, 'token': token, 'synthetic': True})
            if self.command != 'GET':
                return self.reply({'message': '합성 비교 서버: 저장·제출·삭제·상태·비밀번호·AI 생성은 연결하지 않았습니다. 변경되지 않았습니다.',
                                   'code': 'FIXTURE_WRITE_UNSUPPORTED'}, 501)
            # Original intake looks up its public institution before fixture login.
            if path.startswith('/institutions/'):
                agency = by_code.get(path.split('/')[-1])
                return self.reply({'agency': agency}, 200 if agency else 404)
            token = self.headers.get('Authorization', '').removeprefix('Bearer ')
            with session_lock:
                session = sessions.get(token)
            if not session:
                return self.reply({'message': '로컬 합성 검토 세션이 필요합니다. 비교 진입 화면에서 다시 열어 주세요.'}, 401)
            agency, access = session
            if access == 'intake' and not path.startswith('/intake/checklist-templates'):
                return self.reply({'message': '이 합성 세션은 사용자 설문 조회용입니다.'}, 403)
            agencies = [i for i in institutions if i['type'] == 'agency' and (
                agency['type'] == 'central' or
                (agency['type'] == 'regional' and i.get('parentCode') == agency['code']) or
                i['code'] == agency['code'])]
            data = [r for r in rows if r['agencyCode'] in {i['code'] for i in agencies}]
            for param, field in [('status', 'status'), ('type', 'checklistType'),
                                 ('agencyCode', 'agencyCode'), ('sido', 'sido'),
                                 ('sigungu', 'institutionSigungu')]:
                if q(param):
                    data = [r for r in data if r[field] == q(param)]
            if q('search'):
                data = [r for r in data if q('search') in ' '.join(str(r.get(k, ''))
                        for k in ('id', 'workerName', 'clientName', 'institutionName'))]
            if q('startDate'):
                data = [r for r in data if r['submittedAt'][:10] >= q('startDate')]
            if q('endDate'):
                data = [r for r in data if r['submittedAt'][:10] <= q('endDate')]
            if path == '/institutions':
                return self.reply({'institutions': institutions if agency['type'] == 'central' else [agency] + [i for i in agencies if i['code'] != agency['code']]})
            if path == '/home-summary':
                summary = {kind: {'total': len([r for r in data if kind == 'total' or r['checklistType'] == kind]), 'today': 0}
                           for kind in ('total', 'fall', 'depression', 'memory')}
                return self.reply({'summary': summary, 'recent': data[-5:][::-1],
                                   'riskSummary': {'fall': 0, 'depression': 0, 'memory': 0}})
            if path == '/submissions/export':
                return self.reply({'rows': data, 'truncated': False})
            if path == '/submissions':
                try:
                    page, limit = max(1, int(q('page', '1'))), min(5000, max(1, int(q('limit', '20'))))
                except ValueError:
                    return self.reply({'message': '페이지 숫자가 올바르지 않습니다.'}, 400)
                start = (page - 1) * limit
                return self.reply({'rows': data[start:start + limit], 'pagination': {
                    'page': page, 'limit': limit, 'totalCount': len(data),
                    'totalPages': max(1, (len(data) + limit - 1) // limit),
                    'start': start + 1 if start < len(data) else 0, 'end': min(start + limit, len(data))}})
            if path.startswith('/submissions/'):
                item = next((r for r in data if r['id'] == path.split('/')[-1]), None)
                return self.reply({'submission': item}, 200 if item else 404)
            if path == '/stats':
                stats = []
                for institution in agencies:
                    subset = [r for r in data if r['agencyCode'] == institution['code']]
                    stat = {'institution_name': institution['name'], 'institution_code': institution['code'],
                            'sido': institution['sido'], 'sigungu': institution['sigungu'],
                            'total': len(subset), 'unique_clients': len(subset)}
                    for kind in ('fall', 'depression', 'memory'):
                        items = [r for r in subset if r['checklistType'] == kind]
                        stat.update({kind + '_total': len(items), kind + '_waiting': sum(r['status'] == '확인 대기' for r in items),
                                     kind + '_done': sum(r['status'] == '확인 완료' for r in items)})
                        for suffix in ('low', 'medium', 'high', 'none', 'normal', 'risk'):
                            stat[kind + '_' + suffix] = len(items) if suffix in ('low', 'none', 'normal') else 0
                    stats.append(stat)
                return self.reply({'rows': stats, 'queriedAt': '2026-09-07T13:00:00+09:00'})
            if path in ('/checklist-templates', '/intake/checklist-templates'):
                return self.reply({'templates': [template_payload(t) for t in templates if
                    (not q('status') or t['status'] == q('status')) and
                    (not path.startswith('/intake/') or t['status'] == 'active')]})
            if path.startswith(('/checklist-templates/', '/intake/checklist-templates/')):
                item = next((t for t in templates if t['id'] == path.split('/')[-1]
                             and (not path.startswith('/intake/') or t['status'] == 'active')), None)
                return self.reply({'template': template_payload(item) if item else None}, 200 if item else 404)
            return self.reply({'message': '지원하지 않는 합성 비교 API입니다.'}, 404)

        def do_GET(self):
            if urlsplit(self.path).path.startswith('/api/'):
                return self.api()
            return super().do_GET()

        def do_POST(self):
            if urlsplit(self.path).path.startswith('/api/'):
                return self.api()
            return self.reply({'message': '정적 원본 파일은 변경할 수 없습니다.'}, 405)

        do_PATCH = do_POST
        do_PUT = do_POST
        do_DELETE = do_POST

    return GithubFixtureHandler


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path(__file__).parent.parent / 'github')
    parser.add_argument('--bridge', type=Path, default=Path(__file__).parent)
    parser.add_argument('--port', type=int, default=4325)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(args.source, args.bridge))
    print(f'GitHub original UI with synthetic API: http://127.0.0.1:{args.port}/github-bridge.html', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
