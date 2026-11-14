import { useState } from 'preact/hooks';
import { goBack, navigate } from '../../app/router';
import {
  RULES,
  SEASONS,
  SOURCES,
  circuit as circuitById,
  circuitTraits,
  driver as driverById,
  driversBy,
  knockoutCuts,
  seasonData,
  type DriverSeason,
  type Ratings,
  type RoundFact,
  type Rules,
  type TeamSeason,
} from '../../game/data';
import { IconBack, IconForward } from '../icons';
import { Sheet } from '../Sheet';
import { TrackOutline } from '../TrackOutline';

/**
 * STAGE 2 BENCH. The season almanac: everything the game knows about a season, to be checked by
 * eye. Its lists (calendar, teams, drivers) are the ones the game's own screens will reuse.
 */

const TABS = ['Calendar', 'Teams', 'Drivers', 'Rules'] as const;
type Tab = (typeof TABS)[number];

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const raceDay = (iso: string): string => dayMonth.format(new Date(`${iso}T00:00:00Z`));

const RESET_WORDS = { none: 'Rules carried over', minor: 'Rule changes', major: 'Major rules reset' } as const;

export function AlmanacScreen({ season }: { season: number }) {
  const [tab, setTab] = useState<Tab>('Calendar');
  const [round, setRound] = useState<RoundFact | null>(null);
  const [driver, setDriver] = useState<DriverSeason | null>(null);
  const data = seasonData(season);
  const drivers = driversBy(season);
  const pick = (year: number) => navigate({ screen: 'almanac', season: year }, { replace: true });

  const sprints = data.calendar.filter((entry) => entry.sprintLaps !== null).length;
  const unfinished = season === SEASONS[SEASONS.length - 1] && SOURCES.lastSeasonRoundsHeld < data.calendar.length;

  return (
    <div class="shell">
      <header class="topbar">
        <div class="topbar__inner">
          <button type="button" class="back" onClick={() => goBack({ screen: 'careers' })}>
            <IconBack />
            Careers
          </button>
          <span class="topbar__meta">Almanac</span>
        </div>
      </header>

      <main class="canvas">
        <div class="title-row">
          <h1 class="title">Season {season}</h1>
          <p class="subtitle">
            {data.calendar.length} races, {data.teams.length} teams. {RESET_WORDS[data.rules.reset]}.
          </p>
        </div>

        {/* The game's 2010 to 2026 strip, here as the season picker: tap a season, or step with the arrows. */}
        <div class="seasons">
          <button
            type="button"
            class="icon-button"
            aria-label="Previous season"
            disabled={season === SEASONS[0]}
            onClick={() => pick(season - 1)}
          >
            <IconBack />
          </button>
          <div class="seasons__strip" role="group" aria-label="Season">
            {SEASONS.map((year) => (
              <button
                type="button"
                key={year}
                class={`seasons__year${RULES[year]?.reset === 'major' ? ' seasons__year--reset' : ''}${year === season ? ' seasons__year--on' : ''}`}
                aria-label={String(year)}
                aria-current={year === season ? 'true' : undefined}
                onClick={() => pick(year)}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            type="button"
            class="icon-button"
            aria-label="Next season"
            disabled={season === SEASONS[SEASONS.length - 1]}
            onClick={() => pick(season + 1)}
          >
            <IconForward />
          </button>
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
              {name}
            </button>
          ))}
        </div>

        {tab === 'Calendar' && (
          <section class="card card--list" aria-label="Calendar">
            {unfinished && (
              <p class="list-note">
                Results are in to round {SOURCES.lastSeasonRoundsHeld}. Later rounds are as scheduled.
              </p>
            )}
            <ol>
              {data.calendar.map((entry) => {
                const venue = circuitById(entry.circuit);
                return (
                  <li key={entry.round}>
                    <button type="button" class="round" onClick={() => setRound(entry)}>
                      <span class="round__map">
                        <TrackOutline circuit={venue} stroke={5} />
                      </span>
                      <span class="round__text">
                        <span class="round__name">{entry.name}</span>
                        <span class="round__where">
                          {venue.name} · {raceDay(entry.date)}
                        </span>
                      </span>
                      {entry.sprintLaps !== null && <span class="pill">Sprint</span>}
                      <span class="figure round__number">{entry.round}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {sprints > 0 && <p class="list-note">{sprints} sprint weekends.</p>}
          </section>
        )}

        {tab === 'Teams' && (
          <section class="card card--list" aria-label="Teams">
            <ul>
              {[...data.teams]
                .sort((a, b) => (a.real?.gap ?? 99) - (b.real?.gap ?? 99))
                .map((team) => (
                  <li key={team.team}>
                    <TeamRow team={team} />
                  </li>
                ))}
            </ul>
            <p class="list-note">
              In order of real pace: the figure is how far each car's best qualifying lap was from the fastest car, on
              average. Money is the team's spending power in game money
              {data.rules.budgetCap !== null ? `, capped at ${data.rules.budgetCap}` : ''}.
            </p>
          </section>
        )}

        {tab === 'Drivers' && (
          <section class="card card--list" aria-label="Drivers">
            <ul>
              {drivers.map((entry) => (
                <li key={entry.driver.id}>
                  <button type="button" class="driver" onClick={() => setDriver(entry)}>
                    <span class="round__text">
                      <span class="round__name">{entry.driver.name}</span>
                      <span class="round__where">
                        {entry.driver.nationality} · {entry.age}
                      </span>
                    </span>
                    {entry.rookie && <span class="pill">Debut</span>}
                    <span class="figure driver__overall">{entry.overall}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p class="list-note">
              Every real driver who has reached the sport by {season}, rated for this season at the age he is. Who
              still has a seat is for each career to decide.
            </p>
          </section>
        )}

        {tab === 'Rules' && <RulesCard rules={data.rules} cars={data.teams.length * 2} sprints={sprints} />}

        <p class="smallprint">
          Facts from F1DB {SOURCES.f1db}. Ratings, colours and money are the game's own assessments.
        </p>
      </main>

      {round && <RoundSheet round={round} season={season} onClose={() => setRound(null)} />}
      {driver && <DriverSheet entry={driver} season={season} onClose={() => setDriver(null)} />}
    </div>
  );
}

function TeamRow({ team }: { team: TeamSeason }) {
  const names = team.drivers.slice(0, 2).map((entry) => driverById(entry.id).lastName);
  const others = team.drivers.length - 2;
  return (
    <div class="team">
      <span class="team__colour" style={{ background: team.colour }} />
      <span class="round__text">
        <span class="round__name">{team.name}</span>
        <span class="round__where">
          {team.engineName} · {names.join(', ')}
          {others > 0 ? ` +${others}` : ''}
        </span>
      </span>
      <span class="team__figures">
        <span class="figure">{team.real ? (team.real.gap === 0 ? 'Fastest' : `+${team.real.gap.toFixed(2)}%`) : '—'}</span>
        <span class="round__where">{team.spending} money</span>
      </span>
    </div>
  );
}

const ENGINE_WORDS = {
  v8: '2.4 litre V8',
  hybrid: '1.6 litre V6 turbo hybrid',
  'hybrid-2026': '1.6 litre V6 turbo, half the power electric',
} as const;
const RECOVERY_WORDS = { none: 'None', kers: 'KERS boost button', ers: 'Hybrid, with deployment modes' } as const;
const AID_WORDS = { none: 'None', drs: 'DRS', 'active-aero': 'Active aero and overtake boost' } as const;
const SHORT_RACE_WORDS = {
  half: 'Half points below three-quarter distance',
  'scale-if-not-resumed': 'Sliding scale, if stopped and not restarted',
  scale: 'Sliding scale below three-quarter distance',
} as const;

function RulesCard({ rules, cars, sprints }: { rules: Rules; cars: number; sprints: number }) {
  const [first, second] = knockoutCuts(cars);
  const facts: [string, string][] = [
    ['Engine', ENGINE_WORDS[rules.engine]],
    ['Energy recovery', RECOVERY_WORDS[rules.recovery]],
    ['Overtaking aid', AID_WORDS[rules.overtakingAid]],
    ['Engines per car', rules.batteryAllowance === null ? `${rules.engineAllowance}` : `${rules.engineAllowance}, with ${rules.batteryAllowance} batteries`],
    ['Tyres', `${rules.tyreSupplier}, ${rules.compoundsPerRace} dry compounds a race`],
    ['Wheels', `${rules.wheelInches} inch`],
    ['Halo', rules.halo ? 'Yes' : 'No'],
    ['Virtual safety car', rules.virtualSafetyCar ? 'Yes' : 'No'],
    ['Budget cap', rules.budgetCap === null ? 'None' : `${rules.budgetCap}`],
    ['Qualifying', `${cars} cars: ${first} out, ${second} out, 10 for pole`],
    ['Race points', rules.racePoints.join(' ')],
    ['Sprint points', sprints > 0 ? rules.sprintPoints.join(' ') : 'No sprints'],
    ['Fastest lap', rules.fastestLapPoint ? '1 point, for a top-ten finisher' : 'No point'],
    ['Short race', SHORT_RACE_WORDS[rules.shortRace]],
  ];
  if (rules.doublePointsFinale) facts.splice(11, 0, ['Last race', 'Double points']);
  return (
    <>
      {rules.changes.length > 0 && (
        <section class="card stack" aria-labelledby="rules-new">
          <h2 class="card__title" id="rules-new">
            New this season
          </h2>
          <ul class="changes">
            {rules.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </section>
      )}
      <section class="card card--gap" aria-labelledby="rules-all">
        <h2 class="card__title" id="rules-all">
          The rules
        </h2>
        <dl class="facts">
          {facts.map(([label, value]) => (
            <div class="row" key={label}>
              <dt class="row__label">{label}</dt>
              <dd class="row__value">{value}</dd>
            </div>
          ))}
        </dl>
        <div class="compounds" aria-label="Dry tyre compounds, softest first">
          {rules.dryCompounds.map((compound) => (
            <span class="compound" key={compound.name}>
              <span class="compound__ring" style={{ borderColor: compound.colour }} />
              {compound.name}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}

const SCALE_WORDS = ['', 'Very low', 'Low', 'Medium', 'High', 'Very high'];
const percent = (value: number): string => `${Math.round(value * 100)}%`;

function RoundSheet({ round, season, onClose }: { round: RoundFact; season: number; onClose: () => void }) {
  const venue = circuitById(round.circuit);
  const traits = circuitTraits(round.circuit);
  const facts: [string, string][] = [
    ['Circuit', `${venue.fullName}, ${venue.country}`],
    ['Race', `${round.laps} laps of ${round.lapKm.toFixed(3)} km`],
    ['Layout', `${round.turns} turns, ${venue.direction}, ${venue.type === 'permanent' ? 'permanent circuit' : `${venue.type} circuit`}`],
    ['Power matters', SCALE_WORDS[traits.power]!],
    ['Downforce matters', SCALE_WORDS[traits.downforce]!],
    ['Tyre wear', SCALE_WORDS[traits.tyreWear]!],
    ['Overtaking', SCALE_WORDS[traits.overtaking]!],
    ['Safety car', percent(traits.safetyCar)],
    ['Rain', percent(traits.rain)],
  ];
  if (round.sprintLaps !== null) facts.splice(2, 0, ['Sprint', `${round.sprintLaps} laps`]);
  return (
    <Sheet title={`${season} ${round.name}`} onClose={onClose}>
      <div class="sheet__map">
        <TrackOutline circuit={venue} stroke={2.2} />
      </div>
      {venue.outlineSource === 'sketched' && (
        <p class="notice">This outline is a rough hand sketch, not a survey. See the Stage 2 notes.</p>
      )}
      <dl class="facts facts--tight">
        {facts.map(([label, value]) => (
          <div class="row" key={label}>
            <dt class="row__label">{label}</dt>
            <dd class="row__value">{value}</dd>
          </div>
        ))}
      </dl>
      <div class="sheet__actions">
        <button
          type="button"
          class="button button--block button--primary"
          onClick={() => {
            onClose();
            navigate({ screen: 'race', season, round: round.round });
          }}
        >
          Race this round
        </button>
        <button type="button" class="button button--block button--secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}

const RATING_NAMES: [keyof Ratings, string][] = [
  ['pace', 'Pace'],
  ['racecraft', 'Racecraft'],
  ['consistency', 'Consistency'],
  ['tyres', 'Tyre management'],
  ['wet', 'Wet skill'],
  ['aggression', 'Aggression'],
];

function DriverSheet({ entry, season, onClose }: { entry: DriverSeason; season: number; onClose: () => void }) {
  const { driver } = entry;
  return (
    <Sheet title={driver.name} onClose={onClose}>
      <p class="sheet__text">
        {driver.nationality}, {entry.age} in {season}. First race {driver.debut}
        {entry.rookie ? ', this season' : ''}.
      </p>
      <dl class="ratings">
        {RATING_NAMES.map(([key, label]) => (
          <div class="rating" key={key}>
            <dt>{label}</dt>
            <dd>
              <span class="rating__track">
                <span class="rating__fill" style={{ width: `${entry.ratings[key]}%` }} />
              </span>
              <span class="figure rating__value">{entry.ratings[key]}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div class="sheet__actions">
        <button type="button" class="button button--block button--secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
