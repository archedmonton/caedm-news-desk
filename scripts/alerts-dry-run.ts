import "./_bootstrap";
import { getDb } from "../src/lib/db/client";
import { evaluateAlerts } from "../src/lib/notify/alerts";

const ev = evaluateAlerts(getDb(), Date.now());
console.log(`Alerts enabled: ${ev.enabled} · within alert hours: ${ev.inWindow} · alerts last hour/day: ${ev.sentLastHour}/${ev.sentLastDay}`);
if (ev.blockedReason) console.log(`Blocked: ${ev.blockedReason}`);
console.log(`Would alert now (${ev.eligible.length}):`);
for (const s of ev.eligible) console.log(`  [${s.priority}]${s.sensitive ? " [REVIEW]" : ""} ${s.title} — ${s.publisher}`);
console.log(`Held (${ev.held.length}):`);
for (const s of ev.held) console.log(`  [${s.priority}] ${s.title} — ${s.held}`);
console.log("Dry run only: nothing was sent or recorded.");
