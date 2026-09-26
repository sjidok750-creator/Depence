# Tiny Bastion · 작은 요새

아기자기한 캐릭터와 부드러운 조작감의 **타워 디펜스 게임**입니다.
이미지·오디오 파일 없이 순수 HTML5 Canvas + ES 모듈로만 만들어져 어디서나 바로 실행됩니다.

- 3개의 맵 (초원 길 · 굽이진 강 · 쌍둥이 길) × 3단계 난이도
- 5종 타워 (궁수 · 대포 · 서리 · 번개 · 저격), 각 3레벨 업그레이드, 4가지 타겟 방식
- 9종 적 (슬라임 · 도깨비불 · 박쥐 · 딱정벌레 · 골렘 · 주술사 + 보스 3종)
- 30 웨이브 + 클리어 후 무한 모드, 최고 기록 저장
- 합성 사운드 이펙트와 생성형 배경 음악 (Web Audio)
- 키보드 단축키, 터치 지원, 세로 화면 레이아웃, 탭 전환 시 자동 일시정지

## 실행

ES 모듈을 사용하므로 `file://`이 아닌 HTTP로 열어야 합니다.

```bash
npm start          # http://localhost:8080
```

혹은 아무 정적 서버(`python3 -m http.server`, VS Code Live Server 등)로 저장소 루트를 열면 됩니다.
GitHub Pages 배포 워크플로(`.github/workflows/pages.yml`)도 포함되어 있어 `main`에 푸시하면 자동 배포됩니다.

## 조작

| 키 | 동작 |
| --- | --- |
| `1`–`5` | 타워 선택 (다시 누르면 취소) |
| 클릭 | 타워 배치 / 타워 선택 |
| 우클릭 · `Esc` | 취소 |
| `Space` | 웨이브 시작 / 다음 웨이브 조기 호출 (남은 시간만큼 보너스 골드) |
| `U` / `S` | 선택한 타워 업그레이드 / 판매 (70% 환불) |
| `T` | 타겟 방식 전환 (선두 · 후미 · 강함 · 근접) |
| `P` · `F` · `M` · `H` | 일시정지 · 속도(1×→2×→3×) · 소리 · 도움말 |

## 구조

```
index.html            마크업 (HUD, 메뉴, 도움말)
css/style.css         스타일 (스케일 레이아웃, 세로 화면 대응)
js/main.js            부트스트랩, 입력 배선, 고정 타임스텝 루프
js/core/              util · rng · input · audio(합성 사운드/음악)
js/data/              towers · enemies · waves · maps · config (밸런스 수치)
js/game/              map · enemy · tower · projectile · game (DOM 없는 순수 시뮬레이션)
js/render/            sprites(절차적 벡터 캐릭터) · renderer(캔버스 렌더러)
js/ui/hud.js          DOM HUD 바인딩
test/                 node:test 단위 테스트
tools/sim.mjs         헤드리스 밸런스 시뮬레이터 (봇이 9개 조합을 모두 플레이)
tools/e2e.mjs         Playwright 브라우저 E2E (실제 클릭/키 입력, 스크린샷)
```

시뮬레이션 계층(`js/game`)은 DOM과 캔버스에 전혀 의존하지 않아 Node에서 그대로 실행됩니다.
덕분에 밸런스와 규칙을 자동으로 검증할 수 있습니다.

## 검증

```bash
npm test        # 단위 테스트 (경로, 경제, 타겟팅, 상태 전이, 승리/무한 모드 등)
npm run sim     # 밸런스 시뮬레이션: 3맵 × 3난이도 모두 30웨이브 클리어 가능해야 통과
npm run e2e     # 헤드리스 Chromium에서 실제 UI로 플레이 (playwright-core 필요)
```
