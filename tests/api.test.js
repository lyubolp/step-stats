/**
 * tests/api.test.js
 * Unit tests for pb_public/js/api.js
 *
 * Loads the source file into a vm context and injects a mock `fetch` so no
 * real HTTP requests are made.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SRC = fs.readFileSync(
  path.join(__dirname, '../pb_public/js/api.js'), 'utf8'
);

/**
 * Build a mock fetch function that returns a single canned response.
 * Captures the last url and options for assertion.
 */
function makeFetch({ status = 200, body = {}, ok = null, jsonFails = false } = {}) {
  const isOk = ok !== null ? ok : status < 400;
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: isOk,
      status,
      json: jsonFails
        ? async () => { throw new Error('json parse error'); }
        : async () => body,
    };
  };
  fn.calls = calls;
  return fn;
}

/**
 * Build a fetch that cycles through a sequence of responses.
 */
function makeSequenceFetch(responses) {
  let i = 0;
  return async (url, opts) => {
    const r = responses[i++] || responses[responses.length - 1];
    return {
      ok:     r.ok !== undefined ? r.ok : r.status < 400,
      status: r.status || 200,
      json:   async () => r.body || {},
    };
  };
}

/**
 * Load api.js into an isolated vm context with the given fetch mock.
 */
function loadApi(fetchMock) {
  const ctx = vm.createContext({
    fetch: fetchMock,
    URLSearchParams,
    encodeURIComponent,
    JSON,
    Date,
    String,
    Number,
    parseInt,
    console,
    Error,
  });
  vm.runInContext(SRC, ctx);
  return ctx;
}

// ─── _request (tested indirectly through public functions) ───────────────────

describe('_request — request construction', () => {
  test('sends GET with no body', async () => {
    const fetch = makeFetch({ body: { items: [] } });
    const api = loadApi(fetch);
    await api.getAllSteps();
    const { opts } = fetch.calls[0];
    assert.equal(opts.method, 'GET');
    assert.equal(opts.body,   undefined);
  });

  test('sends POST with JSON-serialised body', async () => {
    const fetch = makeFetch({ status: 200, body: { id: 'abc' } });
    const api = loadApi(fetch);
    await api.createStep('2026-01-01', 10_000);
    const { opts } = fetch.calls[0];
    assert.equal(opts.method, 'POST');
    assert.deepEqual(JSON.parse(opts.body), { date: '2026-01-01', count: 10_000 });
  });

  test('DELETE returns null (204 response)', async () => {
    const fetch = makeFetch({ status: 204, ok: true });
    const api = loadApi(fetch);
    const result = await api.deleteStep('id-1');
    assert.equal(result, null);
  });

  test('throws when response is not ok and json provides message', async () => {
    const fetch = makeFetch({ status: 400, ok: false, body: { message: 'bad data' } });
    const api = loadApi(fetch);
    await assert.rejects(
      () => api.createStep('2026-01-01', -1),
      (err) => {
        assert.equal(err.message, 'bad data');
        return true;
      }
    );
  });

  test('throws HTTP status code when error body json fails to parse', async () => {
    const fetch = makeFetch({ status: 500, ok: false, jsonFails: true });
    const api = loadApi(fetch);
    await assert.rejects(
      () => api.getAllSteps(),
      (err) => {
        assert.match(err.message, /HTTP 500/);
        return true;
      }
    );
  });
});

// ─── getStepsForMonth ─────────────────────────────────────────────────────────

describe('getStepsForMonth', () => {
  test('returns items array on success', async () => {
    const items = [{ date: '2026-03-01', count: 8_000 }];
    const api = loadApi(makeFetch({ body: { items } }));
    const result = await api.getStepsForMonth(2026, 3);
    assert.deepEqual(result, items);
  });

  test('returns empty array when items is undefined', async () => {
    const api = loadApi(makeFetch({ body: {} }));
    const result = await api.getStepsForMonth(2026, 3);
    assert.equal(result.length, 0);
  });

  test('includes correct date range in filter', async () => {
    const fetch = makeFetch({ body: { items: [] } });
    const api = loadApi(fetch);
    await api.getStepsForMonth(2026, 3);
    const { url } = fetch.calls[0];
    assert.ok(url.includes("2026-03-01"), `URL missing from-date: ${url}`);
    assert.ok(url.includes("2026-03-31"), `URL missing to-date: ${url}`);
  });

  test('February end date is correct for non-leap year', async () => {
    const fetch = makeFetch({ body: { items: [] } });
    const api = loadApi(fetch);
    await api.getStepsForMonth(2025, 2);
    assert.ok(fetch.calls[0].url.includes('2025-02-28'));
  });

  test('February end date is correct for leap year', async () => {
    const fetch = makeFetch({ body: { items: [] } });
    const api = loadApi(fetch);
    await api.getStepsForMonth(2024, 2);
    assert.ok(fetch.calls[0].url.includes('2024-02-29'));
  });
});

