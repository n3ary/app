#!/usr/bin/env node
/*
 * scripts/build-sqlite/index.mjs
 *
 * Local-only converter: downloads (and caches) the latest CTP Cluj GTFS .zip
 * from the neary-gtfs releases, materializes a real GTFS-shape SQLite DB
 * (`apps/web/static/dev-data/agency-2.sqlite3`) and a gzipped copy alongside.
 *
 * This is intentionally a single self-contained script — it will move to the
 * neary-gtfs GitHub Action as a job step once the v2 app is consuming the
 * output successfully. Until then, run it locally:
 *
 *   cd scripts/build-sqlite && npm install && npm run build
 *
 * Output is gitignored. The script is idempotent and caches the downloaded
 * .zip in scripts/build-sqlite/.cache/ to avoid re-downloading on each run.
 */

import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

import Database from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import StreamZip from 'node-stream-zip';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const CACHE_DIR = join(__dirname, '.cache');
const OUT_DIR = join(REPO_ROOT, 'apps', 'web', 'static', 'dev-data');

const AGENCY_ID = 2;
const ZIP_URL = `https://github.com/ciotlosm/neary-gtfs/releases/latest/download/agency-${AGENCY_ID}-gtfs.zip`;
const ZIP_CACHE_PATH = join(CACHE_DIR, `agency-${AGENCY_ID}-gtfs.zip`);
const DB_OUT_PATH = join(OUT_DIR, `agency-${AGENCY_ID}.sqlite3`);
const DB_GZIP_PATH = `${DB_OUT_PATH}.gz`;

const FORCE = process.argv.includes('--force');

// ---------------------------------------------------------------------------
// GTFS schema — column lists per file. Columns that aren't in this list are
// dropped silently; columns missing from the CSV are stored as NULL.
//
// Types match the GTFS spec where it matters (lat/lon REAL, sequence numbers
// INTEGER, calendar booleans 0/1). Keeping things permissive (TEXT defaults)
// lets the script ingest minor spec extensions without choking.
// ---------------------------------------------------------------------------

