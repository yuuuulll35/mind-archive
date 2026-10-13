/* =========================================================
   MIND ARCHIVE — 렌더링 & 편집 로직
   ========================================================= */

const STORE_KEY = 'mind-archive-v1';
const UI_KEY = 'mind-archive-ui-v1';

let data;
const ui = { view: 'A', editing: false, modal: null, expandAll: false };

/* ---------- utils ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, val) {
  const ks = path.split('.');
  const last = ks.pop();
  const parent = ks.reduce((o, k) => o[k], obj);
  parent[last] = val;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ---------- storage ---------- */
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      toast('브라우저 저장 공간이 부족해 자동 저장에 실패했어요. 내보내기에서 백업 파일을 저장해 두세요.');
    }
  }, 250);
}
function saveUI() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ view: ui.view }));
  } catch (e) {}
}

/* ---------- normalize: 어떤 JSON이 와도 템플릿 모양으로 맞춘다 ---------- */
const arr = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x == null ? '' : typeof x === 'object' ? Object.values(x).join(' · ') : String(x))) : typeof v === 'string' && v ? [v] : []);
const str = (v) => (v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : String(v));

function normSubject(src, id) {
  const base = blankSubject(id);
  if (!src || typeof src !== 'object') return base;
  ['name', 'alias', 'age', 'mbti', 'saju', 'occupation', 'role', 'photo', 'photoSrc'].forEach((k) => {
    if (src[k] != null) base[k] = str(src[k]);
  });
  const pc = src.photoCrop;
  if (pc && typeof pc === 'object') base.photoCrop = { scale: clamp(+pc.scale || 1, 1, 3), ox: +pc.ox || 0, oy: +pc.oy || 0 };
  base.tags = arr(src.tags);
  if (Array.isArray(src.readings) && src.readings.length) {
    base.readings = src.readings
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({ label: str(r.label), value: clamp(Math.round(+r.value || 0), 0, 100) }));
  }
  if (Array.isArray(src.brain) && src.brain.length) {
    base.brain = src.brain
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        label: str(r.label),
        weight: Math.max(1, Math.round(+r.weight || 1)),
        link: SECTIONS.some((s) => s.id === r.link) ? r.link : 's01',
      }));
  }
  const secs = src.sections || {};
  SECTIONS.forEach((s) => {
    const v = secs[s.id] || {};
    // s01 화면은 키워드 칩만 보여 주므로, keywords 칸이 따로 오면 그걸 쓴다
    const kw = s.id === 's01' && Array.isArray(v.keywords) && v.keywords.some(Boolean);
    base.sections[s.id] = {
      lead: str(v.lead),
      items: arr(kw ? v.keywords.filter(Boolean) : v.items),
      pos: arr(v.pos),
      neg: arr(v.neg),
      quote: str(v.quote),
    };
  });
  return base;
}

function normalize(src) {
  const out = blankData();
  if (!src || typeof src !== 'object') return out;
  const c = src.case || {};
  Object.keys(out.case).forEach((k) => (out.case[k] = str(c[k])));
  const subs = Array.isArray(src.subjects) ? src.subjects : [];
  out.subjects = [normSubject(subs[0], 'A'), normSubject(subs[1], 'B')];
  const r = src.relation || {};
  out.relation = {
    status: str(r.status),
    a_to_b: str(r.a_to_b),
    b_to_a: str(r.b_to_a),
    keywords: arr(r.keywords),
    timeline: arr(r.timeline),
  };
  return out;
}

/* AI 출력에서 JSON 부분만 뽑아낸다 */
function extractJSON(text) {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : t;
  const start = body.indexOf('{');
  if (start < 0) throw new Error('no json');
  const end = body.lastIndexOf('}');
  const pieces = end > start ? [body.slice(start, end + 1), body.slice(start)] : [body.slice(start)];
  // 그대로 → 고쳐서 → 스마트 따옴표까지 바꿔서 고쳐서, 순서대로 시도
  for (const p of pieces) {
    for (const make of [(x) => x, repairJSON, (x) => repairJSON(x.replace(/[“”]/g, '"'))]) {
      try {
        return JSON.parse(make(p));
      } catch (e) {}
    }
  }
  throw new Error('bad json');
}

/* 붙여넣은 글에 답변이 여러 개(NPC·PC·서사) 있어도 하나씩 떼어 읽는다 */
function extractAllJSON(text) {
  // 코드블록 안과 밖을 나눈 뒤, 각각에서 맨 바깥 { … } 단위로 답변을 떼어 낸다
  const parts = [];
  const rest = text.replace(/```[a-z]*\s*([\s\S]*?)(?:```|$)/gi, (m, inner) => {
    parts.push(inner);
    return '\n';
  });
  parts.push(rest);
  const chunks = parts.flatMap(splitTopLevel);
  const out = [];
  chunks.forEach((c) => {
    try {
      out.push(extractJSON(c));
    } catch (e) {}
  });
  if (!out.length) throw new Error('bad json');
  return out;
}

/* 괄호 짝을 세어 맨 바깥 { … } 덩어리를 하나씩 잘라 낸다 (글 안의 괄호는 무시).
   닫는 괄호가 빠진 답변 뒤에 다른 답변이 붙어 있으면 "} 다음에 바로 {"가 오는 자리에서 끊는다 */
function splitTopLevel(s) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false, last = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') {
        // repairJSON과 같은 기준: 뒤에 , } ] : 가 오면 글의 끝
        let j = i + 1;
        while (j < s.length && /\s/.test(s[j])) j++;
        if (j >= s.length || ',}]:'.includes(s[j])) inStr = false;
      }
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === '"') {
      if (depth > 0) inStr = true;
    } else if (c === '{') {
      if (depth > 0 && last === '}') {
        out.push(s.slice(start, i));
        depth = 0;
      }
      if (depth++ === 0) start = i;
    } else if (c === '}' && depth > 0) {
      if (--depth === 0) {
        out.push(s.slice(start, i + 1));
        start = -1;
      }
    }
    last = c;
  }
  if (depth > 0 && start >= 0) out.push(s.slice(start));
  return out;
}

/* 답변 내용을 보고 알아서 제자리에 넣는다: id A → NPC, id B → PC, relation → 관계 */
function applyAnswers(list) {
  const done = new Set();
  list.forEach((p) => {
    const subs = Array.isArray(p.subjects) ? p.subjects : p.subject && typeof p.subject === 'object' ? [p.subject] : p.brain || p.sections ? [p] : [];
    subs.forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const id = s.id === 'A' || s.id === 'B' ? s.id : subs.length > 1 && i === 1 ? 'B' : 'A';
      data.subjects[id === 'A' ? 0 : 1] = normSubject(s, id);
      done.add(id === 'A' ? 'NPC' : 'PC');
    });
    if (p.relation && typeof p.relation === 'object') {
      data.relation = normalize({ relation: p.relation }).relation;
      done.add('관계');
    }
    if (p.case && typeof p.case === 'object') data.case = normalize({ case: p.case }).case;
  });
  if (!done.size) throw new Error('empty');
  return ['NPC', 'PC', '관계'].filter((x) => done.has(x));
}

/* AI가 자주 내는 형식 실수를 고친다:
   글 안에 이스케이프 안 된 따옴표, 글 안 줄바꿈, 끝 쉼표, 덜 닫힌 괄호(답변이 중간에 끊긴 경우 포함) */
