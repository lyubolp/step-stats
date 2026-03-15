/**
 * app.js — Alpine.js application.
 * Handles routing and renders all views into their placeholder divs.
 */

// ─── Utilities ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                            'Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtNum(n) {
  return Math.round(n).toLocaleString();
}

function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-').map(Number);
  return `${MONTH_NAMES_SHORT[m - 1]} ${d}, ${y}`;
}

/**
 * Parse a CSV text (date,count) into an array of row objects.
 * Skips a header line if present. Validates format strictly.
 */
function parseStepsCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('The file is empty.');
  const start = /^date/i.test(lines[0]) ? 1 : 0;
  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) throw new Error(`Invalid row on line ${i + 1}: "${lines[i]}"`);
    const date  = parts[0].trim();
    const count = parseInt(parts[1].trim(), 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date "${date}" on line ${i + 1}.`);
    if (isNaN(count) || count < 0) throw new Error(`Invalid count on line ${i + 1}.`);
    rows.push({ date, count });
  }
  if (rows.length === 0) throw new Error('No data rows found in the file.');
  return rows;
}

// ─── Main app ─────────────────────────────────────────────────────────────────

function app() {
  return {
    route:    '/',
    loading:  false,
    error:    null,
    darkMode: false,

    init() {
      // Dark mode: restore from localStorage, fall back to system preference
      const saved = localStorage.getItem('darkMode');
      this.darkMode = saved !== null
        ? saved === 'true'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      this._applyDark();

      // Initial route
      this.navigate(this._parseHash());
      // Listen for hash changes
      window.addEventListener('hashchange', () => {
        this.navigate(this._parseHash());
      });
    },

    _applyDark() {
      document.documentElement.classList.toggle('dark', this.darkMode);
    },

    toggleDark() {
      this.darkMode = !this.darkMode;
      localStorage.setItem('darkMode', this.darkMode);
      this._applyDark();
    },

    _parseHash() {
      const h = window.location.hash || '#/';
      return h.replace(/^#/, '') || '/';
    },

    navClass(path) {
      return this.route === path ? 'active' : '';
    },

    async navigate(path) {
      this.route  = path;
      this.error  = null;
      this.loading = true;

      // Small tick so Alpine renders the show/hide before we do async work
      await this.$nextTick();

      try {
        switch (path) {
          case '/':          await renderDashboard();   break;
          case '/month':     await renderMonth();       break;
          case '/year':      await renderYear();        break;
          case '/stats':     await renderStats();       break;
          case '/settings':  await renderSettings();    break;
          default:
            this.route = '/';
            await renderDashboard();
        }
      } catch (e) {
        this.error = `Failed to load view: ${e.message}`;
      } finally {
        this.loading = false;
      }
    },
  };
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let _currentYear  = new Date().getFullYear();
let _currentMonth = new Date().getMonth() + 1; // 1-indexed

// ─── Dashboard ────────────────────────────────────────────────────────────────

async function renderDashboard() {
  const today = todayStr();
  const [todayRecord, goal, yearSteps] = await Promise.all([
    getStepByDate(today),
    getGoalForYear(new Date().getFullYear()),
    getStepsForYear(new Date().getFullYear()),
  ]);

  const year  = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const dGoal = goal ? dailyGoal(goal.target, year) : 0;
  const todayCount = todayRecord ? todayRecord.count : 0;

  // Derive month steps from year steps
  const mFrom      = `${year}-${String(month).padStart(2, '0')}-01`;
  const mTo        = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  const monthSteps = yearSteps.filter(r => r.date.slice(0, 10) >= mFrom && r.date.slice(0, 10) <= mTo);

  // Year progress
  const yearProg = goal ? computeYearlyProgress(yearSteps, dGoal, year) : null;
  const yearPct  = yearProg ? Math.min(100, yearProg.pctCompletion) : 0;
  const yearRingColor = !yearProg ? '#3b82f6'
    : yearPct >= 100 ? '#22c55e'
    : yearProg.aheadBehind >= 0 ? '#3b82f6' : '#ef4444';

  // Week (Mon–today) — use yearSteps so week can span month boundary
  const todayDate = new Date();
  const dow = todayDate.getDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(todayDate);
  weekStart.setDate(weekStart.getDate() - daysBack);
  const weekSteps = yearSteps.filter(r => {
    const d = parseDate(r.date);
    return d >= weekStart && d <= todayDate;
  }).reduce((s, r) => s + r.count, 0);

  const monthProgress = goal
    ? computeMonthlyProgress(monthSteps, dGoal, year, month)
    : null;

  const el = document.getElementById('view-dashboard');
  el.innerHTML = `
    <div x-data="dashboardComp()" x-init="init()">

      <!-- Today header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Today</h1>
          <p class="text-sm text-gray-500">${fmtDate(today)}</p>
        </div>
        <button @click="openModal()"
          class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          ${todayRecord ? 'Edit' : '+ Add'} steps
        </button>
      </div>

      <!-- Year progress ring + ahead/behind -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4 flex items-center gap-6">
        <!-- Ring -->
        <div class="relative flex-shrink-0">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="#f3f4f6" stroke-width="10"/>
            <circle cx="48" cy="48" r="40" fill="none"
              stroke="${yearRingColor}" stroke-width="10"
              stroke-linecap="round"
              stroke-dasharray="${2 * Math.PI * 40}"
              stroke-dashoffset="${2 * Math.PI * 40 * (1 - yearPct / 100)}"
              class="progress-ring-circle"/>
          </svg>
          <span class="absolute inset-0 flex items-center justify-center text-base font-bold text-gray-800">
            ${Math.round(yearPct)}%
          </span>
        </div>
        <!-- Year info -->
        <div class="min-w-0">
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">${year} &middot; Yearly pace</p>
          ${yearProg
            ? `<p class="text-3xl font-extrabold ${yearProg.aheadBehind >= 0 ? 'text-green-600' : 'text-red-500'}">
                ${yearProg.aheadBehind >= 0 ? '+' : ''}${fmtNum(yearProg.aheadBehind)}
               </p>
               <p class="text-sm text-gray-500 mt-0.5">
                 ${yearProg.aheadBehind >= 0 ? 'ahead of yearly pace' : 'behind yearly pace'}
               </p>
               <p class="text-xs text-gray-400 mt-1">${fmtNum(yearProg.actualYTD)} of ${fmtNum(yearProg.yearGoal)} steps</p>`
            : `<p class="text-sm text-amber-500 mt-1">No goal set for this year</p>`
          }
        </div>
      </div>

      <!-- Mini summary cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        ${summaryCard('Today', fmtNum(todayCount) + ' steps',
            dGoal > 0 ? `Goal: ${fmtNum(dGoal)}/day` : '')}
        ${summaryCard('This week', fmtNum(weekSteps) + ' steps', '')}
        ${monthProgress
          ? summaryCard('Month total', fmtNum(monthProgress.actualTotal) + ' steps',
              `${Math.round(monthProgress.pctCompletion)}% of goal`)
          : summaryCard('Month total', '—', '')}
        ${monthProgress
          ? summaryCard('Month pace',
              (monthProgress.aheadBehind >= 0 ? '+' : '') + fmtNum(monthProgress.aheadBehind),
              monthProgress.aheadBehind >= 0 ? 'text-green-600' : 'text-red-500')
          : summaryCard('Month pace', '—', '')}
      </div>

      <!-- Step modal -->
      <div x-show="showModal" x-transition
        class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" @click.stop>
          <h2 class="text-lg font-semibold mb-4">${todayRecord ? 'Edit' : 'Log'} steps for today</h2>
          <input type="number" x-model.number="stepCount" min="0"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Steps" @keydown.enter="save()" autofocus />
          <div class="flex gap-3">
            <button @click="save()"
              class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">
              Save
            </button>
            ${todayRecord
              ? `<button @click="del()"
                  class="px-4 bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 rounded-lg transition-colors">
                  Delete
                </button>`
              : ''}
            <button @click="showModal = false"
              class="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
          <p x-show="saveError" x-text="saveError" class="text-red-500 text-sm mt-3"></p>
        </div>
      </div>

    </div>
  `;

  // Register Alpine component
  document.getElementById('view-dashboard')._x_dataStack = undefined;

  window.dashboardComp = function() {
    return {
      showModal:  false,
      stepCount:  todayRecord ? todayRecord.count : 0,
      saveError:  null,
      recordId:   todayRecord ? todayRecord.id : null,

      init() {},

      openModal() {
        this.saveError = null;
        this.showModal = true;
      },

      async save() {
        this.saveError = null;
        if (this.stepCount < 0) { this.saveError = 'Steps cannot be negative.'; return; }
        try {
          if (this.recordId) {
            await updateStep(this.recordId, this.stepCount);
          } else {
            await createStep(today, this.stepCount);
          }
          this.showModal = false;
          await renderDashboard();
        } catch (e) {
          this.saveError = e.message;
        }
      },

      async del() {
        if (!this.recordId) return;
        try {
          await deleteStep(this.recordId);
          this.showModal = false;
          await renderDashboard();
        } catch (e) {
          this.saveError = e.message;
        }
      },
    };
  };

  Alpine.initTree(el);
}

function summaryCard(label, value, sub) {
  const subClass = sub && sub.startsWith('text-') ? sub : 'text-gray-400';
  const subText  = sub && !sub.startsWith('text-') ? sub : '';
  return `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">${label}</p>
      <p class="text-xl font-bold ${subClass !== 'text-gray-400' ? subClass : 'text-gray-900'}">${value}</p>
      ${subText ? `<p class="text-xs text-gray-400 mt-0.5">${subText}</p>` : ''}
    </div>`;
}

// ─── Month View ───────────────────────────────────────────────────────────────

async function renderMonth(year = _currentYear, month = _currentMonth) {
  _currentYear  = year;
  _currentMonth = month;

  const [steps, goal] = await Promise.all([
    getStepsForMonth(year, month),
    getGoalForYear(year),
  ]);

  const dGoal = goal ? dailyGoal(goal.target, year) : 0;
  const prog  = goal ? computeMonthlyProgress(steps, dGoal, year, month) : null;
  const totalDays = new Date(year, month, 0).getDate();

  // Calendar: day-of-week offset for 1st (Mon=0)
  const firstDow = new Date(year, month - 1, 1).getDay();
  const offset   = firstDow === 0 ? 6 : firstDow - 1;

  // Build calendar cells
  let calCells = '';
  for (let i = 0; i < offset; i++) calCells += `<div></div>`;
  for (let d = 1; d <= totalDays; d++) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const count = prog ? (prog.byDate[ds] ?? null) : null;
    const isToday = ds === todayStr();
    let bg = 'bg-gray-50 text-gray-400';
    if (count !== null) {
      bg = count >= dGoal && dGoal > 0 ? 'bg-green-100 text-green-800' : 'bg-red-50 text-red-700';
    }
    calCells += `
      <div class="rounded-lg p-1 text-center cursor-pointer hover:ring-2 hover:ring-blue-300 transition-all
        ${bg} ${isToday ? 'ring-2 ring-blue-500' : ''}"
        @click="openDayModal('${ds}', ${count ?? 0})"
        title="${ds}">
        <div class="text-xs font-medium">${d}</div>
        ${count !== null ? `<div class="text-xs font-semibold">${(count / 1000).toFixed(1)}k</div>` : '<div class="text-xs">—</div>'}
      </div>`;
  }

  const el = document.getElementById('view-month');
  el.innerHTML = `
    <div x-data="monthComp()" x-init="init()">

      <!-- Header + navigation -->
      <div class="flex items-center justify-between mb-6">
        <button @click="prevMonth()" class="p-2 rounded-lg hover:bg-gray-100 text-gray-500">&#8592;</button>
        <h1 class="text-xl font-bold text-gray-900">${MONTH_NAMES[month - 1]} ${year}</h1>
        <button @click="nextMonth()" class="p-2 rounded-lg hover:bg-gray-100 text-gray-500">&#8594;</button>
      </div>

      <!-- Calendar grid -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <div class="calendar-grid mb-2">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d =>
            `<div class="text-center text-xs font-semibold text-gray-400 py-1">${d}</div>`).join('')}
        </div>
        <div class="calendar-grid gap-1">
          ${calCells}
        </div>
      </div>

      <!-- Monthly stats -->
      ${prog ? `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        ${statCard('Total steps', fmtNum(prog.actualTotal))}
        ${statCard('Monthly goal', fmtNum(prog.monthGoal))}
        ${statCard('% Complete', Math.round(prog.pctCompletion) + '%')}
        ${statCard('Remaining', fmtNum(Math.max(0, prog.diffToCompletion)))}
        ${statCard('Ahead / Behind', (prog.aheadBehind >= 0 ? '+' : '') + fmtNum(prog.aheadBehind),
          prog.aheadBehind >= 0 ? 'text-green-600' : 'text-red-500')}
        ${statCard('Steps/day left', prog.remainingDays > 0 ? fmtNum(prog.stepsPerDayRemaining) : '—')}
        ${statCard('Days on goal', prog.completedDays + ' / ' + prog.currentDay)}
      </div>
      ` : '<p class="text-amber-500 text-sm mb-4">No goal set for this year. <a href="#/settings" class="underline">Add one</a>.</p>'}

      <!-- Bar chart -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div class="chart-container" style="height:220px">
          <canvas id="chart-month"></canvas>
        </div>
      </div>

      <!-- Day edit modal -->
      <div x-show="showModal" x-transition
        class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" @click.stop>
          <h2 class="text-lg font-semibold mb-1">Edit steps</h2>
          <p class="text-sm text-gray-500 mb-4" x-text="fmtDate(modalDate)"></p>
          <input type="number" x-model.number="modalCount" min="0"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Steps" @keydown.enter="saveDay()" />
          <div class="flex gap-3">
            <button @click="saveDay()"
              class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">
              Save
            </button>
            <template x-if="modalHasRecord">
              <button @click="deleteDay()"
                class="px-4 bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 rounded-lg transition-colors">
                Delete
              </button>
            </template>
            <button @click="showModal = false"
              class="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
          <p x-show="modalError" x-text="modalError" class="text-red-500 text-sm mt-3"></p>
        </div>
      </div>

    </div>
  `;

  window.monthComp = function() {
    return {
      showModal:      false,
      modalDate:      '',
      modalCount:     0,
      modalHasRecord: false,
      modalRecordId:  null,
      modalError:     null,

      init() {
        renderMonthChart('chart-month', steps, dGoal, year, month);
      },

      fmtDate(str) { return fmtDate(str); },

      prevMonth() {
        let y = year, m = month - 1;
        if (m < 1) { m = 12; y--; }
        renderMonth(y, m);
      },
      nextMonth() {
        let y = year, m = month + 1;
        if (m > 12) { m = 1; y++; }
        renderMonth(y, m);
      },

      async openDayModal(dateStr, currentCount) {
        this.modalDate      = dateStr;
        this.modalCount     = currentCount;
        this.modalError     = null;
        const rec = steps.find(r => r.date.slice(0, 10) === dateStr) || null;
        this.modalHasRecord = !!rec;
        this.modalRecordId  = rec ? rec.id : null;
        this.showModal = true;
      },

      async saveDay() {
        this.modalError = null;
        if (this.modalCount < 0) { this.modalError = 'Steps cannot be negative.'; return; }
        try {
          if (this.modalHasRecord && this.modalRecordId) {
            await updateStep(this.modalRecordId, this.modalCount);
          } else {
            await createStep(this.modalDate, this.modalCount);
          }
          this.showModal = false;
          await renderMonth(year, month);
        } catch (e) {
          this.modalError = e.message;
        }
      },

      async deleteDay() {
        if (!this.modalRecordId) return;
        try {
          await deleteStep(this.modalRecordId);
          this.showModal = false;
          await renderMonth(year, month);
        } catch (e) {
          this.modalError = e.message;
        }
      },
    };
  };

  Alpine.initTree(el);
}

function statCard(label, value, valueClass = 'text-gray-900') {
  return `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">${label}</p>
      <p class="text-lg font-bold ${valueClass}">${value}</p>
    </div>`;
}

// ─── Year View ────────────────────────────────────────────────────────────────

async function renderYear(year = _currentYear) {
  _currentYear = year;

  const [steps, goal] = await Promise.all([
    getStepsForYear(year),
    getGoalForYear(year),
  ]);

  const dGoal     = goal ? dailyGoal(goal.target, year) : 0;
  const breakdown = goal ? computeYearlyBreakdown(steps, dGoal, year) : [];
  const ytdTotal  = steps.reduce((s, r) => s + r.count, 0);
  const ytdPct    = goal && goal.target > 0 ? (ytdTotal / goal.target) * 100 : 0;

  const tableRows = breakdown.map(m => {
    const pctBar = Math.min(100, Math.round(m.pct));
    const pctColor = m.pct >= 100 ? 'bg-green-400' : 'bg-blue-400';
    return `
      <tr class="border-t border-gray-100 hover:bg-gray-50">
        <td class="py-2 px-3 text-sm font-medium text-gray-700">${MONTH_NAMES_SHORT[m.month - 1]}</td>
        <td class="py-2 px-3 text-sm text-right">${fmtNum(m.total)}</td>
        <td class="py-2 px-3 text-sm text-right">${fmtNum(m.avgPerDay)}</td>
        <td class="py-2 px-3">
          <div class="flex items-center gap-2">
            <div class="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div class="${pctColor} h-2 rounded-full" style="width:${pctBar}%"></div>
            </div>
            <span class="text-xs text-gray-500 w-10 text-right">${Math.round(m.pct)}%</span>
          </div>
        </td>
        <td class="py-2 px-3 text-sm text-right">${m.completedDays} / ${m.daysInMonth}</td>
      </tr>`;
  }).join('');

  const el = document.getElementById('view-year');
  el.innerHTML = `
    <div x-data="yearComp()" x-init="init()">

      <!-- Header + navigation -->
      <div class="flex items-center justify-between mb-6">
        <button @click="prevYear()" class="p-2 rounded-lg hover:bg-gray-100 text-gray-500">&#8592;</button>
        <h1 class="text-xl font-bold text-gray-900">${year}</h1>
        <button @click="nextYear()" class="p-2 rounded-lg hover:bg-gray-100 text-gray-500">&#8594;</button>
      </div>

      <!-- Year-to-date summary -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        ${statCard('Year total', fmtNum(ytdTotal))}
        ${goal ? statCard('Yearly goal', fmtNum(goal.target)) : ''}
        ${goal ? statCard('YTD progress', Math.round(ytdPct) + '%', ytdPct >= 100 ? 'text-green-600' : 'text-gray-900') : ''}
      </div>

      <!-- Monthly table -->
      ${breakdown.length > 0 ? `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-left">Month</th>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-right">Total</th>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-right">Avg/day</th>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500">Goal %</th>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-right">Goal days</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ` : '<p class="text-amber-500 text-sm mb-4">No goal set for this year. <a href="#/settings" class="underline">Add one</a>.</p>'}

      <!-- Bar chart -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div class="chart-container" style="height:220px">
          <canvas id="chart-year"></canvas>
        </div>
      </div>

    </div>
  `;

  window.yearComp = function() {
    return {
      init() {
        if (breakdown.length > 0) renderYearChart('chart-year', breakdown);
      },
      prevYear() { renderYear(year - 1); },
      nextYear() { renderYear(year + 1); },
    };
  };

  Alpine.initTree(el);
}

// ─── Stats View ───────────────────────────────────────────────────────────────

async function renderStats() {
  const currentYear = new Date().getFullYear();
  const [allSteps, goal] = await Promise.all([
    getAllSteps(),
    getGoalForYear(currentYear),
  ]);

  const dGoal = goal ? dailyGoal(goal.target, currentYear) : 0;
  const stats = computeAllTimeStats(allSteps, dGoal);

  const { monthlyAverages, bestWeek, maxDay, biggestStreak } = stats;

  const avgRows = monthlyAverages.map(m => `
    <tr class="border-t border-gray-100 hover:bg-gray-50">
      <td class="py-2 px-3 text-sm text-gray-700">${m.label}</td>
      <td class="py-2 px-3 text-sm text-right font-medium">${fmtNum(m.avg)}</td>
      <td class="py-2 px-3 text-sm text-right text-gray-500">${fmtNum(m.total)}</td>
    </tr>`).join('');

  const el = document.getElementById('view-stats');
  el.innerHTML = `
    <div x-data="statsComp()" x-init="init()">

      <h1 class="text-2xl font-bold text-gray-900 mb-6">All-time Stats</h1>

      <!-- Highlight cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        ${bestWeek ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-2">Best Week</p>
          <p class="text-2xl font-extrabold text-gray-900">${fmtNum(bestWeek.total)}</p>
          <p class="text-sm text-gray-500 mt-1">${fmtDate(bestWeek.startDate)} – ${fmtDate(bestWeek.endDate)}</p>
        </div>` : ''}
        ${maxDay ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-2">Best Day</p>
          <p class="text-2xl font-extrabold text-gray-900">${fmtNum(maxDay.count)}</p>
          <p class="text-sm text-gray-500 mt-1">${fmtDate(maxDay.date)}</p>
        </div>` : ''}
        ${biggestStreak ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p class="text-xs text-gray-400 uppercase tracking-wide mb-2">Longest Streak</p>
          <p class="text-2xl font-extrabold text-gray-900">${biggestStreak.length} <span class="text-base font-normal text-gray-500">days</span></p>
          <p class="text-sm text-gray-500 mt-1">${fmtDate(biggestStreak.startDate)} – ${fmtDate(biggestStreak.endDate)}</p>
        </div>` : ''}
      </div>

      ${!goal ? '<p class="text-amber-500 text-sm mb-4">Streak and goal-based stats require a yearly goal. <a href="#/settings" class="underline">Add one</a>.</p>' : ''}

      <!-- Avg steps chart -->
      ${monthlyAverages.length > 0 ? `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">Average Steps / Day per Month</h2>
        <div class="chart-container" style="height:220px">
          <canvas id="chart-avg"></canvas>
        </div>
      </div>
      ` : ''}

      <!-- Monthly averages table -->
      ${avgRows ? `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-left">Month</th>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-right">Avg / day</th>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-right">Total</th>
            </tr>
          </thead>
          <tbody>${avgRows}</tbody>
        </table>
      </div>
      ` : '<p class="text-gray-400 text-sm">No step data yet.</p>'}

    </div>
  `;

  window.statsComp = function() {
    return {
      init() {
        if (monthlyAverages.length > 0) renderAvgStepsChart('chart-avg', monthlyAverages);
      },
    };
  };

  Alpine.initTree(el);
}

