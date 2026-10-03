import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowsShuffle,
  IconChartBar,
  IconChevronRight,
  IconRefresh,
  IconTopologyStar3,
} from '@tabler/icons-react';
import {
  fetchAnalyticsDashboard,
  type AnalyticsDashboard,
  type AnalyticsGaussianPayload,
  type AnalyticsGraphLink,
} from '../lib/api';
import { cleanError } from '../lib/dates';
import { logScreenView } from '../lib/analytics';
import { useReveal } from '../lib/motion';
import { HistogramCurve, type HistBin } from '../charts/HistogramCurve';
import { ForceGraph } from '../charts/ForceGraph';

const KINDS = {
  gaussian: {
    title: 'Gaussian',
    icon: IconChartBar,
    blurb: 'How the digit sum and log(product) of every winning draw spread out, next to a fitted normal curve.',
  },
  cooccurrence: {
    title: 'Co-occurrence',
    icon: IconTopologyStar3,
    blurb: 'A network of the digits that often appear together in the same draw.',
  },
  cross_draw: {
    title: 'Cross-draw',
    icon: IconArrowsShuffle,
    blurb: 'Which digits in one draw tend to show up in the next draw of the same session.',
  },
} as const;

type Kind = keyof typeof KINDS;

export function AnalyticsHub() {
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope);
  useEffect(() => logScreenView('Analytics'), []);
  return (
    <div className="container page" ref={scope}>
      <header className="page-head" data-reveal>
        <h1>Analytics</h1>
        <p>Charts built from past winning draws. They show history, not what comes next.</p>
      </header>
      <div className="grid-3">
        {(Object.keys(KINDS) as Kind[]).map((k) => {
          const K = KINDS[k];
          return (
            <Link key={k} to={`/analytics/${k}`} className="tile" data-reveal style={{ gridTemplateColumns: 'auto 1fr' }}>
              <span className="tile__icon" aria-hidden>
                <K.icon size={24} />
              </span>
              <span>
                <strong>{K.title}</strong>
                <span>{K.blurb}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 8, color: 'var(--brand-text)', fontWeight: 700 }}>
                  Open <IconChevronRight size={16} aria-hidden />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
      <p className="legal" style={{ marginTop: 'var(--s-8)' }} lang="tl">
        Pampasiyasat lamang — hindi garantiya ng resulta. Ang Cognitive challenge ay hiwalay na laro; walang automated na
        triple na kinukumpara sa lottery draws.
      </p>
    </div>
  );
}

function sumBins(g: AnalyticsGaussianPayload): HistBin[] {
  const n = 28;
  return Array.from({ length: n }, (_, i) => ({
    value: g.sum_histogram?.[i] ?? 0,
    curve: g.sum_normal_curve?.[i]?.y ?? 0,
    tick: i % 3 === 0 ? String(i) : '',
    title: `Digit sum ${i}`,
  }));
}

function logBins(g: AnalyticsGaussianPayload): HistBin[] {
  const hist = g.log_histogram ?? [];
  const range = g.log_histogram_range ?? { min: 0, max: 1, bins: hist.length || 24 };
  const bins = range.bins || hist.length || 1;
  const step = range.max > range.min ? (range.max - range.min) / bins : 1;
  const sig = g.std_log_product > 1e-12 ? g.std_log_product : 1e-12;
  return Array.from({ length: bins }, (_, i) => {
    const center = range.min + (i + 0.5) * step;
    return {
      value: hist[i] ?? 0,
      curve: g.log_normal_curve?.[i]?.y ?? 0,
      tick: i % 4 === 0 ? center.toFixed(1) : '',
      title: `ln(product) ≈ ${center.toFixed(2)}`,
      extra: `z: ${((center - g.mean_log_product) / sig).toFixed(2)}`,
    };
  });
}

function GaussianView({ g }: { g: AnalyticsGaussianPayload | undefined }) {
  const sums = useMemo(() => (g ? sumBins(g) : []), [g]);
  const logs = useMemo(() => (g ? logBins(g) : []), [g]);
  if (!g || g.draws_sampled <= 0 || !(g.sum_histogram?.length > 0)) {
    return (
      <div className="empty">
        <IconChartBar size={40} stroke={1.4} aria-hidden />
        <h3>No draw data yet</h3>
        <p>Import the draw sheet on the API first, then come back to see the charts.</p>
      </div>
    );
  }
  return (
    <div className="stack-lg">
      <dl className="stat-grid" data-reveal>
        <div className="stat">
          <dt>Draws</dt>
          <dd>{g.draws_sampled.toLocaleString()}</dd>
        </div>
        <div className="stat">
          <dt>Mean sum</dt>
          <dd>
            {g.mean_sum.toFixed(2)} <small>σ {g.std_sum.toFixed(2)}</small>
          </dd>
        </div>
        <div className="stat">
          <dt>
            Mean <span className="math">ln(product)</span>
          </dt>
          <dd>
            {g.mean_log_product.toFixed(2)} <small>σ {g.std_log_product.toFixed(2)}</small>
          </dd>
        </div>
        <div className="stat">
          <dt>
            Correlation <span className="math">ρ</span>
          </dt>
          <dd>{g.correlation.toFixed(3)}</dd>
        </div>
      </dl>

      <section className="card" data-reveal aria-labelledby="g-sum">
        <h2 id="g-sum" className="card__title">
          Digit sum (0–27)
        </h2>
        <p className="hint" style={{ margin: '4px 0 16px' }}>
          Add the three digits of each draw. Bars show how often each sum came up. The gold line is a normal curve scaled to
          the same peak.
        </p>
        <HistogramCurve bins={sums} label="Histogram of digit sums with fitted normal curve" />
      </section>

      <section className="card" data-reveal aria-labelledby="g-log">
        <h2 id="g-log" className="card__title">
          Log of the product
        </h2>
        <p className="hint" style={{ margin: '4px 0 16px' }}>
          ln(d₁ × d₂ × d₃) for each draw, grouped into bins, next to a normal curve at each bin centre.
        </p>
        <HistogramCurve bins={logs} label="Histogram of log product with fitted normal curve" />
      </section>
    </div>
  );
}

function mergeCrossDraw(data: AnalyticsDashboard) {
  const g = data.cross_draw_graphs;
  if (!g) return null;
  const weights = new Map<string, number>();
  const nodeSet = new Set<string>();
  let draws = 0;
  for (const k of ['9am', '4pm', '9pm'] as const) {
    const cg = g[k];
    if (!cg?.links.length) continue;
    draws += cg.draws_sampled;
    for (const l of cg.links) {
      const key = `${l.source}|${l.target}`;
      weights.set(key, (weights.get(key) ?? 0) + l.weight);
      nodeSet.add(l.source);
      nodeSet.add(l.target);
    }
  }
  if (!weights.size) return null;
  const links: AnalyticsGraphLink[] = [...weights.entries()]
    .map(([k, weight]) => {
      const [source, target] = k.split('|');
      return { source, target, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 120);
  return {
    nodes: [...nodeSet].sort((a, b) => Number(a) - Number(b)).map((id) => ({ id })),
    links,
    draws,
    pairTypes: weights.size,
  };
}

export function AnalyticsFeature() {
  const { kind } = useParams();
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope, [loading]);

  const valid = kind != null && kind in KINDS;
  const K = valid ? KINDS[kind as Kind] : null;

  useEffect(() => {
    if (valid) logScreenView(`Analytics:${kind}`);
  }, [kind, valid]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAnalyticsDashboard(null));
    } catch (e) {
      setError(cleanError(e, "We couldn't load the charts."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (valid) void load();
  }, [load, valid]);

  const cross = useMemo(() => (data && kind === 'cross_draw' ? mergeCrossDraw(data) : null), [data, kind]);

  if (!K) return <Navigate to="/analytics" replace />;

  const cooc = data?.cooccurrence_graph;

  return (
    <div className="container page" ref={scope}>
      <Link to="/analytics" className="back-link">
        <IconArrowLeft size={18} aria-hidden /> Analytics
      </Link>
      <header className="page-head" data-reveal>
        <h1>{K.title}</h1>
        <p>{K.blurb}</p>
      </header>

      {loading ? (
        <div className="stack" aria-busy="true">
          <div className="skeleton" style={{ height: 90 }} />
          <div className="skeleton" style={{ height: 360 }} />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="notice notice--danger" role="alert">
          <IconAlertTriangle size={22} aria-hidden />
          <div>
            <strong>The charts didn't load</strong>
            <p>{error}</p>
            <div className="notice__actions">
              <button type="button" className="btn" onClick={() => void load()}>
                <IconRefresh size={18} aria-hidden /> Try again
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && data && kind === 'gaussian' ? <GaussianView g={data.gaussian} /> : null}

      {!loading && data && kind === 'cooccurrence' ? (
        <div className="stack-lg">
          <section className="card" data-reveal aria-labelledby="cooc-title">
            <h2 id="cooc-title" className="card__title">
              Digits drawn together
            </h2>
            {cooc && cooc.links.length ? (
              <>
                <p className="hint tnum" style={{ margin: '4px 0 16px' }}>
                  Top {cooc.links_shown} pairs
                  {cooc.pair_types_available != null ? ` of ${cooc.pair_types_available} pair types` : ''} from{' '}
                  {cooc.draws_sampled.toLocaleString()} draws.
                </p>
                <ForceGraph nodes={cooc.nodes} links={cooc.links} label="Co-occurrence network of digits 0 to 9" />
              </>
            ) : (
              <div className="empty" style={{ marginTop: 16 }}>
                <h3>No pairs yet</h3>
                <p>Import the draw sheet on the API first, then come back.</p>
              </div>
            )}
          </section>
          <section className="card explain" data-reveal>
            <div>
              <h3>What this shows</h3>
              <p>
                It answers one question: which digits tend to show up <strong>in the same draw</strong>? For each past
                result we count the three pairs inside it. For example, 8-2-9 adds 8–2, 8–9 and 2–9. The chart keeps the
                strongest pairs so it stays readable.
              </p>
            </div>
            <div>
              <h3>How to read it</h3>
              <ul>
                <li>Each circle is a digit from 0 to 9.</li>
                <li>A line means two digits came up together often. Thicker, darker lines mean higher counts.</li>
                <li>Select a digit to see its partners and their counts.</li>
                <li>This is history only. It is not a forecast.</li>
              </ul>
            </div>
          </section>
        </div>
      ) : null}

      {!loading && data && kind === 'cross_draw' ? (
        <div className="stack-lg">
          <section className="card" data-reveal aria-labelledby="cross-title">
            <h2 id="cross-title" className="card__title">
              From one draw to the next
            </h2>
            {cross ? (
              <>
                <p className="hint tnum" style={{ margin: '4px 0 16px' }}>
                  All sessions combined · {cross.draws.toLocaleString()} draws · {cross.links.length} links shown
                  {cross.pairTypes ? ` of ${cross.pairTypes} pair types` : ''}.
                </p>
                <ForceGraph
                  nodes={cross.nodes}
                  links={cross.links}
                  directed
                  label="Cross-draw transition network of digits 0 to 9"
                />
              </>
            ) : (
              <div className="empty" style={{ marginTop: 16 }}>
                <h3>No transitions yet</h3>
                <p>Import the draw sheet on the API first, then come back.</p>
              </div>
            )}
          </section>
          <section className="card explain" data-reveal>
            <div>
              <h3>What this shows</h3>
              <p>
                It counts how often a digit in one result (draw N) is followed by a digit in the next result (draw N+1) of
                the <strong>same session</strong>: 9 AM, 4 PM or 9 PM. Every digit in draw N is compared with every digit
                in draw N+1, and all three sessions are merged into one network.
              </p>
            </div>
            <div>
              <h3>How to read it</h3>
              <ul>
                <li>Each circle is a digit from 0 to 9.</li>
                <li>Dotted lines link digits that often follow each other. Darker lines mean higher counts.</li>
                <li>Select a digit to see its links, shown as “from → to: count”.</li>
                <li>This is history only. It does not predict future draws.</li>
              </ul>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
