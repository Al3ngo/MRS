import { useEffect, useState } from 'preact/hooks';
import { goBack, navigate } from '../../app/router';
import { app, autosave, enterCareer, leaveCareer, startCareer, updateCareer } from '../../app/session';
import { useStore } from '../../app/store';
import {
  LAST_SEASON,
  careerTotals,
  chooseTeam,
  finishManagement,
  preseasonOpen,
  roundsIn,
  seasonRecord,
  type CareerState,
  type SeasonRecord,
} from '../../game/career';
import { calendar, circuit as circuitById, rulesFor, teamsIn } from '../../game/data';
import { causeLabel } from '../race/words';
import { driverStandings, teamStandings, type RoundResult } from '../../game/season/standings';
import { sessionName, weekendSessions } from '../../game/season/weekend';
import type { SlotId } from '../../platform/saves';
import { formatClock } from '../format';
import { IconBack } from '../icons';
import { ordinal } from '../race/Result';
import { ConfirmSheet } from '../Sheet';
import { TrackOutline } from '../TrackOutline';
import { driverCode, driverLast, driverName, teamLabel } from '../career/names';

/** "1 pt", "25 pts". */
const points = (value: number): string => `${Number.isInteger(value) ? value : value.toFixed(1)} ${value === 1 ? 'pt' : 'pts'}`;

/** How a season pays: "25 points for a win, down to 1 for tenth." */
function pointsRule(season: number): string {
  const table = rulesFor(season).racePoints;
  return `Each race pays ${table[0]} points for a win, down to ${table.at(-1)} for ${ordinal(table.length)}.`;
}
import { StandingsTable } from '../career/Standings';
import { MoneyCard, NewsCard, PeopleCard, SponsorCard } from '../career/Business';
import { Garage } from '../career/Garage';
import { WinterCard, WinterSheets, type WinterSheet } from '../career/Winter';

/**
 * A career's home: the team, the round in progress, the calendar and the championships. Between
 * races it is the management phase; the sessions of a weekend open on their own screen.
 */

const TABS = ['Weekend', 'Car', 'Calendar', 'Standings'] as const;
type Tab = (typeof TABS)[number];

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const raceDay = (iso: string): string => dayMonth.format(new Date(`${iso}T00:00:00Z`));

export function CareerScreen({ slot }: { slot: SlotId }) {
  const { active } = useStore(app);
  const [tab, setTab] = useState<Tab>('Weekend');

  useEffect(() => {
    void enterCareer(slot);
    return () => {
      void leaveCareer();
    };
  }, [slot]);

  const mine = active?.slot === slot ? active : null;
  const career = mine?.career ?? null;
  const record = mine?.record ?? null;
  const saveLine = !mine
    ? ''
    : mine.saveError
      ? 'Not saved'
      : mine.pendingSaves > 0
        ? 'Saving'
        : record
          ? `Saved ${formatClock(record.savedAt)}`
          : '';
  const colour = career?.team ? teamLabel(career.team, career.seasonYear).colour : undefined;

  return (
    <div class="shell" style={colour ? { '--accent': colour } : undefined}>
      <header class="topbar">
        <div class="topbar__inner">
          <button type="button" class="back" onClick={() => goBack({ screen: 'careers' })}>
            <IconBack />
            Careers
          </button>
          <span class="topbar__meta" aria-live="polite">
            {saveLine}
          </span>
        </div>
      </header>

      {mine?.saveError && (
        <div class="canvas canvas--notice">
          <div class="notice notice--problem bench__retry">
            <p class="selectable">{mine.saveError}</p>
            <button type="button" class="button button--secondary" onClick={() => void autosave()}>
              Save again
            </button>
          </div>
        </div>
      )}

      {career && career.team === null && <TeamChoice career={career} />}
      {career && career.team !== null && (
        <Hub slot={slot} career={career} team={career.team} tab={tab} setTab={setTab} />
      )}
    </div>
  );
}

// ── Choosing the team ───────────────────────────────────────────────────────────────────────

