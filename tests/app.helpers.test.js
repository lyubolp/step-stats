/**
 * tests/app.helpers.test.js
 * Unit tests for the pure helper functions in pb_public/js/app.js
 *
 * Only tests functions that have no DOM / Alpine / PocketBase dependencies:
 *   fmtNum, fmtDate, parseStepsCSV
 *
 * The vm context provides minimal stubs so the file loads without errors
 * (render functions, app(), etc. are defined but never called).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

// ─── Load app.js into a vm context ───────────────────────────────────────────

const SRC = fs.readFileSync(
  path.join(__dirname, '../pb_public/js/app.js'), 'utf8'
);

// Stubs for browser globals referenced in function bodies that are defined
// but not called during this test run.
const browserStubs = {
  window:    { location: { hash: '#/' }, matchMedia: () => ({ matches: false }), addEventListener: () => {} },
  document:  { getElementById: () => null, documentElement: { classList: { toggle: () => {} } } },
  localStorage: { getItem: () => null, setItem: () => {} },
  Alpine:    { initTree: () => {} },
};

// Stats & api functions referenced inside render functions (not called here)
const funcStubs = new Proxy({}, { get: () => () => {} });

function loadApp() {
  const ctx = vm.createContext({
    // Standard JS globals
    Date, Math, parseInt, parseFloat, isNaN,
    String, Number, Boolean, Array, Object, Set, Map, RegExp, Error, JSON,
    Infinity, NaN, console, Promise,
    // Browser stubs
    ...browserStubs,
    // Any global function name referenced in app.js that we don't want to fail
    // on load (all render helpers call stats/api functions via their names).
    ...funcStubs,
  });
  vm.runInContext(SRC, ctx);
  return ctx;
}

const A = loadApp();

// ─── fmtNum ───────────────────────────────────────────────────────────────────

describe('fmtNum', () => {
  test('rounds a float to the nearest integer', () => {
    // toLocaleString output is locale-dependent; test the numeric value
    const raw = Math.round(9_876.6);
    assert.equal(A.fmtNum(9_876.6), raw.toLocaleString());
  });

  test('returns a string', () => {
    assert.equal(typeof A.fmtNum(1_000), 'string');
  });

  test('handles zero', () => {
    assert.equal(A.fmtNum(0), (0).toLocaleString());
  });

  test('handles negative numbers', () => {
    const n = -500;
    assert.equal(A.fmtNum(n), n.toLocaleString());
  });
});

// ─── fmtDate ─────────────────────────────────────────────────────────────────

describe('fmtDate', () => {
  test('returns em-dash for null', () => {
    assert.equal(A.fmtDate(null), '—');
  });

  test('returns em-dash for undefined', () => {
    assert.equal(A.fmtDate(undefined), '—');
  });

  test('returns em-dash for empty string', () => {
    assert.equal(A.fmtDate(''), '—');
  });

  test('formats a date in "Mon D, YYYY" format', () => {
    assert.equal(A.fmtDate('2026-03-15'), 'Mar 15, 2026');
  });

  test('formats January correctly', () => {
    assert.equal(A.fmtDate('2026-01-01'), 'Jan 1, 2026');
  });

  test('formats December correctly', () => {
    assert.equal(A.fmtDate('2026-12-31'), 'Dec 31, 2026');
  });

  test('does not zero-pad the day in the output', () => {
    // Day 5 should appear as "5", not "05"
    assert.equal(A.fmtDate('2026-04-05'), 'Apr 5, 2026');
  });
});

// ─── parseStepsCSV ───────────────────────────────────────────────────────────

describe('parseStepsCSV', () => {
  // ── Error cases ────────────────────────────────────────────────────────────

  test('throws on empty string', () => {
    assert.throws(
      () => A.parseStepsCSV(''),
      (err) => { assert.match(err.message, /empty/i); return true; }
    );
  });

  test('throws on whitespace-only input', () => {
    assert.throws(
      () => A.parseStepsCSV('   \n  \n  '),
      (err) => { assert.match(err.message, /empty/i); return true; }
    );
  });

  test('throws when a row has fewer than two columns', () => {
    assert.throws(
      () => A.parseStepsCSV('2026-01-01'),
      (err) => { assert.match(err.message, /Invalid row/i); return true; }
    );
  });

  test('throws on invalid date format (not YYYY-MM-DD)', () => {
    assert.throws(
      () => A.parseStepsCSV('01/15/2026,5000'),
      (err) => { assert.match(err.message, /Invalid date/i); return true; }
    );
  });

  test('throws on date with wrong number of digits', () => {
    assert.throws(
      () => A.parseStepsCSV('26-01-01,5000'),
      (err) => { assert.match(err.message, /Invalid date/i); return true; }
    );
  });

  test('throws on non-numeric count', () => {
    assert.throws(
      () => A.parseStepsCSV('2026-01-01,abc'),
      (err) => { assert.match(err.message, /Invalid count/i); return true; }
    );
  });

  test('throws on negative count', () => {
    assert.throws(
      () => A.parseStepsCSV('2026-01-01,-100'),
      (err) => { assert.match(err.message, /Invalid count/i); return true; }
    );
  });

  test('throws when only a header row is present (no data rows)', () => {
    assert.throws(
      () => A.parseStepsCSV('date,count'),
      (err) => { assert.match(err.message, /No data rows/i); return true; }
    );
  });

  test('error message includes the offending line number', () => {
    const csv = '2026-01-01,10000\nbad-date,5000';
    assert.throws(
      () => A.parseStepsCSV(csv),
      (err) => { assert.match(err.message, /line 2/i); return true; }
    );
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  test('parses valid CSV without header', () => {
    const csv = '2026-01-01,8000\n2026-01-02,11000';
    const rows = A.parseStepsCSV(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].date,  '2026-01-01');
    assert.equal(rows[0].count, 8_000);
    assert.equal(rows[1].date,  '2026-01-02');
    assert.equal(rows[1].count, 11_000);
  });

  test('skips header row when present (case-insensitive)', () => {
    const csv = 'Date,Count\n2026-01-01,8000';
    const rows = A.parseStepsCSV(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].date, '2026-01-01');
  });

  test('handles Windows-style CRLF line endings', () => {
    const csv = 'date,count\r\n2026-01-01,8000\r\n2026-01-02,9000';
    const rows = A.parseStepsCSV(csv);
    assert.equal(rows.length, 2);
  });

  test('trims whitespace around values', () => {
    const csv = ' 2026-01-01 , 8000 ';
    const rows = A.parseStepsCSV(csv);
    assert.equal(rows[0].date,  '2026-01-01');
    assert.equal(rows[0].count, 8_000);
  });

  test('parses count 0 as valid', () => {
    const rows = A.parseStepsCSV('2026-01-01,0');
    assert.equal(rows[0].count, 0);
  });

  test('ignores blank lines between rows', () => {
    const csv = '2026-01-01,8000\n\n2026-01-02,9000\n';
    const rows = A.parseStepsCSV(csv);
    assert.equal(rows.length, 2);
  });
});
