import { useEffect, useState } from 'preact/hooks';
import { goBack } from '../../app/router';
import { app, updateNow } from '../../app/session';
import { useStore } from '../../app/store';
import { checkForUpdate, install, offline, promptInstall } from '../../platform/pwa';
import { readStorage, requestPersistence, type StorageReport } from '../../platform/storage';
import { formatBytes } from '../format';
import { IconBack } from '../icons';

const buildDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
  new Date(__BUILD_TIME__),
);

/** Is this phone ready to be played underground? Offline files, home-screen install, save safety. */
export function SystemScreen() {
  const net = useStore(offline);
  const home = useStore(install);
  const { slots } = useStore(app);
  const [storage, setStorage] = useState<StorageReport | null>(null);

  useEffect(() => {
    let current = true;
    void readStorage().then((report) => {
      if (current) setStorage(report);
    });
    return () => {
      current = false;
    };
  }, []);

  async function protect() {
    await requestPersistence();
    setStorage(await readStorage());
  }

  // The one thing most worth knowing, said first.
  const finding =
    net.status === 'preparing'
      ? 'The game is still downloading for offline play.'
      : net.status !== 'ready'
        ? 'The game is not stored for offline play on this device.'
        : storage?.persistent === false && !home.installed
          ? 'Ready to play offline. Add the app to the home screen to protect its saves.'
          : storage?.persistent === false
            ? 'Ready to play offline. The saves are not yet protected from clean-up.'
            : !home.installed
              ? 'Ready to play offline. Not yet on the home screen.'
              : 'Ready to play with no connection.';

  const careerCount = slots.filter((view) => view.kind !== 'empty').length;
  const saveBytes = slots.reduce((sum, view) => (view.kind === 'empty' ? sum : sum + view.record.bytes), 0);

  return (
    <div class="shell">
      <header class="topbar">
        <div class="topbar__inner">
          <button type="button" class="back" onClick={() => goBack({ screen: 'careers' })}>
            <IconBack />
            Careers
          </button>
        </div>
      </header>

      <main class="canvas">
        <div class="title-row">
          <h1 class="title">System</h1>
          <p class="subtitle" aria-live="polite">
            {finding}
          </p>
        </div>

        <div class="settings">
          <section class="setting" aria-labelledby="system-offline">
            <div class="setting__about">
              <h2 class="setting__title" id="system-offline">
                Offline play
              </h2>
              <p class="setting__text">
                The whole game is stored on the device the first time it opens. After that it never needs the network.
              </p>
            </div>
            <div class="card setting__panel">
              <div class="status">
                <p class="status__title">
                  Game files
                  {net.status === 'ready' && <span class="pill pill--positive">Stored</span>}
                  {net.status === 'preparing' && <span class="pill pill--warning">Downloading</span>}
                  {net.status === 'failed' && <span class="pill pill--negative">Not stored</span>}
                  {net.status === 'unsupported' && <span class="pill">Not available</span>}
                </p>
                <p class="status__text">
                  {net.status === 'ready' && 'Ready to play offline.'}
                  {net.status === 'preparing' && 'Stay online until this says Stored.'}
                  {net.status === 'failed' && 'The download did not finish. Reload the page while online to try again.'}
                  {net.status === 'unsupported' &&
                    'This browser window cannot store the game. Open it from its web address (one starting with https) in an up-to-date browser, not a private window.'}
                </p>
              </div>

              <div class="status status--action">
                <div>
                  <p class="status__title">Version {__APP_VERSION__}</p>
                  <p class="status__text" aria-live="polite">
                    {net.updateWaiting
                      ? 'A newer version is downloaded and ready.'
                      : net.lastCheck === 'checking'
                        ? 'Checking for a newer version.'
                        : net.lastCheck === 'found'
                          ? 'A newer version is downloading.'
                          : net.lastCheck === 'current'
                            ? `Up to date. Built ${buildDate}.`
                            : net.lastCheck === 'unreachable'
                              ? 'Could not check: the device is offline.'
                              : `Built ${buildDate}.`}
                  </p>
                </div>
                {net.updateWaiting ? (
                  <button type="button" class="button button--primary" onClick={() => void updateNow()}>
                    Update now
                  </button>
                ) : (
                  <button
                    type="button"
                    class="button button--secondary"
                    disabled={net.status !== 'ready' || net.lastCheck === 'checking'}
                    onClick={() => void checkForUpdate()}
                  >
                    Check for update
                  </button>
                )}
              </div>
            </div>
          </section>

          <section class="setting" aria-labelledby="system-home">
            <div class="setting__about">
              <h2 class="setting__title" id="system-home">
                Home screen
              </h2>
              <p class="setting__text">
                Installed, the game opens full screen from its own icon, and its saves are better protected from the
                browser's own clean-up.
              </p>
            </div>
            <div class="card setting__panel">
              <div class={`status${home.canPrompt && !home.installed ? ' status--action' : ''}`}>
                <div>
                  <p class="status__title">
                    App
                    {home.installed ? (
                      <span class="pill pill--positive">Installed</span>
                    ) : (
                      <span class="pill">In the browser</span>
                    )}
                  </p>
                  <p class="status__text">
                    {home.installed
                      ? 'Running from the home screen.'
                      : home.needsShareMenu
                        ? 'In Safari, tap Share, then Add to Home Screen.'
                        : home.canPrompt
                          ? 'Add it to this device to play it like any other app.'
                          : 'Open the browser menu and choose Install app or Add to Home screen.'}
                  </p>
                </div>
                {home.canPrompt && !home.installed && (
                  <button type="button" class="button button--secondary" onClick={() => void promptInstall()}>
                    Install
                  </button>
                )}
              </div>
              {home.needsShareMenu && (
                <div class="status">
                  <p class="status__text">
                    On iPhone and iPad the home-screen app keeps its own saves, apart from Safari. To move a career
                    across, back it up to a file in one and restore it in the other.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section class="setting" aria-labelledby="system-saves">
            <div class="setting__about">
              <h2 class="setting__title" id="system-saves">
                Saved careers
              </h2>
              <p class="setting__text">
                Careers live in this browser only and save themselves after every session. A backup file is the one copy
                that survives a lost phone: make one from the menu on a career's slot.
              </p>
            </div>
            <div class="card setting__panel">
              <div class={`status${storage?.persistent === false ? ' status--action' : ''}`}>
                <div>
                  <p class="status__title">
                    Storage
                    {storage?.persistent === true && <span class="pill pill--positive">Protected</span>}
                    {storage?.persistent === false && <span class="pill pill--warning">Not protected</span>}
                  </p>
                  <p class="status__text">
                    {!storage && 'Checking.'}
                    {storage?.persistent === true && 'The browser will not clear the saves on its own.'}
                    {storage?.persistent === false &&
                      'The browser may clear the saves if the device runs short of space. Installing the app usually protects them.'}
                    {storage && storage.persistent === null && 'This browser does not say whether saves are protected.'}
                  </p>
                </div>
                {storage?.persistent === false && (
                  <button type="button" class="button button--secondary" onClick={() => void protect()}>
                    Protect saves
                  </button>
                )}
              </div>
              <dl class="facts">
                <div class="row">
                  <dt class="row__label">Careers</dt>
                  <dd class="row__value">{careerCount} of 3 slots</dd>
                </div>
                <div class="row">
                  <dt class="row__label">Save data</dt>
                  <dd class="row__value">{formatBytes(saveBytes)}</dd>
                </div>
                {storage?.usedBytes != null && (
                  <div class="row">
                    <dt class="row__label">Game and saves on this device</dt>
                    <dd class="row__value">{formatBytes(storage.usedBytes)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>
        </div>

        <p class="smallprint">
          Modern Racing Manager is a personal project, not affiliated with any racing series, team or other game.
        </p>
      </main>
    </div>
  );
}