const SCHEMA = {
  agency: {
    file: 'agency.txt',
    columns: [
      ['agency_id', 'TEXT PRIMARY KEY'],
      ['agency_name', 'TEXT'],
      ['agency_url', 'TEXT'],
      ['agency_timezone', 'TEXT'],
      ['agency_lang', 'TEXT'],
      ['agency_phone', 'TEXT'],
    ],
  },
  routes: {
    file: 'routes.txt',
    columns: [
      ['route_id', 'INTEGER PRIMARY KEY'],
      ['agency_id', 'TEXT'],
      ['route_short_name', 'TEXT'],
      ['route_long_name', 'TEXT'],
      ['route_type', 'INTEGER'],
      ['route_color', 'TEXT'],
      ['route_text_color', 'TEXT'],
    ],
    indexes: [['routes_agency_idx', '(agency_id)']],
  },
  stops: {
    file: 'stops.txt',
    columns: [
      ['stop_id', 'INTEGER PRIMARY KEY'],
      ['stop_code', 'TEXT'],
      ['stop_name', 'TEXT'],
      ['stop_lat', 'REAL'],
      ['stop_lon', 'REAL'],
      ['location_type', 'INTEGER'],
      ['parent_station', 'TEXT'],
      ['wheelchair_boarding', 'INTEGER'],
    ],
  },
  trips: {
    file: 'trips.txt',
    columns: [
      ['trip_id', 'TEXT PRIMARY KEY'],
      ['route_id', 'INTEGER'],
      ['service_id', 'TEXT'],
      ['trip_headsign', 'TEXT'],
      ['direction_id', 'INTEGER'],
      ['shape_id', 'TEXT'],
      ['wheelchair_accessible', 'INTEGER'],
      ['bikes_allowed', 'INTEGER'],
    ],
    indexes: [
      ['trips_route_idx', '(route_id)'],
      ['trips_service_idx', '(service_id)'],
      ['trips_shape_idx', '(shape_id)'],
    ],
  },
  stop_times: {
    file: 'stop_times.txt',
    columns: [
      ['trip_id', 'TEXT'],
      ['arrival_time', 'TEXT'],
      ['departure_time', 'TEXT'],
      ['stop_id', 'INTEGER'],
      ['stop_sequence', 'INTEGER'],
      ['pickup_type', 'INTEGER'],
      ['drop_off_type', 'INTEGER'],
      ['shape_dist_traveled', 'REAL'],
    ],
    indexes: [
      // Composite for walking a trip in order — the most common query.
      ['stop_times_trip_seq_idx', '(trip_id, stop_sequence)'],
      // For "what departs from this stop" queries.
      ['stop_times_stop_idx', '(stop_id)'],
    ],
  },
  calendar: {
    file: 'calendar.txt',
    columns: [
      ['service_id', 'TEXT PRIMARY KEY'],
      ['monday', 'INTEGER'],
      ['tuesday', 'INTEGER'],
      ['wednesday', 'INTEGER'],
      ['thursday', 'INTEGER'],
      ['friday', 'INTEGER'],
      ['saturday', 'INTEGER'],
      ['sunday', 'INTEGER'],
      ['start_date', 'TEXT'],
      ['end_date', 'TEXT'],
    ],
  },
  calendar_dates: {
    file: 'calendar_dates.txt',
    columns: [
      ['service_id', 'TEXT'],
      ['date', 'TEXT'],
      ['exception_type', 'INTEGER'],
    ],
    indexes: [['calendar_dates_service_date_idx', '(service_id, date)']],
  },
  shapes: {
    file: 'shapes.txt',
    columns: [
      ['shape_id', 'TEXT'],
      ['shape_pt_lat', 'REAL'],
      ['shape_pt_lon', 'REAL'],
      ['shape_pt_sequence', 'INTEGER'],
      ['shape_dist_traveled', 'REAL'],
    ],
    indexes: [['shapes_id_seq_idx', '(shape_id, shape_pt_sequence)']],
  },
  feed_info: {
    file: 'feed_info.txt',
    columns: [
      ['feed_publisher_name', 'TEXT'],
      ['feed_publisher_url', 'TEXT'],
      ['feed_lang', 'TEXT'],
      ['feed_start_date', 'TEXT'],
      ['feed_end_date', 'TEXT'],
      ['feed_version', 'TEXT'],
    ],
  },
};

// ---------------------------------------------------------------------------
// Download (cached)
// ---------------------------------------------------------------------------

async function ensureZip() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(ZIP_CACHE_PATH) && !FORCE) {
    const stat = statSync(ZIP_CACHE_PATH);
    console.log(`✓ Using cached ${ZIP_CACHE_PATH} (${(stat.size / 1024).toFixed(1)} KB) — pass --force to re-download.`);
    return ZIP_CACHE_PATH;
  }
  console.log(`↓ Downloading ${ZIP_URL} …`);
  const res = await fetch(ZIP_URL, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  await pipeline(res.body, createWriteStream(ZIP_CACHE_PATH));
  const stat = statSync(ZIP_CACHE_PATH);
  console.log(`✓ Cached ${ZIP_CACHE_PATH} (${(stat.size / 1024).toFixed(1)} KB)`);
  return ZIP_CACHE_PATH;
}

// ---------------------------------------------------------------------------
// Read CSV out of the zip
// ---------------------------------------------------------------------------

