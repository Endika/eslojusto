// Fails when a rent index table no longer covers today: from that day every rent update reads
// «no se puede comprobar» until the next INE row is added. No network; a daily workflow runs it.
import { IGC } from '../src/engine/rental/data/igc.ts';
import { IPC } from '../src/engine/rental/data/ipc.ts';
import { IRAV } from '../src/engine/rental/data/irav.ts';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const behind = [IRAV, IPC, IGC].filter((s) => s.coveredUntil < today);
for (const s of behind)
  console.log(
    `::error::${s.id} covers until ${s.coveredUntil}: add the INE's new row and move coveredUntil (npm run indices:check)`,
  );
if (behind.length === 0) console.log(`Index tables cover ${today}.`);
process.exit(behind.length === 0 ? 0 : 1);
