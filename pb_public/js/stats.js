/**
 * stats.js — All client-side statistics computation.
 * No HTTP requests here — receives raw step/goal records as input.
 *
 * Step record shape: { id, date: 'YYYY-MM-DD', count: number }
 * Goal record shape: { id, year: number, target: number }
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysInYear(year) {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Parse 'YYYY-MM-DD' to a local-midnight Date (avoids UTC offset issues). */
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date to 'YYYY-MM-DD'. */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Return today's date string in 'YYYY-MM-DD'. */
function todayStr() {
  return formatDate(new Date());
}

// ─── Goal derivation ─────────────────────────────────────────────────────────

/**
 * Compute the daily goal from a yearly target.
 * @param {number} yearlyTarget
 * @param {number} year
 * @returns {number}
 */
function dailyGoal(yearlyTarget, year) {
  return yearlyTarget / daysInYear(year);
}

/**
 * Compute the monthly goal.
 * @param {number} dailyGoalValue
 * @param {number} year
 * @param {number} month - 1-indexed
 */
function monthlyGoal(dailyGoalValue, year, month) {
  return dailyGoalValue * daysInMonth(year, month);
}

// ─── Monthly progress ────────────────────────────────────────────────────────

/**
 * Compute full monthly progress stats for a given month.
 *
 * @param {Array}  steps      - step records for that month
 * @param {number} dailyGoalValue
 * @param {number} year
 * @param {number} month      - 1-indexed
 * @param {Date}   [today]    - override for testing; defaults to new Date()
 * @returns {Object}
 */
function computeMonthlyProgress(steps, dailyGoalValue, year, month, today = new Date()) {
  const total       = daysInMonth(year, month);
  const monthGoal   = monthlyGoal(dailyGoalValue, year, month);
  const actualTotal = steps.reduce((s, r) => s + r.count, 0);

  // Build a quick lookup: 'YYYY-MM-DD' -> count
  const byDate = {};
  steps.forEach(r => { byDate[r.date.slice(0, 10)] = r.count; });

  // Current day of month (capped to days in month for past months)
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const currentDay = isCurrentMonth ? today.getDate() : total;

  const currentExpected   = dailyGoalValue * currentDay;
  const diffToCompletion  = monthGoal - actualTotal;
  const aheadBehind       = actualTotal - currentExpected;
  const remainingDays     = total - currentDay;
  const stepsPerDayRemaining =
    remainingDays > 0 ? (monthGoal - actualTotal) / remainingDays : 0;
  const pctCompletion     = monthGoal > 0 ? (actualTotal / monthGoal) * 100 : 0;
  const completedDays     = steps.filter(r => r.count >= dailyGoalValue).length;

  return {
    monthGoal,
    actualTotal,
    pctCompletion,
    diffToCompletion,
    aheadBehind,
    stepsPerDayRemaining,
    completedDays,
    totalDays: total,
    currentDay,
    remainingDays,
    byDate,
    dailyGoal: dailyGoalValue,
  };
}

// ─── Year progress ───────────────────────────────────────────────────────────

/**
 * Compute year-to-date progress and ahead/behind pace.
 *
 * @param {Array}  steps          - all step records for the year (YTD)
 * @param {number} dailyGoalValue
 * @param {number} year
 * @param {Date}   [today]        - override for testing; defaults to new Date()
 * @returns {Object}
 */
function computeYearlyProgress(steps, dailyGoalValue, year, today = new Date()) {
  const yearGoal    = dailyGoalValue * daysInYear(year);
  const actualYTD   = steps.reduce((s, r) => s + r.count, 0);

  // Days elapsed from Jan 1 to today (inclusive), capped to days in year
  const jan1        = new Date(year, 0, 1);
  const todayLocal  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysElapsed = Math.min(
    Math.floor((todayLocal - jan1) / 86400000) + 1,
    daysInYear(year)
  );

  const expectedYTD   = dailyGoalValue * daysElapsed;
  const aheadBehind   = actualYTD - expectedYTD;
  const pctCompletion = yearGoal > 0 ? (actualYTD / yearGoal) * 100 : 0;

  return { yearGoal, actualYTD, expectedYTD, aheadBehind, pctCompletion, daysElapsed };
}

/**
 * Compute per-month summaries for a full year.
 *
 * @param {Array}  steps      - all step records for the year
 * @param {number} dailyGoalValue
 * @param {number} year
 * @returns {Array} - one entry per month (month 1–12)
 */
