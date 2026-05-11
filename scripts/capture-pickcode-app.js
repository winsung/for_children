// Pickcode 로그인 후 화면들 캡처
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const COOKIES_PATH = path.resolve(__dirname, '..', 'pickcode-cookies.json');
const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'screenshots', 'pickcode');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const rawCookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${name}.png`);
}

async function safe(label, fn) {
  try { await fn(); }
  catch (e) { console.log(`  ✗ ${label}: ${e.message.split('\n')[0]}`); }
}

async function addLabel(page, x, y, w, h, text, color = '#dc2626') {
  await page.evaluate(({ x, y, w, h, text, color }) => {
    const box = document.createElement('div');
    box.className = '__overlay__';
    box.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:4px solid ${color};border-radius:10px;pointer-events:none;z-index:2147483647;box-sizing:border-box;`;
    const tag = document.createElement('div');
    tag.className = '__overlay__';
    tag.textContent = text;
    tag.style.cssText = `position:fixed;left:${x}px;top:${Math.max(0, y - 38)}px;background:${color};color:white;padding:7px 14px;border-radius:8px;font-weight:900;font-size:14px;z-index:2147483647;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.35);`;
    document.body.appendChild(box);
    document.body.appendChild(tag);
  }, { x, y, w, h, text, color });
}

async function clearOverlays(page) {
  await page.evaluate(() => document.querySelectorAll('.__overlay__').forEach(el => el.remove()));
}

async function inspectButtons(page, label) {
  const btns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .map(el => {
        const r = el.getBoundingClientRect();
        const text = (el.innerText || el.getAttribute('aria-label') || el.title || '').trim();
        const href = el.getAttribute('href') || '';
        return { tag: el.tagName, text: text.slice(0, 50), href, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
      })
      .filter(b => b.visible && b.text);
  });
  console.log(`  [${label}] 보이는 버튼 ${btns.length}개`);
  btns.slice(0, 30).forEach(b => console.log(`    [${b.tag}] "${b.text}" href="${b.href.slice(0, 60)}" @ ${b.x},${b.y} (${b.w}x${b.h})`));
  return btns;
}

(async () => {
  console.log(`▶ ${rawCookies.length}개 쿠키 로드`);
  const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const adapted = rawCookies.map(c => {
    const host = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
    const base = { name: c.name, value: c.value, expires: c.expires, httpOnly: !!c.httpOnly, secure: !!c.secure, sameSite: c.sameSite };
    if (c.name.startsWith('__Host-')) return { ...base, url: `https://${host}/` };
    return { ...base, domain: c.domain, path: c.path || '/' };
  });
  await context.addCookies(adapted);
  console.log('  ✓ 쿠키 주입 완료');

  const page = await context.newPage();

  // 1) app.pickcode.io 메인 (로그인 상태)
  console.log('\n▶ 1. app.pickcode.io 메인');
  await safe('메인', async () => {
    await page.goto('https://app.pickcode.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    const url = page.url();
    console.log(`  URL: ${url}`);
    if (url.includes('/login') || url.includes('/signup')) {
      console.log('  ⚠️ 로그인 페이지로 튕김. 쿠키 인식 안 됨.');
    }
    await shot(page, '10_app_main');
    await inspectButtons(page, '메인');
  });

  // 2) Create / New Project 버튼 찾아 클릭
  console.log('\n▶ 2. Create/New 버튼 클릭');
  await safe('Create 클릭', async () => {
    const clicked = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const cands = all
        .map(el => ({ el, t: (el.innerText || el.title || el.getAttribute('aria-label') || '').trim() }))
        .filter(x => /^(\+|create|new|start|begin|make).*$|^\+$/i.test(x.t) || /create.*project|new.*project|new.*python|create.*python|start.*coding/i.test(x.t));
      if (cands.length > 0) {
        cands[0].el.click();
        return cands[0].t;
      }
      return null;
    });
    console.log(`  클릭: ${clicked || '없음'}`);
    await page.waitForTimeout(4000);
    console.log(`  URL: ${page.url()}`);
    await shot(page, '11_after_create_click');
    await inspectButtons(page, 'Create 후');
  });

  // 3) Python 옵션 찾기
  console.log('\n▶ 3. Python 옵션 클릭');
  await safe('Python 클릭', async () => {
    const clicked = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        const t = (el.innerText || '').trim();
        if (t === 'Python' || t.startsWith('Python\n')) {
          // 클릭 가능한 부모 찾기
          let target = el;
          let parent = el.parentElement;
          while (parent && parent !== document.body) {
            const r = parent.getBoundingClientRect();
            if (parent.tagName === 'BUTTON' || parent.tagName === 'A' || parent.getAttribute('role') === 'button') {
              target = parent;
              break;
            }
            if (r.width > 100 && r.width < 400 && r.height > 50 && r.height < 300) {
              target = parent;
            }
            parent = parent.parentElement;
          }
          target.click();
          return true;
        }
      }
      return false;
    });
    console.log(`  클릭: ${clicked}`);
    await page.waitForTimeout(5000);
    console.log(`  URL: ${page.url()}`);
    await shot(page, '12_after_python_click');
  });

  // 4) 에디터 진입 후 코드 입력
  console.log('\n▶ 4. 코드 입력 시도');
  await safe('코드 입력', async () => {
    // CodeMirror, Monaco 등 가능한 에디터 셀렉터들
    const editorFound = await page.evaluate(() => {
      const eds = document.querySelectorAll('.monaco-editor, .cm-editor, .CodeMirror, [class*="editor" i] textarea, [contenteditable="true"]');
      for (const ed of eds) {
        const r = ed.getBoundingClientRect();
        if (r.width > 200 && r.height > 100) {
          ed.click();
          return { tag: ed.tagName, cls: ed.className };
        }
      }
      return null;
    });
    if (editorFound) {
      console.log(`  에디터 클릭: ${editorFound.tag} (${editorFound.cls})`);
      await page.waitForTimeout(1000);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);
      await page.keyboard.type('print("Hello, 세계!")', { delay: 60 });
      await page.waitForTimeout(800);
      await shot(page, '13_editor_with_code');
    } else {
      console.log('  에디터 영역 못 찾음');
      await shot(page, '13_no_editor');
    }
  });

  // 5) Run 버튼 강조
  console.log('\n▶ 5. Run 버튼 강조');
  await safe('Run 버튼', async () => {
    const found = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, [role="button"], a'));
      const cands = all
        .map(el => {
          const r = el.getBoundingClientRect();
          const text = (el.innerText || el.getAttribute('aria-label') || el.title || '').trim();
          return { r, text };
        })
        .filter(c => c.r.width > 20 && c.r.height > 20 && c.r.width < 200)
        .filter(c => /^run$|^▶|play|execute/i.test(c.text));
      if (cands.length === 0) return null;
      const top = cands[0];
      return { x: Math.round(top.r.x), y: Math.round(top.r.y), w: Math.round(top.r.width), h: Math.round(top.r.height), text: top.text };
    });
    if (found) {
      console.log(`  Run: "${found.text}" @ ${found.x},${found.y}`);
      await addLabel(page, found.x - 4, found.y - 4, found.w + 8, found.h + 8, '▶ Run', '#dc2626');
      await page.waitForTimeout(400);
      await shot(page, '14_run_button_highlight');
      await clearOverlays(page);
    } else {
      console.log('  Run 버튼 못 찾음');
    }
  });

  console.log('\n✅ 캡처 완료:', OUT_DIR);
  await page.waitForTimeout(5000);
  await browser.close();
})();