// ─── Settings View ────────────────────────────────────────────────────────────

async function renderSettings() {
  const goals = await getAllGoals();

  const rows = goals.map(g => {
    const dailyTarget = Math.round(g.target / daysInYear(g.year));
    return `
    <tr class="border-t border-gray-100 hover:bg-gray-50" x-data="goalRowComp('${g.id}', ${g.year}, ${dailyTarget})">
      <td class="py-2 px-3 text-sm text-gray-700">${g.year}</td>
      <td class="py-2 px-3 text-sm">
        <template x-if="!editing">
          <span class="font-medium">${fmtNum(dailyTarget)}</span>
        </template>
        <template x-if="editing">
          <input type="number" x-model.number="editTarget" min="0"
            class="border border-gray-300 rounded px-2 py-1 w-28 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            @keydown.enter="save()" @keydown.escape="editing = false" />
        </template>
      </td>
      <td class="py-2 px-3 text-sm">
        <template x-if="!editing">
          <div class="flex gap-2">
            <button @click="editing = true; editTarget = target"
              class="text-blue-600 hover:underline text-xs">Edit</button>
            <button @click="del()"
              class="text-red-500 hover:underline text-xs">Delete</button>
          </div>
        </template>
        <template x-if="editing">
          <div class="flex gap-2">
            <button @click="save()" class="text-blue-600 hover:underline text-xs">Save</button>
            <button @click="editing = false" class="text-gray-500 hover:underline text-xs">Cancel</button>
          </div>
        </template>
      </td>
      <td class="py-2 px-3 text-xs text-red-500" x-text="rowError"></td>
    </tr>`;
  }).join('');

  const el = document.getElementById('view-settings');
  el.innerHTML = `
    <div x-data="settingsComp()" x-init="init()">

      <h1 class="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <!-- Add new goal -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 class="text-sm font-semibold text-gray-700 mb-4">Add yearly goal</h2>
        <div class="flex flex-wrap gap-3 items-end">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Year</label>
            <input type="number" x-model.number="newYear" min="2000" max="2100"
              class="border border-gray-300 rounded-lg px-3 py-2 w-24 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Daily goal (steps/day)</label>
            <input type="number" x-model.number="newTarget" min="0"
              class="border border-gray-300 rounded-lg px-3 py-2 w-36 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 10000" @keydown.enter="addGoal()" />
          </div>
          <button @click="addGoal()"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Add
          </button>
        </div>
        <p x-show="addError" x-text="addError" class="text-red-500 text-sm mt-3"></p>
      </div>

      <!-- Goals table -->
      ${goals.length > 0 ? `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-left">Year</th>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-left">Daily goal (steps/day)</th>
              <th class="py-2 px-3 text-xs font-semibold text-gray-500 text-left">Actions</th>
              <th class="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ` : '<p class="text-gray-400 text-sm">No goals set yet.</p>'}

      <!-- Import / Export -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-6">
        <h2 class="text-sm font-semibold text-gray-700 mb-4">Import / Export steps</h2>
        <div class="flex flex-col sm:flex-row gap-6">
          <div class="flex-1">
            <p class="text-xs text-gray-500 mb-2">Download all step records as a CSV file (columns: <code>date</code>, <code>count</code>).</p>
            <button @click="exportCSV()"
              class="bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Export CSV
            </button>
          </div>
          <div class="hidden sm:block w-px bg-gray-200"></div>
          <div class="flex-1">
            <p class="text-xs text-gray-500 mb-2">Import from a CSV file (<code>date</code>, <code>count</code>). Existing entries are overwritten.</p>
            <div class="flex gap-2 items-center">
              <label class="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Choose file
                <input type="file" accept=".csv,text/csv" class="hidden" @change="handleImport(\$event)" :disabled="importing" />
              </label>
              <span x-show="importing" class="text-xs text-gray-500">Importing&#8230;</span>
            </div>
            <template x-if="importResult">
              <div class="mt-3 text-sm">
                <p class="text-green-700" x-show="importResult.created > 0 || importResult.updated > 0">
                  Done: <span x-text="importResult.created"></span> created, <span x-text="importResult.updated"></span> updated.
                </p>
                <template x-if="importResult.errors && importResult.errors.length > 0">
                  <div>
                    <p class="text-red-500 text-xs mt-1">Some rows had errors:</p>
                    <ul class="text-red-500 text-xs list-disc list-inside mt-1">
                      <template x-for="err in importResult.errors" :key="err">
                        <li x-text="err"></li>
                      </template>
                    </ul>
                  </div>
                </template>
              </div>
            </template>
          </div>
        </div>
      </div>

    </div>
  `;

  window.settingsComp = function() {
    return {
      newYear:      new Date().getFullYear(),
      newTarget:    null,
      addError:     null,
      importing:    false,
      importResult: null,

      init() {},

      exportCSV() {
        getStepsAsCSV().then(csv => {
          const blob = new Blob([csv], { type: 'text/csv' });
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href     = url;
          a.download = 'steps.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      },

      async handleImport(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        this.importResult = null;
        this.importing    = true;
        try {
          const text = await file.text();
          const rows = parseStepsCSV(text);
          this.importResult = await importStepsFromRows(rows);
        } catch (e) {
          this.importResult = { created: 0, updated: 0, errors: [e.message] };
        } finally {
          this.importing = false;
          event.target.value = '';
        }
      },

      async addGoal() {
        this.addError = null;
        if (!this.newTarget || this.newTarget <= 0) {
          this.addError = 'Please enter a valid daily goal.'; return;
        }
        try {
          const yearlyTotal = Math.round(this.newTarget * daysInYear(this.newYear));
          await createGoal(this.newYear, yearlyTotal);
          this.newTarget = null;
          await renderSettings();
        } catch (e) {
          this.addError = e.message;
        }
      },
    };
  };

  window.goalRowComp = function(id, year, target) {
    return {
      id, year, target,
      editing:    false,
      editTarget: target,
      rowError:   null,

      async save() {
        this.rowError = null;
        if (this.editTarget <= 0) { this.rowError = 'Invalid daily goal.'; return; }
        try {
          const yearlyTotal = Math.round(this.editTarget * daysInYear(this.year));
          await updateGoal(this.id, yearlyTotal);
          this.editing = false;
          await renderSettings();
        } catch (e) {
          this.rowError = e.message;
        }
      },

      async del() {
        this.rowError = null;
        try {
          await deleteGoal(this.id);
          await renderSettings();
        } catch (e) {
          this.rowError = e.message;
        }
      },
    };
  };

  Alpine.initTree(el);
}