function computeYearlyBreakdown(steps, dailyGoalValue, year) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const monthSteps = steps.filter(r => {
      const d = parseDate(r.date);
      return d.getMonth() + 1 === m;
    });
    const total    = monthSteps.reduce((s, r) => s + r.count, 0);
    const goal     = monthlyGoal(dailyGoalValue, year, m);
    const days     = daysInMonth(year, m);
    const avgPerDay = monthSteps.length > 0 ? total / days : 0;
    const pct      = goal > 0 ? (total / goal) * 100 : 0;
    const completed = monthSteps.filter(r => r.count >= dailyGoalValue).length;
    months.push({ month: m, total, goal, avgPerDay, pct, completedDays: completed, daysInMonth: days });
  }
  return months;
}

// ─── All-time stats ───────────────────────────────────────────────────────────

/**
 * Average steps per day, grouped by calendar month (across all years).
 * Returns an array of { label: 'Jan 2025', avg: number } sorted chronologically.
 */
function computeMonthlyAverages(allSteps) {
  const map = {};
  allSteps.forEach(r => {
    const d   = parseDate(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map[key]) map[key] = { sum: 0, days: daysInMonth(d.getFullYear(), d.getMonth() + 1), label: '' };
    map[key].sum += r.count;
  });

  return Object.keys(map).sort().map(key => {
    const [y, m] = key.split('-').map(Number);
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return {
      key,
      label: `${monthNames[m - 1]} ${y}`,
      avg: map[key].sum / map[key].days,
      total: map[key].sum,
    };
  });
}

/**
 * Find the best Mon–Sun calendar week.
 * Returns { startDate, endDate, total } or null if no data.
 */
function computeBestWeek(allSteps) {
  if (allSteps.length === 0) return null;

  const byDate = {};
  allSteps.forEach(r => { byDate[r.date.slice(0, 10)] = r.count; });

  // Find the earliest Monday on or before the first record
  const dates    = Object.keys(byDate).sort();
  const firstDay = parseDate(dates[0]);
  const lastDay  = parseDate(dates[dates.length - 1]);

  // Walk back to Monday
  const start = new Date(firstDay);
  const dow   = start.getDay(); // 0=Sun
  const daysBack = dow === 0 ? 6 : dow - 1;
  start.setDate(start.getDate() - daysBack);

  let best       = null;
  let bestTotal  = -1;
  const cursor   = new Date(start);

  while (cursor <= lastDay) {
    let weekTotal  = 0;
    const weekStart = new Date(cursor);
    for (let i = 0; i < 7; i++) {
      const ds = formatDate(cursor);
      weekTotal += byDate[ds] || 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    if (weekTotal > bestTotal) {
      bestTotal  = weekTotal;
      best       = {
        startDate: formatDate(weekStart),
        endDate:   formatDate(new Date(cursor.getTime() - 86400000)),
        total:     weekTotal,
      };
    }
  }
  return best;
}

/**
 * Find the day with the highest step count.
 * Returns { date, count } or null.
 */
function computeMaxDay(allSteps) {
  if (allSteps.length === 0) return null;
  return allSteps.reduce((best, r) =>
    r.count > best.count ? { date: r.date.slice(0, 10), count: r.count } : best,
    { date: '', count: -1 }
  );
}

/**
 * Find the longest streak of consecutive days meeting the daily goal.
 * @param {Array}  allSteps      - all step records, sorted by date ascending
 * @param {number} dailyGoalValue
 * @returns {{ startDate, endDate, length } | null}
 */
function computeBiggestStreak(allSteps, dailyGoalValue) {
  const qualifying = allSteps
    .filter(r => r.count >= dailyGoalValue)
    .map(r => r.date.slice(0, 10))
    .sort();

  if (qualifying.length === 0) return null;

  let best        = { startDate: qualifying[0], endDate: qualifying[0], length: 1 };
  let curStart    = qualifying[0];
  let curLen      = 1;

  for (let i = 1; i < qualifying.length; i++) {
    const prev = parseDate(qualifying[i - 1]);
    const curr = parseDate(qualifying[i]);
    const diff = (curr - prev) / 86400000;

    if (diff === 1) {
      curLen++;
      if (curLen > best.length) {
        best = { startDate: curStart, endDate: qualifying[i], length: curLen };
      }
    } else {
      curStart = qualifying[i];
      curLen   = 1;
    }
  }
  return best;
}

/**
 * Bundle all all-time stats into one call.
 */
function computeAllTimeStats(allSteps, dailyGoalValue) {
  return {
    monthlyAverages: computeMonthlyAverages(allSteps),
    bestWeek:        computeBestWeek(allSteps),
    maxDay:          computeMaxDay(allSteps),
    biggestStreak:   computeBiggestStreak(allSteps, dailyGoalValue),
  };
}
