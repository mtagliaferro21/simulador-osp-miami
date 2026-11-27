/* SCORM 1.2 response tracking. No credentials or learner records are sent to GitHub. */
(function (root) {
  "use strict";
  const clone = value => JSON.parse(JSON.stringify(value));
  const truth = value => String(value).toLowerCase() === "true";
  const letter = index => String.fromCharCode(65 + index);
  function duration(milliseconds) {
    const cs = Math.max(0, Math.min(3599999999, Math.floor(milliseconds / 10)));
    return `${String(Math.floor(cs / 360000)).padStart(4, "0")}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
  }
  function findAPI(win) {
    const seen = new Set();
    function search(start) {
      let current = start;
      for (let depth = 0; current && depth < 20 && !seen.has(current); depth++) {
        seen.add(current);
        try {
          if (current.API && typeof current.API.LMSInitialize === "function") return current.API;
          if (current.parent === current) break;
          current = current.parent;
        } catch (_) { break; }
      }
      return null;
    }
    const found = search(win);
    if (found) return found;
    try { return search(win.opener); } catch (_) { return null; }
  }
  function createOSPTracking(questions, options = {}) {
    const win = options.window || root;
    const now = options.now || Date.now;
    const launchTime = now();
    const api = options.api === undefined ? findAPI(win) : options.api;
    const key = "fiberlog-osp-practice-v1";
    // Detect changed questions: never silently mix records from different editions.
    const questionText = JSON.stringify(questions.map(q => [q.id, q.question, q.choices, q.correct]));
    let hash = 2166136261;
    for (const ch of questionText) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
    const revision = hash.toString(16);
    const emptyRow = () => ({ n: 0, c: 0, w: 0, first: null, last: null, start: null, end: null });
    let data = { v: 1, rev: revision, base: null, next: null, seq: 0, rows: questions.map(emptyRow) };
    let initialized = false, finished = false, readonly = false, blocked = false;
    let pending = null, error = "", saved = false;
    let learner = { id: "", name: "" };
    let storage;
    try { storage = options.storage === undefined ? win.sessionStorage : options.storage; } catch (_) { /* private browsing */ }
    function get(name) {
      const value = api.LMSGetValue(name);
      if (String(api.LMSGetLastError()) !== "0") throw new Error(`Could not read ${name}.`);
      return String(value);
    }
    function set(name, value) {
      if (!truth(api.LMSSetValue(name, String(value)))) throw new Error(`Could not save ${name}.`);
    }
    function load(raw) {
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const integer = n => Number.isSafeInteger(n) && n >= 0;
      const choice = (n, i) => Number.isInteger(n) && n >= 0 && n < questions[i].choices.length;
      if (parsed.v !== 1 || parsed.rev !== revision || !Array.isArray(parsed.rows) || parsed.rows.length !== questions.length ||
          !integer(parsed.seq) || !parsed.rows.every((r, i) => integer(r.n) && integer(r.c) && integer(r.w) && r.n === r.c + r.w &&
            (r.n === 0 ? r.first === null && r.last === null : choice(r.first, i) && choice(r.last, i) && typeof r.start === "string" && typeof r.end === "string")) ||
          parsed.rows.reduce((n, r) => n + r.n, 0) !== parsed.seq ||
          !(parsed.base === null && parsed.next === null || integer(parsed.base) && integer(parsed.next) && parsed.next >= parsed.base + questions.length * 3)) {
        throw new Error("Saved results belong to a different or invalid activity version. Contact your instructor.");
      }
      data = parsed;
    }
    function interactionCount() {
      const value = get("cmi.interactions._count");
      if (!/^\d+$/.test(value)) throw new Error("The LMS did not provide its interaction count.");
      const count = Number(value);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid interaction count.");
      return count;
    }
    try {
      if (api) {
        if (!truth(api.LMSInitialize(""))) throw new Error("TalentLMS could not start result tracking. Reopen the activity from your course.");
        initialized = true;
        const mode = get("cmi.core.lesson_mode");
        readonly = mode === "review" || mode === "browse";
        learner = { id: get("cmi.core.student_id"), name: get("cmi.core.student_name") };
        load(get("cmi.suspend_data"));
        const count = interactionCount();
        if (data.next !== null && count < data.next) throw new Error("The LMS history does not match the saved progress. Contact your instructor.");
        if (data.seq === 0 && count > 0) throw new Error("The LMS contains prior answers without matching saved progress. Contact your instructor before starting again.");
        saved = true;
      } else if (options.requireLMS) {
        blocked = true;
        error = "Open this activity from your TalentLMS course to record answers. A direct link cannot report your results.";
      } else {
        try { load(storage?.getItem(key)); } catch (_) { data = { v: 1, rev: revision, base: null, next: null, seq: 0, rows: questions.map(emptyRow) }; }
      }
    } catch (e) { blocked = true; error = e.message; }

    function scores() {
      return {
        first: Math.round(100 * data.rows.filter((r, i) => r.n && r.first === questions[i].correct).length / questions.length),
        latest: Math.round(100 * data.rows.filter((r, i) => r.n && r.last === questions[i].correct).length / questions.length),
        answered: data.rows.filter(r => r.n).length,
      };
    }
    function snapshot() {
      return { ...clone(data), ...scores(), learner: { ...learner }, mode: api ? "lms" : "practice",
        readonly, blocked, pending: !!pending, error, saved, finished };
    }
    function writeInteraction(index, fields) {
      // id must be written before other interaction fields in SCORM 1.2.
      for (const [name, value] of Object.entries(fields)) set(`cmi.interactions.${index}.${name}`, value);
    }
    function flush() {
      if (blocked || readonly || finished) return false;
      if (!api) {
        try { storage?.setItem(key, JSON.stringify(data)); }
        catch (_) { /* UI explicitly describes browser-local practice, not instructor reporting. */ }
        pending = null; error = ""; saved = false;
        return true;
      }
      try {
        if (pending) {
          // Retry uses identical slots and values, so a failed commit cannot double-count an answer.
          data.rows.forEach((r, i) => {
            for (const [offset, name, value] of [[0, "ATTEMPTS", r.n], [1, "CORRECT", r.c], [2, "INCORRECT", r.w]]) {
              writeInteraction(data.base + i * 3 + offset, {
                id: `${questions[i].id}__${name}`, type: "numeric", weighting: "0", student_response: value, result: "neutral",
              });
            }
          });
          writeInteraction(pending.index, pending.fields);
        }
        const serialized = JSON.stringify(data);
        if (serialized.length > 4096) throw new Error("Saved progress exceeds the SCORM 1.2 size limit.");
        const score = scores();
        set("cmi.suspend_data", serialized);
        set("cmi.core.score.min", "0"); set("cmi.core.score.max", "100");
        set("cmi.core.score.raw", score.first);
        set("cmi.core.lesson_status", score.answered === questions.length ? "completed" : "incomplete");
        set("cmi.core.exit", "suspend");
        set("cmi.core.session_time", duration(now() - launchTime));
        if (!truth(api.LMSCommit(""))) throw new Error("TalentLMS did not confirm saving. Keep this page open and retry saving.");
        pending = null; error = ""; saved = true;
        return true;
      } catch (e) { error = e.message; saved = false; return false; }
    }
    function record(questionIndex, choice, elapsed = 0) {
      if (blocked || readonly || finished || pending || error) return false;
      const question = questions[questionIndex];
      if (!question || !Number.isInteger(choice) || choice < 0 || choice >= question.choices.length) return false;
      let index = null;
      if (api) {
        try {
          const count = interactionCount();
          if (data.next !== null && count !== data.next) throw new Error("Another session changed this activity. Close duplicate tabs and reopen it from TalentLMS.");
          if (data.base === null) { data.base = count; data.next = count + questions.length * 3; }
          index = data.next;
        } catch (e) { blocked = true; error = e.message; return false; }
      }
      const timestamp = new Date(now()).toISOString();
      const row = data.rows[questionIndex];
      row.n++; row[choice === question.correct ? "c" : "w"]++;
      if (row.first === null) { row.first = choice; row.start = timestamp; }
      row.last = choice; row.end = timestamp; data.seq++;
      if (api) {
        data.next = index + 1;
        pending = { index, fields: {
          id: `${question.id}__TRY_${String(row.n).padStart(4, "0")}__${timestamp.replace(/[-:.]/g, "")}`,
          type: "choice", time: timestamp.slice(11, 19), "correct_responses.0.pattern": letter(question.correct),
          weighting: "1", student_response: letter(choice), result: choice === question.correct ? "correct" : "wrong",
          latency: duration(elapsed),
        } };
      }
      flush();
      return true; // Accepted locally; snapshot.saved/pending distinguishes LMS confirmation.
    }
    function finish() {
      if (!initialized || finished || blocked) return false;
      if (!readonly && !flush()) return false;
      try {
        if (!truth(api.LMSFinish(""))) throw new Error("TalentLMS could not close the tracking session.");
        finished = true; return true;
      } catch (e) { error = e.message; saved = false; return false; }
    }
    function csv() {
      const safe = value => {
        let text = String(value ?? "");
        if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      };
      const header = ["Learner ID", "Learner Name", "Mode", "LMS Save Confirmed", "Question ID", "Asset", "Question", "Attempts", "Correct", "Incorrect", "First Answer", "First Result", "Latest Answer", "Latest Result", "First Submitted UTC", "Last Submitted UTC", "First-answer Score %", "Latest-answer Score %"];
      const score = scores();
      const rows = questions.map((q, i) => {
        const r = data.rows[i];
        return [learner.id, learner.name, api ? "TalentLMS" : "Anonymous practice", api && saved ? "Yes" : "No", q.id, q.title, q.question,
          r.n, r.c, r.w, r.n ? q.choices[r.first] : "", r.n ? (r.first === q.correct ? "Correct" : "Incorrect") : "Unanswered",
          r.n ? q.choices[r.last] : "", r.n ? (r.last === q.correct ? "Correct" : "Incorrect") : "Unanswered",
          r.start, r.end, score.first, score.latest];
      });
      return "\ufeff" + [header, ...rows].map(row => row.map(safe).join(",")).join("\r\n");
    }
    return { snapshot, record, save: flush, finish, csv };
  }
  root.createOSPTracking = createOSPTracking;
  if (typeof module !== "undefined" && module.exports) module.exports = { createOSPTracking, findAPI, duration };
})(typeof window === "undefined" ? globalThis : window);
