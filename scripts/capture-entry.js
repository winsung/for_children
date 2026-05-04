// playentry.org 주요 화면 스크린샷 캡처 (v3)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name, opts = {}) {
  const file = path.join(OUT_DIR, `${name}.png`);
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
      // 화면에 떠 있고, 작은 카드형 박스이며, 하단부에 위치한 요소를 휴리스틱으로 잡는다
      if ((cs.position === 'fixed' || cs.position === 'absolute') &&
          r.width > 100 && r.width < 350 &&
          r.height > 80 && r.height < 350 &&
          r.bottom > window.innerHeight * 0.5 &&
          parseInt(cs.zIndex || '0') >= 0) {
        // 본문에 한국어 안내가 있을 가능성
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
      // 좌측 상단 — 실행 화면
      stage: pick('#entryCanvasWorkspace, .entryStage_w, [class*="entryCanvas" i], [class*="entryStage" i]'),
      // 좌측 하단 — 오브젝트 목록 (엔진 영역)
      engine: pick('.entryEngineWorkspace_w, [class*="entryEngine" i]'),
      // 오브젝트 추가 버튼
      addObject: pick('[class*="entryAddObject" i], a[class*="addObject" i], button[class*="addObject" i]'),
      // 모든 entry-prefix 클래스의 큰 박스들 (유용한 컨테이너 식별용)
      bigBoxes: pick('div[class^="entry"]')
        .filter(b => b.w > 200 && b.h > 200 && b.x < 500),
    };
  });
  console.log(`  📐 [${label}] DOM:`, JSON.stringify(info, null, 2).slice(0, 1800));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'ko-KR',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log('▶ 1. 홈 페이지');
  await safe('홈', async () => {
    await page.goto('https://playentry.org/', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    await shot(page, '01_home');
  });

  console.log('▶ 2. 작품 만들기 진입');
  await safe('에디터 진입', async () => {
    await page.goto('https://playentry.org/ws/', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(6000);
    await hideTutorial(page);
    await page.waitForTimeout(800);
    await shot(page, '02_editor_blank');
    await dumpDom(page, '에디터');
  });

  console.log('▶ 3. 화면 영역 안내 오버레이 (4 영역)');
  await safe('영역 오버레이', async () => {
    await page.evaluate(() => {
      // 좌측 패널 (x:0~480) 안에서 stage와 engine 영역을 찾는다
      const findLeftStage = () => {
        // playentry는 좌측에 stage(실행화면)와 그 아래 engine(오브젝트 목록)이 있다
        // entryCanvasWorkspace 또는 entryStageWrapper 클래스 우선
        const stage = document.querySelector('#entryCanvasWorkspace, .entryStage_w, [class*="StageWorkspace"]');
        if (stage && stage.getBoundingClientRect().width > 100) return stage;
        // fallback: 좌측 상단의 큰 div
        const all = Array.from(document.querySelectorAll('div'));
        return all.find(el => {
          const r = el.getBoundingClientRect();
          return r.x < 50 && r.y < 100 && r.width > 200 && r.width < 500 && r.height > 150 && r.height < 400;
        });
      };
      const findLeftEngine = () => {
        const eng = document.querySelector('.entryEngineWorkspace_w, [class*="entryEngine"]');
        if (eng && eng.getBoundingClientRect().height > 100) return eng;
        const all = Array.from(document.querySelectorAll('div'));
        return all.find(el => {
          const r = el.getBoundingClientRect();
          return r.x < 50 && r.y > 280 && r.width > 200 && r.width < 500 && r.height > 200;
        });
      };
      const stage = findLeftStage();
      const engine = findLeftEngine();
      const cats = document.querySelector('.entryCategoryListWorkspace');
      // 블록 팔레트는 cats 옆 + board 사이 영역
      const board = document.querySelector('.entryWorkspaceBoard');
      const playground = document.querySelector('.entryPlaygroundWorkspace');

      // 블록 모음(③) = playground - board (= cats + palette)
      let palette = null;
      if (playground && board) {
        const pr = playground.getBoundingClientRect();
        const br = board.getBoundingClientRect();
        palette = { x: pr.x, y: pr.y, w: br.x - pr.x, h: pr.height };
      }

      const labels = [
        stage && { x: stage.getBoundingClientRect().x, y: stage.getBoundingClientRect().y, w: stage.getBoundingClientRect().width, h: stage.getBoundingClientRect().height, label: '① 실행 화면', color: '#8b5cf6' },
        engine && { x: engine.getBoundingClientRect().x, y: engine.getBoundingClientRect().y, w: engine.getBoundingClientRect().width, h: engine.getBoundingClientRect().height, label: '② 오브젝트 목록', color: '#14b8a6' },
        palette && { x: palette.x, y: palette.y, w: palette.w, h: palette.h, label: '③ 블록 모음', color: '#f59e0b' },
        board && { x: board.getBoundingClientRect().x, y: board.getBoundingClientRect().y, w: board.getBoundingClientRect().width, h: board.getBoundingClientRect().height, label: '④ 블록 조립소', color: '#60a5fa' },
      ].filter(Boolean);

      labels.forEach(({ x, y, w, h, label, color }) => {
        const box = document.createElement('div');
        box.className = '__overlay__';
        box.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:5px solid ${color};border-radius:10px;pointer-events:none;z-index:99999;box-sizing:border-box;`;
        const tag = document.createElement('div');
        tag.className = '__overlay__';
        tag.textContent = label;
        tag.style.cssText = `position:fixed;left:${x + 10}px;top:${y + 10}px;background:${color};color:white;padding:8px 14px;border-radius:8px;font-weight:900;font-size:18px;z-index:99999;font-family:'Noto Sans KR',sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);`;
        document.body.appendChild(box);
        document.body.appendChild(tag);
      });
    });
    await page.waitForTimeout(800);
    await shot(page, '03_editor_areas');
    await page.evaluate(() => document.querySelectorAll('.__overlay__').forEach(el => el.remove()));
  });

  console.log('▶ 4. 오브젝트 추가 다이얼로그');
  await safe('오브젝트 추가', async () => {
    // 다양한 셀렉터 우선순위로 시도
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
    console.log(`    → 클릭 결과: ${clicked || '못 찾음'}`);
    await page.waitForTimeout(2500);
    await shot(page, '04_object_dialog');
    await dumpDom(page, '오브젝트 다이얼로그');
  });

  console.log('▶ 5. 검색 — 고양이');
  await safe('고양이 검색', async () => {
    // 모든 input 확인
    const inputs = await page.$$('input');
    console.log(`    → input 개수: ${inputs.length}`);
    for (const inp of inputs) {
      const placeholder = await inp.getAttribute('placeholder');
      const type = await inp.getAttribute('type');
      const visible = await inp.isVisible();
      if (visible && (placeholder?.includes('검색') || type === 'search' || type === 'text')) {
        await inp.fill('고양이');
        await page.waitForTimeout(2000);
        await shot(page, '05_search_cat');
        return;
      }
    }
    console.log('    → 검색 input 없음');
  });

  console.log('▶ 6. 검색 — 폭탄');
  await safe('폭탄 검색', async () => {
    const inputs = await page.$$('input');
    for (const inp of inputs) {
      const visible = await inp.isVisible();
      const placeholder = await inp.getAttribute('placeholder');
      if (visible && (placeholder?.includes('검색') || (await inp.getAttribute('type')) === 'text')) {
        await inp.fill('');
        await inp.fill('폭탄');
        await page.waitForTimeout(2000);
        await shot(page, '06_search_bomb');
        return;
      }
    }
  });

  // 다이얼로그 닫기
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  console.log('▶ 7. 블록 카테고리들 (LI 직접 클릭)');
  const cats = ['시작', '흐름', '움직임', '생김새', '판단', '계산', '자료'];
  for (const cat of cats) {
    await safe(`카테고리: ${cat}`, async () => {
      const ok = await page.evaluate((catName) => {
        const lis = Array.from(document.querySelectorAll('.entryCategoryListWorkspace li, .entryCategoryElementWorkspace'));
        const target = lis.find(li => li.innerText?.trim() === catName);
        if (target) { target.click(); return true; }
        return false;
      }, cat);
      if (ok) {
        await page.waitForTimeout(700);
        await shot(page, `07_cat_${cat}`);
      } else {
        console.log(`    → ${cat} LI 못 찾음`);
      }
    });
  }

  console.log('\n캡처 완료. 출력 폴더:', OUT_DIR);
  await browser.close();
})();