async function readCsvFromZip(zip, filename) {
  // `entryData` throws if the entry doesn't exist — caller decides if that's
  // fatal (only feed_info is truly optional in our schema).
  try {
    const buf = await zip.entryData(filename);
    // strip UTF-8 BOM if present — csv-parse handles it but only with an option.
    const text = buf.toString('utf8').replace(/^\uFEFF/, '');
    return parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    });
  } catch {
    return null; // entry not in zip
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function createSchema(db) {
  for (const [tableName, spec] of Object.entries(SCHEMA)) {
    const cols = spec.columns.map(([name, type]) => `${name} ${type}`).join(', ');
    db.exec(`CREATE TABLE ${tableName} (${cols});`);
    for (const [idxName, idxCols] of spec.indexes ?? []) {
      db.exec(`CREATE INDEX ${idxName} ON ${tableName} ${idxCols};`);
    }
  }
  // PRAGMAs for size + read-time speed of the embedded DB. journal_mode=DELETE
  // (the default) is fine for a read-only blob; we shrink page size and
  // VACUUM at the end to get a compact file.
  db.pragma('page_size = 4096');
}

function insertRows(db, tableName, columns, rows) {
  if (!rows || rows.length === 0) return 0;
  const colNames = columns.map(([n]) => n);
  const placeholders = colNames.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO ${tableName} (${colNames.join(', ')}) VALUES (${placeholders})`);
  // Run inside a transaction — bulk INSERTs without one are >100x slower.
  const txn = db.transaction((all) => {
    for (const row of all) {
      const values = colNames.map((c) => {
        const v = row[c];
        // GTFS uses '' for missing values; convert to NULL so SQL queries
        // behave as expected (e.g. WHERE x IS NULL).
        return v === undefined || v === '' ? null : v;
      });
      stmt.run(values);
    }
  });
  txn(rows);
  return rows.length;
}

async function build() {
  mkdirSync(OUT_DIR, { recursive: true });

  const zipPath = await ensureZip();

  console.log('\n→ Opening zip …');
  const zip = new StreamZip.async({ file: zipPath });

  // Fresh DB on every run — script is idempotent.
  if (existsSync(DB_OUT_PATH)) unlinkSync(DB_OUT_PATH);
  const db = new Database(DB_OUT_PATH);
  createSchema(db);

  console.log('\n→ Ingesting GTFS tables:');
  const stats = {};
  for (const [tableName, spec] of Object.entries(SCHEMA)) {
    process.stdout.write(`  ${tableName.padEnd(16)} `);
    const rows = await readCsvFromZip(zip, spec.file);
    if (!rows) {
      console.log('— not in zip (skipped)');
      continue;
    }
    const t0 = Date.now();
    const n = insertRows(db, tableName, spec.columns, rows);
    stats[tableName] = n;
    console.log(`${n.toString().padStart(7)} rows  (${Date.now() - t0}ms)`);
  }

  await zip.close();

  console.log('\n→ Optimizing …');
  db.exec('VACUUM;');
  db.exec('ANALYZE;');
  db.close();

  // Gzip alongside the raw .sqlite3. The browser-side worker will download
  // the .gz over the network and decompress in memory before opening.
  console.log('\n→ Gzipping …');
  await pipeline(createReadStream(DB_OUT_PATH), createGzip({ level: 9 }), createWriteStream(DB_GZIP_PATH));

  const rawSize = statSync(DB_OUT_PATH).size;
  const gzSize = statSync(DB_GZIP_PATH).size;
  console.log(`\n✓ Wrote ${DB_OUT_PATH}`);
  console.log(`  raw:  ${(rawSize / 1024).toFixed(1)} KB`);
  console.log(`  gzip: ${(gzSize / 1024).toFixed(1)} KB  (${((gzSize / rawSize) * 100).toFixed(0)}% of raw)`);

  // Persist a small manifest the app can consume on startup to know
  // which agency the cached DB belongs to and how old it is.
  const manifest = {
    agencyId: AGENCY_ID,
    source: ZIP_URL,
    generatedAt: new Date().toISOString(),
    rowCounts: stats,
    rawBytes: rawSize,
    gzipBytes: gzSize,
  };
  await writeFile(
    join(OUT_DIR, `agency-${AGENCY_ID}.manifest.json`),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`✓ Wrote agency-${AGENCY_ID}.manifest.json`);
}

build().catch((err) => {
  console.error('\n✗ Build failed:', err);
  process.exit(1);
});
