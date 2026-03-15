/**
 * api.js — PocketBase REST API wrapper
 * All HTTP communication with PocketBase lives here.
 */

const API_BASE = '/api/collections';

async function _request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Steps ───────────────────────────────────────────────────────────────────

/**
 * Fetch all steps for a given year+month (1-indexed).
 * Returns an array of records sorted by date ascending.
 */
async function getStepsForMonth(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(year, month, 0).getDate();
  const to   = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  const params = new URLSearchParams({
    filter: `date >= '${from}' && date <= '${to}'`,
    sort: 'date',
    perPage: '500',
  });
  const data = await _request('GET', `${API_BASE}/steps/records?${params}`);
  return data.items || [];
}

/**
 * Fetch all steps for a given year.
 * Returns an array of records sorted by date ascending.
 */
async function getStepsForYear(year) {
  const params = new URLSearchParams({
    filter: `date >= '${year}-01-01' && date <= '${year}-12-31'`,
    sort: 'date',
    perPage: '500',
  });
  const data = await _request('GET', `${API_BASE}/steps/records?${params}`);
  return data.items || [];
}

/**
 * Fetch all steps regardless of date (for all-time stats).
 * Returns an array of records sorted by date ascending.
 */
async function getAllSteps() {
  const params = new URLSearchParams({ sort: 'date', perPage: '5000' });
  const data = await _request('GET', `${API_BASE}/steps/records?${params}`);
  return data.items || [];
}

/**
 * Fetch the step record for a specific date (YYYY-MM-DD).
 * Returns the record or null if not found.
 */
async function getStepByDate(dateStr) {
  const params = new URLSearchParams({ filter: `date = '${dateStr}'` });
  const data = await _request('GET', `${API_BASE}/steps/records?${params}`);
  return (data.items && data.items.length > 0) ? data.items[0] : null;
}

/**
 * Create a new step record.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} count
 */
async function createStep(dateStr, count) {
  return _request('POST', `${API_BASE}/steps/records`, { date: dateStr, count });
}

/**
 * Update an existing step record by its PocketBase id.
 * @param {string} id
 * @param {number} count
 */
async function updateStep(id, count) {
  return _request('PATCH', `${API_BASE}/steps/records/${encodeURIComponent(id)}`, { count });
}

/**
 * Delete a step record by its PocketBase id.
 */
async function deleteStep(id) {
  return _request('DELETE', `${API_BASE}/steps/records/${encodeURIComponent(id)}`);
}

/**
 * Fetch all steps and return a CSV-formatted string (header + one row per record).
 */
async function getStepsAsCSV() {
  const steps = await getAllSteps();
  const lines = ['date,count'];
  for (const s of steps) {
    lines.push(`${s.date.slice(0, 10)},${s.count}`);
  }
  return lines.join('\n');
}

/**
 * Upsert step records from pre-parsed CSV rows.
 * @param {{ date: string, count: number }[]} rows
 * @returns {{ created: number, updated: number, errors: string[] }}
 */
async function importStepsFromRows(rows) {
  const existing = await getAllSteps();
  const byDate = {};
  for (const s of existing) {
    byDate[s.date.slice(0, 10)] = s;
  }
  let created = 0, updated = 0;
  const errors = [];
  for (const row of rows) {
    try {
      if (byDate[row.date]) {
        await updateStep(byDate[row.date].id, row.count);
        updated++;
      } else {
        await createStep(row.date, row.count);
        created++;
      }
    } catch (e) {
      errors.push(`${row.date}: ${e.message}`);
    }
  }
  return { created, updated, errors };
}

// ─── Goals ────────────────────────────────────────────────────────────────────

/**
 * Fetch the goal record for a given year.
 * Returns the record or null if none has been set.
 */
async function getGoalForYear(year) {
  const params = new URLSearchParams({ filter: `year = ${year}` });
  const data = await _request('GET', `${API_BASE}/goals/records?${params}`);
  return (data.items && data.items.length > 0) ? data.items[0] : null;
}

/**
 * Fetch all goal records.
 */
async function getAllGoals() {
  const params = new URLSearchParams({ sort: 'year', perPage: '100' });
  const data = await _request('GET', `${API_BASE}/goals/records?${params}`);
  return data.items || [];
}

/**
 * Create a new goal record.
 * @param {number} year
 * @param {number} target - total steps for the year
 */
async function createGoal(year, target) {
  return _request('POST', `${API_BASE}/goals/records`, { year, target });
}

/**
 * Update an existing goal record by its PocketBase id.
 */
async function updateGoal(id, target) {
  return _request('PATCH', `${API_BASE}/goals/records/${encodeURIComponent(id)}`, { target });
}

/**
 * Delete a goal record by its PocketBase id.
 */
async function deleteGoal(id) {
  return _request('DELETE', `${API_BASE}/goals/records/${encodeURIComponent(id)}`);
}
