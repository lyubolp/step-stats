# step-stats
A small app for tracking steps

## Known Limitations

### Current streak across New Year
The dashboard streak counter uses only the current year's step data. If a streak spans New Year's Eve into January 1st, only the January portion will be counted.

## CSV Import / Export

Step data can be exported and imported as a CSV file from the **Settings** page.

### Format

The file must have two columns: `date` (YYYY-MM-DD) and `count` (non-negative integer).
A header row is optional — it will be skipped automatically if present.

```csv
date,count
2026-01-01,8234
2026-01-02,11500
2026-01-03,9870
```

- **Export** downloads all recorded steps as `steps.csv`.
- **Import** upserts rows: existing entries for a date are updated, new dates are created.
