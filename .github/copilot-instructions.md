# GitHub Copilot Instructions — Step Stats

## Project Overview
Step Stats is a single-user, local-network step tracking web app. It uses **PocketBase** as the backend (SQLite database + REST API + static file server) and a **no-build frontend** (Alpine.js + Tailwind CSS + Chart.js loaded from CDN) served out of `pb_public/`. The whole app runs in a **single Docker container** on a Raspberry Pi.

---

## Tech Stack
- **Backend**: PocketBase (single binary, auto-generated REST API, SQLite)
- **Frontend**: Alpine.js (reactivity), Tailwind CSS via CDN (styling), Chart.js via CDN (charts)
- **Deployment**: Docker, single container, ARM64, Raspberry Pi
- **No build step** — all frontend files are plain HTML/CSS/JS

---

## Repository Structure
```
step-stats/
├── Dockerfile
├── docker-compose.yml
├── pb_migrations/
│   └── 1_initial_collections.js  # Schema for `steps` and `goals` collections
├── pb_public/                    # Frontend — served by PocketBase at /
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── app.js       # Alpine.js app, hash-based SPA routing, all view renderers
│       ├── api.js       # PocketBase REST API wrapper
│       ├── stats.js     # All stats computation (client-side)
│       └── charts.js    # Chart.js setup and rendering
└── ARCHITECTURE.md
```

---

## Data Model

### `steps` collection
| Field   | Type   | Notes                        |
|---------|--------|------------------------------|
| `date`  | Date   | Required, unique per day     |
| `count` | Number | Required, min 0, daily total |

### `goals` collection
| Field    | Type   | Notes                          |
|----------|--------|--------------------------------|
| `year`   | Number | Required, unique per year      |
| `target` | Number | Required, min 0, yearly target |

**Derived values are computed in the frontend — never stored:**
- `daily_goal = yearly_target / days_in_year`
- `monthly_goal = daily_goal × days_in_month`

---

## PocketBase API Conventions
- Base URL is always `/api/collections/{collection}/records`
- All collections are publicly accessible (no auth, no API rules)
- Use filter syntax: `?filter=date >= '2026-03-01' && date <= '2026-03-31'`
- Sorting: `?sort=date` or `?sort=-date`
- **No authentication** — single user on local network

---

## Frontend Conventions

### Routing
- Hash-based SPA routing: `#/`, `#/month`, `#/year`, `#/stats`, `#/settings`
- Routing and view switching handled in `app.js` using Alpine.js

### Views
| Route        | Purpose                                                    |
|--------------|------------------------------------------------------------|
| `#/`         | Dashboard — today's steps, quick entry, daily progress ring, week/month-to-date |
| `#/month`    | Calendar grid, monthly stats panel, bar chart              |
| `#/year`     | Month-by-month table + bar chart, yearly progress          |
| `#/stats`    | All-time stats: averages, best week, max day, streak       |
| `#/settings` | Set yearly goal target, import/export step data as CSV     |

### Styling Rules
- Use **Tailwind CSS utility classes** for all styling
- Custom CSS in `css/app.css` only for things Tailwind cannot handle
- Design is **minimal and polished** — clean spacing, neutral palette, clear typography
- **Responsive first** — must work on both desktop and mobile (smartphone)
- Use Tailwind's `sm:`, `md:`, `lg:` prefixes for responsive breakpoints

### JavaScript Rules
- All stats computed **client-side** in `stats.js` — no custom server-side logic
- `api.js` is the only file that makes HTTP requests to PocketBase
- `charts.js` owns all Chart.js instances — other files call functions from it
- Alpine.js `x-data` components in `app.js` — keep components small and focused
- No npm, no bundler, no transpilation — plain ES6 modules or global scripts

---

## Computation Reference (implement in `stats.js`)

### Monthly Progress (used in Month View and Dashboard)
```js
monthly_goal       = daily_goal * daysInMonth(year, month)
current_expected   = daily_goal * currentDayOfMonth          // for ahead/behind
pct_completion     = (actual_total / monthly_goal) * 100
diff_to_completion = monthly_goal - actual_total
ahead_behind       = actual_total - current_expected          // positive = ahead
steps_per_day_remaining = (monthly_goal - actual_total) / remainingDays
completed_days     = steps.filter(s => s.count >= daily_goal).length
```

### Best Week (Mon–Sun)
- Enumerate all calendar Mon–Sun windows covering dates in the dataset
- Sum steps per window; return the window with the highest total

### Biggest Streak
- Sort step records by date ascending
- Walk records day-by-day; count consecutive days where `count >= daily_goal`
- If the next record is not the next calendar day, reset the streak counter
- Return start date, end date, and length of the longest streak

---