// ─── getStepsForYear ──────────────────────────────────────────────────────────

describe('getStepsForYear', () => {
  test('returns items', async () => {
    const items = [{ date: '2026-06-15', count: 9_000 }];
    const api = loadApi(makeFetch({ body: { items } }));
    assert.deepEqual(await api.getStepsForYear(2026), items);
  });

  test('returns empty array when items missing', async () => {
    const api = loadApi(makeFetch({ body: {} }));
    assert.equal((await api.getStepsForYear(2026)).length, 0);
  });
});

// ─── getAllSteps ──────────────────────────────────────────────────────────────

describe('getAllSteps', () => {
  test('returns all items', async () => {
    const items = [{ date: '2025-01-01', count: 7_000 }];
    const api = loadApi(makeFetch({ body: { items } }));
    assert.deepEqual(await api.getAllSteps(), items);
  });

  test('returns empty array when items missing', async () => {
    const api = loadApi(makeFetch({ body: {} }));
    assert.equal((await api.getAllSteps()).length, 0);
  });
});

// ─── getStepByDate ────────────────────────────────────────────────────────────

describe('getStepByDate', () => {
  test('returns first item when found', async () => {
    const record = { id: 'r1', date: '2026-03-10', count: 11_000 };
    const api = loadApi(makeFetch({ body: { items: [record] } }));
    assert.deepEqual(await api.getStepByDate('2026-03-10'), record);
  });

  test('returns null when not found (empty items)', async () => {
    const api = loadApi(makeFetch({ body: { items: [] } }));
    assert.equal(await api.getStepByDate('2026-03-10'), null);
  });

  test('returns null when items is undefined', async () => {
    const api = loadApi(makeFetch({ body: {} }));
    assert.equal(await api.getStepByDate('2026-03-10'), null);
  });
});

// ─── createStep ───────────────────────────────────────────────────────────────

describe('createStep', () => {
  test('POSTs correct payload', async () => {
    const fetch = makeFetch({ body: { id: 'new-id' } });
    const api = loadApi(fetch);
    await api.createStep('2026-04-01', 12_000);
    const { opts, url } = fetch.calls[0];
    assert.equal(opts.method, 'POST');
    assert.ok(url.includes('/steps/records'));
    assert.deepEqual(JSON.parse(opts.body), { date: '2026-04-01', count: 12_000 });
  });
});

// ─── updateStep ───────────────────────────────────────────────────────────────

describe('updateStep', () => {
  test('PATCHes the correct record URL', async () => {
    const fetch = makeFetch({ body: { id: 'r1' } });
    const api = loadApi(fetch);
    await api.updateStep('r1', 9_000);
    const { opts, url } = fetch.calls[0];
    assert.equal(opts.method, 'PATCH');
    assert.ok(url.includes('/r1'));
    assert.deepEqual(JSON.parse(opts.body), { count: 9_000 });
  });
});

// ─── deleteStep ───────────────────────────────────────────────────────────────

describe('deleteStep', () => {
  test('DELETEs the correct record URL', async () => {
    const fetch = makeFetch({ status: 204, ok: true });
    const api = loadApi(fetch);
    await api.deleteStep('r1');
    const { opts, url } = fetch.calls[0];
    assert.equal(opts.method, 'DELETE');
    assert.ok(url.includes('/r1'));
  });
});

// ─── getStepsAsCSV ────────────────────────────────────────────────────────────

describe('getStepsAsCSV', () => {
  test('returns header + one row per step', async () => {
    const items = [
      { date: '2026-01-01T00:00:00Z', count: 8_000 },
      { date: '2026-01-02T00:00:00Z', count: 11_000 },
    ];
    const api = loadApi(makeFetch({ body: { items } }));
    const csv = await api.getStepsAsCSV();
    const lines = csv.split('\n');
    assert.equal(lines[0], 'date,count');
    assert.equal(lines[1], '2026-01-01,8000');
    assert.equal(lines[2], '2026-01-02,11000');
  });

  test('returns only header for empty steps', async () => {
    const api = loadApi(makeFetch({ body: { items: [] } }));
    const csv = await api.getStepsAsCSV();
    assert.equal(csv, 'date,count');
  });
});

// ─── importStepsFromRows ──────────────────────────────────────────────────────