function TeamChoice({ career }: { career: CareerState }) {
  const [picked, setPicked] = useState<string | null>(null);
  const teams = [...teamsIn(career.seasonYear)].sort((a, b) => (a.real?.gap ?? 99) - (b.real?.gap ?? 99));
  const chosen = teams.find((team) => team.team === picked);
  return (
    <main class="canvas" data-sessions={career.sessionsCompleted}>
      <div class="title-row">
        <h1 class="title">Choose your team</h1>
        <p class="subtitle">
          Season {career.seasonYear}. The team is yours for the whole career, to the end of {LAST_SEASON}.
        </p>
      </div>
      <section class="card card--list" aria-label="Teams">
        <ul>
          {teams.map((team) => (
            <li key={team.team}>
              <button type="button" class="team team--pick" onClick={() => setPicked(team.team)}>
                <span class="team__colour" style={{ background: team.colour }} />
                <span class="round__text">
                  <span class="round__name">{team.name}</span>
                  <span class="round__where">
                    {team.engineName} · {team.drivers.slice(0, 2).map((entry) => driverLast(entry.id)).join(', ')}
                  </span>
                  <span class="round__where">{team.style.charAt(0).toUpperCase() + team.style.slice(1)} race style</span>
                </span>
                <span class="team__figures">
                  <span class="figure">
                    {team.real ? (team.real.gap === 0 ? 'Fastest' : `+${team.real.gap.toFixed(2)}%`) : '—'}
                  </span>
                  <span class="round__where">{team.spending} money</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p class="list-note">
          In order of real pace that season: how far each car's best qualifying lap was from the fastest car. Race style is how a team runs its cars in a race: aggressive teams push hard and gamble on tyres and weather, balanced ones pick their moments, cautious ones look after the car, the driver and the tyres. Your own team follows its style only for a car you hand over to the team during a race.
        </p>
      </section>
      {chosen && (
        <ConfirmSheet
          title={`Run ${chosen.name}?`}
          lines={[
            `You start the ${career.seasonYear} season with ${chosen.drivers
              .slice(0, 2)
              .map((entry) => driverName(entry.id))
              .join(' and ')}.`,
            'The team is yours for the whole career. There is no changing it later.',
          ]}
          confirmLabel={`Start with ${chosen.name}`}
          cancelLabel="Look again"
          onConfirm={() => {
            setPicked(null);
            void updateCareer((current) => chooseTeam(current, chosen.team));
          }}
          onCancel={() => setPicked(null)}
        />
      )}
    </main>
  );
}

// ── The hub ─────────────────────────────────────────────────────────────────────────────────

function Hub({
  slot,
  career,
  team,
  tab,
  setTab,
}: {
  slot: SlotId;
  career: CareerState;
  team: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
}) {
  const { seasonYear: season } = career;
  const label = teamLabel(team, season);
  const between = career.phase === 'management';
  const lastSeason = between && career.round === roundsIn(season);
  const [winter, setWinter] = useState<WinterSheet>(null);
  const winterOpen = preseasonOpen(career);

  let action: { label: string; run: () => void } | null = null;
  if (winterOpen && career.outfit) {
    const step = career.outfit.preseason[0]!;
    action = {
      label: step === 'contracts' ? 'Sign drivers and staff' : step === 'engine' ? 'Choose an engine supplier' : 'Sign a title sponsor',
      run: () => setWinter(step),
    };
  } else if (!between) {
    const live = career.weekend.live !== null;
    action = {
      label: live ? `Carry on with the ${career.phase === 'sprint' ? 'sprint' : 'race'}` : `Go to ${sessionName(season, career.phase).toLowerCase()}`,
      run: () => navigate({ screen: 'weekend', slot }),
    };
  } else if (!career.finished) {
    const next = lastSeason ? null : calendar(season)[career.round]!;
    action = {
      label: next ? `Go to the ${next.name}` : `Start the ${season + 1} season`,
      run: () => {
        void updateCareer(finishManagement);
        if (next) navigate({ screen: 'weekend', slot });
        else window.scrollTo(0, 0);
      },
    };
  }

  return (
    <>
      <main class={`canvas${action ? ' canvas--above-bar' : ''} hub`} data-sessions={career.sessionsCompleted}>
        <div class="title-row">
          <h1 class="title">{label.name}</h1>
          <p class="subtitle">
            {career.finished ? `Career complete, ${season}` : `Season ${season} · Round ${career.round} of ${roundsIn(season)}`}
          </p>
        </div>

        <div class="tabs" role="tablist">
          {TABS.map((name) => (
            <button
              type="button"
              key={name}
              role="tab"
              aria-selected={name === tab}
              class={`tab${name === tab ? ' tab--on' : ''}`}
              onClick={() => setTab(name)}
            >
              {name === 'Weekend' && between ? 'Team' : name}
            </button>
          ))}
        </div>

        {tab === 'Weekend' && !between && (
          <div class="stack">
            <WinterCard career={career} open={setWinter} />
            <ThisWeekend career={career} />
            <SponsorCard career={career} />
            <MoneyCard career={career} />
            <PeopleCard career={career} />
          </div>
        )}
        {tab === 'Car' && <Garage career={career} />}
        {tab === 'Weekend' && between && career.finished && <CareerSummary slot={slot} career={career} team={team} />}
        {tab === 'Weekend' && between && !career.finished && (
          <BetweenRaces career={career} team={team} seasonOver={lastSeason} />
        )}
        {tab === 'Calendar' && <Calendar career={career} team={team} />}
        {tab === 'Standings' && <Championships career={career} team={team} />}
      </main>

      {winter && <WinterSheets career={career} sheet={winter} close={() => setWinter(null)} />}

      {action && (tab === 'Weekend' || winterOpen) && (
        <div class="actionbar">
          <div class="actionbar__inner">
            <button type="button" class="button button--primary" data-quick onClick={action.run}>
              {action.label}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ThisWeekend({ career }: { career: CareerState }) {
  const { seasonYear: season } = career;
  const round = calendar(season)[career.round - 1]!;
  const venue = circuitById(round.circuit);
  const sessions = weekendSessions(season, career.round).filter((kind) => kind !== 'management');
  const at = (sessions as readonly string[]).indexOf(career.phase);
  return (
    <section class="card weekend" aria-labelledby="this-weekend">
      <div class="weekend__head">
        <span class="weekend__map">
          <TrackOutline circuit={venue} stroke={4} />
        </span>
        <span class="round__text">
          <h2 class="card__title" id="this-weekend">
            {round.name}
          </h2>
          <span class="round__where">
            {venue.name} · {raceDay(round.date)} · {round.laps} laps
          </span>
        </span>
      </div>
      <ol class="sessions">
        {sessions.map((kind, index) => {
          const state = index < at ? 'done' : index === at ? 'next' : 'later';
          return (
            <li key={kind} class={`row row--${state}`}>
              <span class="row__label">{sessionName(season, kind)}</span>
              <span class="row__value">
                {state === 'done' ? 'Done' : state === 'next' ? (career.weekend.live ? 'Under way' : 'Next') : ''}
              </span>
            </li>
          );
        })}
      </ol>
      {round.sprintLaps !== null && (
        <p class="muted">
          A sprint weekend: as well as the Grand Prix there is a sprint, a short race of {round.sprintLaps} laps that pays
          points to the top {rulesFor(season).sprintPoints.length}.
        </p>
      )}
      <ResultsSoFar career={career} />
    </section>
  );
}

/** The sprint's result on a sprint weekend, once it has been run. */
function ResultsSoFar({ career }: { career: CareerState }) {
  const sprint = career.weekend.sprint;
  if (!sprint || !career.team) return null;
  const ours = sprint.filter((finish) => finish.team === career.team);
  return (
    <p class="muted">
      Sprint: {ours.map((finish) => `${driverLast(finish.driver)} ${finish.classified ? ordinal(finish.position) : causeLabel(finish.status).toLowerCase()}`).join(', ')}.
      Won by {driverName(sprint[0]!.driver)}.
    </p>
  );
}

function finishWords(position: number, classified: boolean, status: string): string {
  return classified ? ordinal(position) : causeLabel(status);
}

function BetweenRaces({ career, team, seasonOver }: { career: CareerState; team: string; seasonOver: boolean }) {
  const { seasonYear: season } = career;
  const last = career.results.at(-1);
  const round = calendar(season)[career.round - 1]!;
  const drivers = driverStandings(career.results);
  const teams = teamStandings(career.results);
  const ourTeam = teams.find((row) => row.id === team);
  const next = seasonOver ? null : calendar(season)[career.round]!;

  return (
    <div class="stack">
      <NewsCard career={career} />
      {last && (
        <section class="card" aria-labelledby="last-round">
          <h2 class="card__title" id="last-round">
            {round.name}
          </h2>
          <dl class="facts facts--tight">
            {last.race
              .filter((finish) => finish.team === team)
              .map((finish) => (
                <div class="row" key={finish.driver}>
                  <dt class="row__label">{driverName(finish.driver)}</dt>
                  <dd class="row__value">
                    {finishWords(finish.position, finish.classified, finish.status)}
                    {finish.points > 0 ? `, ${points(finish.points)}` : ''}
                  </dd>
                </div>
              ))}
            <div class="row">
              <dt class="row__label">Winner</dt>
              <dd class="row__value">
                {driverName(last.race[0]!.driver)}, {teamLabel(last.race[0]!.team, season).name}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <MoneyCard career={career} />

      {seasonOver ? (
        <SeasonReview record={seasonRecord(career)} team={team} />
      ) : (
        <section class="card card--list" aria-labelledby="table-now">
          <h2 class="card__title card__title--list" id="table-now">
            Teams' championship{ourTeam ? `: you are ${ordinal(ourTeam.position)}` : ''}
          </h2>
          <StandingsTable rows={teams} kind="teams" season={season} team={team} limit={5} label="Teams' championship" />
          <h2 class="card__title card__title--list">Drivers' championship</h2>
          <StandingsTable rows={drivers} kind="drivers" season={season} team={team} limit={5} label="Drivers' championship" />
        </section>
      )}

      {next && (
        <section class="card weekend" aria-labelledby="next-round">
          <div class="weekend__head">
            <span class="weekend__map">
              <TrackOutline circuit={circuitById(next.circuit)} stroke={4} />
            </span>
            <span class="round__text">
              <h2 class="card__title" id="next-round">
                Next: {next.name}
              </h2>
              <span class="round__where">
                {circuitById(next.circuit).name} · {raceDay(next.date)}
                {next.sprintLaps !== null ? ' · Sprint weekend' : ''}
              </span>
            </span>
          </div>
        </section>
      )}

      {!seasonOver && <SponsorCard career={career} />}
      <PeopleCard career={career} />
      <p class="smallprint">Between races: the Car tab is where the car is developed.</p>
    </div>
  );
}

function SeasonReview({ record, team }: { record: SeasonRecord; team: string }) {
  const champion = record.drivers[0]!;
  const constructors = record.teams[0]!;
  const ours = record.teams.find((row) => row.id === team);
  const ourDrivers = record.drivers.filter((row) => row.team === team);
  return (
    <section class="card" aria-labelledby="season-review">
      <h2 class="card__title" id="season-review">
        The {record.season} season is over
      </h2>
      <dl class="facts facts--tight">
        <div class="row">
          <dt class="row__label">Champion driver</dt>
          <dd class="row__value">
            {driverName(champion.id)}, {points(champion.points)}
          </dd>
        </div>
        <div class="row">
          <dt class="row__label">Champion team</dt>
          <dd class="row__value">
            {teamLabel(constructors.id, record.season).name}, {points(constructors.points)}
          </dd>
        </div>
        {ours && (
          <div class="row">
            <dt class="row__label">{record.teamName}</dt>
            <dd class="row__value">
              {ordinal(ours.position)}, {points(ours.points)}
            </dd>
          </div>
        )}
        {ourDrivers.map((row) => (
          <div class="row" key={row.id}>
            <dt class="row__label">{driverName(row.id)}</dt>
            <dd class="row__value">
              {ordinal(row.position)}, {points(row.points)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CareerSummary({ slot, career, team }: { slot: SlotId; career: CareerState; team: string }) {
  const [confirm, setConfirm] = useState(false);
  const totals = careerTotals(career);
  const { seasons } = totals;
  return (
    <div class="stack">
      <section class="card" aria-labelledby="career-summary">
        <h2 class="card__title" id="career-summary">
          Career complete
        </h2>
        <p class="muted">
          {seasons.length} seasons with {teamLabel(team, career.seasonYear).name}, from {seasons[0]!.season} to{' '}
          {career.seasonYear}.
        </p>
        <dl class="facts facts--tight">
          <div class="row">
            <dt class="row__label">Teams' championships won</dt>
            <dd class="row__value">{totals.teamTitles}</dd>
          </div>
          <div class="row">
            <dt class="row__label">Drivers' championships won</dt>
            <dd class="row__value">{totals.driverTitles}</dd>
          </div>
          <div class="row">
            <dt class="row__label">Wins</dt>
            <dd class="row__value">{totals.wins}</dd>
          </div>
          <div class="row">
            <dt class="row__label">Top-three finishes</dt>
            <dd class="row__value">{totals.podiums}</dd>
          </div>
          <div class="row">
            <dt class="row__label">Best season</dt>
            <dd class="row__value">{totals.bestPlace !== null ? `${ordinal(totals.bestPlace)} among the teams` : '—'}</dd>
          </div>
        </dl>
      </section>
      <PastSeasons seasons={seasons} team={team} />
      <button type="button" class="button button--secondary button--block" onClick={() => setConfirm(true)}>
        Start a new career in this slot
      </button>
      {confirm && (
        <ConfirmSheet
          title="Start a new career?"
          lines={[
            'This career is replaced by a new one, starting in 2010. Make a backup from the Careers screen first if you want to keep it.',
          ]}
          confirmLabel="Start a new career"
          tone="danger"
          onConfirm={() => {
            setConfirm(false);
            void startCareer(slot);
          }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

function PastSeasons({ seasons, team }: { seasons: readonly SeasonRecord[]; team: string }) {
  if (seasons.length === 0) return null;
  return (
    <section class="card card--list" aria-labelledby="past-seasons">
      <h2 class="card__title card__title--list" id="past-seasons">
        Past seasons
      </h2>
      <ol>
        {[...seasons].reverse().map((record) => {
          const ours = record.teams.find((row) => row.id === team);
          return (
            <li key={record.season}>
              <div class="result">
                <span class="figure history__season">{record.season}</span>
                <span class="round__text">
                  <span class="round__name">{driverName(record.drivers[0]!.id)}</span>
                  <span class="round__where">
                    Champion team: {teamLabel(record.teams[0]!.id, record.season).name}
                  </span>
                </span>
                <span class="team__figures">
                  <span class="figure">{ours ? ordinal(ours.position) : '—'}</span>
                  <span class="round__where">{ours ? points(ours.points) : ''}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Calendar({ career, team }: { career: CareerState; team: string }) {
  const { seasonYear: season } = career;
  const results = new Map<number, RoundResult>(career.results.map((result) => [result.round, result]));
  return (
    <section class="card card--list" aria-label={`Calendar ${season}`}>
      <ol>
        {calendar(season).map((round) => {
          const result = results.get(round.round);
          const current = round.round === career.round && career.phase !== 'management';
          const winner = result?.race[0];
          const ours = result?.race.filter((finish) => finish.team === team) ?? [];
          return (
            <li key={round.round}>
              <div class={`round${current ? ' round--now' : ''}`}>
                <span class="figure round__number round__number--left">{round.round}</span>
                <span class="round__text">
                  <span class="round__name">{round.name}</span>
                  <span class="round__where">
                    {winner
                      ? `${driverLast(winner.driver)} won · Your cars: ${ours.map((finish) => (finish.classified ? ordinal(finish.position) : 'retired')).join(', ')}`
                      : `${circuitById(round.circuit).name} · ${raceDay(round.date)}`}
                  </span>
                </span>
                {round.sprintLaps !== null && <span class="pill">Sprint</span>}
                {current && <span class="pill pill--positive">Next</span>}
                {winner && (
                  <span class="figure calendar__winner" style={{ color: teamLabel(winner.team, season).colour }}>
                    {driverCode(winner.driver)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Championships({ career, team }: { career: CareerState; team: string }) {
  const [kind, setKind] = useState<'drivers' | 'teams'>('drivers');
  const { seasonYear: season } = career;
  const rows = kind === 'drivers' ? driverStandings(career.results) : teamStandings(career.results);
  return (
    <div class="stack">
      <div class="segmented" role="group" aria-label="Championship">
        {(['drivers', 'teams'] as const).map((option) => (
          <button
            type="button"
            key={option}
            class={`segmented__option${kind === option ? ' segmented__option--on' : ''}`}
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
          >
            {option === 'drivers' ? 'Drivers' : 'Teams'}
          </button>
        ))}
      </div>
      <section class="card card--list" aria-label={`${season} ${kind === 'drivers' ? "drivers'" : "teams'"} championship`}>
        <StandingsTable
          rows={rows}
          kind={kind}
          season={season}
          team={team}
          label={kind === 'drivers' ? "Drivers' championship" : "Teams' championship"}
        />
        <p class="list-note">
          After {career.results.length} of {roundsIn(season)} rounds. {pointsRule(season)}
          {career.results.some((result) => result.sprint) ? ' Sprints pay points too.' : ''}
          {kind === 'teams' ? " The teams' championship (officially the constructors') adds up both cars' points." : ''}
        </p>
      </section>
      <PastSeasons seasons={career.history} team={team} />
    </div>
  );
}
