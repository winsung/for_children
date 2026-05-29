// playentry.org 게임별(별잡기/두더지잡기/RPG) 화면 스크린샷 캡처
// scripts/capture-entry.js 패턴 재사용
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'screenshots');
// 게임별 하위 폴더 생성 (이미 있으면 무해)
const GAME_DIRS = ['entry/star', 'entry/mole', 'entry/rpg'];
for (const d of GAME_DIRS) {
  fs.mkdirSync(path.join(OUT_DIR, d), { recursive: true });
}

// name 은 'entry/star/01_search_basket' 처럼 하위 폴더 포함 가능
async function shot(page, name, opts = {}) {
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false, ...opts });
  console.log(`  ✓ ${name}.png`);
  return file;
}

async function safe(label, fn) {
  try { await fn(); }
  catch (e) { console.log(`  ✗ ${label} 실패: ${e.message.split('\n')[0]}`); }
}

async function hideTutorial(page) {
  // 1) localStorage 가능한 키 모두 시도
  await page.evaluate(() => {
    try {
      const keys = ['tutorial_done', 'entryTutorial', 'entry_tutorial', 'workspace_tutorial', 'first_visit', 'isVisited'];
      keys.forEach(k => { localStorage.setItem(k, '1'); });
    } catch {}
  });
  // 2) 좌하단/우하단의 작은 팝업 패널을 발견하면 제거
  const removed = await page.evaluate(() => {
    let n = 0;
    const all = Array.from(document.querySelectorAll('div, section, aside'));
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if ((cs.position === 'fixed' || cs.position === 'absolute') &&
          r.width > 100 && r.width < 350 &&
          r.height > 80 && r.height < 350 &&
          r.bottom > window.innerHeight * 0.5 &&
          parseInt(cs.zIndex || '0') >= 0) {
        const txt = el.innerText || '';
        if (/꾸러미|튜토리얼|안내|건너뛰기|닫기|시작하기|다음|이전|\d\/\d/.test(txt) && txt.length < 200) {
          el.remove();
          n++;
        }
      }
    }
    return n;
  });
  if (removed) console.log(`    → 튜토리얼/팝업 ${removed}개 제거`);

  // 3) X 버튼 클릭 시도 (button/svg)
  await page.evaluate(() => {
    const closes = Array.from(document.querySelectorAll('button, a, span'))
      .filter(el => /^[×xX✕✖]$/.test(el.innerText?.trim()) || /close/i.test(el.className?.toString() || ''));
    closes.forEach(c => { try { c.click(); } catch {} });
  });
  await page.waitForTimeout(400);
}

async function dumpDom(page, label) {
  const info = await page.evaluate(() => {
    const pick = (sel) => {
      const els = Array.from(document.querySelectorAll(sel));
      return els.slice(0, 5).map(el => {
        const r = el.getBoundingClientRect();
        return {
          cls: (el.className?.toString() || el.id || '').slice(0, 80),
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          text: (el.innerText || '').slice(0, 40).replace(/\n/g, '|'),
        };
      });
    };
    return {
      addObject: pick('[class*="entryAddObject" i], a[class*="addObject" i], button[class*="addObject" i]'),
      bigBoxes: pick('div[class^="entry"]').filter(b => b.w > 200 && b.h > 200 && b.x < 500),
    };
  });
  console.log(`  📐 [${label}] DOM:`, JSON.stringify(info, null, 2).slice(0, 1500));
}

// --- 공통 헬퍼: 오브젝트 추가 다이얼로그 열기 ---
async function openObjectDialog(page) {
  const clicked = await page.evaluate(() => {
    const candidates = [
      () => Array.from(document.querySelectorAll('a, button, div')).find(el => el.innerText?.trim() === '오브젝트 추가하기'),
      () => Array.from(document.querySelectorAll('[class*="addObject" i]')).find(el => el.offsetWidth > 0),
      () => document.querySelector('.entryAddObjectWorkspace_w'),
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el) { el.click(); return el.className?.toString() || el.tagName; }
    }
    return null;
  });
  console.log(`    → 오브젝트 추가 클릭 결과: ${clicked || '못 찾음'}`);
  await page.waitForTimeout(2000);
}

// --- 공통 헬퍼: 검색창에 키워드 입력 후 스크린샷 (capture-entry.js 블록 5-6 패턴) ---
// Entry 검색은 React 입력이라 fill 만으로는 결과가 갱신되지 않을 수 있어
// 실제 키 입력(type)과 input/Enter 이벤트를 함께 발생시킨다.
async function searchAndShot(page, keyword, name) {
  // Entry 오브젝트 추가 다이얼로그의 검색창은 placeholder 가 비어 있고
  // 다이얼로그 우상단(화면 오른쪽 위)에 위치한다. 또한 React 제어 컴포넌트라
  // 단순 .value 대입으로는 갱신되지 않으므로 네이티브 value setter 로 입력한 뒤
  // input 이벤트를 디스패치한다.
  const filled = await page.evaluate((kw) => {
    const inputs = Array.from(document.querySelectorAll('input'))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return el.type === 'text' && r.width > 0 && r.height > 0;
      });
    // 다이얼로그 우상단(오른쪽 절반 + 상단)에 있는 입력을 검색창으로 추정
    const search = inputs
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.x > window.innerWidth * 0.5 && r.y < window.innerHeight * 0.25;
      })
      .sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y)[0];
    if (!search) return false;
    // React 제어 input 에 값 주입
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(search, '');
    search.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(search, kw);
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    return true;
  }, keyword);
  if (!filled) { console.log(`    → 검색 input 못 찾음 (${keyword})`); return false; }
  await page.waitForTimeout(2000);
  await shot(page, name);
  return true;
}

