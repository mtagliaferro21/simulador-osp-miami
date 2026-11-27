const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createOSPTracking, findAPI, duration } = require('../tracking.js');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const questions = vm.runInNewContext(html.match(/const stops = (\[[\s\S]*?\n\]);/)[1]);
function lms(values = {}) {
  const store = { 'cmi.core.student_id': 'student-123', 'cmi.core.student_name': 'Learner, Test',
    'cmi.core.lesson_mode': 'normal', 'cmi.suspend_data': '', 'cmi.interactions._count': '0', ...values };
  let error = '0';
  return { store, commitFails: false, failField: '', commits: 0, finishes: 0, writes: [],
    LMSInitialize: () => 'true', LMSGetLastError: () => error,
    LMSGetValue(key) { error = '0'; if (!(key in store)) { error = '401'; return ''; } return store[key]; },
    LMSSetValue(key, value) {
      this.writes.push([key, value]);
      if (key === this.failField) return 'false';
      const match = key.match(/^cmi.interactions\.(\d+)\.(.+)$/);
      if (match) {
        const n = +match[1], field = match[2];
        const count = +store['cmi.interactions._count'];
        assert.ok(n <= count, 'interaction indices must be contiguous');
        if (n === count) { assert.equal(field, 'id'); store['cmi.interactions._count'] = String(n + 1); }
        if (field === 'student_response' && store[`cmi.interactions.${n}.type`] === 'choice') assert.match(value, /^[A-Z]$/);
        if (field === 'student_response' && store[`cmi.interactions.${n}.type`] === 'numeric') assert.match(value, /^\d+$/);
        if (field === 'latency') assert.match(value, /^\d{4}:\d{2}:\d{2}\.\d{2}$/);
      }
      store[key] = value; error = '0'; return 'true';
    },
    LMSCommit() { this.commits++; return this.commitFails ? 'false' : 'true'; },
    LMSFinish() { this.finishes++; return 'true'; },
  };
}
const create = (api, options = {}) => createOSPTracking(questions, { api, now: () => Date.UTC(2026, 10, 27, 12), ...options });
test('two wrong answers followed by a correct answer retain all attempts and first-answer score', () => {
  const api = lms(), tracker = create(api);
  assert.equal(tracker.record(0, 0, 4500), true);
  assert.equal(tracker.record(0, 2, 5200), true);
  assert.equal(tracker.record(0, 1, 6600), true);
  const t = tracker.snapshot();
  assert.deepEqual([t.rows[0].n, t.rows[0].c, t.rows[0].w, t.first, t.latest], [3, 1, 2, 0, 25]);
  assert.equal(api.store['cmi.core.score.raw'], '0');
  assert.equal(api.store['cmi.interactions._count'], '15');
  assert.equal(api.store['cmi.interactions.0.student_response'], '3');
  assert.equal(api.store['cmi.interactions.1.student_response'], '1');
  assert.equal(api.store['cmi.interactions.2.student_response'], '2');
  assert.equal(api.store['cmi.interactions.0.result'], 'neutral');
  assert.equal(api.store['cmi.interactions.0.weighting'], '0');
  assert.equal(api.store['cmi.interactions.12.student_response'], 'A');
  assert.equal(api.store['cmi.interactions.13.student_response'], 'C');
  assert.equal(api.store['cmi.interactions.14.student_response'], 'B');
  assert.equal(api.store['cmi.interactions.14.result'], 'correct');
  assert.equal(new Set([12, 13, 14].map(n => api.store[`cmi.interactions.${n}.id`])).size, 3);
  assert.equal(api.store['cmi.core.lesson_status'], 'incomplete');
});
test('completion, resume, and learner isolation', () => {
  const api = lms(), tracker = create(api);
  questions.forEach((q, i) => tracker.record(i, q.correct));
  assert.equal(api.store['cmi.core.lesson_status'], 'completed');
  assert.equal(api.store['cmi.core.score.raw'], '100');
  assert.equal(tracker.finish(), true);
  assert.equal(tracker.finish(), false);
  assert.equal(api.finishes, 1);
  const resumed = create(api);
  assert.equal(resumed.snapshot().answered, 4);
  resumed.record(0, 0);
  assert.equal(resumed.snapshot().rows[0].n, 2);
  assert.equal(resumed.snapshot().first, 100);
  assert.equal(resumed.snapshot().latest, 75);
  assert.equal(create(lms({ 'cmi.core.student_id': 'other' })).snapshot().answered, 0);
});
test('a failed commit retains one pending answer and retrying never duplicates it', () => {
  const api = lms(), tracker = create(api);
  api.commitFails = true;
  assert.equal(tracker.record(0, 0), true);
  assert.equal(tracker.snapshot().pending, true);
  assert.equal(tracker.snapshot().saved, false);
  assert.equal(tracker.record(0, 1), false);
  assert.equal(tracker.save(), false);
  assert.equal(api.store['cmi.interactions._count'], '13');
  api.commitFails = false;
  assert.equal(tracker.save(), true);
  assert.equal(tracker.snapshot().rows[0].n, 1);
  assert.equal(api.store['cmi.interactions._count'], '13');
  assert.equal(tracker.snapshot().pending, false);
});
test('a partially written interaction can be retried without skipping indices', () => {
  const api = lms(), tracker = create(api);
  api.failField = 'cmi.interactions.5.student_response';
  tracker.record(2, 1);
  assert.equal(tracker.snapshot().pending, true);
  api.failField = '';
  assert.equal(tracker.save(), true);
  assert.equal(api.store['cmi.interactions._count'], '13');
});
test('review mode, required-LMS launch, and mismatched saved state block submissions', () => {
  const api = lms({ 'cmi.core.lesson_mode': 'review' });
  const tracker = create(api);
  assert.equal(tracker.record(0, 1), false);
  assert.equal(tracker.save(), false);
  tracker.finish();
  assert.equal(api.writes.length, 0);
  assert.equal(create(null, { requireLMS: true }).snapshot().blocked, true);
  assert.equal(create(lms({ 'cmi.suspend_data': '{broken' })).snapshot().blocked, true);
  assert.equal(create(lms({ 'cmi.interactions._count': '8' })).snapshot().blocked, true);
});
test('changed LMS interaction count prevents conflicting writes from another tab', () => {
  const api = lms(), tracker = create(api);
  tracker.record(0, 1);
  api.store['cmi.interactions._count'] = '14';
  assert.equal(tracker.record(1, 2), false);
  assert.equal(tracker.snapshot().blocked, true);
});
test('compact progress remains within 4096 characters after many attempts', () => {
  const api = lms(), tracker = create(api);
  for (let n = 0; n < 1000; n++) tracker.record(n % questions.length, n % 3);
  assert.equal(tracker.snapshot().seq, 1000);
  assert.ok(api.store['cmi.suspend_data'].length < 4096);
  assert.equal(create(api).snapshot().seq, 1000);
});
test('practice resumes in the same tab and CSV guards spreadsheet formulas', () => {
  const memory = new Map(), storage = { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v) };
  const tracker = create(null, { storage });
  tracker.record(1, 0); tracker.record(1, 2);
  assert.equal(create(null, { storage }).snapshot().rows[1].n, 2);
  assert.equal(tracker.snapshot().mode, 'practice');
  assert.match(tracker.csv(), /Anonymous practice/);
  const named = create(lms({ 'cmi.core.student_name': '=HYPERLINK("bad")' }));
  assert.match(named.csv(), /"'=HYPERLINK\(""bad""\)"/);
});
test('session duration and parent/opener API discovery', () => {
  assert.equal(duration(3661230), '0001:01:01.23');
  const api = lms();
  const top = { API: api }; top.parent = top;
  assert.equal(findAPI({ parent: top }), api);
  const popup = {}; popup.parent = popup; popup.opener = top;
  assert.equal(findAPI(popup), api);
});
test('page scripts parse and never erase prior answers during route review', () => {
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  assert.ok(!html.includes('state.answers = {};'));
  assert.ok(html.includes('data-try-again'));
  assert.ok(html.includes('data-export'));
});