## Docker & Deployment
- ARM64 target (Raspberry Pi 4/5)
- PocketBase binary is downloaded in the Dockerfile from the official GitHub release
- `pb_data/` is a Docker volume — **never delete it** (contains the SQLite database)
- PocketBase is served on port `8080`
- Admin UI at `/_/` (first-run: create admin account)
- Frontend served at `/` from `pb_public/`

---

## Development Workflow (local)
1. Download PocketBase binary for macOS from https://pocketbase.io
2. Run `./pocketbase serve` from the project root
3. Database + admin UI available at `http://localhost:8080/_/`
4. Edit files in `pb_public/` and refresh the browser — no build step needed
5. Collections are created via `pb_migrations/initial_collections.js` on first run

---

## Implementation Details

### Rendering pattern
Views are rendered by standalone async functions (`renderDashboard()`, `renderMonth()`, etc.) that write HTML strings into their container `div` (e.g. `#view-dashboard`), register an Alpine component on `window`, then call `Alpine.initTree(el)` to activate it. This means **each view re-renders from scratch** on navigation and when data changes — there is no virtual DOM diffing.

### Shared mutable state
Two module-level variables track the currently displayed period:
```js
let _currentYear  = new Date().getFullYear();
let _currentMonth = new Date().getMonth() + 1; // 1-indexed
```
Month and Year views read/write these when navigating months/years.

### Alpine component registration
Because components are registered on `window` inside render functions (e.g. `window.monthComp = function() { ... }`), each re-render overwrites the previous registration. This is intentional — always define the component immediately before `Alpine.initTree(el)`.

### Date handling
- Dates are always stored and compared as `'YYYY-MM-DD'` strings
- `parseDate(str)` in `stats.js` parses to a **local-midnight** `Date` to avoid UTC offset shifting: `new Date(y, m-1, d)`
- Never use `new Date('YYYY-MM-DD')` directly — it parses as UTC midnight and shifts on non-UTC systems

### API pagination
All list calls pass `perPage: '500'` (monthly) or `perPage: '5000'` (all-time). PocketBase defaults to 30 items per page — always set `perPage` explicitly to avoid silent truncation.

### PocketBase migration file
- Migration file is `pb_migrations/1_initial_collections.js` (prefixed with `1_` for ordering)
- The `date` field on `steps` uses PocketBase type `autodate` with `onCreate: false, onUpdate: false` to behave as a plain date field
- All CRUD rules are set to `""` (empty string = public access, no auth required)
- Unique constraints enforced via SQLite indexes: `idx_steps_date` and `idx_goals_year`

### CSS conventions
- `.nav-link` and `.nav-link.active` are defined in `css/app.css`; `active` class is applied dynamically in Alpine via `:class="navClass('/')`
- `.calendar-grid` uses `grid-template-columns: repeat(7, 1fr)` with `gap: 2px`
- Progress ring uses inline SVG with `stroke-dasharray` / `stroke-dashoffset` — rotation applied via `transform: rotate(-90deg)` on the circle in CSS

### Chart.js conventions
- All Chart instances are stored in a `_charts` object keyed by canvas ID
- Always call `_destroyChart(id)` before creating a new chart on the same canvas to avoid "Canvas already in use" errors
- The month and year charts include a dashed orange goal line as a second dataset with `type: 'line'`
- Chart tooltip labels are overridden to append `" steps"` for readability

### CSV import / export
- **Export**: `getStepsAsCSV()` in `api.js` fetches all steps via `getAllSteps()` and returns a `date,count` CSV string; the Settings view triggers a browser download of `steps.csv`.
- **Import**: `importStepsFromRows(rows)` in `api.js` receives pre-parsed rows and upserts each one (create if the date is new, update if it already exists); returns `{ created, updated, errors }`.
- **Parsing**: `parseStepsCSV(text)` in `app.js` splits the raw file text into rows, skips an optional header line, validates that each date matches `YYYY-MM-DD` and each count is a non-negative integer, and throws a descriptive error on bad input.
- The import UI lives in the Settings view (`settingsComp`): a hidden `<input type="file" accept=".csv">` triggers `handleImport()`, which reads the file, parses it, calls `importStepsFromRows`, and displays a result summary (created / updated counts and any per-row errors).

---

## Key Constraints
- **No authentication** — do not add login screens or auth middleware
- **No build tooling** — do not introduce npm, webpack, vite, or any bundler
- **No server-side computation** — all stats logic stays in `stats.js`
- One step entry per day — `date` is unique in the `steps` collection
- Goal is per year — `year` is unique in the `goals` collection
- Charts must be responsive (Chart.js `responsive: true` option)
- Always set `perPage` explicitly on PocketBase list requests — default is 30
