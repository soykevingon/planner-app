(() => {
  const $ = id => document.getElementById(id);
  const DAY = 864e5;
  const APP_VERSION = '0.44 alpha';
  // Product name lives here only: change these two lines to rebrand.
  const APP_NAME = 'Kairo', APP_TAGLINE = 'Less time planning. More time doing.';
  // Supabase project (the anon key is public by design; row level security protects the data)
  const CLOUD_URL = 'https://yuyvntrzwuyttauunzff.supabase.co';
  const CLOUD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1eXZudHJ6d3V5dHRhdXVuemZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTU3MDgsImV4cCI6MjEwNjg5MTcwOH0.5Zx_foofHEs23S1lmh3PvWTXits-yPa79l7L-pWYoPA';
  let sb = null, cloudUser = null, cloudMark = null, pending = {}, syncBusy = false, syncAgain = false, lastSyncAt = null, cloudErr = '', pushT = null;
  try { pending = JSON.parse(localStorage.getItem('pr-pending') || '{}'); } catch { pending = {}; }
  const EFFORTS = [[0.5,'30m'],[1,'1h'],[2,'2h'],[4,'4h'],[8,'1 day']];
  let tasks = [], dailies = [], clientDocs = [], spaces = [], events = [], settings = {focusHours: 5, workStart: '08:30', workEnd: '17:30'};
  let allSettings = {}, planOverride;
  let me = null, personFilter = 'mine', range = 'week', closingId = null;
  let store = null, editingId = null, dEditingId = null;
  let view = 'all', clientFilter = 'all', tab = 'today', spaceFilter = 'all', horizon = 90, projOpen = null;
  try { personFilter = localStorage.getItem('pr-person') || 'mine'; range = localStorage.getItem('pr-range') || 'week'; } catch {}
  try { view = localStorage.getItem('pr-view') || 'all'; clientFilter = localStorage.getItem('pr-client') || 'all'; tab = localStorage.getItem('pr-tab') || 'today'; } catch {}
  try { spaceFilter = 'all'; { const hz = localStorage.getItem('pr-horizon'); horizon = hz === null ? 90 : Number(hz) || 0; } } catch {}
  if(['#radar','#today','#reports','#projects','#calendar'].includes(location.hash)) tab = location.hash.slice(1);

  /* ---------- dates (day offsets from today) ---------- */
  const today0 = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const parseD = s => { if(!s) return null; const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
  const daysTo = s => { const d = parseD(s); return d ? Math.round((d - today0()) / DAY) : null; };
  const offDate = o => new Date(today0().getTime() + o*DAY);
  const isWork = o => { const g = offDate(o).getDay(); return g >= 1 && g <= 5; };
  const prevW = o => { o--; while(!isWork(o)) o--; return o; };
  const nextW = o => { while(!isWork(o)) o++; return o; };
  const weekEndOff = () => (7 - today0().getDay()) % 7;
  const fmt = d => d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
  const fmtOff = o => o === 0 ? 'today' : o === 1 ? 'tomorrow' : offDate(o).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
  const fmtT = ts => new Date(ts).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
  const fmtH = h => h < 1 ? `${Math.round(h*60)}m` : `${+h.toFixed(1)}h`;
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const isWeekday = () => isWork(0);
  // work hours: "HH:MM" strings (older numeric values still read)
  const toH = v => { if(typeof v === 'number') return v; const str = String(v ?? '').trim(); if(!/^\d{1,2}:\d{2}$/.test(str)) return null; const [h, m] = str.split(':').map(Number); return h + m/60; };
  const toHM = h => `${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round((h % 1) * 60)).padStart(2,'0')}`;
  const fmtClock = h => { const d = new Date(); d.setHours(Math.floor(h), Math.round((h % 1)*60), 0, 0); return fmtT(d); };
  const usualWindow = () => { const a = toH(settings.workStart) ?? 8.5, b = toH(settings.workEnd) ?? 17.5; return [a, Math.max(a + 0.5, b)]; };
  const todayOverride = () => settings.today && settings.today.date === dayKey() ? settings.today : null;
  const window0 = () => { const o = todayOverride(); if(!o) return usualWindow(); const a = toH(o.start), b = toH(o.end); return a !== null && b !== null && b > a ? [a, b] : usualWindow(); };
  const nowH = () => { const n = new Date(); return n.getHours() + n.getMinutes()/60; };
  // clock time left in today's workday, in hours
  const workLeft = () => { if(!isWork(0)) return 0; const [a, b] = window0(); return Math.max(0, b - Math.max(nowH(), a)); };
  // focus time left today: focus hours (minus meetings) scaled to the part of the day that's left
  // hours of calendar events inside the work window on a given day (left from now on, for today)
  function calBusy(o){
    if(!events.length) return 0;
    const day = dayKey(offDate(o)), [a, b] = o === 0 ? window0() : usualWindow(), from = o === 0 ? Math.max(a, nowH()) : a;
    let h = 0;
    for(const ev of events){
      if(ev.allDay || !ev.start || ev.start.slice(0, 10) !== day) continue;
      const s0 = toH(ev.start.slice(11, 16)), e0 = ev.end && ev.end.slice(0, 10) === day ? toH(ev.end.slice(11, 16)) : s0 + 1;
      h += Math.max(0, Math.min(e0, b) - Math.max(s0, from));
    }
    return h;
  }
  const focusLeftToday = () => { const [a, b] = window0(); const left = workLeft(); if(!left) return 0; return Math.max(0, (settings.focusHours - busyToday()) * left / (b - a) - calBusy(0)); };
  const sameDay = (ts) => ts && dayKey(new Date(ts)) === dayKey();

  /* ---------- task helpers ---------- */
  const byId = id => tasks.find(t => t.id === id);
  const parentOf = t => t.parentId ? byId(t.parentId) : null;
  const subsOf = t => tasks.filter(s => s.parentId === t.id);
  const isOpen = t => { if(t.done) return false; const p = parentOf(t); return !(p && p.done); };
  const isLeaf = t => isOpen(t) && !t.isProject && !subsOf(t).some(s => !s.done);
  // after-hours jobs (maintenance windows, night work) never use focus time and stay off the radar
  const plannable = t => !t.afterHours;
  const progOf = t => Math.min(100, Math.max(0, Number(t.progress) || 0));
  const travelOf = t => (t.location === 'onsite' || t.location === 'hybrid') ? (Number(t.travelMin) || 0) / 60 : 0;
  // time still needed: effort minus progress, plus travel for on-site work
  const remOf = t => effortOf(t) * (1 - progOf(t) / 100) + travelOf(t);
  // be ready N days before the real deadline (Settings); bills use their own reminder
  const readyLead = () => Math.max(0, Number(settings.readyLead ?? 7) || 0);
  /* How many days before the deadline a task should be READY.
     Automatic: small work needs no buffer; bigger work gets more, up to the
     Settings maximum. A task can override it (on the due date / N days). */
  function leadOf(t){
    if(isPayment(t)) return remindDays();
    if(t.readyMode === 'due') return 0;
    if(t.readyMode === 'days') return Math.max(0, Number(t.readyDays) || 0);
    if(modeOf(t) !== 'normal' || t.afterHours || t.isProject) return 0;
    const h = effortOf(t), max = readyLead();
    return h < 2 ? 0 : h < 4 ? Math.min(max, 1) : h < 8 ? Math.min(max, 2) : max;
  }
  const ahWhen = t => t.ahAt ? new Date(t.ahAt) : (eff(t).deadline ? parseD(eff(t).deadline) : null);
  const fmtWhen = d => d ? d.toLocaleString('en-US', {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) : 'No date';
  const modeOf = t => t.mode || 'normal';
  const busyToday = () => settings.busy && settings.busy.date === dayKey() ? Number(settings.busy.hours) || 0 : 0;
  const loggedOn = (t, key) => (t.sessions || []).filter(x => x.date === key).reduce((a,x) => a + (x.hours || 0), 0);
  const effortOf = t => (t.effort === 0 || t.effort === '0') ? 0 : (Number(t.effort) || 1);
  function eff(t){
    const p = parentOf(t);
    return {
      importance: t.importance ?? (p && p.importance) ?? 3,
      urgency: t.urgency ?? (p && p.urgency) ?? 3,
      deadline: t.deadline || (p && p.deadline) || null,
      client: (p ? p.client : t.client) || '',
      assignees: (t.assignees && t.assignees.length) ? t.assignees : ((p && p.assignees) || []),
      space: spaceOf(t),
    };
  }

  /* ---------- spaces ----------
     Every top-level task, project and recurring item lives in a space (Work,
     University…); subtasks follow their project. A space decides WHEN its work
     can be planned: during work hours, in evenings and weekends, or any time. */
  const DEFAULT_SPACES = [
    {id: 'sp-work', name: 'Work', color: '#2f7d8c', planDuring: 'work'},
    {id: 'sp-university', name: 'University', color: '#6a55c9', planDuring: 'evenings'},
    {id: 'sp-personal', name: 'Personal', color: '#b8487a', planDuring: 'evenings'},
    {id: 'sp-finances', name: 'Finances', color: '#3b8a4c', planDuring: 'any'},
  ];
  const SPACE_COLORS = ['#2f7d8c', '#6a55c9', '#b8487a', '#3b8a4c', '#C0702F', '#4f6fb8', '#8a6a2f', '#5d6878'];
  const PLAN_DURING = {work: 'Work hours', evenings: 'Evenings & weekends', any: 'Any time', custom: 'Custom hours'};
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // a space with its own schedule: chosen weekdays, between start and end
  const customDays = sp => Array.isArray(sp.days) && sp.days.length ? sp.days : [1, 2, 3, 4, 5];
  const customWin = sp => { const a = toH(sp.start) ?? 18, b = toH(sp.end) ?? 21; return [a, Math.max(a + 0.5, b)]; };
  const spaceWhen = sp => sp.planDuring === 'custom' ? `${customDays(sp).map(d => DOW[d]).join(', ')} ${fmtClock(customWin(sp)[0])}–${fmtClock(customWin(sp)[1])}` : PLAN_DURING[sp.planDuring || 'work'].toLowerCase();
  const spacesSorted = () => [...spaces].sort((a,b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));
  const spaceById = id => id ? spaces.find(x => x.id === id) || null : null;
  const defaultSpace = () => { const l = spacesSorted(); return l.find(x => x.planDuring === 'work') || l[0] || null; };
  function spaceOf(t){ const p = t.parentId ? byId(t.parentId) : null; return spaceById(p ? p.spaceId : t.spaceId) || defaultSpace(); }
  /* Linked spaces: a personal setting that makes one space count as part of another
     (e.g. a team's shared space planned and shown as part of my Work). One level only. */
  const spaceLinks = () => settings.spaceLinks || {};
  function linkTarget(sp){ if(!sp) return null; const id = spaceLinks()[sp.id]; const t = id && id !== sp.id ? spaceById(id) : null; return t && !spaceLinks()[t.id] ? t : null; }
  const rootSpace = sp => sp ? (linkTarget(sp) || sp) : null;
  const linkedTo = sp => spaces.filter(x => x.id !== sp.id && (linkTarget(x) || {}).id === sp.id);
  const spaceMatch = (sp, id) => !!sp && (sp.id === id || (rootSpace(sp) || {}).id === id);
  /* Space scope: "enter" one space and the whole app shows only it (and spaces linked to it). Per device. */
  let scope = 'all'; try { scope = localStorage.getItem('pr-scope') || 'all'; } catch {}
  const scopeSp = () => scope !== 'all' && scope !== '__shared' ? spaceById(scope) : null;
  const inScope = sp => { if(scope === '__shared') return !!(sp || {}).shared || !!(rootSpace(sp) || {}).shared; const f = scopeSp(); return !f || (rootSpace(sp) || {}).id === f.id || (sp || {}).id === f.id; };
  const poolsOf = t => { const sp = rootSpace(spaceOf(t)), pd = sp ? sp.planDuring : 'work'; return pd === 'evenings' ? ['eve'] : pd === 'any' ? ['work', 'eve'] : pd === 'custom' ? ['sp:' + sp.id] : ['work']; };
  const isPayment = t => t.amount !== undefined && t.amount !== null && t.amount !== '';
  const money = v => { try { return new Intl.NumberFormat('en-US', {style: 'currency', currency: settings.currency || 'USD'}).format(Number(v) || 0); } catch { return '$' + (Number(v) || 0).toFixed(2); } };
  const remindDays = () => Math.max(0, Number(settings.payRemindDays ?? 3) || 0);
  // evening & weekend time: weekday evenings start 30 min after work and run to 10 PM; weekend days 9 AM–10 PM
  const EVE_END = 22;
  const eveHours = o => Math.max(0, Number(isWork(o) ? (settings.eveningHours ?? 2) : (settings.weekendHours ?? 4)) || 0);
  const eveLeftToday = () => { const tot = eveHours(0), h = nowH(), st = isWork(0) ? window0()[1] + 0.5 : 9; if(h <= st) return tot; if(h >= EVE_END) return 0; return tot * (EVE_END - h) / (EVE_END - st); };
  const customCap = (o, pool) => {
    const sp = spaceById(pool.slice(3)); if(!sp || !customDays(sp).includes(offDate(o).getDay())) return 0;
    const [a, b] = customWin(sp); if(o !== 0) return b - a;
    const h = nowH(); return h <= a ? b - a : Math.max(0, b - h);
  };
  const capOf = (o, pool) => pool.startsWith('sp:') ? customCap(o, pool) : pool === 'work' ? (!isWork(o) ? 0 : o === 0 ? focusLeftToday() : Math.max(0, settings.focusHours - calBusy(o))) : (o === 0 ? eveLeftToday() : eveHours(o));
  const firstOf = pool => {
    if(pool === 'work') return workLeft() > 1/60 ? 0 : nextW(1);
    if(pool === 'eve') return eveLeftToday() > 1/60 ? 0 : 1;
    for(let o = 0; o < 15; o++) if(capOf(o, pool) > 1/60) return o;
    return 1;
  };

  /* ---------- planner ----------
     Works backward from each deadline. Important work gets a safety buffer
     (importance 5: 2 workdays, 4: 1 workday). Each item is placed on the latest
     workday with free focus hours before its plan-by day; when days fill up,
     work spills earlier. Subtasks keep their order: an earlier subtask must be
     done by the day the next one starts. The earliest day an item lands on is
     its "start by" date, the false deadline that drives priority. */
  let S = {res: new Map(), steady: new Map(), firstW: 0, firstE: 0, left: () => 0};
  function plan(){
    const firstW = firstOf('work'), firstE = firstOf('eve'), firsts = {work: firstW, eve: firstE}, cap = new Map();
    const firstP = pool => firsts[pool] ?? (firsts[pool] = firstOf(pool));
    const left = (o, pool = 'work') => { const k = o + '|' + pool; return cap.has(k) ? cap.get(k) : capOf(o, pool); };
    const take = (o, pool, h) => cap.set(o + '|' + pool, left(o, pool) - h);
    const res = new Map(), steady = new Map();
    // 1. Emergencies take today's work time first, whatever it costs
    const mine = t => assignedTo(t, planFor());
    for(const t of tasks.filter(t => isOpen(t) && mine(t) && plannable(t) && modeOf(t) === 'emergency')){
      const h = remOf(t); take(firstW, 'work', h);
      res.set(t.id, {start: firstW, chunks: [[firstW, h, 'work']], planBy: firstW, risk: false, dd: daysTo(eff(t).deadline) ?? firstW, emergency: true});
    }
    // 2. Steady work reserves its weekly sessions (in its space's time)
    for(const t of tasks.filter(t => isOpen(t) && mine(t) && plannable(t) && modeOf(t) === 'steady')){
      const pool = poolsOf(t)[0], days = steadyDays(t, firstP(pool)).map(([d, h]) => [d, h, pool]);
      for(const [d, h] of days) take(d, pool, h);
      steady.set(t.id, days);
    }
    // 2b. Work time the user chose is reserved first; the rest of the effort is planned around it
    const pins = new Map();
    for(const t of tasks.filter(t => isLeaf(t) && mine(t) && plannable(t) && modeOf(t) === 'normal' && (t.workTimes || []).length)){
      const pool = poolsOf(t)[0], ch = [];
      t.workTimes.forEach((w, k) => { const o = daysTo(w.date), h = Number(w.hours) || 0; if(o === null || o < 0 || h <= 0) return; take(o, pool, h); ch.push([o, h, pool, 'pin', k]); });
      if(ch.length) pins.set(t.id, ch);
    }
    const pinH = t => (pins.get(t.id) || []).reduce((a, c) => a + c[1], 0);
    // 3. Deadline work, placed backward from each plan-by day
    const items = tasks.filter(t => isLeaf(t) && mine(t) && plannable(t) && modeOf(t) === 'normal').map(t => { const e = eff(t); return {t, e, dd: daysTo(e.deadline), hours: Math.max(0, remOf(t) - pinH(t)), pools: poolsOf(t)}; }).filter(i => i.dd !== null && i.hours > 1e-9);
    for(const i of items){
      const workOnly = i.pools.length === 1 && i.pools[0] === 'work';
      const back = o => workOnly ? prevW(o) : o - 1;
      i.first = Math.min(...i.pools.map(firstP));
      // plan to be READY a set number of days before the real deadline
      i.ready = i.dd - leadOf(i.t);
      let p = Math.max(i.first, i.ready);
      if(workOnly && !isWork(p)) p = Math.max(i.first, back(p));
      i.planBy = p;
    }
    const chains = new Map();
    for(const i of items) if(i.t.parentId){ if(!chains.has(i.t.parentId)) chains.set(i.t.parentId, []); chains.get(i.t.parentId).push(i); }
    for(const arr of chains.values()){ arr.sort((a,b) => (a.t.createdAt||0) - (b.t.createdAt||0)); arr.forEach((i,k) => { i.prev = arr[k-1] || null; }); }
    const pending = [...items];
    while(pending.length){
      pending.sort((a,b) => (b.planBy - a.planBy) || ((b.t.createdAt||0) - (a.t.createdAt||0)));
      const i = pending.shift();
      let rem = i.hours, d = i.planBy; const chunks = [];
      while(rem > 1e-9 && d >= i.first){
        for(const pool of i.pools){
          if(rem <= 1e-9) break;
          const l = left(d, pool);
          if(l > 1e-9){ const h = Math.min(l, rem); take(d, pool, h); rem -= h; chunks.push([d, h, pool]); }
        }
        d--;
      }
      let risk = false;
      if(rem > 1e-9){ risk = true; const pool = i.pools[0], f = firstP(pool); const ex = chunks.find(c => c[0] === f && c[2] === pool); if(ex) ex[1] += rem; else chunks.push([f, rem, pool]); take(f, pool, rem); }
      const start = Math.min(...chunks.map(c => c[0]));
      res.set(i.t.id, {start, chunks, planBy: i.planBy, risk, dd: i.dd, ready: i.ready});
      if(i.prev) i.prev.planBy = Math.max(i.prev.first, Math.min(i.prev.planBy, start));
    }
    for(const [id, ch] of pins){
      const t = byId(id), dd = daysTo(eff(t).deadline), r = res.get(id), first = Math.min(...ch.map(c => c[0]));
      if(r){ r.chunks = [...ch, ...r.chunks]; r.start = Math.min(r.start, first); }
      else res.set(id, {start: first, chunks: ch, planBy: Math.max(...ch.map(c => c[0])), risk: false, dd: dd ?? 999, ready: dd === null ? 999 : dd - leadOf(t)});
      const rr = res.get(id); rr.pinOn = new Set(ch.map(c => c[0]));
    }
    S = {res, steady, firstW, firstE, firsts, left};
  }
  // Steady work: N sessions a week on spread-out weekdays, until the deadline.
  // Sessions already logged this week count; missed ones move to the next free weekday.
  function steadyDays(t, firstW){
    const sh = Number(t.sessionHours) || 1;
    const n = Math.min(5, Math.max(1, Math.round((Number(t.weeklyHours) || 3) / sh)));
    const pat = {1:[3], 2:[2,4], 3:[1,3,5], 4:[1,2,4,5], 5:[1,2,3,4,5]}[n];
    const dd = daysTo(t.deadline);
    const wk0 = firstW - offDate(firstW).getDay();
    const keyOf = o => dayKey(offDate(o));
    const weekKeys = new Set([0,1,2,3,4,5,6].map(i => keyOf(wk0 + i)));
    const doneThisWeek = new Set((t.sessions || []).filter(x => weekKeys.has(x.date)).map(x => x.date)).size;
    const loggedToday = loggedOn(t, dayKey()) > 0;
    const ok = o => o >= firstW && (dd === null || o <= dd) && !(o === 0 && loggedToday);
    const cands = [1,2,3,4,5].map(w => wk0 + w).filter(ok);
    const ordered = [...cands.filter(o => pat.includes(o - wk0)), ...cands.filter(o => !pat.includes(o - wk0))];
    const out = ordered.slice(0, Math.max(0, n - doneThisWeek)).sort((a,b) => a - b).map(o => [o, sh]);
    for(const w of pat){ const o = wk0 + 7 + w; if(dd === null || o <= dd) out.push([o, sh]); }
    return out;
  }
  function startOf(t){
    const r = S.res.get(t.id); if(r) return r.start;
    const st0 = S.steady.get(t.id); if(st0) return st0.length ? st0[0][0] : null;
    const st = subsOf(t).map(s => S.res.get(s.id)).filter(Boolean).map(r => r.start);
    return st.length ? Math.min(...st) : null;
  }

  /* ---------- scoring ---------- */
  function calc(t){
    const e = eff(t);
    const imp = (e.importance - 1) / 4, urg = (e.urgency - 1) / 4;
    const days = daysTo(e.deadline), start = isOpen(t) ? startOf(t) : null;
    const ready = days === null || modeOf(t) !== 'normal' ? null : days - leadOf(t);
    let pressure = days === null ? null : Math.min(days, start ?? days, ready ?? days);
    if(modeOf(t) === 'steady' && isOpen(t)) pressure = start !== null ? start + 1 : (days ?? 7);
    const dl = pressure === null ? 0.15 : pressure <= 0 ? 1 : Math.exp(-pressure / 5);
    let score = Math.min(100, Math.round(100 * (0.40*imp + 0.25*urg + 0.35*dl)));
    let effUrg = Math.max(urg, dl);
    if(modeOf(t) === 'emergency' && !t.done){ score = 100; effUrg = 1; }
    const q = imp >= 0.5 ? (effUrg >= 0.5 ? 1 : 2) : (effUrg >= 0.5 ? 3 : 4);
    const tier = score >= 70 ? 'crit' : score >= 50 ? 'high' : score >= 30 ? 'mid' : 'low';
    const openHours = modeOf(t) === 'steady' ? 0 : isLeaf(t) ? remOf(t) : subsOf(t).filter(s => !s.done).reduce((a,s) => a + remOf(s), 0);
    const late = !t.done && !t.afterHours && !isPayment(t) && ready !== null && ready < 0 && days >= 0;
    return {t, e, score, days, start, pressure, q, tier, openHours, ready, late, risk: !!(S.res.get(t.id) || {}).risk};
  }
  const tierName = {crit:'P1 Critical', high:'P2 High', mid:'P3 Medium', low:'P4 Low'};
  const lvl = v => `${6 - v} of 5`;   // stored 5 = highest, shown as 1
  const qName = {1:'Do now', 2:'Schedule', 3:'Quick win', 4:'If time allows'};

  function due(days, deadline){
    if(days === null) return {txt:'No deadline', cls:''};
    if(days < 0) return {txt:`Overdue ${-days} day${days===-1?'':'s'}`, cls:'over'};
    if(days === 0) return {txt:'Due today', cls:'over'};
    if(days === 1) return {txt:'Due tomorrow', cls:'soon'};
    if(days <= 3) return {txt:`Due in ${days} days`, cls:'soon'};
    return {txt:'Due ' + fmt(parseD(deadline)), cls:''};
  }

  /* ---------- recurring work ----------
     freq: hours | daily  -> checks you log (inner ring)
           weekly | monthly | quarterly -> a real task is created `lead` days
           before each due date (weekends move back to Friday), with optional subtasks. */
  const freqOf = d => d.freq || (d.everyHours ? 'hours' : 'daily');
  const isCheck = d => ['hours', 'daily'].includes(freqOf(d));
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const toFriday = dt => { const g = dt.getDay(); if(g === 6) dt.setDate(dt.getDate() - 1); if(g === 0) dt.setDate(dt.getDate() - 2); return dt; };
  const dayIn = (y, m, d) => { const last = new Date(y, m + 1, 0).getDate(); return toFriday(new Date(y, m, d === -1 ? last : Math.min(d, last))); };
  // the period containing `ref` and the next one: [{key, label, due}]
  function periodsAround(r, ref){
    const f = freqOf(r), out = [];
    if(f === 'weekly'){
      const mon = new Date(ref); mon.setHours(0,0,0,0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      for(let k = 0; k < 2; k++){
        const due = new Date(mon); due.setDate(mon.getDate() + 7*k + (Number(r.weekday) || 5) - 1);
        out.push({key: dayKey(due), label: MONTHS.at(due.getMonth()) + ' ' + due.getDate(), due});
      }
    } else if(f === 'monthly'){
      for(let k = 0; k < 2; k++){
        const due = dayIn(ref.getFullYear(), ref.getMonth() + k, Number(r.dayOfMonth) || 1);
        const y = new Date(ref.getFullYear(), ref.getMonth() + k, 1);
        out.push({key: `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}`, label: `${MONTHS.at(y.getMonth())} ${y.getFullYear()}`, due});
      }
    } else if(f === 'quarterly'){
      const q0 = Math.floor(ref.getMonth() / 3);
      for(let k = 0; k < 2; k++){
        const qs = new Date(ref.getFullYear(), (q0 + k) * 3, 1), qn = Math.floor(qs.getMonth() / 3) + 1;
        const due = dayIn(qs.getFullYear(), qs.getMonth() + (Number(r.quarterMonth) || 1) - 1, Number(r.dayOfMonth) || 15);
        out.push({key: `${qs.getFullYear()}-Q${qn}`, label: `Q${qn} ${qs.getFullYear()}`, due});
      }
    }
    return out;
  }
  // next period that still needs a task (for display)
  function nextPeriod(r){
    const t0 = today0();
    for(const p of [...periodsAround(r, t0), ...periodsAround(r, new Date(t0.getFullYear(), t0.getMonth() + 3, t0.getDate()))])
      if(p.due >= t0 && !byId(`rec-${r.id}-${p.key}`)) return p;
    return null;
  }
  let spawning = false, dataReady = false;
  async function spawnRecurring(){
    if(spawning || !store || !dataReady) return;
    spawning = true;
    try {
      const t0 = today0(), created = [];
      for(const r of dailies){
        if(isCheck(r) || r._owner) continue;
        const born = new Date(r.createdAt || Date.now()); born.setHours(0,0,0,0);
        for(const p of periodsAround(r, t0)){
          const id = `rec-${r.id}-${p.key}`;
          if(byId(id) || (r.spawned || []).includes(p.key)) continue;
          if(p.due < born) continue;                                     // period ended before it existed
          const lead = Number(r.lead) || 3, start = new Date(p.due); start.setDate(start.getDate() - lead);
          if(t0 < start) continue;                                       // too early
          const subs = (r.subtasks || []).filter(x => x && x.title);
          const deadline = dayKey(p.due);
          await store.save('tasks', id, {title: `${r.title} – ${p.label}`, client: r.client || '', parentId: null, assignees: r.owner ? [r.owner] : [],
            importance: Number(r.importance) || 3, urgency: Number(r.urgency) || 3, deadline, effort: Number(r.effort) || 1, mode: 'normal',
            notify: {close: true, start: true, due: true, watchers: []}, notes: '', done: false, doneAt: null, sessions: [],
            createdAt: Date.now(), recurringId: r.id, example: false, spaceId: r.spaceId || null, amount: r.amount ?? null});
          let i = 0;
          for(const sub of subs){
            await store.save('tasks', `${id}-s${i}`, {title: sub.title, client: '', parentId: id, assignees: [], importance: null, urgency: null, deadline: null,
              effort: Number(sub.effort) || 1, mode: 'normal', notify: {close: false, start: true, due: false, watchers: []}, notes: '', done: false, doneAt: null,
              sessions: [], createdAt: Date.now() + (++i), example: false});
          }
          const data = {...r, spawned: [...(r.spawned || []), p.key].slice(-12)}; delete data.id;
          await store.save('daily', r.id, data);
          created.push(r.title + ' – ' + p.label);
        }
      }
      if(created.length) toast(created.length === 1 ? `Created: ${created[0]}` : `Created ${created.length} recurring tasks`);
    } catch(e){ fail(e); }
    finally { spawning = false; }
  }

  /* ---------- routine checks ---------- */
  function dailyState(d){
    const checks = d.log && d.log.date === dayKey() ? (d.log.checks || []) : [];
    const last = checks.length ? checks[checks.length-1] : null;
    if(!isWeekday()) return {checks, last, due:false, txt:'Resumes Monday'};
    const now = new Date(), h = now.getHours() + now.getMinutes()/60;
    if(!d.everyHours) return last ? {checks, last, due:false, txt:`Done at ${fmtT(last)}`} : {checks, last, due:true, txt:'Due today'};
    const [WS, WE] = window0();
    if(h < WS) return {checks, last, due:false, txt:`Starts at ${fmtClock(WS)}`};
    const start = new Date(); start.setHours(Math.floor(WS), Math.round((WS % 1)*60), 0, 0);
    const next = last ? last + d.everyHours*36e5 : start.getTime();
    if(h >= WE) return {checks, last, due:false, txt:`${checks.length} check${checks.length===1?'':'s'} today · done for the day`};
    if(Date.now() >= next) return {checks, last, due:true, txt: last ? `Due now · last at ${fmtT(last)}` : 'Due now · first check of the day'};
    return {checks, last, due:false, txt:`Next at ${fmtT(next)} · ${checks.length} today`};
  }

  /* ---------- filters ---------- */
  const clientOk = c => clientFilter === 'all' || (clientFilter === '__none' ? !c : c === clientFilter);
  const planFor = () => planOverride !== undefined ? planOverride : (personFilter === 'all' || personFilter === 'mine') ? me : personFilter;
  const assignedTo = (t, uid) => { if(!uid) return true; const a = eff(t).assignees; return !a.length || a.includes(uid); };
  const personOk = t => personFilter === 'all' || assignedTo(t, planFor());
  const spaceOk = t => { const sp = spaceOf(t); return inScope(sp) && (spaceFilter === 'all' || (spaceFilter === '__shared' ? !!(sp || {}).shared : spaceMatch(sp, spaceFilter))); };
  const vis = t => clientOk(eff(t).client) && personOk(t) && spaceOk(t);
  const dailyVis = d => { const sp = spaceById(d.spaceId) || defaultSpace(); return inScope(sp) && (spaceFilter === 'all' || (spaceFilter === '__shared' ? !!(sp || {}).shared : spaceMatch(sp, spaceFilter))); }
  const dailyVis2 = d => dailyVis(d) && clientOk(d.client || '') && (personFilter === 'all' || !me || !d.owner || d.owner === planFor());
  /* Order used by the radar numbers and the lists beside it:
       1 Emergency · 2 Overdue · 3 Late (ready-by passed) · 4 At risk ·
       5 Must start today · 6 the rest by start-by date · 7 no deadline.
     Ties: earlier start-by, then higher priority, then the quicker task. */
  function orderOf(x){
    const subs = !x.t.parentId ? subsOf(x.t).filter(isOpen).map(calc) : [];
    const all = [x, ...subs];
    const bucketOf = y => modeOf(y.t) === 'emergency' ? 0 : (y.days !== null && y.days < 0) ? 1 : y.late ? 2 : y.risk ? 3
      : (y.start !== null && y.start <= 0) ? 4 : y.days !== null ? 5 : 6;
    const wh = y => y.start ?? y.ready ?? y.days ?? 9999;
    return {b: Math.min(...all.map(bucketOf)), w: Math.min(...all.map(wh)), s: Math.max(...all.map(y => y.score)), h: x.openHours || 0};
  }
  const byOrder = (a, b) => { const A = a._o || (a._o = orderOf(a)), B = b._o || (b._o = orderOf(b)); return A.b - B.b || A.w - B.w || B.s - A.s || A.h - B.h; };
  const BUCKET = ['Emergency', 'Overdue', 'Late', 'At risk', 'Start today', '', ''];

  function inView(x){
    const hasSubs = !x.t.parentId && subsOf(x.t).length > 0;
    if(view === 'projects') return !x.t.parentId;
    if(view === 'subtasks') return !hasSubs;
    return true;
  }
  function clients(){
    const s = new Set(clientDocs.map(c => c.name).filter(Boolean));
    tasks.forEach(t => { const c = eff(t).client; if(c) s.add(c); });
    dailies.forEach(d => { if(d.client) s.add(d.client); });
    return [...s].sort((a,b) => a.localeCompare(b));
  }

  /* ---------- radar ---------- */
  const NS = 'http://www.w3.org/2000/svg', C = 260, R = 220, INNER = 30;
  const el = (n, a, txt) => { const e = document.createElementNS(NS, n); for(const k in a) e.setAttribute(k, a[k]); if(txt != null) e.textContent = txt; return e; };
  const hash = s => { let h = 0; for(const c of s) h = (h*31 + c.charCodeAt(0)) >>> 0; return h; };
  const radiusFor = s => 54 + (R - 66) * (1 - Math.min(100, Math.max(0, s))/100);

  function drawRadar(items, rankOf, dailyItems){
    const svg = $('radar'); svg.textContent = '';
    const P = a => [C + R*Math.cos(a*Math.PI/180), C + R*Math.sin(a*Math.PI/180)];
    for(const [a0,a1,v] of [[-90,0,'--q1'],[180,270,'--q2'],[0,90,'--q3'],[90,180,'--q4']]){
      const [x0,y0] = P(a0), [x1,y1] = P(a1);
      svg.append(el('path', {d:`M${C},${C} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z`, fill:`var(${v})`}));
    }
    for(const s of [70,50,30]){
      const r = radiusFor(s);
      svg.append(el('circle', {cx:C, cy:C, r, fill:'none', stroke:'var(--line)', 'stroke-dasharray':'3 4'}));
      svg.append(el('text', {x:C+4, y:C-r-3, 'font-size':10, fill:'var(--muted)'}, s));
    }
    svg.append(el('circle', {cx:C, cy:C, r:R, fill:'none', stroke:'var(--line)'}));
    for(const [a,b,c,d] of [[C-R,C,C-46,C],[C+46,C,C+R,C],[C,C-R,C,C-46],[C,C+46,C,C+R]]) svg.append(el('line', {x1:a, y1:b, x2:c, y2:d, stroke:'var(--line)'}));
    for(const [x,y,a,b] of [[C+R*.62,26,'DO NOW','Important · Urgent'],[C-R*.62,26,'SCHEDULE','Important · Not urgent'],
                            [C+R*.62,504,'QUICK WIN','Urgent · Less important'],[C-R*.62,504,'IF TIME ALLOWS','Neither']]){
      svg.append(el('text', {x, y, 'text-anchor':'middle', 'font-size':11.5, 'font-weight':600, 'letter-spacing':'.08em', fill:'var(--ink)'}, a));
      svg.append(el('text', {x, y:y+13, 'text-anchor':'middle', 'font-size':10, fill:'var(--muted)'}, b));
    }
    svg.append(el('circle', {cx:C, cy:C, r:INNER+12, fill:'var(--surface)', stroke:'var(--line)'}));
    svg.append(el('text', {x:C, y:C+3.5, 'text-anchor':'middle', 'font-size':9.5, 'font-weight':600, 'letter-spacing':'.1em', fill:'var(--muted)'}, 'DAILY'));
    dailyItems.forEach((d, i) => {
      const a = (-90 + i * 360 / Math.max(1, dailyItems.length)) * Math.PI/180;
      const x = C + INNER*Math.cos(a), y = C + INNER*Math.sin(a);
      const r = el('rect', {x:x-6, y:y-6, width:12, height:12, rx:2, class:'dot', 'data-daily':d.d.id, tabindex:0,
        fill: d.s.due ? 'var(--accent)' : 'var(--surface)', stroke: d.s.due ? 'var(--accent)' : 'var(--muted)', 'stroke-width':2});
      r.append(el('title', {}, `${d.d.title} — ${d.s.txt}`));
      svg.append(r);
    });
    const base = {1:-90, 2:180, 3:0, 4:90}, pos = new Map();
    for(const x of items){
      const ang = (base[x.q] + 12 + (hash(x.t.id) % 66)) * Math.PI/180, r = radiusFor(x.score);
      pos.set(x.t.id, [C + r*Math.cos(ang), C + r*Math.sin(ang)]);
    }
    for(const x of items){
      if(!x.t.parentId || !pos.has(x.t.parentId)) continue;
      const [a,b] = pos.get(x.t.id), [c,d] = pos.get(x.t.parentId);
      svg.append(el('line', {x1:a, y1:b, x2:c, y2:d, stroke:'var(--muted)', 'stroke-opacity':.35, 'stroke-dasharray':'2 3'}));
    }
    for(const x of [...items].sort((a,b) => a.score - b.score)){
      const [cx, cy] = pos.get(x.t.id), isSub = !!x.t.parentId;
      const ring = x.e.space ? x.e.space.color : 'var(--surface)';
      const dot = el('circle', {cx, cy, r: isSub ? 10 : (x.tier === 'crit' ? 13 : 12), class:'dot', 'data-id':x.t.id, tabindex:0,
        fill:`var(--${x.tier})`, stroke: ring, 'stroke-width': 3, 'stroke-dasharray': isSub ? '3 2' : '', opacity: x.fade ? 0.4 : 1});
      dot.append(el('title', {}, `${x.t.title}${isSub ? ' (' + (parentOf(x.t)||{}).title + ')' : ''} — ${x.score}`));
      svg.append(dot);
      svg.append(el('text', {x:cx, y:cy+3.8, 'text-anchor':'middle', 'font-size':10.5, 'font-weight':600, fill:'#fff', 'pointer-events':'none', style:'font-family:var(--f-mono)'}, rankOf.get(x.t.id) || ''));
    }
    if(!items.length) svg.append(el('text', {x:C, y:C+R*.55, 'text-anchor':'middle', 'font-size':13, fill:'var(--muted)'}, 'No open tasks here'));
  }

  /* ---------- rows ---------- */
  const span = (txt, cls) => { const s = document.createElement('span'); s.textContent = txt; if(cls) s.className = cls; return s; };
  function taskRow(x, rank, isSub, opts = {}){
    const t = x.t, row = document.createElement('div');
    row.className = 'task' + (t.done ? ' done' : '') + (isSub ? ' subrow' : '');
    row.tabIndex = 0; row.id = (opts.prefix || 'task-') + t.id;
    const rk = span(isOpen(t) ? (rank || '') : '', 'rank');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'check';
    cb.checked = opts.checked !== undefined ? opts.checked : !!t.done;
    cb.setAttribute('aria-label', (opts.onCheck ? 'Log session for ' : 'Complete ') + t.title);
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => opts.onCheck ? opts.onCheck(cb.checked) : toggleDone(t, cb.checked));
    const body = document.createElement('div'); body.className = 't-body';
    const title = document.createElement('div'); title.className = 't-title'; title.textContent = t.title;
    { const ss = sharedSpaceOf(t); if(ss) title.append(shareBadge(ss, t, true)); }
    const meta = document.createElement('div'); meta.className = 't-meta';
    if(opts.why) meta.append(span(opts.why[0], 'why ' + opts.why[1]));
    if(opts.hours) meta.append(span(opts.hours, 'hours'));
    if((!isSub || opts.showParent) && x.e.space && spaceFilter === 'all' && spaces.length > 1) meta.append(spaceTag(x.e.space));
    if((!isSub || opts.showParent) && x.e.client) meta.append(span(x.e.client, 'tag'));
    if(isPayment(t)) meta.append(span(money(t.amount), 'hours'));
    if(opts.showParent && t.parentId && parentOf(t)) meta.append(span('↳ ' + parentOf(t).title));
    const as = isSub && !(t.assignees && t.assignees.length) ? [] : x.e.assignees;
    if(t.done && t.closeout){ meta.append(span(`Took ${fmtH(Number(t.closeout.spent) || 0)}`, 'hours')); }
    const subs = isSub ? [] : subsOf(t);
    if(subs.length) meta.append(span(`${subs.filter(s => s.done).length}/${subs.length} done`, 'prog'));
    if(!t.done && t.repeat) meta.append(span('↻ ' + repText(t.repeat), 'why steady'));
    if(!t.done && t.afterHours){ if(!opts.why) meta.append(span('After hours · ' + fmtWhen(ahWhen(t)), 'why steady')); }
    else if(!opts.why && !t.done && x.ready !== null && x.ready !== x.days && x.days >= 0){
      const rd = offDate(x.ready), by = isPayment(t) ? 'Pay by ' : 'Ready by ';
      meta.append(span(x.late ? 'Late · ready by ' + fmt(rd) : x.ready <= 0 ? by + 'today' : by + fmt(rd), x.late ? 'over' : x.ready <= 2 ? 'soon' : 'readyby'));
    }
    const d = due(x.days, x.e.deadline);
    meta.append(span(d.txt + (isSub && !t.deadline && x.e.deadline ? ' (project)' : ''), d.cls + ' duedate'));
    if(!t.done && progOf(t) > 0) meta.append(span(progOf(t) + '% done', 'prog'));
    if(!t.done && !opts.why && modeOf(t) === 'emergency') meta.append(span('Emergency', 'why risk'));
    if(!t.done && !opts.why && modeOf(t) === 'steady'){
      const wk = weekSessionsDone(t);
      meta.append(span(`Ongoing · ${fmtH(Number(t.weeklyHours)||3)}/week · ${wk} session${wk===1?'':'s'} this week`, 'why steady'));
    }
    if(!t.done && !opts.why && modeOf(t) === 'normal'){
      if(x.risk) meta.append(span('At risk', 'why risk'));
      else if(!x.late && x.start !== null && x.ready !== null && x.start < x.ready) meta.append(span('Start by ' + fmtOff(x.start), 'startby'));
    }
    if(!t.done && !opts.why){
      if(!opts.compact) meta.append(span(qName[x.q]));
      if(!opts.compact && x.openHours) meta.append(span(fmtH(x.openHours) + ' left'));
    }
    if(!t.done && !opts.why && isLHF(x)) meta.append(span('Quick win', 'lhf'));
    if(opts.doNow){ const b = document.createElement('button'); b.type = 'button'; b.className = 'doit'; b.textContent = 'Pick for now';
      b.addEventListener('click', e => { e.stopPropagation(); setNextUp(t.id); }); meta.append(b); }
    if(t.example) meta.append(span('Example', 'ex'));
    if(!isSub && !t.done && !opts.compact){
      const add = document.createElement('button'); add.type = 'button'; add.className = 'addsub'; add.textContent = '+ Subtask';
      add.addEventListener('click', e => { e.stopPropagation(); openForm(null, t.id); });
      meta.append(add);
    }
    body.append(title, meta);
    const sc = span(prioLabel(x), 'score tier-' + x.tier); sc.title = (mod('detail') ? 'Score ' + x.score + ' · ' : '') + tierName[x.tier] + ' priority';
    row.append(rk, cb, body, sc);
    row.addEventListener('click', () => openDetails(t));
    row.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target === row) openDetails(t); });
    row.addEventListener('mouseenter', () => hl(t.id, true));
    row.addEventListener('mouseleave', () => hl(t.id, false));
    return row;
  }
  function projectBlock(x, rankOf, keep){
    const wrap = document.createElement('div'); wrap.className = 'project';
    wrap.append(taskRow(x, rankOf.get(x.t.id), false));
    const subs = subsOf(x.t).map(calc).filter(y => !keep || (isOpen(y.t) && keep(y))).sort((a,b) => (a.t.done - b.t.done) || byOrder(a, b));
    for(const s of subs) wrap.append(taskRow(s, rankOf.get(s.t.id), true));
    return wrap;
  }
  function dailyRow(item, prefix){
    const {d, s} = item, row = document.createElement('div');
    row.className = 'daily' + (s.due ? ' due' : ''); row.id = prefix + d.id;
    const sq = span('', 'sq');
    const body = document.createElement('div'); body.className = 't-body';
    const title = document.createElement('div'); title.className = 't-title'; title.textContent = d.title; title.tabIndex = 0;
    title.addEventListener('click', () => openDaily(d));
    title.addEventListener('keydown', e => { if(e.key === 'Enter') openDaily(d); });
    const meta = document.createElement('div'); meta.className = 't-meta';
    if(d.client) meta.append(span(d.client, 'tag'));
    const f = freqOf(d);
    if(!isCheck(d)){
      sq.style.borderRadius = '50%';
      meta.append(span(freqText(d)));
      if(d.amount != null) meta.append(span(money(d.amount), 'hours'));
      const np = nextPeriod(d);
      if(np){ const lead = Number(d.lead) || 3, st = new Date(np.due); st.setDate(st.getDate() - lead);
        meta.append(span(`Next: ${fmt(np.due)} · task appears ${fmt(st)}`)); }
      body.append(title, meta); row.append(sq, body, document.createElement('span'));
      return row;
    }
    meta.append(span(f === 'hours' ? `Every ${d.everyHours}h` : 'Daily'));
    meta.append(span(s.txt, s.due ? 'due-txt' : ''));
    body.append(title, meta);
    const btns = document.createElement('div'); btns.className = 'daily-btns';
    if(s.checks.length){ const u = document.createElement('button'); u.type = 'button'; u.className = 'undo'; u.textContent = 'Undo'; u.addEventListener('click', () => undoCheck(d)); btns.append(u); }
    if(isWeekday() && (d.everyHours || !s.checks.length)){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm' + (s.due ? ' primary' : '');
      b.textContent = d.everyHours ? 'Checked' : 'Done'; b.addEventListener('click', () => check(d)); btns.append(b);
    }
    row.append(sq, body, btns);
    return row;
  }
  function hl(id, on){ document.querySelectorAll(`.dot[data-id="${CSS.escape(id)}"]`).forEach(d => d.classList.toggle('hl', on)); }
  function fillList(id, nodes, emptyTxt){
    const l = $(id); l.textContent = '';
    if(!nodes.length){ const e = document.createElement('div'); e.className = 'empty'; e.textContent = emptyTxt; l.append(e); return; }
    l.append(...nodes);
  }

  /* ---------- low-hanging fruit & right now ---------- */
  const LHF_MAX = 1, LHF_MIN_SCORE = 40;
  const isLHF = x => isLeaf(x.t) && plannable(x.t) && modeOf(x.t) === 'normal' && !isPayment(x.t) && remOf(x.t) <= LHF_MAX && x.score >= LHF_MIN_SCORE;
  const density = x => x.score / Math.max(0.25, remOf(x.t));
  const myOpenLeaves = () => tasks.filter(t => isLeaf(t) && plannable(t) && vis(t) && assignedTo(t, planFor())).map(calc);
  const pinnedNext = () => settings.nextUp && settings.nextUp.date === dayKey() ? byId(settings.nextUp.id) : null;
  async function setNextUp(id){
    settings = {...settings, nextUp: id ? {date: dayKey(), id} : null}; render();
    try { await store.saveSettings(settings); if(id) toast('Moved to Up next'); } catch(e){ fail(e); }
  }
  // What to do with the time left: an emergency, your own pick, or the
  // highest-priority task that can be finished before the day ends.
  function nextUp(plan){
    const left = workLeft();
    const em = plan.find(p => p.x.t.mode === 'emergency');
    if(em) return {x: em.x, why: 'Emergency. Everything else waits.'};
    const pin = pinnedNext();
    if(pin && isOpen(pin)) return {x: calc(pin), why: 'You picked this for now.', pinned: true};
    const all = myOpenLeaves().filter(x => modeOf(x.t) === 'normal' && poolsOf(x.t).includes('work'));
    const fits = all.filter(x => effortOf(x.t) <= left + 1e-9).sort((a,b) => (b.score - a.score) || (effortOf(a.t) - effortOf(b.t)));
    const top = plan.find(p => modeOf(p.x.t) !== 'steady' && p.pool !== 'eve');
    if(top && effortOf(top.x.t) <= left + 1e-9) return {x: top.x, why: `Top of today’s plan, and it fits in the ${fmtH(left)} left.`};
    if(fits.length){
      const f = fits[0];
      const bigger = top ? ` ${top.x.t.title} is higher priority but needs ${fmtH(effortOf(top.x.t))}.` : '';
      return {x: f, why: `Highest priority you can finish in the ${fmtH(left)} left (${fmtH(effortOf(f.t))}).` + bigger};
    }
    if(top) return {x: top.x, why: `Nothing fits in the ${fmtH(left)} left. Start this one and continue next workday.`};
    return null;
  }

  /* ---------- today plan ---------- */
  // the evening shown with today's plan: tonight (or this weekend day) when there's time left, else the plan day's
  const dayFor = pool => pool === 'work' ? S.firstW : ((S.firsts && S.firsts[pool] !== undefined ? S.firsts[pool] : firstOf(pool)) === 0 ? 0 : S.firstW);
  const eveDay = () => dayFor('eve');
  function todayPlan(){
    const fw = S.firstW, ed = eveDay(), out = [], used = new Set();
    const onDay = chunks => {
      const m = chunks.filter(c => c[0] === dayFor(c[2]));
      if(!m.length) return null;
      const eve = m.every(c => c[2] !== 'work');
      return {h: m.reduce((a,c) => a + c[1], 0), eve, day: eve ? m[0][0] : fw, pool: m[0][2]};
    };
    const eveTag = m => { if(m.pool && m.pool.startsWith('sp:')){ const sp = spaceById(m.pool.slice(3)); if(sp){ const [a, b] = customWin(sp); return `${sp.name} time ${fmtClock(a)}–${fmtClock(b)} · `; } } return isWork(m.day) ? 'Evening · ' : 'Weekend · '; };
    for(const [id, r] of S.res){
      const t = byId(id); if(!t || !vis(t)) continue;
      const m = onDay(r.chunks); if(!m) continue;
      const x = calc(t), total = remOf(t), day = m.day;
      let why;
      if(r.emergency) why = ['Emergency · drop everything', 'risk'];
      else if(isPayment(t)) why = [`Payment due ${fmtOff(r.dd)}`, r.dd <= 1 ? 'due' : 'start'];
      else if(r.dd < 0) why = ['Overdue', 'due'];
      else if(r.ready < 0) why = [`Late · should have been ready ${fmtOff(r.ready)} · due ${fmtOff(r.dd)}`, 'risk'];
      else if(r.risk) why = ['At risk · not enough time before the ready-by date', 'risk'];
      else if(r.pinOn && r.pinOn.has(day)) why = ['Your chosen work time' + (r.dd < 999 ? ` · due ${fmtOff(r.dd)}` : ''), 'start'];
      else if(r.ready <= day) why = [`Be ready ${day === 0 ? 'today' : fmtOff(day)} · due ${fmtOff(r.dd)}`, 'due'];
      else why = [`Start ${day === 0 ? 'today' : fmtOff(day)} to be ready by ${fmtOff(r.ready)}`, 'start'];
      if(m.eve) why = [eveTag(m) + why[0], why[1]];
      out.push({x, h: m.h, total, why, pool: m.eve ? 'eve' : 'work', day, order: r.emergency ? -1 : r.risk ? 0 : r.dd <= day ? 1 : 2});
      used.add(id);
    }
    for(const [id, days] of S.steady){
      const t = byId(id); if(!t || !vis(t)) continue;
      const m = onDay(days); if(!m) continue;
      out.push({x: calc(t), h: m.h, total: m.h, why: [(m.eve ? eveTag(m) : '') + 'Ongoing · session today', 'steady'], pool: m.eve ? 'eve' : 'work', day: m.day, order: 1.5, steady: true});
      used.add(id);
    }
    out.sort((a,b) => (a.pool === 'eve') - (b.pool === 'eve') || a.order - b.order || b.x.score - a.x.score);
    let free = S.left(fw, 'work');
    if(free >= 0.5){
      const cands = tasks.filter(t => isLeaf(t) && plannable(t) && modeOf(t) === 'normal' && !used.has(t.id) && vis(t) && assignedTo(t, planFor()) && poolsOf(t).includes('work')).map(calc).sort((a,b) => b.score - a.score);
      const at = out.findIndex(p => p.pool === 'eve'), extra = [];
      for(const x of cands){
        if(free < 0.5) break;
        if(x.score < 30) break;
        const h = Math.min(free, remOf(x.t));
        extra.push({x, h, total: remOf(x.t), why: ['Pulled ahead · top priority with free time', 'pull'], pool: 'work', order: 3});
        free -= h;
      }
      out.splice(at < 0 ? out.length : at, 0, ...extra);
    }
    return out;
  }

  /* New interface copy lives here, in both languages, ready for the full translation.
     The app is English for now (UI_LANG); Spanish is filled in so switching is one line. */
  const UI_LANG = 'en';
  const TXT = {
    en: {morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening',
      calm: 'Your day, made manageable.', empty: 'Nothing scheduled yet. Add something above, or pick from Anytime.',
      emergency: 'An emergency comes first today. Everything else moved down.',
      over: h => `There’s ${h} more work than time today. Kairo moved what it could to the next days.`,
      attention: n => `${n} ${n === 1 ? 'task needs' : 'tasks need'} attention. ${n === 1 ? 'It’s' : 'They’re'} at the top of your plan.`,
      offday: 'Your plan below is for your next workday.',
      focusToday: 'Your focus time today', focusNext: 'Focus time, next workday', capToday: 'Your capacity today', availWord: 'available', plannedPct: 'planned',
      available: 'Focus time left', availableNext: 'Focus time', planned: 'Planned', free: 'Free', overBy: 'Over by', upNext: 'Up next', tonight: 'Tonight',
      prio: {crit: 'Top priority', high: 'High', mid: 'Normal', low: 'Low'}},
    es: {morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches',
      calm: 'Tu día, paso a paso.', empty: 'Nada programado todavía. Añade algo arriba o escoge de Anytime.',
      emergency: 'Hoy primero va una emergencia. Lo demás bajó en la lista.',
      over: h => `Hoy hay ${h} más de trabajo que de tiempo. Kairo movió lo que pudo a los próximos días.`,
      attention: n => `${n} ${n === 1 ? 'tarea necesita' : 'tareas necesitan'} atención. Están arriba en tu plan.`,
      offday: 'El plan de abajo es para tu próximo día de trabajo.',
      focusToday: 'Tu tiempo de enfoque hoy', focusNext: 'Tiempo de enfoque, próximo día', capToday: 'Tu capacidad hoy', availWord: 'disponible', plannedPct: 'planificado',
      available: 'Tiempo de enfoque restante', availableNext: 'Tiempo de enfoque', planned: 'Planificado', free: 'Libre', overBy: 'Te pasas por', upNext: 'Lo próximo', tonight: 'Esta noche',
      prio: {crit: 'Prioridad máxima', high: 'Alta', mid: 'Normal', low: 'Baja'}}
  };
  const tx = k => (TXT[UI_LANG] || TXT.en)[k] ?? TXT.en[k];
  // the priority badge: a word in simple mode, the 0–100 score with detailed priority on
  const prioLabel = x => mod('detail') ? String(x.score) : tx('prio')[x.tier];

  function renderToday(dailyItems){
    const fw = S.firstW, plan = todayPlan();
    // Right now
    const wl = workLeft(), [ws, we] = window0(), box = $('nextUp'); box.textContent = '';
    if(!isWork(0)) $('timeLeft').textContent = 'Not a workday';
    else if(nowH() < ws) $('timeLeft').textContent = `Starts at ${fmtClock(ws)}`;
    else if(wl <= 1/60) $('timeLeft').textContent = `Done at ${fmtClock(we)}`;
    else $('timeLeft').textContent = `${fmtH(wl)} left · until ${fmtClock(we)}`;
    let nu = (isWork(0) && wl > 1/60) ? nextUp(plan) : null;
    // after work: the top evening/weekend item for the time left today
    if(!nu && !(isWork(0) && wl > 1/60)){
      const ev = plan.find(p => p.pool === 'eve' && p.day === 0 && !p.steady) || plan.find(p => p.pool === 'eve' && p.day === 0);
      if(ev){ const sp = rootSpace(spaceOf(ev.x.t));
        nu = {x: ev.x, why: `Outside work hours: this is the top item for ${sp ? sp.name : 'your other spaces'} today.`};
        $('timeLeft').textContent = sp && sp.planDuring === 'custom' ? `${sp.name} · until ${fmtClock(customWin(sp)[1])}` : `${isWork(0) ? 'Evening' : 'Weekend'} · ${fmtH(eveLeftToday())} left`; }
    }
    if(nu){
      const t = nu.x.t, p = parentOf(t);
      const tt = document.createElement('div'); tt.className = 'now-title'; tt.textContent = (p ? p.title + ' › ' : '') + t.title;
      const meta = document.createElement('div'); meta.className = 'now-chips';
      meta.append(span(fmtH(effortOf(t)), 'nchip'));
      if(nu.x.e.space){ const st = spaceTag(nu.x.e.space); st.classList.add('nchip'); meta.append(st); }
      if(nu.x.e.client) meta.append(span(nu.x.e.client, 'nchip'));
      const dd = due(nu.x.days, nu.x.e.deadline); if(nu.x.e.deadline) meta.append(span(dd.txt, 'nchip due ' + dd.cls));
      meta.append(span(mod('detail') ? 'Priority ' + nu.x.score : tx('prio')[nu.x.tier], 'nchip'));
      const why = document.createElement('div'); why.className = 'now-why'; why.textContent = nu.why;
      const done = document.createElement('button'); done.type = 'button'; done.className = 'now-done'; done.setAttribute('aria-label', 'Mark “' + t.title + '” as done'); done.title = 'Mark as done';
      done.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4 4L19 6"/></svg>';
      done.addEventListener('click', () => finish(t));
      const acts = document.createElement('div'); acts.className = 'now-acts';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'linkbtn'; open.textContent = 'Details'; open.addEventListener('click', () => openDetails(t));
      acts.append(open);
      if(nu.pinned){ const un = document.createElement('button'); un.type = 'button'; un.className = 'linkbtn'; un.textContent = 'Let the planner pick'; un.addEventListener('click', () => setNextUp(null)); acts.append(un); }
      const body = document.createElement('div'); body.className = 'now-body'; body.append(tt, meta, why, acts);
      const row = document.createElement('div'); row.className = 'now-main'; row.append(body, done);
      box.append(row);
    } else {
      box.append(span(!hasWork() ? 'Nothing planned for right now. Your list is below.' : isWork(0) && wl > 1/60 ? 'Nothing open for you right now.' : 'Off the clock. The plan below is for your next workday.', 'fnote'));
    }
    // today's hours
    const ov = todayOverride(), [us, ue] = usualWindow();
    if(document.activeElement !== $('tStart')) $('tStart').value = toHM(ov ? toH(ov.start) : us);
    if(document.activeElement !== $('tEnd')) $('tEnd').value = toHM(ov ? toH(ov.end) : ue);
    $('tReset').hidden = !ov;
    // low-hanging fruit
    const low = myOpenLeaves().filter(isLHF).sort((a,b) => density(b) - density(a)).slice(0, 6);
    $('cLow').textContent = low.length;
    fillList('lLow', low.map(x => taskRow(x, '', !!x.t.parentId, {prefix:'low-', showParent:true, compact:true, hours: fmtH(effortOf(x.t)) + (isWork(0) && effortOf(x.t) <= wl ? ' · fits now' : ''), doNow: isWork(0) && wl > 1/60})),
      'No quick tasks right now. Tasks of 1h or less with priority 40+ show here.');
    { const lowIds = new Set(low.map(x => x.t.id)), planIds = new Set(plan.map(p => p.x.t.id));
      const any = myOpenLeaves().filter(x => !eff(x.t).deadline && modeOf(x.t) === 'normal' && !x.t.afterHours && !lowIds.has(x.t.id) && !planIds.has(x.t.id)).sort((a, b) => b.score - a.score);
      $('anyGroup').hidden = !any.length; $('cAny').textContent = any.length;
      fillList('lAny', any.slice(0, 10).map(x => taskRow(x, '', !!x.t.parentId, {prefix: 'any-', showParent: true, compact: true, hours: fmtH(effortOf(x.t))})), ''); }
    const planned = plan.filter(p => p.pool !== 'eve').reduce((a,p) => a + p.h, 0), capH = fw === 0 ? focusLeftToday() : settings.focusHours;
    const evePlanned = plan.filter(p => p.pool === 'eve').reduce((a,p) => a + p.h, 0), ed = eveDay();
    $('capUsed').textContent = fmtH(planned);
    $('capOf').textContent = fw === 0 ? `of ${fmtH(capH)} focus time left today` : `of ${fmtH(capH)} focus time planned`;
    $('planDay').textContent = [fw === 0 ? '' : 'Next workday: ' + fmt(offDate(fw)),
      evePlanned ? `Outside work hours: ${fmtH(evePlanned)} planned` : ''].filter(Boolean).join(' · ');
    $('capFill').style.width = (capH ? Math.min(100, planned / capH * 100) : 100) + '%';
    $('capBar').classList.toggle('over', planned > capH + 1e-9);
    $('planTitle').firstChild.textContent = fw === 0 ? 'Today’s plan ' : `${offDate(fw).toLocaleDateString('en-US',{weekday:'long'})}’s plan `;
    $('cPlan').textContent = plan.length;
    // capacity in three plain numbers, and an honest line about the day
    { const box = $('capStats'); box.textContent = '';
      const free = capH - planned, over = free < -1e-9, pct = capH ? Math.round(planned / capH * 100) : (planned ? 100 : 0);
      // light: big number + bar; dark: ring + legend (same three numbers)
      const main = document.createElement('div'); main.className = 'hero-main';
      const big = document.createElement('div'); big.className = 'hero-big'; big.append(Object.assign(document.createElement('b'), {textContent: fmtH(capH)}), span(tx('availWord')));
      main.append(span(fw === 0 ? tx('focusToday') : tx('focusNext'), 'hero-lbl'), big);
      const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 104 104'); svg.setAttribute('class', 'hero-ring'); svg.setAttribute('aria-hidden', 'true');
      const C = 2 * Math.PI * 42, ring = (cls, len) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 52); c.setAttribute('cy', 52); c.setAttribute('r', 42); c.setAttribute('class', cls); if(len != null){ c.setAttribute('stroke-dasharray', `${len} ${C}`); c.setAttribute('transform', 'rotate(-90 52 52)'); } svg.append(c); };
      ring('rg-track'); ring('rg-fill' + (over ? ' over' : ''), Math.min(1, pct / 100) * C);
      const txt = (y, cls, v) => { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 52); t.setAttribute('y', y); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', cls); t.textContent = v; svg.append(t); };
      txt(52, 'rg-num', pct + '%'); txt(69, 'rg-sub', tx('plannedPct'));
      const side = document.createElement('div'); side.className = 'hero-side';
      const ul = document.createElement('ul'); ul.className = 'hero-legend';
      const li = (cls, v) => { const l = document.createElement('li'); l.className = cls; l.append(Object.assign(document.createElement('i'), {}), document.createTextNode(v)); ul.append(l); };
      li('lg-avail', `${fmtH(capH)} ${tx('availWord')}`); li('lg-plan', `${fmtH(planned)} ${tx('planned').toLowerCase()}`);
      li(over ? 'lg-over' : 'lg-free', over ? `${tx('overBy')} ${fmtH(-free)}` : `${fmtH(Math.max(0, free))} ${tx('free').toLowerCase()}`);
      side.append(span(tx('capToday'), 'hero-lbl'), ul);
      box.append(main, svg, side);
      const foot = $('capFoot'); foot.textContent = '';
      foot.append(span(`${fmtH(planned)} ${tx('planned').toLowerCase()}`), span(over ? `${tx('overBy')} ${fmtH(-free)}` : `${fmtH(Math.max(0, free))} ${tx('free').toLowerCase()}`, over ? 'over' : ''));
      const now = new Date(), hr = now.getHours(), name = (settings.displayName || '').split(' ')[0];
      $('dayHello').textContent = now.toLocaleDateString(UI_LANG === 'es' ? 'es-PR' : 'en-US', {weekday: 'long', month: 'long', day: 'numeric'});
      $('dayTitle').textContent = (hr < 12 ? tx('morning') : hr < 18 ? tx('afternoon') : tx('evening')) + (name ? ', ' + name : '') + '.';
      const urgent = plan.filter(p => p.why && (p.why[1] === 'risk' || p.why[1] === 'due')).length;
      const emerg = plan.some(p => p.x.t && modeOf(p.x.t) === 'emergency');
      const msg = $('dayMsg'); msg.className = '';
      if(emerg){ msg.textContent = tx('emergency'); msg.className = 'alert'; }
      else if(over){ msg.textContent = tx('over')(fmtH(-free)); msg.className = 'warn'; }
      else if(urgent){ msg.textContent = tx('attention')(urgent); msg.className = 'warn'; }
      else if(!plan.length) msg.textContent = tx('empty');
      else msg.textContent = fw === 0 || !hasWork() ? tx('calm') : tx('offday');
      $('nowLabel').textContent = tx('upNext'); }
    fillList('lPlan', plan.map((p, i) => taskRow(p.x, String(i+1), !!p.x.t.parentId, {prefix:'plan-', why:p.why, hours: p.h < p.total - 1e-9 ? `${fmtH(p.h)} of ${fmtH(p.total)}` : fmtH(p.h), showParent:true, compact:true,
      ...(p.steady ? {checked:false, onCheck: on => logSession(p.x.t, on, p.h)} : {})})),
      'Nothing scheduled. Add tasks with deadlines and effort, or enjoy the free time.');
    const doneToday = tasks.filter(t => t.done && sameDay(t.doneAt) && vis(t)).map(calc);
    const sessToday = tasks.filter(t => isOpen(t) && modeOf(t) === 'steady' && loggedOn(t, dayKey()) > 0 && vis(t)).map(calc);
    $('cDoneToday').textContent = doneToday.length + sessToday.length;
    fillList('lDoneToday', [
      ...sessToday.map(x => taskRow(x, '', false, {prefix:'sesst-', showParent:true, compact:true, checked:true, why:['Session logged', 'steady'], hours: fmtH(loggedOn(x.t, dayKey())), onCheck: on => logSession(x.t, on, 0)})),
      ...doneToday.map(x => taskRow(x, '', !!x.t.parentId, {prefix:'donet-', showParent:true, compact:true}))], 'Nothing checked off yet today.');
    const em = tasks.filter(t => isOpen(t) && modeOf(t) === 'emergency');
    const eb = $('emergBanner'); eb.hidden = !em.length;
    if(em.length){ const risk = [...S.res.values()].filter(r => r.risk).length;
      eb.textContent = `Emergency active: ${em.map(t => t.title).join(', ')}. Everything else moved to make room` + (risk ? `; ${risk} item${risk===1?'':'s'} now at risk.` : '.'); }
    renderPayments();
    $('cDaily2').textContent = dailyItems.filter(i => isCheck(i.d)).length;
    $('dailyHint2').textContent = isWeekday() ? 'Monday to Friday. Resets every morning.' : 'Weekend. Checks resume Monday.';
    fillList('lDaily2', dailyItems.filter(i => isCheck(i.d)).map(i => dailyRow(i, 'daily2-')), 'No routine checks. Add one from “+ New → Recurring”.');
    // agenda: the next 4 days after the plan day (weekends only when something is planned)
    const ag = $('agenda'); ag.textContent = '';
    let o = fw, shown = 0;
    for(let k = 0; k < 21 && shown < 4; k++){
      o++;
      const rows = [];
      const addRows = (t, chunks, dd) => { const m = chunks.filter(c => c[0] === o && !(c[2] !== 'work' && dayFor(c[2]) === o && o !== fw)); if(m.length) rows.push({t, h: m.reduce((a,c) => a + c[1], 0), eve: m.every(c => c[2] !== 'work'), dd}); };
      for(const [id, r] of S.res){ const t = byId(id); if(t && vis(t)) addRows(t, r.chunks, r.dd); }
      for(const [id, days] of S.steady){ const t = byId(id); if(t && vis(t)) addRows(t, days, -1); }
      if(!isWork(o) && !rows.length) continue;
      shown++;
      rows.sort((a,b) => (a.eve - b.eve) || (a.dd - b.dd));
      const box = document.createElement('div'); box.className = 'day';
      const wh = rows.filter(r => !r.eve).reduce((a,b) => a + b.h, 0), eh = rows.filter(r => r.eve).reduce((a,b) => a + b.h, 0);
      const h3 = document.createElement('h3');
      h3.append(span(fmt(offDate(o))), span(!hasWork() ? fmtH(eh) + ' planned' : isWork(o) ? fmtH(wh) + ' / ' + fmtH(capOf(o, 'work')) + (calBusy(o) ? ' · ' + fmtH(calBusy(o)) + ' meetings' : '') + (eh ? ' · +' + fmtH(eh) + ' after work' : '') : 'weekend · ' + fmtH(eh)));
      box.append(h3);
      if(!rows.length) box.append(span('Open', 'mini empty-day'));
      for(const r of rows){
        const m = document.createElement('div'); m.className = 'mini' + (r.eve ? ' eve' : ''); m.tabIndex = 0;
        const p = parentOf(r.t), sp = spaceOf(r.t);
        const title = span((p ? p.title + ' › ' : '') + r.t.title, 'mtitle');
        if(sp){ const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = sp.color; title.prepend(sw); }
        m.append(title, span(fmtH(r.h), 'hours'));
        m.addEventListener('click', () => openDetails(r.t));
        m.addEventListener('keydown', e => { if(e.key === 'Enter') openDetails(r.t); });
        box.append(m);
      }
      ag.append(box);
    }
  }

  // bills: open payment tasks due within 30 days, plus scheduled ones whose task isn't created yet
  function renderPayments(){
    const rows = [];
    for(const t of tasks.filter(t => isOpen(t) && isPayment(t) && vis(t))){
      const dd = daysTo(eff(t).deadline);
      if(dd !== null && dd > 30) continue;
      rows.push({t, dd: dd ?? 999});
    }
    for(const r of dailies.filter(r => r.amount != null && !isCheck(r) && dailyVis2(r))){
      const np = nextPeriod(r); if(!np) continue;
      const dd = Math.round((np.due - today0()) / DAY); if(dd > 30) continue;
      const st = new Date(np.due); st.setDate(st.getDate() - (Number(r.lead) || 3));
      rows.push({r, np, dd, st});
    }
    rows.sort((a,b) => a.dd - b.dd);
    $('payGroup').hidden = !rows.length; $('cPay').textContent = rows.length;
    $('payHint').textContent = `Bills due in the next 30 days. Each one is planned ${remindDays()} day${remindDays() === 1 ? '' : 's'} before it’s due.`;
    fillList('lPay', rows.map(x => {
      const row = document.createElement('div'); row.className = 'pay' + (x.r ? ' sched' : '');
      const body = document.createElement('div'); body.className = 't-body';
      const title = document.createElement('div'); title.className = 't-title'; title.textContent = x.t ? x.t.title : x.r.title;
      const meta = document.createElement('div'); meta.className = 't-meta';
      if(x.t){ const d = due(x.dd === 999 ? null : x.dd, eff(x.t).deadline); meta.append(span(d.txt, d.cls)); }
      else meta.append(span(`Due ${fmt(x.np.due)} · appears ${fmt(x.st)}`));
      body.append(title, meta);
      const amt = span(money(x.t ? x.t.amount : x.r.amount), 'amt');
      row.append(body, amt);
      if(x.t){
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm paid'; b.textContent = 'Mark paid';
        b.addEventListener('click', () => markPaid(x.t)); row.append(b);
        body.style.cursor = 'pointer'; body.addEventListener('click', () => openDetails(x.t));
      } else row.append(span('Scheduled', 'fnote'));
      return row;
    }), '');
  }
  async function markPaid(t){
    const data = {...t, done: true, doneAt: Date.now(), closeout: {spent: Math.min(effortOf(t), 0.25), comment: 'Paid ' + money(t.amount), closedBy: me || null}}; delete data.id;
    try { const nx = await spawnNext(t, data.doneAt); if(nx) data.repeatNext = nx.id; await store.save('tasks', t.id, data); toast(`${t.title}: paid` + (nx ? ` · next due ${fmt(nx.due)}` : '')); } catch(e){ fail(e); }
  }

  /* ---------- projects ---------- */
  const isProject = t => !t.parentId && (!!t.isProject || tasks.some(x => x.parentId === t.id));
  function projectInfo(t){
    const subs = subsOf(t).sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0)), done = subs.filter(x => x.done).length, x = calc(t);
    const risk = subs.some(x2 => !x2.done && (S.res.get(x2.id) || {}).risk) || x.risk;
    let st;
    if(t.done) st = ['Done', ''];
    else if(x.days !== null && x.days < 0) st = ['Overdue', 'risk'];
    else if(x.late || subs.some(y => !y.done && calc(y).late)) st = ['Late', 'risk'];
    else if(risk) st = ['At risk', 'risk'];
    else if(done > 0 || (x.start !== null && x.start <= 0)) st = ['In progress', 'ok'];
    else if(x.start !== null && x.start <= weekEndOff()) st = ['Start this week', 'now'];
    else if(x.start !== null) st = ['Not started', ''];
    else st = [x.days === null ? 'No deadline' : 'Not planned', ''];
    const startTxt = t.done ? (t.doneAt ? 'Closed ' + fmt(new Date(t.doneAt)) : '') : x.start !== null ? (x.start <= 0 ? 'Working on it' : 'Start by ' + fmtOff(x.start)) : (subs.length ? '' : 'Add tasks to plan it');
    const left = subs.length ? subs.filter(y => !y.done).reduce((a,y) => a + remOf(y), 0) : 0;
    const tot = subs.reduce((a,y) => a + effortOf(y), 0), got = subs.reduce((a,y) => a + effortOf(y) * (y.done ? 1 : progOf(y) / 100), 0);
    return {x, subs, done, total: subs.length, pct: t.done ? 1 : tot ? got / tot : 0, st, startTxt, left};
  }
  let showDoneProj = false;
  function projCard(t){
    const pi = projectInfo(t), sp = spaceOf(t);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pcard' + (t.done ? ' done' : '');
    const top = document.createElement('div'); top.className = 'top';
    top.append(sp ? spaceTag(sp) : span(''), span(pi.st[0], 'pill ' + pi.st[1]));
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = t.title;
    { const ss = sharedSpaceOf(t); if(ss) nm.append(shareBadge(ss, t, true)); }
    const bar = document.createElement('div'); bar.className = 'pbar'; const fill = document.createElement('i'); fill.style.width = Math.round(pi.pct * 100) + '%'; fill.style.background = sp ? sp.color : 'var(--mid)'; bar.append(fill);
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.append(span(pi.total ? `${pi.done} of ${pi.total} tasks` : 'No tasks yet'), span(pi.left ? fmtH(pi.left) + ' left' : '', 'hours'));
    const foot = document.createElement('div'); foot.className = 'foot';
    const dl = document.createElement('span'); dl.append('Due '); const bb = document.createElement('b'); bb.textContent = pi.x.e.deadline ? fmt(parseD(pi.x.e.deadline)) : '—'; dl.append(bb);
    foot.append(dl, span(pi.startTxt, pi.st[1] === 'risk' ? 'late' : pi.st[1] === 'now' ? 'startby' : ''));
    b.append(top, nm, bar, meta, foot);
    b.addEventListener('click', () => openProject(t.id));
    return b;
  }
  function openProject(id){ projOpen = id; tab = 'projects'; try { localStorage.setItem('pr-tab', tab); } catch {} renderTabs(); renderProjects(); window.scrollTo({top: 0}); }
  $('addProjBtn').addEventListener('click', () => openForm(null, null, 'project'));
  $('projDoneToggle').addEventListener('click', () => { showDoneProj = !showDoneProj; renderProjects(); });
  function renderProjects(){
    const all = tasks.filter(t => isProject(t) && personOk(t) && clientOk(eff(t).client) && inScope(spaceOf(t)));
    // side: spaces with their open projects
    const side = $('projSide'); side.textContent = '';
    const sbtn = (id, label, color, n) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ps-space'; b.setAttribute('aria-pressed', scope === id || (id === 'all' && !scopeSp() && scope !== '__shared'));
      const i = document.createElement('i'); i.style.background = color || 'var(--ink)'; b.append(i, document.createTextNode(label)); const c = document.createElement('b'); c.textContent = n; b.append(c);
      const sp0 = spaceById(id); if(sp0 && sp0.shared){ b.insertBefore(shareBadge(sp0), b.lastChild); b.title = sharedTip(sp0); }
      b.addEventListener('click', () => setScope(id)); side.append(b); };
    sbtn('all', 'All spaces', null, tasks.filter(t => isProject(t) && !t.done && personOk(t) && clientOk(eff(t).client)).length);
    for(const sp of spacesSorted().filter(inScope)){
      const mine = all.filter(t => !t.done && (spaceOf(t) || {}).id === sp.id);
      sbtn(sp.id, sp.name, sp.color, mine.length);
      for(const t of mine.slice(0, 8)){ const a = document.createElement('button'); a.type = 'button'; a.className = 'ps-proj'; a.textContent = t.title; a.title = t.title; a.addEventListener('click', () => openProject(t.id)); side.append(a); }
    }
    const pt = projOpen ? byId(projOpen) : null;
    $('projList').hidden = !!pt; $('projDetail').hidden = !pt;
    if(pt){ renderProjectDetail(pt); return; }
    const vis2 = all.filter(t => spaceOk(t));
    const key = t => { const x = calc(t); return [x.start ?? 9999, x.days ?? 9999]; };
    const open = vis2.filter(t => !t.done).sort((a,b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
    const done = vis2.filter(t => t.done).sort((a,b) => (b.doneAt || 0) - (a.doneAt || 0));
    fillList('projGrid', open.map(projCard), 'No projects here yet. A project groups tasks under one deadline: “+ New → Project”, then add its tasks.');
    $('projDoneToggle').hidden = !done.length;
    $('projDoneToggle').textContent = showDoneProj ? 'Hide completed projects' : `Show ${done.length} completed project${done.length === 1 ? '' : 's'}`;
    $('projDoneGrid').hidden = !showDoneProj;
    if(showDoneProj) fillList('projDoneGrid', done.map(projCard), '');
  }
  function renderProjectDetail(t){
    const box = $('projDetail'); box.textContent = '';
    const pi = projectInfo(t), sp = spaceOf(t), e = pi.x.e;
    const topEl = document.createElement('div'); topEl.className = 'pd-top';
    const crumb = document.createElement('div'); crumb.className = 'pd-crumb';
    const back = document.createElement('button'); back.type = 'button'; back.className = 'linkbtn'; back.textContent = '← Projects';
    back.addEventListener('click', () => { projOpen = null; renderProjects(); });
    crumb.append(back); if(sp) crumb.append(spaceTag(sp)); if(e.client) crumb.append(span(e.client, 'tag'));
    const tt = document.createElement('div'); tt.className = 'pd-title';
    const h = document.createElement('h2'); h.textContent = t.title;
    const acts = document.createElement('div'); acts.className = 'actions';
    const mk = (txt, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = txt; b.addEventListener('click', fn); acts.append(b); };
    mk('Edit project', '', () => openForm(t));
    if(!t.done) mk(pi.total && pi.done === pi.total ? 'Close project' : 'Close', '', () => openClose(t));
    if(!t.done) mk('+ Task', 'primary', () => openForm(null, t.id));
    tt.append(h, acts);
    const pills = document.createElement('div'); pills.className = 'pd-pills';
    pills.append(span(pi.st[0], 'pill ' + pi.st[1]), span(e.deadline ? 'Due ' + fmt(parseD(e.deadline)) : 'No deadline', 'pill'));
    if(!t.done && pi.x.start !== null && pi.x.start > 0) pills.append(span('Start by ' + fmtOff(pi.x.start), 'pill now'));
    if(t.recurringId) pills.append(span('Repeats', 'pill'));
    topEl.append(crumb, tt, pills);
    box.append(topEl);
    // timeline: each task's planned days, in order
    if(pi.subs.length){
      const card = document.createElement('div'); card.className = 'pd-card'; card.style.marginBottom = '16px';
      const h3 = document.createElement('h3'); h3.textContent = 'Timeline'; card.append(h3);
      const tl = document.createElement('div'); tl.className = 'ptl'; tl.style.gridTemplateColumns = `repeat(${Math.min(pi.subs.length, 6)}, minmax(0, 1fr))`;
      for(const x2 of pi.subs.slice(0, 12)){
        const r = S.res.get(x2.id), d = document.createElement('div'), i = document.createElement('i');
        i.style.background = x2.done ? (sp ? sp.color : 'var(--mid)') : r && r.risk ? 'var(--crit)' : 'color-mix(in srgb, ' + (sp ? sp.color : 'var(--mid)') + ' 35%, transparent)';
        let when = x2.done ? 'Done' : 'Not planned';
        if(!x2.done && r){ const days = r.chunks.map(c => c[0]), a = Math.min(...days), b = Math.max(...days); when = a === b ? fmtOff(a) : fmtOff(a) + '–' + fmtOff(b); }
        const lab = span(`${when} · ${x2.title}`); lab.title = lab.textContent;
        d.append(i, lab); tl.append(d);
      }
      card.append(tl); box.append(card);
    }
    const grid = document.createElement('div'); grid.className = 'pd-grid';
    const main = document.createElement('div'); main.className = 'pd-main';
    const h2b = document.createElement('h3'); h2b.style.cssText = 'margin:0 0 2px;font:700 18px var(--f-display)'; h2b.textContent = `Tasks · ${pi.done}/${pi.total}`;
    main.append(h2b);
    if(!pi.subs.length){ const em = document.createElement('div'); em.className = 'empty'; em.textContent = 'No tasks yet. Break the project into steps so the planner can schedule each one.'; main.append(em); }
    pi.subs.forEach((x2, i) => main.append(taskRow(calc(x2), x2.done ? '' : String(i + 1), false, {prefix: 'pd-', compact: true})));
    if(!t.done){ const add = document.createElement('button'); add.type = 'button'; add.className = 'addsub'; add.textContent = '+ Add task'; add.addEventListener('click', () => openForm(null, t.id)); main.append(add); }
    const aside = document.createElement('div'); aside.className = 'pd-aside';
    const sum = document.createElement('div'); sum.className = 'pd-card';
    const sh = document.createElement('h3'); sh.textContent = 'Summary';
    const bar = document.createElement('div'); bar.className = 'pbar'; const f = document.createElement('i'); f.style.width = Math.round(pi.pct * 100) + '%'; f.style.background = sp ? sp.color : 'var(--mid)'; bar.append(f);
    const dl = document.createElement('dl'); dl.className = 'det-grid'; dl.style.marginTop = '12px';
    const it = (k, v) => { const d = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; d.append(dt, dd); dl.append(d); };
    it('Effort', pi.subs.length ? fmtH(pi.subs.reduce((a,y) => a + effortOf(y), 0)) : 'Add tasks');
    it('Left', fmtH(pi.left));
    it('Importance', lvl(e.importance));
    it('Planned', sp ? spaceWhen(sp) : 'work hours');
    if(e.client) it('Client', e.client);
    if(t.subtaskDays) it('Tasks due', `${t.subtaskDays} days after added`);
    for(const f of (t.fields || [])) if(f && f.k) it(f.k, f.v || '—');
    sum.append(sh, bar, dl); aside.append(sum);
    if(t.recurringId){
      const r = dailies.find(d => d.id === t.recurringId), np = r ? nextPeriod(r) : null;
      if(np){ const c = document.createElement('div'); c.className = 'pd-card'; const ch = document.createElement('h3'); ch.textContent = 'Next in the series';
        const st = new Date(np.due); st.setDate(st.getDate() - (Number(r.lead) || 3));
        c.append(ch, span(`${r.title} – ${np.label}: created ${fmt(st)}, due ${fmt(np.due)}.`, 'fnote')); aside.append(c); }
    }
    if(t.notes){ const c = document.createElement('div'); c.className = 'pd-card'; const ch = document.createElement('h3'); ch.textContent = 'Notes'; const n = document.createElement('div'); n.className = 'det-notes'; n.textContent = t.notes; c.append(ch, n); aside.append(c); }
    { const c = document.createElement('div'); c.className = 'pd-card'; const ch = document.createElement('h3'); ch.textContent = 'Files'; c.append(ch, filesBox(t)); aside.append(c); }
    grid.append(main, aside); box.append(grid);
  }

  /* ---------- radar look-ahead & roadmap ---------- */
  const ALL_TIME = 100000;   // "All": everything open, however far out
  function renderHorizon(){
    const box = $('horizonCtl'); box.textContent = '';
    for(const [d, l] of [[0, 'Today'], [7, 'Week'], [30, '30 days'], [90, '90 days'], [180, '6 months'], [ALL_TIME, 'All time']]){
      const b = document.createElement('button'); b.type = 'button'; b.textContent = l; b.setAttribute('aria-pressed', horizon === d);
      b.addEventListener('click', () => { horizon = d; try { localStorage.setItem('pr-horizon', d); } catch {} render(); }); box.append(b);
    }
  }
  function renderRoadmap(){
    const box = $('roadmap'); box.textContent = '';
    const t0 = today0();
    let months = horizon <= 30 ? 2 : horizon <= 90 ? 4 : 6;
    if(horizon >= ALL_TIME){   // stretch the roadmap to the furthest deadline (up to 2 years)
      const far = Math.max(0, ...tasks.filter(t => isOpen(t) && vis(t) && isProject(t)).map(t => daysTo(eff(t).deadline) ?? 0));
      const end = offDate(far); months = Math.min(24, Math.max(6, (end.getFullYear() - t0.getFullYear()) * 12 + end.getMonth() - t0.getMonth() + 1));
    }
    const W0 = new Date(t0.getFullYear(), t0.getMonth(), 1), W1 = new Date(t0.getFullYear(), t0.getMonth() + months, 1), span0 = (W1 - W0) / DAY;
    const pc = d => Math.max(0, Math.min(100, ((d - W0) / DAY) / span0 * 100));
    const head = document.createElement('div'); head.className = 'road-head'; head.append(document.createElement('span'));
    const mh = document.createElement('div'); mh.className = 'road-months'; mh.style.gridTemplateColumns = `repeat(${months}, minmax(0, 1fr))`;
    for(let k = 0; k < months; k++){ const m = new Date(W0.getFullYear(), W0.getMonth() + k, 1); mh.append(span(m.toLocaleDateString('en-US', {month: 'short'}))); }
    head.append(mh); box.append(head);
    const track = () => { const tr = document.createElement('div'); tr.className = 'road-track';
      tr.style.backgroundImage = 'linear-gradient(90deg, color-mix(in srgb, var(--line) 60%, transparent) 1px, transparent 1px)'; tr.style.backgroundSize = (100 / months) + '% 100%';
      const td = document.createElement('div'); td.className = 'road-today'; td.style.left = pc(t0) + '%'; tr.append(td); return tr; };
    const rows = [];
    for(const t of tasks.filter(t => isProject(t) && isOpen(t) && vis(t))){
      const x = calc(t); if(x.days === null) continue;
      const st = Math.min(x.start ?? 0, x.days), first = Math.max(0, st);
      if(first > horizon) continue;
      const pi = projectInfo(t);
      rows.push({label: t.title, color: (spaceOf(t) || {}).color || 'var(--mid)', a: offDate(first), b: parseD(x.e.deadline), risk: pi.st[1] === 'risk', id: t.id, sort: first});
    }
    // recurring work that will be created later in the window
    for(const r of dailies.filter(r => !isCheck(r) && r.amount == null && dailyVis2(r) && ['monthly', 'quarterly'].includes(freqOf(r)))){
      const seen = new Set();
      for(let k = 0; k <= months; k++){
        for(const p of periodsAround(r, new Date(t0.getFullYear(), t0.getMonth() + k, 1))){
          if(seen.has(p.key) || p.due < t0 || p.due >= W1 || byId(`rec-${r.id}-${p.key}`)) continue;
          seen.add(p.key);
          const a = new Date(p.due); a.setDate(a.getDate() - (Number(r.lead) || 3));
          if((a - t0) / DAY > horizon) continue;
          rows.push({label: `${r.title} – ${p.label}`, color: (spaceById(r.spaceId) || defaultSpace() || {}).color || 'var(--mid)', a, b: p.due, auto: true, sort: (a - t0) / DAY});
        }
      }
    }
    rows.sort((a,b) => a.sort - b.sort);
    $('cRoad').textContent = rows.length;
    for(const r of rows.slice(0, 14)){
      const row = document.createElement('div'); row.className = 'road-row';
      const lb = document.createElement('button'); lb.type = 'button'; lb.className = 'road-lbl'; lb.title = r.label;
      const i = document.createElement('i'); i.style.background = r.color; lb.append(i, span(r.label));
      if(r.id) lb.addEventListener('click', () => openProject(r.id)); else lb.style.cursor = 'default';
      const tr = track(), bar = document.createElement('div'); bar.className = 'road-bar';
      const L = pc(r.a), Wd = Math.max(1.6, pc(r.b) - L + (100 / span0));
      bar.style.left = L + '%'; bar.style.width = Math.min(100 - L, Wd) + '%';
      const col = r.risk ? 'var(--crit)' : r.color;
      if(r.auto){ bar.style.border = '1.5px dashed ' + col; bar.style.color = col; } else bar.style.background = col;
      bar.textContent = Wd >= 7 ? (r.b.getMonth() + 1) + '/' + r.b.getDate() : ''; bar.title = `${r.label}: ${fmt(r.a)} → ${fmt(r.b)}`;
      tr.append(bar); row.append(lb, tr); box.append(row);
    }
    // bills: open payment tasks and scheduled recurring payments
    const pays = [];
    for(const t of tasks.filter(t => isOpen(t) && isPayment(t) && vis(t) && t.deadline)) pays.push({d: parseD(t.deadline), title: `${t.title} · ${money(t.amount)}`});
    for(const r of dailies.filter(r => r.amount != null && !isCheck(r) && dailyVis2(r))){
      const seen = new Set();
      for(let k = 0; k <= months; k++) for(const p of periodsAround(r, new Date(t0.getFullYear(), t0.getMonth() + k, 1))){
        if(seen.has(p.key) || p.due < t0 || p.due >= W1 || byId(`rec-${r.id}-${p.key}`)) continue;
        seen.add(p.key); pays.push({d: p.due, title: `${r.title} · ${money(r.amount)}`});
      }
    }
    const inH = pays.filter(x => (x.d - t0) / DAY <= horizon);
    if(inH.length){
      const row = document.createElement('div'); row.className = 'road-row';
      const lb = document.createElement('span'); lb.className = 'road-lbl'; const i = document.createElement('i'); i.style.background = '#3b8a4c'; lb.append(i, span('Bills'));
      const tr = track();
      for(const x of inH){ const dm = document.createElement('span'); dm.className = 'road-dia'; dm.style.left = pc(x.d) + '%'; dm.title = `${x.title} · ${fmt(x.d)}`; tr.append(dm); }
      row.append(lb, tr); box.append(row);
    }
    if(!rows.length && !inH.length){ const e = document.createElement('div'); e.className = 'road-empty'; e.textContent = 'No projects with deadlines in this window. Create one in Projects.'; box.append(e); }
  }

  /* ---------- render ---------- */
  function renderChips(){
    document.querySelectorAll('#viewChips .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.view === view));
    const cs = clients();
    if(clientFilter !== 'all' && clientFilter !== '__none' && !cs.includes(clientFilter)) clientFilter = 'all';
    const box = $('clientChips'); box.textContent = '';
    const mk = (val, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = label;
      b.setAttribute('aria-pressed', clientFilter === val); b.addEventListener('click', () => { clientFilter = val; try{localStorage.setItem('pr-client', val);}catch{} render(); }); box.append(b); };
    mk('all', 'All');
    cs.forEach(c => mk(c, c));
    if(tasks.some(t => !eff(t).client)) mk('__none', 'No client');
    $('clientLabel').hidden = box.hidden = !cs.length;
    // spaces
    if(spaceFilter !== 'all' && spaceFilter !== '__shared' && (!spaceById(spaceFilter) || !inScope(spaceById(spaceFilter)))) spaceFilter = 'all';
    const sb2 = $('spaceChips'); sb2.textContent = '';
    const sm = (val, label, color) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
      if(color){ const i = document.createElement('i'); i.className = 'sw'; i.style.background = color; b.append(i); }
      b.append(document.createTextNode(label));
      const sp0 = spaceById(val); if(sp0 && sp0.shared){ b.append(shareBadge(sp0)); b.title = sharedTip(sp0); }
      b.setAttribute('aria-pressed', spaceFilter === val); b.addEventListener('click', () => setSpaceFilter(val)); sb2.append(b); };
    sm('all', 'All');
    const scoped = spacesSorted().filter(inScope);
    scoped.forEach(x => sm(x.id, x.name, x.color));
    if(scoped.some(x => x.shared)) sm('__shared', 'All shared', null);
    $('spaceLabel').hidden = sb2.hidden = !spaces.length || (!!scopeSp() && scoped.length < 2);
    $('clientList').textContent = ''; cs.forEach(c => { const o = document.createElement('option'); o.value = c; $('clientList').append(o); });
  }
  let filtersOpen = false; try { filtersOpen = localStorage.getItem('pr-filters') === '1'; } catch {}
  function activeFilters(){ return (spaceFilter !== 'all') + (clientFilter !== 'all') + (personFilter !== 'mine' && !!me) + (tab === 'radar' && view !== 'all'); }
  function renderFilterBtn(){
    const n = activeFilters();
    $('filterBar').classList.toggle('closed', !filtersOpen);
    $('filterBtn').setAttribute('aria-expanded', String(filtersOpen));
    $('filterTxt').textContent = n ? `Filter · ${n}` : 'Filter';
  }
  $('filterBtn').addEventListener('click', () => { filtersOpen = !filtersOpen; try { localStorage.setItem('pr-filters', filtersOpen ? '1' : '0'); } catch {} renderFilterBtn(); });
  function setSpaceFilter(v){ spaceFilter = v; projOpen = null; try { localStorage.setItem('pr-space', v); } catch {} render(); }
  const spaceTag = sp => { const s2 = document.createElement('span'); s2.className = 'stag'; const i = document.createElement('i'); i.className = 'sw'; i.style.background = sp.color; s2.append(i, document.createTextNode(sp.name)); return s2; };
  function renderTabs(){
    renderFilterBtn();
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    $('viewCal').hidden = tab !== 'calendar';
    $('viewToday').hidden = tab !== 'today'; $('viewRadar').hidden = tab !== 'radar'; $('viewReports').hidden = tab !== 'reports'; $('viewProjects').hidden = tab !== 'projects';
    document.querySelector('.filters').querySelectorAll('.flabel')[0].hidden = tab !== 'radar';
    $('viewChips').hidden = tab !== 'radar';
  }

  function render(){
    plan();
    applyModules(); $('fMoreHint').textContent = [mod('detail') && 'urgency', 'type', 'project', mod('clients') && 'client', 'files', 'notes…'].filter(Boolean).join(', '); renderScope(); renderGettingStarted(); renderChips(); renderTabs();
    if(document.activeElement !== $('focusHours')) $('focusHours').value = settings.focusHours;
    if(document.activeElement !== $('busyToday')) $('busyToday').value = busyToday();
    const open = tasks.filter(t => isOpen(t) && plannable(t)).map(calc).filter(x => vis(x.t));
    const ah = tasks.filter(t => isOpen(t) && t.afterHours && vis(t)).map(calc).sort((a,b) => (ahWhen(a.t) || 0) - (ahWhen(b.t) || 0));
    const ahRow = x => taskRow(x, '', !!x.t.parentId, {prefix: 'ah-', compact: true, showParent: true, why: ['After hours · ' + fmtWhen(ahWhen(x.t)), 'steady'], hours: fmtH(remOf(x.t))});
    $('ahGroup').hidden = !ah.length; $('cAH').textContent = ah.length; fillList('lAH', ah.slice(0, 8).map(ahRow), '');
    $('g-ah').hidden = !ah.length; $('cAH2').textContent = ah.length; fillList('lAH2', ah.map(ahRow), '');
    const ranked = open.filter(inView).sort(byOrder);
    const rankOf = new Map(); ranked.forEach((x,i) => rankOf.set(x.t.id, String(i+1)));
    const dailyItems = dailies.filter(dailyVis2).sort((a,b) => (a.createdAt||0) - (b.createdAt||0)).map(d => ({d, s: dailyState(d)}));
    const when = x => x.start ?? x.days;
    const hzDays = horizon === 0 ? S.firstW : horizon;   // "Today" after hours means the next workday's plan
    const inHz = x => when(x) === null ? horizon >= 90 : when(x) <= hzDays;
    const radarItems = ranked.filter(inHz).map(x => ({...x, fade: horizon > 7 && when(x) !== null && when(x) > 7}));
    drawRadar(radarItems, rankOf, dailyItems.filter(i => isCheck(i.d)));
    renderHorizon(); renderRoadmap();
    renderProjects();
    if(tab === 'calendar') renderCalendar();

    const we = weekEndOff();
    const inWeek = x => x.score >= 70 || modeOf(x.t) !== 'normal' || (x.pressure !== null && x.pressure <= we);
    const onRadar = x => inView(x) && inHz(x);
    const subsOn = x => subsOf(x.t).filter(t => isOpen(t) && plannable(t)).map(calc).filter(y => vis(y.t) && inHz(y));
    const top = open.filter(x => !x.t.parentId || !byId(x.t.parentId))
      .filter(x => view === 'subtasks' ? false : (onRadar(x) || subsOn(x).length > 0))
      .sort(byOrder);
    // "Subtasks" view lists the tasks themselves, not their projects
    if(view === 'subtasks') top.push(...open.filter(x => onRadar(x) && !subsOf(x.t).length).sort(byOrder));
    const weekL = [], nextL = [];
    for(const x of top){
      const subs = view === 'projects' ? [] : subsOn(x);
      (inWeek(x) || subs.some(inWeek) ? weekL : nextL).push(x);
    }
    const node = x => view !== 'subtasks' && subsOf(x.t).length ? projectBlock(x, rankOf, view === 'projects' ? () => false : y => inHz(y)) : taskRow(x, rankOf.get(x.t.id), view === 'subtasks' && !!x.t.parentId, {showParent: view === 'subtasks'});
    const hzName = {0: 'Today', 7: 'This week', 30: '30 days', 90: '90 days', 180: '6 months'}[horizon] || 'All time';
    $('listScope').textContent = `Same as the radar: ${hzName}` + (view !== 'all' ? ` · ${view === 'projects' ? 'projects only' : 'tasks only'}` : '') + (spaceFilter !== 'all' && spaceById(spaceFilter) ? ` · ${spaceById(spaceFilter).name}` : '') + '. Ordered by what needs action first.';
    fillList('lDaily', dailyItems.map(i => dailyRow(i, 'daily-')), 'Nothing recurring yet. Add checks, weekly, monthly or quarterly work from “+ New → Recurring”.');
    fillList('lWeek', weekL.map(node), 'Nothing needs to start this week.');
    fillList('lNext', nextL.map(node), 'Nothing scheduled for later.');
    const doneTop = tasks.filter(t => t.done && !t.parentId && vis(t)).sort((a,b) => (b.doneAt||0) - (a.doneAt||0)).slice(0, 30).map(calc);
    fillList('lDone', doneTop.map(x => taskRow(x, '', false)), 'Nothing completed yet.');

    $('cDaily').textContent = dailyItems.length; $('cWeek').textContent = weekL.length; $('cNext').textContent = nextL.length;
    $('cDone').textContent = tasks.filter(t => t.done && !t.parentId).length;
    $('sDaily').textContent = dailyItems.filter(i => isCheck(i.d) && i.s.due).length;
    $('sWeek').textContent = weekL.length; $('sOpen').textContent = open.length;
    $('sOver').textContent = open.filter(x => x.days !== null && x.days < 0).length;
    $('weekHint').textContent = `Must start by ${fmt(offDate(we))} to make the deadline, or priority 70+. Projects show here when any subtask does.`;
    $('dailyHint').textContent = 'Checks reset every weekday morning. Weekly, monthly and quarterly work creates its own task ahead of the due date.';
    $('clearEx').hidden = !tasks.some(t => t.example);
    renderToday(dailyItems);
    renderReports();
    if(!$('sScrim').hidden && !$('sScrim').contains(document.activeElement)) renderClientRows();
  }

  /* ---------- interactions ---------- */
  document.querySelectorAll('#viewChips .chip').forEach(c => c.addEventListener('click', () => { view = c.dataset.view; try{localStorage.setItem('pr-view', view);}catch{} render(); }));
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; if(tab === 'calendar') renderCalendar(); if(tab === 'projects'){ projOpen = null; renderProjects(); } try{localStorage.setItem('pr-tab', tab);}catch{} renderTabs(); }));
  document.querySelectorAll('#rangeChips .chip').forEach(c => c.addEventListener('click', () => { range = c.dataset.range; try{localStorage.setItem('pr-range', range);}catch{} renderReports(); }));
  $('rFrom').addEventListener('change', renderReports); $('rTo').addEventListener('change', renderReports);
  const jump = row => {
    if(!row) return;
    row.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'center'});
    row.classList.add('hl'); setTimeout(() => row.classList.remove('hl'), 1600);
  };
  $('radar').addEventListener('click', e => {
    const t = e.target; if(!t.getAttribute) return;
    const id = t.getAttribute('data-id'), did = t.getAttribute('data-daily');
    if(id){ const t = byId(id); if(t) openDetails(t); }
    else if(did){ const d = dailies.find(x => x.id === did); if(d) openDaily(d); }
  });
  $('radar').addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.classList.contains('dot')) e.target.dispatchEvent(new MouseEvent('click', {bubbles:true})); });

  let fhT;
  $('focusHours').addEventListener('input', () => {
    clearTimeout(fhT);
    fhT = setTimeout(async () => {
      const v = Math.min(12, Math.max(1, Math.round((Number($('focusHours').value) || 5) * 2) / 2));
      if(v === settings.focusHours) return;
      settings = {...settings, focusHours: v}; render();
      try { await store.saveSettings(settings); } catch(e){ fail(e); }
    }, 600);
  });

  let bT;
  $('busyToday').addEventListener('input', () => {
    clearTimeout(bT);
    bT = setTimeout(async () => {
      const v = Math.min(12, Math.max(0, Math.round((Number($('busyToday').value) || 0) * 2) / 2));
      if(v === busyToday()) return;
      settings = {...settings, busy: {date: dayKey(), hours: v}}; render();
      try { await store.saveSettings(settings); } catch(e){ fail(e); }
    }, 600);
  });
  function weekSessionsDone(t){
    const wk0 = S.firstW - offDate(S.firstW).getDay();
    const keys = new Set([0,1,2,3,4,5,6].map(i => dayKey(offDate(wk0 + i))));
    return new Set((t.sessions || []).filter(x => keys.has(x.date)).map(x => x.date)).size;
  }
  async function logSession(t, on, h){
    const k = dayKey(), rest = (t.sessions || []).filter(x => x.date !== k);
    const data = {...t, sessions: on ? [...rest, {date: k, hours: h || Number(t.sessionHours) || 1}] : rest}; delete data.id;
    try { await store.save('tasks', t.id, data); toast(on ? 'Session logged' : 'Session removed'); } catch(e){ fail(e); }
  }

  /* ---------- task form ---------- */
  function buildSeg(boxId, name){
    const box = $(boxId);
    const a = document.createElement('label'); a.className = 'seg auto'; a.id = name + 'AutoL';
    a.innerHTML = `<input type="radio" name="${name}" id="${name}0" value="0"><span>Project</span>`; box.append(a);
    for(let i=5;i>=1;i--){   // shown as 1 (highest) … 5 (lowest)
      const l = document.createElement('label'); l.className = 'seg';
      l.innerHTML = `<input type="radio" name="${name}" id="${name}${i}" value="${i}"><span>${6 - i}</span>`; box.append(l);
    }
  }
  buildSeg('segImp', 'imp'); buildSeg('segUrg', 'urg');
  { const mk = (id, v, lab) => { const l = document.createElement('label'); l.className = 'seg auto'; l.innerHTML = `<input type="radio" name="effort" id="${id}" value="${v}"><span>${lab}</span>`; $('segEff').append(l); };
    mk('effNone', 0, 'None');
    EFFORTS.forEach(([h, lab], i) => mk('eff' + i, h, lab));
    mk('effCustom', 'custom', 'Custom'); }
  const syncEffort = () => { const c = $('effCustom').checked; $('effCustomBox').hidden = !c; $('fEffC').disabled = !c; };
  $('segEff').addEventListener('change', () => { syncEffort(); if($('effCustom').checked) setTimeout(() => $('fEffC').focus(), 0); });
  $('fEffC').addEventListener('change', () => { const v = Number($('fEffC').value); if(v > 0){ const r = Math.max(0.5, Math.round(v * 2) / 2); if(r !== v) toast(`Rounded to ${r}h (whole and half hours only)`); $('fEffC').value = r; } });
  const getRadio = n => Number((document.querySelector(`input[name="${n}"]:checked`)||{}).value ?? 3);
  const setRadio = (n, v) => { const r = $(n + v); if(r) r.checked = true; };
  const setEffort = h => {
    h = Number(h) || 0;
    if(h === 0) $('effNone').checked = true;
    else { const i = EFFORTS.findIndex(e => e[0] === h); if(i >= 0) $('eff' + i).checked = true; else { $('effCustom').checked = true; $('fEffC').value = h; } }
    if(!$('effCustom').checked) $('fEffC').value = '';
    syncEffort();
  };
  const getEffort = () => {
    const v = (document.querySelector('input[name="effort"]:checked') || {}).value;
    if(v === 'custom') return Math.max(0.5, Math.round((Number($('fEffC').value) || 1) * 2) / 2);
    return v === undefined ? 1 : Number(v);
  };

  function fillParents(selfId){
    const sel = $('fParent'); sel.textContent = '';
    const none = document.createElement('option'); none.value = ''; none.textContent = 'None'; sel.append(none);
    tasks.filter(t => !t.parentId && !t.done && t.id !== selfId).sort((a,b) => a.title.localeCompare(b.title)).forEach(t => {
      const o = document.createElement('option'); o.value = t.id; o.textContent = t.title + (t.client ? ` · ${t.client}` : ''); sel.append(o);
    });
  }
  const getMode = () => (document.querySelector('input[name="mode"]:checked') || {}).value || 'normal';
  function syncMode(){
    const m = getMode();
    $('steadyFields').hidden = m !== 'steady';
    $('modeNote').textContent = m === 'steady' ? 'For things with no single due date, like studying or exercise: Kairo saves a few hours for it every week.'
      : m === 'emergency' ? 'Goes to the top of today and pushes other work later. Use it when something can’t wait.'
      : 'Scheduled from its deadline, importance and effort.';
  }
  const PRIO = {urgent: [5, 5], high: [4, 4], normal: [3, 3], low: [2, 2], project: [0, 0]};
  function prioFromRadios(){
    const i = getRadio('imp'), u = getRadio('urg');
    const v = i === 0 ? 'project' : ((i + (u || i)) / 2 >= 4.5 ? 'urgent' : (i + (u || i)) / 2 >= 3.5 ? 'high' : (i + (u || i)) / 2 >= 2.5 ? 'normal' : 'low');
    const r = $('prio' + v[0].toUpperCase() + v.slice(1)); if(r) r.checked = true;
  }
  $('segPrio').addEventListener('change', () => { const v = (document.querySelector('input[name="prio"]:checked') || {}).value; if(!v) return; setRadio('imp', PRIO[v][0]); setRadio('urg', PRIO[v][1]); updatePreview(); });
  function syncParentUI(){
    const pid = $('fParent').value, p = pid ? byId(pid) : null;
    $('impAutoL').hidden = !p; $('urgAutoL').hidden = !p; $('prioProjL').hidden = !p;
    if(!p){ if(getRadio('imp') === 0) setRadio('imp', 3); if(getRadio('urg') === 0) setRadio('urg', 3); }
    prioFromRadios();
    $('fClient').disabled = !!p; $('fSpace').disabled = !!p;
    if(p){ $('fClient').value = p.client || ''; $('fSpace').value = (spaceOf(p) || {}).id || ''; }
    const note = $('dateNote');
    if(p && p.deadline){ note.hidden = false; note.textContent = `Project due ${fmt(parseD(p.deadline))}. Leave empty to use it; later dates are capped.`; $('fDate').max = p.deadline; }
    else if(p){ note.hidden = false; note.textContent = 'Leave empty to follow the project.'; $('fDate').removeAttribute('max'); }
    else { note.hidden = true; $('fDate').removeAttribute('max'); }
    syncMode();
    $('effortField').hidden = formProject || getMode() === 'steady';
  }
  function draft(){
    const pid = $('fParent').value || null, imp = getRadio('imp'), urg = getRadio('urg');
    return {title: $('fTitle').value.trim(), parentId: pid, importance: pid && imp === 0 ? null : (imp || 3), urgency: pid && urg === 0 ? null : (urg || 3),
      deadline: $('fDate').value || null, client: pid ? '' : $('fClient').value.trim(), notes: $('fNotes').value.trim(), effort: getEffort(),
      mode: getMode(), weeklyHours: Math.min(20, Math.max(0.5, Number($('fWeekly').value) || 3)), sessionHours: Number($('fSession').value) || 1,
      spaceId: pid ? null : ($('fSpace').value || null), amount: formProject || $('fAmount').value === '' ? null : Math.max(0, Number($('fAmount').value) || 0), isProject: formProject,
      ...(formProject ? {parentId: null, mode: 'normal', effort: 0, subtaskDays: Number($('fSubDays').value) || null, afterHours: false, location: '', travelMin: 0}
        : {afterHours: $('fAH').checked, ahAt: $('fAH').checked ? ($('fAHAt').value || null) : null, location: $('fLoc').value, travelMin: Number($('fTravel').value) || 0,
           progress: editingId ? Number($('fProg').value) || 0 : 0,
           readyMode: $('fReady').value === 'auto' ? 'auto' : $('fReady').value === 'due' ? 'due' : 'days', readyDays: /^\d+$/.test($('fReady').value) ? Number($('fReady').value) : null}),
      fields: readFieldRows(), repeat: readRepeat(), workTimes: formProject ? [] : readWork()};
  }
  let wtList = [];
  const readWork = () => wtList.filter(w => w.date && Number(w.hours) > 0).map(w => ({date: w.date, time: w.time || '', hours: Math.round(Number(w.hours) * 4) / 4}));
  function renderWt(){
    const box = $('wtRows'); box.textContent = '';
    wtList.forEach((w, k) => {
      const r = document.createElement('div'); r.className = 'wt-row';
      const d = document.createElement('input'); d.type = 'date'; d.value = w.date; d.min = dayKey(); d.setAttribute('aria-label', 'Work day');
      const tm = document.createElement('input'); tm.type = 'time'; tm.value = w.time || ''; tm.setAttribute('aria-label', 'Start time (optional)'); tm.title = 'Start time (optional)';
      const h = document.createElement('input'); h.type = 'number'; h.min = '0.25'; h.max = '12'; h.step = '0.25'; h.value = w.hours; h.inputMode = 'decimal'; h.setAttribute('aria-label', 'Hours');
      const x = document.createElement('button'); x.type = 'button'; x.className = 'btn sm'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove this work time');
      d.addEventListener('input', () => { w.date = d.value; updatePreview(); }); tm.addEventListener('input', () => { w.time = tm.value; });
      h.addEventListener('input', () => { w.hours = h.value; updatePreview(); });
      x.addEventListener('click', () => { wtList.splice(k, 1); renderWt(); updatePreview(); });
      r.append(d, tm, h, span('h', 'fnote'), x); box.append(r);
    });
  }
  $('wtAdd').addEventListener('click', () => {
    const last = wtList[wtList.length - 1], base = last && last.date ? parseD(last.date) : null;
    const next = base ? dayKey(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)) : dayKey();
    wtList.push({date: next, time: '', hours: Math.min(2, Math.max(0.5, getEffort() || 1))}); renderWt(); updatePreview();
    const ins = $('wtRows').querySelectorAll('input[type=date]'); if(ins.length) ins[ins.length - 1].focus();
  });
  function readRepeat(){
    const v = $('fRepeat').value; if(!v || getMode() === 'steady') return null;
    const [n, unit] = v === 'custom' ? [Math.min(365, Math.max(2, Math.round(Number($('fRepN').value) || 0) || 10)), 'day'] : [Number(v.split(':')[0]), v.split(':')[1]];
    const dl = $('fDate').value; return {n, unit, day: dl ? parseD(dl).getDate() : null};
  }
  const repKey = r => !r ? '' : (r.unit === 'day' && r.n !== 1) ? 'custom' : `${r.n}:${r.unit}`;
  function repText(r){
    if(!r) return '';
    if(r.unit === 'weekday') return 'every weekday';
    const u = {day: 'day', week: 'week', month: 'month', year: 'year'}[r.unit] || r.unit;
    return r.n === 1 ? 'every ' + u : `every ${r.n} ${u}s`;
  }
  function addRepeat(d, r, anchor){
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if(r.unit === 'day') x.setDate(x.getDate() + r.n);
    else if(r.unit === 'week') x.setDate(x.getDate() + 7 * r.n);
    else if(r.unit === 'weekday'){ do { x.setDate(x.getDate() + 1); } while(x.getDay() === 0 || x.getDay() === 6); }
    else { const y = new Date(x.getFullYear(), x.getMonth() + (r.unit === 'year' ? 12 : 1) * r.n, 1), last = new Date(y.getFullYear(), y.getMonth() + 1, 0).getDate(); y.setDate(Math.min(anchor || x.getDate(), last)); return y; }
    return x;
  }
  // the next due date: one step from the current due date (or from the day it was closed), never in the past
  function nextDue(t, doneAt){
    const r = t.repeat, own = t.deadline || (t.afterHours && t.ahAt ? t.ahAt.slice(0, 10) : null);
    let d = addRepeat(own ? parseD(own) : new Date(doneAt || Date.now()), r, r.day), n = 0;
    while(d < today0() && n++ < 2000) d = addRepeat(d, r, r.day);
    return d;
  }
  const newTaskId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // closing a repeating task creates the next one (a project brings its tasks along)
  async function spawnNext(t, doneAt){
    if(!t.repeat || t.repeatNext) return null;
    const due = nextDue(t, doneAt), key = dayKey(due), par = t.parentId ? byId(t.parentId) : null;
    if(par && (par.deadline || '') && key > par.deadline) return null;
    const own = t.deadline || (t.afterHours && t.ahAt ? t.ahAt.slice(0, 10) : null);
    const shift = own ? Math.round((parseD(key) - parseD(own)) / DAY) : 0;
    const fresh = (x, extra) => { const d = {...x, done: false, doneAt: null, closeout: null, sessions: [], progress: 0, repeatNext: null, workTimes: [], createdAt: Date.now(), ...extra}; delete d.id; delete d._owner; return d; };
    const shiftKey = k => { if(!k) return k; const a = parseD(k.slice(0, 10)); a.setDate(a.getDate() + shift); return dayKey(a) + k.slice(10); };
    const nid = newTaskId();
    await store.save('tasks', nid, fresh(t, {deadline: key, ahAt: t.ahAt ? key + t.ahAt.slice(10) : t.ahAt, repeatOf: t.repeatOf || t.id}));
    if(isProject(t)) for(const sub of subsOf(t)) await store.save('tasks', newTaskId(), fresh(sub, {parentId: nid, deadline: shiftKey(sub.deadline), ahAt: shiftKey(sub.ahAt)}));
    return {id: nid, due};
  }
  let formProject = false;
  function fillSpaceSelect(sel, val){ sel.textContent = ''; if(!(val && spaceById(val)) && scopeSp()) val = scopeSp().id; for(const x of spacesSorted().filter(x => inScope(x) || x.id === val)){ const o = document.createElement('option'); o.value = x.id; o.textContent = x.name; sel.append(o); } if(!spaces.length){ const o = document.createElement('option'); o.value = ''; o.textContent = 'No spaces yet'; sel.append(o); } sel.value = (val && spaceById(val)) ? val : ((defaultSpace() || {}).id || ''); }
  function updatePreview(){
    const d = draft(), fake = {...(editingId ? byId(editingId) : {}), ...d, id: editingId || '__draft', done:false};
    const prev = tasks, prevS = S;
    tasks = editingId ? tasks.map(t => t.id === editingId ? fake : t) : [...tasks, fake];
    plan(); const x = calc(fake);
    tasks = prev; S = prevS;
    const p = $('pScore'); p.textContent = x.score; p.className = 'score tier-' + x.tier;
    let txt = `${tierName[x.tier]} priority · ${qName[x.q]}`;
    if(d.mode === 'emergency') txt = 'Emergency · top of today';
    else if(d.mode === 'steady') txt += ` · ${Math.min(5, Math.max(1, Math.round(d.weeklyHours / d.sessionHours)))} sessions a week`;
    else if(isLHF(x)) txt += ' · Quick win';
    if(d.mode === 'normal' && x.risk) txt += ' · At risk'; else if(d.mode === 'normal' && x.start !== null && x.days !== null && x.start < x.days) txt += ' · Start by ' + fmtOff(x.start);
    $('pText').textContent = txt;
    { $('wtField').hidden = d.mode !== 'normal' || !!d.afterHours;
      const wh = (d.workTimes || []).reduce((a, w) => a + w.hours, 0), eh = Number(d.effort) || 0;
      $('wtNote').textContent = !wh ? 'Optional. Pick the days (and times) you’ll work on it, and Kairo plans the rest of the effort around them.'
        : eh && wh > eh + 1e-9 ? `That’s ${fmtH(wh)}, more than the ${fmtH(eh)} of effort.`
        : `${fmtH(wh)} chosen by you` + (eh > wh ? ` · Kairo plans the other ${fmtH(eh - wh)}` : '') + (d.deadline && (d.workTimes || []).some(w => w.date > d.deadline) ? ' · some of it is after the deadline' : ''); }
    { const r = d.repeat; $('repeatField').hidden = d.mode === 'steady';
      if(!r) $('fRepNote').textContent = '';
      else { const nx = nextDue({...d, deadline: d.deadline || null}, Date.now());
        $('fRepNote').textContent = (d.deadline ? `Repeats ${repText(r)}. When you close it, the next one is created, due ${fmt(nx)}.` : `Repeats ${repText(r)} from the day you close it. Add a deadline to fix the dates.`) + (d.isProject ? ' Its tasks come along.' : ''); } }
    const lead = d.mode === 'normal' && !d.afterHours ? leadOf({...d, effort: d.effort}) : 0;
    $('fReadyNote').textContent = !d.deadline ? 'Set a deadline to get a Ready by date.'
      : lead ? `Ready by ${fmt(new Date(parseD(d.deadline).getTime() - lead * DAY))} · due ${fmt(parseD(d.deadline))}` : 'No buffer: it just needs to be done by the due date.';
  }
  /* ---------- custom fields ---------- */
  function renderFieldRows(list){
    const box = $('fFields'); box.textContent = '';
    for(const f of list) addFieldRow(f.k, f.v);
    const keys = [...new Set(tasks.flatMap(t => (t.fields || []).map(f => f.k)).filter(Boolean))];
    $('fieldKeys').textContent = ''; keys.forEach(k => { const o = document.createElement('option'); o.value = k; $('fieldKeys').append(o); });
  }
  function addFieldRow(k = '', v = ''){
    const r = document.createElement('div'); r.className = 'cf-row';
    const a = document.createElement('input'); a.type = 'text'; a.maxLength = 40; a.placeholder = 'Field, e.g. Ticket #'; a.value = k; a.setAttribute('list', 'fieldKeys'); a.setAttribute('aria-label', 'Field name');
    const b = document.createElement('input'); b.type = 'text'; b.maxLength = 200; b.placeholder = 'Value'; b.value = v; b.setAttribute('aria-label', 'Field value');
    const x = document.createElement('button'); x.type = 'button'; x.className = 'btn sm'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove field');
    x.addEventListener('click', () => r.remove());
    r.append(a, b, x); $('fFields').append(r); return a;
  }
  const readFieldRows = () => [...$('fFields').querySelectorAll('.cf-row')].map(r => { const i = r.querySelectorAll('input'); return {k: i[0].value.trim(), v: i[1].value.trim()}; }).filter(f => f.k);
  $('fAddField').addEventListener('click', () => addFieldRow().focus());
  function syncWhen(){
    const ah = $('fAH').checked;
    $('fAHAt').hidden = !ah;
    if(ah && !$('fAHAt').value) $('fAHAt').value = ($('fDate').value || dayKey()) + 'T22:00';
    $('whenNote').textContent = ah ? 'Set when it happens (a maintenance window, night work). It won’t use your focus time or show on the radar.'
      : 'Kairo fits it into your work hours (or the space’s hours) before it’s due.';
  }
  $('fAH').addEventListener('change', syncWhen); $('whenWork').addEventListener('change', syncWhen);
  $('fProg').addEventListener('input', () => { $('fProgV').textContent = $('fProg').value + '%'; });

  /* ---------- files (Supabase Storage, bucket "attachments") ----------
     Path: <owner id>/<task id>/<time>-<name>. The database rules let the owner,
     and members of a shared space the task is in, read and change them. */
  const MAX_FILE = 10 * 1024 * 1024;
  let pendingFiles = [];
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>';
  const canFiles = () => !!(sb && cloudUser);
  function fileRow(a, onRemove, pending){
    const r = document.createElement('div'); r.className = 'file' + (pending ? ' pending' : '');
    const ic = document.createElement('span'); ic.innerHTML = FILE_ICON;
    const n = document.createElement('button'); n.type = 'button'; n.className = 'fn'; n.textContent = a.name; n.title = pending ? 'Uploads when you save' : 'Open ' + a.name;
    if(!pending) n.addEventListener('click', () => openFile(a)); else n.disabled = true;
    const sz = span(pending ? 'on save' : fmtSize(a.size || 0), 'fs');
    const x = document.createElement('button'); x.type = 'button'; x.className = 'fx'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + a.name);
    let armed = false;
    x.addEventListener('click', () => { if(pending || armed){ onRemove(); return; } armed = true; x.textContent = 'Remove?'; x.style.fontSize = '12.5px'; setTimeout(() => { armed = false; x.textContent = '×'; x.style.fontSize = ''; }, 3000); });
    r.append(ic, n, sz, x); return r;
  }
  function renderFormFiles(t){
    const box = $('fFiles'); box.textContent = '';
    const cur = t ? (byId(t.id) || t) : null;
    for(const a of (cur && cur.attachments) || []) box.append(fileRow(a, async () => { await removeFile(cur, a); renderFormFiles(byId(cur.id)); }));
    pendingFiles.forEach((f, i) => box.append(fileRow({name: f.name, size: f.size}, () => { pendingFiles.splice(i, 1); renderFormFiles(t); }, true)));
    $('fFilesNote').textContent = canFiles() ? 'Up to 10 MB each. Saved privately with your account.' : 'Sign in to attach files (they’re stored in the cloud).';
    $('fFileIn').disabled = !canFiles();
  }
  $('fFileIn').addEventListener('change', () => {
    for(const f of $('fFileIn').files){ if(f.size > MAX_FILE) toast(`${f.name} is over 10 MB`); else pendingFiles.push(f); }
    $('fFileIn').value = ''; renderFormFiles(editingId ? byId(editingId) : null);
  });
  // the files list shown in task details and on a project page
  function filesBox(t){
    const box = document.createElement('div'); box.className = 'files';
    const draw = () => {
      const cur = byId(t.id) || t; box.textContent = '';
      for(const a of cur.attachments || []) box.append(fileRow(a, async () => { await removeFile(cur, a); draw(); }));
      if(!(cur.attachments || []).length && !canFiles()) box.append(span('Sign in to attach files.', 'fnote'));
      if(canFiles()){
        const l = document.createElement('label'); l.className = 'btn sm file-btn'; l.style.alignSelf = 'flex-start';
        const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.hidden = true;
        inp.addEventListener('change', async () => { const fs = [...inp.files].filter(f => f.size <= MAX_FILE); if(fs.length < inp.files.length) toast('Files over 10 MB were skipped');
          if(!fs.length) return; l.textContent = 'Uploading…'; await uploadFiles(byId(t.id) || t, fs); draw(); });
        l.append(inp, document.createTextNode((cur.attachments || []).length ? '+ Attach more' : 'Attach files'));
        box.append(l);
      }
    };
    draw(); return box;
  }
  async function uploadFiles(t, files){
    if(!canFiles()){ toast('Sign in to attach files'); return; }
    if(!navigator.onLine){ toast('You’re offline. Attach files when you’re back online.'); return; }
    const owner = t._owner || cloudUser.id, added = [];
    for(const f of files){
      const path = `${owner}/${t.id}/${Date.now().toString(36)}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
      const {error} = await sb.storage.from('attachments').upload(path, f, {contentType: f.type || 'application/octet-stream', upsert: false});
      if(error){ toast(/bucket|not found|policy|security/i.test(error.message) ? 'Run attachments-setup.sql in Supabase first' : error.message); break; }
      added.push({name: f.name, path, size: f.size, type: f.type || '', at: Date.now()});
    }
    if(!added.length) return;
    const cur = byId(t.id) || t, d = {...cur, attachments: [...(cur.attachments || []), ...added]}; delete d.id;
    try { await store.save('tasks', t.id, d); toast(added.length === 1 ? 'File attached' : `${added.length} files attached`); } catch(e){ fail(e); }
  }
  async function removeFile(t, a){
    if(canFiles()) try { await sb.storage.from('attachments').remove([a.path]); } catch {}
    const cur = byId(t.id) || t, d = {...cur, attachments: (cur.attachments || []).filter(x => x.path !== a.path)}; delete d.id;
    try { await store.save('tasks', t.id, d); toast('File removed'); } catch(e){ fail(e); }
  }
  async function openFile(a){
    if(!canFiles()){ toast('Sign in to open files'); return; }
    const w = window.open('', '_blank'); if(w) w.opener = null;
    // pages and scripts are always downloaded, never opened, so a shared file can't run code
    const risky = /\.(html?|xhtml|svg|xml|js|mjs)$/i.test(a.name || a.path);
    const {data, error} = await sb.storage.from('attachments').createSignedUrl(a.path, 120, risky ? {download: a.name || true} : undefined);
    if(error || !data){ if(w) w.close(); toast('Couldn’t open the file' + (error ? ': ' + error.message : '')); return; }
    if(w) w.location.href = data.signedUrl; else location.assign(data.signedUrl);
  }

  $('form').addEventListener('input', e => { if(e.target.id === 'fParent' || e.target.name === 'mode') syncParentUI(); updatePreview(); });
  $('fParent').addEventListener('change', () => { syncParentUI(); updatePreview(); });

  const nameOf = id => id === me ? 'You' : 'Someone';

  /* ---------- backup ---------- */
  async function saveFile(filename, data, type){
    const url = URL.createObjectURL(new Blob([data], {type}));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  $('exportBtn').addEventListener('click', async () => {
    const strip = arr => arr.map(x => ({...x}));
    const data = {app: 'priority-radar', version: APP_VERSION, exportedAt: new Date().toISOString(), tasks: strip(tasks), daily: strip(dailies), clients: strip(clientDocs), spaces: strip(spaces), events: strip(events), settings};
    try { await saveFile(`kairo-backup-${dayKey()}.json`, JSON.stringify(data, null, 2), 'application/json'); toast('Backup exported'); }
    catch(e){ if(!e || e.code !== 'cancelled') toast('Couldn’t export the backup'); }
  });
  let pendingImport = null;
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async () => {
    const f = $('importFile').files[0]; $('importFile').value = ''; if(!f) return;
    try {
      const d = JSON.parse(await f.text());
      if(d.app !== 'priority-radar' || !Array.isArray(d.tasks)) throw new Error('bad');
      pendingImport = d;
      $('importMsg').textContent = `${d.tasks.length} tasks, ${(d.daily || []).length} routines, ${(d.clients || []).length} clients from ${d.exportedAt ? new Date(d.exportedAt).toLocaleDateString('en-US') : 'a backup'}.`;
      $('importConfirm').hidden = false;
    } catch { toast('That file isn’t a Kairo backup'); }
  });
  async function runImport(replace){
    const d = pendingImport; pendingImport = null; $('importConfirm').hidden = true; if(!d) return;
    try {
      if(replace){
        for(const t of [...tasks]) await store.remove('tasks', t.id);
        for(const x of [...dailies]) await store.remove('daily', x.id);
      }
      for(const t of d.tasks){ const {id, ...rest} = t; if(id) await store.save('tasks', id, rest); }
      for(const x of (d.daily || [])){ const {id, ...rest} = x; if(id) await store.save('daily', id, rest); }
      for(const x of (d.spaces || [])){ const {id, ...rest} = x; if(id) await store.save('spaces', id, rest); }
      for(const x of (d.events || [])){ const {id, ...rest} = x; if(id) await store.save('events', id, rest); }
      for(const c of (d.clients || [])){ if(c.name && !clientDoc(c.name)) await store.add('clients', {name: c.name, createdAt: c.createdAt || Date.now()}); }
      if(d.settings){ settings = {...settings, ...d.settings}; await store.saveSettings(settings); }
      toast(replace ? 'Backup restored' : 'Backup added'); render();
    } catch(e){ fail(e); }
  }
  $('importMerge').addEventListener('click', () => runImport(false));
  $('importReplace').addEventListener('click', () => runImport(true));

  /* ---------- import tasks from another app ----------
     Reads a CSV or JSON export and maps its columns by name. Projects/lists
     become Kairo projects, priorities map to 1–5, completed rows are optional. */
  const norm = k => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const COLS = {
    title: ['name', 'taskname', 'title', 'content', 'task', 'summary', 'subject', 'cardname', 'taskcontent'],
    deadline: ['duedate', 'due', 'deadline', 'dueon', 'dueat', 'date', 'enddate', 'duedatetime', 'finishdate', 'targetdate'],
    notes: ['description', 'notes', 'desc', 'details', 'note', 'taskdescription'],
    project: ['project', 'projects', 'projectname', 'list', 'listname', 'section', 'sectioncolumn', 'column', 'folder', 'parent', 'parenttask', 'epic', 'board', 'bucket', 'bucketname', 'plan', 'planname'],
    priority: ['priority', 'importance'],
    status: ['status', 'completed', 'done', 'state', 'iscompleted', 'closed', 'progress'],
    doneAt: ['completedat', 'completiondate', 'datecompleted', 'completeddate', 'datedone', 'closeddate'],
    effort: ['timeestimate', 'estimate', 'effort', 'efforthours', 'duration', 'hours', 'estimatedtime', 'timeestimated', 'estimatedhours', 'hoursestimate', 'estimatehours', 'durationhours'],
    client: ['client', 'customer', 'company', 'account'],
    space: ['space', 'area', 'workspace', 'category'],
    tags: ['tags', 'labels', 'label'],
    type: ['type', 'itemtype'],
    afterHours: ['afterhours', 'afterhoursdatetime', 'afterhourswhen', 'maintenancewindow', 'window'],
  };
  // a template people can fill in Excel / Google Sheets
  $('imTemplate').addEventListener('click', async () => {
    const q = v => /[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
    const d = n => dayKey(offDate(n));
    const rows = [
      ['Name', 'Due Date', 'Priority', 'Effort (hours)', 'Project', 'Space', 'Client', 'Status', 'After Hours', 'Description'],
      ['Example: Renew SSL certificate', d(10), '1', '1', 'Example project', 'Work', 'Acme Co.', 'To do', '', 'Priority 1 = highest, 5 = lowest. Effort in hours (0.5 steps, 0 = none).'],
      ['Example: Switch firmware upgrade', d(5), '2', '2', 'Example project', 'Work', '', 'To do', d(5) + ' 22:00', 'After Hours = date and time of the window (leave empty for normal work).'],
      ['Example: Read chapter 4', d(7), '3', '1.5', '', 'University', '', 'To do', '', 'Dates as YYYY-MM-DD or MM/DD/YYYY. Status Done imports it as completed. Delete these example rows.'],
    ];
    try { await saveFile('kairo-import-template.csv', '\uFEFF' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv'); toast('Template downloaded'); }
    catch(e){ if(!e || e.code !== 'cancelled') toast('Couldn’t download the template'); }
  });
  function parseWhen(v){
    if(!v) return null;
    const day = parseDay(v); if(!day) return null;
    const m = String(v).match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i); let h = 22, mi = 0;
    if(m){ h = Number(m[1]) % 24; mi = Number(m[2]); if(m[3] && /pm/i.test(m[3]) && h < 12) h += 12; if(m[3] && /am/i.test(m[3]) && h === 12) h = 0; }
    return `${day}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  function parseCSV(text){
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for(let i = 0; i < text.length; i++){
      const c = text[i];
      if(q){ if(c === '"'){ if(text[i + 1] === '"'){ cell += '"'; i++; } else q = false; } else cell += c; }
      else if(c === '"') q = true;
      else if(c === delim){ row.push(cell); cell = ''; }
      else if(c === '\n' || c === '\r'){ if(c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if(cell !== '' || row.length){ row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim());
    return rows.filter(r => r.some(c => c.trim() !== '')).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  }
  function jsonRows(d){
    if(d && Array.isArray(d.cards) && Array.isArray(d.lists)){   // Trello board export
      const lists = Object.fromEntries(d.lists.map(l => [l.id, l.name]));
      return d.cards.filter(c => !c.closed || c.dueComplete).map(c => ({name: c.name, description: c.desc, due: c.due, list: lists[c.idList] || '', completed: c.dueComplete ? 'true' : '', labels: (c.labels || []).map(l => l.name).join(', ')}));
    }
    const arr = Array.isArray(d) ? d : d && (d.tasks || d.items || d.data || d.cards || d.results || d.value);
    if(!Array.isArray(arr)) throw new Error('No list of tasks found in this JSON');
    return arr.filter(o => o && typeof o === 'object').map(o => {
      const f = {}; for(const [k, v] of Object.entries(o)) f[k] = v && typeof v === 'object' ? (v.name || v.title || v.date || v.status || v.value || '') : v;
      return f;
    });
  }
  function pick(row, key){
    for(const [k, v] of Object.entries(row)) if(COLS[key].includes(norm(k)) && v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
    return '';
  }
  function parseDay(v){
    if(!v) return null;
    let m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(m){ const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
    if(/^\d{12,13}$/.test(v)) return dayKey(new Date(Number(v)));
    const t = Date.parse(v); return isNaN(t) ? null : dayKey(new Date(t));
  }
  function parsePrio(v){
    const x = norm(v); if(!x) return 3;
    if(/^(p?1|urgent|highest|critical|veryhigh)$/.test(x)) return 5;
    if(/^(p?2|high)$/.test(x)) return 4;
    if(/^(p?3|normal|medium|med|important)$/.test(x)) return 3;
    if(/^(p?[45]|low|lowest|verylow|none|nopriority)$/.test(x)) return 2;
    return 3;
  }
  function parseEffort(v, col){
    if(!v) return 1;
    const s2 = String(v).toLowerCase().trim(); let h = null, m;
    if(/^(0|0\.0|none|no|-)$/.test(s2)) return 0;
    if((m = s2.match(/^(\d+):(\d{2})/))) h = Number(m[1]) + Number(m[2]) / 60;
    else if((m = s2.match(/([\d.]+)\s*h/))){ h = Number(m[1]); const mm = s2.match(/([\d.]+)\s*m/); if(mm) h += Number(mm[1]) / 60; }
    else if((m = s2.match(/([\d.]+)\s*(m|min)/))) h = Number(m[1]) / 60;
    else if((m = s2.match(/([\d.]+)\s*d/))) h = Number(m[1]) * 8;
    else if(!isNaN(Number(s2))){ const n = Number(s2); h = n > 100000 ? n / 3600000 : n > 16 ? n / 60 : n; }
    if(!h || h <= 0) return 1;
    return Math.min(200, Math.max(0.5, Math.round(h * 2) / 2));
  }
  const isDoneVal = v => /^(complete|completed|done|closed|resolved|finished|true|yes|y|1|x|100%?)$/i.test(String(v || '').trim());
  let imRows = [];
  function openImport(){
    imRows = []; $('imPreview').hidden = true; $('imGo').disabled = true; $('imName').textContent = ''; $('imFile').value = '';
    fillSpaceSelect($('imSpace'), spaceFilter !== 'all' ? spaceFilter : '');
    $('imScrim').hidden = false;
  }
  $('importAppBtn').addEventListener('click', openImport);
  $('importAppBtn2').addEventListener('click', () => { $('sScrim').hidden = true; openImport(); });
  $('imCancel').addEventListener('click', () => { $('imScrim').hidden = true; });
  $('imScrim').addEventListener('click', e => { if(e.target === $('imScrim')) $('imScrim').hidden = true; });
  $('imFile').addEventListener('change', async () => {
    const f = $('imFile').files[0]; if(!f) return;
    $('imName').textContent = f.name;
    try {
      const text = await f.text();
      const raw = /\.json$/i.test(f.name) || /^\s*[\[{]/.test(text) ? jsonRows(JSON.parse(text)) : parseCSV(text);
      imRows = raw.filter(r => { const ty = norm(pick(r, 'type')); return !ty || ty === 'task' || ty === 'subtask' || ty === 'todo'; }).map(r => {
        const status = pick(r, 'status'), doneAt = pick(r, 'doneAt');
        return {title: pick(r, 'title'), deadline: parseDay(pick(r, 'deadline')), notes: [pick(r, 'notes'), pick(r, 'tags') ? 'Tags: ' + pick(r, 'tags') : ''].filter(Boolean).join('\n\n'),
          project: pick(r, 'project'), importance: parsePrio(pick(r, 'priority')), effort: parseEffort(pick(r, 'effort')), client: pick(r, 'client'), space: pick(r, 'space'),
          done: isDoneVal(status) || !!doneAt, doneAt: parseDay(doneAt), ahAt: parseWhen(pick(r, 'afterHours'))};
      }).filter(r => r.title);
      if(!imRows.length) throw new Error('No tasks found. The file needs a column like “Name”, “Task” or “Title”.');
      const projects = [...new Set(imRows.map(r => r.project).filter(Boolean))];
      const done = imRows.filter(r => r.done).length, dated = imRows.filter(r => r.deadline).length;
      $('imSummary').textContent = `${imRows.length} tasks found · ${dated} with a due date · ${done} completed` + (projects.length ? ` · ${projects.length} project${projects.length === 1 ? '' : 's'}/lists: ${projects.slice(0, 6).join(', ')}${projects.length > 6 ? '…' : ''}` : '');
      $('imGroup').closest('label').hidden = !projects.length;
      const tb = $('imTable'); tb.textContent = '';
      const hr = document.createElement('tr'); ['Task', 'Due', 'Priority', 'Project'].forEach(h => { const th = document.createElement('th'); th.textContent = h; hr.append(th); }); tb.append(hr);
      for(const r of imRows.slice(0, 5)){ const tr = document.createElement('tr'); [r.title, r.deadline ? fmt(parseD(r.deadline)) : '—', String(6 - r.importance), r.project || '—'].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.append(td); }); tb.append(tr); }
      $('imPreview').hidden = false; $('imGo').disabled = false;
    } catch(err){ imRows = []; $('imPreview').hidden = true; $('imGo').disabled = true; toast(err && err.message ? err.message : 'Couldn’t read that file'); }
  });
  $('imGo').addEventListener('click', async () => {
    const rows = imRows.filter(r => $('imDone').checked || !r.done); if(!rows.length){ toast('Nothing to import'); return; }
    const group = $('imGroup').checked && !$('imGroup').closest('label').hidden, sid = $('imSpace').value || null, now = Date.now();
    const spaceByName = n => { const x = spaces.find(y => y.name.toLowerCase() === String(n).toLowerCase()); return x ? x.id : null; };
    const newId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const out = [], projIds = {};
    if(group) for(const name of [...new Set(rows.map(r => r.project).filter(Boolean))]){
      const mine = rows.filter(r => r.project === name), dl = mine.map(r => r.deadline).filter(Boolean).sort().pop() || null;
      const id = newId(); projIds[name] = id;
      out.push([id, {title: name, isProject: true, effort: 0, parentId: null, spaceId: spaceByName(mine[0].space) || sid, deadline: dl, importance: 3, urgency: 3, mode: 'normal', notes: '', client: mine[0].client || '',
        done: mine.every(r => r.done), doneAt: mine.every(r => r.done) ? now : null, sessions: [], attachments: [], fields: [], notify: {close: true, start: true, due: true, watchers: []}, createdAt: now, imported: true}]);
    }
    rows.forEach((r, i) => {
      const pid = group && r.project ? projIds[r.project] : null;
      out.push([newId(), {title: r.title, parentId: pid, spaceId: pid ? null : (spaceByName(r.space) || sid), deadline: r.deadline, importance: r.importance, urgency: 3, effort: r.effort, mode: 'normal',
        notes: r.notes + (!group && r.project ? (r.notes ? '\n\n' : '') + 'From: ' + r.project : ''), client: pid ? '' : r.client, done: r.done,
        doneAt: r.done ? (r.doneAt ? parseD(r.doneAt).getTime() + 12 * 3600e3 : now) : null, closeout: r.done ? {spent: r.effort, comment: 'Imported as completed', closedBy: me || null} : null,
        afterHours: !!r.ahAt, ahAt: r.ahAt || null,
        sessions: [], attachments: [], fields: [], assignees: me ? [me] : [], notify: {close: true, start: true, due: true, watchers: []}, createdAt: now + i, imported: true}]);
    });
    $('imGo').disabled = true; $('imGo').textContent = 'Importing…';
    try {
      if(store.apply){ for(const [id, d] of out){ store.apply('tasks', id, d); if(cloudMark) cloudMark('tasks', id, d); } store.flush(); }
      else for(const [id, d] of out) await store.save('tasks', id, d);
      for(const c of new Set(out.map(([, d]) => d.client).filter(Boolean))) await ensureClient(c);
      $('imScrim').hidden = true;
      const np = Object.keys(projIds).length;
      toast(`Imported ${rows.length} task${rows.length === 1 ? '' : 's'}` + (np ? ` in ${np} project${np === 1 ? '' : 's'}` : ''));
     
    } catch(e){ fail(e); }
    finally { $('imGo').disabled = false; $('imGo').textContent = 'Import'; }
  });

  /* ---------- search ---------- */
  const fold = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let qSel = 0, qItems = [];
  function openSearch(){ $('qScrim').hidden = false; $('qInput').value = ''; qSel = 0; runSearch(); setTimeout(() => $('qInput').focus(), 20); }
  function closeSearch(){ $('qScrim').hidden = true; }
  function hlText(el, text, words){
    const f = fold(text); let i = 0; const marks = [];
    for(const w of words){ let j = f.indexOf(w); while(j >= 0){ marks.push([j, j + w.length]); j = f.indexOf(w, j + w.length); } }
    marks.sort((a,b) => a[0] - b[0]);
    for(const [a, b] of marks){ if(a < i) continue; el.append(document.createTextNode(text.slice(i, a))); const m = document.createElement('mark'); m.textContent = text.slice(a, b); el.append(m); i = b; }
    el.append(document.createTextNode(text.slice(i)));
  }
  function runSearch(){
    const words = fold($('qInput').value).split(/\s+/).filter(Boolean), withDone = $('qDone').checked;
    const box = $('qResults'); box.textContent = ''; qItems = [];
    if(!words.length){ box.append(Object.assign(document.createElement('div'), {className: 'q-empty', textContent: 'Type to search names, notes, clients, projects, custom fields and file names.'})); return; }
    const hay = t => { const p = parentOf(t), sp = spaceOf(t);
      return fold([t.title, t.notes, eff(t).client, p && p.title, sp && sp.name, ...(t.fields || []).flatMap(f => [f.k, f.v]), ...(t.attachments || []).map(a => a.name), t.closeout && t.closeout.comment].filter(Boolean).join(' \n ')); };
    const hit = t => { const h = hay(t); return words.every(w => h.includes(w)); };
    const score = t => (words.every(w => fold(t.title).includes(w)) ? 0 : 1) + (t.done ? 2 : 0);
    const found = tasks.filter(t => inScope(spaceOf(t)) && (withDone || !t.done) && hit(t)).sort((a,b) => score(a) - score(b) || (calc(b).score - calc(a).score));
    const projs = found.filter(t => isProject(t)), tks = found.filter(t => !isProject(t));
    const recs = dailies.filter(d => words.every(w => fold([d.title, d.client].join(' ')).includes(w)));
    const group = (label, list, mk) => { if(!list.length) return; box.append(Object.assign(document.createElement('div'), {className: 'q-group', textContent: `${label} · ${list.length}`})); list.slice(0, 25).forEach(x => box.append(mk(x))); };
    const item = (title, meta, color, done, go) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'q-item' + (done ? ' done' : ''); b.setAttribute('role', 'option');
      const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = color || 'var(--line)';
      const mid = document.createElement('div'); mid.style.minWidth = '0';
      const t1 = document.createElement('div'); t1.className = 'qt'; hlText(t1, title, words);
      const t2 = document.createElement('div'); t2.className = 'qm'; t2.textContent = meta;
      mid.append(t1, t2); b.append(sw, mid);
      b.addEventListener('click', () => { closeSearch(); go(); });
      qItems.push(b); return b;
    };
    const metaOf = t => { const x = calc(t), p = parentOf(t), bits = [];
      if(t.done) bits.push('Done'); else if(x.late) bits.push('Late'); else if(x.days !== null) bits.push(x.days < 0 ? 'Overdue' : 'Due ' + fmt(parseD(x.e.deadline)));
      if(p) bits.push('in ' + p.title); if(x.e.client) bits.push(x.e.client); if(t.afterHours) bits.push('After hours');
      const inNotes = words.some(w => fold(t.notes).includes(w) && !fold(t.title).includes(w)); if(inNotes) bits.push('match in notes');
      return bits.join(' · '); };
    group('Projects', projs, t => item(t.title, metaOf(t), (spaceOf(t) || {}).color, t.done, () => openProject(t.id)));
    group('Tasks', tks, t => item(t.title, metaOf(t), (spaceOf(t) || {}).color, t.done, () => openDetails(t)));
    group('Recurring', recs, d => item(d.title, freqText(d), (spaceById(d.spaceId) || defaultSpace() || {}).color, false, () => openDaily(d)));
    const evs = events.filter(ev => inScope(spaceById(ev.spaceId) || defaultSpace()) && words.every(w => fold([ev.title, ev.where, ev.notes].join(' ')).includes(w))).sort((a, b) => evStart(a) - evStart(b));
    group('Calendar', evs, ev => item(ev.title, evStart(ev).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}) + (ev.allDay ? '' : ' · ' + fmtTime(evStart(ev))), (spaceById(ev.spaceId) || {}).color, false, () => { tab = 'calendar'; renderTabs(); calWeek0 = weekStart(evStart(ev)); renderCalendar(); openEvent(ev); }));
    if(!qItems.length) box.append(Object.assign(document.createElement('div'), {className: 'q-empty', textContent: withDone ? 'Nothing matches.' : 'Nothing open matches. Try “Include done”.'}));
    qSel = 0; markSel();
  }
  const markSel = () => qItems.forEach((b, i) => b.classList.toggle('sel', i === qSel));
  $('searchBtn').addEventListener('click', openSearch);
  $('qInput').addEventListener('input', runSearch); $('qDone').addEventListener('change', runSearch);
  $('qInput').addEventListener('keydown', e => {
    if(e.key === 'ArrowDown'){ e.preventDefault(); qSel = Math.min(qItems.length - 1, qSel + 1); markSel(); qItems[qSel] && qItems[qSel].scrollIntoView({block: 'nearest'}); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); qSel = Math.max(0, qSel - 1); markSel(); qItems[qSel] && qItems[qSel].scrollIntoView({block: 'nearest'}); }
    else if(e.key === 'Enter'){ e.preventDefault(); if(qItems[qSel]) qItems[qSel].click(); }
  });
  $('qScrim').addEventListener('click', e => { if(e.target === $('qScrim')) closeSearch(); });
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') || (document.activeElement || {}).isContentEditable;
    if(!typing && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) && $('lScrim').hidden){ e.preventDefault(); openSearch(); }
    else if(e.key === 'Escape' && !$('qScrim').hidden) closeSearch();
  });

  /* ---------- task from an email ----------
     Paste an email (desktop) or share it from the mail app to Kairo (Android,
     installed app). The subject becomes the task, the email goes to notes. */
  function emailToTask(subject, body){
    let title = String(subject || '').trim(), text = String(body || '').replace(/\r/g, '').trim();
    const sm = text.match(/^\s*(?:subject|asunto)\s*:\s*(.+)$/im);
    if(!title && sm) title = sm[1].trim();
    if(!title){ const first = text.split('\n').find(l => l.trim() && !/^\s*(from|de|to|para|cc|sent|enviado|date|fecha)\s*:/i.test(l)); title = (first || 'Email follow-up').trim(); }
    title = title.replace(/^\s*((re|fw|fwd|rv|tr)\s*:\s*)+/i, '').slice(0, 140);
    const from = (text.match(/^\s*(?:from|de)\s*:\s*(.+)$/im) || [])[1];
    openForm(null);
    $('fTitle').value = title;
    $('fNotes').value = (from && !/^\s*(from|de)\s*:/im.test(text) ? 'From: ' + from.trim() + '\n\n' : '') + text.slice(0, 1900);
    $('fMore').open = true; updatePreview();
    toast('Check the deadline and effort, then save');
  }
  $('addEmailMenu').addEventListener('click', () => { $('emText').value = ''; $('emScrim').hidden = false; setTimeout(() => $('emText').focus(), 30); });
  $('emCancel').addEventListener('click', () => { $('emScrim').hidden = true; });
  $('emScrim').addEventListener('click', e => { if(e.target === $('emScrim')) $('emScrim').hidden = true; });
  $('emForm').addEventListener('submit', e => { e.preventDefault(); const v = $('emText').value; if(!v.trim()){ toast('Paste an email first'); return; } $('emScrim').hidden = true; emailToTask('', v); });
  // shared from another app (Android share sheet → Kairo)
  let sharedIn = null;
  { const q = new URLSearchParams(location.search);
    if(q.has('share_title') || q.has('share_text') || q.has('share_url')){
      sharedIn = {title: q.get('share_title') || '', text: [q.get('share_text'), q.get('share_url')].filter(Boolean).join('\n\n')};
      history.replaceState(null, '', location.pathname);
    } }
  function takeShared(){ if(!sharedIn || !dataReady || !$('lScrim').hidden) return; const s2 = sharedIn; sharedIn = null; emailToTask(s2.title, s2.text); }

  /* ---------- natural-language event parser (Spanish + English) ----------
     "Apúntame un meeting a las 8am y recuérdame 30 y 15 minutos antes"
     → {title: 'Meeting', start: <8:00>, end: <9:00>, reminders: [30, 15]} */
  function parseEventText(input, now = new Date()){
    const deacc = v => v.normalize('NFD').replace(/[̀-ͯ]/g, '');
    let s = ' ' + deacc(String(input || '')).toLowerCase().replace(/[.,;!?¿¡]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    const orig = ' ' + String(input || '').replace(/\s+/g, ' ') + ' ';
    const cut = re => { const m = s.match(re); if(m) s = s.replace(re, ' '); return m; };
    const NUM = {un: 1, una: 1, uno: 1, one: 1, a: 1, an: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6, siete: 7, seven: 7,
      ocho: 8, eight: 8, nueve: 9, nine: 9, diez: 10, ten: 10, once: 11, eleven: 11, doce: 12, twelve: 12, quince: 15, fifteen: 15, veinte: 20, twenty: 20, treinta: 30, thirty: 30,
      cuarenta: 40, forty: 40, 'cuarenta y cinco': 45, 'forty five': 45, media: 0.5, half: 0.5};
    const num = w => w == null ? null : /^\d+([.,]\d+)?$/.test(w) ? Number(w.replace(',', '.')) : (NUM[w] ?? null);
    const NW = '(\\d+(?:[.,]\\d+)?|un|una|uno|one|an?|dos|two|tres|three|cuatro|four|cinco|five|seis|six|siete|seven|ocho|eight|nueve|nine|diez|ten|once|eleven|doce|twelve|quince|fifteen|veinte|twenty|treinta|thirty|cuarenta(?: y cinco)?|forty(?: five)?|media|half)';
    const UNIT = '(minutos?|mins?|m|horas?|hrs?|h|hours?|minutes?|dias?|days?)';
    const toMin = (n, u) => /^(h|hr|hrs|hora|horas|hour|hours)$/.test(u) ? n * 60 : /^(dia|dias|day|days)$/.test(u) ? n * 1440 : n;

    // 1. reminders: "recuérdame 30 y 15 minutos antes", "avísame una hora antes", "remind me 30 and 10 min before"
    const reminders = [];
    const remRe = new RegExp(`(?:y\\s+|and\\s+)?(?:recuerdame|recordarme|recordatorio|avisame|avisar|alerta(?:me)?|notificame|remind(?:er)?(?: me)?|alert(?: me)?|notify(?: me)?)\\s*((?:(?:con|de|at|with)\\s+)?(?:${NW}(?:\\s*${UNIT})?(?:\\s*(?:,|y|e|and|&)\\s*)?)+)\\s*(?:antes|before|prior)?`, 'i');
    let rm = s.match(remRe);
    if(rm){
      s = s.replace(rm[0], ' ');
      const part = rm[1];
      const re = new RegExp(`${NW}(?:\\s*${UNIT})?`, 'gi'); let m; const vals = [];
      while((m = re.exec(part))) vals.push([num(m[1]), m[2] || null]);
      const lastUnit = [...vals].reverse().find(v => v[1]);
      for(const [n, u] of vals) if(n != null) reminders.push(Math.round(toMin(n === 0.5 && !u ? 30 : n, u || (lastUnit ? lastUnit[1] : 'm'))));
      if(!reminders.length) reminders.push(15);
    } else if(/\s(recuerdame|avisame|remind me)\s/.test(s)){ s = s.replace(/\s(recuerdame|avisame|remind me)\s/, ' '); reminders.push(15); }

    // 2. duration: "por 2 horas", "de una hora", "for 30 minutes", "durante media hora"
    let durMin = null;
    const dm = cut(new RegExp(`\\s(?:por|durante|de|for|lasting)\\s+${NW}\\s*(?:y media\\s+)?${UNIT}(?:\\s+y media)?\\s`, 'i'));
    if(dm){ durMin = toMin(num(dm[1]), dm[2]); if(/y media/.test(dm[0])) durMin += 30; }
    else { const mh = cut(/\s(?:por|durante|for)\s+(?:media hora|half an hour)\s/); if(mh) durMin = 30; }

    // 3. time: "a las 8am", "8:30 pm", "a las 3 de la tarde", "al mediodia", "noon", "de 8 a 9", "from 2 to 3:30"
    const ampm = (h, mer, hint) => {
      if(mer){ mer = mer.replace(/\s|\./g, ''); if(/^p/.test(mer) && h < 12) h += 12; if(/^a/.test(mer) && h === 12) h = 0; return h; }
      if(hint === 'pm' && h < 12) return h + 12; if(hint === 'am') return h === 12 ? 0 : h;
      return h >= 1 && h <= 6 ? h + 12 : h;   // "a las 3" during the workday means 3 PM
    };
    const partHint = t => /de la (tarde|noche)|in the (afternoon|evening)|at night|tonight|esta noche/.test(t) ? 'pm' : /de la manana|in the morning|de madrugada/.test(t) ? 'am' : null;
    const hint = partHint(s);
    s = s.replace(/\s(de la (tarde|noche|manana)|de madrugada|in the (morning|afternoon|evening)|at night)\s/g, ' ');
    let sh = null, smin = 0, eh = null, emin = 0;
    const T = '(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|am|pm)?';
    let tm = cut(new RegExp(`\\s(?:de|from|entre|between)\\s+(?:las\\s+)?${T}\\s+(?:a|to|-|hasta|y|and)\\s+(?:las\\s+)?${T}(?=\\s)`, 'i'));
    if(tm){ sh = ampm(+tm[1], tm[3] || tm[6], hint); smin = +(tm[2] || 0); eh = ampm(+tm[4], tm[6] || tm[3], hint); emin = +(tm[5] || 0); if(eh < sh) eh += 12; }
    else if((tm = cut(/\s(?:al |at )?(mediodia|noon|medianoche|midnight)\s/))){ sh = /medio|noon/.test(tm[1]) ? 12 : 0; }
    else if((tm = cut(new RegExp(`\\s(?:a\\s+las?|a\\s+la|at|@|alas)\\s+${T}(?:\\s+(y media|y cuarto|menos cuarto))?(?=\\s)`, 'i')) || cut(new RegExp(`\\s(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|am|pm)(?=\\s)`, 'i')) || cut(/\s(\d{1,2}):(\d{2})(?=\s)()/))){
      sh = ampm(+tm[1], tm[3], hint); smin = +(tm[2] || 0);
      if(tm[4] === 'y media') smin = 30; else if(tm[4] === 'y cuarto') smin = 15; else if(tm[4] === 'menos cuarto'){ sh -= 1; smin = 45; }
    }
    const untilM = cut(new RegExp(`\\s(?:hasta|until|till|to)\\s+(?:las\\s+)?${T}(?=\\s)`, 'i'));
    if(untilM && sh !== null){ eh = ampm(+untilM[1], untilM[3], hint || (sh >= 12 ? 'pm' : null)); emin = +(untilM[2] || 0); if(eh < sh) eh += 12; }

    // 4. date
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const addD = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
    let date = null, explicitDate = false;
    const DAYS = {domingo: 0, sunday: 0, lunes: 1, monday: 1, martes: 2, tuesday: 2, miercoles: 3, wednesday: 3, jueves: 4, thursday: 4, viernes: 5, friday: 5, sabado: 6, saturday: 6};
    const MONTHS = {enero: 0, ene: 0, january: 0, jan: 0, febrero: 1, feb: 1, february: 1, marzo: 2, mar: 2, march: 2, abril: 3, abr: 3, april: 3, apr: 3, mayo: 4, may: 4, junio: 5, jun: 5, june: 5,
      julio: 6, jul: 6, july: 6, agosto: 7, ago: 7, august: 7, aug: 7, septiembre: 8, setiembre: 8, sep: 8, sept: 8, september: 8, octubre: 9, oct: 9, october: 9, noviembre: 10, nov: 10, november: 10, diciembre: 11, dic: 11, december: 11, dec: 11};
    const MN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
    let dmatch;
    if((dmatch = cut(/\s(pasado manana|day after tomorrow)\s/))) date = addD(2);
    else if((dmatch = cut(/\s(manana|tomorrow)\s/))) date = addD(1);
    else if((dmatch = cut(/\s(hoy|today|tonight|esta noche|esta tarde|this (?:afternoon|evening))\s/))) date = addD(0);
    else if((dmatch = cut(new RegExp(`\\s(?:en|in)\\s+${NW}\\s+(dias?|days?|semanas?|weeks?)\\s`)))) date = addD(num(dmatch[1]) * (/sem|week/.test(dmatch[2]) ? 7 : 1));
    else if((dmatch = cut(/\s(la semana que viene|la proxima semana|next week)\s/))) date = addD(((8 - today.getDay()) % 7) || 7);
    else if((dmatch = cut(new RegExp(`\\s(?:el\\s+|this\\s+|on\\s+|este\\s+|next\\s+|el proximo\\s+|proximo\\s+)?(${Object.keys(DAYS).join('|')})(\\s+que viene|\\s+proximo)?\\s`)))){
      const want = DAYS[dmatch[1]], nextW = /next|proximo|que viene/.test(dmatch[0]);
      let d = (want - today.getDay() + 7) % 7; if(d === 0) d = 7; date = addD(d);
    }
    else if((dmatch = cut(new RegExp(`\\s(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${MN})(?:\\s+(?:de\\s+)?(\\d{4}))?\\s`))) || (dmatch = cut(new RegExp(`\\s(?:on\\s+)?(${MN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\s`)))){
      const isMonthFirst = isNaN(Number(dmatch[1]));
      const day = +(isMonthFirst ? dmatch[2] : dmatch[1]), mon = MONTHS[isMonthFirst ? dmatch[1] : dmatch[2]];
      let y = dmatch[3] ? +dmatch[3] : today.getFullYear();
      date = new Date(y, mon, day); if(!dmatch[3] && date < today) date = new Date(y + 1, mon, day);
    }
    else if((dmatch = cut(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/))){
      let y = dmatch[3] ? (+dmatch[3] < 100 ? 2000 + +dmatch[3] : +dmatch[3]) : today.getFullYear();
      date = new Date(y, +dmatch[1] - 1, +dmatch[2]); if(!dmatch[3] && date < today) date.setFullYear(y + 1);
    }
    else if((dmatch = cut(/\s(?:el|the|on the)\s+(\d{1,2})(?:st|nd|rd|th)?\s/))){
      date = new Date(today.getFullYear(), today.getMonth(), +dmatch[1]); if(date < today) date = new Date(today.getFullYear(), today.getMonth() + 1, +dmatch[1]);
    }
    explicitDate = !!date;

    // 5. assemble
    const allDay = sh === null;
    if(!date){ date = addD(0); if(!allDay){ const t = new Date(date); t.setHours(sh, smin); if(t <= now) date = addD(1); } }
    const start = new Date(date); if(!allDay) start.setHours(sh, smin, 0, 0);
    let end;
    if(allDay) end = new Date(start);
    else if(eh !== null){ end = new Date(date); end.setHours(eh, emin, 0, 0); if(end <= start) end = new Date(start.getTime() + 3600e3); }
    else end = new Date(start.getTime() + (durMin || 60) * 60e3);

    // 6. title: what's left after taking out commands and fillers
    s = s.replace(/\s(apuntame|apunta|anotame|anota|agendame|agenda|agendar|ponme|pon|crea(?:me)?|crear|anade|anadir|programa(?:me)?|separame|bloqueame|bloquea|add|schedule|set up|set|book|create|put|make|new)\s/g, ' ')
         .replace(/^\s*(?:me|a|para|for|un|una|an?|the|el|la)\s+/, ' ').replace(/\s(?:y|and|para|for|a|el|la)\s*$/, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(?:un|una|a|an|el|la|the)\s+/, '').replace(/\s+(?:y|and|a|para|for|de|el|la)$/, '').trim();
    // keep the user's own casing for the words that survived
    let title = s;
    if(title){
      const words = title.split(' '), ow = deacc(orig).split(/\s+/);
      title = words.map(w => { const i = ow.findIndex(x => deacc(x).toLowerCase().replace(/[.,;!?¿¡]/g, '') === w); return i >= 0 ? orig.split(/\s+/)[i].replace(/[.,;!?¿¡]/g, '') : w; }).join(' ');
    }
    title = title || 'Event';
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return {title, start, end, allDay, reminders: [...new Set(reminders)].sort((a, b) => b - a), explicitDate, hasTime: !allDay};
  }

  /* ---------- calendar ---------- */
  const REM_OPTS = [[5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [120, '2 hours'], [1440, '1 day']];
  const toLocalISO = d => `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const evStart = ev => ev.allDay ? parseD(ev.start.slice(0, 10)) : new Date(ev.start);
  const evEnd = ev => ev.end ? (ev.allDay ? parseD(ev.end.slice(0, 10)) : new Date(ev.end)) : new Date(evStart(ev).getTime() + 3600e3);
  const fmtTime = d => d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  const remTxt = r => r >= 1440 && r % 1440 === 0 ? `${r / 1440} day${r === 1440 ? '' : 's'}` : r >= 60 && r % 60 === 0 ? `${r / 60} hour${r === 60 ? '' : 's'}` : r >= 60 ? `${Math.floor(r / 60)}h ${r % 60}m` : `${r} min`;
  let calWeek0 = null, calDraft = null;
  const weekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  function renderCalendar(){
    if(!calWeek0) calWeek0 = weekStart(new Date());
    const end = new Date(calWeek0); end.setDate(end.getDate() + 6);
    $('calRange').textContent = `${calWeek0.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} – ${end.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}`;
    const box = $('calWeek'); box.textContent = '';
    const t0 = today0().getTime();
    // phones: a date strip that jumps to a day in the list below
    let strip = $('calStrip');
    if(!strip){ strip = document.createElement('div'); strip.id = 'calStrip'; strip.className = 'cal-strip'; strip.setAttribute('aria-label', 'Days this week'); box.before(strip); }
    strip.textContent = '';
    for(let i = 0; i < 7; i++){
      const d = new Date(calWeek0); d.setDate(d.getDate() + i); const key = dayKey(d);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cs-day' + (d.getTime() === t0 ? ' on' : d.getTime() < t0 ? ' past' : '');
      if(d.getTime() === t0) b.setAttribute('aria-current', 'date');
      b.setAttribute('aria-label', d.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'}));
      b.append(span(d.toLocaleDateString('en-US', {weekday: 'short'})), Object.assign(document.createElement('b'), {textContent: d.getDate()}));
      b.addEventListener('click', () => { strip.querySelectorAll('.cs-day').forEach(x => x.classList.toggle('sel', x === b));
        const col = box.querySelector(`.cal-day[data-day="${key}"]`); if(col){ col.classList.remove('past-hidden'); col.style.display = 'flex';
          col.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'}); } });
      strip.append(b);
    }
    for(let i = 0; i < 7; i++){
      const d = new Date(calWeek0); d.setDate(d.getDate() + i); const key = dayKey(d);
      const col = document.createElement('div'); col.className = 'cal-day' + (d.getTime() === t0 ? ' today' : d.getTime() < t0 ? ' past' : ''); col.dataset.day = key;
      const h = document.createElement('h3'); h.append(span(d.toLocaleDateString('en-US', {weekday: 'short'})), Object.assign(document.createElement('b'), {textContent: d.getDate()})); col.append(h);
      const items = [];
      for(const ev of events.filter(e => spaceOk({spaceId: e.spaceId}) && e.start && e.start.slice(0, 10) <= key && (e.end || e.start).slice(0, 10) >= key))
        items.push({at: ev.allDay ? -1 : (ev.start.slice(0, 10) === key ? toH(ev.start.slice(11, 16)) : 0), node: calItem(ev)});
      // work time on this day, per task, so a deadline on the same day joins its work block
      const o = Math.round((d.getTime() - t0) / DAY), workOn = new Map();
      if(o >= 0) for(const [id, r] of S.res){ if(r.emergency) continue; const ch = r.chunks.filter(c => c[0] === o); if(ch.length) workOn.set(id, ch); }
      const dueWith = new Map();
      for(const t of tasks.filter(t => isOpen(t) && vis(t))){
        if(t.afterHours){ const w = ahWhen(t); if(w && dayKey(w) === key) items.push({at: w.getHours() + w.getMinutes() / 60, node: calTaskItem(t, 'After hours · ' + fmtTime(w), 'ah')}); }
        else if(eff(t).deadline === key && !t.parentId || (t.parentId && t.deadline === key)){
          const lbl = isPayment(t) ? 'Bill due · ' + money(t.amount) : isProject(t) ? 'Project due' : 'Due';
          if(workOn.has(t.id)) dueWith.set(t.id, lbl); else items.push({at: -0.5, node: calTaskItem(t, lbl, 'due')});
        }
      }
      // work time: the hours planned on this day (chosen by you, or placed by Kairo)
      if(o >= 0){
        for(const [id, ch] of workOn){ const t = byId(id); if(!t || !vis(t)) continue; ch.forEach((c, n) => items.push(calWorkItem(t, c, key, false, n === 0 ? dueWith.get(id) : null))); }
        for(const [id, days] of S.steady){ const t = byId(id); if(!t || !vis(t)) continue; for(const c of days) if(c[0] === o) items.push(calWorkItem(t, c, key, true)); }
      }
      items.sort((a, b) => a.at - b.at).forEach(x => col.append(x.node));
      if(!items.length) col.append(span('Nothing', 'cal-empty'));
      col.addEventListener('dblclick', e => { if(e.target === col || e.target.classList.contains('cal-empty')) openEvent(null, {start: key + 'T09:00'}); });
      box.append(col);
    }
    renderNotifState();
  }
  function calItem(ev){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cal-item';
    const sp = spaceById(ev.spaceId); if(sp) b.style.borderLeftColor = sp.color;
    b.append(span(ev.allDay ? 'All day' : `${fmtTime(evStart(ev))} – ${fmtTime(evEnd(ev))}`, 'ct'), span(ev.title, 'cn'));
    if((ev.reminders || []).length) b.append(span('Reminders: ' + ev.reminders.map(remTxt).join(', ') + ' before', 'cr'));
    if(ev.where) b.append(span(ev.where, 'cr'));
    b.addEventListener('click', () => openEvent(ev));
    calDraggable(b, {event: ev});
    return b;
  }
  const FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>';
  const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  function calWorkItem(t, c, key, steady, due){
    const w = c[3] === 'pin' ? (t.workTimes || [])[c[4]] : null, sp = spaceOf(t);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cal-item work ' + (w ? 'mine' : 'auto');
    b.style.setProperty('--wc', (sp && sp.color) || 'var(--mid)');
    const where = c[2] === 'work' ? '' : c[2] === 'eve' ? 'Evening · ' : ((spaceById(String(c[2]).slice(3)) || {}).name || '') + ' time · ';
    const lab = span(w ? `Your time · ${w.time ? fmtClock(toH(w.time)) + ' · ' : ''}${fmtH(c[1])}` : `${where}${steady ? 'Session' : 'Work'} · ${fmtH(c[1])}`, 'ct');
    if(w) lab.insertAdjacentHTML('afterbegin', PIN);
    if(due){ b.classList.add('has-due'); const dt = span(due, 'cal-due-tag'); dt.insertAdjacentHTML('afterbegin', FLAG); b.append(Object.assign(document.createElement('div'), {className: 'cal-row'})); b.lastChild.append(lab, dt); }
    else b.append(lab);
    b.append(span(t.title, 'cn'));
    if(due) b.append(span('Work on it and it’s due the same day', 'cr'));
    b.title = w ? 'Work time you chose. Drag to another day to move it.' : 'Work time Kairo planned. Drag it to another day to choose when you’ll do it.';
    b.addEventListener('click', () => openDetails(t));
    if(!steady) calDraggable(b, {work: {t, pin: w ? c[4] : null, hours: c[1]}});
    return {at: due ? -0.5 : w ? (w.time ? toH(w.time) : 23.5) : 23.9, node: b};
  }
  function calTaskItem(t, label, cls){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cal-item task ' + cls;
    const lab = span(label, 'ct'); if(cls === 'due') lab.insertAdjacentHTML('afterbegin', FLAG);
    b.append(lab, span(t.title, 'cn')); b.addEventListener('click', () => openDetails(t));
    if(!t.done) calDraggable(b, {task: t});
    return b;
  }
  /* Drag to another day: mouse drags right away; touch needs a press-and-hold first so scrolling still works. */
  let calDrag = null, calDragEnd = 0;
  function calDraggable(el, item){
    el.classList.add('draggable');
    el.addEventListener('pointerdown', e => {
      if(e.button !== 0) return;
      const st = {el, item, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', on: false, from: (el.closest('.cal-day') || {dataset: {}}).dataset.day};
      calDrag = st;
      if(st.touch) st.timer = setTimeout(() => { if(calDrag === st) calDragStart(st, st.x, st.y); }, 380);
    });
  }
  function calDragStart(st, x, y){
    st.on = true; const r = st.el.getBoundingClientRect(); st.dx = x - r.left; st.dy = y - r.top;
    const g = st.el.cloneNode(true); g.classList.add('cal-ghost'); g.style.width = r.width + 'px'; document.body.append(g); st.ghost = g;
    st.el.classList.add('dragging'); document.body.classList.add('cal-dragging');
    if(st.touch && navigator.vibrate) try { navigator.vibrate(12); } catch {}
    st.scroll = setInterval(() => { const yy = st.ly ?? y; if(yy < 70) window.scrollBy(0, -14); else if(yy > innerHeight - 70) window.scrollBy(0, 14); else return; calDragMove(st, st.lx ?? x, yy); }, 30);
    calDragMove(st, x, y);
  }
  function calDragMove(st, x, y){
    st.lx = x; st.ly = y; st.ghost.style.transform = `translate(${x - st.dx}px, ${y - st.dy}px)`;
    const col = (document.elementFromPoint(x, y) || {closest: () => null}).closest('.cal-day');
    document.querySelectorAll('.cal-day.drop').forEach(c => { if(c !== col) c.classList.remove('drop'); });
    if(col && col.dataset.day !== st.from) col.classList.add('drop');
    st.over = col ? col.dataset.day : null;
  }
  function calDragStop(st){
    clearTimeout(st.timer); clearInterval(st.scroll); if(calDrag === st) calDrag = null;
    if(!st.on) return false;
    st.ghost.remove(); st.el.classList.remove('dragging'); document.body.classList.remove('cal-dragging');
    document.querySelectorAll('.cal-day.drop').forEach(c => c.classList.remove('drop')); calDragEnd = Date.now(); return true;
  }
  document.addEventListener('pointermove', e => {
    const st = calDrag; if(!st || e.pointerId !== st.id) return;
    if(!st.on){ const dist = Math.hypot(e.clientX - st.x, e.clientY - st.y); if(st.touch){ if(dist > 10) calDragStop(st); return; } if(dist < 6) return; calDragStart(st, e.clientX, e.clientY); }
    calDragMove(st, e.clientX, e.clientY);
  });
  document.addEventListener('touchmove', e => { if(calDrag && calDrag.on) e.preventDefault(); }, {passive: false});
  document.addEventListener('pointerup', e => { const st = calDrag; if(!st || e.pointerId !== st.id) return; if(calDragStop(st) && st.over && st.over !== st.from) calDrop(st.item, st.from, st.over); });
  document.addEventListener('pointercancel', e => { const st = calDrag; if(st && e.pointerId === st.id) calDragStop(st); });
  document.addEventListener('click', e => { if(Date.now() - calDragEnd < 400 && e.target.closest('.cal-item')){ e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('contextmenu', e => { if(calDrag && e.target.closest('.cal-item.draggable')) e.preventDefault(); });
  const shiftLocal = (v, days) => { if(!v) return v; if(v.length <= 10){ const a = parseD(v); a.setDate(a.getDate() + days); return dayKey(a); } const a = new Date(v); a.setDate(a.getDate() + days); return toLocalISO(a); };
  async function calDrop(item, from, to){
    const days = Math.round((parseD(to) - parseD(from)) / DAY); if(!days) return;
    const when = fmt(parseD(to));
    try {
      if(item.work){
        const {t, pin, hours} = item.work;
        if(to < dayKey()){ toast('Pick today or a later day'); return; }
        const before = {...t}; delete before.id;
        const wt = (t.workTimes || []).map(w => ({...w}));
        if(pin !== null && wt[pin]) wt[pin].date = to; else wt.push({date: to, time: '', hours: Math.max(0.25, Math.round(hours * 4) / 4)});
        await store.save('tasks', t.id, {...before, workTimes: wt});
        const dl = eff(t).deadline;
        toast(`Work on it ${when}` + (dl && to > dl ? ' · that’s after the deadline' : ''), () => store.save('tasks', t.id, before).catch(fail));
      } else if(item.event){
        const ev = item.event, before = {...ev}; delete before.id;
        await store.save('events', ev.id, {...before, start: shiftLocal(ev.start, days), end: shiftLocal(ev.end, days)});
        toast(`${ev.title} → ${when}`, () => store.save('events', ev.id, before).catch(fail));
      } else {
        const t = item.task, before = {...t}; delete before.id;
        const par = t.parentId ? byId(t.parentId) : null;
        if(!t.afterHours && par && par.deadline && to > par.deadline){ toast(`That’s after the project’s deadline (${fmt(parseD(par.deadline))})`); return; }
        const data = {...before};
        if(t.afterHours) data.ahAt = shiftLocal(t.ahAt || (eff(t).deadline + 'T22:00'), days); else data.deadline = to;
        if(data.repeat && data.repeat.day && !t.afterHours) data.repeat = {...data.repeat, day: parseD(to).getDate()};
        await store.save('tasks', t.id, data);
        toast(`${t.afterHours ? '' : 'Due '}${when} · ${t.title}`, () => store.save('tasks', t.id, before).catch(fail));
      }
      renderCalendar();
    } catch(e){ fail(e); }
  }
  $('calPrev').addEventListener('click', () => { calWeek0.setDate(calWeek0.getDate() - 7); renderCalendar(); });
  $('calNext').addEventListener('click', () => { calWeek0.setDate(calWeek0.getDate() + 7); renderCalendar(); });
  $('calToday').addEventListener('click', () => { calWeek0 = weekStart(new Date()); renderCalendar(); });
  $('calNew').addEventListener('click', () => openEvent(null, {}));
  $('addEventMenu').addEventListener('click', () => { tab = 'calendar'; try { localStorage.setItem('pr-tab', tab); } catch {} renderTabs(); renderCalendar(); setTimeout(() => $('calText').focus(), 30); });

  // quick add: type or speak, preview, then add
  function draftFromText(txt){
    const r = parseEventText(txt);
    const sp = defaultSpace();
    return {title: r.title, allDay: r.allDay, start: r.allDay ? dayKey(r.start) : toLocalISO(r.start), end: r.allDay ? dayKey(r.end) : toLocalISO(r.end), reminders: r.reminders, where: '', notes: '', spaceId: spaceFilter !== 'all' && spaceById(spaceFilter) ? spaceFilter : (sp ? sp.id : scopeSp() ? scopeSp().id : null), said: txt};
  }
  function renderPreview(){
    const v = $('calText').value.trim(), box = $('calPreview'); box.textContent = '';
    if(!v){ box.hidden = true; calDraft = null; return; }
    calDraft = draftFromText(v); const ev = calDraft;
    const when = evStart(ev).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}) + (ev.allDay ? ' · all day' : ` · ${fmtTime(evStart(ev))} – ${fmtTime(evEnd(ev))}`);
    box.append(Object.assign(document.createElement('b'), {textContent: ev.title}), span(when, 'pv-when'),
      span(ev.reminders.length ? 'Reminders ' + ev.reminders.map(remTxt).join(' and ') + ' before' : 'No reminders', 'fnote'));
    const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'linkbtn'; ed.textContent = 'Edit details';
    ed.addEventListener('click', () => openEvent(null, calDraft)); box.append(ed);
    box.hidden = false;
  }
  let pvT; $('calText').addEventListener('input', () => { clearTimeout(pvT); pvT = setTimeout(renderPreview, 150); });
  $('calForm').addEventListener('submit', async e => {
    e.preventDefault(); renderPreview(); if(!calDraft){ $('calText').focus(); return; }
    const d = {...calDraft, createdAt: Date.now()}; delete d.said;
    await saveEvent(null, d);
    $('calText').value = ''; renderPreview();
  });
  async function saveEvent(id, d){
    const nid = id || ('e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    try {
      await store.save('events', nid, d);
      calWeek0 = weekStart(evStart(d)); renderCalendar();
      toast(`${id ? 'Saved' : 'Added'}: ${d.title} · ${evStart(d).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}${d.allDay ? '' : ' ' + fmtTime(evStart(d))}`);
      if((d.reminders || []).length && 'Notification' in window && Notification.permission === 'default') $('calNotifBtn').hidden = false;
    } catch(err){ fail(err); }
  }

  // voice: the browser's speech recognition (Chrome, Edge, Android, iPhone Safari)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  try { $('calLang').value = localStorage.getItem('pr-voice') || ((navigator.language || '').startsWith('es') ? 'es-PR' : 'en-US'); } catch {}
  $('calLang').addEventListener('change', () => { try { localStorage.setItem('pr-voice', $('calLang').value); } catch {} });
  if(!SR){ $('calMic').hidden = true; $('calLang').hidden = true; }
  $('calMic').addEventListener('click', () => {
    if(rec){ rec.stop(); return; }
    rec = new SR(); rec.lang = $('calLang').value; rec.interimResults = true; rec.continuous = false;
    const before = $('calText').value;
    rec.onresult = e => { let t = ''; for(const r of e.results) t += r[0].transcript; $('calText').value = (before ? before + ' ' : '') + t; renderPreview(); };
    rec.onerror = e => { toast(e.error === 'not-allowed' ? 'Allow the microphone to speak events' : 'Didn’t catch that. Try again.'); };
    rec.onend = () => { $('calMic').classList.remove('on'); $('calMic').setAttribute('aria-label', 'Speak the event'); rec = null; renderPreview(); };
    $('calMic').classList.add('on'); $('calMic').setAttribute('aria-label', 'Stop listening');
    try { rec.start(); } catch { rec = null; $('calMic').classList.remove('on'); }
  });

  // event sheet
  let evEditing = null;
  for(const [m, l] of REM_OPTS){ const lab = document.createElement('label'); const c = document.createElement('input'); c.type = 'checkbox'; c.value = m; lab.append(c, document.createTextNode(' ' + l)); $('evRem').append(lab); }
  function openEvent(ev, draft){
    evEditing = ev ? ev.id : null; const d = ev || draft || {};
    $('evHead').textContent = ev ? 'Edit event' : 'New event';
    $('evTitle').value = d.title || '';
    $('evAllDay').checked = !!d.allDay;
    const st = d.start ? (d.allDay ? parseD(d.start.slice(0, 10)) : new Date(d.start)) : (() => { const x = new Date(); x.setMinutes(0, 0, 0); x.setHours(x.getHours() + 1); return x; })();
    const en = d.end && !d.allDay ? new Date(d.end) : new Date(st.getTime() + 3600e3);
    $('evDate').value = dayKey(st); $('evStart').value = toHM(st.getHours() + st.getMinutes() / 60); $('evEnd').value = toHM(en.getHours() + en.getMinutes() / 60);
    $('evTimes').hidden = $('evAllDay').checked;
    const rs = d.reminders || (ev ? [] : [15]);
    $('evRem').querySelectorAll('input').forEach(c => { c.checked = rs.includes(Number(c.value)); });
    for(const r of rs) if(!REM_OPTS.some(o => o[0] === r)){ const lab = document.createElement('label'); const c = document.createElement('input'); c.type = 'checkbox'; c.value = r; c.checked = true; lab.append(c, document.createTextNode(' ' + remTxt(r))); $('evRem').append(lab); }
    $('evWhere').value = d.where || ''; $('evNotes').value = d.notes || '';
    fillSpaceSelect($('evSpace'), d.spaceId || '');
    $('evDel').hidden = !ev; $('evExport').hidden = !ev;
    $('evScrim').hidden = false; setTimeout(() => $('evTitle').focus(), 30);
  }
  const closeEvent = () => { $('evScrim').hidden = true; evEditing = null; };
  $('evAllDay').addEventListener('change', () => { $('evTimes').hidden = $('evAllDay').checked; });
  $('evCancel').addEventListener('click', closeEvent);
  $('evScrim').addEventListener('click', e => { if(e.target === $('evScrim')) closeEvent(); });
  function readEvent(){
    const allDay = $('evAllDay').checked, day = $('evDate').value;
    let st = day + 'T' + ($('evStart').value || '09:00'), en = day + 'T' + ($('evEnd').value || '10:00');
    if(!allDay && en <= st){ const x = new Date(st); x.setHours(x.getHours() + 1); en = toLocalISO(x); }
    const base = evEditing ? events.find(e => e.id === evEditing) || {} : {};
    return {...base, title: $('evTitle').value.trim() || 'Event', allDay, start: allDay ? day : st, end: allDay ? day : en,
      reminders: [...$('evRem').querySelectorAll('input:checked')].map(c => Number(c.value)).sort((a, b) => b - a),
      where: $('evWhere').value.trim(), notes: $('evNotes').value.trim(), spaceId: $('evSpace').value || null, createdAt: base.createdAt || Date.now()};
  }
  $('evForm').addEventListener('submit', async e => {
    e.preventDefault(); if(!$('evDate').value) return;
    const d = readEvent(), id = evEditing; delete d.id; closeEvent();
    if(!id){ $('calText').value = ''; renderPreview(); }
    await saveEvent(id, d);
  });
  $('evDel').addEventListener('click', async () => { const id = evEditing; closeEvent(); try { await store.remove('events', id); toast('Event deleted'); renderCalendar(); } catch(err){ fail(err); } });

  // send it to Google / Outlook, or as an .ics file with its reminders
  const icsDate = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = v => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  function evDates(ev){
    if(ev.allDay){ const a = parseD(ev.start.slice(0, 10)), b = parseD((ev.end || ev.start).slice(0, 10)); b.setDate(b.getDate() + 1); const k = x => dayKey(x).replace(/-/g, ''); return {g: `${k(a)}/${k(b)}`, a, b, k}; }
    return {g: `${icsDate(evStart(ev))}/${icsDate(evEnd(ev))}`};
  }
  $('evGoogle').addEventListener('click', () => {
    const ev = readEvent(), q = new URLSearchParams({action: 'TEMPLATE', text: ev.title, dates: evDates(ev).g, details: ev.notes || '', location: ev.where || ''});
    window.open('https://calendar.google.com/calendar/render?' + q.toString(), '_blank', 'noopener');
  });
  $('evOutlook').addEventListener('click', () => {
    const ev = readEvent(), a = evStart(ev), b = evEnd(ev);
    const q = new URLSearchParams({path: '/calendar/action/compose', rru: 'addevent', subject: ev.title, startdt: ev.allDay ? dayKey(a) : a.toISOString(), enddt: ev.allDay ? dayKey(b) : b.toISOString(), allday: ev.allDay ? 'true' : 'false', body: ev.notes || '', location: ev.where || ''});
    window.open('https://outlook.office.com/calendar/0/deeplink/compose?' + q.toString(), '_blank', 'noopener');
  });
  $('evIcs').addEventListener('click', async () => {
    const ev = readEvent(), id = evEditing || 'new', dd = evDates(ev);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + APP_NAME + '//Planner//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${id}@${APP_NAME.toLowerCase()}.app`, `DTSTAMP:${icsDate(new Date())}`,
      ...(ev.allDay ? [`DTSTART;VALUE=DATE:${dd.k(dd.a)}`, `DTEND;VALUE=DATE:${dd.k(dd.b)}`] : [`DTSTART:${icsDate(evStart(ev))}`, `DTEND:${icsDate(evEnd(ev))}`]),
      `SUMMARY:${icsEsc(ev.title)}`, ...(ev.where ? [`LOCATION:${icsEsc(ev.where)}`] : []), ...(ev.notes ? [`DESCRIPTION:${icsEsc(ev.notes)}`] : []),
      ...(ev.reminders || []).flatMap(r => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(ev.title)}`, `TRIGGER:-PT${r}M`, 'END:VALARM']),
      'END:VEVENT', 'END:VCALENDAR'];
    try { await saveFile(`${ev.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'event'}.ics`, lines.join('\r\n'), 'text/calendar'); toast('Open the file to add it to your calendar'); }
    catch(err){ if(!err || err.code !== 'cancelled') toast('Couldn’t create the file'); }
  });

  // reminders while Kairo is open (a notification server comes later for when it's closed)
  function renderNotifState(){
    const has = 'Notification' in window, perm = has ? Notification.permission : 'denied';
    $('calNotifBtn').hidden = !has || perm !== 'default';
    $('calNotifTxt').textContent = !has ? 'This browser can’t show reminders' : perm === 'granted' ? 'Reminders on while Kairo is open' : perm === 'denied' ? 'Reminders blocked in this browser' : '';
  }
  $('calNotifBtn').addEventListener('click', async () => { try { await Notification.requestPermission(); } catch {} renderNotifState(); });
  function checkReminders(){
    if(!events.length) return;
    let fired = {}; try { fired = JSON.parse(localStorage.getItem('pr-fired') || '{}'); } catch {}
    const now = Date.now(); let changed = false;
    for(const ev of events){
      if(ev.allDay || !(ev.reminders || []).length) continue;
      const st = evStart(ev).getTime();
      for(const r of ev.reminders){
        const at = st - r * 60e3, key = `${ev.id}|${ev.start}|${r}`;
        if(now >= at && now - at < 30 * 60e3 && now < st + 60e3 && !fired[key]){
          fired[key] = now; changed = true;
          const body = `${r >= 60 ? remTxt(r) : r + ' min'} · ${fmtTime(new Date(st))}${ev.where ? ' · ' + ev.where : ''}`;
          toast(`⏰ ${ev.title} in ${body}`);
          if('Notification' in window && Notification.permission === 'granted'){
            const opts = {body: 'Starts in ' + body, tag: key, icon: 'icon-192.png', badge: 'icon-192.png'};
            if(navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(reg => reg.showNotification(ev.title, opts)).catch(() => new Notification(ev.title, opts));
            else try { new Notification(ev.title, opts); } catch {}
          }
        }
      }
    }
    if(changed){ for(const k of Object.keys(fired)) if(now - fired[k] > 7 * 86400e3) delete fired[k]; try { localStorage.setItem('pr-fired', JSON.stringify(fired)); } catch {} }
  }
  setInterval(checkReminders, 20 * 1000); setTimeout(checkReminders, 3000);

  /* ---------- feedback ---------- */
  ['Not yet', 'A little', 'Useful', 'Very useful'].forEach((lab, i) => {
    const l = document.createElement('label'); l.className = 'seg auto';
    l.innerHTML = `<input type="radio" name="fbrate" id="fbr${i}" value="${lab}"><span>${lab}</span>`; $('fbRate').append(l);
  });
  function feedbackText(){
    const rate = (document.querySelector('input[name="fbrate"]:checked') || {}).value || 'not rated';
    const open = tasks.filter(t => !t.done).length, closed = tasks.filter(t => t.done).length;
    return `Kairo feedback (${APP_VERSION})\n\nUsefulness: ${rate}\nRole: ${$('fbRole').value.trim() || '—'}\n\nWhat works well:\n${$('fbGood').value.trim() || '—'}\n\nWhat's missing or confusing:\n${$('fbBad').value.trim() || '—'}\n\nUsage: ${open} open tasks, ${closed} closed, ${dailies.length} daily routines, ${clients().length} clients.`;
  }
  $('feedbackBtn').addEventListener('click', () => { $('fbScrim').hidden = false; setTimeout(() => $('fbGood').focus(), 30); });
  $('fbCancel').addEventListener('click', () => { $('fbScrim').hidden = true; });
  $('fbScrim').addEventListener('click', e => { if(e.target === $('fbScrim')) $('fbScrim').hidden = true; });
  $('fbForm').addEventListener('submit', async e => {
    e.preventDefault();
    const good = $('fbGood').value.trim(), bad = $('fbBad').value.trim();
    if(!good && !bad){ toast('Write a line about what works or what’s missing'); return; }
    // saved to the feedback table: anyone signed in can send, only the owner reads it (in Supabase)
    if(sb && cloudUser && navigator.onLine){
      $('fbSend').disabled = true;
      try {
        const {error} = await sb.from('feedback').insert({
          email: cloudUser.email || null, rating: (document.querySelector('input[name="fbrate"]:checked') || {}).value || null,
          works: good || null, missing: bad || null, role: $('fbRole').value.trim() || null, app_version: APP_VERSION,
          usage: `${tasks.filter(t => !t.done).length} open, ${tasks.filter(t => t.done).length} closed, ${spaces.length} spaces`});
        if(!error){ $('fbScrim').hidden = true; $('fbGood').value = $('fbBad').value = ''; toast('Thanks! Feedback sent.'); return; }
      } catch {} finally { $('fbSend').disabled = false; }
    }
    try { await navigator.clipboard.writeText(feedbackText()); toast('Couldn’t send it right now. It was copied so you can paste it later.'); }
    catch { toast('Couldn’t send it. Use Open email.'); }
  });

  /* ---------- spaces on first use ---------- */
  let spacesChecked = false;
  async function ensureSpaces(){
    if(spacesChecked || !store || !dataReady || !store.apply) return;
    spacesChecked = true;
    if(spaces.some(x => !x._owner)) return;   // spaces shared by others don't count
    if(!tasks.some(t => !t._owner) && !dailies.some(d => !d._owner) && !settings.onboarded){ openOnboarding(); return; }
    // existing data from before spaces: add the standard ones; old tasks fall into Work
    for(const [i, x] of DEFAULT_SPACES.entries()){ const {id, ...rest} = x; await store.save('spaces', id, {...rest, order: i, createdAt: Date.now()}); }
  }
  const obUses = () => [...$('obSpaces').querySelectorAll('input:checked')].map(c => c.value);
  function syncOb(){ const u = obUses(); $('obWorkBox').hidden = !u.includes('work') && !u.includes('team'); $('obEveBox').hidden = !u.includes('studies') && !u.includes('personal') && !$('obOther').value.trim(); }
  $('obSpaces').addEventListener('change', syncOb); $('obOther').addEventListener('input', syncOb);
  function openOnboarding(){
    syncOb();
    document.querySelector('#obForm .ob-name').textContent = APP_NAME;
    $('obName').value = settings.displayName || (cloudUser && cloudUser.email ? cloudUser.email.split('@')[0] : '');
    $('obScrim').hidden = false; setTimeout(() => $('obName').focus(), 30);
  }
  $('obForm').addEventListener('submit', async e => {
    e.preventDefault();
    const a = toH($('obStart').value), b = toH($('obEnd').value);
    if(a === null || b === null || b <= a){ toast('Work must end after it starts'); return; }
    const uses = obUses(), other = $('obOther').value.trim();
    if(!uses.length && !other){ toast('Pick at least one'); return; }
    const team = uses.includes('team');
    const picks = [...new Set(uses.map(u => ({work: 'sp-work', team: 'sp-work', studies: 'sp-university', personal: 'sp-personal', bills: 'sp-finances'})[u]))];
    $('obScrim').hidden = true;
    settings = {...settings, displayName: $('obName').value.trim(), workStart: toHM(a), workEnd: toHM(b),
      focusHours: Math.min(12, Math.max(1, Number($('obFocus').value) || 5)), eveningHours: Math.min(6, Math.max(0, Number($('obEve').value) || 0)), onboarded: true,
      uses, modules: {clients: team, ops: team, detail: false}};
    applyModules();
    try {
      await store.saveSettings(settings);
      let i = 0;
      for(const x of DEFAULT_SPACES) if(picks.includes(x.id)){ const {id, ...rest} = x; await store.save('spaces', id, {...rest, name: x.id === 'sp-university' ? 'Studies' : x.name, ...(x.id === 'sp-finances' && !picks.includes('sp-work') ? {planDuring: 'evenings'} : {}), order: i++, createdAt: Date.now()}); }
      if(other) await store.save('spaces', 'sp-' + other.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) + '-' + Date.now().toString(36), {name: other, color: SPACE_COLORS[4], planDuring: 'evenings', order: i, createdAt: Date.now()});
      renderSync(); render(); toast('You’re set. Type your first task in the box at the top.'); setTimeout(() => $('qaText').focus(), 300);
    } catch(err){ fail(err); }
  });

  /* ---------- clients & settings ---------- */
  function renderSpaceRows(){
    const box = $('spRows'); box.textContent = '';
    renderFeatures();
    if(document.activeElement !== $('sName')) $('sName').value = settings.displayName || '';
    if(document.activeElement !== $('sEve')) $('sEve').value = settings.eveningHours ?? 2;
    if(document.activeElement !== $('sWkd')) $('sWkd').value = settings.weekendHours ?? 4;
    $('sPayDays').value = String(remindDays() || 3);
    $('sReady').value = String(readyLead());
    if(!spaces.length){ const e = document.createElement('div'); e.className = 'fnote'; e.textContent = 'No spaces yet.'; box.append(e); }
    for(const x of spacesSorted()){
      const row = document.createElement('div'); row.className = 'sp-row';
      const col = document.createElement('input'); col.type = 'color'; col.value = x.color || '#5d6878'; col.setAttribute('aria-label', x.name + ' color');
      const name = document.createElement('input'); name.type = 'text'; name.value = x.name; name.maxLength = 40; name.setAttribute('aria-label', 'Space name');
      const sel = document.createElement('select'); sel.setAttribute('aria-label', 'When to plan ' + x.name);
      for(const [k, v] of Object.entries(PLAN_DURING)){ const o = document.createElement('option'); o.value = k; o.textContent = v; sel.append(o); }
      sel.value = x.planDuring || 'work';
      const cust = document.createElement('div'); cust.className = 'sp-cust'; cust.hidden = sel.value !== 'custom';
      const days = document.createElement('div'); days.className = 'sp-days';
      for(const d of [1, 2, 3, 4, 5, 6, 0]){
        const l = document.createElement('label'); const c = document.createElement('input'); c.type = 'checkbox'; c.value = d; c.checked = customDays(x).includes(d);
        c.addEventListener('change', () => { const v = [...days.querySelectorAll('input:checked')].map(i => Number(i.value)); if(!v.length){ c.checked = true; return; } save({days: v}); });
        l.append(c, document.createTextNode(DOW[d])); days.append(l);
      }
      const [ca, cb] = customWin(x);
      const t1 = document.createElement('input'); t1.type = 'time'; t1.value = toHM(ca); t1.setAttribute('aria-label', x.name + ' starts');
      const t2 = document.createElement('input'); t2.type = 'time'; t2.value = toHM(cb); t2.setAttribute('aria-label', x.name + ' ends');
      const saveWin = () => { const a = toH(t1.value), b = toH(t2.value); if(a === null || b === null || b <= a){ toast('End time must be after the start time'); return; } save({start: toHM(a), end: toHM(b)}); };
      t1.addEventListener('change', saveWin); t2.addEventListener('change', saveWin);
      const times = document.createElement('div'); times.className = 'sp-times'; times.append(t1, span('to', 'fnote'), t2);
      cust.append(days, times);
      const n = tasks.filter(t => !t.parentId && (spaceOf(t) || {}).id === x.id).length + dailies.filter(d => (spaceById(d.spaceId) || defaultSpace() || {}).id === x.id).length;
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn sm danger'; del.textContent = 'Remove';
      del.hidden = n > 0 || spaces.length < 2; del.title = 'Only empty spaces can be removed';
      const save = patch => { const {id, ...rest} = x; store.save('spaces', id, {...rest, ...patch}).catch(fail); };
      col.addEventListener('change', () => save({color: col.value}));
      name.addEventListener('change', () => { const v = name.value.trim(); if(v) save({name: v}); else name.value = x.name; });
      sel.addEventListener('change', () => { cust.hidden = sel.value !== 'custom'; save({planDuring: sel.value}); toast(`${x.name}: planned ${spaceWhen({...x, planDuring: sel.value})}`); });
      del.addEventListener('click', () => { store.remove('spaces', x.id).catch(fail); if(spaceFilter === x.id) setSpaceFilter('all'); });
      const mineSp = !x._owner, canShare = !!(sb && cloudUser);
      const shareB = document.createElement('button'); shareB.type = 'button'; shareB.className = 'btn sm';
      shareB.textContent = x.shared ? (mineSp ? `Shared · ${(shareMembers.get(x.id) || []).length || '…'}` : 'Shared with you') : 'Share';
      shareB.hidden = !canShare;
      if(x.shared) del.hidden = true;
      const panel = document.createElement('div'); panel.className = 'sp-share'; panel.hidden = shareOpenId !== x.id;
      shareB.addEventListener('click', () => { shareOpenId = shareOpenId === x.id ? null : x.id; if(shareOpenId && x.shared) loadMembers(x.id); renderClientRows(); });
      if(!panel.hidden){
        const list = shareMembers.get(x.id) || [];
        for(const m of list){
          const r = document.createElement('div'); r.className = 'sp-mem';
          r.append(span(m.user_id === cloudUser.id ? m.email + ' (you)' : m.email));
          const own = m.user_id === x.ownerId;
          if(own) r.append(span('owner', 'fnote'));
          else if(mineSp || m.user_id === cloudUser.id){ const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'linkbtn'; rm.textContent = m.user_id === cloudUser.id ? 'Leave' : 'Remove';
            rm.addEventListener('click', () => removeMember(x.id, m.user_id)); r.append(rm); }
          panel.append(r);
        }
        if(mineSp){
          const f = document.createElement('form'); f.className = 'sp-inv'; f.autocomplete = 'off';
          const inp = document.createElement('input'); inp.type = 'email'; inp.placeholder = 'Their email (they need an account)'; inp.setAttribute('aria-label', 'Invite by email');
          const go = document.createElement('button'); go.className = 'btn sm primary'; go.type = 'submit'; go.textContent = 'Invite';
          f.append(inp, go);
          f.addEventListener('submit', async e => { e.preventDefault(); go.disabled = true; try { await shareSpace(x, inp.value); } finally { go.disabled = false; } });
          panel.append(f, span('Everyone in the space sees and edits its tasks, projects and recurring work.', 'fnote'));
        }
      }
      const tgt = linkTarget(x), kids = linkedTo(x);
      const lk = document.createElement('div'); lk.className = 'sp-cust sp-link';
      if(kids.length) lk.append(span('Includes ' + kids.map(y => y.name).join(', ') + ' (planned and shown with ' + x.name + ')', 'fnote'));
      else if(spaces.length > 1 && (x.shared || tgt)){
        const ls = document.createElement('select'); ls.setAttribute('aria-label', 'Count ' + x.name + ' as part of');
        const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Its own space'; ls.append(o0);
        for(const y of spacesSorted().filter(y => y.id !== x.id && !linkTarget(y))){ const o = document.createElement('option'); o.value = y.id; o.textContent = 'Part of ' + y.name; ls.append(o); }
        ls.value = tgt ? tgt.id : '';
        ls.addEventListener('change', async () => {
          const links = {...spaceLinks()}; if(ls.value) links[x.id] = ls.value; else delete links[x.id];
          settings = {...settings, spaceLinks: links}; render(); renderClientRows();
          toast(ls.value ? `${x.name} now counts as ${spaceById(ls.value).name}` : `${x.name} is its own space again`);
          try { await store.saveSettings(settings); } catch(e){ fail(e); }
        });
        lk.append(span('Counts as', 'fnote'), ls);
        if(tgt) lk.append(span('Planned in ' + spaceWhen(tgt) + '. Only for you; others in the space don’t see this.', 'fnote'));
      }
      if(tgt){ sel.hidden = true; cust.hidden = true; }
      row.append(col, name, sel, shareB, del, cust, lk, panel); box.append(row);
    }
  }
  $('spAdd').addEventListener('submit', async e => {
    e.preventDefault(); const v = $('spNew').value.trim(); if(!v) return;
    if(spaces.some(x => x.name.toLowerCase() === v.toLowerCase())){ toast('That space already exists'); return; }
    $('spNew').value = '';
    const id = 'sp-' + v.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) + '-' + Date.now().toString(36);
    try { await store.save('spaces', id, {name: v, color: SPACE_COLORS[spaces.length % SPACE_COLORS.length], planDuring: 'evenings', order: spaces.length, createdAt: Date.now()}); renderClientRows(); toast('Space added'); } catch(err){ fail(err); }
  });
  const saveProfile = async patch => { settings = {...settings, ...patch}; render(); renderSync(); try { await store.saveSettings(settings); } catch(e){ fail(e); } };
  $('sName').addEventListener('change', () => saveProfile({displayName: $('sName').value.trim()}));
  $('sEve').addEventListener('change', () => saveProfile({eveningHours: Math.min(6, Math.max(0, Number($('sEve').value) || 0))}));
  $('sWkd').addEventListener('change', () => saveProfile({weekendHours: Math.min(12, Math.max(0, Number($('sWkd').value) || 0))}));
  $('sReady').addEventListener('change', () => saveProfile({readyLead: Number($('sReady').value)}));
  $('sPayDays').addEventListener('change', () => saveProfile({payRemindDays: Number($('sPayDays').value) || 3}));

  function renderClientRows(){
    renderSpaceRows();
    const box = $('clRows'); box.textContent = '';
    const all = clients();
    if(!all.length){ const e = document.createElement('div'); e.className = 'fnote'; e.textContent = 'No clients yet.'; box.append(e); }
    for(const name of all){
      const row = document.createElement('div'); row.className = 'cl-row';
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = name; inp.maxLength = 40; inp.setAttribute('aria-label', 'Client name');
      inp.id = 'cl-' + name.replace(/[^A-Za-z0-9_-]/g, '_');
      inp.addEventListener('change', () => renameClient(name, inp.value.trim()));
      const n = tasks.filter(t => (t.client || '') === name).length;
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn sm danger'; del.textContent = 'Remove';
      del.title = n ? 'Tasks keep their client name' : '';
      del.addEventListener('click', () => removeClient(name));
      row.append(inp, span(n + ' task' + (n === 1 ? '' : 's'), 'n'), del); box.append(row);
    }
    const [us0, ue0] = usualWindow(); $('sStart').value = toHM(us0); $('sEnd').value = toHM(ue0);
  }
  const clientDoc = name => clientDocs.find(c => c.name === name);
  async function ensureClient(name){ if(name && !clientDoc(name)) await store.add('clients', {name, createdAt: Date.now()}); }
  async function renameClient(from, to){
    if(!to || to === from) return renderClientRows();
    try {
      const d = clientDoc(from);
      if(d) await store.save('clients', d.id, {name: to, createdAt: d.createdAt || Date.now()}); else await ensureClient(to);
      for(const t of tasks.filter(t => t.client === from)){ const data = {...t, client: to}; delete data.id; await store.save('tasks', t.id, data); }
      for(const x of dailies.filter(x => x.client === from)){ const data = {...x, client: to}; delete data.id; await store.save('daily', x.id, data); }
      if(clientFilter === from){ clientFilter = to; }
      toast('Client renamed');
    } catch(e){ fail(e); }
  }
  async function removeClient(name){
    const d = clientDoc(name);
    try { if(d) await store.remove('clients', d.id); toast(d ? 'Client removed from the list' : 'Rename or clear it on its tasks to remove it'); } catch(e){ fail(e); }
  }
  $('settingsBtn').addEventListener('click', () => { shareOpenId = null; renderClientRows(); renderCloudInfo(); $('sScrim').hidden = false; });
  $('sDone').addEventListener('click', () => { $('sScrim').hidden = true; });
  $('sScrim').addEventListener('click', e => { if(e.target === $('sScrim')) $('sScrim').hidden = true; });
  $('clAdd').addEventListener('submit', async e => {
    e.preventDefault(); const v = $('clNew').value.trim(); if(!v) return;
    if(clients().includes(v)){ toast('That client already exists'); return; }
    $('clNew').value = '';
    try { await ensureClient(v); toast('Client added'); } catch(err){ fail(err); }
  });
  const saveHours = async () => {
    const a = toH($('sStart').value), b = toH($('sEnd').value);
    if(a === null || b === null || b <= a){ toast('End time must be after the start time'); return; }
    settings = {...settings, workStart: toHM(a), workEnd: toHM(b)}; render();
    try { await store.saveSettings(settings); } catch(e){ fail(e); }
  };
  const saveToday = async () => {
    const a = toH($('tStart').value), b = toH($('tEnd').value);
    if(a === null || b === null || b <= a){ toast('End time must be after the start time'); return; }
    const [us, ue] = usualWindow();
    settings = {...settings, today: (Math.abs(a - us) < 1e-6 && Math.abs(b - ue) < 1e-6) ? null : {date: dayKey(), start: toHM(a), end: toHM(b)}}; render();
    try { await store.saveSettings(settings); toast('Today’s hours updated'); } catch(e){ fail(e); }
  };
  $('tStart').addEventListener('change', saveToday); $('tEnd').addEventListener('change', saveToday);
  $('tReset').addEventListener('click', async () => { settings = {...settings, today: null}; render(); try { await store.saveSettings(settings); } catch(e){ fail(e); } });
  $('sStart').addEventListener('change', saveHours); $('sEnd').addEventListener('change', saveHours);

  function openForm(t, parentId, preset){
    editingId = t ? t.id : null;
    const hasSubs = t && subsOf(t).length > 0;
    $('formTitle').textContent = t ? (t.parentId ? 'Edit subtask' : (t.isProject || hasSubs) ? 'Edit project' : 'Edit task') : (parentId ? 'New task in project' : 'New task');
    fillParents(t ? t.id : null);
    $('fParent').value = t ? (t.parentId || '') : (parentId || '');
    formProject = t ? (!!t.isProject || !!hasSubs) : preset === 'project';
    $('form').classList.toggle('is-project', formProject);
    $('fTitleL').textContent = formProject ? 'Project' : 'Task';
    $('fTitle').placeholder = formProject ? 'e.g. Office move, Final paper' : 'e.g. Quarterly client review';
    $('projSubField').hidden = !formProject; $('fSubDays').value = t && t.subtaskDays ? String(t.subtaskDays) : '';
    $('fAH').checked = !!(t && t.afterHours); $('whenWork').checked = !$('fAH').checked; $('fAHAt').value = t && t.ahAt ? t.ahAt : ''; syncWhen();
    $('fLoc').value = t && t.location ? t.location : ''; $('fTravel').value = String(t && t.travelMin ? t.travelMin : 0);
    $('fReady').value = !t || !t.readyMode || t.readyMode === 'auto' ? 'auto' : t.readyMode === 'due' ? 'due' : String(t.readyDays || 1);
    $('fProg').value = t ? progOf(t) : 0; $('fProgV').textContent = $('fProg').value + '%'; $('fProgField').hidden = !t;
    renderFieldRows(t && t.fields ? t.fields : []);
    pendingFiles = []; renderFormFiles(t);
    fillSpaceSelect($('fSpace'), t ? t.spaceId : (spaceFilter !== 'all' ? spaceFilter : ''));
    $('fAmount').value = t && isPayment(t) ? t.amount : '';
    $('fParent').disabled = !!hasSubs;
    $('fTitle').value = t ? t.title : '';
    $('fClient').value = t ? (t.client || '') : (clientFilter !== 'all' && clientFilter !== '__none' ? clientFilter : '');
    const pid = $('fParent').value;
    setRadio('imp', t ? (t.importance ?? 0) : (pid ? 0 : 3));
    setRadio('urg', t ? (t.urgency ?? 0) : (pid ? 0 : 3));
    setEffort(t ? effortOf(t) : 1);
    $('fDate').value = t && t.deadline ? t.deadline : '';
    wtList = t && t.workTimes ? t.workTimes.filter(w => w.date >= dayKey()).map(w => ({...w})) : []; renderWt();
    $('fRepeat').value = repKey(t && t.repeat); $('fRepN').value = t && t.repeat && t.repeat.unit === 'day' && t.repeat.n > 1 ? t.repeat.n : 10; $('fRepN').hidden = $('fRepeat').value !== 'custom';
    // a project can give its new tasks a default deadline (e.g. 2 weeks out), capped at its own
    const par = !t && parentId ? byId(parentId) : null;
    if(par && Number(par.subtaskDays) > 0){ let d = dayKey(offDate(Number(par.subtaskDays))); if(par.deadline && d > par.deadline) d = par.deadline; $('fDate').value = d; }
    $('fNotes').value = t && t.notes ? t.notes : '';
    $('mode' + ({normal:'Normal', steady:'Steady', emergency:'Emergency'})[t ? modeOf(t) : 'normal']).checked = true;
    $('fWeekly').value = t && t.weeklyHours ? t.weeklyHours : 3;
    $('fSession').value = String(t && t.sessionHours ? t.sessionHours : 1);
    if(preset === 'project'){ $('formTitle').textContent = 'New project'; setEffort(1); }
    if(preset === 'emergency'){ $('modeEmergency').checked = true; setRadio('imp', 5); setRadio('urg', 5); setEffort(2); $('fDate').value = dayKey(); $('formTitle').textContent = 'New emergency'; }
    prioFromRadios();
    $('delBtn').hidden = !t; $('confirmDel').hidden = true;
    const adv = !!t && (modeOf(t) !== 'normal' || !!t.client || isPayment(t) || !!t.afterHours || !!t.location || progOf(t) > 0 || (t.fields || []).length || (t.attachments || []).length || !!t.notes || (t.urgency != null && t.urgency !== 3));
    let pref = false; try { pref = localStorage.getItem('pr-more') === '1'; } catch {}
    $('fMore').open = adv || pref || preset === 'emergency';
    syncParentUI(); updatePreview();
    $('scrim').hidden = false;
    setTimeout(() => $('fTitle').focus(), 30);
  }
  function closeForm(){ $('scrim').hidden = true; editingId = null; }
  function closeNew(){ $('newMenu').hidden = true; $('newBtn').setAttribute('aria-expanded', 'false'); $('fabAdd').setAttribute('aria-expanded', 'false'); $('fabAdd').classList.remove('open'); }
  $('fabAdd').addEventListener('click', e => { e.stopPropagation(); const open = $('newMenu').hidden; closeAcct(); $('newMenu').hidden = !open; $('fabAdd').setAttribute('aria-expanded', String(open)); $('fabAdd').classList.toggle('open', open); if(open) $('addBtn').focus(); });
  $('newBtn').addEventListener('click', e => { e.stopPropagation(); const open = $('newMenu').hidden; closeAcct(); $('newMenu').hidden = !open; $('newBtn').setAttribute('aria-expanded', String(open)); if(open) $('addBtn').focus(); });
  $('newMenu').addEventListener('click', () => closeNew());
  document.addEventListener('click', e => { if(!e.target.closest('#newWrap')) closeNew(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !$('newMenu').hidden){ closeNew(); ($('fabAdd').offsetParent ? $('fabAdd') : $('newBtn')).focus(); } });
  $('addBtn').addEventListener('click', () => openForm(null));
  $('addProjMenu').addEventListener('click', () => openForm(null, null, 'project'));
  $('addEmergBtn').addEventListener('click', () => openForm(null, null, 'emergency'));
  $('cancelBtn').addEventListener('click', closeForm);
  $('scrim').addEventListener('click', e => { if(e.target === $('scrim')) closeForm(); });
  $('delBtn').addEventListener('click', () => {
    const n = subsOf(byId(editingId) || {}).length;
    $('delMsg').textContent = n ? `Delete this project and its ${n} subtask${n===1?'':'s'}?` : 'Delete this task?';
    $('delBtn').hidden = true; $('confirmDel').hidden = false;
  });
  $('delYes').addEventListener('click', async () => {
    const id = editingId, ids = [...subsOf(byId(id) || {}).map(s => s.id), id]; closeForm();
    const paths = ids.flatMap(i => ((byId(i) || {}).attachments || []).map(a => a.path));
    if(paths.length && canFiles()) sb.storage.from('attachments').remove(paths).catch(() => {});
    try { for(const i of ids) await store.remove('tasks', i); toast('Deleted'); } catch(e){ fail(e); }
  });
  $('fRepeat').addEventListener('change', () => { $('fRepN').hidden = $('fRepeat').value !== 'custom'; updatePreview(); });
  $('fRepN').addEventListener('input', updatePreview);
  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const d = draft(); if(!d.title) return;
    const p = d.parentId ? byId(d.parentId) : null;
    let capped = false;
    if(p && p.deadline && d.deadline && d.deadline > p.deadline){ d.deadline = p.deadline; capped = true; }
    const base = editingId ? byId(editingId) : null;
    const data = {...(base || {}), ...d, sessions: base ? (base.sessions || []) : [], done: base ? !!base.done : false, doneAt: base ? (base.doneAt || null) : null,
      createdAt: base ? base.createdAt : Date.now(), example: base ? !!base.example : false, attachments: base ? (base.attachments || []) : []};
    delete data.id;
    const id = editingId, nid = id || ('l' + Date.now().toString(36) + Math.random().toString(36).slice(2,6)), files = pendingFiles; pendingFiles = [];
    try { localStorage.setItem('pr-more', $('fMore').open ? '1' : '0'); } catch {}
    closeForm();
    try {
      await store.save('tasks', nid, data);
      if(files.length) await uploadFiles(byId(nid) || {id: nid, ...data}, files);
      if(data.client) await ensureClient(data.client);
     
      toast(capped ? 'Saved · deadline capped to the project' : (id ? 'Saved' : data.isProject ? 'Project added' : 'Task added'));
    } catch(err){ fail(err); }
  });
  // one tap = done (Undo in the message). With client time tracking on, ask for the time spent.
  const finish = t => t.done || mod('clients') || isProject(t) ? openClose(t) : completeNow(t);
  async function completeNow(t){
    const before = {...t}; delete before.id;
    const data = {...before, done: true, doneAt: Date.now(), closeout: {spent: effortOf(t), comment: '', closedBy: me || null}};
    try {
      const nx = await spawnNext(t, data.doneAt); if(nx) data.repeatNext = nx.id;
      await store.save('tasks', t.id, data);
      toast(nx ? `Done ✓ · next one due ${fmt(nx.due)}` : 'Done ✓', async () => { try { await store.save('tasks', t.id, before); if(nx) await store.remove('tasks', nx.id); } catch(e){ fail(e); } });
    } catch(e){ fail(e); }
  }
  async function toggleDone(t, on){
    if(on){ finish(t); return; }
    const data = {...t, done:false, doneAt:null, closeout:null}; delete data.id;
    try { await store.save('tasks', t.id, data); toast('Reopened'); } catch(e){ fail(e); }
  }

  const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

  /* ---------- task details (read view) ---------- */
  let viewingId = null;
  function openDetails(t){
    viewingId = t.id;
    const x = calc(t), p = parentOf(t), e = x.e, subs = subsOf(t);
    $('vScore').textContent = t.done ? '✓' : x.score; $('vScore').className = 'score tier-' + (t.done ? 'low' : x.tier);
    $('vTitle').textContent = t.title;
    $('vSub').textContent = [p ? 'Part of ' + p.title : '', e.client].filter(Boolean).join(' · ');
    const tags = $('vTags'); tags.textContent = '';
    const tag = (txt, cls) => { const s = span(txt, cls); tags.append(s); };
    if(t.done) tag('Closed');
    else {
      tag(tierName[x.tier] + ' priority', x.tier === 'crit' ? 't-crit' : x.tier === 'high' ? 't-high' : '');
      tag(qName[x.q]);
      if(modeOf(t) !== 'normal') tag(modeOf(t) === 'steady' ? 'Steady' : 'Emergency', modeOf(t) === 'emergency' ? 't-crit' : '');
      if(x.risk) tag('At risk', 't-crit');
      if(isLHF(x)) tag('Quick win');
    }
    const grid = $('vGrid'); grid.textContent = '';
    const item = (k, v) => { if(v === null || v === undefined || v === '') return; const d = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; d.append(dt, dd); grid.append(d); };
    if(t.afterHours) item('After hours', fmtWhen(ahWhen(t)));
    { const r = S.res.get(t.id); if(r && !t.done && !r.emergency){
        const parts = r.chunks.filter(c => c[0] >= 0).sort((a, b) => a[0] - b[0]).map(c => { const w = c[3] === 'pin' ? (t.workTimes || [])[c[4]] : null;
          return `${fmtOff(c[0])}${w && w.time ? ' ' + fmtClock(toH(w.time)) : ''} ${fmtH(c[1])}${w ? ' (your time)' : ''}`; });
        if(parts.length) item('Work time', parts.join(' · ')); } }
    if(t.repeat) item('Repeats', repText(t.repeat)[0].toUpperCase() + repText(t.repeat).slice(1) + (t.repeatNext ? ' · next one created' : ''));
    if(!t.done && x.ready !== null && x.ready !== x.days) item(x.late ? 'Ready by (late)' : 'Ready by', fmt(offDate(x.ready)));
    item('Deadline', e.deadline ? fmt(parseD(e.deadline)) + (!t.deadline && p ? ' (project)' : '') : 'None');
    if(!t.done && !x.late && x.start !== null && x.ready !== null && x.start < x.ready && modeOf(t) === 'normal' && !t.afterHours) item('Start by', fmtOff(x.start));
    if(modeOf(t) === 'steady') item('Sessions', `${fmtH(Number(t.weeklyHours) || 3)} a week in ${fmtH(Number(t.sessionHours) || 1)} sessions · ${weekSessionsDone(t)} this week`);
    else item('Effort', subs.length ? `${fmtH(subs.reduce((a,s) => a + effortOf(s), 0))} across ${subs.length} subtasks` : t.isProject ? 'From its tasks' : !effortOf(t) ? 'None' : fmtH(effortOf(t)) + (progOf(t) ? ` · ${fmtH(remOf(t) - travelOf(t))} left` : ''));
    if(t.location) item('Where', ({remote: 'Remote', onsite: 'On-site', hybrid: 'Hybrid'})[t.location] + (travelOf(t) ? ` · ${fmtH(travelOf(t))} travel` : ''));
    for(const f of (t.fields || [])) if(f && f.k) item(f.k, f.v);
    if(e.space){ const rs = rootSpace(e.space); item('Space', e.space.name + (rs !== e.space ? ` · part of ${rs.name}` : '') + ' · planned ' + spaceWhen(rs)); }
    { const ss = sharedSpaceOf(t); if(ss){ const ms = (shareMembers.get(ss.id) || []).map(m => m.user_id === (cloudUser || {}).id ? 'You' : m.email); item('Shared with', ms.length ? ms.join(', ') : 'Members of ' + ss.name); item('Added by', t._owner ? (memberEmail(t._owner) || 'Another member') : 'You'); } }
    if(isPayment(t)) item('Amount', money(t.amount));
    item('Importance', lvl(e.importance) + (t.importance == null && p ? ' (project)' : ''));
    item('Urgency', lvl(e.urgency) + (t.urgency == null && p ? ' (project)' : ''));
    item('Created', t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '');
    const more = $('vMore'); more.textContent = '';
    const sec = (title, node) => { const d = document.createElement('div'); d.className = 'det-sec'; const h = document.createElement('h4'); h.textContent = title; d.append(h, node); more.append(d); };
    if(subs.length){
      const box = document.createElement('div');
      subs.map(calc).sort((a,b) => (a.t.done - b.t.done) || (b.score - a.score)).forEach(sx => {
        const r = document.createElement('div'); r.className = 'det-sub-row' + (sx.t.done ? ' done' : ''); r.tabIndex = 0;
        r.append(span(sx.t.title), span(sx.t.done ? 'done' : `${fmtH(effortOf(sx.t))} · ${sx.score}`, 'hours'));
        r.addEventListener('click', () => openDetails(sx.t)); r.addEventListener('keydown', ev => { if(ev.key === 'Enter') openDetails(sx.t); });
        box.append(r);
      });
      sec(`Subtasks · ${subs.filter(s => s.done).length}/${subs.length} done`, box);
    }
    if(!t.done && isLeaf(t) && modeOf(t) !== 'steady'){
      const w = document.createElement('div'); w.className = 'progress-ctl';
      const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 100; r.step = 10; r.value = progOf(t); r.setAttribute('aria-label', 'Progress');
      const o = span(progOf(t) + '%', 'hours');
      const left = span('', 'fnote');
      const upd = () => { o.textContent = r.value + '%'; left.textContent = `${fmtH(effortOf(t) * (1 - r.value / 100))} of ${fmtH(effortOf(t))} left`; };
      upd(); r.addEventListener('input', upd);
      r.addEventListener('change', async () => { const d = {...(byId(t.id) || t), progress: Number(r.value)}; delete d.id;
        try { await store.save('tasks', t.id, d); toast(`${r.value}% done · plan updated`); } catch(err){ fail(err); } });
      w.append(r, o); const box = document.createElement('div'); box.append(w, left); sec('Progress', box);
    }
    if(t.notes){ const n = document.createElement('div'); n.className = 'det-notes'; n.textContent = t.notes; sec('Notes', n); }
    sec('Files', filesBox(t));
    if(t.done && t.closeout){
      const n = document.createElement('div'); n.className = 'det-notes';
      n.textContent = `Closed ${new Date(t.doneAt).toLocaleString('en-US', {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})} · took ${fmtH(Number(t.closeout.spent) || 0)}` + (t.closeout.comment ? `\n\n${t.closeout.comment}` : '');
      sec('Completion', n);
    }
    $('vDone').textContent = t.done ? 'Edit completion' : 'Mark as done';
    $('vEdit').hidden = !!t.done;
    $('vAddSub').hidden = !!t.parentId || !!t.done;
    $('vScrim').hidden = false;
    setTimeout(() => $('vEdit').hidden ? $('vDone').focus() : $('vEdit').focus(), 30);
  }
  function closeDetails(){ $('vScrim').hidden = true; viewingId = null; }
  $('vClose').addEventListener('click', closeDetails);
  $('vScrim').addEventListener('click', e => { if(e.target === $('vScrim')) closeDetails(); });
  $('vEdit').addEventListener('click', () => { const t = byId(viewingId); closeDetails(); if(t) openForm(t); });
  $('vDone').addEventListener('click', () => { const t = byId(viewingId); closeDetails(); if(t) finish(t); });
  $('vAddSub').addEventListener('click', () => { const id = viewingId; closeDetails(); openForm(null, id); });

  /* ---------- close-out (like closing a ticket) ---------- */
  const toLocalInput = ts => { const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); };
  function estimateOf(t){
    if(modeOf(t) === 'steady') return (t.sessions || []).reduce((a,x) => a + (x.hours || 0), 0);
    const subs = subsOf(t);
    if(subs.length) return subs.reduce((a,s) => a + (s.closeout ? Number(s.closeout.spent) || 0 : effortOf(s)), 0);
    return effortOf(t);
  }
  function openClose(t){
    closingId = t.id;
    const editing = !!t.done;
    $('cTitle').textContent = editing ? 'Completion' : 'Mark as done';
    $('cTask').textContent = (parentOf(t) ? parentOf(t).title + ' › ' : '') + t.title;
    const co = t.closeout || {};
    $('cWhen').value = toLocalInput(editing && t.doneAt ? t.doneAt : Date.now());
    $('cSpent').value = co.spent ?? estimateOf(t);
    const est = modeOf(t) === 'steady' ? `Sessions logged: ${fmtH(estimateOf(t))}` : `Estimate: ${fmtH(subsOf(t).length ? subsOf(t).reduce((a,s) => a + effortOf(s), 0) : effortOf(t))}`;
    $('cEst').textContent = est;
    $('cComment').value = co.comment || '';
    $('cReopen').hidden = !editing;
    $('cSave').textContent = editing ? 'Save' : 'Done';
    $('cScrim').hidden = false;
    setTimeout(() => $('cSpent').focus(), 30);
  }
  function closeClose(){ $('cScrim').hidden = true; closingId = null; render(); }
  $('cCancel').addEventListener('click', closeClose);
  $('cScrim').addEventListener('click', e => { if(e.target === $('cScrim')) closeClose(); });
  $('cReopen').addEventListener('click', async () => { const t = byId(closingId); closeClose(); if(t) toggleDone(t, false); });
  $('cForm').addEventListener('submit', async e => {
    e.preventDefault();
    const t = byId(closingId); if(!t) return closeClose();
    const when = new Date($('cWhen').value).getTime() || Date.now();
    const data = {...t, done: true, doneAt: when, closeout: {spent: Math.max(0, Number($('cSpent').value) || 0), comment: $('cComment').value.trim(), closedBy: (t.closeout && t.closeout.closedBy) || me || null}};
    delete data.id;
    const was = !!t.done; closeClose();
    try {
      const nx = !was ? await spawnNext(t, when) : null; if(nx) data.repeatNext = nx.id;
      await store.save('tasks', t.id, data);
      toast(was ? 'Saved' : nx ? `Done ✓ · next one due ${fmt(nx.due)}` : 'Done ✓');
     
    } catch(err){ fail(err); }
  });

  /* ---------- reports ---------- */
  function rangeBounds(){
    const t = today0(), dow = (t.getDay() + 6) % 7; // Monday = 0
    const mon = new Date(t.getTime() - dow*DAY);
    if(range === 'week') return [mon, new Date(mon.getTime() + 7*DAY)];
    if(range === 'lastweek') return [new Date(mon.getTime() - 7*DAY), mon];
    if(range === 'month') return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth()+1, 1)];
    if(range === 'lastmonth') return [new Date(t.getFullYear(), t.getMonth()-1, 1), new Date(t.getFullYear(), t.getMonth(), 1)];
    const f = parseD($('rFrom').value) || new Date(t.getTime() - 30*DAY), to = parseD($('rTo').value) || t;
    return [f, new Date(to.getTime() + DAY)];
  }
  function reportRows(){
    const [a, b] = rangeBounds(), rows = [];
    const inR = ts => ts >= a.getTime() && ts < b.getTime();
    for(const t of tasks){
      if(!vis(t)) continue;
      if(t.done && t.doneAt && inR(t.doneAt)){
        const subs = subsOf(t);
        const est = subs.length ? subs.reduce((s,x) => s + effortOf(x), 0) : (modeOf(t) === 'steady' ? null : effortOf(t));
        const spent = t.closeout ? Number(t.closeout.spent) || 0 : null;
        const dl = eff(t).deadline;
        const onTime = dl ? dayKey(new Date(t.doneAt)) <= dl : null;
        rows.push({t, kind:'task', when: t.doneAt, est, spent, deadline: dl, onTime, comment: t.closeout ? t.closeout.comment : '', by: t.closeout ? t.closeout.closedBy : null, counts: !subs.length});
      }
      if(modeOf(t) === 'steady') for(const x of (t.sessions || [])){
        const d = parseD(x.date); if(d && inR(d.getTime() + 12*36e5)) rows.push({t, kind:'session', when: d.getTime() + 12*36e5, est:null, spent: x.hours || 0, deadline:null, onTime:null, comment:'Steady session', by:null, counts:true});
      }
    }
    return rows.sort((p,q) => q.when - p.when);
  }
  function renderReports(){
    document.querySelectorAll('#rangeChips .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.range === range));
    $('customRange').hidden = range !== 'custom';
    const rows = reportRows();
    const closed = rows.filter(r => r.kind === 'task');
    // projects' own time = their subtasks' time, so only leaf rows count toward hours
    const hours = rows.filter(r => r.counts && r.spent !== null).reduce((a,r) => a + r.spent, 0);
    const both = closed.filter(r => r.counts && r.est && r.spent !== null);
    const est = both.reduce((a,r) => a + r.est, 0), act = both.reduce((a,r) => a + r.spent, 0);
    const dl = closed.filter(r => r.onTime !== null);
    $('rClosed').textContent = closed.length;
    $('rHours').textContent = fmtH(hours);
    $('rAcc').textContent = est ? Math.round(act / est * 100) + '%' : '–';
    $('rOnTime').textContent = dl.length ? Math.round(dl.filter(r => r.onTime).length / dl.length * 100) + '%' : '–';
    const byClient = new Map();
    for(const r of rows) if(r.counts && r.spent){ const c = eff(r.t).client || 'No client'; byClient.set(c, (byClient.get(c) || 0) + r.spent); }
    const bars = $('rBars'); bars.textContent = '';
    const max = Math.max(0, ...byClient.values());
    if(!byClient.size){ const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'No time logged in this range.'; bars.append(e); }
    [...byClient].sort((p,q) => q[1] - p[1]).forEach(([c, h]) => {
      const b = document.createElement('div'); b.className = 'bar';
      const bt = document.createElement('span'); bt.className = 'bt'; const fill = document.createElement('i'); fill.style.width = (h / max * 100) + '%'; bt.append(fill);
      b.append(span(c, 'bn'), bt, span(fmtH(h), 'bv')); bars.append(b);
    });
    const tb = $('rRows'); tb.textContent = '';
    if(!rows.length){ const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 8; td.className = 'empty'; td.style.border = 'none'; td.textContent = 'Nothing closed in this range.'; tr.append(td); tb.append(tr); }
    for(const r of rows){
      const tr = document.createElement('tr');
      const cell = (txt, cls) => { const td = document.createElement('td'); if(cls) td.className = cls; if(txt instanceof Node) td.append(txt); else td.textContent = txt; tr.append(td); return td; };
      cell(new Date(r.when).toLocaleString('en-US', r.kind === 'session' ? {month:'short', day:'numeric'} : {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}), 'num');
      cell((parentOf(r.t) ? parentOf(r.t).title + ' › ' : '') + r.t.title + (r.kind === 'session' ? ' (session)' : ''));
      cell(eff(r.t).client || '—');
      cell(r.by ? nameOf(r.by) : '—');
      cell(r.est !== null ? fmtH(r.est) : '—', 'num');
      cell(r.spent !== null ? fmtH(r.spent) : '—', 'num');
      const d = cell(r.deadline ? fmt(parseD(r.deadline)) : '—', 'num');
      if(r.onTime === false) d.append(' ', span('late', 'late')); else if(r.onTime) d.append(' ', span('on time', 'ontime'));
      cell(r.comment || '', 'cm');
      if(r.kind === 'task'){ tr.className = 'clickable'; tr.tabIndex = 0; tr.addEventListener('click', () => openDetails(r.t)); tr.addEventListener('keydown', e => { if(e.key === 'Enter') openDetails(r.t); }); }
      tb.append(tr);
    }
  }
  function reportLabel(){ const [a, b] = rangeBounds(); return `${fmt(a)} – ${fmt(new Date(b.getTime() - DAY))}`; }
  $('copyRep').addEventListener('click', async () => {
    const rows = reportRows(), closed = rows.filter(r => r.kind === 'task');
    const hours = rows.filter(r => r.counts && r.spent !== null).reduce((a,r) => a + r.spent, 0);
    let txt = `Work report, ${reportLabel()}` + (clientFilter !== 'all' ? ` · ${clientFilter === '__none' ? 'No client' : clientFilter}` : '') + `\n${closed.length} tasks closed, ${fmtH(hours)} logged.\n\n`;
    for(const r of closed) txt += `- ${fmt(new Date(r.when))} · ${(parentOf(r.t) ? parentOf(r.t).title + ' › ' : '') + r.t.title}${eff(r.t).client ? ' (' + eff(r.t).client + ')' : ''} · ${r.spent !== null ? fmtH(r.spent) : 'no time logged'}${r.comment ? '\n  ' + r.comment.replace(/\n/g, ' ') : ''}\n`;
    try { await navigator.clipboard.writeText(txt); toast('Summary copied'); }
    catch { toast('Copy isn’t available here'); }
  });
  $('csvRep').addEventListener('click', async () => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [['Closed','Task','Project','Client','Closed by','Estimate (h)','Actual (h)','Deadline','On time','Comment'].map(q).join(',')];
    for(const r of reportRows()) lines.push([new Date(r.when).toISOString(), r.t.title + (r.kind === 'session' ? ' (session)' : ''), parentOf(r.t) ? parentOf(r.t).title : '', eff(r.t).client, r.by ? nameOf(r.by) : '', r.est ?? '', r.spent ?? '', r.deadline || '', r.onTime === null ? '' : (r.onTime ? 'yes' : 'no'), r.comment].map(q).join(','));
    try { await saveFile(`work-report-${dayKey()}.csv`, lines.join('\n'), 'text/csv'); }
    catch(e){ if(!e || e.code !== 'cancelled') toast('Couldn’t export the file'); }
  });
  $('clearEx').addEventListener('click', async () => {
    for(const t of tasks.filter(t => t.example)){ try { await store.remove('tasks', t.id); } catch(e){ fail(e); break; } }
    toast('Examples removed');
  });

  /* ---------- daily form ---------- */
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  function freqText(d){
    const f = freqOf(d), dom = Number(d.dayOfMonth) || 1, dd = dom === -1 ? 'last day' : `day ${dom}`;
    if(f === 'weekly') return `Weekly · ${DAYS.at((Number(d.weekday) || 5) - 1)}`;
    if(f === 'monthly') return `Monthly · ${dd}`;
    if(f === 'quarterly') return `Quarterly · month ${Number(d.quarterMonth) || 1}, ${dd}`;
    return f === 'hours' ? `Every ${d.everyHours}h` : 'Daily';
  }
  (() => { const sel = $('dDay'); for(let i = 1; i <= 28; i++){ const o = document.createElement('option'); o.value = i; o.textContent = i; sel.append(o); }
    const o = document.createElement('option'); o.value = -1; o.textContent = 'Last day'; sel.append(o); })();
  const getFreq = () => (document.querySelector('input[name="dfreq"]:checked') || {}).value || 'daily';
  const parseSubs = txt => String(txt || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [t, e] = l.split('|').map(x => x.trim()); const m = (e || '').match(/^([\d.]+)\s*(m|min|h|d|day)?/i);
    let h = m ? Number(m[1]) : 1; if(m && /^m/i.test(m[2] || '')) h = h / 60; if(m && /^d/i.test(m[2] || '')) h = h * 8;
    return {title: t.slice(0, 120), effort: Math.max(0.25, Math.min(40, h || 1))}; });
  const subsText = subs => (subs || []).map(x => `${x.title} | ${fmtH(Number(x.effort) || 1)}`).join('\n');
  function syncFreq(){
    const f = getFreq(), periodic = !['hours','daily'].includes(f);
    $('hoursField').hidden = f !== 'hours'; $('whenFields').hidden = !periodic; $('taskFields').hidden = !periodic;
    $('wkField').hidden = f !== 'weekly'; $('domField').hidden = !['monthly','quarterly'].includes(f); $('qmField').hidden = f !== 'quarterly';
    $('freqNote').textContent = periodic ? 'Creates a real task ahead of each due date, planned like any other work. Weekend dates move to Friday.'
      : 'A quick check you log on weekdays. It sits on the radar’s inner ring.';
    if(periodic){ const np = nextPeriod({...draftRec(), id: dEditingId || '__new'}); $('nextNote').textContent = np ? `Next due ${fmt(np.due)}.` : ''; }
  }
  function draftRec(){
    return {freq: getFreq(), weekday: Number($('dWeekday').value), dayOfMonth: Number($('dDay').value), quarterMonth: Number($('dQMonth').value),
      lead: Number($('dLead').value), effort: Number($('dEffort').value), importance: Number($('dImp').value), urgency: Number($('dUrg').value),
      subtasks: parseSubs($('dSubs').value)};
  }
  $('dForm').addEventListener('change', syncFreq);
  function openDaily(d){
    dEditingId = d ? d.id : null;
    $('dFormTitle').textContent = d ? 'Edit recurring work' : 'New recurring work';
    $('dTitle').value = d ? d.title : '';
    $('dClient').value = d ? (d.client || '') : '';
    fillSpaceSelect($('dSpace'), d ? d.spaceId : (spaceFilter !== 'all' ? spaceFilter : ''));
    $('dAmount').value = d && d.amount != null ? d.amount : '';
    $({hours:'fqHours', daily:'fqDaily', weekly:'fqWeekly', monthly:'fqMonthly', quarterly:'fqQuarterly'}[d ? freqOf(d) : 'daily']).checked = true;
    $('dHours').value = d && d.everyHours ? d.everyHours : 2;
    $('dWeekday').value = String(d && d.weekday ? d.weekday : 5);
    $('dDay').value = String(d && d.dayOfMonth ? d.dayOfMonth : 1);
    $('dQMonth').value = String(d && d.quarterMonth ? d.quarterMonth : 1);
    $('dLead').value = String(d && d.lead ? d.lead : 3);
    $('dEffort').value = String(d && d.effort ? d.effort : 1);
    $('dImp').value = String(d && d.importance ? d.importance : 3); $('dUrg').value = String(d && d.urgency ? d.urgency : 3);
    $('dSubs').value = d ? subsText(d.subtasks) : '';
    $('dDelBtn').hidden = !d; $('dConfirmDel').hidden = true;
    syncFreq(); $('dScrim').hidden = false; setTimeout(() => $('dTitle').focus(), 30);
  }
  function closeDaily(){ $('dScrim').hidden = true; dEditingId = null; }
  $('addDailyBtn').addEventListener('click', () => openDaily(null));
  $('dCancelBtn').addEventListener('click', closeDaily);
  $('dScrim').addEventListener('click', e => { if(e.target === $('dScrim')) closeDaily(); });
  $('dDelBtn').addEventListener('click', () => { $('dDelBtn').hidden = true; $('dConfirmDel').hidden = false; });
  $('dDelYes').addEventListener('click', async () => { const id = dEditingId; closeDaily(); try { await store.remove('daily', id); toast('Deleted'); } catch(e){ fail(e); } });
  $('dForm').addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('dTitle').value.trim(); if(!title) return;
    const f = getFreq(), hours = Math.min(8, Math.max(1, Math.round(Number($('dHours').value) || 2)));
    const base = dEditingId ? dailies.find(d => d.id === dEditingId) : null;
    const amt = $('dAmount').value === '' ? null : Math.max(0, Number($('dAmount').value) || 0);
    const data = {title, client: $('dClient').value.trim(), spaceId: $('dSpace').value || null, amount: amt, freq: f, everyHours: f === 'hours' ? hours : 0, ...(['hours','daily'].includes(f) ? {} : draftRec()),
      spawned: base ? (base.spawned || []) : [], log: base ? (base.log || null) : null, createdAt: base ? base.createdAt : Date.now(), owner: base ? (base.owner || me || null) : (me || null)};
    const id = dEditingId; closeDaily();
    try {
      if(id) await store.save('daily', id, data); else await store.add('daily', data);
      if(data.client) await ensureClient(data.client);
      toast(id ? 'Updated' : 'Recurring work added');
      setTimeout(spawnRecurring, 800);
    } catch(err){ fail(err); }
  });
  async function check(d){
    const s = dailyState(d), data = {...d, log: {date: dayKey(), checks: [...s.checks, Date.now()]}}; delete data.id;
    try { await store.save('daily', d.id, data); toast('Logged at ' + fmtT(Date.now())); } catch(e){ fail(e); }
  }
  async function undoCheck(d){
    const s = dailyState(d), data = {...d, log: {date: dayKey(), checks: s.checks.slice(0, -1)}}; delete data.id;
    try { await store.save('daily', d.id, data); toast('Last check removed'); } catch(e){ fail(e); }
  }

  document.addEventListener('keydown', e => { if(e.key !== 'Escape') return; if(!$('scrim').hidden) closeForm(); if(!$('dScrim').hidden) closeDaily(); if(!$('cScrim').hidden) closeClose(); $('sScrim').hidden = true; $('fbScrim').hidden = true; $('imScrim').hidden = true; $('emScrim').hidden = true; $('evScrim').hidden = true; if(!$('lScrim').hidden && !authGate && authMode !== 'recover') hideLogin(); closeDetails(); });

  let toastT;
  function toast(msg, undo){
    const t = $('toast'); t.textContent = msg;
    if(undo){ const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-undo'; b.textContent = 'Undo'; b.addEventListener('click', () => { t.hidden = true; undo(); }); t.append(b); }
    t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, undo ? 6000 : 1800);
  }
  function fail(e){
    const code = e && e.code; reportError('save', e && (e.message || e.code));
    toast(code === 'quota_exceeded' ? 'Storage is full. Delete some completed tasks.' :
          code === 'invalid_argument' ? 'You don’t have permission to edit this list.' : 'Couldn’t save. Try again.');
  }

  /* ---------- storage ---------- */

  async function localStore(){
    const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch { return JSON.parse(d); } };
    tasks = load('pr-tasks', '[]'); dailies = load('pr-daily', '[]'); settings = {focusHours: 5, workStart: '08:30', workEnd: '17:30', ...load('pr-settings', '{}')};
    clientDocs = load('pr-clients', '[]'); spaces = load('pr-spaces', '[]'); events = load('pr-events', '[]');
    const mark = (c, id, d, del) => { if(cloudMark) cloudMark(c, id, d, del); };
    const persist = () => {
      try { localStorage.setItem('pr-tasks', JSON.stringify(tasks)); localStorage.setItem('pr-daily', JSON.stringify(dailies)); localStorage.setItem('pr-settings', JSON.stringify(settings)); localStorage.setItem('pr-clients', JSON.stringify(clientDocs)); localStorage.setItem('pr-spaces', JSON.stringify(spaces)); localStorage.setItem('pr-events', JSON.stringify(events)); } catch {}
      render();
    };
    const arr = c => c === 'tasks' ? tasks : c === 'clients' ? clientDocs : c === 'spaces' ? spaces : c === 'events' ? events : dailies;
    const setArr = (c, v) => { if(c === 'tasks') tasks = v; else if(c === 'clients') clientDocs = v; else if(c === 'spaces') spaces = v; else if(c === 'events') events = v; else dailies = v; };
    return {
      add: async (c, d) => { const id = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); setArr(c, [...arr(c), {id, ...d}]); persist(); mark(c, id, d); },
      save: async (c, id, d) => { setArr(c, arr(c).some(t => t.id === id) ? arr(c).map(t => t.id === id ? {id, ...d} : t) : [...arr(c), {id, ...d}]); persist(); mark(c, id, d); },
      remove: async (c, id) => { const gone = arr(c).find(t => t.id === id); setArr(c, arr(c).filter(t => t.id !== id)); persist(); mark(c, id, gone || null, true); },
      saveSettings: async () => { persist(); mark('settings', 'main', settings); },
      // a change that came from the cloud: update this device without queueing it again
      apply: (c, id, d, del) => {
        if(c === 'settings'){ if(!del && d) settings = {focusHours: 5, workStart: '08:30', workEnd: '17:30', ...d}; return; }
        if(!['tasks', 'daily', 'clients', 'spaces', 'events'].includes(c)) return;
        const cur = arr(c);
        if(del) setArr(c, cur.filter(t => t.id !== id));
        else setArr(c, cur.some(t => t.id === id) ? cur.map(t => t.id === id ? {...d, id} : t) : [...cur, {...d, id}]);
      },
      flush: () => persist(),
    };
  }

  /* ---------- cloud sync (Supabase) ----------
     Local-first: every change is saved on this device first, queued in
     "pending", and pushed when online and signed in. Then changes made on
     other devices are pulled. Each record is one row in the "items" table
     (id = "<collection>:<id>"). A change still waiting on this device wins
     over the cloud copy; otherwise the most recent save wins. */
  const KINDS = ['tasks', 'daily', 'clients', 'spaces', 'events', 'settings'];
  const seenRows = new Set();
  const savePending = () => { try { localStorage.setItem('pr-pending', JSON.stringify(pending)); } catch {} };
  // a record in a shared space carries that space's id so its members can read it
  const sharedOf = sid => { const sp = spaceById(sid); return sp && sp.shared ? sp.id : null; };
  function sharedSpaceFor(kind, id, src){
    if(kind === 'spaces') return src.shared ? id : null;
    if(kind === 'tasks'){ const par = src.parentId ? byId(src.parentId) : null; return sharedOf(par ? par.spaceId : src.spaceId); }
    if(kind === 'daily' || kind === 'events') return sharedOf(src.spaceId);
    return null;
  }
  function queueChange(kind, id, d, del){
    if(!KINDS.includes(kind) || id == null) return;
    const src = d || {}, data = del ? {} : {...src}; delete data.id; delete data._owner;
    pending[kind + ':' + id] = {kind, data, deleted: !!del, at: Date.now(), owner: src._owner || null, space: sharedSpaceFor(kind, id, src)};
    savePending(); renderSync();
    clearTimeout(pushT); pushT = setTimeout(syncNow, 1500);
  }
  /* ---------- shared spaces ----------
     A shared space lives in "shared_spaces"; its people in "space_members".
     Records in it carry space_id, and the database lets every member read and
     edit them. When you join a space, its history is pulled in full; when you
     leave or are removed, its records are taken off this device. */
  let sharingReady = false, sharingProbed = false, shareOpenId = null;
  const shareMembers = new Map();
  async function syncMemberships(take){
    let rows;
    try { const {data, error} = await sb.from('space_members').select('space_id'); if(error) throw error; rows = data; sharingReady = true; }
    catch { sharingReady = false; return 0; }   // sharing tables not set up yet
    const mem = new Set(rows.map(r => r.space_id));
    let known = []; try { known = JSON.parse(localStorage.getItem('pr-shared-known') || '[]'); } catch {}
    let n = 0;
    for(const sid of mem) if(!known.includes(sid)){
      for(let page = 0; ; page++){
        const {data, error} = await sb.from('items').select('id,kind,data,deleted,updated_at,user_id').eq('space_id', sid).order('id').range(page * 1000, page * 1000 + 999);
        if(error) break;
        data.forEach(take); n += data.length;
        if(data.length < 1000) break;
      }
    }
    for(const sid of known) if(!mem.has(sid)){
      const sp = spaceById(sid); if(!sp || !sp._owner) continue;   // only drop spaces someone else shared with you
      const inSpace = t => (t.parentId ? (byId(t.parentId) || {}).spaceId : t.spaceId) === sid;
      for(const t of tasks.filter(inSpace)) store.apply('tasks', t.id, null, true);
      for(const r of dailies.filter(r => r.spaceId === sid)) store.apply('daily', r.id, null, true);
      store.apply('spaces', sid, null, true); n++;
      if(spaceFilter === sid) spaceFilter = 'all';
    }
    try { localStorage.setItem('pr-shared-known', JSON.stringify([...mem])); } catch {}
    return n;
  }
  async function shareSpace(x, email){
    if(!sb || !cloudUser){ toast('Sign in to share'); return; }
    email = String(email || '').trim().toLowerCase();
    if(!EMAIL.test(email)){ toast('Enter a valid email'); return; }
    if(email === String(cloudUser.email || '').toLowerCase()){ toast('That’s your own account'); return; }
    let sp = x;
    if(!x.shared){
      const {data, error} = await sb.from('shared_spaces').insert({name: x.name}).select('id').single();
      if(error){ toast(error.message); return; }
      sharingReady = true;
      sp = await rekeySpace(x, data.id);
    }
    // invite through the owner-only function (security-update-1.sql); older databases use the previous lookup
    let {data: added, error: e2} = await sb.rpc('invite_to_space', {p_space: sp.id, p_email: email});
    if(e2 && /function|schema cache/i.test(e2.message)){
      const {data: uid, error: e1} = await sb.rpc('user_id_by_email', {p_email: email});
      if(e1){ toast(e1.message); return; }
      added = !!uid; e2 = null;
      if(uid){ const {error: e3} = await sb.from('space_members').insert({space_id: sp.id, user_id: uid, email}); if(e3 && !/duplicate/i.test(e3.message)){ toast(e3.message); return; } }
    }
    if(e2){ toast(e2.message); return; }
    if(!added){ toast(`${email} doesn’t have a Kairo account yet. Send them an invite code to sign up, then share the space again.`); return; }
    shareOpenId = sp.id; toast(`Shared ${sp.name} with ${email}`);
    await syncNow(); loadMembers(sp.id);
  }
  // a space gets a new id when it's first shared; everything in it moves along
  async function rekeySpace(x, nid){
    const {id: old, ...rest} = x;
    await store.save('spaces', nid, {...rest, shared: true, ownerId: cloudUser.id});
    for(const t of tasks.filter(t => !t.parentId && t.spaceId === old)){ const d = {...t, spaceId: nid}; delete d.id; await store.save('tasks', t.id, d); }
    for(const t of tasks.filter(t => t.parentId && (byId(t.parentId) || {}).spaceId === nid)){ const d = {...t}; delete d.id; await store.save('tasks', t.id, d); }
    for(const r of dailies.filter(r => r.spaceId === old)){ const d = {...r, spaceId: nid}; delete d.id; await store.save('daily', r.id, d); }
    await store.remove('spaces', old);
    if(spaceFilter === old) setSpaceFilter(nid);
    return spaceById(nid);
  }
  const memberEmail = uid => { for(const list of shareMembers.values()){ const m = list.find(x => x.user_id === uid); if(m) return m.email; } return null; };
  const sharedSpaceOf = t => { const sp = spaceOf(t); return sp && sp.shared ? sp : null; };
  function sharedTip(sp, t){
    const ms = (shareMembers.get(sp.id) || []).map(m => m.user_id === (cloudUser || {}).id ? 'you' : m.email);
    let tip = `Shared space “${sp.name}”` + (ms.length ? ` · ${ms.join(', ')}` : '') + (sp._owner ? ` · shared by ${memberEmail(sp._owner) || 'someone else'}` : '');
    if(t) tip += t._owner ? ` · added by ${memberEmail(t._owner) || 'another member'}` : ' · added by you';
    return tip;
  }
  const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2c2.4.2 4 1.7 4.5 4.3"/></svg>';
  function shareBadge(sp, t, withText){
    const b = document.createElement('span'); b.className = 'shared-badge'; b.innerHTML = SHARE_ICON;
    if(withText) b.append(document.createTextNode(t && t._owner ? 'Shared · ' + ((memberEmail(t._owner) || '').split('@')[0] || 'member') : 'Shared'));
    b.title = sharedTip(sp, t); b.setAttribute('aria-label', b.title); return b;
  }
  async function loadMembers(sid){
    if(!sb) return;
    const {data, error} = await sb.from('space_members').select('user_id,email').eq('space_id', sid).order('added_at');
    shareMembers.set(sid, error ? [] : data); if(!$('sScrim').hidden) renderClientRows();
    clearTimeout(loadMembers.t); loadMembers.t = setTimeout(render, 50);
  }
  async function removeMember(sid, uid){
    const {error} = await sb.from('space_members').delete().eq('space_id', sid).eq('user_id', uid);
    if(error){ toast(error.message); return; }
    toast(uid === cloudUser.id ? 'You left the space' : 'Removed'); await syncNow(); loadMembers(sid);
  }

  async function syncNow(){
    if(!sb || !cloudUser || !navigator.onLine || !store || !store.apply){ renderSync(); return; }
    if(syncBusy){ syncAgain = true; return; }
    syncBusy = true; cloudErr = ''; renderSync();
    try {
      // find out once whether the sharing tables exist, before pushing
      if(!sharingProbed){ try { const {error} = await sb.from('space_members').select('space_id').limit(1); sharingReady = !error; } catch { sharingReady = false; } sharingProbed = true; }
      // push this device's changes
      const out = Object.entries(pending);
      for(let i = 0; i < out.length; i += 200){
        const part = out.slice(i, i + 200);
        const {error} = await sb.from('items').upsert(part.map(([rid, p]) => ({user_id: p.owner || cloudUser.id, id: rid, kind: p.kind, data: p.data, deleted: p.deleted, ...(sharingReady ? {space_id: p.space || null} : {})})), {onConflict: 'user_id,id'});
        if(error) throw error;
        for(const [rid, p] of part) if(pending[rid] && pending[rid].at === p.at) delete pending[rid];
        savePending();
      }
      // pull changes from other devices (10 s overlap so nothing slips between syncs)
      let last = null; try { last = localStorage.getItem('pr-lastpull'); } catch {}
      const from = last ? new Date(new Date(last.replace(/(\.\d{3})\d+/, '$1')).getTime() - 10000).toISOString() : null;
      let maxTs = last, changed = 0;
      const take = r => {
        const key = r.id + '@' + r.updated_at;
        if(!pending[r.id] && !seenRows.has(key)){
          const k = r.id.indexOf(':'), d = {...(r.data || {})};
          if(r.user_id && r.user_id !== cloudUser.id) d._owner = r.user_id;   // someone else's record in a shared space
          store.apply(r.kind, r.id.slice(k + 1), d, r.deleted); changed++;
        }
        seenRows.add(key);
      };
      changed += await syncMemberships(take);
      if(sharingReady) for(const sp of spaces.filter(x => x.shared)) if(!shareMembers.has(sp.id)) loadMembers(sp.id);
      for(let page = 0; ; page++){
        let q = sb.from('items').select('id,kind,data,deleted,updated_at,user_id').order('updated_at').order('id').range(page * 1000, page * 1000 + 999);
        if(from) q = q.gte('updated_at', from);
        const {data, error} = await q; if(error) throw error;
        for(const r of data){ take(r); if(!maxTs || r.updated_at > maxTs) maxTs = r.updated_at; }
        if(data.length < 1000) break;
      }
      if(maxTs) try { localStorage.setItem('pr-lastpull', maxTs); } catch {}
      if(changed) store.flush();
      lastSyncAt = Date.now();
      if(!spacesChecked) ensureSpaces();
    } catch(e){ cloudErr = (e && e.message) || 'Sync failed'; }
    finally {
      syncBusy = false; renderSync();
      if(syncAgain){ syncAgain = false; setTimeout(syncNow, 300); }
    }
  }
  function renderSync(){
    const b = $('syncBtn'); if(!b) return;
    const n = Object.keys(pending).length;
    let txt, st = 'off';
    if(!sb) txt = 'This device only' + (n ? ` · ${n} change${n === 1 ? '' : 's'} saved here` : '');
    else if(!cloudUser) txt = 'Not signed in · this device only';
    else if(!navigator.onLine) txt = 'Offline' + (n ? ` · ${n} to sync` : '') + ' · keeps working';
    else if(syncBusy){ txt = 'Syncing…'; st = 'busy'; }
    else if(cloudErr){ txt = 'Sync error: ' + cloudErr; st = 'err'; }
    else if(n){ txt = `${n} change${n === 1 ? '' : 's'} waiting to sync`; st = 'busy'; }
    else { txt = lastSyncAt ? `Synced ${fmtT(lastSyncAt)}` : 'Synced'; st = 'ok'; }
    $('acctSyncTxt').textContent = txt;
    $('syncDot').className = $('syncDot2').className = 'sdot ' + st;
    $('acctBtn').title = txt;
    b.textContent = sb && !cloudUser ? 'Sign in to sync' : 'Sync now';
    b.hidden = !sb;
    const who = settings.displayName || (cloudUser && cloudUser.email) || '';
    $('acctBtn').textContent = who ? who[0].toUpperCase() : '•';
    $('acctEmail').textContent = cloudUser ? (settings.displayName ? settings.displayName + ' · ' : 'Signed in as ') + cloudUser.email : (settings.displayName || 'Your planner');
    $('acctPass').hidden = $('acctOut').hidden = !cloudUser;
    if(!$('sScrim').hidden) renderCloudInfo();
  }
  function renderCloudInfo(){
    const n = Object.keys(pending).length;
    $('cloudInfo').textContent = !sb ? 'The sync service didn’t load. Check your connection and reload.'
      : cloudUser ? `Signed in as ${cloudUser.email}. ` + (n ? `${n} change${n === 1 ? '' : 's'} waiting to upload.` : 'Everything is synced.')
      : 'Not signed in. Changes stay on this device and upload when you sign in.';
    $('cloudUpload').hidden = !cloudUser; $('cloudSignOut').hidden = !cloudUser; $('cloudPass').hidden = !cloudUser; $('delAcct').hidden = !cloudUser;
    renderInvites();
  }
  // Hosted version: nothing shows until you sign in.
  const GATE = location.protocol !== 'file:';
  const TERMS_VERSION = 'alpha-1';   // only the local copy opened from Documents skips sign-in
  // The sign-in screen covers everything from the first paint; it lifts only once a session is confirmed.
  if(!GATE){ $('lScrim').hidden = true; $('lScrim').classList.remove('checking'); }
  const hasSavedSession = () => { try { return [...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(k => /^sb-.*-auth-token$/.test(k)); } catch { return false; } };
  let authMode = 'signin', authGate = false;
  const remember = () => { try { return localStorage.getItem('pr-remember') !== '0'; } catch { return true; } };
  // "Remember me" off keeps the session only until the browser closes
  const authStorage = {
    getItem: k => { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; } },
    setItem: (k, v) => { try { (remember() ? localStorage : sessionStorage).setItem(k, v); (remember() ? sessionStorage : localStorage).removeItem(k); } catch {} },
    removeItem: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch {} },
  };
  const AUTH = {
    signin:  {head: 'Sign in', sub: 'Your plan for today, on every device.', go: 'Sign in', email: true, pass: true, pass2: false, row: true, passL: 'Password'},
    forgot:  {head: 'Reset password', sub: 'Enter your email and we’ll send you a link to set a new password.', go: 'Send reset link', email: true, pass: false, pass2: false, row: false},
    signup:  {head: 'Create your account', sub: 'Enter the invite code you received. Kairo is in early testing (alpha).', go: 'Create account', email: true, pass: true, pass2: true, row: false, passL: 'Password (8+ characters)', code: true},
    recover: {head: 'Set a new password', sub: 'Choose a password with at least 8 characters.', go: 'Save password', email: false, pass: true, pass2: true, row: false, passL: 'New password'},
  };
  function setAuthMode(m){
    authMode = m; const c = AUTH[m === 'change' ? 'recover' : m];
    $('lHead').textContent = c.head; $('lSub').textContent = c.sub; $('lGo').textContent = c.go;
    $('lEmailF').hidden = !c.email; $('lPassF').hidden = !c.pass; $('lPass2F').hidden = !c.pass2; $('lRow').hidden = !c.row;
    $('lCodeF').hidden = $('lTermsF').hidden = !c.code; $('lJoin').hidden = m !== 'signin';
    $('lPass2F').querySelector('span').textContent = m === 'signup' ? 'Confirm password' : 'Confirm new password';
    $('lPassL').textContent = c.passL || 'Password';
    $('lPass').autocomplete = c.pass2 ? 'new-password' : 'current-password';
    $('lPass').value = ''; $('lPass2').value = '';
    $('lMsg').textContent = ''; $('lMsg').classList.remove('ok');
    $('lCancel').textContent = m === 'forgot' || m === 'signup' ? 'Back to sign in' : 'Cancel';
    $('lCancel').hidden = authGate && m !== 'forgot' && m !== 'signup';
    $('lFoot').textContent = m === 'change' || m === 'recover' ? '' : 'Accounts are by invitation.';
    setTimeout(() => (c.code && !$('lCode').value ? $('lCode') : c.email ? $('lEmail') : $('lPass')).focus(), 30);
  }
  // an invite link looks like …/planner-app/?invite=KAIRO-1A2B3C4D
  const inviteParam = (() => { try { return (new URLSearchParams(location.search).get('invite') || '').trim().toUpperCase(); } catch { return ''; } })();
  function showLogin(gate, mode = 'signin'){
    if(mode === 'signin' && inviteParam){ mode = 'signup'; $('lCode').value = inviteParam; }
    authGate = gate; $('lRemember').checked = remember(); $('lScrim').classList.remove('checking');
    $('lScrim').hidden = false; setAuthMode(mode);
  }
  const hideLogin = () => { $('lScrim').hidden = true; authGate = false; };
  const gated = () => GATE && !!sb && !cloudUser;
  function setCloudUser(u){
    setTimeout(() => takeShared(), 400);
    const was = cloudUser && cloudUser.id; cloudUser = u || null;
    if(gated()) showLogin(true);
    else if($('lScrim').classList.contains('checking')){ $('lScrim').classList.remove('checking'); $('lScrim').hidden = true; }
    else if(authGate && authMode === 'signin') hideLogin();
    renderSync();
    if(cloudUser && was !== cloudUser.id) syncNow();
  }
  async function initCloud(){
    cloudMark = queueChange;   // queue changes even before signing in
    if(!(window.supabase && window.supabase.createClient)){
      renderSync();
      if(GATE){
        // sync service unreachable: let a device that was signed in keep working offline
        if(hasSavedSession()){ $('lScrim').classList.remove('checking'); $('lScrim').hidden = true; }
        else { showLogin(true); authMsg('Couldn’t reach the sync service. Check your connection and reload.'); }
      }
      return;
    }
    sb = window.supabase.createClient(CLOUD_URL, CLOUD_KEY, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage}});
    try { const {data} = await sb.auth.getSession(); setCloudUser(data.session ? data.session.user : null); } catch { setCloudUser(null); }
    sb.auth.onAuthStateChange((ev, session) => {
      setCloudUser(session ? session.user : null);
      if(ev === 'PASSWORD_RECOVERY') showLogin(true, 'recover');   // arrived from a reset-password email
    });
    window.addEventListener('online', syncNow);
    window.addEventListener('offline', renderSync);
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') syncNow(); });
    setInterval(syncNow, 30 * 1000);
  }
  { const logo = document.querySelector('.brand img'); if(logo) $('lLogo').src = logo.src; $('lName').textContent = APP_NAME; $('lTag').textContent = APP_TAGLINE; }
  $('syncBtn').addEventListener('click', () => {
    if(sb && !cloudUser) showLogin(GATE);
    else { syncNow(); toast('Syncing…'); }
  });
  document.querySelectorAll('.peek').forEach(b => b.addEventListener('click', () => {
    const i = $(b.dataset.for), show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; i.focus();
  }));
  $('lRemember').addEventListener('change', () => { try { localStorage.setItem('pr-remember', $('lRemember').checked ? '1' : '0'); } catch {} });
  $('lForgot').addEventListener('click', () => setAuthMode('forgot'));
  $('lCancel').addEventListener('click', () => { if(authMode === 'forgot' || authMode === 'signup') setAuthMode('signin'); else hideLogin(); });
  $('lJoin').addEventListener('click', () => setAuthMode('signup'));
  /* ---------- Help & how-tos ---------- */
  let helpLang = (() => { try { const v = localStorage.getItem('pr-help-lang'); if(v) return v; } catch {} return /^es\b/i.test(navigator.language || '') ? 'es' : 'en'; })();
  let helpCur = null;
  const helpData = () => (window.KAIRO_HELP || {})[helpLang] || (window.KAIRO_HELP || {}).en;
  const stripTags = h => String(h).replace(/<[^>]+>/g, ' ');
  function openHelp(id){
    closeAcct(); closeNew();
    if(!window.KAIRO_HELP){
      const sc = document.createElement('script'); sc.src = 'help.js';
      sc.onload = () => openHelp(id); sc.onerror = () => toast('Help isn’t available offline yet. Reload once with internet.');
      document.head.append(sc); return;
    }
    $('hScrim').hidden = false; $('hSearch').value = '';
    showHelp(id && helpData().articles.some(a => a.id === id) ? id : null);
    if(!id) setTimeout(() => $('hSearch').focus(), 30);
  }
  function closeHelp(){ $('hScrim').hidden = true; }
  function showHelp(id){
    const H = helpData(); helpCur = id;
    document.querySelectorAll('.h-lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === helpLang)));
    $('hTitle').textContent = H.ui.title; $('hSearch').placeholder = H.ui.search; $('hSearch').setAttribute('aria-label', H.ui.search);
    $('hBackTxt').textContent = H.ui.back; $('hStuck').textContent = H.ui.stuck; $('hAsk').textContent = H.ui.ask;
    $('hBack').hidden = !id; $('hList').hidden = !!id; $('hArt').hidden = !id;
    $('hScrim').querySelector('.sheet').classList.toggle('reading', !!id);
    if(id){
      const a = H.articles.find(x => x.id === id);
      $('hArt').innerHTML = `<h4></h4>${a.body}`; $('hArt').querySelector('h4').textContent = a.title;
      const links = [...a.body.matchAll(/data-go="([\w-]+)"/g)].map(m => m[1]);
      const same = H.articles.filter(x => x.group === a.group && x.id !== a.id).map(x => x.id);
      const rel = [...new Set([...links, ...same])].filter(x => x !== a.id).slice(0, 4);
      if(rel.length){
        const box = document.createElement('div'); box.className = 'h-related';
        const g = document.createElement('div'); g.className = 'h-group'; g.textContent = H.ui.related; box.append(g);
        for(const r of rel){ const x = H.articles.find(y => y.id === r); if(!x) continue; const l = document.createElement('a'); l.dataset.go = r; l.textContent = x.title; box.append(l); }
        $('hArt').append(box);
      }
      $('hScrim').querySelector('.sheet').scrollTop = 0;
    } else renderHelpList();
  }
  function renderHelpList(){
    const H = helpData(), q = fold($('hSearch').value).trim(), box = $('hItems'); box.textContent = '';
    const words = q.split(/\s+/).filter(Boolean);
    const hit = a => { const hay = fold(a.title + ' ' + a.sum + ' ' + a.tags + ' ' + stripTags(a.body)); return words.every(w => hay.includes(w)); };
    const score = a => { const t = fold(a.title + ' ' + a.tags); return words.filter(w => t.includes(w)).length; };
    const item = a => { const b = document.createElement('button'); b.type = 'button'; b.className = 'h-item'; b.dataset.go = a.id;
      const t = document.createElement('b'); t.textContent = a.title; const s0 = document.createElement('span'); s0.textContent = a.sum; b.append(t, s0); return b; };
    if(words.length){
      const found = H.articles.filter(hit).sort((a, b) => score(b) - score(a));
      if(!found.length){ const e = document.createElement('div'); e.className = 'h-empty'; e.textContent = H.ui.none; box.append(e); return; }
      const grid = document.createElement('div'); grid.className = 'h-grid'; found.forEach(a => grid.append(item(a))); box.append(grid); return;
    }
    for(const [gid, gname] of H.groups){
      const list = H.articles.filter(a => a.group === gid); if(!list.length) continue;
      const g = document.createElement('div'); g.className = 'h-group'; g.textContent = gname;
      const grid = document.createElement('div'); grid.className = 'h-grid'; list.forEach(a => grid.append(item(a)));
      box.append(g, grid);
    }
  }
  const HELP_DO = {settings: () => $('settingsBtn').click(), new: () => $('addBtn').click(), search: () => openSearch(), import: () => $('importAppBtn').click(),
    feedback: () => $('feedbackBtn').click(), calendar: () => $('tabCal').click(), radar: () => $('tabRadar').click(), projects: () => $('tabProjects').click(), today: () => $('tabToday').click()};
  $('helpBtn').addEventListener('click', () => openHelp());
  $('hClose').addEventListener('click', closeHelp);
  $('hBack').addEventListener('click', () => { showHelp(null); $('hSearch').focus(); });
  $('hAsk').addEventListener('click', () => { closeHelp(); $('feedbackBtn').click(); });
  $('hScrim').addEventListener('click', e => {
    if(e.target === $('hScrim')){ closeHelp(); return; }
    const go = e.target.closest('[data-go]'); if(go){ e.preventDefault(); showHelp(go.dataset.go); return; }
    const d = e.target.closest('[data-do]'); if(d && HELP_DO[d.dataset.do]){ closeHelp(); HELP_DO[d.dataset.do](); return; }
    const l = e.target.closest('[data-lang]'); if(l){ helpLang = l.dataset.lang; try { localStorage.setItem('pr-help-lang', helpLang); } catch {} showHelp(helpCur); }
  });
  $('hSearch').addEventListener('input', renderHelpList);
  $('hSearch').addEventListener('keydown', e => { if(e.key === 'Enter'){ const f = $('hItems').querySelector('.h-item'); if(f){ e.preventDefault(); showHelp(f.dataset.go); } } });
  document.addEventListener('click', e => { const h = e.target.closest('[data-help]'); if(h && !h.closest('#hScrim')){ e.preventDefault(); e.stopPropagation(); openHelp(h.dataset.help); } }, true);
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && !$('hScrim').hidden){ e.stopImmediatePropagation(); if(helpCur) showHelp(null); else closeHelp(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || (e.target || {}).isContentEditable;
    if(e.key === '?' && !typing && $('lScrim').hidden && $('hScrim').hidden){ e.preventDefault(); openHelp(); }
  }, true);

  /* ---------- features (modules) ---------- */
  // accounts from before modules existed keep everything on
  // does anything get planned in work hours? (no: the work-hours card is hidden)
  function hasWork(){ return !spaces.length || spaces.some(x => ['work', 'any'].includes((rootSpace(x) || x).planDuring || 'work')); }
  function mod(k){ return !settings.modules || !!settings.modules[k]; }
  function applyModules(){
    const b = document.body.classList;
    for(const k of ['clients', 'ops', 'detail']) b.toggle('mod-' + k, mod(k));
    b.toggle('mod-routine', mod('ops') || dailies.length > 0);
    b.toggle('mod-work', hasWork());
  }
  function renderFeatures(){
    $('ftDetail').checked = mod('detail'); $('ftClients').checked = mod('clients'); $('ftOps').checked = mod('ops');
  }
  for(const id of ['ftDetail', 'ftClients', 'ftOps']) $(id).addEventListener('change', async () => {
    settings = {...settings, modules: {detail: $('ftDetail').checked, clients: $('ftClients').checked, ops: $('ftOps').checked}};
    applyModules(); render();
    try { await store.saveSettings(settings); } catch(e){ fail(e); }
  });

  /* ---------- quick add: one line becomes a task ---------- */
  function taskFromText(txt){
    let s0 = ' ' + String(txt || '') + ' ', effort = null, prio = null;
    s0 = s0.replace(/\s(\d+(?:[.,]\d+)?)\s*(h|hrs?|horas?|hours?)(?=[\s,.;!]|$)/i, (m, n) => { effort = Number(n.replace(',', '.')); return ' '; });
    if(effort === null) s0 = s0.replace(/\s(\d+)\s*(m|mins?|minutos?|minutes?)(?=[\s,.;!]|$)/i, (m, n) => { effort = Number(n) / 60; return ' '; });
    s0 = s0.replace(/\s(urgente|urgent|asap)(?=[\s,.;!]|$)/i, () => { prio = 'urgent'; return ' '; });
    s0 = s0.replace(/\s(importante|important)(?=[\s,.;!]|$)/i, () => { prio = prio || 'high'; return ' '; });
    const r = parseEventText(s0.trim());
    let title = String(r.title || '').replace(/[\s,;:–-]+$/, '');
    for(let i = 0; i < 3; i++) title = title.replace(/\s+(by|due|before|on|until|para el|para|antes del|antes de|del|de|el|hasta el|hasta|a las|at)$/i, '').replace(/[\s,;:–-]+$/, '');
    title = title.trim() || String(txt).trim();
    return {title: title[0].toUpperCase() + title.slice(1), deadline: r.explicitDate ? dayKey(r.start) : null, effort: effort === null ? null : Math.max(0.25, Math.round(effort * 4) / 4), prio};
  }
  let qaPick = null;
  const qaSpace = () => spaceById(qaPick) || scopeSp() || (hasWork() ? defaultSpace() : spaceById('sp-personal') || defaultSpace());
  function qaPreview(){
    const v = $('qaText').value.trim(), box = $('qaPrev'); box.textContent = ''; box.hidden = !v; if(!v) return;
    const q = taskFromText(v), sp = qaSpace();
    const b = document.createElement('b'); b.textContent = q.title;
    box.append(b, ' · ' + (q.deadline ? 'due ' + fmt(parseD(q.deadline)) : 'no deadline') + ' · ' + fmtH(q.effort ?? 0.5) + (q.effort === null ? ' (guess)' : '') + (q.prio ? ' · ' + q.prio[0].toUpperCase() + q.prio.slice(1) : '') + ' · ');
    if(spaces.length > 1){ const sel = document.createElement('select'); sel.className = 'qa-space'; sel.setAttribute('aria-label', 'Space');
      for(const x of spacesSorted().filter(inScope)){ const o = document.createElement('option'); o.value = x.id; o.textContent = x.name; sel.append(o); }
      sel.value = sp ? sp.id : ''; sel.addEventListener('change', () => { qaPick = sel.value; }); box.append(sel, ' '); }
    else if(sp) box.append(sp.name + ' ');
    const more = document.createElement('button'); more.type = 'button'; more.className = 'linkbtn'; more.textContent = 'More details';
    more.addEventListener('click', () => { openForm(null); $('fTitle').value = q.title; if(q.deadline) $('fDate').value = q.deadline; setEffort(q.effort ?? 0.5);
      if(q.prio){ setRadio('imp', PRIO[q.prio][0]); setRadio('urg', PRIO[q.prio][1]); prioFromRadios(); } if(sp) $('fSpace').value = sp.id; updatePreview(); $('qaText').value = ''; qaPreview(); });
    box.append(more);
  }
  $('qaText').addEventListener('input', qaPreview);
  $('qaForm').addEventListener('submit', async e => {
    e.preventDefault(); const v = $('qaText').value.trim(); if(!v) return;
    const q = taskFromText(v), sp = qaSpace(), [imp, urg] = PRIO[q.prio || 'normal'];
    const data = {title: q.title.slice(0, 140), client: '', parentId: null, assignees: me ? [me] : [], importance: imp, urgency: urg, deadline: q.deadline, effort: q.effort ?? 0.5, mode: 'normal',
      notes: '', done: false, doneAt: null, sessions: [], attachments: [], fields: [], progress: 0,
      createdAt: Date.now(), example: false, spaceId: sp ? sp.id : null, amount: null};
    $('qaText').value = ''; qaPreview();
    try { await store.save('tasks', newTaskId(), data); if(sp) qaPick = sp.id; toast(`Added: ${data.title}` + (q.deadline ? ` · due ${fmt(parseD(q.deadline))}` : '')); } catch(err){ fail(err); }
  });

  /* ---------- getting started (new accounts) ---------- */
  function seen(k){ try { return localStorage.getItem('pr-seen-' + k) === '1'; } catch { return false; } }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { try { localStorage.setItem('pr-seen-' + b.dataset.tab, '1'); } catch {} }));
  function renderGettingStarted(){
    const card = $('gsCard');
    const mineT = tasks.filter(t => !t._owner && !t.example);
    const steps = [
      ['Add a task with a deadline', mineT.some(t => t.deadline), 'Type it in the box above, like “Report Friday 2h”.', () => $('qaText').focus()],
      ['See everything on the Radar', seen('radar'), 'Top right is what matters most.', () => $('tabRadar').click()],
      ['Add an event by typing or speaking', events.length > 0, '“Dentist Thursday at 3, remind me 1 hour before”.', () => $('tabCal').click()],
      ['Mark something as done', mineT.some(t => t.done), 'Open a task and press “Mark as done”.', null],
      ['Put Kairo on your phone', seen('install') || matchMedia('(display-mode: standalone)').matches, 'Use it like an app, even offline.', () => { try { localStorage.setItem('pr-seen-install', '1'); } catch {} openHelp('install'); }]
    ];
    const done = steps.filter(x => x[1]).length;
    card.hidden = !settings.modules || settings.gsHidden || done === steps.length;
    if(card.hidden) return;
    card.textContent = '';
    const head = document.createElement('div'); head.className = 'gs-head';
    let open; try { open = localStorage.getItem('pr-gs-open'); } catch {} open = open == null ? done === 0 : open === '1';
    const h = document.createElement('button'); h.type = 'button'; h.className = 'gs-toggle'; h.setAttribute('aria-expanded', String(open));
    h.textContent = `Get started · ${done} of ${steps.length}`;
    h.addEventListener('click', () => { try { localStorage.setItem('pr-gs-open', open ? '0' : '1'); } catch {} renderGettingStarted(); });
    card.classList.toggle('closed', !open);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'linkbtn'; x.textContent = 'Hide';
    x.addEventListener('click', async () => { settings = {...settings, gsHidden: true}; card.hidden = true; try { await store.saveSettings(settings); } catch {} });
    head.append(h, x); card.append(head);
    const bar = document.createElement('div'); bar.className = 'gs-bar'; const fill = document.createElement('i'); fill.style.width = (done / steps.length * 100) + '%'; bar.append(fill); card.append(bar);
    if(!open) return;
    for(const [t, ok, hint, go] of steps){
      const r = document.createElement(go && !ok ? 'button' : 'div'); r.className = 'gs-step' + (ok ? ' ok' : ''); if(r.tagName === 'BUTTON'){ r.type = 'button'; r.addEventListener('click', go); }
      const c = document.createElement('i'); c.textContent = ok ? '✓' : ''; const tx = document.createElement('span'); const tb = document.createElement('b'); tb.textContent = t; const th = document.createElement('small'); th.textContent = hint; tx.append(tb, th);
      r.append(c, tx); card.append(r);
    }
  }

  /* ---------- space switcher ---------- */
  function renderScope(){
    const f = scopeSp();
    const sh = scope === '__shared' && spaces.some(x => x.shared);
    if(scope === '__shared' && !sh) scope = 'all';
    $('scopeTxt').textContent = f ? f.name : sh ? 'Shared' : 'All spaces';
    $('scopeSw').style.background = f ? (f.color || 'var(--ink)') : 'conic-gradient(' + (spacesSorted().slice(0, 4).map(x => x.color).join(',') || 'var(--muted),var(--muted)') + ')';
    if(sh) $('scopeSw').style.background = 'var(--mid)'; $('scopeBtn').classList.toggle('on', !!f || sh); $('scopeBtn').setAttribute('aria-label', 'Space: ' + (f ? f.name : 'all spaces')); document.body.classList.toggle('in-scope', !!f || sh);
    document.documentElement.style.setProperty('--scope', f ? (f.color || 'var(--accent)') : sh ? 'var(--mid)' : 'transparent');
    $('scopeWrap').hidden = spaces.length < 2;
    const m = $('scopeMenu'); m.textContent = '';
    const item = (id, name, sub, color) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(scope === id || (id === 'all' && !f)));
      const t = document.createElement('b'); const i = document.createElement('i'); i.className = 'sw'; i.style.background = color; t.append(i, document.createTextNode(name)); const sm0 = document.createElement('small'); sm0.textContent = sub; b.append(t, sm0);
      b.addEventListener('click', () => setScope(id)); m.append(b); };
    item('all', 'All spaces', 'See everything', 'var(--muted)');
    for(const x of spacesSorted().filter(x => !linkTarget(x))){ const l = linkedTo(x); item(x.id, x.name, 'Only ' + x.name + (l.length ? ' + ' + l.map(y => y.name).join(', ') : '') + ' · everything else hidden', x.color); }
    if(spaces.some(x => x.shared)) item('__shared', 'Shared', 'Only spaces you share with others', 'var(--mid)');
    // the same choice as chips on Today
    const ch = $('todaySpaces'); ch.textContent = ''; ch.hidden = spaces.length < 2;
    const chip = (id, name, color) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sp-chip'; b.setAttribute('aria-pressed', String(scope === id || (id === 'all' && !f && !sh)));
      if(color){ const i = document.createElement('i'); i.style.background = color; b.append(i); } b.append(document.createTextNode(name)); b.addEventListener('click', () => { if(b.getAttribute('aria-pressed') !== 'true') setScope(id); }); ch.append(b); };
    chip('all', 'All');
    for(const x of spacesSorted().filter(x => !linkTarget(x))) chip(x.id, x.name, x.color);
    if(spaces.some(x => x.shared)) chip('__shared', 'Shared', 'var(--mid)');
  }
  function setScope(id){
    scope = id; spaceFilter = 'all'; projOpen = null;
    try { localStorage.setItem('pr-scope', id); localStorage.setItem('pr-space', 'all'); } catch {}
    closeScope(); render(); if(tab === 'calendar') renderCalendar();
    const f = scopeSp(); toast(f ? `You’re in ${f.name}. Other spaces are hidden.` : id === '__shared' ? 'Showing only shared spaces' : 'Showing all spaces');
  }
  function closeScope(){ $('scopeMenu').hidden = true; $('scopeBtn').setAttribute('aria-expanded', 'false'); }
  $('scopeBtn').addEventListener('click', e => { e.stopPropagation(); closeNew(); closeAcct(); const open = $('scopeMenu').hidden; $('scopeMenu').hidden = !open; $('scopeBtn').setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', e => { if(!e.target.closest('#scopeWrap')) closeScope(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !$('scopeMenu').hidden){ closeScope(); $('scopeBtn').focus(); } });

  function closeAcct(){ $('acctMenu').hidden = true; $('acctBtn').setAttribute('aria-expanded', 'false'); }
  $('acctBtn').addEventListener('click', e => { e.stopPropagation(); closeNew(); const open = $('acctMenu').hidden; $('acctMenu').hidden = !open; $('acctBtn').setAttribute('aria-expanded', String(open)); if(open){ const f = $('acctMenu').querySelector('button:not([hidden])'); if(f) f.focus(); } });
  document.addEventListener('click', e => { if(!e.target.closest('#acctWrap')) closeAcct(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !$('acctMenu').hidden){ closeAcct(); $('acctBtn').focus(); } });
  $('acctMenu').addEventListener('click', e => { if(e.target.closest('button')) closeAcct(); });
  $('acctPass').addEventListener('click', () => { closeAcct(); showLogin(false, 'change'); });
  $('acctOut').addEventListener('click', () => { closeAcct(); $('cloudSignOut').click(); });
  $('cloudPass').addEventListener('click', () => { $('sScrim').hidden = true; showLogin(false, 'change'); });
  const authMsg = (t, ok) => { $('lMsg').textContent = t; $('lMsg').classList.toggle('ok', !!ok); };
  $('lForm').addEventListener('submit', async e => {
    e.preventDefault(); if(!sb){ authMsg('Couldn’t reach the sync service. Check your connection and reload.'); return; }
    const email = $('lEmail').value.trim(), pass = $('lPass').value;
    if(AUTH[authMode === 'change' ? 'recover' : authMode].email && !EMAIL.test(email)){ authMsg('Enter a valid email address.'); $('lEmail').focus(); return; }
    $('lGo').disabled = true;
    try {
      if(authMode === 'signin'){
        if(!pass){ authMsg('Enter your password.'); $('lPass').focus(); return; }
        authMsg('Signing in…', true);
        const {error} = await sb.auth.signInWithPassword({email, password: pass});
        if(error){ authMsg(/invalid/i.test(error.message) ? 'Incorrect email or password.' : error.message); return; }
        hideLogin(); toast('Welcome back · syncing');
      } else if(authMode === 'signup'){
        const code = $('lCode').value.trim().toUpperCase();
        if(!code){ authMsg('Enter your invite code.'); $('lCode').focus(); return; }
        if(pass.length < 8){ authMsg('Use at least 8 characters.'); $('lPass').focus(); return; }
        if(pass !== $('lPass2').value){ authMsg('The passwords don’t match.'); $('lPass2').focus(); return; }
        if(!$('lTerms').checked){ authMsg('Please read and accept the Terms and Privacy.'); $('lTerms').focus(); return; }
        authMsg('Creating your account…', true);
        const {data, error} = await sb.auth.signUp({email, password: pass, options: {emailRedirectTo: location.origin + location.pathname,
          data: {invite: code, terms: TERMS_VERSION, terms_at: new Date().toISOString()}}});
        if(error){ authMsg(/database error|invite/i.test(error.message) ? 'That invite code isn’t valid, has expired or was already used. Check it with the person who sent it.'
          : /registered|exists/i.test(error.message) ? 'That email already has an account. Sign in instead.' : /signups? not allowed|disabled/i.test(error.message) ? 'New accounts are closed right now.' : error.message); return; }
        if(location.search) history.replaceState(null, '', location.pathname);
        if(!data.session){ authMsg('Account created. Check your email to confirm it, then sign in.', true); return; }
        hideLogin(); toast('Welcome to Kairo!');
      } else if(authMode === 'forgot'){
        authMsg('Sending…', true);
        const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
        if(error){ authMsg(error.message); return; }
        authMsg('If that email has an account, a reset link is on its way. Check your inbox.', true);
      } else {
        if(pass.length < 8){ authMsg('Use at least 8 characters.'); $('lPass').focus(); return; }
        if(pass !== $('lPass2').value){ authMsg('The passwords don’t match.'); $('lPass2').focus(); return; }
        authMsg('Saving…', true);
        const {error} = await sb.auth.updateUser({password: pass});
        if(error){ authMsg(error.message); return; }
        hideLogin(); toast('Password updated');
        if(location.hash) history.replaceState(null, '', location.pathname);
      }
    } catch { authMsg('Couldn’t reach the sync service. Check your connection.'); }
    finally { $('lGo').disabled = false; }
  });
  /* ---------- invite codes (admins only; see alpha-setup.sql) ---------- */
  let isAdmin = null;
  async function renderInvites(){
    if(!sb || !cloudUser){ $('invField').hidden = true; return; }
    if(isAdmin === null){ try { const {data, error} = await sb.rpc('is_admin'); isAdmin = !error && data === true; } catch { isAdmin = false; } }
    $('invField').hidden = !isAdmin; if(!isAdmin) return;
    const {data} = await sb.from('invite_codes').select('code,note,uses,max_uses,expires_at,created_at').order('created_at', {ascending: false}).limit(50);
    const box = $('invList'); box.textContent = '';
    for(const r of data || []){
      const live = r.uses < r.max_uses && (!r.expires_at || new Date(r.expires_at) > new Date());
      const row = document.createElement('div'); row.className = 'inv-row' + (live ? '' : ' off');
      const code = document.createElement('b'); code.textContent = r.code;
      const info = span(`${r.note ? r.note + ' · ' : ''}${r.uses}/${r.max_uses} used` + (r.expires_at ? ` · ${live ? 'until' : 'ended'} ${fmt(new Date(r.expires_at))}` : ''), 'fnote');
      row.append(code, info);
      if(live){
        const cp = document.createElement('button'); cp.type = 'button'; cp.className = 'btn sm'; cp.textContent = 'Copy link';
        cp.addEventListener('click', async () => { const url = `${location.origin}${location.pathname}?invite=${r.code}`;
          try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch { prompt('Copy this link:', url); } });
        const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'linkbtn'; stop.textContent = 'Stop';
        stop.addEventListener('click', async () => { const {error} = await sb.from('invite_codes').update({max_uses: r.uses}).eq('code', r.code); if(error) toast(error.message); else { toast('Code stopped'); renderInvites(); } });
        row.append(cp, stop);
      }
      box.append(row);
    }
  }
  $('invForm').addEventListener('submit', async e => {
    e.preventDefault();
    const {data, error} = await sb.rpc('create_invite', {p_note: $('invNote').value.trim(), p_uses: Number($('invUses').value) || 5, p_days: Number($('invDays').value)});
    if(error){ toast(error.message); return; }
    $('invNote').value = ''; toast('Code created: ' + data); renderInvites();
  });

  /* ---------- delete my account ---------- */
  $('delAcct').addEventListener('click', () => { $('daType').value = ''; $('daGo').disabled = true; $('daMsg').textContent = ''; $('daScrim').hidden = false; setTimeout(() => $('daType').focus(), 30); });
  $('daCancel').addEventListener('click', () => { $('daScrim').hidden = true; });
  $('daType').addEventListener('input', () => { $('daGo').disabled = $('daType').value.trim().toUpperCase() !== 'DELETE'; });
  $('daForm').addEventListener('submit', async e => {
    e.preventDefault(); if($('daType').value.trim().toUpperCase() !== 'DELETE' || !sb || !cloudUser) return;
    $('daGo').disabled = true; $('daMsg').textContent = 'Deleting your files…';
    try {
      // files first: Storage only deletes them through its own API
      const bucket = sb.storage.from('attachments'), uid = cloudUser.id, paths = [];
      try {
        const {data: dirs} = await bucket.list(uid, {limit: 1000});
        for(const dir of dirs || []){ const {data: fs} = await bucket.list(`${uid}/${dir.name}`, {limit: 1000}); for(const f of fs || []) paths.push(`${uid}/${dir.name}/${f.name}`); }
        for(let i = 0; i < paths.length; i += 100) await bucket.remove(paths.slice(i, i + 100));
      } catch {}
      $('daMsg').textContent = 'Deleting your account…';
      const {error} = await sb.rpc('delete_my_account');
      if(error){ $('daMsg').textContent = /function|schema cache/i.test(error.message) ? 'Account deletion isn’t set up on the server yet. Nothing was deleted.' : 'Couldn’t delete: ' + error.message; $('daGo').disabled = false; return; }
      try { await sb.auth.signOut(); } catch {}
      try { Object.keys(localStorage).filter(k => k.startsWith('pr-') || k.startsWith('sb-')).forEach(k => localStorage.removeItem(k)); sessionStorage.clear(); } catch {}
      alert('Your account and data were deleted.');
      location.replace(location.pathname);
    } catch { $('daMsg').textContent = 'Couldn’t reach the server. Nothing more was deleted; try again.'; $('daGo').disabled = false; }
  });

  /* ---------- error reports (kept 30 days; see alpha-setup.sql) ---------- */
  const errSeen = new Set();
  function reportError(place, err){
    try {
      const msg = String((err && (err.stack || err.message)) || err || '').slice(0, 500);
      if(!sb || !cloudUser || !msg || errSeen.has(msg) || errSeen.size >= 10) return;
      errSeen.add(msg);
      sb.from('app_errors').insert({version: APP_VERSION, place: String(place).slice(0, 60), message: msg, agent: navigator.userAgent.slice(0, 200)}).then(() => {}, () => {});
    } catch {}
  }
  window.addEventListener('error', e => reportError('page' + (tab ? ':' + tab : ''), e.error || e.message));
  window.addEventListener('unhandledrejection', e => reportError('promise' + (tab ? ':' + tab : ''), e.reason));

  // Signing out also removes this device's copy, so nobody else using it sees your tasks.
  $('cloudSignOut').addEventListener('click', async () => {
    const n = Object.keys(pending).length;
    if(n && !confirm(`${n} change${n === 1 ? '' : 's'} haven’t uploaded yet and will be lost. Sign out anyway?`)) return;
    try { await sb.auth.signOut(); } catch {}
    try { ['pr-tasks','pr-daily','pr-settings','pr-clients','pr-spaces','pr-events','pr-fired','pr-shared-known','pr-outbox','pr-delivery','pr-pending','pr-lastpull'].forEach(k => localStorage.removeItem(k)); } catch {}
    location.reload();
  });
  $('cloudUpload').addEventListener('click', () => {
    tasks.forEach(t => queueChange('tasks', t.id, t));
    dailies.forEach(d => queueChange('daily', d.id, d));
    clientDocs.forEach(c => queueChange('clients', c.id, c));
    spaces.forEach(x => queueChange('spaces', x.id, x));
    events.forEach(x => queueChange('events', x.id, x));
    queueChange('settings', 'main', settings);
    toast(`${tasks.length + dailies.length + clientDocs.length} items queued for upload`);
    renderCloudInfo(); syncNow();
  });

  /* ---------- name & app install ---------- */
  document.title = APP_NAME;
  { const bs = document.querySelector('.brand span'); if(bs){ bs.firstChild.textContent = APP_NAME; bs.querySelector('small').textContent = APP_TAGLINE; } }
  if('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

  $('appVersion').textContent = 'v' + APP_VERSION;
  $('today').textContent = new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  render();

  (async () => {
    store = await localStore(); dataReady = true; render(); await initCloud(); spawnRecurring();
    if(!GATE || !sb) ensureSpaces();
    setTimeout(() => takeShared(), 300);
  })();

  setInterval(spawnRecurring, 10 * 60 * 1000);
  setInterval(() => { if($('scrim').hidden && $('dScrim').hidden && $('cScrim').hidden && $('sScrim').hidden && $('fbScrim').hidden && $('imScrim').hidden && $('emScrim').hidden && $('evScrim').hidden && $('qScrim').hidden && $('vScrim').hidden && $('lScrim').hidden) render(); }, 60 * 1000);
})();
