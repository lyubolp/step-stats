/**
 * charts.js — Chart.js instance management.
 * All charts are created and destroyed here.
 * Other files call these functions; they never import Chart.js directly.
 */

const _charts = {};

function _destroyChart(id) {
  if (_charts[id]) {
    _charts[id].destroy();
    delete _charts[id];
  }
}

const CHART_COLORS = {
  blue:      'rgba(59, 130, 246, 0.85)',
  blueLight: 'rgba(59, 130, 246, 0.2)',
  green:     'rgba(34, 197, 94, 0.85)',
  red:       'rgba(239, 68, 68, 0.85)',
  gray:      'rgba(156, 163, 175, 0.5)',
  goalLine:  'rgba(249, 115, 22, 0.8)',
};

function _isDark() {
  return document.documentElement.classList.contains('dark');
}

function _baseOptions() {
  const dark      = _isDark();
  const tickColor = dark ? '#94a3b8' : '#6b7280';
  const gridColor = dark ? '#334155' : '#f3f4f6';
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.parsed.y?.toLocaleString() ?? ctx.parsed.toLocaleString()} steps`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: tickColor } },
      y: { grid: { color: gridColor }, ticks: { font: { size: 11 }, color: tickColor } },
    },
  };
}

// ─── Month bar chart ──────────────────────────────────────────────────────────

/**
 * Render (or re-render) the month bar chart.
 *
 * @param {string}   canvasId
 * @param {Array}    steps     - step records for the month
 * @param {number}   dailyGoalValue
 * @param {number}   year
 * @param {number}   month     - 1-indexed
 */
function renderMonthChart(canvasId, steps, dailyGoalValue, year, month) {
  _destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const totalDays = new Date(year, month, 0).getDate();
  const byDate = {};
  steps.forEach(r => { byDate[r.date.slice(0, 10)] = r.count; });

  const labels = [];
  const data   = [];
  const colors = [];

  for (let d = 1; d <= totalDays; d++) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    labels.push(d);
    const count = byDate[ds] ?? 0;
    data.push(count);
    colors.push(count >= dailyGoalValue ? CHART_COLORS.green : count > 0 ? CHART_COLORS.blue : CHART_COLORS.gray);
  }

  _charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Steps',
          data,
          backgroundColor: colors,
          borderRadius: 3,
        },
        {
          label: 'Daily goal',
          data: Array(totalDays).fill(dailyGoalValue),
          type: 'line',
          borderColor: CHART_COLORS.goalLine,
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      ..._baseOptions(),
      plugins: {
        ..._baseOptions().plugins,
        legend: { display: true, labels: { font: { size: 11 }, boxWidth: 20, color: _isDark() ? '#94a3b8' : '#6b7280' } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y?.toLocaleString()} steps`,
          },
        },
      },
    },
  });
}

// ─── Year bar chart ───────────────────────────────────────────────────────────

/**
 * Render the year bar chart (monthly totals).
 *
 * @param {string} canvasId
 * @param {Array}  breakdown - output of computeYearlyBreakdown()
 */
function renderYearChart(canvasId, breakdown) {
  _destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const labels  = breakdown.map(m => MONTH_LABELS[m.month - 1]);
  const data    = breakdown.map(m => m.total);
  const goals   = breakdown.map(m => m.goal);
  const colors  = breakdown.map(m => m.total >= m.goal ? CHART_COLORS.green : CHART_COLORS.blue);

  _charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Total steps',
          data,
          backgroundColor: colors,
          borderRadius: 3,
        },
        {
          label: 'Monthly goal',
          data: goals,
          type: 'line',
          borderColor: CHART_COLORS.goalLine,
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      ..._baseOptions(),
      plugins: {
        ..._baseOptions().plugins,
        legend: { display: true, labels: { font: { size: 11 }, boxWidth: 20, color: _isDark() ? '#94a3b8' : '#6b7280' } },
      },
    },
  });
}

// ─── Stats line chart (avg steps/month) ──────────────────────────────────────

/**
 * Render the average steps per day per month line chart.
 *
 * @param {string} canvasId
 * @param {Array}  monthlyAverages - output of computeMonthlyAverages()
 */
function renderAvgStepsChart(canvasId, monthlyAverages) {
  _destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  _charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: monthlyAverages.map(m => m.label),
      datasets: [{
        label: 'Avg steps/day',
        data: monthlyAverages.map(m => Math.round(m.avg)),
        borderColor: CHART_COLORS.blue,
        backgroundColor: CHART_COLORS.blueLight,
        borderWidth: 2,
        pointRadius: 4,
        fill: true,
        tension: 0.3,
      }],
    },
    options: _baseOptions(),
  });
}
