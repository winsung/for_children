# 스크린샷 캡처 상세

## 도구
`scripts/capture-entry-games.js` (playwright, headless, locale ko-KR, viewport 1600x1000). `scripts/capture-entry.js`가 원본 패턴 — 헬퍼 `shot`/`safe`/`hideTutorial`/`dumpDom`를 재사용한다. 출력은 `assets/screenshots/entry/{게임폴더}/`.

## 새 게임 캡처 추가하기
`capture-entry-games.js`에 게임 섹션을 추가한다:
- 출력 폴더를 `fs.mkdirSync(..., {recursive:true})`로 만든다.
- **오브젝트 검색**: 오브젝트 추가 다이얼로그를 열고(`openObjectDialog`), 검색 input에 키워드를 native value setter로 주입(`searchAndShot`) 후 캡처. 이 화면은 로그아웃 상태에서도 잘 잡힌다.
- **버튼 클릭 UI**(신호/장면/함수): `clickByText`로 버튼 텍스트(`신호 만들기`/`장면 추가`/`함수 만들기`)를 찾아 클릭 후 캡처.
- 모든 캡처는 `safe()`로 감싸 개별 실패가 전체를 깨지 않게.

실행: `node scripts/capture-entry-games.js`

## ⚠️ 핵심 한계 — 로그인/오브젝트 선택 필요
`playentry.org/ws/` 빈 에디터(로그아웃)에서는:
- ✅ 잘 잡힘: 홈, 에디터 4영역, 카테고리, 오브젝트 추가/검색
- ❌ 안 잡힘: **신호 만들기 / 장면 추가 / 함수 만들기** UI — 오브젝트가 선택되거나 패널이 채워져야 나타나기 때문. 빈 에디터에서 `clickByText`는 못 찾고 일반 에디터 화면만 캡처됨.

### 약한 스크린샷 처리
1. **솔직한 캡션** — 일반 에디터 화면을 두되 캡션으로 실제 위치 안내. 예: "(이 이미지는 오브젝트 추가 화면 예시) 신호 만들기는 자료 카테고리 아래쪽 '신호' 영역에 있습니다." 가짜로 속이지 말 것.
2. **img 빼고 텍스트만** — 중복/무의미한 스크린샷은 빼고 `.box`/리스트로 위치를 글로 설명.
3. **보강(권장)** — 더 정확한 UI가 필요하면 **Kay 로그인 세션 + 오브젝트 선택 상태**에서 캡처. `pickcode-cookies.json`처럼 엔트리도 쿠키 주입(`context.addCookies`) 방식 검토. 로그인 후 오브젝트를 하나 추가/선택한 뒤 깊은 UI를 클릭해 캡처.

## 조립된 블록은 캡처하지 않는다
드래그로 조립된 블록 코드는 자동 캡처가 불안정하므로 시도하지 않는다. 대신 강사용 HTML 내 블록 표기(`[카테고리]` + ┣/┗)로 렌더링한다.
