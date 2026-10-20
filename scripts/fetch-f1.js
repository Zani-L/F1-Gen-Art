// Pulls the 2026 season from Jolpica-F1 and writes data/f1/2026.json.
// Re-pulls every round that has already been run, so corrections overwrite old values.
// If a round fails to download, its previous saved result is kept.
const fs = require('fs');
const BASE = 'https://api.jolpi.ca/ergast/f1/2026';
const OUT = 'data/f1/2026.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(BASE + path);
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    throw new Error(path + ' -> HTTP ' + res.status);
  }
  throw new Error(path + ' -> gave up after retries');
}
const podium = (races) => {
  const list = races && races[0] && (races[0].Results || races[0].SprintResults);
  return list && list.length >= 3 ? list.slice(0, 3).map((x) => x.Driver.code) : null;
};

(async () => {
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { rounds: [] };
  const oldBy = {}; old.rounds.forEach((r) => { oldBy[r.n] = r; });

  const sched = (await get('.json?limit=100')).MRData.RaceTable.Races;
  if (!sched.length) throw new Error('Empty schedule, leaving data untouched');
  const today = new Date().toISOString().slice(0, 10);
  const rounds = [];
  for (const s of sched) {
    const n = Number(s.round);
    const r = { n, name: s.raceName, date: s.date };
    if (s.date <= today) {
      try {
        const race = podium((await get('/' + n + '/results.json')).MRData.RaceTable.Races);
        await sleep(300);
        const sprint = podium((await get('/' + n + '/sprint.json')).MRData.RaceTable.Races);
        await sleep(300);
        if (race) { r.race = race; if (sprint) r.sprint = sprint; }
      } catch (e) {
        console.warn('Round ' + n + ' failed (' + e.message + '), keeping previous data');
        if (oldBy[n] && oldBy[n].race) { r.race = oldBy[n].race; if (oldBy[n].sprint) r.sprint = oldBy[n].sprint; }
      }
    }
    rounds.push(r);
  }
  const next = { season: 2026, rounds };
  const changed = JSON.stringify(next.rounds) !== JSON.stringify(old.rounds);
  if (changed) {
    next.updated = new Date().toISOString();
    fs.mkdirSync('data/f1', { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(next, null, 1) + '\n');
  }
  console.log(changed ? 'Updated ' + OUT : 'No changes');
})().catch((e) => { console.error(e); process.exit(1); });
