// 블록 카테고리 전용 캡처 (다이얼로그 안 열고 카테고리만)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'screenshots');

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false, ...opts });
  console.log(`  ✓ ${name}.png`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  await page.goto('https://playentry.org/ws/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(6000);

  // 튜토리얼 팝업: 좌하단 고정 박스 제거
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div'));
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if ((cs.position === 'fixed' || cs.position === 'absolute') &&
          r.left < 300 && r.bottom > 500 && r.width < 400 && r.height < 400) {
        const txt = el.innerText || '';
        if (txt.includes('꾸러미') || txt.includes('1/4') || txt.includes('2/4') || txt.includes('3/4') || txt.includes('4/4')) {
          el.style.display = 'none';
        }
      }
    }
  });
  await page.waitForTimeout(500);

  // 블록 영역만 클립해서 카테고리별 캡처
  // playground (블록 모음 + 코드영역) 영역을 가져온다
  const playground = await page.$('.entryPlaygroundWorkspace');
  const pgBox = await playground?.boundingBox();
  console.log('playground:', pgBox);

  const cats = ['시작', '흐름', '움직임', '생김새', '판단', '계산', '자료'];
  for (const cat of cats) {
    const ok = await page.evaluate((catName) => {
      const lis = Array.from(document.querySelectorAll('.entryCategoryListWorkspace li'));
      const target = lis.find(li => li.innerText?.trim() === catName);
      if (target) { target.click(); return true; }
      return false;
    }, cat);
    if (!ok) { console.log(`  ✗ ${cat} 못 찾음`); continue; }
    await page.waitForTimeout(800);
    // 블록 모음 영역만 클립 (카테고리 + 블록 팔레트, 코드 영역 제외)
    if (pgBox) {
      // 코드 영역 시작점 추정
      const board = await page.$('.entryWorkspaceBoard');
      const bBox = await board?.boundingBox();
      const clipW = bBox ? bBox.x - pgBox.x : 320;
      await shot(page, `cat_${cat}`, {
        clip: { x: pgBox.x, y: pgBox.y, width: clipW, height: Math.min(pgBox.height, 800) },
      });
    } else {
      await shot(page, `cat_${cat}`);
    }
  }

  await browser.close();
})();
