/**
 * tests/stats.test.js
 * Unit tests for pb_public/js/stats.js
 *
 * Loads the source file into a vm context so all functions are available
 * without a browser or bundler.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

// ─── Load stats.js into an isolated vm context ────────────────────────────────

const SRC = fs.readFileSync(
  path.join(__dirname, '../pb_public/js/stats.js'), 'utf8'
);

function load() {
  const ctx = vm.createContext({
    Date, Math, parseInt, parseFloat, isNaN,
    String, Number, Boolean, Array, Object, Set, Map, RegExp, Error, JSON,
    Infinity, NaN, console,
  });
  vm.runInContext(SRC, ctx);
  return ctx;
}

const S = load();

// Convenience: build a step record
function step(date, count) { return { date, count }; }

// ─── daysInYear ───────────────────────────────────────────────────────────────

describe('daysInYear', () => {
  test('divisible by 400 → leap (366)', () => {
    assert.equal(S.daysInYear(2000), 366);
    assert.equal(S.daysInYear(1600), 366);
  });

  test('divisible by 100 but not 400 → not leap (365)', () => {
    assert.equal(S.daysInYear(1900), 365);
    assert.equal(S.daysInYear(2100), 365);
  });

  test('divisible by 4 but not 100 → leap (366)', () => {
    assert.equal(S.daysInYear(2024), 366);
    assert.equal(S.daysInYear(2020), 366);
  });

  test('not divisible by 4 → not leap (365)', () => {
    assert.equal(S.daysInYear(2023), 365);
    assert.equal(S.daysInYear(2025), 365);
  });
});

// ─── daysInMonth ──────────────────────────────────────────────────────────────

describe('daysInMonth', () => {
  test('31-day months', () => {
    assert.equal(S.daysInMonth(2025, 1),  31); // Jan
    assert.equal(S.daysInMonth(2025, 3),  31); // Mar
    assert.equal(S.daysInMonth(2025, 12), 31); // Dec
  });

  test('30-day months', () => {
    assert.equal(S.daysInMonth(2025, 4),  30); // Apr
    assert.equal(S.daysInMonth(2025, 6),  30); // Jun
    assert.equal(S.daysInMonth(2025, 11), 30); // Nov
  });

  test('February in a non-leap year → 28', () => {
    assert.equal(S.daysInMonth(2025, 2), 28);
  });

  test('February in a leap year → 29', () => {
    assert.equal(S.daysInMonth(2024, 2), 29);
  });
});

// ─── parseDate / formatDate round-trip ───────────────────────────────────────

describe('parseDate / formatDate', () => {
  test('round-trip preserves date', () => {
    assert.equal(S.formatDate(S.parseDate('2026-03-15')), '2026-03-15');
  });

  test('parseDate returns local midnight (month is 0-indexed)', () => {
    const d = S.parseDate('2026-01-05');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(),    0);  // January = 0
    assert.equal(d.getDate(),     5);
  });

  test('formatDate pads month and day', () => {
    const d = new Date(2026, 0, 5); // Jan 5 2026
    assert.equal(S.formatDate(d), '2026-01-05');
  });
});

// ─── dailyGoal / monthlyGoal ──────────────────────────────────────────────────

describe('dailyGoal', () => {
  test('divides yearly target by days in year', () => {
    // 2025: 365 days
    assert.ok(Math.abs(S.dailyGoal(3_650_000, 2025) - 10_000) < 0.01);
  });

  test('handles leap year (366 days)', () => {
    assert.ok(Math.abs(S.dailyGoal(3_660_000, 2024) - 10_000) < 0.01);
  });
});

describe('monthlyGoal', () => {
  test('daily goal × days in month', () => {
    assert.equal(S.monthlyGoal(10_000, 2025, 1), 310_000); // Jan = 31
    assert.equal(S.monthlyGoal(10_000, 2025, 4), 300_000); // Apr = 30
  });
});

// ─── computeMonthlyProgress ───────────────────────────────────────────────────

describe('computeMonthlyProgress', () => {
  const steps = [
    step('2026-03-01', 12_000),
    step('2026-03-02',  8_000),
    step('2026-03-03', 11_000),
  ];
  const dGoal = 10_000;

  test('basic totals and completed days', () => {
    const today = new Date(2026, 2, 10); // Mar 10
    const p = S.computeMonthlyProgress(steps, dGoal, 2026, 3, today);
    assert.equal(p.actualTotal, 31_000);
    assert.equal(p.completedDays, 2); // 12k and 11k meet 10k goal
    assert.equal(p.totalDays, 31);
    assert.equal(p.currentDay, 10);
    assert.equal(p.remainingDays, 21);
  });

  test('ahead/behind is positive when over expected pace', () => {
    const today = new Date(2026, 2, 3); // Mar 3 — expected 30k, actual 31k
    const p = S.computeMonthlyProgress(steps, dGoal, 2026, 3, today);
    assert.ok(p.aheadBehind > 0);
  });

  test('stepsPerDayRemaining > 0 when days remain', () => {
    const today = new Date(2026, 2, 10);
    const p = S.computeMonthlyProgress(steps, dGoal, 2026, 3, today);
    assert.ok(p.stepsPerDayRemaining > 0);
  });

  test('stepsPerDayRemaining is 0 when no days remain (last day of month)', () => {
    const today = new Date(2026, 2, 31); // Mar 31 — last day
    const p = S.computeMonthlyProgress(steps, dGoal, 2026, 3, today);
    assert.equal(p.stepsPerDayRemaining, 0);
  });

  test('past month uses totalDays as currentDay', () => {
    const today = new Date(2026, 3, 5); // April — viewing March
    const p = S.computeMonthlyProgress(steps, dGoal, 2026, 3, today);
    assert.equal(p.currentDay, 31); // capped to daysInMonth
  });

  test('pctCompletion is 0 when dailyGoal is 0 (monthGoal = 0)', () => {
    const today = new Date(2026, 2, 10);
    const p = S.computeMonthlyProgress(steps, 0, 2026, 3, today);
    assert.equal(p.pctCompletion, 0);
  });

  test('empty steps array', () => {
    const today = new Date(2026, 2, 10);
    const p = S.computeMonthlyProgress([], dGoal, 2026, 3, today);
    assert.equal(p.actualTotal, 0);
    assert.equal(p.completedDays, 0);
  });
});

// ─── computeYearlyProgress ───────────────────────────────────────────────────

describe('computeYearlyProgress', () => {
  test('computes YTD total, expected, and ahead/behind', () => {
    const steps = [
      step('2026-01-01', 12_000),
      step('2026-01-02', 12_000),
    ];
    const dGoal = 10_000;
    const today = new Date(2026, 0, 2); // Jan 2 — 2 days elapsed
    const p = S.computeYearlyProgress(steps, dGoal, 2026, today);

    assert.equal(p.actualYTD,   24_000);
    assert.equal(p.expectedYTD, 20_000); // 10k × 2 days
    assert.equal(p.aheadBehind,  4_000);
    assert.ok(p.yearGoal > 0);
    assert.ok(p.pctCompletion > 0);
  });

  test('caps daysElapsed at daysInYear for a fully-elapsed year', () => {
    const steps = [];
    const today = new Date(2025, 11, 31); // Dec 31 2025
    const p = S.computeYearlyProgress(steps, 10_000, 2025, today);
    assert.equal(p.daysElapsed, 365);
  });

  test('behind pace when actual < expected', () => {
    const steps = [step('2026-01-01', 5_000)];
    const today = new Date(2026, 0, 5); // 5 days elapsed
    const p = S.computeYearlyProgress(steps, 10_000, 2026, today);
    assert.ok(p.aheadBehind < 0);
  });
});

// ─── computeYearlyBreakdown ───────────────────────────────────────────────────

describe('computeYearlyBreakdown', () => {
  test('returns 12 month entries', () => {
    const result = S.computeYearlyBreakdown([], 10_000, 2026);
    assert.equal(result.length, 12);
    assert.equal(result[0].month, 1);
    assert.equal(result[11].month, 12);
  });

  test('sums steps correctly per month', () => {
    const steps = [
      step('2026-01-10', 5_000),
      step('2026-01-11', 6_000),
      step('2026-02-01', 9_000),
    ];
    const result = S.computeYearlyBreakdown(steps, 10_000, 2026);
    assert.equal(result[0].total, 11_000); // Jan
    assert.equal(result[1].total,  9_000); // Feb
    assert.equal(result[2].total,      0); // Mar
  });

  test('completedDays counts days meeting the daily goal', () => {
    const steps = [
      step('2026-03-01', 10_000), // exactly meets
      step('2026-03-02',  9_999), // just under
    ];
    const result = S.computeYearlyBreakdown(steps, 10_000, 2026);
    assert.equal(result[2].completedDays, 1);
  });
});

// ─── computeMonthlyAverages ───────────────────────────────────────────────────

describe('computeMonthlyAverages', () => {
  test('returns empty array for empty input', () => {
    assert.deepEqual(S.computeMonthlyAverages([]), []);
  });

  test('groups by year-month and returns sorted results', () => {
    const steps = [
      step('2026-01-01', 8_000),
      step('2026-01-15', 12_000),
      step('2026-02-01', 9_000),
    ];
    const result = S.computeMonthlyAverages(steps);
    assert.equal(result.length, 2);
    assert.equal(result[0].key, '2026-01');
    assert.equal(result[1].key, '2026-02');
    assert.equal(result[0].total, 20_000);
    assert.equal(result[1].total,  9_000);
  });

  test('avg divides sum by days-in-month (not just recorded days)', () => {
    const steps = [step('2026-01-01', 31_000)]; // Jan = 31 days
    const result = S.computeMonthlyAverages(steps);
    assert.ok(Math.abs(result[0].avg - 1_000) < 0.01);
  });
});

// ─── computeBestWeek ─────────────────────────────────────────────────────────

describe('computeBestWeek', () => {
  test('returns null for empty input', () => {
    assert.equal(S.computeBestWeek([]), null);
  });

  test('single day returns a week containing that day', () => {
    const result = S.computeBestWeek([step('2026-03-02', 5_000)]); // Monday
    assert.ok(result !== null);
    assert.equal(result.total, 5_000);
  });

  test('picks week with highest total', () => {
    const steps = [
      step('2026-03-02', 1_000), // Mon week 1
      step('2026-03-03', 1_000), // Tue week 1
      step('2026-03-09', 9_000), // Mon week 2
      step('2026-03-10', 9_000), // Tue week 2
    ];
    const result = S.computeBestWeek(steps);
    assert.equal(result.total, 18_000);
    assert.equal(result.startDate, '2026-03-09');
    assert.equal(result.endDate,   '2026-03-15');
  });

  test('week start rolls back to Monday for a Sunday date', () => {
    // 2026-03-01 is a Sunday → first Monday is 2026-02-23
    const result = S.computeBestWeek([step('2026-03-01', 7_000)]);
    assert.ok(result !== null);
    // The week containing 2026-03-01 (Sunday) starts Mon 2026-02-23
    assert.equal(result.startDate, '2026-02-23');
    assert.equal(result.endDate,   '2026-03-01');
  });

  test('ties go to the first encountered week', () => {
    const steps = [
      step('2026-03-02', 1_000),
      step('2026-03-09', 1_000),
    ];
    const result = S.computeBestWeek(steps);
    assert.equal(result.total, 1_000);
    assert.equal(result.startDate, '2026-03-02');
  });
});

// ─── computeMaxDay ───────────────────────────────────────────────────────────

describe('computeMaxDay', () => {
  test('returns null for empty input', () => {
    assert.equal(S.computeMaxDay([]), null);
  });

  test('returns the single record', () => {
    const result = S.computeMaxDay([step('2026-01-10', 15_000)]);
    assert.equal(result.date,  '2026-01-10');
    assert.equal(result.count, 15_000);
  });

  test('returns the day with the highest count', () => {
    const steps = [
      step('2026-01-01',  8_000),
      step('2026-01-02', 25_000),
      step('2026-01-03', 11_000),
    ];
    const result = S.computeMaxDay(steps);
    assert.equal(result.date,  '2026-01-02');
    assert.equal(result.count, 25_000);
  });
});

// ─── computeBiggestStreak ────────────────────────────────────────────────────

describe('computeBiggestStreak', () => {
  test('returns null for empty input', () => {
    assert.equal(S.computeBiggestStreak([], 10_000), null);
  });

  test('returns null when no day meets the goal', () => {
    const steps = [step('2026-01-01', 1_000), step('2026-01-02', 999)];
    assert.equal(S.computeBiggestStreak(steps, 10_000), null);
  });

  test('streak of 1 when only a single day qualifies', () => {
    const steps = [
      step('2026-01-01',  9_000),
      step('2026-01-02', 15_000), // only this qualifies
      step('2026-01-03',  5_000),
    ];
    const result = S.computeBiggestStreak(steps, 10_000);
    assert.equal(result.length, 1);
    assert.equal(result.startDate, '2026-01-02');
    assert.equal(result.endDate,   '2026-01-02');
  });

  test('counts consecutive qualifying days', () => {
    const steps = [
      step('2026-01-01', 10_000),
      step('2026-01-02', 11_000),
      step('2026-01-03', 12_000),
    ];
    const result = S.computeBiggestStreak(steps, 10_000);
    assert.equal(result.length, 3);
    assert.equal(result.startDate, '2026-01-01');
    assert.equal(result.endDate,   '2026-01-03');
  });

  test('resets streak on a gap day (missing record)', () => {
    const steps = [
      step('2026-01-01', 10_000),
      step('2026-01-02', 10_000),
      // Jan 3 missing
      step('2026-01-04', 10_000),
      step('2026-01-05', 10_000),
      step('2026-01-06', 10_000),
    ];
    const result = S.computeBiggestStreak(steps, 10_000);
    assert.equal(result.length, 3);
    assert.equal(result.startDate, '2026-01-04');
  });

  test('resets streak when a day does not meet the goal', () => {
    const steps = [
      step('2026-01-01', 10_000),
      step('2026-01-02',  5_000), // under goal — breaks streak
      step('2026-01-03', 10_000),
      step('2026-01-04', 10_000),
      step('2026-01-05', 10_000),
    ];
    const result = S.computeBiggestStreak(steps, 10_000);
    assert.equal(result.length, 3);
    assert.equal(result.startDate, '2026-01-03');
  });

  test('longest streak not necessarily the last one', () => {
    const steps = [
      step('2026-01-01', 10_000),
      step('2026-01-02', 10_000),
      step('2026-01-03', 10_000),
      // gap
      step('2026-01-05', 10_000),
    ];
    const result = S.computeBiggestStreak(steps, 10_000);
    assert.equal(result.length, 3);
    assert.equal(result.endDate, '2026-01-03');
  });

  test('goal met exactly (boundary value)', () => {
    const steps = [step('2026-01-01', 10_000)];
    const result = S.computeBiggestStreak(steps, 10_000);
    assert.equal(result.length, 1);
  });
});

// ─── computeCurrentStreak ────────────────────────────────────────────────────

describe('computeCurrentStreak', () => {
  test('returns 0 for empty step data', () => {
    const result = S.computeCurrentStreak([], 10_000, new Date(2026, 2, 10));
    assert.equal(result, 0);
  });

  test('returns 0 when yesterday did not meet the goal', () => {
    const today = new Date(2026, 2, 5); // Mar 5
    const steps = [step('2026-03-04', 5_000)]; // yesterday, under goal
    assert.equal(S.computeCurrentStreak(steps, 10_000, today), 0);
  });

  test('returns 0 when yesterday has no record', () => {
    const today = new Date(2026, 2, 5);
    const steps = [step('2026-03-02', 12_000)]; // two days ago, not yesterday
    assert.equal(S.computeCurrentStreak(steps, 10_000, today), 0);
  });

  test('returns 1 when only yesterday meets the goal', () => {
    const today = new Date(2026, 2, 5); // Mar 5
    const steps = [
      step('2026-03-04', 10_000), // yesterday ✓
      step('2026-03-02', 10_000), // two days ago (gap on Mar 3) — streak breaks
    ];
    assert.equal(S.computeCurrentStreak(steps, 10_000, today), 1);
  });

  test('counts consecutive days ending yesterday', () => {
    const today = new Date(2026, 2, 5); // Mar 5
    const steps = [
      step('2026-03-01', 10_000),
      step('2026-03-02', 10_000),
      step('2026-03-03', 10_000),
      step('2026-03-04', 10_000), // yesterday
    ];
    assert.equal(S.computeCurrentStreak(steps, 10_000, today), 4);
  });

  test('today is excluded even when it meets the goal', () => {
    const today = new Date(2026, 2, 5);
    const steps = [
      step('2026-03-04', 10_000), // yesterday ✓
      step('2026-03-05', 20_000), // today — must not count
    ];
    // streak should be 1 (only yesterday), not 2
    assert.equal(S.computeCurrentStreak(steps, 10_000, today), 1);
  });

  test('streak stops at the first day below goal', () => {
    const today = new Date(2026, 2, 6); // Mar 6
    const steps = [
      step('2026-03-01', 10_000),
      step('2026-03-02', 10_000),
      step('2026-03-03',  5_000), // under goal — breaks
      step('2026-03-04', 10_000),
      step('2026-03-05', 10_000), // yesterday
    ];
    // Mar 5 and Mar 4 qualify; Mar 3 breaks the streak
    assert.equal(S.computeCurrentStreak(steps, 10_000, today), 2);
  });

  test('exactly meeting the goal counts (boundary value)', () => {
    const today = new Date(2026, 2, 3);
    const steps = [step('2026-03-02', 10_000)]; // exactly goal
    assert.equal(S.computeCurrentStreak(steps, 10_000, today), 1);
  });

  test('year boundary: Dec 31 not in dataset → streak is only Jan portion', () => {
    // Simulates passing only yearSteps (current year), so Dec 31 is absent
    const today = new Date(2026, 0, 3); // Jan 3
    const steps = [
      step('2026-01-01', 10_000),
      step('2026-01-02', 10_000), // yesterday
      // Dec 31 2025 would extend the streak but is not in this dataset
    ];
    assert.equal(S.computeCurrentStreak(steps, 10_000, today), 2);
  });
});
