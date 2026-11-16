/*
 * End-to-end check: runs the built game in a real browser at phone size.
 *
 *   Stage 1: it installs, it runs with no network, saves survive, backups round-trip, and a new
 *            version takes over only when asked.
 *   Stage 2: the season almanac shows the real calendars, teams, drivers and rules, offline too.
 *   Stages 3 and 4: a real round is raced from the grid to a full result, with the pit wall's controls.
 *   Stage 5: a career weekend from practice to the standings, a race kept across a reload, a 2023 sprint weekend.
 *
 *   npm run e2e            (builds twice, then runs this)
 *
 * Needs Playwright with Chromium available to `require`. It is not a project dependency.
 * Screenshots land in e2e/output/.
 */
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const DIST = path.join(root, 'dist');
const DIST_NEXT = path.join(root, 'dist-next');
const OUT = path.join(__dirname, 'output');

// A phone held sideways: the game plays in landscape.
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** A plain static server, as any web host would be. `site.dir` can be swapped to stage a new release. */
function serve(site) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    site.requests.push(url.pathname);
    if (!url.pathname.startsWith(site.mount)) {
      res.writeHead(404).end('not found');
      return;
    }
    let file = path.join(site.dir, decodeURIComponent(url.pathname.slice(site.mount.length)));
    if (!file.startsWith(site.dir)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      site.url = `http://127.0.0.1:${server.address().port}${site.mount}`;
      site.close = () => new Promise((done) => server.close(done));
      resolve(site);
    });
  });
}

const newSite = (dir, mount = '/') => serve({ dir, mount, requests: [] });

// ── A very small test runner ────────────────────────────────────────────────────────────────

const results = [];
let failures = 0;

