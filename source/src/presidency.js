// Presidency side of Elders Quorum Notebook.
// Everything here lives in the presidency's Supabase database. Only the presidency's sign-in emails can
// read or change it (enforced by the database's access rules, not by this code).
window.EQP = function (api) {
  'use strict';
  var esc = api.esc, ICON = api.ICON, toast = api.toast, ui = api.ui;
  var SUPABASE_URL = 'https://pmnofvrsohmqurvfwaai.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtbm9mdnJzb2htcXVydmZ3YWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NDM0NTUsImV4cCI6MjEwNzQxOTQ1NX0.TiOvtTuh5ROENG08pZ3reB45RC-JXsti7RRvO55iWFA'; // public key; access is controlled by the database rules
  var TAB_KEY = 'eq-presidency-tab';

  var PI = {
    doc: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    msg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    cal: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    ok: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    no: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
  };

  // ---------- Dates (interviews are always on a Sunday, stored as YYYY-MM-DD) ----------
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function nextSunday() { var t = today0(); return addDays(t, (7 - t.getDay()) % 7); }
  function todayIso() { return iso(today0()); }
  function fmtSun(s) { return parseIso(s).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
  function sunLabel(s) {
    if (s === todayIso()) return 'Today';
    if (s === iso(nextSunday())) return 'This Sunday · ' + fmtSun(s);
    return 'Sunday · ' + fmtSun(s);
  }
  function upcomingSundays(n) { var out = [], s = nextSunday(); for (var i = 0; i < n; i++) out.push(iso(addDays(s, 7 * i))); return out; }
  function quarterStart(offset) { var d = today0(); var q = Math.floor(d.getMonth() / 3) + (offset || 0); return new Date(d.getFullYear(), q * 3, 1); }
  function quarterName(offset) { var s = quarterStart(offset); return 'Q' + (Math.floor(s.getMonth() / 3) + 1) + ' ' + s.getFullYear(); }

  // ---------- State ----------
  var S = {
    phase: 'loading',   // loading | signed-out | sent | not-presidency | ready | error
    email: '', me: null, tab: 'overview', district: 'all',
    presidency: [], districts: [], brothers: [], families: [], comps: [], interviews: [], lots: [], away: [],
    settings: { agendaUrl: '', room: '', template: '' }
  };
  try { S.tab = localStorage.getItem(TAB_KEY) || 'overview'; } catch (e) {}
  var sb = null;
  function client() {
    if (!sb && window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'eq-notebook-auth' } });
    }
    return sb;
  }

  function rows(r) { if (r.error) throw r.error; return r.data || []; }
  function load() {
    var c = client();
    return Promise.all([
      c.from('presidency').select('*').order('sort'),
      c.from('districts').select('*').order('id'),
      c.from('ministers').select('*').order('last').order('first'),
      c.from('households').select('*').order('surname'),
      c.from('companionships').select('*').order('id'),
      c.from('companionship_members').select('*'),
      c.from('interviews').select('*').order('date'),
      c.from('lots').select('*'),
      c.from('settings').select('*'),
      c.from('unavailable').select('*')
    ]).then(function (res) {
      var pres = rows(res[0]);
      if (!pres.length) { S.phase = 'not-presidency'; return; }
      S.presidency = pres;
      S.districts = rows(res[1]);
      S.brothers = rows(res[2]);
      S.families = rows(res[3]).map(function (h) { return { id: h.id, name: h.name, surname: h.surname, lot: h.lot_id, comp: h.comp_id }; });
      var mem = rows(res[5]);
      S.comps = rows(res[4]).map(function (c) {
        return {
          id: c.id, district: c.district,
          members: mem.filter(function (m) { return m.comp_id === c.id; }).map(function (m) { return m.minister_id; }),
          families: S.families.filter(function (f) { return f.comp === c.id; }).map(function (f) { return f.id; })
        };
      });
      S.interviews = rows(res[6]).map(function (i) { return { id: i.id, compId: i.comp_id, date: i.date, by: i.by_id || '', status: i.status, names: i.names, texted: i.texted || {}, movedFrom: i.moved_from || null, attendance: i.attendance || {} }; });
      S.lots = rows(res[7]);
      rows(res[8]).forEach(function (s) { S.settings[s.key] = s.value; });
      S.away = rows(res[9]).map(function (a) { return { who: a.presidency_id, date: a.date }; });
      var em = S.email.toLowerCase();
      S.me = (pres.filter(function (p) { return (p.email || '').toLowerCase() === em; })[0] || {}).id || null;
      S.phase = 'ready';
    });
  }
  function refresh() {
    return load().then(api.render, function (e) { S.phase = 'error'; S.error = e && e.message || String(e); api.render(); });
  }
  // Runs a change against the database, then reloads so every screen reflects what was saved.
  function save(promises, okMsg) {
    api.render();
    return Promise.all(promises).then(function (res) {
      res.forEach(function (r) { if (r && r.error) throw r.error; });
      if (okMsg) toast(okMsg);
      return refresh();
    }).catch(function (e) {
      toast('Couldn’t save: ' + (e && e.message ? e.message : 'check your connection'));
      return refresh();
    });
  }

  function start() {
    var c = client();
    if (!c) { S.phase = 'error'; S.error = 'The sign-in library didn’t load. Check your connection and reopen the app.'; return; }
    c.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) {
        if (S.email !== session.user.email || (S.phase !== 'ready' && S.phase !== 'loading')) { S.email = session.user.email; S.phase = 'loading'; refresh(); }
      } else if (event === 'SIGNED_OUT') { S.phase = 'signed-out'; S.email = ''; api.render(); }
    });
    c.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (s) { S.email = s.user.email; refresh(); } else if (S.phase === 'loading') { S.phase = 'signed-out'; if (ui.view === 'pres') api.render(); }
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && S.phase === 'ready' && ui.view === 'pres') refresh(); });
  }

  // ---------- Lookups ----------
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function bro(id) { return find(S.brothers, id); }
  function fam(id) { return find(S.families, id); }
  function comp(id) { return find(S.comps, id); }
  function pm(id) { return find(S.presidency, id); }
  function iv(id) { return find(S.interviews, id); }
  function lot(id) { return find(S.lots, id); }
  function fullName(b) { return b ? b.first.split(' ')[0] + ' ' + b.last : ''; }
  function famName(f) { if (!f) return ''; var p = f.name.split(','); return p.length > 1 ? p[1].trim() + ' ' + p[0].trim() : f.name; }
  function compLabel(c) {
    if (!c) return 'Former companionship';
    var n = c.members.map(function (id) { return fullName(bro(id)); }).filter(Boolean);
    return n.length ? n.join(' & ') : 'No companions yet';
  }
  // Past interviews keep the names of who was in the companionship at the time.
  function ivLabel(i) { if (i.status !== 'scheduled' && i.names) return i.names; var c = comp(i.compId); return c ? compLabel(c) : (i.names || 'Former companionship'); }
  function famLabel(c) { return c.families.map(function (id) { return famName(fam(id)); }).filter(Boolean).join(' · '); }
  function compOf(bid) { return S.comps.filter(function (c) { return c.members.indexOf(bid) >= 0; })[0] || null; }
  function pmName(m) { return m ? m.first + (m.last ? ' ' + m.last : '') : 'the presidency'; }
  function pmFormal(m) {
    if (!m) return 'a member of the presidency';
    var t = m.role === 'President' ? 'President ' : 'Brother ';
    return t + (m.last || m.first);
  }
  function districtLeader(d) { var x = find(S.districts, d); return x ? pm(x.leader) : null; }
  function interviewers() { return S.presidency.filter(function (p) { return p.interviews; }); }
  function activeComps() { return S.comps.filter(function (c) { return c.members.length; }); }
  function inDistrict(c) { return S.district === 'all' || String(c.district) === S.district; }
  function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
  function upcomingFor(cid) { var t = todayIso(); return S.interviews.filter(function (i) { return i.compId === cid && i.status === 'scheduled' && i.date >= t; }).sort(byDate)[0] || null; }
  function attendedInQuarter(cid, off) {
    var a = iso(quarterStart(off)), b = iso(quarterStart((off || 0) + 1));
    return S.interviews.filter(function (i) { return i.compId === cid && i.status === 'attended' && i.date >= a && i.date < b; }).sort(byDate).pop() || null;
  }
  function compStatus(c) {
    var done = attendedInQuarter(c.id, 0);
    if (done) return { kind: 'done', text: 'Interviewed ' + fmtSun(done.date) };
    var up = upcomingFor(c.id);
    if (up) return { kind: 'sched', text: 'Scheduled ' + fmtSun(up.date) };
    return { kind: 'need', text: 'Needs an interview this quarter' };
  }
  function needsCheckoff() { var t = todayIso(); return S.interviews.filter(function (i) { return i.status === 'scheduled' && i.date < t && shown(i); }).sort(byDate); }
  function missedOpen() {
    return S.interviews.filter(function (i) { return i.status === 'missed' && comp(i.compId) && !upcomingFor(i.compId) && !attendedInQuarter(i.compId, 0); });
  }

  // ---------- Whose interviews to show ----------
  // Interviewers (president and counselors) see only their own by default; everyone else sees all.
  var SCOPE_KEY = 'eq-presidency-scope';
  function canFilter() { var m = pm(S.me); return !!(m && m.interviews); }
  function scope() {
    if (!canFilter()) return 'all';
    try { return localStorage.getItem(SCOPE_KEY) === 'all' ? 'all' : 'mine'; } catch (e) { return S.scopeMem || 'mine'; }
  }
  function setScope(v) { S.scopeMem = v; try { localStorage.setItem(SCOPE_KEY, v); } catch (e) {} }
  function shown(i) { return scope() === 'all' || i.by === S.me; }
  function scopeToggle() {
    if (!canFilter()) return '';
    var all = scope() === 'all';
    return '<button class="scope-btn" data-act="p-scope" aria-pressed="' + all + '">' + (all ? 'See my own' : 'See all') + '</button>';
  }

  // ---------- Interview rhythm ----------
  // Each district leader interviews his own district's companionships, two per Sunday (settings.perSunday),
  // skipping the Sundays he has marked as away.
  function perSunday() { return +S.settings.perSunday || 2; }
  function isAway(who, date) { return S.away.some(function (a) { return a.who === who && a.date === date; }); }
  function leaderOf(c) { var d = c && find(S.districts, c.district); return d ? d.leader : null; }
  function bookedOn(who, date, extra) {
    return S.interviews.filter(function (i) { return i.by === who && i.date === date && i.status === 'scheduled'; }).length + ((extra && extra[date]) || 0);
  }
  // The first Sunday from `from` on where `who` is available and has room.
  function nextOpen(who, from, extra) {
    var d = parseIso(from || iso(nextSunday()));
    for (var k = 0; k < 104; k++) {
      var s = iso(addDays(d, 7 * k));
      if (!isAway(who, s) && bookedOn(who, s, extra) < perSunday()) return s;
    }
    return null;
  }
  function needsScheduling() {
    return activeComps().filter(function (c) { return c.families.length && !attendedInQuarter(c.id, 0) && !upcomingFor(c.id) && leaderOf(c); });
  }

  // ---------- Changes (each one writes to the database) ----------
  function db() { return client(); }
  function seq(steps) { return steps.reduce(function (p, f) { return p.then(function () { return f().then(function (r) { if (r && r.error) throw r.error; }); }); }, Promise.resolve()); }
  function snapshotSteps(cid) {
    var c = comp(cid); if (!c) return [];
    var label = compLabel(c);
    return S.interviews.filter(function (i) { return i.compId === cid && !i.names && i.status !== 'scheduled'; })
      .map(function (i) { return function () { return db().from('interviews').update({ names: label }).eq('id', i.id); }; });
  }
  function fail(e) { toast('Couldn’t save: ' + (e && e.message ? e.message : 'check your connection')); return refresh(); }
  // Move a minister into a companionship. If his old companionship ends up empty it is removed, and its
  // upcoming interview carries over when the new companionship has none.
  function moveBrother(bid, toCid) {
    var from = compOf(bid), to = comp(toCid);
    if (!to || from === to) return Promise.resolve();
    var steps = snapshotSteps(toCid).concat(from ? snapshotSteps(from.id) : []);
    if (from) steps.push(function () { return db().from('companionship_members').delete().eq('comp_id', from.id).eq('minister_id', bid); });
    steps.push(function () { return db().from('companionship_members').insert({ comp_id: toCid, minister_id: bid }); });
    var msg = fullName(bro(bid)) + ' moved';
    if (from && from.members.length === 1) {
      var up = upcomingFor(from.id), toUp = upcomingFor(toCid);
      if (up && !toUp) steps.push(function () { return db().from('interviews').update({ comp_id: toCid }).eq('id', up.id); });
      else if (up) steps.push(function () { return db().from('interviews').delete().eq('id', up.id); });
      steps.push(function () { return db().from('companionships').delete().eq('id', from.id); });
      if (from.families.length) msg += '. ' + from.families.length + (from.families.length === 1 ? ' family needs' : ' families need') + ' new ministers';
    }
    return seq(steps).then(function () { toast(msg); return refresh(); }, fail);
  }
  function removeBrother(cid, bid) {
    var c = comp(cid); if (!c) return;
    var last = c.members.length === 1;
    var steps = snapshotSteps(cid);
    steps.push(function () { return db().from('companionship_members').delete().eq('comp_id', cid).eq('minister_id', bid); });
    if (last) {
      var up = upcomingFor(cid);
      if (up) steps.push(function () { return db().from('interviews').delete().eq('id', up.id); });
      steps.push(function () { return db().from('companionships').delete().eq('id', cid); });
      ui.sheet = null;
    }
    return seq(steps).then(function () { toast(last ? 'Companionship removed; its families need new ministers' : 'Removed'); return refresh(); }, fail);
  }
  function assignFamily(fid, cid) { return save([db().from('households').update({ comp_id: cid }).eq('id', fid)], cid ? 'Family assigned' : 'Family unassigned'); }
  function schedule(cid, date, by) {
    var up = upcomingFor(cid);
    if (up) return save([db().from('interviews').update({ date: date, by_id: by || null, texted: {} }).eq('id', up.id)], 'Moved to ' + fmtSun(date));
    return save([db().from('interviews').insert({ comp_id: cid, date: date, by_id: by || null, status: 'scheduled' })], 'Scheduled for ' + fmtSun(date));
  }
  // Away Sundays. Nothing moves without asking: tapping a Sunday opens a sheet that offers to move that day's
  // interviews (or, when un-marking, to bring back the ones that were moved off it).
  function onDay(who, date) { return S.interviews.filter(function (i) { return i.by === who && i.date === date && i.status === 'scheduled'; }); }
  function movedOff(who, date) { return S.interviews.filter(function (i) { return i.by === who && i.movedFrom === date && i.status === 'scheduled'; }); }
  function setAway(date, move) {
    var who = S.me, c = client();
    S.away.push({ who: who, date: date });
    var ops = [c.from('unavailable').insert({ presidency_id: who, date: date })], to = [];
    if (move) {
      var extra = {}, start = iso(addDays(parseIso(date), 7));
      onDay(who, date).forEach(function (i) {
        var s2 = nextOpen(who, start, extra);
        if (!s2) return;
        extra[s2] = (extra[s2] || 0) + 1; if (to.indexOf(fmtSun(s2)) < 0) to.push(fmtSun(s2));
        ops.push(c.from('interviews').update({ date: s2, moved_from: date, texted: {} }).eq('id', i.id));
      });
    }
    return save(ops, 'Away ' + fmtSun(date) + (to.length ? '. Moved to ' + to.join(' and ') : ''));
  }
  function setBack(date, restore) {
    var who = S.me, c = client();
    var ops = [c.from('unavailable').delete().eq('presidency_id', who).eq('date', date)];
    var back = restore ? movedOff(who, date) : [];
    back.forEach(function (i) { ops.push(c.from('interviews').update({ date: date, moved_from: null, texted: {} }).eq('id', i.id)); });
    return save(ops, fmtSun(date) + ' is available again' + (back.length ? '. ' + back.length + (back.length === 1 ? ' interview' : ' interviews') + ' moved back' : ''));
  }
  // Give every companionship that still needs an interview this quarter a slot with its district leader.
  function fillSchedule() {
    var c = client(), extra = {}, ops = [];
    needsScheduling().forEach(function (cp) {
      var who = leaderOf(cp), e = extra[who] = extra[who] || {};
      var s = nextOpen(who, null, e);
      if (!s) return;
      e[s] = (e[s] || 0) + 1;
      ops.push(c.from('interviews').insert({ comp_id: cp.id, date: s, by_id: who, status: 'scheduled' }));
    });
    if (!ops.length) { toast('Everyone already has an interview this quarter'); return; }
    save(ops, 'Scheduled ' + ops.length + (ops.length === 1 ? ' interview' : ' interviews'));
  }
  function setStatus(id, st) {
    var i = iv(id); if (!i) return;
    var c = comp(i.compId), names = st === 'scheduled' ? null : compLabel(c);
    var att = {};
    if (st !== 'scheduled' && c) c.members.forEach(function (b) { att[b] = { name: fullName(bro(b)), came: st === 'attended' }; });
    i.status = st; i.attendance = att;
    return save([db().from('interviews').update({ status: st, names: names, attendance: att }).eq('id', id)]);
  }
  // Mark one companion as came / didn't come. Once everyone is marked, the interview is checked off:
  // attended if anyone came, otherwise didn't attend.
  function markPerson(id, bid, came) {
    var i = iv(id), c = i && comp(i.compId); if (!i || !c) return;
    var att = Object.assign({}, i.attendance || {});
    if (att[bid] && att[bid].came === came) delete att[bid]; else att[bid] = { name: fullName(bro(bid)), came: came };
    var all = c.members.every(function (b) { return att[b]; });
    var upd = { attendance: att };
    if (all) { upd.status = c.members.some(function (b) { return att[b].came; }) ? 'attended' : 'missed'; upd.names = compLabel(c); }
    i.attendance = att; if (all) i.status = upd.status;
    return save([db().from('interviews').update(upd).eq('id', id)], all ? (upd.status === 'attended' ? 'Checked off' : 'Marked as not attended') : null);
  }

  // ---------- Texts ----------
  function smsHref(phone, body) {
    var num = String(phone || '').replace(/[^\d+]/g, '');
    return 'sms:' + num + '?&body=' + encodeURIComponent(body);
  }
  function reminderText(i, b) {
    var c = comp(i.compId), others = c ? c.members.filter(function (x) { return x !== b.id; }).map(function (x) { return 'Brother ' + bro(x).last; }) : [];
    var when = i.date === todayIso() ? 'today' : i.date === iso(nextSunday()) ? 'this Sunday (' + fmtSun(i.date) + ')' : 'on Sunday, ' + fmtSun(i.date);
    var me = pm(S.me);
    return String(S.settings.template || '')
      .replace(/\{last\}/g, b.last).replace(/\{first\}/g, b.first.split(' ')[0])
      .replace(/\{you\}/g, others.length ? 'you and ' + others.join(' and ') : 'you')
      .replace(/\{interviewer\}/g, pmFormal(pm(i.by)))
      .replace(/\{when\}/g, when).replace(/\{room\}/g, S.settings.room || 'the church')
      .replace(/\{sender\}/g, me ? pmName(me) : 'Elders Quorum presidency');
  }

  // ---------- Screens ----------
  function head(sub, actions) {
    return '<header class="top"><div><h1>Presidency</h1><div class="private">' + sub + '</div></div>' + (actions ? '<div class="top-actions">' + actions + '</div>' : '') + '</header>';
  }
  function render() {
    if (S.phase === 'loading') return head('Loading…') + '<main class="p-main"><div class="empty"><b>Loading the presidency’s data…</b></div></main>';
    if (S.phase === 'error') return head('Something went wrong') + '<main class="p-main"><section class="panel"><h2>Couldn’t load</h2><p class="note-p">' + esc(S.error || '') + '</p><div class="row"><button class="primary" data-act="p-retry">Try again</button><button class="secondary" data-act="p-signout">Sign out</button></div></section></main>';
    if (S.phase === 'signed-out' || S.phase === 'sent') return renderSignIn();
    if (S.phase === 'not-presidency') return head(esc(S.email)) + '<main class="p-main"><section class="panel"><h2>Not on the presidency list</h2><p class="note-p">' + esc(S.email) + ' isn’t one of the presidency’s sign-in emails. If it should be, ask Brother Walker to add it.</p><div class="row"><button class="secondary" data-act="p-signout">Sign out</button></div></section></main>';
    var me = pm(S.me);
    var agenda = S.settings.agendaUrl
      ? '<a class="icon-btn" href="' + esc(S.settings.agendaUrl) + '" target="_blank" rel="noopener" aria-label="Open the presidency meeting notes">' + PI.doc + '</a>'
      : '<button class="icon-btn" data-act="p-settings" aria-label="Add the presidency meeting agenda link">' + PI.doc + '</button>';
    var h = head(esc(me ? pmName(me) + ' · ' + me.role : S.email), agenda + '<button class="icon-btn" data-act="p-settings" aria-label="Presidency settings">' + ICON.gear + '</button>');
    var tabs = [['overview', 'Overview'], ['interviews', 'Interviews'], ['ministering', 'Ministering'], ['map', 'Map']];
    h += '<div class="seg" role="tablist" aria-label="Presidency sections">' + tabs.map(function (t) {
      var on = S.tab === t[0];
      return '<button role="tab" aria-selected="' + on + '" class="' + (on ? 'on' : '') + '" data-act="p-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    var body = S.tab === 'interviews' ? renderInterviews() : S.tab === 'ministering' ? renderMinistering() : S.tab === 'map' ? renderMap() : renderOverview();
    return h + '<main class="p-main">' + body + '</main>';
  }

  function renderSignIn() {
    var h = head(ICON.lock + 'Elders quorum presidency only') + '<main class="p-main">';
    if (S.phase === 'sent') {
      h += '<section class="panel"><h2>Check your email</h2><p class="note-p">We sent a sign-in email to <b>' + esc(S.email) + '</b>. Tap the link in it, or type the code from the email here.</p>' +
        '<form class="field" data-form="p-code"><label for="p-code">Code from the email</label><div class="row"><input id="p-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456"><button class="primary" type="submit">Sign in</button></div></form>' +
        '<p class="note-p">Using the Home Screen app on iPhone? Type the code so you sign in inside the app; the link opens Safari instead.</p>' +
        '<div class="row"><button class="text-btn" data-act="p-other-email">Use a different email</button></div></section>';
    } else {
      h += '<section class="panel"><h2>Sign in</h2><p class="note-p">For the elders quorum presidency. Enter your email and we’ll send you a sign-in link. There’s no password.</p>' +
        '<form class="field" data-form="p-signin"><label for="p-email">Email</label><div class="row"><input id="p-email" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com" value="' + esc(S.email) + '"><button class="primary" type="submit">Send link</button></div></form></section>';
    }
    return h + '</main>';
  }

  function districtChips() {
    var opts = [['all', 'All districts']].concat(S.districts.map(function (d) { var l = pm(d.leader); return [String(d.id), 'District ' + d.id + (l ? ' · ' + l.first : '')]; }));
    return '<div class="chips-row" role="group" aria-label="District">' + opts.map(function (o) {
      return '<button class="chip' + (S.district === o[0] ? ' on' : '') + '" data-act="p-district" data-d="' + o[0] + '" aria-pressed="' + (S.district === o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function ivRow(i, mode) {
    var c = comp(i.compId), me = S.me, mine = i.by === me;
    var by = pm(i.by);
    var h = '<div class="irow' + (mine ? ' mine' : '') + '"><div class="irow-top"><div class="irow-txt"><b>' + esc(ivLabel(i)) + '</b>' +
      (c && c.families.length ? '<small>' + esc(famLabel(c)) + '</small>' : '') + '</div>';
    if (i.status === 'attended') h += '<button class="st st-done" data-act="p-status" data-id="' + i.id + '" data-st="scheduled" aria-label="Attended. Tap to undo">' + PI.ok + 'Attended</button>';
    else if (i.status === 'missed') h += '<button class="st st-miss" data-act="p-status" data-id="' + i.id + '" data-st="scheduled" aria-label="Did not attend. Tap to undo">' + PI.no + 'Didn’t attend</button>';
    h += '</div><div class="irow-meta">';
    if (mode !== 'recent') h += '<button class="who' + (mine ? ' mine' : '') + '" data-act="p-by" data-id="' + i.id + '" aria-label="Interviewer: ' + esc(by ? pmName(by) : 'anyone') + '. Tap to change">with ' + esc(by ? (mine ? 'you' : pmName(by)) : 'anyone') + '</button>';
    else h += '<span class="who plain">' + fmtSun(i.date) + (by ? ' · with ' + esc(pmName(by)) : '') + '</span>';
    h += '<span class="spacer"></span>';
    var t = todayIso();
    if (i.status === 'scheduled' && i.date <= t && c) {
      h += '<button class="mini ok" data-act="p-status" data-id="' + i.id + '" data-st="attended">' + PI.ok + 'All came</button>';
    }
    if (i.status === 'scheduled' && i.date >= t) {
      var sent = c ? c.members.filter(function (b) { return i.texted && i.texted[b]; }).length : 0;
      h += '<button class="mini" data-act="p-text" data-id="' + i.id + '" aria-expanded="' + (ui.pText === i.id) + '">' + PI.msg + (sent && c && sent === c.members.length ? 'Texted' : 'Text') + '</button>';
      if (i.date > t) h += '<button class="mini" data-act="p-move" data-id="' + i.id + '">' + PI.cal + 'Move</button>';
    }
    if (i.status === 'missed' && mode !== 'recent' && c && !upcomingFor(c.id)) h += '<button class="mini" data-act="p-resched" data-id="' + i.id + '">' + PI.cal + 'Reschedule</button>';
    h += '</div>';
    if (i.status === 'scheduled' && i.date <= t && c) {
      h += '<div class="att-list" role="group" aria-label="Who came">';
      c.members.forEach(function (bid) {
        var a = (i.attendance || {})[bid], b = bro(bid);
        h += '<div class="att-row"><span>' + esc(fullName(b)) + '</span>' +
          '<button class="att-btn' + (a && a.came ? ' yes' : '') + '" data-act="p-came" data-id="' + i.id + '" data-b="' + bid + '" data-came="1" aria-pressed="' + !!(a && a.came) + '">' + PI.ok + 'Came</button>' +
          '<button class="att-btn' + (a && !a.came ? ' no' : '') + '" data-act="p-came" data-id="' + i.id + '" data-b="' + bid + '" data-came="0" aria-pressed="' + !!(a && !a.came) + '">' + PI.no + 'Didn’t</button></div>';
      });
      h += '</div>';
    }
    if (i.status !== 'scheduled' && i.attendance && Object.keys(i.attendance).length) {
      h += '<div class="att-sum">' + Object.keys(i.attendance).map(function (k) { var a = i.attendance[k]; return '<span class="' + (a.came ? 'yes' : 'no') + '">' + (a.came ? PI.ok : PI.no) + esc(a.name) + '</span>'; }).join('') + '</div>';
    }
    if (ui.pText === i.id && c) {
      h += '<div class="texts">';
      c.members.forEach(function (bid) {
        var b = bro(bid), done = i.texted && i.texted[bid];
        if (!b) return;
        if (!b.phone) { h += '<button class="text-link done" data-act="p-phone" data-b="' + bid + '"><span><b>' + esc(fullName(b)) + '</b><small>No phone number yet</small></span><em>' + PI.plus + 'Add number</em></button>'; return; }
        h += '<a class="text-link' + (done ? ' done' : '') + '" href="' + esc(smsHref(b.phone, reminderText(i, b))) + '" data-act="p-texted" data-id="' + i.id + '" data-b="' + bid + '">' +
          '<span><b>' + esc(fullName(b)) + '</b><small>' + esc(b.phone) + '</small></span>' + (done ? '<em>' + PI.ok + 'Sent</em>' : '<em>' + PI.msg + 'Text</em>') + '</a>';
      });
      h += '<p class="note-p">Opens Messages with the reminder written out. Check it, then tap send.</p></div>';
    }
    return h + '</div>';
  }

  function renderOverview() {
    var sun = iso(nextSunday()), me = S.me, meP = pm(me);
    var isSec = meP && /ministering secretary/i.test(meP.role);
    var list = S.interviews.filter(function (i) { return i.date === sun && i.status === 'scheduled' && shown(i); });
    var h = '<section class="pcard"><div class="pcard-head"><h2>Presidency meeting</h2></div>' +
      (S.settings.agendaUrl
        ? '<a class="att" href="' + esc(S.settings.agendaUrl) + '" target="_blank" rel="noopener"><span>Open the meeting notes in Google Docs</span>' + ICON.link + '</a>'
        : '<button class="att" data-act="p-settings"><span>Add the link to your meeting notes in Google Docs</span>' + ICON.chev + '</button>') + '</section>';
    h += isSec ? renderReminders(true) : '';
    h += '<section class="pcard"><div class="pcard-head"><h2>' + esc(sunLabel(sun)) + '</h2><span class="count">' + list.length + (list.length === 1 ? ' interview' : ' interviews') + (scope() === 'mine' ? ' with you' : '') + '</span>' + scopeToggle() + '</div>';
    if (!list.length) h += '<p class="note-p">' + (scope() === 'mine' ? 'No interviews with you this Sunday.' : 'No interviews scheduled yet.') + '</p>';
    list.forEach(function (i) { h += ivRow(i); });
    h += '<div class="row"><button class="secondary" data-act="p-schedule" data-date="' + sun + '">' + PI.plus + 'Schedule</button></div></section>';

    if (meP && meP.interviews) h += renderMySundays();
    if (!isSec) h += renderReminders(!!S.remOpen);

    var chk = needsCheckoff();
    if (chk.length) {
      h += '<section class="pcard warn"><div class="pcard-head"><h2>Did they come?</h2><span class="count">' + chk.length + ' to check off</span></div>';
      chk.forEach(function (i) { h += '<div class="past-date">' + fmtSun(i.date) + '</div>' + ivRow(i); });
      h += '</section>';
    }

    h += '<section class="pcard"><div class="pcard-head"><h2>' + quarterName(0) + ' interviews</h2></div>';
    S.districts.forEach(function (d) {
      var comps = activeComps().filter(function (c) { return c.district === d.id; });
      var done = comps.filter(function (c) { return attendedInQuarter(c.id, 0); }).length;
      var sched = comps.filter(function (c) { return !attendedInQuarter(c.id, 0) && upcomingFor(c.id); }).length;
      var pct = comps.length ? Math.round(done / comps.length * 100) : 0, spct = comps.length ? Math.round(sched / comps.length * 100) : 0;
      var l = pm(d.leader);
      h += '<div class="dist"><div class="dist-head"><b>District ' + d.id + (l ? ' · ' + esc(pmName(l)) : '') + (d.leader === me ? ' <em class="you">you</em>' : '') + '</b><span class="count">' + done + ' of ' + comps.length + ' interviewed</span></div>' +
        '<div class="bar" role="img" aria-label="' + done + ' of ' + comps.length + ' interviewed, ' + sched + ' scheduled"><i style="width:' + pct + '%"></i><i class="s" style="width:' + spct + '%"></i></div></div>';
    });
    h += '<div class="legend"><span><i class="k-done"></i>done</span><span><i class="k-sched"></i>scheduled</span><span><i class="k-need"></i>not scheduled</span></div>' +
      '<div class="row"><button class="secondary" data-act="p-schedule">' + PI.plus + 'Schedule an interview</button></div></section>';

    var att = [];
    var miss = missedOpen();
    if (miss.length) att.push({ txt: miss.length + (miss.length === 1 ? ' missed interview needs' : ' missed interviews need') + ' a new date', tab: 'interviews' });
    var homesOpen = S.lots.filter(function (l) { return l.kind === 'home' && !S.families.some(function (f) { return f.lot === l.id && f.comp; }); });
    if (homesOpen.length) att.push({ txt: homesOpen.length + ' homes on the map have no companionship assigned', tab: 'map', f: 'open' });
    var famsOpen = S.families.filter(function (f) { return !f.comp; });
    if (famsOpen.length) att.push({ txt: famsOpen.length + (famsOpen.length === 1 ? ' family has' : ' families have') + ' no ministers', tab: 'ministering' });
    var noFam = activeComps().filter(function (c) { return !c.families.length; });
    if (noFam.length) att.push({ txt: noFam.length + (noFam.length === 1 ? ' companionship has' : ' companionships have') + ' no families', tab: 'ministering' });
    var solo = S.comps.filter(function (c) { return c.members.length === 1; });
    if (solo.length) att.push({ txt: solo.length + (solo.length === 1 ? ' minister is' : ' ministers are') + ' serving without a companion', tab: 'ministering' });
    var noPhone = S.brothers.filter(function (b) { return !b.phone; }).length;
    if (noPhone) att.push({ txt: noPhone + ' ministers have no phone number for reminders', tab: 'ministering' });
    if (att.length) {
      h += '<section class="pcard"><div class="pcard-head"><h2>Needs attention</h2></div>';
      att.forEach(function (a) { h += '<button class="att" data-act="p-tab" data-tab="' + a.tab + '"' + (a.f ? ' data-mapf="' + a.f + '"' : '') + '><span>' + esc(a.txt) + '</span>' + ICON.chev + '</button>'; });
      h += '</section>';
    }
    return h;
  }

  // Everyone to text about the coming Sunday's interviews, in one list (the ministering secretary's job).
  function renderReminders(open) {
    var sun = iso(nextSunday());
    var list = S.interviews.filter(function (i) { return i.date === sun && i.status === 'scheduled'; });
    if (!list.length) return '';
    var people = [], sent = 0;
    list.forEach(function (i) { var c = comp(i.compId); if (c) c.members.forEach(function (b) { people.push({ i: i, b: bro(b) }); if (i.texted && i.texted[b]) sent++; }); });
    var h = '<section class="pcard"><div class="pcard-head"><h2>Reminders for ' + esc(sun === todayIso() ? 'today' : fmtSun(sun)) + '</h2><span class="count">' + sent + ' of ' + people.length + ' sent</span></div>';
    if (!open) return h + '<button class="att" data-act="p-rem-open"><span>Text ' + (people.length - sent) + ' ministers about this Sunday’s interviews</span>' + ICON.chev + '</button></section>';
    h += '<p class="note-p">Each one opens Messages with the reminder written out. Check it, then tap send.</p><div class="texts" style="border:none;padding:0">';
    list.forEach(function (i) {
      var c = comp(i.compId), by = pm(i.by);
      if (!c) return;
      h += '<div class="rem-group">with ' + esc(by ? pmName(by) : 'the presidency') + '</div>';
      c.members.forEach(function (bid) {
        var b = bro(bid), done = i.texted && i.texted[bid];
        if (!b) return;
        if (!b.phone) { h += '<button class="text-link done" data-act="p-phone" data-b="' + bid + '"><span><b>' + esc(b.first + ' ' + b.last) + '</b><small>No phone number yet</small></span><em>' + PI.plus + 'Add number</em></button>'; return; }
        h += '<a class="text-link' + (done ? ' done' : '') + '" href="' + esc(smsHref(b.phone, reminderText(i, b))) + '" data-act="p-texted" data-id="' + i.id + '" data-b="' + bid + '">' +
          '<span><b>' + esc(b.first + ' ' + b.last) + '</b><small>' + esc(b.phone) + '</small></span>' + (done ? '<em>' + PI.ok + 'Sent</em>' : '<em>' + PI.msg + 'Text</em>') + '</a>';
      });
    });
    return h + '</div></section>';
  }

  // The signed-in leader's upcoming Sundays: how many interviews each, and a switch to mark himself away.
  function renderMySundays() {
    var me = S.me, mine = S.interviews.filter(function (i) { return i.by === me && i.status === 'scheduled' && i.date >= iso(nextSunday()); });
    var last = mine.reduce(function (m, i) { return i.date > m ? i.date : m; }, iso(addDays(quarterStart(1), -1)));
    var weeks = Math.min(26, Math.max(6, Math.round((parseIso(last) - nextSunday()) / 6048e5) + 3));
    var open = needsScheduling().filter(function (c) { return leaderOf(c) === me; }).length;
    var h = '<section class="pcard"><div class="pcard-head"><h2>Your Sundays</h2><span class="count">' + mine.length + ' interviews ahead</span></div>' +
      '<p class="note-p">' + perSunday() + ' companionships from your district each Sunday, right after church. Tap a Sunday you’ll be away; you’ll be asked whether to reschedule that day’s interviews.</p><div class="sundays">';
    upcomingSundays(weeks).forEach(function (d) {
      var away = isAway(me, d), n = bookedOn(me, d), qEnd = d >= iso(quarterStart(1));
      h += '<button class="sunday-chip' + (away ? ' away' : '') + (qEnd ? ' nextq' : '') + '" data-act="p-away" data-date="' + d + '" aria-pressed="' + away + '" aria-label="' + esc(fmtSun(d)) + (away ? ', away. Tap if you can be there' : ', ' + n + ' interviews. Tap if you’ll be away') + '">' +
        '<b>' + esc(fmtSun(d)) + '</b><small>' + (away ? 'Away' : n ? n + (n === 1 ? ' interview' : ' interviews') : 'Open') + '</small></button>';
    });
    h += '</div>';
    if (mine.some(function (i) { return i.date >= iso(quarterStart(1)); })) h += '<p class="note-p warn-t">Some of your interviews now fall after ' + esc(quarterName(0)) + ' ends.</p>';
    if (open) h += '<div class="row"><button class="secondary" data-act="p-fill">' + PI.plus + 'Schedule ' + open + ' more from your district</button></div>';
    return h + '</section>';
  }

  function renderInterviews() {
    var t = todayIso();
    var h = '<div class="row p-actions"><button class="primary" data-act="p-schedule">' + PI.plus + 'Schedule interview</button><button class="secondary" data-act="p-summary">Summary for LCR</button></div>';
    if (canFilter()) h += '<div class="scope-row"><span>' + (scope() === 'all' ? 'Showing everyone’s interviews' : 'Showing your interviews') + '</span>' + scopeToggle() + '</div>';
    var need = needsScheduling().length;
    if (need) h += '<button class="att" data-act="p-fill"><span>' + need + (need === 1 ? ' companionship needs' : ' companionships need') + ' an interview this quarter. Schedule them with their district leaders</span>' + ICON.chev + '</button>';
    var chk = needsCheckoff();
    if (chk.length) {
      h += '<div class="sec">Did they come?</div>';
      chk.forEach(function (i) { h += '<div class="past-date">' + fmtSun(i.date) + '</div>' + ivRow(i); });
    }
    var up = S.interviews.filter(function (i) { return i.status === 'scheduled' && i.date >= t && shown(i); }).sort(byDate);
    var dates = []; up.forEach(function (i) { if (dates.indexOf(i.date) < 0) dates.push(i.date); });
    if (!dates.length) h += '<div class="empty"><b>Nothing scheduled yet.</b><span>Tap Schedule interview to assign a companionship to a Sunday.</span></div>';
    dates.forEach(function (d) {
      var rs = up.filter(function (i) { return i.date === d; });
      var aw = interviewers().filter(function (p) { return isAway(p.id, d); }).map(function (p) { return p.first; });
      h += '<div class="sec">' + esc(sunLabel(d)) + ' · ' + rs.length + (aw.length ? ' <span class="away-note">' + esc(aw.join(' & ')) + ' away</span>' : '') + '</div>';
      rs.forEach(function (i) { h += ivRow(i); });
    });
    var from = iso(addDays(today0(), -42));
    var past = S.interviews.filter(function (i) { return i.status !== 'scheduled' && i.date >= from && shown(i); }).sort(byDate).reverse();
    if (past.length) {
      h += '<div class="sec">Last 6 weeks</div>';
      past.forEach(function (i) { h += ivRow(i, 'recent'); });
    }
    return h;
  }

  function renderMinistering() {
    var q = (ui.pQuery || '').trim().toLowerCase();
    var h = '<div class="row p-actions"><label class="sr" for="p-q">Search ministers and families</label><input id="p-q" class="p-search" type="search" placeholder="Search a name" value="' + esc(ui.pQuery || '') + '" autocomplete="off">' +
      '<button class="primary" data-act="p-newcomp" aria-label="New companionship">' + PI.plus + 'New</button></div>' + districtChips();
    var famsOpen = S.families.filter(function (f) { return !f.comp; });
    var loose = S.brothers.filter(function (b) { return !compOf(b.id); });
    if (!q && (famsOpen.length || loose.length)) {
      h += '<section class="pcard warn">';
      if (famsOpen.length) h += '<div class="sec" style="padding-top:0">Families without ministers</div><div class="tag-grid">' + famsOpen.map(function (f) { return '<span class="tag">' + esc(famName(f)) + '</span>'; }).join('') + '</div>';
      if (loose.length) h += '<div class="sec">Ministers without a companionship</div><div class="tag-grid">' + loose.map(function (b) { return '<span class="tag">' + esc(fullName(b)) + '</span>'; }).join('') + '</div>';
      h += '<p class="note-p">Open a companionship to add a minister or assign a family.</p></section>';
    }
    var comps = S.comps.filter(function (c) {
      if (!inDistrict(c)) return false;
      if (!q) return true;
      return (compLabel(c) + ' ' + famLabel(c) + ' ' + c.members.map(function (m) { var b = bro(m); return b ? b.first + ' ' + b.last : ''; }).join(' ')).toLowerCase().indexOf(q) >= 0;
    });
    h += '<div class="sec">' + comps.length + (comps.length === 1 ? ' companionship' : ' companionships') + '</div>';
    if (!comps.length) h += '<div class="empty"><b>No match.</b><span>Try a first or last name.</span></div>';
    comps.forEach(function (c) {
      var st = compStatus(c);
      h += '<button class="comp" data-act="p-comp" data-id="' + c.id + '"><span class="comp-names">' + esc(compLabel(c)) + (c.members.length === 1 ? ' <em class="solo">no companion</em>' : '') + '</span>' +
        '<span class="comp-fams">' + (c.families.length ? esc(famLabel(c)) : 'No families assigned') + '</span>' +
        '<span class="comp-foot"><span class="badge b-' + st.kind + '">' + esc(st.text) + '</span><span class="dist-tag">District ' + c.district + '</span></span></button>';
    });
    return h;
  }

  // ---------- Map ----------
  var STREETS = [
    ['W Bull River Rd', 330, 252, -3], ['W Bull River Rd', 700, 240, 2], ['N 425 West St', 205, 520, -90], ['N 425 West St', 205, 920, -90],
    ['N 350 West St', 402, 560, -90], ['N 350 West St', 398, 900, -90], ['W 3375 North St', 520, 657, 0], ['N 280 West St', 597, 960, -90],
    ['N 200 West St', 791, 560, -90], ['N 200 West St', 793, 960, -90], ['W 3250 North St', 650, 1032, 0], ['W 3200 North St', 320, 1145, 0], ['W 3200 North St', 740, 1145, 0]
  ];
  var DCOL = { 1: 'var(--d1)', 2: 'var(--d2)', 3: 'var(--d3)' };
  function lotFamilies(l) { return S.families.filter(function (f) { return f.lot === l.id; }); }
  function lotInfo(l) {
    var fs = lotFamilies(l), assigned = fs.filter(function (f) { return f.comp; });
    var c = assigned.length ? comp(assigned[0].comp) : null;
    return { fams: fs, assigned: assigned, district: c ? c.district : null, status: l.kind !== 'home' ? 'other' : assigned.length ? 'assigned' : 'open' };
  }
  function renderMap() {
    var f = S.mapFilter || 'all';
    var homes = S.lots.filter(function (l) { return l.kind === 'home'; });
    var infos = {}; S.lots.forEach(function (l) { infos[l.id] = lotInfo(l); });
    var open = homes.filter(function (l) { return infos[l.id].status === 'open'; });
    var assignedN = homes.length - open.length;
    var h = '<div class="chips-row" role="group" aria-label="Show on the map">' +
      [['all', 'All homes · ' + homes.length, null], ['assigned', 'Assigned · ' + assignedN, 'var(--lot-yes)'], ['open', 'Not assigned · ' + open.length, 'var(--lot-no)']]
        .map(function (o) { return '<button class="chip' + (f === o[0] ? ' on' : '') + '" data-act="p-mapf" data-f="' + o[0] + '" aria-pressed="' + (f === o[0]) + '">' + (o[2] ? '<i class="sw" style="background:' + o[2] + '"></i>' : '') + esc(o[1]) + '</button>'; }).join('') + '</div>';
    h += '<div class="pmap' + (S.mapZoom ? ' zoom' : '') + '"><button class="mini pmap-zoom" data-act="p-mapzoom" aria-pressed="' + !!S.mapZoom + '">' + (S.mapZoom ? 'Zoom out' : 'Zoom in') + '</button><div class="pmap-scroll"><svg viewBox="100 225 800 935" role="img" aria-label="Neighborhood map. Each home is colored by whether a ministering companionship is assigned to it.">';
    h += '<rect x="100" y="225" width="800" height="935" class="pm-road"></rect>';
    S.lots.forEach(function (l) {
      var inf = infos[l.id];
      var show = f === 'all' || inf.status === f;
      var fill = inf.status === 'assigned' ? 'var(--lot-yes)' : inf.status === 'open' ? 'var(--lot-no)' : 'var(--lot-other)';
      var pts = (l.poly || []).map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
      var nm = l.label.split(' / ')[0];
      var fs = nm.length > 10 ? 9 : nm.length > 7 ? 10.5 : 12;
      h += '<g class="plot' + (show ? '' : ' dim') + (S.mapSel === l.id ? ' sel' : '') + '" data-act="p-lot" data-id="' + l.id + '" tabindex="0" role="button" aria-label="' + esc(l.label + ' ' + l.num) + '">' +
        '<polygon points="' + pts + '" fill="' + fill + '"></polygon>' +
        '<text x="' + l.x + '" y="' + (l.y - 2) + '" class="pl-name" style="font-size:' + fs + 'px">' + esc(nm) + '</text><text x="' + l.x + '" y="' + (l.y + 12) + '" class="pl-num">' + esc(l.num) + '</text></g>';
    });
    STREETS.forEach(function (s) { h += '<text class="street" transform="translate(' + s[1] + ' ' + s[2] + ') rotate(' + s[3] + ')">' + esc(s[0]) + '</text>'; });
    h += '</svg></div></div>';
    var sel = S.mapSel && lot(S.mapSel);
    if (sel) {
      var inf = infos[sel.id];
      h += '<section class="pcard"><div class="pcard-head"><h2>' + esc(sel.label) + '</h2><span class="count">' + esc(sel.num) + '</span></div>';
      h += '<p class="note-p"><span class="badge ' + (inf.status === 'assigned' ? 'b-yes' : inf.status === 'open' ? 'b-no' : '') + '">' + (inf.status === 'assigned' ? 'Assigned' : inf.status === 'open' ? 'Not assigned' : 'Not a household') + '</span></p>';
      if (inf.status !== 'other' && !inf.fams.length) h += '<p class="note-p">This home isn’t on the ministering list. It may need ministers, or it may not be a member household.</p>';
      inf.fams.forEach(function (fm) {
        var c = fm.comp ? comp(fm.comp) : null;
        h += '<div class="trow"><span>' + esc(famName(fm)) + '<small class="phone">' + (c ? 'Ministers: ' + esc(compLabel(c)) : 'No ministers assigned') + '</small></span>' + (c ? '<button class="text-btn" data-act="p-comp" data-id="' + c.id + '">Open</button>' : '') + '</div>';
      });
      h += '</section>';
    } else h += '<p class="note-p">Tap a home to see who lives there and who ministers to them.</p>';
    if (open.length) h += '<section class="pcard"><div class="pcard-head"><h2>Not assigned</h2><span class="count">' + open.length + '</span></div><div class="tag-grid">' +
      open.slice().sort(function (a, b) { return a.label < b.label ? -1 : 1; }).map(function (l) { return '<button class="tag" data-act="p-lot" data-id="' + l.id + '">' + esc(l.label) + ' ' + esc(l.num) + '</button>'; }).join('') + '</div>' +
      '<p class="note-p">Not on the elders quorum ministering list. Some may not be member households.</p></section>';
    return h;
  }

  // ---------- Sheets ----------
  function sundayOptions(sel) {
    return upcomingSundays(10).map(function (d) { return '<option value="' + d + '"' + (d === sel ? ' selected' : '') + '>' + esc(sunLabel(d)) + '</option>'; }).join('');
  }
  function interviewerOptions(sel) {
    return interviewers().map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(pmName(p)) + ' (' + esc(p.role) + ')</option>'; }).join('') +
      '<option value=""' + (!sel ? ' selected' : '') + '>Anyone in the presidency</option>';
  }
  function bar(title, done) { return '<div class="sheet-bar"><h2 id="sheet-title">' + esc(title) + '</h2><button class="text-btn strong" data-act="sheet-close">' + (done || 'Close') + '</button></div>'; }
  function personOptions(exclude) {
    return S.brothers.filter(function (b) { return (exclude || []).indexOf(b.id) < 0; }).sort(function (a, b) { return (!!compOf(a.id) - !!compOf(b.id)) || (a.last + a.first < b.last + b.first ? -1 : 1); }).map(function (b) {
      var oc = compOf(b.id);
      var w = oc ? oc.members.filter(function (x) { return x !== b.id; }).map(function (x) { return fullName(bro(x)); }).join(' & ') : '';
      return '<option value="' + b.id + '">' + esc(b.last + ', ' + b.first) + (oc ? ' (now with ' + esc(w || 'no one') + ')' : ' (no companionship)') + '</option>';
    }).join('');
  }

  function renderSheet() {
    var s = ui.sheet, h = '';
    if (s.type === 'p-schedule') {
      var comps = activeComps().filter(function (c) { return S.district === 'all' || String(c.district) === S.district || c.id === s.compId; }).slice().sort(function (a, b) {
        var ra = attendedInQuarter(a.id, 0) ? 2 : upcomingFor(a.id) ? 1 : 0, rb = attendedInQuarter(b.id, 0) ? 2 : upcomingFor(b.id) ? 1 : 0;
        return ra - rb || a.district - b.district;
      });
      var pre = s.compId || '';
      var defBy = s.compId && comp(s.compId) ? (find(S.districts, comp(s.compId).district) || {}).leader : S.me;
      h += bar('Schedule an interview', 'Cancel') + '<form class="field" data-form="p-schedule">' +
        '<label for="p-date">Sunday</label><select id="p-date" class="p-select">' + sundayOptions(s.date || (defBy && nextOpen(defBy)) || iso(nextSunday())) + '</select>' +
        '<label for="p-byw">Interviewed by</label><select id="p-byw" class="p-select">' + interviewerOptions(defBy) + '</select>' +
        '<fieldset class="pick"><legend>Companionship' + (S.district !== 'all' ? ' · District ' + esc(S.district) : '') + '</legend>';
      comps.forEach(function (c) {
        var st = compStatus(c);
        h += '<label class="pick-row"><input type="radio" name="p-comp" value="' + c.id + '"' + (c.id === pre ? ' checked' : '') + '><span class="txt"><b>' + esc(compLabel(c)) + '</b><small class="b-' + st.kind + '-t">' + esc(st.text) + ' · District ' + c.district + '</small></span></label>';
      });
      h += '</fieldset><button class="primary" type="submit">Schedule</button></form>';
    } else if (s.type === 'p-move') {
      var i = iv(s.id);
      if (!i) { ui.sheet = null; return ''; }
      h += bar(s.resched ? 'Reschedule' : 'Move to another Sunday', 'Cancel') + '<p class="note-p">' + esc(ivLabel(i)) + '</p>';
      upcomingSundays(8).forEach(function (d) {
        var on = !s.resched && i.date === d;
        h += '<button class="opt' + (on ? ' on' : '') + '" data-act="p-move-to" data-date="' + d + '"' + (on ? ' aria-current="true"' : '') + '><span class="txt"><b>' + esc(sunLabel(d)) + '</b><small>' + S.interviews.filter(function (x) { return x.date === d && x.status === 'scheduled'; }).length + ' already scheduled</small></span></button>';
      });
      if (!s.resched) h += '<button class="secondary danger" data-act="p-unschedule">Remove from schedule</button>';
    } else if (s.type === 'p-by') {
      var ib = iv(s.id);
      if (!ib) { ui.sheet = null; return ''; }
      h += bar('Who will interview them?', 'Cancel') + '<p class="note-p">' + esc(ivLabel(ib)) + ' · ' + esc(sunLabel(ib.date)) + '</p>';
      interviewers().concat([null]).forEach(function (p) {
        var id = p ? p.id : '', on = (ib.by || '') === id;
        h += '<button class="opt' + (on ? ' on' : '') + '" data-act="p-set-by" data-by="' + id + '"><span class="txt"><b>' + esc(p ? pmName(p) : 'Anyone in the presidency') + '</b>' + (p ? '<small>' + esc(p.role) + '</small>' : '') + '</span></button>';
      });
    } else if (s.type === 'p-comp') {
      var c = comp(s.id);
      if (!c) { ui.sheet = null; return ''; }
      h += bar(compLabel(c), 'Done');
      h += '<p class="note-p">District ' + c.district + (districtLeader(c.district) ? ' · ' + esc(pmName(districtLeader(c.district))) : '') + '</p>';
      h += '<div class="sec" style="padding-top:0">Companions</div>';
      c.members.forEach(function (bid) {
        var b = bro(bid); if (!b) return;
        h += '<div class="trow"><span>' + esc(b.first + ' ' + b.last) + '<button class="phone-btn" data-act="p-phone" data-b="' + bid + '">' + (b.phone ? esc(b.phone) : '+ Add phone number') + '</button></span><button class="text-btn danger" data-act="p-rm-member" data-b="' + bid + '">Remove</button></div>';
      });
      h += '<label class="sr" for="p-add-member">Add a companion</label><select id="p-add-member" class="p-select"><option value="">+ Add a companion…</option>' + personOptions(c.members) + '</select>';
      h += '<div class="sec">Ministers to</div>';
      if (!c.families.length) h += '<p class="note-p">No families assigned.</p>';
      c.families.forEach(function (fid) {
        var f = fam(fid), l = f && f.lot ? lot(f.lot) : null;
        h += '<div class="trow"><span>' + esc(famName(f)) + (l ? '<small class="phone">' + esc(l.num) + '</small>' : '') + '</span><button class="text-btn danger" data-act="p-rm-fam" data-f="' + fid + '">Remove</button></div>';
      });
      h += '<label class="sr" for="p-add-fam">Assign a family</label><select id="p-add-fam" class="p-select"><option value="">+ Assign a family…</option>' +
        S.families.filter(function (f) { return c.families.indexOf(f.id) < 0; }).sort(function (a, b) { return (!!a.comp - !!b.comp) || (a.name < b.name ? -1 : 1); }).map(function (f) {
          var oc = f.comp ? comp(f.comp) : null;
          return '<option value="' + f.id + '">' + esc(f.name) + (oc ? ' (now ' + esc(compLabel(oc)) + ')' : ' (no ministers)') + '</option>';
        }).join('') + '</select>';
      var st = compStatus(c), up = upcomingFor(c.id);
      h += '<div class="sec">Interview</div><p class="note-p"><span class="badge b-' + st.kind + '">' + esc(st.text) + '</span></p>' +
        '<div class="row">' + (up ? '<button class="secondary" data-act="p-move" data-id="' + up.id + '">' + PI.cal + 'Move interview</button>' : '<button class="secondary" data-act="p-schedule" data-comp="' + c.id + '">' + PI.cal + 'Schedule interview</button>') + '</div>';
      var hist = S.interviews.filter(function (x) { return x.compId === c.id && x.status !== 'scheduled'; }).sort(byDate).reverse().slice(0, 4);
      if (hist.length) h += '<div class="hist">' + hist.map(function (x) { return '<span class="badge ' + (x.status === 'attended' ? 'b-done' : 'b-need') + '">' + fmtSun(x.date) + ' · ' + (x.status === 'attended' ? 'attended' : 'didn’t attend') + '</span>'; }).join('') + '</div>';
    } else if (s.type === 'p-away') {
      var who = S.me, d = s.date, away = isAway(who, d);
      if (!away) {
        var day = onDay(who, d);
        h += bar('Away on ' + fmtSun(d) + '?', 'Cancel');
        if (day.length) {
          h += '<p class="note-p">You have ' + day.length + (day.length === 1 ? ' interview' : ' interviews') + ' that day: ' + esc(day.map(ivLabel).join('; ')) + '.</p>' +
            '<p class="note-p">Would you like to reschedule ' + (day.length === 1 ? 'it' : 'them') + ' to another Sunday in the future?</p>' +
            '<button class="primary" data-act="p-away-set" data-move="1">Mark away and reschedule</button>' +
            '<button class="secondary" data-act="p-away-set" data-move="0">Mark away, keep ' + (day.length === 1 ? 'it' : 'them') + ' on ' + esc(fmtSun(d)) + '</button>';
        } else h += '<p class="note-p">You have no interviews that day. Marking it keeps new interviews off it.</p><button class="primary" data-act="p-away-set" data-move="0">Mark away</button>';
      } else {
        var back = movedOff(who, d);
        h += bar('Available on ' + fmtSun(d) + '?', 'Cancel');
        if (back.length) {
          h += '<p class="note-p">' + back.length + (back.length === 1 ? ' interview was' : ' interviews were') + ' moved off this Sunday: ' + esc(back.map(function (i) { return ivLabel(i) + ' (now ' + fmtSun(i.date) + ')'; }).join('; ')) + '.</p>' +
            '<button class="primary" data-act="p-away-clear" data-restore="1">I’m available. Move ' + (back.length === 1 ? 'it' : 'them') + ' back</button>' +
            '<button class="secondary" data-act="p-away-clear" data-restore="0">I’m available. Leave ' + (back.length === 1 ? 'it' : 'them') + ' where ' + (back.length === 1 ? 'it is' : 'they are') + '</button>';
        } else h += '<button class="primary" data-act="p-away-clear" data-restore="0">I’m available that day</button>';
      }
    } else if (s.type === 'p-phone') {
      var pb = bro(s.b);
      if (!pb) { ui.sheet = null; return ''; }
      h += bar('Phone number', 'Cancel') + '<form class="field" data-form="p-phone"><label for="p-phone-in">' + esc(pb.first + ' ' + pb.last) + '</label>' +
        '<input id="p-phone-in" type="tel" inputmode="tel" autocomplete="off" placeholder="(801) 555-0100" value="' + esc(pb.phone || '') + '">' +
        '<p class="note-p">Used only for interview reminder texts. The presidency can see it.</p><button class="primary" type="submit">Save</button></form>';
    } else if (s.type === 'p-newcomp') {
      var opts = personOptions([]);
      var myDist = (S.districts.filter(function (d) { return d.leader === S.me; })[0] || S.districts[0] || {}).id;
      h += bar('New companionship', 'Cancel') + '<form class="field" data-form="p-newcomp">' +
        '<label for="p-nb1">First companion</label><select id="p-nb1" class="p-select" required><option value="">Choose…</option>' + opts + '</select>' +
        '<label for="p-nb2">Second companion</label><select id="p-nb2" class="p-select"><option value="">Choose (optional)…</option>' + opts + '</select>' +
        '<label for="p-nd">District</label><select id="p-nd" class="p-select">' + S.districts.map(function (d) { var l = pm(d.leader); return '<option value="' + d.id + '"' + (d.id === myDist ? ' selected' : '') + '>District ' + d.id + (l ? ' · ' + esc(pmName(l)) : '') + '</option>'; }).join('') + '</select>' +
        '<p class="note-p">Someone already in a companionship moves into this new one. Assign families on the next screen.</p>' +
        '<button class="primary" type="submit">Create</button></form>';
    } else if (s.type === 'p-summary') {
      var off = s.q || 0, txt = summaryText(off);
      h += bar('Summary for LCR') + '<div class="seg small" role="tablist">' +
        '<button role="tab" aria-selected="' + (off === 0) + '" class="' + (off === 0 ? 'on' : '') + '" data-act="p-sum-q" data-q="0">' + quarterName(0) + '</button>' +
        '<button role="tab" aria-selected="' + (off === -1) + '" class="' + (off === -1 ? 'on' : '') + '" data-act="p-sum-q" data-q="-1">' + quarterName(-1) + '</button></div>' +
        '<p class="note-p">For Brent to record in LCR. Copy it and paste it anywhere.</p>' +
        '<label class="sr" for="p-sum-text">Summary</label><textarea id="p-sum-text" class="p-sum" readonly rows="14">' + esc(txt) + '</textarea>' +
        '<button class="primary" data-act="p-copy">' + PI.copy + 'Copy summary</button>';
    } else if (s.type === 'p-settings') {
      var me = pm(S.me);
      h += bar('Presidency settings', 'Cancel') + '<form class="field" data-form="p-settings">' +
        '<label for="p-agenda">Presidency meeting notes (Google Doc link)</label><input id="p-agenda" type="url" inputmode="url" placeholder="https://docs.google.com/document/…" value="' + esc(S.settings.agendaUrl || '') + '">' +
        '<label for="p-room">Where interviews happen</label><input id="p-room" type="text" value="' + esc(S.settings.room || '') + '">' +
        '<label for="p-tpl">Reminder text</label><textarea id="p-tpl" class="p-tpl" rows="5">' + esc(S.settings.template || '') + '</textarea>' +
        '<p class="note-p">Words in braces fill in for each brother: {last}, {first}, {interviewer}, {when}, {room}, {sender}.</p>' +
        (me ? '<label for="p-mylast">Your last name (used in texts)</label><input id="p-mylast" type="text" value="' + esc(me.last) + '">' : '') +
        '<button class="primary" type="submit">Save</button></form>' +
        '<div class="sec">Presidency</div>' + S.presidency.map(function (p) { return '<div class="trow"><span>' + esc(pmName(p)) + '<small class="phone">' + esc(p.role) + (p.email ? '' : ' · can’t sign in yet') + '</small></span></div>'; }).join('') +
        '<div class="row" style="flex-wrap:wrap"><button class="secondary" data-act="p-signout">Sign out</button></div>';
    }
    return h;
  }

  function summaryText(off) {
    var a = iso(quarterStart(off)), b = iso(quarterStart(off + 1));
    var inQ = S.interviews.filter(function (i) { return i.date >= a && i.date < b && i.status !== 'scheduled'; }).sort(byDate);
    function people(i) {
      var at = i.attendance || {}, ks = Object.keys(at);
      if (!ks.length) return { came: i.status === 'attended' ? [ivLabel(i)] : [], missed: i.status === 'missed' ? [ivLabel(i)] : [] };
      return { came: ks.filter(function (k) { return at[k].came; }).map(function (k) { return at[k].name; }), missed: ks.filter(function (k) { return !at[k].came; }).map(function (k) { return at[k].name; }) };
    }
    var lines = ['Ministering interviews · ' + quarterName(off), ''];
    var came = [], missed = [];
    inQ.forEach(function (i) {
      var p = people(i), by = pm(i.by) ? ' (with ' + pmName(pm(i.by)) + ')' : '';
      p.came.forEach(function (n) { came.push('• ' + fmtSun(i.date) + ': ' + n + by); });
      p.missed.forEach(function (n) { missed.push('• ' + fmtSun(i.date) + ': ' + n + by); });
    });
    lines.push('Attended (' + came.length + ')'); lines = lines.concat(came.length ? came : ['• None yet']);
    if (missed.length) { lines.push('', 'Did not attend (' + missed.length + ')'); lines = lines.concat(missed); }
    S.districts.forEach(function (d) {
      var notYet = activeComps().filter(function (c) { return c.district === d.id && !attendedInQuarter(c.id, off); });
      if (notYet.length) { lines.push('', 'Companionships not interviewed yet · District ' + d.id + ' (' + notYet.length + ')'); notYet.forEach(function (c) { lines.push('• ' + compLabel(c)); }); }
    });
    return lines.join('\n');
  }

  // ---------- Events ----------
  function setTab(t) { S.tab = t; try { localStorage.setItem(TAB_KEY, t); } catch (e) {} }
  function onClick(act, el) {
    var id = el.getAttribute('data-id');
    switch (act) {
      case 'p-tab': setTab(el.getAttribute('data-tab')); if (el.getAttribute('data-mapf')) S.mapFilter = el.getAttribute('data-mapf'); ui.pText = null; api.render(); window.scrollTo(0, 0); return true;
      case 'p-retry': S.phase = 'loading'; api.render(); refresh(); return true;
      case 'p-other-email': S.phase = 'signed-out'; api.render(); return true;
      case 'p-signout': if (client()) client().auth.signOut(); S.phase = 'signed-out'; S.me = null; ui.sheet = null; api.render(); return true;
      case 'p-district': S.district = el.getAttribute('data-d'); api.render(); return true;
      case 'p-mapf': S.mapFilter = el.getAttribute('data-f'); api.render(); return true;
      case 'p-mapzoom': S.mapZoom = !S.mapZoom; api.render(); return true;
      case 'p-lot': S.mapSel = id; setTab('map'); api.render(); return true;
      case 'p-settings': ui.sheet = { type: 'p-settings' }; api.render(); return true;
      case 'p-schedule': ui.sheet = { type: 'p-schedule', date: el.getAttribute('data-date'), compId: el.getAttribute('data-comp') }; api.render(); return true;
      case 'p-summary': ui.sheet = { type: 'p-summary', q: 0 }; api.render(); return true;
      case 'p-sum-q': ui.sheet.q = +el.getAttribute('data-q'); api.render(); return true;
      case 'p-copy': {
        var ta = document.getElementById('p-sum-text'), txt = ta ? ta.value : '';
        var fallback = function () { if (ta) { ta.focus(); ta.select(); } toast('Selected. Use Copy from your phone’s menu'); };
        try { navigator.clipboard.writeText(txt).then(function () { toast('Summary copied'); }, fallback); } catch (er) { fallback(); }
        return true;
      }
      case 'p-status': setStatus(id, el.getAttribute('data-st')); return true;
      case 'p-came': markPerson(id, el.getAttribute('data-b'), el.getAttribute('data-came') === '1'); return true;
      case 'p-away': ui.sheet = { type: 'p-away', date: el.getAttribute('data-date') }; api.render(); return true;
      case 'p-away-set': { var ad = ui.sheet.date; ui.sheet = null; setAway(ad, el.getAttribute('data-move') === '1'); return true; }
      case 'p-away-clear': { var cd = ui.sheet.date; ui.sheet = null; setBack(cd, el.getAttribute('data-restore') === '1'); return true; }
      case 'p-fill': fillSchedule(); return true;
      case 'p-scope': setScope(scope() === 'all' ? 'mine' : 'all'); api.render(); return true;
      case 'p-rem-open': S.remOpen = true; api.render(); return true;
      case 'p-text': ui.pText = ui.pText === id ? null : id; api.render(); return true;
      case 'p-texted': {
        var it = iv(id); if (!it) return true;
        it.texted = Object.assign({}, it.texted || {}); it.texted[el.getAttribute('data-b')] = true;
        client().from('interviews').update({ texted: it.texted }).eq('id', id).then(function () {});
        setTimeout(api.render, 400); return true;
      }
      case 'p-phone': ui.sheet = { type: 'p-phone', b: el.getAttribute('data-b'), back: ui.sheet && ui.sheet.type === 'p-comp' ? ui.sheet : null }; api.render(); return true;
      case 'p-move': ui.sheet = { type: 'p-move', id: id }; api.render(); return true;
      case 'p-resched': ui.sheet = { type: 'p-move', id: id, resched: true }; api.render(); return true;
      case 'p-move-to': {
        var mi = iv(ui.sheet.id), d = el.getAttribute('data-date'), re = !!ui.sheet.resched;
        ui.sheet = null;
        if (re) schedule(mi.compId, d, mi.by);
        else save([client().from('interviews').update({ date: d, texted: {} }).eq('id', mi.id)], 'Moved to ' + fmtSun(d));
        return true;
      }
      case 'p-unschedule': { var uid = ui.sheet.id; ui.sheet = null; save([client().from('interviews').delete().eq('id', uid)], 'Removed from the schedule'); return true; }
      case 'p-by': ui.sheet = { type: 'p-by', id: id }; api.render(); return true;
      case 'p-set-by': { var bi = ui.sheet.id; ui.sheet = null; save([client().from('interviews').update({ by_id: el.getAttribute('data-by') || null }).eq('id', bi)]); return true; }
      case 'p-comp': ui.sheet = { type: 'p-comp', id: id }; api.render(); return true;
      case 'p-newcomp': ui.sheet = { type: 'p-newcomp' }; api.render(); return true;
      case 'p-rm-member': removeBrother(ui.sheet.id, el.getAttribute('data-b')); return true;
      case 'p-rm-fam': assignFamily(el.getAttribute('data-f'), null); return true;
    }
    return false;
  }
  function onSubmit(form) {
    var c = client();
    if (form === 'p-signin') {
      var em = document.getElementById('p-email').value.trim();
      if (!em) return true;
      S.email = em;
      var here = location.origin + location.pathname;
      c.auth.signInWithOtp({ email: em, options: { emailRedirectTo: here } }).then(function (r) {
        if (r.error) { toast(r.error.message || 'Couldn’t send the email'); return; }
        S.phase = 'sent'; api.render();
      });
      return true;
    }
    if (form === 'p-code') {
      var code = document.getElementById('p-code').value.replace(/\s/g, '');
      if (!code) return true;
      c.auth.verifyOtp({ email: S.email, token: code, type: 'email' }).then(function (r) {
        if (r.error) toast('That code didn’t work. Check it, or send a new email.');
      });
      return true;
    }
    if (form === 'p-schedule') {
      var picked = document.querySelector('input[name="p-comp"]:checked');
      if (!picked) { toast('Choose a companionship'); return true; }
      var d = document.getElementById('p-date').value, by = document.getElementById('p-byw').value;
      ui.sheet = null; schedule(picked.value, d, by); return true;
    }
    if (form === 'p-newcomp') {
      var b1 = document.getElementById('p-nb1').value, b2 = document.getElementById('p-nb2').value, dist = +document.getElementById('p-nd').value;
      if (!b1) return true;
      c.from('companionships').insert({ district: dist }).select().then(function (r) {
        if (r.error) { toast('Couldn’t create it: ' + r.error.message); return; }
        var cid = r.data[0].id;
        S.comps.push({ id: cid, district: dist, members: [], families: [] });
        moveBrother(b1, cid).then(function () { return b2 && b2 !== b1 ? moveBrother(b2, cid) : null; }).then(function () {
          ui.sheet = { type: 'p-comp', id: cid }; api.render(); toast('Companionship created');
        });
      });
      return true;
    }
    if (form === 'p-phone') {
      var ph = document.getElementById('p-phone-in').value.trim(), bid = ui.sheet.b, back = ui.sheet.back;
      ui.sheet = back || null;
      save([c.from('ministers').update({ phone: ph || null }).eq('id', bid)], ph ? 'Phone number saved' : 'Phone number removed');
      return true;
    }
    if (form === 'p-settings') {
      var url = document.getElementById('p-agenda').value.trim();
      var good = /^https:\/\//i.test(url) ? url : '';
      var ops = [
        c.from('settings').upsert({ key: 'agendaUrl', value: good }),
        c.from('settings').upsert({ key: 'room', value: document.getElementById('p-room').value.trim() }),
        c.from('settings').upsert({ key: 'template', value: document.getElementById('p-tpl').value.trim() || S.settings.template })
      ];
      var ml = document.getElementById('p-mylast');
      if (ml && S.me) ops.push(c.from('presidency').update({ last: ml.value.trim() }).eq('id', S.me));
      ui.sheet = null;
      save(ops, url && !good ? 'Saved. The agenda link must start with https://' : 'Saved');
      return true;
    }
    return false;
  }
  function onChange(e) {
    var t = e.target;
    if (t.id === 'p-add-member' && t.value) { moveBrother(t.value, ui.sheet.id); return true; }
    if (t.id === 'p-add-fam' && t.value) { assignFamily(t.value, ui.sheet.id); return true; }
    return false;
  }
  function onInput(e) {
    if (e.target.id !== 'p-q') return false;
    ui.pQuery = e.target.value;
    var pos = e.target.selectionStart; api.render();
    var q = document.getElementById('p-q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) {} }
    return true;
  }
  function onKey(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.plot')) { e.preventDefault(); S.mapSel = e.target.getAttribute('data-id'); api.render(); return true; }
    return false;
  }

  start();
  return {
    render: render, renderSheet: renderSheet, onClick: onClick, onSubmit: onSubmit, onChange: onChange, onInput: onInput, onKey: onKey,
    _state: function () { return S; }, _nextOpen: nextOpen, _summary: summaryText, _reminder: reminderText
  };
};