// --- 공통 헬퍼: innerText 가 텍스트와 일치하는 요소 클릭 ---
async function clickByText(page, texts) {
  const arr = Array.isArray(texts) ? texts : [texts];
  return await page.evaluate((labels) => {
    const els = Array.from(document.querySelectorAll('a, button, div, span, li'));
    for (const label of labels) {
      // 정확히 일치하는 짧은 요소 우선
      const exact = els.find(el => {
        const t = (el.innerText || '').trim();
        return t === label && el.offsetWidth > 0 && el.offsetHeight > 0;
      });
      if (exact) { exact.click(); return label; }
      // 포함하는 요소 (짧은 텍스트만)
      const partial = els.find(el => {
        const t = (el.innerText || '').trim();
        return t.includes(label) && t.length < 30 && el.offsetWidth > 0 && el.offsetHeight > 0;
      });
      if (partial) { partial.click(); return label; }
    }
    return null;
  }, arr);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'ko-KR',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // 빈 에디터 진입 (로그인 불필요)
  console.log('▶ 에디터 진입');
  let editorReady = false;
  await safe('에디터 진입', async () => {
    await page.goto('https://playentry.org/ws/', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(6000);
    await hideTutorial(page);
    await page.waitForTimeout(800);
    editorReady = true;
  });

  if (!editorReady) {
    console.log('에디터에 접속하지 못했습니다. (네트워크 차단 가능) 캡처를 건너뜁니다.');
    await browser.close();
    return;
  }

  // =========================================================
  // ★ 오브젝트 검색 (별잡기 + 두더지잡기) — 다이얼로그를 한 번만 열고 연속 검색
  //   (다이얼로그를 닫았다 다시 열면 목록이 비어 보이는 경우가 있어 한 번에 처리)
  // =========================================================
  console.log('\n▶ [오브젝트 검색] 다이얼로그 열기');
  await safe('다이얼로그 열기', async () => {
    await openObjectDialog(page);
    await dumpDom(page, '오브젝트 다이얼로그');
  });
  // 별잡기: 바구니 / 별
  await safe('별잡기: 바구니 검색', async () => {
    await searchAndShot(page, '바구니', 'entry/star/01_search_basket');
  });
  await safe('별잡기: 별 검색', async () => {
    await searchAndShot(page, '별', 'entry/star/02_search_star');
  });
  // 두더지잡기: 두더지 / 망치
  await safe('두더지잡기: 두더지 검색', async () => {
    await searchAndShot(page, '두더지', 'entry/mole/01_search_mole');
  });
  await safe('두더지잡기: 망치 검색', async () => {
    await searchAndShot(page, '망치', 'entry/mole/02_search_hammer');
  });
  // 다이얼로그 닫기
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // =========================================================
  // ★ 두더지잡기 — 신호 만들기 (속성/자료 패널)
  // =========================================================
  console.log('\n▶ [두더지잡기] 신호 만들기');
  await safe('두더지잡기: 신호 만들기', async () => {
    // '자료'/'속성' 카테고리로 이동 후 '신호 만들기' 버튼 클릭
    await clickByText(page, ['속성', '자료']);
    await page.waitForTimeout(700);
    const r = await clickByText(page, ['신호 만들기', '신호 추가하기']);
    console.log(`    → 신호 클릭 결과: ${r || '못 찾음'}`);
    await page.waitForTimeout(1000);
    await shot(page, 'entry/mole/03_signal_make');
  });

  // =========================================================
  // ★ RPG 게임 — 장면 추가 + 함수 만들기
  // =========================================================
  console.log('\n▶ [RPG] 장면 추가');
  await safe('RPG: 장면 추가', async () => {
    const r = await clickByText(page, ['장면 추가하기', '장면 추가', '+']);
    console.log(`    → 장면 추가 클릭 결과: ${r || '못 찾음'}`);
    await page.waitForTimeout(1000);
    await shot(page, 'entry/rpg/01_scene_add');
  });

  console.log('▶ [RPG] 함수 만들기');
  await safe('RPG: 함수 만들기', async () => {
    // '함수' 카테고리 이동 후 '함수 만들기' 버튼
    await clickByText(page, ['함수']);
    await page.waitForTimeout(700);
    const r = await clickByText(page, ['함수 만들기', '함수 추가하기']);
    console.log(`    → 함수 만들기 클릭 결과: ${r || '못 찾음'}`);
    await page.waitForTimeout(1000);
    await shot(page, 'entry/rpg/02_function_make');
  });

  console.log('\n캡처 완료. 출력 폴더:', path.join(OUT_DIR, 'entry'));
  await browser.close();
})();