describe('importStepsFromRows', () => {
  test('creates records for new dates', async () => {
    // getAllSteps returns empty, so all rows are new
    const fetch = makeSequenceFetch([
      { status: 200, body: { items: [] } },  // getAllSteps
      { status: 200, body: { id: 'x1' } },  // createStep row 1
      { status: 200, body: { id: 'x2' } },  // createStep row 2
    ]);
    const api = loadApi(fetch);
    const result = await api.importStepsFromRows([
      { date: '2026-01-01', count: 8_000 },
      { date: '2026-01-02', count: 9_000 },
    ]);
    assert.equal(result.created, 2);
    assert.equal(result.updated, 0);
    assert.equal(result.errors.length, 0);
  });

  test('updates records for existing dates', async () => {
    const existing = [{ id: 'e1', date: '2026-01-01T00:00:00Z', count: 5_000 }];
    const fetch = makeSequenceFetch([
      { status: 200, body: { items: existing } }, // getAllSteps
      { status: 200, body: { id: 'e1' } },        // updateStep
    ]);
    const api = loadApi(fetch);
    const result = await api.importStepsFromRows([
      { date: '2026-01-01', count: 10_000 },
    ]);
    assert.equal(result.created, 0);
    assert.equal(result.updated, 1);
    assert.equal(result.errors.length, 0);
  });

  test('records error for a failed row and continues processing', async () => {
    const fetch = makeSequenceFetch([
      { status: 200, body: { items: [] } },         // getAllSteps
      { status: 400, ok: false, body: { message: 'duplicate' } }, // createStep fails
      { status: 200, body: { id: 'x2' } },          // createStep row 2 succeeds
    ]);
    const api = loadApi(fetch);
    const result = await api.importStepsFromRows([
      { date: '2026-01-01', count: 8_000 },
      { date: '2026-01-02', count: 9_000 },
    ]);
    assert.equal(result.created, 1);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].includes('2026-01-01'));
  });

  test('mixed create and update in one import', async () => {
    const existing = [{ id: 'e1', date: '2026-01-01T00:00:00Z', count: 5_000 }];
    const fetch = makeSequenceFetch([
      { status: 200, body: { items: existing } }, // getAllSteps
      { status: 200, body: { id: 'e1' } },        // updateStep row 1
      { status: 200, body: { id: 'x2' } },        // createStep row 2
    ]);
    const api = loadApi(fetch);
    const result = await api.importStepsFromRows([
      { date: '2026-01-01', count: 10_000 }, // update
      { date: '2026-01-02', count:  8_000 }, // create
    ]);
    assert.equal(result.created, 1);
    assert.equal(result.updated, 1);
    assert.equal(result.errors.length, 0);
  });

  test('returns zeros for empty rows array', async () => {
    const api = loadApi(makeFetch({ body: { items: [] } }));
    const result = await api.importStepsFromRows([]);
    assert.equal(result.created, 0);
    assert.equal(result.updated, 0);
    assert.equal(result.errors.length, 0);
  });
});

// ─── getGoalForYear ───────────────────────────────────────────────────────────

describe('getGoalForYear', () => {
  test('returns goal record when found', async () => {
    const record = { id: 'g1', year: 2026, target: 3_650_000 };
    const api = loadApi(makeFetch({ body: { items: [record] } }));
    assert.deepEqual(await api.getGoalForYear(2026), record);
  });

  test('returns null when no goal is set', async () => {
    const api = loadApi(makeFetch({ body: { items: [] } }));
    assert.equal(await api.getGoalForYear(2026), null);
  });

  test('returns null when items is undefined', async () => {
    const api = loadApi(makeFetch({ body: {} }));
    assert.equal(await api.getGoalForYear(2026), null);
  });
});

// ─── getAllGoals ──────────────────────────────────────────────────────────────

describe('getAllGoals', () => {
  test('returns all goal records', async () => {
    const items = [{ id: 'g1', year: 2025 }, { id: 'g2', year: 2026 }];
    const api = loadApi(makeFetch({ body: { items } }));
    assert.deepEqual(await api.getAllGoals(), items);
  });

  test('returns empty array when items missing', async () => {
    const api = loadApi(makeFetch({ body: {} }));
    assert.equal((await api.getAllGoals()).length, 0);
  });
});

// ─── createGoal / updateGoal / deleteGoal ─────────────────────────────────────

describe('createGoal', () => {
  test('POSTs year and target', async () => {
    const fetch = makeFetch({ body: { id: 'g1' } });
    const api = loadApi(fetch);
    await api.createGoal(2026, 3_650_000);
    const { opts } = fetch.calls[0];
    assert.equal(opts.method, 'POST');
    assert.deepEqual(JSON.parse(opts.body), { year: 2026, target: 3_650_000 });
  });
});

describe('updateGoal', () => {
  test('PATCHes the goal with new target', async () => {
    const fetch = makeFetch({ body: { id: 'g1' } });
    const api = loadApi(fetch);
    await api.updateGoal('g1', 4_000_000);
    const { opts, url } = fetch.calls[0];
    assert.equal(opts.method, 'PATCH');
    assert.ok(url.includes('/g1'));
    assert.deepEqual(JSON.parse(opts.body), { target: 4_000_000 });
  });
});

describe('deleteGoal', () => {
  test('DELETEs the goal record', async () => {
    const fetch = makeFetch({ status: 204, ok: true });
    const api = loadApi(fetch);
    await api.deleteGoal('g1');
    const { opts, url } = fetch.calls[0];
    assert.equal(opts.method, 'DELETE');
    assert.ok(url.includes('/g1'));
  });
});
