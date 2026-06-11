#!/usr/bin/env node
/**
 * Mock RFID reader — simulates the firmware contract (§7.2/§7.3) against
 * POST /api/rfid/ingest and GET /api/rfid/mappings.
 *
 * Usage:
 *   node scripts/mock-reader.mjs --device GATE-01 --secret <hex> [--base http://localhost:3000] <scenario>
 *
 * Scenarios:
 *   online         tap N cards now, send immediately (one batch)
 *   offline-batch  simulate taps buffered over the morning, sent late in one batch
 *   replay         send the same batch twice — second submission must dedupe to 0
 *   mappings       pull the card↔student mapping cache (offline name resolution)
 *   silent         do nothing all day (use before the absence job to test the HOLD guard)
 *
 * Options:
 *   --uids 04A1,04A2,...   explicit card UIDs (default: pulled from /api/rfid/mappings)
 *   --count N              how many cards to tap (default 5)
 *   --absent N             leave the last N mapped cards un-tapped (default 0)
 */
import { createHmac, randomUUID } from "node:crypto";
import process from "node:process";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const positionals = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) i++; // skip the flag's value
  else positionals.push(args[i]);
}
const scenario = positionals[0];

const BASE = opt("base", "http://localhost:3000");
const DEVICE = opt("device");
const SECRET = opt("secret");
const COUNT = Number(opt("count", "5"));
const ABSENT = Number(opt("absent", "0"));

if (!DEVICE || !SECRET || !scenario) {
  console.error("Usage: node scripts/mock-reader.mjs --device <id> --secret <hex> [--base url] <online|offline-batch|replay|mappings|silent>");
  process.exit(1);
}

const sign = (data) => createHmac("sha256", SECRET).update(data, "utf8").digest("hex");

async function postBatch(swipes, batchId) {
  const body = JSON.stringify({ batchId, sentAt: new Date().toISOString(), swipes });
  const res = await fetch(`${BASE}/api/rfid/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": DEVICE,
      "x-signature": sign(body),
    },
    body,
  });
  const json = await res.json();
  console.log(`POST /api/rfid/ingest [${res.status}]`, JSON.stringify(json.data ?? json.error));
  if (!res.ok) process.exit(1);
  return json.data;
}

async function getMappings() {
  const ts = new Date().toISOString();
  const res = await fetch(`${BASE}/api/rfid/mappings`, {
    headers: { "x-device-id": DEVICE, "x-timestamp": ts, "x-signature": sign(ts) },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`GET /api/rfid/mappings [${res.status}]`, JSON.stringify(json.error));
    process.exit(1);
  }
  console.log(`GET /api/rfid/mappings [${res.status}] count=${json.data.count}`);
  return json.data.mappings;
}

async function pickUids() {
  const explicit = opt("uids");
  if (explicit) return explicit.split(",").map((s) => s.trim());
  const mappings = await getMappings();
  if (mappings.length === 0) {
    console.error("No mapped cards on this tenant — assign rfid_uid to students or pass --uids");
    process.exit(1);
  }
  const usable = mappings.slice(0, Math.max(0, mappings.length - ABSENT));
  return usable.slice(0, Math.min(COUNT, usable.length)).map((m) => m.uid);
}

/** Spread taps over a window ending `endMinAgo` minutes ago. */
function buildSwipes(uids, { startMinAgo, endMinAgo }) {
  const now = Date.now();
  return uids.map((uid, i) => ({
    uid,
    ts: new Date(
      now - (startMinAgo - ((startMinAgo - endMinAgo) * i) / Math.max(1, uids.length - 1)) * 60_000,
    ).toISOString(),
    direction: "in",
  }));
}

switch (scenario) {
  case "mappings": {
    const mappings = await getMappings();
    console.table(mappings.slice(0, 10));
    break;
  }
  case "online": {
    const uids = await pickUids();
    const swipes = buildSwipes(uids, { startMinAgo: 5, endMinAgo: 1 });
    await postBatch(swipes, `online-${randomUUID().slice(0, 8)}`);
    break;
  }
  case "offline-batch": {
    // Taps buffered since the morning, flushed now (e.g. WiFi came back).
    const uids = await pickUids();
    const swipes = buildSwipes(uids, { startMinAgo: 180, endMinAgo: 60 });
    console.log(`(simulating ${swipes.length} taps buffered offline for ~3h, syncing now)`);
    await postBatch(swipes, `offline-${randomUUID().slice(0, 8)}`);
    break;
  }
  case "replay": {
    const uids = await pickUids();
    const swipes = buildSwipes(uids, { startMinAgo: 30, endMinAgo: 10 });
    const batchId = `replay-${randomUUID().slice(0, 8)}`;
    console.log("first submission:");
    const a = await postBatch(swipes, batchId);
    console.log("replayed identical batch:");
    const b = await postBatch(swipes, batchId);
    const dedupOk = a.inserted === swipes.length ? b.inserted === 0 : true;
    console.log(dedupOk ? "✓ replay deduped (inserted=0 on second submit)" : "✗ DEDUPE FAILED");
    process.exit(dedupOk ? 0 : 1);
    break;
  }
  case "silent": {
    console.log("Device stays silent all day (no heartbeat, no swipes).");
    console.log("Now run the absence job — it must HOLD, not mark everyone absent.");
    break;
  }
  default:
    console.error(`Unknown scenario: ${scenario}`);
    process.exit(1);
}
