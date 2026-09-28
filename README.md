# 정비 지연 원인 분석 시뮬레이션 — 서버판 (경로 B)

정적 페이지(`index.html`) + Vercel 서버리스 함수 3개. 교육생은 링크만 열면 되고, AI 매칭과 실시간 대시보드는 서버에서 처리한다.

| 파일 | 역할 |
| --- | --- |
| `index.html` | 팀 화면 + 강사 대시보드 (한 파일) |
| `img/*.png` | 캐릭터 이미지 |
| `data/cards.json` | 카드 30장 (서버 매칭용) |
| `api/health.js` | 어떤 기능이 켜졌는지 페이지에 알림 |
| `api/match.js` | 요청 문장 → 카드 번호 (Claude API) |
| `api/state.js` | 팀 기록·진행 단계 저장 (Upstash Redis) |

## 동작 방식

- `ANTHROPIC_API_KEY`가 있으면 요청 매칭을 AI가 한다. 없거나 9초 안에 응답이 없으면 페이지의 동의어 사전으로 후퇴한다.
- Upstash 환경변수가 있으면 팀 기록이 서버에 저장되고 강사 대시보드가 4초마다 갱신된다. 없으면 결과 코드 방식으로 후퇴한다.
- 두 기능은 독립이다. 키 하나만 넣어도 그 기능만 켜진다.

## 배포 (처음 한 번)

1. 이 폴더를 GitHub 저장소로 올린다 (workflow.ai.kr 저장소의 하위 폴더로 넣을 거면 Vercel 프로젝트의 Root Directory를 그 폴더로 지정).
2. Vercel → Add New Project → 저장소 선택 → Framework Preset "Other" → Deploy.
3. Vercel 프로젝트 → Settings → Environment Variables:
   - `ANTHROPIC_API_KEY` = console.anthropic.com에서 발급한 키
   - `INSTRUCTOR_PIN` = 강사 비밀번호 (기본 2026)
4. 실시간 대시보드까지 쓰려면: Vercel 프로젝트 → Storage → Marketplace → Upstash Redis → Create → 이 프로젝트에 연결. `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`이 자동으로 들어간다.
5. 환경변수를 넣은 뒤 Deployments → 최신 배포 → Redeploy.
6. 확인: `https://<도메인>/api/health` 를 열면 `{"ok":true,"ai":true,"store":true}` 가 보여야 한다.

## 비용 감

- 매칭 1건 ≈ 입력 2.5천 토큰 + 출력 30토큰. Haiku 기준 팀 6개 × 12회 = 72건이면 한 차수 수십 원.
- Upstash 무료 구간(일 1만 명령)으로 충분하다. 강사 화면 폴링이 4초마다 1회이므로 2시간에 약 1,800회.

## 차수 운영

- 강사 화면 → 전체 초기화: 서버의 팀 기록과 단계를 지운다.
- 같은 날 두 반을 동시에 돌리면 `SIM_NAMESPACE`를 다르게 한 프로젝트를 하나 더 배포하거나, 한 반이 끝난 뒤 초기화한다.

## 다른 고객사 사례로 바꾸기

`index.html`의 `const CARDS = [` 블록과 `data/cards.json`을 함께 바꾼다. 매칭 규칙(`api/match.js`의 시스템 프롬프트)은 카드 내용을 자동으로 읽으므로 손댈 필요가 없다.