function repairJSON(s) {
  let out = '', inStr = false, esc = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { out += c; esc = false; continue; }
      if (c === '\\') { out += c; esc = true; continue; }
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '"') {
        // 뒤에 , } ] : 가 오면 글의 끝, 아니면 글 안의 따옴표
        let j = i + 1;
        while (j < s.length && /\s/.test(s[j])) j++;
        if (j >= s.length || ',}]:'.includes(s[j])) { inStr = false; out += c; }
        else out += '\\"';
        continue;
      }
      out += c;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
    out += c;
  }
  if (inStr) out += '"';
  // 끊긴 자리에 남은 반쪽짜리 키("key" 또는 "key":)와 끝 쉼표를 걷어 내고 괄호를 닫는다
  out = out.replace(/([{,])\s*"[^"]*"\s*:?\s*$/, '$1').replace(/,\s*$/, '').replace(/,\s*([}\]])/g, '$1');
  while (stack.length) out += stack.pop();
  return out;
}

/* ---------- editable primitives ---------- */
function ed(path, ph, tag = 'span', cls = '') {
  const v = getPath(data, path);
  const ce = ui.editing ? ' contenteditable="true" spellcheck="false"' : '';
  return `<${tag} class="ed ${cls}" data-path="${path}" data-ph="${esc(ph)}"${ce}>${esc(v)}</${tag}>`;
}

function listEd(path, opts = {}) {
  const list = getPath(data, path) || [];
  const { cls = '', item = (inner) => inner, ph = '내용 입력', addLabel = '항목 추가', tag = 'li', wrap = 'ul' } = opts;
  const rows = list
    .map((_, i) => {
      const inner = ed(`${path}.${i}`, ph);
      const del = ui.editing ? `<button type="button" class="x" data-del="${path}.${i}" title="삭제">×</button>` : '';
      return `<${tag} class="li">${item(inner, i)}${del}</${tag}>`;
    })
    .join('');
  const add = ui.editing ? `<button type="button" class="add" data-add="${path}">+ ${addLabel}</button>` : '';
  return `<${wrap} class="${cls}">${rows}</${wrap}>${add}`;
}

/* ---------- brain packing ---------- */
function packRegions(regions, cx, cy, rx, ry, seedKey) {
  const ws = regions.map((r) => Math.max(1, +r.weight || 1));
  const tot = ws.reduce((a, b) => a + b, 0) || 1;
  const fill = Math.PI * rx * ry * 0.5;
  let nodes = regions.map((r, i) => ({ i, r: Math.sqrt((fill * ws[i]) / tot / Math.PI), x: cx, y: cy }));
  const order = [...nodes].sort((a, b) => b.r - a.r);
  const R = rng(hashStr(seedKey));
  order.forEach((n, k) => {
    const ang = k * 2.39996 + R() * 0.4;
    const d = k === 0 ? 0 : 18 * Math.sqrt(k) + 10;
    n.x = cx + Math.cos(ang) * d * (rx / ry);
    n.y = cy + Math.sin(ang) * d;
  });

  const gap = 4;
  const relax = (its, pull) => {
    for (let it = 0; it < its; it++) {
      for (let a = 0; a < nodes.length; a++)
        for (let b = a + 1; b < nodes.length; b++) {
          const A = nodes[a], B = nodes[b];
          let dx = B.x - A.x, dy = B.y - A.y;
          let d = Math.hypot(dx, dy);
          const min = A.r + B.r + gap;
          if (d < min) {
            if (d < 0.01) { dx = R() - 0.5; dy = R() - 0.5; d = Math.hypot(dx, dy); }
            const push = (min - d) * 0.35;
            const ux = dx / d, uy = dy / d;
            A.x -= ux * push; A.y -= uy * push;
            B.x += ux * push; B.y += uy * push;
          }
        }
      nodes.forEach((n) => {
        n.x += (cx - n.x) * pull;
        n.y += (cy - n.y) * pull;
        const ex = Math.max(1, rx - n.r - 3), ey = Math.max(1, ry - n.r - 3);
        const q = ((n.x - cx) / ex) ** 2 + ((n.y - cy) / ey) ** 2;
        if (q > 1) {
          const s = 1 / Math.sqrt(q);
          n.x = cx + (n.x - cx) * s;
          n.y = cy + (n.y - cy) * s;
        }
      });
    }
  };
  const overlap = () => {
    let worst = 0;
    for (let a = 0; a < nodes.length; a++)
      for (let b = a + 1; b < nodes.length; b++)
        worst = Math.max(worst, nodes[a].r + nodes[b].r + gap - Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y));
    return worst;
  };
  // 1) 겹침이 없어질 때까지 줄이고
  for (let attempt = 0; attempt < 20; attempt++) {
    relax(360, 0.004);
    if (overlap() < 1.5) break;
    nodes.forEach((n) => (n.r *= 0.975));
  }
  // 2) 빈 공간이 남으면 겹치기 직전까지 키운다
  for (let g = 0; g < 24; g++) {
    const snap = nodes.map((n) => ({ ...n }));
    nodes.forEach((n) => (n.r *= 1.03));
    relax(400, 0);
    if (overlap() >= 3) {
      nodes = snap;
      break;
    }
  }
  return nodes;
}

