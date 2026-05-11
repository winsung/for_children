// 사이트별 쿠키를 Playwright 호환 포맷으로 추출

const SITES = {
  replit: {
    domains: ['replit.com', '.replit.com'],
    filename: 'replit-cookies.json',
  },
  pickcode: {
    domains: ['pickcode.io', '.pickcode.io', 'app.pickcode.io', '.app.pickcode.io'],
    filename: 'pickcode-cookies.json',
  },
};

function mapSameSite(s) {
  switch (s) {
    case 'no_restriction': return 'None';
    case 'lax': return 'Lax';
    case 'strict': return 'Strict';
    default: return 'Lax';
  }
}

async function getCookies(domains) {
  const lists = await Promise.all(domains.map(d => chrome.cookies.getAll({ domain: d })));
  const map = new Map();
  for (const list of lists) {
    for (const c of list) {
      const key = `${c.name}|${c.domain}|${c.path}`;
      map.set(key, c);
    }
  }
  return Array.from(map.values()).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: typeof c.expirationDate === 'number' ? c.expirationDate : -1,
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: mapSameSite(c.sameSite),
  }));
}

function showResult(text, cls = '') {
  const out = document.getElementById('out');
  out.className = cls;
  out.textContent = text;
}

async function handle(siteKey, action) {
  const site = SITES[siteKey];
  if (!site) return;
  try {
    const cookies = await getCookies(site.domains);
    if (cookies.length === 0) {
      showResult(`❌ ${siteKey} 쿠키가 없습니다. 먼저 로그인해주세요.`, 'err');
      return;
    }
    const json = JSON.stringify(cookies, null, 2);
    if (action === 'download') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = site.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showResult(`✅ ${cookies.length}개 쿠키 다운로드 (${site.filename})`, 'ok');
    } else if (action === 'copy') {
      await navigator.clipboard.writeText(json);
      showResult(`✅ ${cookies.length}개 쿠키 클립보드 복사`, 'ok');
    }
  } catch (e) {
    showResult('❌ 오류: ' + e.message, 'err');
  }
}

document.querySelectorAll('button[data-site]').forEach(btn => {
  btn.addEventListener('click', () => handle(btn.dataset.site, btn.dataset.action));
});