async function check(name, run) {
  const started = Date.now();
  try {
    await run();
    results.push(`  pass  ${name}  (${Date.now() - started} ms)`);
  } catch (error) {
    failures += 1;
    results.push(`  FAIL  ${name}\n        ${String(error && error.stack ? error.stack : error).split('\n').slice(0, 6).join('\n        ')}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectEqual(actual, wanted, what) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) throw new Error(`${what}: wanted ${w}, got ${a}`);
}

// ── Helpers that drive the game as a player would ───────────────────────────────────────────

/** Collects anything the browser complains about, so a silent error cannot pass. */
function watch(page, log) {
  page.on('console', (message) => {
    if (message.type() === 'error') log.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => log.push(`page error: ${error.message}`));
}

const offlineReady = (page) =>
  page.getByText('Ready to play offline.').first().waitFor({ state: 'visible', timeout: 15000 });

async function openGame(page, url) {
  await page.goto(url);
  await page.locator('.slots').waitFor();
}

/** What each slot card says, as plain text, e.g. "Slot 1 · Saved today at 18:42 | 2010 | Round 2 of 19 | Race next". */
const slotTexts = (page) =>
  page.locator('.slot').evaluateAll((cards) => cards.map((card) => card.innerText.replace(/\s*\n\s*/g, ' | ')));

const slotCard = (page, slot) => page.locator('.slot').nth(slot - 1);

/**
 * Starts a career in an empty slot with a team, and lands on the team's home screen. Unless told
 * not to, it signs the balanced sponsor, the one thing a new career must settle before practice.
 */
async function startNewCareer(page, slot, team = 'Williams', sponsor = true, tutorial = false) {
  await slotCard(page, slot).getByRole('button', { name: 'New career' }).click();
  await page.getByRole('heading', { name: 'Choose your team' }).waitFor();
  await page.getByRole('button', { name: new RegExp(`^${team}`) }).click();
  await page.getByRole('group', { name: 'Fatal accidents' }).waitFor();
  await page.getByRole('button', { name: `Start with ${team}` }).click();
  await page.locator('.hub').waitFor();
  // A new career opens on the tutorial's first tip; most checks skip it.
  await page.locator('dialog.coach').waitFor();
  if (tutorial) return;
  await page.locator('dialog.coach').getByRole('button', { name: 'Skip the tutorial' }).click();
  await page.locator('dialog.coach').waitFor({ state: 'detached' });
  if (!sponsor) return;
  await page.getByRole('button', { name: 'Sign a title sponsor' }).click();
  await page.locator('dialog .choice', { hasText: 'Balanced' }).click();
  await page.locator('dialog').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Go to practice' }).waitFor();
}

const sessionsDone = (page) =>
  page.evaluate(() => Number(document.querySelector('main[data-sessions]')?.getAttribute('data-sessions') ?? -1));

/** From a session back to the team's home screen. */
async function toHub(page) {
  const team = page.getByRole('button', { name: 'Team', exact: true });
  if (await team.isVisible()) await team.click();
  await page.locator('.hub').waitFor();
}

/**
 * Plays sessions the quickest way: each screen's quick action (finish practice, run each part of
 * qualifying, simulate the race, go to the next round) until the career counts one more session.
 * Ends on the team's home screen, once every save has landed.
 */
async function completeSessions(page, count) {
  for (let i = 0; i < count; i++) {
    const before = await sessionsDone(page);
    for (let step = 0; ; step++) {
      if (step > 12) throw new Error(`session ${i + 1} of ${count} would not complete`);
      await page.locator('[data-quick]').click();
      const moved = await page
        .waitForFunction(
          (n) => Number(document.querySelector('main[data-sessions]')?.getAttribute('data-sessions') ?? -1) > n,
          before,
          { timeout: 800 },
        )
        .then(() => true, () => false);
      if (moved) break;
    }
  }
  await toHub(page);
  // The top bar says "Saved <time>" once the queue of saves has drained.
  await page.locator('.topbar__meta', { hasText: /^Saved / }).waitFor();
}

async function backToCareers(page) {
  const team = page.getByRole('button', { name: 'Team', exact: true });
  if (await team.isVisible()) await team.click();
  // The settings screen says Back: it can be reached from a career as well as from the careers.
  const back = page.getByRole('button', { name: 'Back', exact: true });
  if (await back.isVisible()) await back.click();
  else await page.getByRole('button', { name: 'Careers' }).click();
  await page.locator('.slots').waitFor();
}

/** Asks the active service worker which build it is. */
const workerVersion = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => resolve(event.data);
        setTimeout(() => reject(new Error('the service worker did not answer')), 5000);
        navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
      }),
  );

const cachedFiles = (page) =>
  page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      out[name] = (await cache.keys()).map((request) => new URL(request.url).pathname).sort();
    }
    return out;
  });

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

// ── The checks ──────────────────────────────────────────────────────────────────────────────

async function main() {
  for (const dir of [DIST, DIST_NEXT]) {
    expect(fs.existsSync(path.join(dir, 'sw.js')), `${path.relative(root, dir)} has no build in it. Run "npm run e2e".`);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  const browser = await chromium.launch();

  // ── 1. First visit, offline play, saving ──────────────────────────────────────────────────
  {
    const site = await newSite(DIST);
    const context = await browser.newContext({ ...PHONE, acceptDownloads: true });
    const page = await context.newPage();
    const log = [];
    watch(page, log);
    let backupFile;

    await check('first visit: the game loads and stores itself for offline play', async () => {
      await openGame(page, site.url);
      await offlineReady(page);
      // The first worker takes over the open page; no reload is needed and none happens.
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      const caches = await cachedFiles(page);
      const names = Object.keys(caches);
      expectEqual(names.length, 1, 'number of caches');
      const built = listFiles(DIST).filter((file) => file !== 'sw.js').sort();
      expectEqual(caches[names[0]], built.map((file) => `/${file}`), 'files stored for offline play');
      await shot(page, '01-first-run');
    });

    await check('once stored, every file comes from the device, not the network', async () => {
      site.requests.length = 0;
      await page.reload();
      await page.locator('.slots').waitFor();
      await page.waitForFunction(() => document.fonts.status === 'loaded');
      await page.waitForTimeout(500);
      // The browser itself may re-check sw.js for a new version; nothing else should be asked for.
      expectEqual(site.requests.filter((file) => file !== '/sw.js'), [], 'files fetched from the server on a second visit');
    });

    await check('first visit: three empty slots, one main action', async () => {
      const texts = await slotTexts(page);
      expectEqual(texts.length, 3, 'slot count');
      for (const text of texts) expect(/No career yet/.test(text), `expected an empty slot, got "${text}"`);
      expectEqual(await page.locator('.button--primary').count(), 1, 'primary buttons on the screen');
    });

    await check('a new career starts in 2010 and autosaves after each session', async () => {
      await startNewCareer(page, 1);
      expect(/#\/career\/1$/.test(page.url()), `expected the career address, got ${page.url()}`);
      await completeSessions(page, 6); // practice, qualifying, race, management, then round 2 practice, qualifying
      expectEqual(await page.locator('.topbar__sub').innerText(), 'Season 2010 · Round 2 of 19', 'career position');
      await shot(page, '02-career');
      await backToCareers(page);
      const [first] = await slotTexts(page);
      expect(/2010 \| [^|]+ \| Round 2 of 19 · Race next/.test(first), `slot 1 should show round 2, race next: "${first}"`);
    });

    await check('the save survives a reload', async () => {
      await page.reload();
      await page.locator('.slots').waitFor();
      const [first] = await slotTexts(page);
      expect(/Round 2 of 19 · Race next/.test(first), `after reload: "${first}"`);
      await slotCard(page, 1).getByRole('button', { name: 'Continue' }).click();
      await page.locator('.hub').waitFor();
      expectEqual(await page.locator('.row--next .row__label').innerText(), 'Race', 'next session after reload');
      await backToCareers(page);
    });

    await check('with the network off, the game still loads and still saves', async () => {
      await context.setOffline(true);
      site.requests.length = 0;
      await page.reload();
      await page.locator('.slots').waitFor();
      await page.waitForFunction(() => document.fonts.status === 'loaded');
      expect(await page.evaluate(() => document.fonts.check('600 32px "Barlow Condensed"')), 'figure typeface missing offline');
      expect(await page.evaluate(() => document.fonts.check('14px "Inter"')), 'text typeface missing offline');
      await slotCard(page, 1).getByRole('button', { name: 'Continue' }).click();
      await page.locator('.hub').waitFor();
      await completeSessions(page, 3); // race, management, round 3 practice
      await page.reload();
      await page.locator('.hub').waitFor();
      expectEqual(await page.locator('.topbar__sub').innerText(), 'Season 2010 · Round 3 of 19', 'position after an offline reload');
      expectEqual(await page.locator('.row--next .row__label').innerText(), 'Qualifying', 'next session after an offline reload');
      // (The browser's own re-check of sw.js ignores the test's offline switch; the cold start further down
      // repeats all this with the server actually gone.)
      expectEqual(site.requests.filter((file) => file !== '/sw.js'), [], 'requests that reached the server while offline');
      await shot(page, '03-offline-career');
    });

    await check('offline: every way into the app still opens it', async () => {
      for (const address of ['index.html', '#/system', 'index.html?source=homescreen', 'no-such-page']) {
        await page.goto(site.url + address);
        await page.locator('.title').waitFor();
      }
      await page.goto(site.url);
      await page.locator('.slots').waitFor();
      await context.setOffline(false);
    });

    await check('a slot backs up to a file that passes its own integrity stamp', async () => {
      await slotCard(page, 1).getByRole('button', { name: 'More for slot 1' }).click();
      await page.getByRole('button', { name: /Back up to a file/ }).click();
      await page.getByText(/^mrm-2010-r03-\d{8}-\d{4}\.json$/).waitFor();
      await shot(page, '04-backup-sheet');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /^Download/ }).click(),
      ]);
      backupFile = path.join(OUT, download.suggestedFilename());
      await download.saveAs(backupFile);
      const file = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      expectEqual(file.format, 'modern-racing-manager-save', 'file format tag');
      expectEqual(file.schemaVersion, 5, 'file save version');
      expectEqual(file.career.team, 'williams', 'team in the file');
      expectEqual(
        { seasonYear: file.career.seasonYear, round: file.career.round, phase: file.career.phase, sessions: file.career.sessionsCompleted },
        { seasonYear: 2010, round: 3, phase: 'qualifying', sessions: 9 },
        'career in the file',
      );
      const stamp = `crc32:${zlib.crc32(JSON.stringify(file.career)).toString(16).padStart(8, '0')}`;
      expectEqual(file.checksum, stamp, 'integrity stamp');
    });

    await check('deleting a career asks first, then empties the slot', async () => {
      await slotCard(page, 1).getByRole('button', { name: 'More for slot 1' }).click();
      await page.getByRole('button', { name: /Delete career/ }).click();
      await page.getByRole('heading', { name: 'Delete the career in slot 1?' }).waitFor();
      await shot(page, '05-delete-confirm');
      await page.getByRole('button', { name: 'Keep it' }).click();
      expect(/Round 3 of 19/.test((await slotTexts(page))[0]), '"Keep it" must not delete');
      await slotCard(page, 1).getByRole('button', { name: 'More for slot 1' }).click();
      await page.getByRole('button', { name: /Delete career/ }).click();
      await page.getByRole('button', { name: 'Delete career' }).click();
      await page.getByText('Slot 1 is empty.').waitFor();
      expect(/No career yet/.test((await slotTexts(page))[0]), 'slot 1 should be empty after deleting');
    });

    await check('the backup restores into another slot', async () => {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        slotCard(page, 2).getByRole('button', { name: 'Restore backup' }).click(),
      ]);
      await chooser.setFiles(backupFile);
      await page.getByText('Career restored to slot 2.').waitFor();
      const texts = await slotTexts(page);
      expect(/No career yet/.test(texts[0]), `slot 1 stays empty: "${texts[0]}"`);
      expect(/2010 \| [^|]+ \| Round 3 of 19 · Qualifying next/.test(texts[1]), `slot 2 holds the restored career: "${texts[1]}"`);
      await slotCard(page, 2).getByRole('button', { name: 'Continue' }).click();
      await page.locator('.hub').waitFor();
      expectEqual(await page.locator('.row--next .row__label').innerText(), 'Qualifying', 'next session in the restored career');
      expectEqual(await page.locator('.topbar__name').innerText(), 'Williams', 'team of the restored career');
      await backToCareers(page);
    });

    await check('restoring over a career asks first; an edited file is flagged; a wrong file is refused', async () => {
      // Over an occupied slot, from the slot menu (the picker must open from inside the open sheet).
      await slotCard(page, 2).getByRole('button', { name: 'More for slot 2' }).click();
      let [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: /Replace with a backup file/ }).click(),
      ]);
      await chooser.setFiles(backupFile);
      await page.getByRole('heading', { name: 'Replace the career in slot 2?' }).waitFor();
      await shot(page, '06-replace-confirm');
      await page.getByRole('button', { name: 'Cancel' }).click();

      // A hand-edited copy: loads, but only after saying it could not be verified.
      const edited = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      edited.career.seasonYear = 2014;
      edited.career.round = 5;
      const editedFile = path.join(OUT, 'edited-backup.json');
      fs.writeFileSync(editedFile, JSON.stringify(edited, null, 2));
      [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        slotCard(page, 3).getByRole('button', { name: 'Restore backup' }).click(),
      ]);
      await chooser.setFiles(editedFile);
      await page.getByText(/could not be verified/).waitFor();
      await page.getByRole('button', { name: 'Restore backup' }).last().click();
      await page.getByText('Career restored to slot 3.').waitFor();
      expect(/2014 \| [^|]+ \| Round 5 of 19/.test((await slotTexts(page))[2]), 'slot 3 should hold the edited career');

      // Not a save at all.
      const wrongFile = path.join(OUT, 'holiday-notes.json');
      fs.writeFileSync(wrongFile, JSON.stringify({ title: 'Packing list', items: ['passport'] }));
      [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        slotCard(page, 1).getByRole('button', { name: 'Restore backup' }).click(),
      ]);
      await chooser.setFiles(wrongFile);
      await page.getByText('That file is not a Modern Racing Manager backup.').waitFor();
      expect(/No career yet/.test((await slotTexts(page))[0]), 'a wrong file must leave the slot untouched');
    });

    await check('three careers side by side keep to their own slots', async () => {
      await startNewCareer(page, 1);
      await completeSessions(page, 1);
      await backToCareers(page);
      const texts = await slotTexts(page);
      expect(/2010 \| [^|]+ \| Round 1 of 19 · Qualifying next/.test(texts[0]), `slot 1: "${texts[0]}"`);
      expect(/2010 \| [^|]+ \| Round 3 of 19 · Qualifying next/.test(texts[1]), `slot 2: "${texts[1]}"`);
      expect(/2014 \| [^|]+ \| Round 5 of 19 · Qualifying next/.test(texts[2]), `slot 3: "${texts[2]}"`);
      // The career played last carries the one main action.
      expectEqual(await page.locator('.button--primary').count(), 1, 'primary buttons');
      expect(await slotCard(page, 1).locator('.button--primary').count(), 'slot 1 was played last, so it leads');
      await shot(page, '07-three-careers');
    });

    await check('the back gesture and a direct address both land where they should', async () => {
      // Three times over, as fast as the browser allows: screens opening and closing out of step
      // must never leave the career screen blank.
      for (let round = 0; round < 3; round++) {
        await slotCard(page, 3).getByRole('button', { name: 'Continue' }).click();
        await page.locator('.hub').waitFor();
        await page.goBack();
        await page.locator('.slots').waitFor();
        await page.goForward();
        await page.locator('.hub').waitFor({ timeout: 5000 });
        expectEqual(await page.locator('.topbar__sub').innerText(), 'Season 2014 · Round 5 of 19', 'career shown after going forward');
        await page.goBack();
        await page.locator('.slots').waitFor();
      }
      await slotCard(page, 3).getByRole('button', { name: 'Continue' }).click();
      await page.locator('.hub').waitFor();
      // Opening the address of a career directly (as a reload does) loads that career.
      await page.goto(site.url + '#/career/2');
      await page.reload();
      await page.locator('.hub').waitFor();
      expectEqual(await page.locator('.topbar__sub').innerText(), 'Season 2010 · Round 3 of 19', 'career opened by address');
      await backToCareers(page);
      // An address for a slot with nothing in it falls back to the list.
      await slotCard(page, 1).getByRole('button', { name: 'More for slot 1' }).click();
      await page.getByRole('button', { name: /Delete career/ }).click();
      await page.getByRole('button', { name: 'Delete career' }).click();
      await page.getByText('Slot 1 is empty.').waitFor();
      await page.goto(site.url + '#/career/1');
      await page.reload();
      await page.locator('.slots').waitFor();
    });

    await check('the Settings screen reports the device honestly', async () => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('heading', { name: 'Settings' }).waitFor();
      await page.getByText('Stored', { exact: true }).waitFor();
      await page.getByText(/^Ready to play offline\./).first().waitFor();
      await page.getByText('2 of 3 slots').waitFor();
      await page.screenshot({ path: path.join(OUT, '08-system.png'), fullPage: true });
      await backToCareers(page);
    });

    await check('nothing was logged as an error along the way', async () => {
      expectEqual(log, [], 'browser errors');
    });

    await context.close();
    await site.close();
  }

  // ── 2. Closed and reopened with no network at all (the metro) ─────────────────────────────
  {
    const site = await newSite(DIST);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mrm-profile-'));

    await check('installability: the browser finds nothing wrong with the manifest', async () => {
      const context = await chromium.launchPersistentContext(profile, PHONE);
      const page = context.pages()[0] || (await context.newPage());
      await openGame(page, site.url);
      await offlineReady(page);
      const session = await context.newCDPSession(page);
      const manifest = await session.send('Page.getAppManifest');
      expectEqual(manifest.errors, [], 'manifest errors');
      expect(manifest.url.endsWith('/manifest.webmanifest'), `manifest address: ${manifest.url}`);
      const { installabilityErrors } = await session.send('Page.getInstallabilityErrors');
      expectEqual(installabilityErrors.map((error) => error.errorId), [], 'installability errors');
      // Leave a career behind for the cold start below.
      await startNewCareer(page, 1);
      await completeSessions(page, 5);
      await context.close();
    });

    await check('cold start with the server gone: the game opens and the career is there', async () => {
      const address = site.url;
      await site.close();
      const context = await chromium.launchPersistentContext(profile, PHONE);
      await context.setOffline(true);
      const page = context.pages()[0] || (await context.newPage());
      const log = [];
      watch(page, log);
      await openGame(page, address);
      const [first] = await slotTexts(page);
      expect(/2010 \| [^|]+ \| Round 2 of 19 · Qualifying next/.test(first), `career after a cold offline start: "${first}"`);
      await offlineReady(page);
      await slotCard(page, 1).getByRole('button', { name: 'Continue' }).click();
      await page.locator('.hub').waitFor();
      await completeSessions(page, 2);
      await shot(page, '09-cold-offline-start');
      // Asking for an update with no connection is answered plainly, not with an error.
      await backToCareers(page);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Check for update' }).click();
      await page.getByText('Could not check: the device is offline.').waitFor();
      expectEqual(log, [], 'browser errors on a cold offline start');
      await context.close();
    });

    fs.rmSync(profile, { recursive: true, force: true });
  }

  // ── 3. The manifest and its icons ─────────────────────────────────────────────────────────
  await check('manifest: names, colours, relative addresses and icons of the stated sizes', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
    expectEqual(
      { name: manifest.name, short: manifest.short_name, display: manifest.display, start: manifest.start_url, scope: manifest.scope },
      { name: 'Modern Racing Manager', short: 'Racing Mgr', display: 'standalone', start: './', scope: './' },
      'manifest basics',
    );
    expect(manifest.short_name.length <= 12, 'the home-screen name must fit under an icon');
    const purposes = new Set();
    for (const icon of manifest.icons) {
      expectEqual(pngSize(path.join(DIST, icon.src)), icon.sizes, `size of ${icon.src}`);
      purposes.add(`${icon.purpose} ${icon.sizes}`);
    }
    for (const needed of ['any 192x192', 'any 512x512', 'maskable 192x192', 'maskable 512x512']) {
      expect(purposes.has(needed), `missing icon: ${needed}`);
    }
    expectEqual(pngSize(path.join(DIST, 'icons/apple-touch-icon.png')), '180x180', 'iPhone icon size');
  });

  // ── 4. A new version: found, downloaded, and applied only when asked ──────────────────────
  {
    const site = await newSite(DIST);
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    const log = [];
    watch(page, log);

    await check('update: a new release waits until the player says so, then takes over cleanly', async () => {
      await openGame(page, site.url);
      await offlineReady(page);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      const before = await workerVersion(page);

      await startNewCareer(page, 1);
      await completeSessions(page, 4);
      await backToCareers(page);

      // Nothing new on the server: the check says so.
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Check for update' }).click();
      await page.getByText(/^Up to date\./).waitFor();

      // A new release is published.
      site.dir = DIST_NEXT;
      await page.getByRole('button', { name: 'Check for update' }).click();
      await page.getByText('A newer version is downloaded and ready.').waitFor({ timeout: 15000 });
      expectEqual((await workerVersion(page)).version, before.version, 'version in charge while the new one waits');
      await page.screenshot({ path: path.join(OUT, '10-update-ready.png') });

      // The list screen offers it too.
      await backToCareers(page);
      await page.getByText('A new version of the game is ready.').waitFor();

      await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Update now' }).click()]);
      await page.locator('.slots').waitFor();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      const after = await workerVersion(page);
      expect(after.version !== before.version, 'the new version should be in charge after updating');

      const caches = await cachedFiles(page);
      expectEqual(Object.keys(caches).length, 1, 'caches left after the update (the old one is removed)');
      expect(Object.keys(caches)[0].endsWith(after.version), 'the remaining cache belongs to the new version');
      const [first] = await slotTexts(page);
      expect(/2010 \| [^|]+ \| Round 2 of 19 · Practice next/.test(first), `the career is untouched by the update: "${first}"`);
      expect((await page.getByText('A new version of the game is ready.').count()) === 0, 'the update notice should be gone');
      expectEqual(log, [], 'browser errors during the update');
    });

    await context.close();
    await site.close();
  }

  // ── 5. Hosted in a folder, as on GitHub Pages ─────────────────────────────────────────────
  {
    const site = await newSite(DIST, '/games/racing-manager/');
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    const log = [];
    watch(page, log);

    await check('hosted in a sub-folder: loads, stores itself, and runs offline from there', async () => {
      await openGame(page, site.url);
      await offlineReady(page);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
      expectEqual(scope, site.url, 'service worker scope');
      const caches = await cachedFiles(page);
      const [name] = Object.keys(caches);
      expect(name.startsWith('mrm|/games/racing-manager/|'), `cache name carries the folder: ${name}`);
      expect(caches[name].every((file) => file.startsWith('/games/racing-manager/')), 'every cached file is inside the folder');

      // A file that goes missing from the cache is fetched once and put back.
      const lost = caches[name].find((file) => file.endsWith('.css'));
      await page.evaluate(async ([cacheName, file]) => (await window.caches.open(cacheName)).delete(file), [name, lost]);
      await page.reload();
      await page.locator('.slots').waitFor();
      await page.waitForFunction(
        async ([cacheName, file]) => Boolean(await (await window.caches.open(cacheName)).match(file)),
        [name, lost],
      );

      await startNewCareer(page, 1);
      await completeSessions(page, 2);
      await context.setOffline(true);
      await page.reload();
      await page.locator('.hub').waitFor();
      expectEqual(await page.locator('.row--next .row__label').innerText(), 'Race', 'next session, offline, in a sub-folder');
      await page.goto(site.url);
      await page.locator('.slots').waitFor();
      expectEqual(log, [], 'browser errors in a sub-folder');
    });

    await context.close();
    await site.close();
  }

  // ── 6. Stage 2: the season almanac ────────────────────────────────────────────────────────
  {
    const site = await newSite(DIST);
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    const log = [];
    watch(page, log);
    const subtitle = () => page.locator('.subtitle').innerText();
    const rows = (selector) => page.locator(selector).evaluateAll((list) => list.map((row) => row.innerText.replace(/\s*\n\s*/g, ' | ')));

    await check('almanac: opens from the Careers screen on the 2010 season as it really was', async () => {
      await openGame(page, site.url);
      await offlineReady(page);
      await page.getByRole('button', { name: /Season almanac/ }).click();
      await page.getByRole('heading', { name: 'Season 2010' }).waitFor();
      expectEqual(await subtitle(), '19 races, 12 teams. Some rule changes.', '2010 summary');
      const calendar = await rows('.round');
      expectEqual(calendar.length, 19, 'rounds listed for 2010');
      expect(/^Bahrain Grand Prix \| Bahrain · 14 Mar \| 1$/.test(calendar[0]), `first round of 2010: "${calendar[0]}"`);
      expect(/^Abu Dhabi Grand Prix \| Yas Marina · 14 Nov \| 19$/.test(calendar[18]), `last round of 2010: "${calendar[18]}"`);
      expectEqual(await page.locator('.round svg path').count(), 19, 'track outlines drawn');
      await shot(page, '11-almanac-calendar');
    });

    await check('almanac: a round opens its circuit, with outline and character', async () => {
      await page.locator('.round').nth(5).click();
      await page.getByRole('heading', { name: '2010 Monaco Grand Prix' }).waitFor();
      await page.getByText('78 laps of 3.340 km').waitFor();
      await page.getByText('19 turns, clockwise, street circuit').waitFor();
      expectEqual(await page.locator('.sheet__map svg path').count(), 1, 'outline in the circuit sheet');
      await shot(page, '12-almanac-circuit');
      await page.getByRole('button', { name: 'Close' }).click();
    });

    await check('almanac: teams, drivers and rules follow the season chosen', async () => {
      await page.getByRole('tab', { name: 'Teams' }).click();
      let teams = await rows('.team');
      expectEqual(teams.length, 12, 'teams in 2010');
      expect(/^Red Bull \| Renault · Webber, Vettel \| Aggressive race style \| Fastest/.test(teams[0]), `quickest car of 2010: "${teams[0]}"`);
      expect(teams.some((row) => row.startsWith('Williams') && row.includes('Cautious race style')), 'Williams run cautiously');
      await shot(page, '13-almanac-teams');

      await page.getByRole('tab', { name: 'Drivers' }).click();
      expectEqual(await page.locator('.driver').count(), 30, 'drivers in the sport in 2010');
      await page.getByRole('button', { name: '2015', exact: true }).click();
      await page.getByRole('heading', { name: 'Season 2015' }).waitFor();
      const verstappen = (await rows('.driver')).find((row) => row.startsWith('Max Verstappen'));
      expect(/Dutch · 17 \| Debut/.test(verstappen), `Verstappen in 2015: "${verstappen}"`);
      await page.getByRole('button', { name: /Max Verstappen/ }).click();
      await page.getByText('Dutch, 17 in 2015. First race 2015, this season.').waitFor();
      await shot(page, '14-almanac-driver');
      await page.getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: '2014', exact: true }).click();
      await page.getByRole('tab', { name: 'Rules' }).click();
      expectEqual(await subtitle(), '19 races, 11 teams. Big rule changes.', '2014 summary');
      await page.getByText('Double points', { exact: true }).waitFor();
      await page.getByText('1.6 litre V6 turbo hybrid', { exact: true }).waitFor();
      await shot(page, '15-almanac-rules');
    });

    await check('almanac: 2026 as it really ran, and all of it works offline', async () => {
      await context.setOffline(true);
      await page.goto(site.url + '#/almanac/2026');
      await page.reload();
      await page.getByRole('heading', { name: 'Season 2026' }).waitFor();
      expectEqual(await subtitle(), '23 races, 11 teams. Big rule changes.', '2026 summary');
      const calendar = await rows('.round');
      expect(/^Bahrain Grand Prix \| Sepang · 4 Oct \| 16$/.test(calendar[15]), `round 16 of 2026: "${calendar[15]}"`);
      expect(!calendar.some((row) => row.includes('Saudi')), 'no Saudi Arabian Grand Prix in 2026');
      expectEqual(calendar.filter((row) => row.includes('Sprint')).length, 6, 'sprint weekends in 2026');
      await page.getByRole('tab', { name: 'Teams' }).click();
      const teams = await rows('.team');
      expectEqual(teams.length, 11, 'teams in 2026');
      expect(teams.some((row) => row.startsWith('Cadillac | Ferrari')), 'Cadillac, with Ferrari engines');
      expect(teams.some((row) => row.startsWith('Audi | Audi')), 'Audi, with its own engine');
      await page.getByRole('button', { name: 'Careers' }).click();
      await page.locator('.slots').waitFor();
      expectEqual(log, [], 'browser errors in the almanac');
    });

    // ── 7. Stages 3 and 4: a race, from the grid to the result ───────────────────────────────
    const results = () => rows('.result');
    const toResult = async () => {
      await page.getByRole('button', { name: 'Skip to the end' }).click();
      await page.locator('dialog').getByRole('button', { name: 'Skip to the end' }).click();
      await page.getByRole('button', { name: 'Race it again' }).waitFor();
    };

    await check('race: a round leads to a choice of team, then the grid with a plan for each car', async () => {
      // Still offline from the check before.
      await page.goto(site.url + '#/almanac/2012');
      await page.getByRole('heading', { name: 'Season 2012' }).waitFor();
      await page.getByRole('button', { name: /British Grand Prix/ }).click();
      await page.getByRole('button', { name: 'Race this round' }).click();
      await page.getByRole('heading', { name: '2012 British Grand Prix' }).waitFor();
      expectEqual(await page.locator('.driver').count(), 13, 'twelve teams and the choice to watch');
      await page.getByRole('button', { name: /^Ferrari/ }).click();
      await page.getByRole('button', { name: 'Start the race' }).waitFor();
      expectEqual((await results()).length, 24, 'cars on the grid');
      expectEqual(await page.locator('.result--mine').count(), 2, 'the two Ferraris marked on the grid');
      const plans = await page.locator('.plan__words').allInnerTexts();
      expectEqual(plans.length, 2, 'a plan for each car');
      expect(plans.every((plan) => /^Start on (soft|medium|hard|intermediate|wet)/.test(plan)), `plans: ${plans.join(' / ')}`);
      // The weather for the first laps: an icon and a chance of rain for each, and how wet the track is.
      const forecast = page.locator('.forecast--card');
      expectEqual(await forecast.locator('.forecast__lap').count(), 5, 'laps in the grid forecast');
      expectEqual(await forecast.locator('.forecast__lap svg').count(), 5, 'a weather icon for each lap');
      const chances = await forecast.locator('.forecast__chance').allInnerTexts();
      expect(chances.every((chance) => /^\d+%$/.test(chance.trim())), `chances of rain: ${chances.join(' / ')}`);
      expectEqual(await forecast.locator('.meter').count(), 1, 'a bar for how wet the track is');
      await shot(page, '16-race-grid');
    });

    await check('race: the race runs on the map, and the pit wall can call a stop', async () => {
      await page.getByRole('button', { name: 'Start the race' }).click();
      await page.locator('.tower__row--mine').first().waitFor();
      expectEqual(await page.locator('.tower__row:not(.tower__head)').count(), 24, 'cars in the running order');
      expectEqual(await page.locator('.carcard').count(), 2, 'cards for the two cars');
      await page.getByRole('button', { name: 'Speed 4x' }).click();
      await page.waitForFunction(() => /Lap [3-9]/.test(document.querySelector('.race__lap')?.textContent ?? ''), null, { timeout: 30000 });
      // The map is drawn: the canvas is not blank, and holds more than the grey of the track.
      const colours = await page.locator('.race__map canvas').evaluate((canvas) => {
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        const seen = new Set();
        for (let i = 0; i < data.length; i += 16) seen.add((data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4));
        return seen.size;
      });
      expect(colours > 6, `colours on the map: ${colours}`);
      expect((await page.locator('.feed__line').count()) > 0, 'the feed has lines');
      // The weather strip over the map, and a tyre and fuel graph for each car.
      const strip = await page.locator('.race__map .forecast .forecast__lap').count();
      expect(strip >= 1 && strip <= 5, `laps in the forecast over the map: ${strip}`);
      expectEqual(await page.locator('.race__map .forecast .meter').count(), 1, 'the wetness bar over the map');
      expectEqual(await page.locator('.carcard .outlook').count(), 2, 'a tyre and fuel graph on each card');
      const bars = await page.locator('.carcard').first().locator('.outlook__strip').evaluateAll((strips) => strips.map((svg) => svg.querySelectorAll('rect').length));
      expect(bars.length === 2 && bars.every((count) => count > 20), `laps drawn in the graph: ${bars.join(', ')}`);
      expect(!/\d+%/.test(await page.locator('.carcard').first().innerText()), 'no percentages on the car cards');
      await page.getByRole('button', { name: 'What everything means' }).click();
      const terms = await page.locator('dialog .guide__term').allInnerTexts();
      for (const term of ['Tyre and fuel graph', 'Weather']) expect(terms.includes(term), `"${term}" in the guide: ${terms.join(' / ')}`);
      await page.locator('dialog').getByRole('button', { name: 'Close' }).click();
      await page.locator('dialog .guide').waitFor({ state: 'detached' });

      const engine = page.getByRole('group', { name: /^Engine mode/ });
      await engine.getByRole('button', { name: 'Push' }).click();
      expectEqual(await engine.getByRole('button', { name: 'Push' }).getAttribute('aria-pressed'), 'true', 'engine mode set to push');
      const driver = page.getByRole('group', { name: /^Push level/ });
      await driver.getByRole('button', { name: 'All-out' }).click();
      expectEqual(await driver.getByRole('button', { name: 'All-out' }).getAttribute('aria-pressed'), 'true', 'driver set to all-out');
      expectEqual(await page.locator('.control .stress').count(), 1, 'stress gauge beside the push level');
      await page.getByRole('button', { name: 'Pause' }).click();
      const lap = await page.locator('.race__lap').innerText();
      await page.waitForTimeout(700);
      expectEqual(await page.locator('.race__lap').innerText(), lap, 'the lap while paused');

      await page.getByRole('button', { name: /^Pit/ }).click();
      await page.getByRole('heading', { name: /^Pit stop: / }).waitFor();
      await page.getByRole('radio', { name: /Hard/ }).click();
      await shot(page, '17-race-pit');
      await page.getByRole('button', { name: 'Stop at the end of this lap' }).click();
      await page.getByRole('button', { name: 'Stopping: Hard' }).waitFor();
      await page.getByRole('button', { name: 'Speed 4x' }).click();
      await page.locator('.feed__line', { hasText: 'Pit stop: hard tyres' }).first().waitFor({ timeout: 30000 });
      await shot(page, '18-race-live');
    });

    await check('race: skipping runs it to a full result', async () => {
      await toResult();
      const result = await results();
      expectEqual(result.length, 24, 'cars classified in the 2012 British Grand Prix');
      expect(/^1 \| .+ \| .+ · started \d+(st|nd|rd|th) \| Winner \| \d stops? · 25 pts$/.test(result[0]), `winner's row: "${result[0]}"`);
      expectEqual(await page.locator('.result--mine').count(), 2, 'the two Ferraris marked in the result');
      const facts = await rows('.facts .row');
      expect(facts.some((row) => /^Started first \| .+, 1:[2-5]\d\.\d{3} in qualifying( \(wet\))?$/.test(row)), `pole lap shown: ${facts[0]}`);
      expect(facts.some((row) => /^Overtakes \| \d+(, plus \d+ past a car in trouble)?$/.test(row)), 'overtakes counted');
      expect(facts.some((row) => /^Pit stops \| \d+ in all, on medium, hard tyres$/.test(row)), `tyres of the weekend: ${facts.join(' / ')}`);
      expect(/finished \d+(st|nd|rd|th)|retired/.test(await subtitle()), `how the cars did: "${await subtitle()}"`);
      await shot(page, '19-race-result');
    });

    await check('race: watched without a team, the same race is the same every time; the next is another', async () => {
      const watch = async () => {
        await page.goto(site.url + '#/race/2019/12');
        await page.reload();
        await page.getByRole('button', { name: /Watch without a team/ }).click();
        await page.getByRole('button', { name: 'Start the race' }).click();
        await page.locator('.tower__row').first().waitFor();
        expectEqual(await page.locator('.carcard').count(), 0, 'no car cards when watching');
        await toResult();
        return results();
      };
      const first = await watch();
      expectEqual(first.length, 20, 'cars classified in the 2019 Hungarian Grand Prix');
      expectEqual(await watch(), first, 'race 1, run again from a fresh page');
      await page.getByRole('button', { name: 'Race it again' }).click();
      await page.getByRole('button', { name: 'Start the race' }).click();
      await toResult();
      await page.getByRole('heading', { name: 'Race 2' }).waitFor();
      expect(JSON.stringify(await results()) !== JSON.stringify(first), 'race 2 differs from race 1');
      await page.getByRole('button', { name: 'Almanac' }).click();
      await page.getByRole('heading', { name: 'Season 2019' }).waitFor();
      expectEqual(log, [], 'browser errors in the race');
    });

    // ── 8. Stage 5: a career season ─────────────────────────────────────────────────────────
    const meta = () => page.locator('.topbar__meta').innerText();

    await check('career: a weekend from practice to the standings, with a race kept across a reload', async () => {
      // Still offline from the checks before: a whole weekend needs no network.
      await page.goto(site.url);
      await page.locator('.slots').waitFor();
      await startNewCareer(page, 1, 'McLaren', false);
      expectEqual(await page.locator('.topbar__name').innerText(), 'McLaren', 'team on the home screen');
      expectEqual(await page.locator('.topbar__sub').innerText(), 'Season 2010 · Round 1 of 19', 'where the career starts');
      expectEqual(await page.locator('.row--next .row__label').innerText(), 'Practice', 'first session');
      // Stage 7: the junior academy, with young drivers to sign (the Team tab).
      await page.getByRole('tab', { name: 'Team' }).click();
      await page.getByRole('heading', { name: 'Junior academy' }).waitFor();
      await page.getByRole('button', { name: /^Sign a junior/ }).click();
      expect((await page.locator('dialog .choice').count()) >= 3, 'young drivers to sign');
      await page.locator('dialog .choice').first().click();
      await page.locator('dialog').waitFor({ state: 'detached' });
      expectEqual(await page.locator('section[aria-labelledby="academy"] .person').count(), 1, 'one junior in the academy');
      expectEqual(await page.locator('section[aria-labelledby="people"] .person').count(), 7, 'two drivers and five staff');
      // Stage 6: before the first session, a title sponsor; the team's money is on show.
      await page.getByRole('tab', { name: 'Home' }).click();
      await page.getByRole('heading', { name: 'Before the 2010 season' }).waitFor();
      const startMoney = Number(await page.locator('.glance__money').innerText());
      expect(startMoney > 100, `McLaren's money at the start: ${startMoney}`);
      await shot(page, '20-career-home');
      await page.getByRole('button', { name: 'Sign a title sponsor' }).click();
      expectEqual(await page.locator('dialog .choice').count(), 3, 'three sponsor offers');
      await shot(page, '20b-career-sponsors');
      await page.locator('dialog .choice', { hasText: 'Bold' }).click();
      await page.locator('dialog').waitFor({ state: 'detached' });
      expectEqual(await page.getByRole('heading', { name: 'Before the 2010 season' }).count(), 0, 'nothing left to settle');
      // The car: the field, the parts, and a new version of the aero bought before the season.
      await page.getByRole('tab', { name: 'Car' }).click();
      expectEqual(await page.locator('.part').count(), 3, 'aero, chassis and engine in 2010');
      expectEqual(await page.locator('.part .art').count(), 3, 'a drawing of each part');
      expectEqual(await page.locator('.part .meter').count(), 6, 'a level and a reliability bar for each part');
      expectEqual(await page.locator('.part', { hasText: 'Engine' }).getByRole('button', { name: /^New version/ }).count(), 0, 'a Mercedes customer does not build engines');
      // What a part does, and where it stands, is a tap away.
      await page.locator('.part', { hasText: 'Engine' }).locator('.part__look').click();
      await page.locator('dialog').getByText(/^Built by Mercedes/).waitFor();
      await page.locator('dialog').getByRole('button', { name: 'Close' }).click();
      await page.locator('dialog').waitFor({ state: 'detached' });
      // The money to spend is in sight on the Car tab, and follows each purchase.
      expectEqual(Number(await page.locator('.money-strip__figure').first().innerText()), startMoney, 'money shown on the Car tab');
      await page.locator('.part', { hasText: 'Aero' }).getByRole('button', { name: /^New version/ }).click();
      expectEqual(Number(await page.locator('.money-strip__figure').first().innerText()), Math.round((startMoney - 8) * 10) / 10, 'the Car tab shows the money left');
      expectEqual(await page.locator('.money-strip__change').innerText(), '−8', 'and what the part cost');
      await page.getByRole('tab', { name: 'Home' }).click();
      expectEqual(Number(await page.locator('.glance__money').innerText()), Math.round((startMoney - 8) * 10) / 10, 'a new aero part costs 8');

      await page.getByRole('button', { name: 'Go to practice' }).click();
      await page.getByRole('button', { name: 'Do a run (4 left)' }).click();
      expectEqual(await page.locator('.dial__said').count(), 3, 'feedback on each of the three settings, in words');
      const arrows = (await page.locator('.dial__arrow').count()) + (await page.locator('.dial__spot').count());
      expectEqual(arrows, 3, 'an arrow (or a spot-on mark) on each slider');
      expectEqual(await page.locator('.dial__end').count(), 6, 'a plain line under each end of each setting');
      const wing = page.locator('.dial').first().locator('.dial__value');
      const before = Number((await wing.innerText()).trim());
      await page.getByRole('button', { name: before >= 100 ? 'Wing: towards low drag' : 'Wing: towards downforce' }).click();
      expect(Number((await wing.innerText()).trim()) !== before, 'the wing setting moves');
      await page.getByRole('button', { name: 'Do a run (3 left)' }).waitFor();
      await shot(page, '21-career-practice');
      await page.getByRole('button', { name: 'Finish practice' }).click();

      expectEqual(await meta(), 'Qualifying', 'after practice');
      for (const [part, cars] of [[1, 24], [2, 17], [3, 10]]) {
        await page.getByRole('button', { name: `Run part ${part} (Q${part})` }).click();
        await page.getByRole('heading', { name: `Part ${part} times (Q${part})` }).waitFor();
        expectEqual(await page.locator('.result').count(), cars, `cars timed in ${part}`);
      }
      await shot(page, '22-career-qualifying');
      await page.getByRole('button', { name: 'Continue' }).click();

      expectEqual(await meta(), 'Race', 'after qualifying');
      // The briefing before the lights: the circuit, the sponsor, the character, tyres and weather.
      await page.getByRole('heading', { name: '2010 Bahrain Grand Prix' }).waitFor();
      expectEqual(await page.locator('.briefing__map svg').count(), 1, 'the circuit drawn on the briefing');
      expectEqual(await page.locator('.briefing__part').count(), 3, 'weather for the start, middle and end');
      expect((await page.locator('.briefing .compound').count()) >= 4, 'the tyres on offer, wet ones included');
      expect((await page.locator('.briefing__traits .trait').count()) >= 1, "the circuit's character");
      await page.getByRole('heading', { name: 'Sponsor challenge' }).waitFor();
      await shot(page, '22b-career-briefing');
      await page.getByRole('button', { name: 'To the grid' }).click();
      await page.getByRole('button', { name: 'Start the race' }).click();
      await page.getByRole('button', { name: 'Speed 4x' }).click();
      await page.waitForFunction(() => /Lap ([4-9]|\d\d)/.test(document.querySelector('.race__lap')?.textContent ?? ''), null, { timeout: 30000 });
      await page.getByRole('button', { name: 'Leave' }).click();
      const lapLeft = Number((await page.locator('.race__lap').innerText()).match(/Lap (\d+)/)[1]);
      await page.getByRole('button', { name: 'Leave for now' }).click();
      await page.locator('.hub').waitFor();
      expectEqual(await page.locator('.row--next .row__value').innerText(), 'Under way', 'the race is kept');

      await page.reload();
      await page.getByRole('button', { name: 'Carry on with the race' }).click();
      await page.locator('.race').waitFor();
      const lapBack = Number((await page.locator('.race__lap').innerText()).match(/Lap (\d+)/)[1]);
      expect(lapBack >= lapLeft - 2 && lapBack <= lapLeft, `carried on at lap ${lapBack}, left at lap ${lapLeft}`);
      expectEqual(await page.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed'), 'true', 'a race carried on starts paused');
      await page.getByRole('button', { name: 'Skip to the end' }).click();
      await page.locator('dialog').getByRole('button', { name: 'Skip to the end' }).click();
      await page.getByRole('button', { name: 'Continue' }).waitFor();
      expectEqual(await page.locator('.result--mine').count(), 2, 'the two McLarens in the result');
      await page.getByRole('button', { name: 'Continue' }).click();

      await page.locator('.hub').waitFor();
      await page.getByRole('button', { name: 'Go to the Australian Grand Prix' }).waitFor();
      // Between races: a challenge is on offer, the sponsor has paid, and the car can be worked on.
      expectEqual(await page.locator('[role=radiogroup][aria-label="Sponsor challenge for the next race"] [role=radio]').count(), 3, 'three challenges for the next race');
      await page.locator('[role=radio]').first().click();
      expectEqual(await page.locator('[role=radio][aria-checked=true]').count(), 1, 'a challenge taken on');
      await page.getByRole('tab', { name: 'Money' }).click();
      const books = await page.locator('.money .row__value, .facts .row__value').allInnerTexts();
      expect(books.some((value) => /^\+\d/.test(value)), `money in this season: ${books.join(' / ')}`);
      await page.getByRole('button', { name: 'See the books' }).click();
      const ledger = await page.locator('dialog .row__label').allInnerTexts();
      for (const line of ["Backers' money", 'Prize money', 'Sponsor', "Drivers' salaries"]) expect(ledger.includes(line), `"${line}" in the books: ${ledger.join(' / ')}`);
      await page.locator('dialog').getByRole('button', { name: 'Close' }).click();
      await shot(page, '23-career-between');
      await page.getByRole('tab', { name: 'Car' }).click();
      await page.getByRole('group', { name: 'The car' }).getByRole('button', { name: 'Power units' }).click();
      expectEqual(await page.locator('.unit').count(), 2, 'power units for both cars');
      await page.getByRole('group', { name: 'The car' }).getByRole('button', { name: 'Rankings' }).click();
      expectEqual(await page.locator('#against-field ~ .facts .row').count(), 4, 'the car against the field: four qualities');
      await shot(page, '23b-career-car');
      await page.getByRole('tab', { name: 'Team' }).click();
      await page.getByRole('tab', { name: 'Standings' }).click();
      const points = await page.locator('.standing .standing__points').allInnerTexts();
      expectEqual(points[0], '25', 'points for the win, 2010 rules');
      expectEqual(await page.locator('section[aria-label$="drivers\' championship"] .standing--mine').count(), 2, 'both McLaren drivers marked');
      const teams = page.locator('section[aria-label$="teams\' championship"] .standing__points');
      expect(Number(await teams.first().innerText()) >= 25, 'constructors lead');
      await page.getByRole('tab', { name: 'Calendar' }).click();
      expect(/won · Your cars: /.test(await page.locator('.round').first().innerText()), 'round 1 shows its winner and our result');
      await shot(page, '24-career-calendar');
      await backToCareers(page);
      const [first] = await slotTexts(page);
      expect(/2010 \| McLaren \| Round 1 of 19 · Between races/.test(first), `slot after a weekend: "${first}"`);
    });

    await check('career: a 2023 sprint weekend runs in that year\'s order, with sprint points', async () => {
      const career = {
        id: 'e2e-sprint',
        createdAt: '2026-11-14T10:00:00.000Z',
        team: 'red-bull',
        seasonYear: 2023,
        round: 4,
        phase: 'practice',
        sessionsCompleted: 0,
        finished: false,
        weekend: { setups: {}, practice: null, qualifying: null, sprintQualifying: null, sprint: null, live: null },
        results: [],
        history: [],
      };
      const file = {
        format: 'modern-racing-manager-save',
        schemaVersion: 2,
        appVersion: 'e2e',
        savedAt: '2026-11-14T10:00:00.000Z',
        exportedAt: '2026-11-14T10:00:00.000Z',
        checksum: `crc32:${zlib.crc32(JSON.stringify(career)).toString(16).padStart(8, '0')}`,
        career,
      };
      const sprintFile = path.join(OUT, 'sprint-weekend.json');
      fs.writeFileSync(sprintFile, JSON.stringify(file));
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        slotCard(page, 2).getByRole('button', { name: 'Restore backup' }).click(),
      ]);
      await chooser.setFiles(sprintFile);
      await page.getByText('Career restored to slot 2.').waitFor();
      await slotCard(page, 2).getByRole('button', { name: 'Continue' }).click();
      await page.locator('.hub').waitFor();
      expectEqual(await page.locator('.topbar__sub').innerText(), 'Season 2023 · Round 4 of 22', 'the restored round');
      expectEqual(
        await page.locator('.sessions .row__label').allInnerTexts(),
        ['Practice', 'Qualifying', 'Sprint shootout', 'Sprint', 'Race'],
        'the 2023 sprint weekend',
      );
      // A save from before Stage 6 takes over its team's business, and signs a sponsor first.
      await page.getByRole('tab', { name: 'Team' }).click();
      expectEqual(await page.locator('section[aria-labelledby="people"] .person').count(), 7, 'the upgraded save has drivers and staff');
      await page.getByRole('tab', { name: 'Home' }).click();
      await page.getByRole('button', { name: 'Sign a title sponsor' }).click();
      await page.locator('dialog .choice').first().click();
      await page.locator('dialog').waitFor({ state: 'detached' });
      const order = [];
      for (let step = 0; step < 30 && !(await page.locator('.hub').isVisible().then((hub) => hub && order.length > 0)); step++) {
        if (!(await page.locator('.hub').isVisible())) {
          const title = await meta();
          if (order.at(-1) !== title) order.push(title);
          if (title === 'Sprint result') {
            const winner = (await page.locator('.result').first().innerText()).replace(/\s*\n\s*/g, ' | ');
            expect(/8 pts$/.test(winner), `sprint winner's points: "${winner}"`);
          }
        }
        await page.locator('[data-quick]').click();
        await page.waitForTimeout(150);
      }
      expectEqual(
        order,
        ['Practice', 'Qualifying', 'Sprint shootout', 'Sprint', 'Sprint result', 'Race', 'Race result'],
        'sessions as played',
      );
      await page.getByRole('tab', { name: 'Standings' }).click();
      const leader = Number(await page.locator('.standing .standing__points').first().innerText());
      expect(leader >= 25 && leader <= 34, `leader's points after a sprint weekend: ${leader}`);
      expectEqual(log, [], 'browser errors in the career');
    });

    await check('career: the tutorial shows each tip once, is kept in the save, and can be skipped and replayed', async () => {
      await backToCareers(page);
      await startNewCareer(page, 3, 'Williams', false, true);
      const tip = () => page.locator('dialog.coach .coach__title').innerText();
      expectEqual(await tip(), 'Your team', 'the first tip');
      await shot(page, '25-tutorial-first-tip');
      await page.locator('dialog.coach').getByRole('button', { name: 'Next' }).click();
      await page.waitForFunction(() => document.querySelector('dialog.coach .coach__title')?.textContent === 'First, a sponsor');
      // Read tips are kept with the career: after a reload, the tutorial carries on where it was.
      await page.locator('.topbar__meta', { hasText: /^Saved / }).waitFor();
      await page.reload();
      await page.locator('dialog.coach').waitFor();
      expectEqual(await tip(), 'First, a sponsor', 'the tip after a reload');
      await page.locator('dialog.coach').getByRole('button', { name: 'Skip the tutorial' }).click();
      await page.locator('dialog.coach').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Sign a title sponsor' }).click();
      await page.locator('dialog .choice').first().click();
      await page.locator('dialog').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Go to practice' }).click();
      await page.getByRole('button', { name: 'Finish practice' }).waitFor();
      expectEqual(await page.locator('dialog.coach').count(), 0, 'no tips once skipped');
      await toHub(page);
      // The settings: sound, and the tutorial replayed for this career.
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('heading', { name: 'Settings' }).waitFor();
      await page.getByRole('group', { name: 'Sound effects' }).waitFor();
      await page.getByRole('slider', { name: 'Volume' }).fill('40');
      expectEqual(await page.locator('.volume__value').innerText(), '40', 'the volume follows the slider');
      await page.getByRole('group', { name: 'Sound effects' }).getByRole('button', { name: 'Off' }).click();
      expectEqual(await page.evaluate(() => localStorage.getItem('mrm-sound')), '{"volume":0.4,"muted":true}', 'sound settings kept on the device');
      await page.getByRole('group', { name: 'Sound effects' }).getByRole('button', { name: 'On' }).click();
      await page.locator('.status', { hasText: 'Slot 3' }).getByRole('button', { name: 'Replay tutorial' }).click();
      await page.getByText('The tutorial will show again in Williams.').waitFor();
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.locator('.hub').waitFor();
      await page.locator('dialog.coach').waitFor();
      expectEqual(await tip(), 'Your team', 'the first tip again after a replay');
      await page.locator('dialog.coach').getByRole('button', { name: 'Skip the tutorial' }).click();
      expectEqual(log, [], 'browser errors in the tutorial');
    });

    await context.close();
    await site.close();
  }

  await browser.close();
}

main()
  .catch((error) => {
    failures += 1;
    results.push(`  FAIL  the run itself stopped\n        ${error && error.stack ? error.stack : error}`);
  })
  .finally(() => {
    console.log(`\nEnd-to-end\n${results.join('\n')}\n`);
    console.log(failures ? `${failures} failed.` : `All ${results.length} checks passed. Screenshots: e2e/output/`);
    process.exit(failures ? 1 : 0);
  });