function blobPath(x, y, r, seed) {
  const R = rng(seed);
  const n = 9;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.15;
    const rr = r * (0.93 + R() * 0.12);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/* 옆얼굴 실루엣 (왼쪽을 바라봄) */
const HEAD_PATH =
  'M300,452 C298,410 304,378 330,350 C368,310 388,252 384,190 C378,96 306,34 214,34 C124,34 62,88 56,164 C54,188 56,204 48,220 C40,234 26,252 30,262 C34,270 46,270 50,278 C47,287 43,292 47,300 C51,306 45,312 49,320 C54,342 72,352 104,354 C132,356 142,374 142,452';

function brainSVG(si, mirrored) {
  const s = data.subjects[si];
  const W = 420, H = 460;
  const cx0 = 220, cy0 = 170, rx = 150, ry = 122;
  const cx = mirrored ? W - cx0 : cx0;
  const regions = s.brain.filter((r) => r.label !== null);
  const nodes = packRegions(regions, cx, cy0, rx, ry, s.id + regions.map((r) => r.label + r.weight).join('|'));
  const tot = regions.reduce((a, r) => a + Math.max(1, +r.weight || 1), 0) || 1;
  const maxW = Math.max(...regions.map((r) => +r.weight || 0));
  const pid = `hatch-${s.id}-${mirrored ? 'm' : 'n'}`;
  // 큰 영역 3개 — 좁은 화면 대질 열람에서는 이것들만 이름을 남긴다
  const major = new Set(regions.map((r, i) => [+r.weight || 0, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => i));

  const blobs = nodes
    .map((n) => {
      const reg = regions[n.i];
      const label = reg.label || '(빈 칸)';
      const pct = Math.round((Math.max(1, +reg.weight || 1) / tot) * 100);
      const dom = (+reg.weight || 0) === maxW;
      const secret = reg.link === 's09';
      const fs = clamp(Math.min(n.r * 0.5, (n.r * 1.55) / Math.max(1.6, [...label].length)), 9, 34);
      const showPct = n.r > 30;
      const ty = showPct ? n.y - fs * 0.05 : n.y + fs * 0.35;
      const cls = ['region', dom ? 'dom' : '', secret ? 'secret' : '', reg.label ? '' : 'empty', major.has(n.i) ? '' : 'minor'].join(' ');
      return `<g class="${cls}" data-goto="${reg.link}" data-si="${si}" tabindex="0" role="button" aria-label="${esc(label)} ${pct}%">
        <path d="${blobPath(n.x, n.y, n.r, hashStr(label) + n.i)}" ${secret && !dom ? `fill="url(#${pid})"` : ''}/>
        <text x="${n.x.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${fs.toFixed(1)}" class="rl">${esc(label)}</text>
        ${showPct ? `<text x="${n.x.toFixed(1)}" y="${(n.y + fs * 0.95).toFixed(1)}" class="rp">${pct}%</text>` : ''}
      </g>`;
    })
    .join('');

  // 계측 눈금
  let ticks = '';
  for (let i = 0; i <= 20; i++) {
    const x = 20 + i * 19;
    ticks += `<line x1="${x}" y1="${H - 6}" x2="${x}" y2="${H - (i % 5 === 0 ? 16 : 11)}"/>`;
  }
  const tagX = mirrored ? W - 18 : 18;
  const anchor = mirrored ? 'end' : 'start';

  return `<svg class="brain" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.name)}의 뇌구조">
    <defs>
      <pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-ln"/>
      </pattern>
    </defs>
    <g class="grid">${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${40 + i * 48}" x2="${W}" y2="${40 + i * 48}"/>`).join('')}</g>
    <path class="head" d="${HEAD_PATH}" ${mirrored ? `transform="translate(${W},0) scale(-1,1)"` : ''}/>
    <ellipse class="cranium" cx="${cx}" cy="${cy0}" rx="${rx + 6}" ry="${ry + 6}"/>
    <g class="cross"><line x1="${cx - 8}" y1="${cy0}" x2="${cx + 8}" y2="${cy0}"/><line x1="${cx}" y1="${cy0 - 8}" x2="${cx}" y2="${cy0 + 8}"/></g>
    ${blobs}
    <g class="ticks">${ticks}</g>
    <text class="spec" x="${tagX}" y="24" text-anchor="${anchor}">SPECIMEN ${s.id} · ${esc(s.name || 'UNKNOWN')}</text>
    <text class="spec dim" x="${tagX}" y="${H - 24}" text-anchor="${anchor}">${regions.length} REGIONS · Σ ${tot}</text>
  </svg>`;
}

/* ---------- pieces ---------- */
function otherName(si) {
  return data.subjects[1 - si].name || '상대';
}
function secTitle(sec, si) {
  return typeof sec.title === 'function' ? sec.title(otherName(si)) : sec.title;
}

function renderCover() {
  const c = data.case;
  const names = data.subjects.map((s) => esc(s.name || '미상')).join(' <i>×</i> ');
  $('#cover').innerHTML = `
    <div class="cv-top mono">
      <span>CASE NO. ${ed('case.no', '0000-0000')}</span>
      <span class="cv-bar" aria-hidden="true"></span>
      <span>${ed('case.date', 'YYYY.MM.DD')}</span>
    </div>
    <div class="cv-main">
      <div>
        <p class="cv-kicker mono">NEURAL DOSSIER — 열람 제한</p>
        <h1>${ed('case.title', '사건 제목을 입력하세요', 'span', 'cv-title')}</h1>
        <p class="cv-names">${names}</p>
      </div>
      <div class="stamp" aria-hidden="true"><span>CONFIDENTIAL</span><small>열람 후 반납</small></div>
    </div>
    <div class="cv-memo">
      <span class="mono cv-lab">ANALYST NOTE</span>
      ${ed('case.memo', '분석관 메모', 'p', 'cv-memo-t')}
      <span class="mono cv-off">— ${ed('case.officer', '분석관')}</span>
    </div>`;
}

function renderSwitch() {
  const tabs = [
    ...data.subjects.map((s, i) => ({ k: s.id, top: `SUBJECT ${s.id}`, name: s.name || '미상' })),
    { k: 'X', top: 'CROSS-EXAM', name: '대질 열람' },
  ];
  $('#switch').innerHTML = tabs
    .map(
      (t, i) => `<button type="button" class="sw ${ui.view === t.k ? 'on' : ''}" data-view="${t.k}" style="--i:${i}">
        <span class="mono">${t.top}</span><b>${esc(t.name)}</b></button>`
    )
    .join('');
}

function idCard(si) {
  const s = data.subjects[si];
  const p = `subjects.${si}`;
  const photo = s.photo
    ? `<img src="${esc(s.photo)}" alt="${esc(s.name)} 사진">`
    : `<div class="ph-empty mono">NO PHOTO<br><small>${ui.editing ? '클릭해서 사진 넣기' : 'ON FILE'}</small></div>`;
  const rows = [
    ['NAME', 'name', '이름'],
    ['ALIAS', 'alias', '별칭'],
    ['AGE', 'age', '만 19세 이상'],
    ['MBTI', 'mbti', 'MBTI'],
    ['사주', 'saju', '일간 · 오행'],
    ['OCCUPATION', 'occupation', '직업'],
    ['ROLE', 'role', '서사 속 역할'],
  ];
  return `<aside class="idcard">
    <div class="photo ${ui.editing ? 'can' : ''}" data-photo="${si}">
      <span class="clip" aria-hidden="true"></span>
      ${photo}
      ${ui.editing && s.photo ? `<button type="button" class="x ph-x" data-photo-del="${si}" title="사진 삭제">×</button>
      <div class="ph-acts"><button type="button" data-photo-edit="${si}">편집</button><button type="button" data-photo-pick="${si}">교체</button></div>` : ''}
      <span class="ph-tag mono">${s.id}-${String(si + 1).padStart(3, '0')}</span>
    </div>
    <table class="fields">${rows
      .map(([k, f, ph]) => `<tr><th class="mono">${k}</th><td>${ed(`${p}.${f}`, ph)}</td></tr>`)
      .join('')}</table>
    <div class="tags">${listEd(`${p}.tags`, { wrap: 'div', tag: 'span', ph: '태그', addLabel: '태그', item: (x) => `#${x}` })}</div>
    <div class="poly">
      <div class="poly-h mono"><span>POLYGRAPH</span><span>0 — 100</span></div>
      ${s.readings
        .map(
          (r, i) => `<div class="pg">
            <span class="pg-l">${ed(`${p}.readings.${i}.label`, '지표')}</span>
            <span class="pg-bar"><i style="width:${clamp(+r.value || 0, 0, 100)}%"></i></span>
            ${
              ui.editing
                ? `<input type="range" min="0" max="100" value="${r.value}" data-range="${p}.readings.${i}.value" aria-label="${esc(r.label)} 수치"><button type="button" class="x" data-del="${p}.readings.${i}">×</button>`
                : `<span class="pg-v mono">${String(r.value).padStart(2, '0')}</span>`
            }
          </div>`
        )
        .join('')}
      ${ui.editing ? `<button type="button" class="add" data-add-reading="${si}">+ 지표 추가</button>` : ''}
    </div>
  </aside>`;
}

function regionIndex(si) {
  const s = data.subjects[si];
  const tot = s.brain.reduce((a, r) => a + Math.max(1, +r.weight || 1), 0) || 1;
  const order = s.brain.map((r, i) => ({ r, i })).sort((a, b) => (b.r.weight || 0) - (a.r.weight || 0));
  if (ui.editing) {
    return `<div class="rindex editing">
      <div class="ri-h mono"><span>REGION EDITOR</span><span>${s.brain.length}/14</span></div>
      ${s.brain
        .map(
          (r, i) => `<div class="ri-e">
          <input type="text" value="${esc(r.label)}" placeholder="생각" data-bin="subjects.${si}.brain.${i}.label" maxlength="14">
          <input type="number" min="1" max="99" value="${r.weight}" data-bin="subjects.${si}.brain.${i}.weight" aria-label="비중">
          <select data-bin="subjects.${si}.brain.${i}.link" aria-label="연결 파일">${SECTIONS.map(
            (sec) => `<option value="${sec.id}" ${sec.id === r.link ? 'selected' : ''}>${sec.code}</option>`
          ).join('')}</select>
          <button type="button" class="x" data-del="subjects.${si}.brain.${i}" title="삭제">×</button>
        </div>`
        )
        .join('')}
      ${s.brain.length < 14 ? `<button type="button" class="add" data-add-region="${si}">+ 영역 추가</button>` : ''}
      <p class="hint">숫자는 비중이에요. 합계와 상관없이 비율로 자동 계산됩니다. 오른쪽 번호는 클릭 시 열릴 파일.</p>
    </div>`;
  }
  return `<div class="rindex">
    <div class="ri-h mono"><span>REGION INDEX</span><span>%</span></div>
    ${order
      .map(({ r, i }, k) => {
        const pct = Math.round((Math.max(1, +r.weight || 1) / tot) * 100);
        const sec = SECTIONS.find((x) => x.id === r.link) || SECTIONS[0];
        return `<button type="button" class="ri" data-goto="${sec.id}" data-si="${si}">
          <span class="mono ri-n">${s.id}-${String(k + 1).padStart(2, '0')}</span>
          <span class="ri-l">${esc(r.label || '(빈 칸)')}</span>
          <span class="ri-b"><i style="width:${pct}%"></i></span>
          <span class="mono ri-p">${pct}</span>
          <span class="mono ri-f">→${sec.code}</span>
        </button>`;
      })
      .join('')}
  </div>`;
}

function secBody(sec, si) {
  const p = `subjects.${si}.sections.${sec.id}`;
  const lead = ed(`${p}.lead`, '한두 문장 요약', 'p', 'lead');
  const numbered = (x, i) => `<span class="mono no">${sec.code}-${i + 1}</span><span class="tx">${x}</span>`;

  if (sec.type === 'glance') {
    return `${lead}
      <div class="glance">
        <div><span class="mono lab">KEYWORDS</span>${listEd(`${p}.items`, { cls: 'chips', ph: '키워드', addLabel: '키워드' })}</div>
        <blockquote><span class="mono lab">RECORDED STATEMENT</span>${ed(`${p}.quote`, '이 사람이 할 법한 한마디', 'p', 'quote')}<span class="caret" aria-hidden="true"></span></blockquote>
      </div>`;
  }
  if (sec.type === 'split') {
    return `${lead}
      <div class="split">
        <div class="col pos"><span class="mono lab">＋ ${sec.pos}</span>${listEd(`${p}.pos`, { cls: 'lst', item: numbered })}</div>
        <div class="col neg"><span class="mono lab">－ ${sec.neg}</span>${listEd(`${p}.neg`, { cls: 'lst', item: numbered })}</div>
      </div>`;
  }
  if (sec.type === 'redact') {
    return `${lead}
      <p class="mono redact-note">${ui.editing ? '편집 중에는 내용이 보입니다.' : '검은 줄을 눌러 열람 — 열람 기록이 남습니다.'}</p>
      ${listEd(`${p}.items`, { cls: 'lst redact' + (ui.editing ? ' open' : ''), item: (x, i) => `${numbered(`<span class="rd">${x}</span>`, i)}` })}`;
  }
  if (sec.type === 'scribble') {
    return `${lead}
      ${listEd(`${p}.items`, { cls: 'scribbles', ph: '잡생각', addLabel: '잡생각', item: (x, i) => `<span class="sc" style="--r:${((hashStr(si + sec.id + i) % 7) - 3) * 0.9}deg">${x}</span>` })}`;
  }
  return `${lead}${listEd(`${p}.items`, { cls: 'lst', item: numbered })}`;
}

function drawer(si) {
  const s = data.subjects[si];
  return `<section class="drawer" id="drawer-${s.id}">
    <div class="dr-h">
      <span class="mono">FILE DRAWER — SUBJECT ${s.id}</span>
      <span class="mono">${SECTIONS.length} FILES</span>
    </div>
    ${SECTIONS.map((sec, i) => {
      const isOpen = ui.expandAll;
      const off = [6, 38, 64, 20, 50, 10, 70, 30, 56, 16][i];
      return `<article class="file ${isOpen ? 'open' : ''} t-${sec.type}" id="f-${s.id}-${sec.id}" style="--i:${i}">
        <button type="button" class="file-tab" data-open="${sec.id}" data-si="${si}" aria-haspopup="dialog" style="--off:${off}%">
          <span class="mono">${sec.code}</span><span class="ft-t">${esc(secTitle(sec, si))}</span>
        </button>
        <div class="file-body">
          <div class="fb-in">
            <header class="fb-h mono">
              <span>FILE ${sec.code} / ${sec.en}</span>
              <span>${s.id} · ${esc(s.name || 'UNKNOWN')}</span>
            </header>
            <h3>${esc(secTitle(sec, si))}</h3>
            ${secBody(sec, si)}
          </div>
        </div>
      </article>`;
    }).join('')}
    <div class="dr-front mono" aria-hidden="true"><span class="handle"></span>SUBJECT ${s.id} / ${esc(s.name || 'UNKNOWN')}</div>
  </section>`;
}

function subjectView(si) {
  return `<div class="subject">
      ${idCard(si)}
      <div class="mapbox">
        <div class="map" id="map-${si}">${brainSVG(si, false)}</div>
        <p class="map-cap mono">영역을 누르면 연결된 파일이 팝업으로 열립니다</p>
      </div>
      <div class="rbox" id="rbox-${si}">${regionIndex(si)}</div>
    </div>
    ${drawer(si)}`;
}

function crossView() {
  const [A, B] = data.subjects;
  const r = 'relation';
  const rows = SECTIONS.filter((s) => s.type !== 'scribble')
    .map(
      (sec) => `<div class="cx-row">
        <div class="cx-c">${ed(`subjects.0.sections.${sec.id}.lead`, '—', 'p')}</div>
        <div class="cx-k"><span class="mono">${sec.code}</span><b>${esc(sec.id === 's06' ? '상대에 대한 생각' : secTitle(sec, 0))}</b></div>
        <div class="cx-c">${ed(`subjects.1.sections.${sec.id}.lead`, '—', 'p')}</div>
      </div>`
    )
    .join('');
  return `<div class="cross">
      <div class="map cx-map" id="map-x0">${brainSVG(0, true)}</div>
      <div class="rel">
        <span class="mono lab">RELATION STATUS</span>
        ${ed(`${r}.status`, '현재 관계를 한 줄로', 'p', 'rel-status')}
        <div class="arrow"><span class="mono">${esc(A.name || 'A')} → ${esc(B.name || 'B')}</span>${ed(`${r}.a_to_b`, 'A가 B를 보는 시선', 'p')}</div>
        <div class="arrow rev"><span class="mono">${esc(B.name || 'B')} → ${esc(A.name || 'A')}</span>${ed(`${r}.b_to_a`, 'B가 A를 보는 시선', 'p')}</div>
        <span class="mono lab">KEYWORDS</span>
        ${listEd(`${r}.keywords`, { cls: 'chips', ph: '키워드', addLabel: '키워드' })}
      </div>
      <div class="map cx-map" id="map-x1">${brainSVG(1, false)}</div>
      <div class="cx-vs mono" aria-hidden="true"><span>A · ${esc(A.name || '미상')}</span><i>⇄</i><span>${esc(B.name || '미상')} · B</span></div>
    </div>
    <section class="timeline">
      <div class="dr-h"><span class="mono">NARRATIVE LOG — 지금까지의 서사</span><span class="mono">${data.relation.timeline.length} ENTRIES</span></div>
      ${listEd(`${r}.timeline`, { wrap: 'ol', cls: 'tl', ph: '시점 · 사건', addLabel: '사건 추가', item: (x, i) => `<span class="mono no">#${String(i + 1).padStart(2, '0')}</span><span class="tx">${x}</span>` })}
    </section>
    <section class="cx-table">
      <div class="cx-row cx-head mono"><div>SUBJECT A · ${esc(A.name || '미상')}</div><div>FILE</div><div>SUBJECT B · ${esc(B.name || '미상')}</div></div>
      ${rows}
    </section>`;
}

/* ---------- file popup ---------- */
function fileCard() {
  const { si, sec: secId } = ui.modal;
  const s = data.subjects[si];
  const idx = SECTIONS.findIndex((x) => x.id === secId);
  const sec = SECTIONS[idx];
  const prev = SECTIONS[(idx - 1 + SECTIONS.length) % SECTIONS.length];
  const next = SECTIONS[(idx + 1) % SECTIONS.length];
  const tabs = SECTIONS.map(
    (x) => `<button type="button" class="fd-tab ${x.id === secId ? 'on' : ''}" data-mtab="${x.id}" title="${esc(secTitle(x, si))}" aria-current="${x.id === secId}">
      <span class="mono">${x.code}</span>${x.id === secId ? `<span class="fd-tt">${esc(secTitle(x, si))}</span>` : ''}</button>`
  ).join('');
  const subs = data.subjects
    .map((x, i) => `<button type="button" class="fd-sub ${i === si ? 'on' : ''}" data-msub="${i}"><span class="mono">${x.id}</span>${esc(x.name || '미상')}</button>`)
    .join('');
  return `<div class="fd-tabs" role="tablist" aria-label="파일 목록">${tabs}</div>
    <div class="fd-card t-${sec.type}">
      <div class="fd-top">
        <div class="fd-subs" aria-label="피검자 전환">${subs}</div>
        <button type="button" class="fd-close" data-mclose aria-label="닫기">×</button>
      </div>
      <div class="fd-scroll" id="fdScroll">
        <header class="fb-h mono">
          <span>FILE ${sec.code} / ${sec.en}</span>
          <span>${s.id} · ${esc(s.name || 'UNKNOWN')}</span>
        </header>
        <h3 id="fdTitle">${esc(secTitle(sec, si))}</h3>
        ${secBody(sec, si)}
      </div>
      <div class="fd-foot">
        <button type="button" class="fd-nav" data-mtab="${prev.id}"><span class="mono">← ${prev.code}</span><span class="fd-nt">${esc(secTitle(prev, si))}</span></button>
        <span class="mono fd-hint">← → 키로 넘기기</span>
        <button type="button" class="fd-nav nx" data-mtab="${next.id}"><span class="fd-nt">${esc(secTitle(next, si))}</span><span class="mono">${next.code} →</span></button>
      </div>
    </div>`;
}

function renderModal(resetScroll) {
  if (!ui.modal) return;
  const box = $('#fileCard');
  const sc = $('#fdScroll');
  const keep = sc && !resetScroll ? sc.scrollTop : 0;
  box.innerHTML = fileCard();
  $('#fdScroll').scrollTop = keep;
  // 좁은 화면에서 현재 탭이 보이도록 탭 줄을 가로 스크롤
  const strip = box.querySelector('.fd-tabs');
  const on = box.querySelector('.fd-tab.on');
  if (strip && on) strip.scrollLeft = on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
}

function openModal(si, secId) {
  ui.modal = { si, sec: secId };
  renderModal(true);
  const d = $('#dlgFile');
  if (!d.open) d.showModal();
  const cur = d.querySelector('.fd-tab.on');
  if (cur) cur.focus({ preventScroll: true });
}

function stepModal(dir) {
  const idx = SECTIONS.findIndex((x) => x.id === ui.modal.sec);
  ui.modal.sec = SECTIONS[(idx + dir + SECTIONS.length) % SECTIONS.length].id;
  renderModal(true);
  const cur = $('#dlgFile .fd-tab.on');
  if (cur) cur.focus({ preventScroll: true });
}

function render() {
  document.body.classList.toggle('editing', ui.editing);
  $('#btnEdit .lbl').textContent = ui.editing ? '편집 완료' : '편집 모드';
  $('#btnEdit').classList.toggle('on', ui.editing);
  renderCover();
  renderSwitch();
  const v = $('#view');
  if (ui.view === 'X') v.innerHTML = crossView();
  else v.innerHTML = subjectView(ui.view === 'B' ? 1 : 0);
  renderModal(false);
  armDrawerReveal();
  // 안내 중에 화면을 다시 그리면 강조 표시를 새 요소에 다시 붙인다
  if (tourIdx >= 0) {
    const el = tourEl();
    if (el) el.classList.add('tour-target');
  }
}

/* ---------- drawer motion ---------- */
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 화면을 바꿨을 때만, 서랍이 보이는 순간 파일들이 차례로 올라온다 (편집 중 재렌더링에는 다시 재생하지 않음)
let revealedView = null;
let revealObs = null;
function armDrawerReveal() {
  if (revealedView === ui.view) return;
  revealedView = ui.view;
  if (revealObs) revealObs.disconnect();
  const dr = $('#view .drawer');
  if (!dr || reduceMotion() || !('IntersectionObserver' in window)) return;
  revealObs = new IntersectionObserver((ents) => {
    if (!ents.some((x) => x.isIntersecting)) return;
    revealObs.disconnect();
    dr.classList.add('reveal');
    // fill-mode가 hover 이동을 덮지 않도록 끝나면 클래스를 뗀다 (마지막 파일 지연 + 재생 시간)
    setTimeout(() => dr.classList.remove('reveal'), SECTIONS.length * 45 + 600);
  }, { threshold: 0.25 });
  revealObs.observe(dr);
}

// 탭을 누르면 파일이 살짝 들어올려진 뒤 팝업이 열린다
let pulling = false;
function pullFile(art, si, secId) {
  if (pulling) return;
  if (!art || reduceMotion()) return openModal(si, secId);
  pulling = true;
  art.classList.remove('returning');
  art.classList.add('pulling');
  setTimeout(() => {
    pulling = false;
    openModal(si, secId);
  }, 200);
}

// 팝업을 닫으면 마지막으로 보던 파일이 제자리로 내려앉는다
function returnFile(m) {
  document.querySelectorAll('.file.pulling').forEach((x) => x.classList.remove('pulling'));
  if (!m || reduceMotion()) return;
  const art = document.getElementById(`f-${data.subjects[m.si].id}-${m.sec}`);
  if (!art) return;
  art.classList.add('returning');
  art.addEventListener('animationend', () => art.classList.remove('returning'), { once: true });
}

function rerenderMaps() {
  [0, 1].forEach((si) => {
    const m = document.getElementById(`map-${si}`);
    if (m) m.innerHTML = brainSVG(si, false);
  });
}

/* ---------- events ---------- */
const structuralFields = /\.(name)$/;

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.classList && t.classList.contains('ed')) {
    setPath(data, t.dataset.path, t.innerText.replace(/\n+$/, ''));
    save();
    return;
  }
  if (t.dataset.range) {
    setPath(data, t.dataset.range, +t.value);
    const bar = t.parentElement.querySelector('.pg-bar i');
    if (bar) bar.style.width = t.value + '%';
    save();
    return;
  }
  if (t.dataset.bin) {
    const path = t.dataset.bin;
    let val = t.value;
    if (path.endsWith('.weight')) val = Math.max(1, Math.round(+val || 1));
    setPath(data, path, val);
    save();
    rerenderMaps();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.dataset && e.target.dataset.bin) rerenderMaps();
});

document.addEventListener('focusout', (e) => {
  const t = e.target;
  if (t.classList && t.classList.contains('ed')) {
    const v = t.innerText.trim();
    setPath(data, t.dataset.path, v);
    if (!v) t.textContent = '';
    save();
    if (structuralFields.test(t.dataset.path)) {
      // 이름이 바뀌면 탭·제목을 갱신 (다음 프레임에서, 포커스 이동이 끝난 뒤)
      setTimeout(() => {
        const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.path : null;
        render();
        if (active) {
          const el = (ui.modal ? $('#dlgFile') : document).querySelector(`[data-path="${active}"]`);
          if (el) el.focus();
        }
      }, 0);
    }
  }
});

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.classList && t.classList.contains('ed') && e.key === 'Enter' && !t.matches('p.lead, p.cv-memo-t')) {
    e.preventDefault();
    t.blur();
  }
  if (ui.modal && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !t.closest('.ed, input, select, textarea')) {
    e.preventDefault();
    stepModal(e.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && t.matches && t.matches('g.region')) {
    e.preventDefault();
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});

document.addEventListener('paste', (e) => {
  const t = e.target;
  if (t.classList && t.classList.contains('ed')) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }
});

$('#dlgFile').addEventListener('close', () => {
  returnFile(ui.modal);
  ui.modal = null;
  $('#fileCard').innerHTML = '';
});
// 바깥(어두운 배경)을 누르면 닫힘
$('#dlgFile').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});

document.addEventListener('click', (e) => {
  const t = e.target;

  const view = t.closest('[data-view]');
  if (view) {
    ui.view = view.dataset.view;
    saveUI();
    render();
    return;
  }
  const add = t.closest('[data-add]');
  if (add) {
    const list = getPath(data, add.dataset.add);
    list.push('');
    save();
    render();
    const scope = ui.modal ? $('#dlgFile') : document;
    const el = scope.querySelector(`[data-path="${add.dataset.add}.${list.length - 1}"]`);
    if (el) el.focus();
    return;
  }
  const del = t.closest('[data-del]');
  if (del) {
    const path = del.dataset.del;
    const ks = path.split('.');
    const idx = +ks.pop();
    getPath(data, ks.join('.')).splice(idx, 1);
    save();
    render();
    return;
  }
  const ar = t.closest('[data-add-region]');
  if (ar) {
    data.subjects[+ar.dataset.addRegion].brain.push({ label: '새 생각', weight: 5, link: 's10' });
    save();
    render();
    return;
  }
  const ard = t.closest('[data-add-reading]');
  if (ard) {
    data.subjects[+ard.dataset.addReading].readings.push({ label: '새 지표', value: 50 });
    save();
    render();
    return;
  }
  const pdel = t.closest('[data-photo-del]');
  if (pdel) {
    Object.assign(data.subjects[+pdel.dataset.photoDel], { photo: '', photoSrc: '', photoCrop: null });
    save();
    render();
    return;
  }
  const ppick = t.closest('[data-photo-pick]');
  if (ppick) {
    pickPhoto(+ppick.dataset.photoPick);
    return;
  }
  const ph = t.closest('[data-photo-edit], [data-photo]');
  if (ph && ui.editing) {
    const si = +(ph.dataset.photoEdit ?? ph.dataset.photo);
    if (data.subjects[si].photo) openCrop(si);
    else pickPhoto(si);
    return;
  }
  const mt = t.closest('[data-mtab]');
  if (mt) {
    ui.modal.sec = mt.dataset.mtab;
    renderModal(true);
    const cur = $('#dlgFile .fd-tab.on');
    if (cur) cur.focus({ preventScroll: true });
    return;
  }
  const ms = t.closest('[data-msub]');
  if (ms) {
    ui.modal.si = +ms.dataset.msub;
    renderModal(true);
    return;
  }
  if (t.closest('[data-mclose]')) {
    $('#dlgFile').close();
    return;
  }
  const go = t.closest('[data-goto]');
  if (go) {
    openModal(+go.dataset.si, go.dataset.goto);
    return;
  }
  const op = t.closest('[data-open]');
  if (op) {
    pullFile(op.closest('.file'), +op.dataset.si, op.dataset.open);
    return;
  }
  const rd = t.closest('.redact .li');
  if (rd && !ui.editing) {
    rd.classList.toggle('shown');
    return;
  }
  // dropdown
  if (t.closest('#btnMore')) {
    $('#moreMenu').hidden = !$('#moreMenu').hidden;
    return;
  }
  const act = t.closest('[data-act]');
  if (act) {
    $('#moreMenu').hidden = true;
    doAction(act.dataset.act);
    return;
  }
  if (!t.closest('.dd')) $('#moreMenu').hidden = true;
});

/* ---------- photo ---------- */
let photoTarget = 0;
function pickPhoto(si) {
  photoTarget = si;
  $('#photoInput').click();
}
$('#photoInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    // 다시 편집할 수 있도록 원본을 축소해서 남긴다 (저장 공간 절약)
    const k = Math.min(1, 1200 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    openCrop(photoTarget, c.toDataURL('image/jpeg', 0.88));
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast('이미지를 읽지 못했어요.');
  };
  img.src = url;
});

/* ---------- photo editor : 4:5 틀에 맞춰 위치·크기 조정 ---------- */
// 편집 중인 값은 CROP에만 두고, '적용'을 눌러야 data에 들어간다 (취소하면 원래 사진 그대로)
const CROP = { si: 0, src: '', img: null, scale: 1, ox: 0, oy: 0, base: 1, drag: null };
const CW = 560, CH = 680; // 캔버스
const FW = 448, FH = 560, FX = (CW - FW) / 2, FY = (CH - FH) / 2; // 잘려 나갈 틀 (4:5)
const OUT_W = 480, OUT_H = 600;

function openCrop(si, freshSrc) {
  const s = data.subjects[si];
  const src = freshSrc || s.photoSrc || s.photo;
  if (!src) return pickPhoto(si);
  const im = new Image();
  im.onload = () => {
    Object.assign(CROP, { si, src, img: im, base: Math.max(FW / im.width, FH / im.height) }); // scale 1 = 틀을 꽉 채움
    const k = (!freshSrc && s.photoSrc && s.photoCrop) || { scale: 1, ox: 0, oy: 0 };
    cropSet(k.scale, k.ox, k.oy);
    const d = $('#dlgCrop');
    if (!d.open) d.showModal();
  };
  im.src = src;
}
function cropSet(scale, ox = CROP.ox, oy = CROP.oy) {
  CROP.scale = clamp(+scale || 1, 1, 3);
  CROP.ox = ox;
  CROP.oy = oy;
  $('#cropZoom').value = CROP.scale;
  $('#cropZoomOut').value = Math.round(CROP.scale * 100) + '%';
  drawCrop();
}
function cropSize() {
  return [CROP.img.width * CROP.base * CROP.scale, CROP.img.height * CROP.base * CROP.scale];
}
function drawCrop() {
  if (!CROP.img) return;
  const [w, h] = cropSize();
  // 틀 바깥으로 빈칸이 생기지 않게 이동 범위를 묶는다
  const mx = Math.max(0, (w - FW) / 2), my = Math.max(0, (h - FH) / 2);
  CROP.ox = clamp(CROP.ox, -mx, mx);
  CROP.oy = clamp(CROP.oy, -my, my);
  const ctx = $('#cropCanvas').getContext('2d');
  ctx.fillStyle = '#1d1c1a';
  ctx.fillRect(0, 0, CW, CH);
  ctx.drawImage(CROP.img, FX + (FW - w) / 2 + CROP.ox, FY + (FH - h) / 2 + CROP.oy, w, h);
  ctx.fillStyle = 'rgba(29, 28, 26, .64)';
  ctx.beginPath();
  ctx.rect(0, 0, CW, CH);
  ctx.rect(FX, FY, FW, FH);
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(245, 241, 233, .35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(FX + (FW * i) / 3, FY);
    ctx.lineTo(FX + (FW * i) / 3, FY + FH);
    ctx.moveTo(FX, FY + (FH * i) / 3);
    ctx.lineTo(FX + FW, FY + (FH * i) / 3);
  }
  ctx.stroke();
  ctx.strokeStyle = '#f5f1e9';
  ctx.lineWidth = 3;
  ctx.strokeRect(FX, FY, FW, FH);
}
function applyCrop() {
  const out = document.createElement('canvas');
  out.width = OUT_W;
  out.height = OUT_H;
  const k = OUT_W / FW;
  const [w, h] = cropSize();
  out.getContext('2d').drawImage(CROP.img, (OUT_W - w * k) / 2 + CROP.ox * k, (OUT_H - h * k) / 2 + CROP.oy * k, w * k, h * k);
  Object.assign(data.subjects[CROP.si], {
    photo: out.toDataURL('image/jpeg', 0.86),
    photoSrc: CROP.src,
    photoCrop: { scale: CROP.scale, ox: CROP.ox, oy: CROP.oy },
  });
  save();
  $('#dlgCrop').close();
  render();
}
(() => {
  const st = $('#cropStage');
  const pt = (e) => {
    const r = st.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * CW) / r.width, y: ((e.clientY - r.top) * CH) / r.height };
  };
  st.addEventListener('pointerdown', (e) => {
    if (!CROP.img) return;
    const p = pt(e);
    CROP.drag = { x: p.x - CROP.ox, y: p.y - CROP.oy };
    st.setPointerCapture(e.pointerId);
  });
  st.addEventListener('pointermove', (e) => {
    if (!CROP.drag) return;
    const p = pt(e);
    CROP.ox = p.x - CROP.drag.x;
    CROP.oy = p.y - CROP.drag.y;
    drawCrop();
  });
  const up = () => (CROP.drag = null);
  st.addEventListener('pointerup', up);
  st.addEventListener('pointercancel', up);
  st.addEventListener('wheel', (e) => {
    if (!CROP.img) return;
    e.preventDefault();
    cropSet(CROP.scale - (e.deltaY > 0 ? 0.06 : -0.06));
  }, { passive: false });
  $('#cropZoom').addEventListener('input', (e) => cropSet(e.target.value));
  $('#cropReset').addEventListener('click', () => cropSet(1, 0, 0));
  $('#cropSwap').addEventListener('click', () => pickPhoto(CROP.si));
  $('#cropApply').addEventListener('click', applyCrop);
  $('#dlgCrop').addEventListener('close', () => {
    CROP.img = null;
    CROP.drag = null;
  });
})();

/* ---------- toolbar actions ---------- */
$('#btnEdit').addEventListener('click', () => {
  ui.editing = !ui.editing;
  render();
  toast(ui.editing ? '편집 모드 — 글자를 눌러 바로 고치세요. 자동 저장됩니다.' : '편집 내용이 이 브라우저에 저장되었습니다.');
});

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 100);
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
const fileStem = () => (data.case.title || 'mind-archive').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);

function ask(msg) {
  return new Promise((resolve) => {
    const d = $('#dlgAsk');
    $('#askText').textContent = msg;
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'yes'), { once: true });
    d.showModal();
  });
}

async function doAction(a) {
  if (a === 'export') {
    download(`${fileStem()}.json`, JSON.stringify(data, null, 2), 'application/json');
  } else if (a === 'copy') {
    toast((await copyText(JSON.stringify(data, null, 2))) ? '백업 내용을 복사했어요.' : '복사에 실패했어요.');
  } else if (a === 'png') {
    // 브라우저 자체 렌더링(SVG foreignObject)으로 찍어서 clip-path·blend·filter까지 화면 그대로 나온다
    if (typeof modernScreenshot === 'undefined') return toast('이미지 모듈을 불러오지 못했어요.');
    const wasEditing = ui.editing;
    const wasExpanded = ui.expandAll;
    ui.editing = false;
    ui.expandAll = true; // 사진에는 서류가 모두 펼쳐진 상태로 담는다
    document.body.classList.add('capturing'); // 펼침 전환 애니메이션 없이 바로 펼친다
    render();
    toast('이미지를 만드는 중…');
    try {
      await document.fonts.ready;
      const blob = await modernScreenshot.domToBlob($('#sheet'), {
        scale: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        type: 'image/png',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${fileStem()}_${ui.view}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    } catch (e) {
      toast('이미지 저장에 실패했어요.');
    }
    ui.editing = wasEditing;
    ui.expandAll = wasExpanded;
    render();
    document.body.classList.remove('capturing');
  } else if (a === 'expand') {
    ui.expandAll = !ui.expandAll;
    if (ui.view === 'X') ui.view = 'A';
    render();
  } else if (a === 'sample') {
    if (!(await ask('현재 내용을 지우고 샘플 데이터로 되돌릴까요? 먼저 백업 파일을 저장해 두세요.'))) return;
    data = normalize(JSON.parse(JSON.stringify(SAMPLE)));
    save();
    render();
  } else if (a === 'blank') {
    if (!(await ask('현재 내용을 지우고 빈 파일로 시작할까요? 먼저 백업 파일을 저장해 두세요.'))) return;
    data = blankData();
    ui.editing = true;
    save();
    render();
    toast('빈 파일입니다. 편집 모드로 직접 채우거나 OOC 답변을 넣으세요.');
  }
}

/* ---------- import ---------- */
$('#btnImport').addEventListener('click', () => {
  $('#importErr').textContent = '';
  $('#dlgImport').showModal();
});
$('#importGo').addEventListener('click', () => {
  try {
    const done = applyAnswers(extractAllJSON($('#importText').value));
    save();
    ui.view = done.includes('NPC') ? 'A' : done.includes('PC') ? 'B' : 'X';
    render();
    $('#dlgImport').close();
    $('#importText').value = '';
    toast(`${done.join(' · ')} 답변을 넣었어요.`);
  } catch (err) {
    $('#importErr').textContent = '답변을 읽지 못했어요. 답변 전체를 복사했는지, AI 답변이 중간에 끊기지 않았는지 확인해 주세요.';
  }
});

/* ---------- prompt ---------- */
function refreshPrompt() {
  const mode = document.querySelector('input[name="pmode"]:checked').value;
  const text = buildPrompt(data, mode);
  $('#promptText').value = text;
  const c = $('#promptCount');
  c.textContent = `${text.length.toLocaleString()} / ${PROMPT_LIMIT.toLocaleString()}자`;
  c.classList.toggle('over', text.length > PROMPT_LIMIT);
}
$('#btnPrompt').addEventListener('click', () => {
  $('input[name="pmode"][value="A"]').checked = true; // 열 때마다 첫 번째(NPC)로
  refreshPrompt();
  $('#dlgPrompt').showModal();
});
document.querySelectorAll('input[name="pmode"]').forEach((r) => r.addEventListener('change', refreshPrompt));
$('#promptCopy').addEventListener('click', async () => {
  toast((await copyText($('#promptText').value)) ? '프롬프트를 복사했어요. AI 채팅에 붙여넣으세요.' : '복사에 실패했어요.');
});

/* ---------- 사용법 안내 ---------- */
const TOUR_KEY = 'mind-archive-tour-done';
const showView = (v) => {
  if (ui.view !== v) {
    ui.view = v;
    saveUI();
    render();
  }
};
const TOUR = [
  { el: () => $('#btnPrompt'), text: `지금 보이는 건 예시예요. 먼저 'OOC 프롬프트'를 열어 NPC → PC → 서사를 하나씩 복사해서 롤플레잉 채팅창에 보내요.` },
  { el: () => $('#btnImport'), text: `AI가 보낸 답변을 'OOC 답변 넣기'에 붙여넣어요. 답변 여러 개를 한꺼번에 넣어도 알아서 제자리에 들어가요.` },
  { el: () => $('#switch'), text: `여기서 NPC, PC, 대질 열람(두 사람의 관계)을 오가며 볼 수 있어요.` },
  { el: () => $('#map-0'), prep: () => showView('A'), text: `머릿속을 차지한 생각이에요. 덩어리를 누르면 관련 파일이 열려요.` },
  { el: () => $('#drawer-A .file-tab'), prep: () => showView('A'), text: `아래 서랍의 파일 탭을 누르면 항목을 하나씩 열람할 수 있어요.` },
  { el: () => $('#btnEdit'), text: `'편집 모드'에서는 글자를 눌러 바로 고칠 수 있어요. 고친 내용은 이 브라우저에 자동 저장돼요.` },
  { el: () => $('#btnMore'), text: `다 되면 '내보내기'에서 이미지로 저장하면 끝! 이 안내는 '도움말'에서 언제든 다시 볼 수 있어요.` },
];
let tourIdx = -1;
const tourEl = () => (tourIdx >= 0 ? TOUR[tourIdx].el() : null);
const barBottom = () => $('.toolbar').getBoundingClientRect().bottom;
function tourClear() {
  document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
}
function tourEnd() {
  tourIdx = -1;
  tourClear();
  $('#tour').hidden = true;
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch (e) {}
}
// 말풍선은 대상 아래 → 위 → 옆 → 화면 아래 순으로 자리를 찾고, 상단 툴바는 가리지 않는다
function tourPlace() {
  const el = tourEl();
  if (!el) return;
  const tip = $('#tour'), r = el.getBoundingClientRect();
  const ring = 5, gap = 8, tw = tip.offsetWidth, th = tip.offsetHeight;
  const minTop = el.closest('.toolbar') ? 10 : barBottom() + 10;
  let top = r.bottom + ring + gap;
  let left = Math.min(Math.max(10, r.left - ring), innerWidth - tw - 10);
  if (top + th > innerHeight - 10) {
    top = r.top - th - ring - gap;
    if (top < minTop) {
      const beside = Math.max(minTop, Math.min(r.top, innerHeight - th - 10));
      if (r.left - ring - gap - tw >= 10) { left = r.left - ring - gap - tw; top = beside; }
      else if (r.right + ring + gap + tw <= innerWidth - 10) { left = r.right + ring + gap; top = beside; }
      else top = innerHeight - th - 10;
    }
  }
  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
}
function tourScroll(el) {
  if (el.closest('.toolbar')) return; // 툴바는 늘 화면에 있다
  const r = el.getBoundingClientRect(), room = innerHeight - barBottom();
  // 큰 대상은 가운데 대신 툴바 바로 아래로 맞춘다
  if (r.height > room - 40) window.scrollTo({ top: scrollY + r.top - barBottom() - 16, behavior: 'instant' });
  else el.scrollIntoView({ block: 'center', behavior: 'instant' });
}
function tourShow(i) {
  if (i < 0) i = 0;
  if (i >= TOUR.length) return tourEnd();
  tourIdx = i;
  const step = TOUR[i];
  if (step.prep) step.prep();
  tourClear();
  const el = step.el();
  if (!el) return tourShow(i + 1);
  el.classList.add('tour-target');
  tourScroll(el);
  $('#tourText').textContent = step.text;
  $('#tourStep').textContent = `${i + 1} / ${TOUR.length}`;
  const last = i === TOUR.length - 1;
  $('#tourPrev').disabled = i === 0;
  $('#tourSkip').hidden = last; // 마지막은 이전 · 완료만
  $('#tourNext').textContent = last ? '완료' : '다음';
  $('#tour').hidden = false;
  requestAnimationFrame(tourPlace);
}
$('#btnHelp').addEventListener('click', () => tourShow(0));
$('#tourSkip').addEventListener('click', tourEnd);
$('#tourPrev').addEventListener('click', () => tourShow(tourIdx - 1));
$('#tourNext').addEventListener('click', () => tourShow(tourIdx + 1));
window.addEventListener('resize', tourPlace);
window.addEventListener('scroll', tourPlace, { passive: true });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && tourIdx >= 0 && !document.querySelector('dialog[open]')) tourEnd();
});

/* ---------- boot ---------- */
function boot() {
  let loaded = null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) loaded = JSON.parse(raw);
  } catch (e) {}
  data = normalize(loaded || JSON.parse(JSON.stringify(SAMPLE)));
  if (loaded) save();
  try {
    const u = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (u) {
      if (['A', 'B', 'X'].includes(u.view)) ui.view = u.view;
    }
  } catch (e) {}
  render();
  // 첫 방문이면 사용법 안내를 띄운다. 끝까지 안 보고 새로고침해도 다시 뜨지 않도록 띄우는 시점에 기록한다
  if (!loaded) {
    let seen = false;
    try {
      seen = !!localStorage.getItem(TOUR_KEY);
      localStorage.setItem(TOUR_KEY, '1');
    } catch (e) {}
    if (!seen) setTimeout(() => tourShow(0), 600);
  }
}
boot();
