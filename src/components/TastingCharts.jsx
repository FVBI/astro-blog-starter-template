import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from 'recharts';

const PALETTE = [
  '#CC6677', '#332288', '#DDCC77', '#117733', '#88CCEE',
  '#882255', '#44AA99', '#999933', '#AA4499', '#DDDDDD',
];

// --- CSV loading with module-level cache (one fetch per page load) ---

let _csvPromise = null;

const loadCSV = async () => {
  const response = await fetch('/data/Lecker Schmecker Ergebnisse.csv');
  const text = await response.text();
  const lines = text.split('\n').filter(line => line.trim());
  const headers = lines[0].split(';').map(h => h.trim());

  return lines.slice(1).map(line => {
    const cells = line.split(';').map(c => c.trim());
    const row = {};
    headers.forEach((header, i) => {
      const value = cells[i];
      const normalized = value?.replace(/[€\s]/g, '').replace(',', '.');
      if (normalized && !isNaN(normalized)) {
        row[header] = parseFloat(normalized);
      } else {
        row[header] = value || null;
      }
    });
    return row;
  }).filter(row => row.Subject && row.Brand);
};

const getCSV = () => {
  if (!_csvPromise) _csvPromise = loadCSV();
  return _csvPromise;
};

// --- Data helpers ---

const getRaterCols = (data) => {
  if (data.length === 0) return [];
  const metaCols = new Set(['Date', 'Number', 'Subject', 'ID', 'Symbol', 'Brand', 'Price', 'Comment', 'Average', '⌀', 'Sum']);
  return Object.keys(data[0]).filter(col => !metaCols.has(col) && typeof data[0][col] === 'number');
};

const filterBySubject = (data, subject) =>
  data.filter(row => row.Subject === subject);

const aggregateByBrand = (data, raters) => {
  const brands = {};
  data.forEach(row => {
    if (!brands[row.Brand]) {
      brands[row.Brand] = { Brand: row.Brand, Price: row.Price || null, scores: [] };
    }
    raters.forEach(rater => {
      if (row[rater] != null) brands[row.Brand].scores.push(row[rater]);
    });
  });

  return Object.values(brands).map((b, idx) => ({
    ...b,
    Sum: b.scores.reduce((a, v) => a + v, 0),
    Average: b.scores.length > 0 ? b.scores.reduce((a, v) => a + v, 0) / b.scores.length : 0,
    fill: PALETTE[idx % PALETTE.length],
  })).sort((a, b) => a.Sum - b.Sum);
};

const calculateRaterDeviation = (rawData, raters) => {
  const raterAbsDeviations = {};
  raters.forEach(r => raterAbsDeviations[r] = []);

  rawData.forEach(row => {
    const rowScores = raters.map(r => row[r]).filter(v => v != null);
    if (rowScores.length === 0) return;
    const sorted = [...rowScores].sort((a, b) => a - b);
    const groupMedian = sorted[Math.floor(sorted.length / 2)];
    raters.forEach(rater => {
      if (row[rater] != null) {
        raterAbsDeviations[rater].push(Math.abs(row[rater] - groupMedian));
      }
    });
  });

  return Object.entries(raterAbsDeviations)
    .filter(([, deviations]) => deviations.length > 0)
    .map(([rater, deviations], idx) => ({
      Rater: rater,
      Deviation: parseFloat((deviations.reduce((a, v) => a + v, 0) / deviations.length).toFixed(2)),
      fill: PALETTE[idx % PALETTE.length],
    }))
    .sort((a, b) => a.Rater.localeCompare(b.Rater));
};

const computeBoxStats = (rawData, raters, brandOrder) => {
  const brandScores = {};
  rawData.forEach(row => {
    if (!brandScores[row.Brand]) brandScores[row.Brand] = [];
    raters.forEach(rater => {
      if (row[rater] != null) brandScores[row.Brand].push(row[rater]);
    });
  });

  const stats = Object.entries(brandScores).map(([brand, scores]) => {
    const sorted = [...scores].sort((a, b) => a - b);
    const n = sorted.length;
    const percentile = (p) => {
      const pos = (n - 1) * p;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    return {
      Brand: brand,
      min: sorted[0],
      q1: percentile(0.25),
      median: percentile(0.5),
      q3: percentile(0.75),
      max: sorted[n - 1],
    };
  });

  const ordered = brandOrder
    ? brandOrder.map(({ Brand, fill }) => ({ ...stats.find(s => s.Brand === Brand), fill })).filter(s => s.min != null)
    : stats.map((s, idx) => ({ ...s, fill: PALETTE[idx % PALETTE.length] }));

  return ordered;
};

// --- Shared data hook ---

const useTastingData = (subject) => {
  const [state, setState] = useState({ filtered: [], raters: [], aggregated: [], deviations: [], loading: true, error: null });

  useEffect(() => {
    getCSV()
      .then(all => {
        const filtered = filterBySubject(all, subject);
        const raters = getRaterCols(filtered);
        setState({
          filtered,
          raters,
          aggregated: aggregateByBrand(filtered, raters),
          deviations: calculateRaterDeviation(filtered, raters),
          loading: false,
          error: null,
        });
      })
      .catch(err => setState(s => ({ ...s, loading: false, error: err.message })));
  }, [subject]);

  return state;
};

// --- Internal chart renderers ---

const BarChartSum = ({ data }) => (
  <div className="chart-container">
    <h3>Gesamtpunkte pro Marke</h3>
    <ResponsiveContainer width="100%" height={450}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="Brand" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="Sum" fillOpacity={0.35}>
          {data.map(entry => <Cell key={entry.Brand} fill={entry.fill} stroke={entry.fill} strokeWidth={1.5} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const BoxPlotShape = (props) => {
  const { x, width, payload, background } = props;
  if (!payload || !background) return null;
  const { min, q1, median, q3, max, fill } = payload;

  const chartBottom = background.y + background.height;
  const ppu = background.height / 10;
  const toY = (v) => chartBottom - v * ppu;

  const cx = x + width / 2;
  const boxW = Math.max(width * 0.5, 8);
  const whW = boxW * 0.5;
  const color = fill || '#CC6677';

  return (
    <g>
      <line x1={cx} y1={toY(max)} x2={cx} y2={toY(q3)} stroke={color} strokeWidth={1.5} />
      <line x1={cx - whW / 2} y1={toY(max)} x2={cx + whW / 2} y2={toY(max)} stroke={color} strokeWidth={1.5} />
      <rect
        x={cx - boxW / 2} y={toY(q3)}
        width={boxW} height={Math.max(toY(q1) - toY(q3), 1)}
        fill={color} fillOpacity={0.35} stroke={color} strokeWidth={1.5}
      />
      <line x1={cx - boxW / 2} y1={toY(median)} x2={cx + boxW / 2} y2={toY(median)} stroke={color} strokeWidth={2.5} />
      <line x1={cx} y1={toY(q1)} x2={cx} y2={toY(min)} stroke={color} strokeWidth={1.5} />
      <line x1={cx - whW / 2} y1={toY(min)} x2={cx + whW / 2} y2={toY(min)} stroke={color} strokeWidth={1.5} />
    </g>
  );
};

const BoxPlotTooltip = ({ active, payload }) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #ccc', padding: '8px 12px', borderRadius: 4, fontSize: 13 }}>
      <strong>{d.Brand}</strong>
      <div>Max: {d.max?.toFixed(1)}</div>
      <div>Q3: {d.q3?.toFixed(1)}</div>
      <div>Median: {d.median?.toFixed(1)}</div>
      <div>Q1: {d.q1?.toFixed(1)}</div>
      <div>Min: {d.min?.toFixed(1)}</div>
    </div>
  );
};

const BoxPlotChartInner = ({ rawData, raters, aggregated }) => {
  const boxData = computeBoxStats(rawData, raters, aggregated);
  return (
    <div className="chart-container">
      <h3>Bewertungsverteilung pro Marke</h3>
      <ResponsiveContainer width="100%" height={450}>
        <BarChart data={boxData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="Brand" angle={-45} textAnchor="end" height={100} />
          <YAxis domain={[0, 10]} />
          <Tooltip content={<BoxPlotTooltip />} />
          <Bar dataKey="max" shape={BoxPlotShape} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const BarChartDeviationInner = ({ data }) => (
  <div className="chart-container">
    <h3>Bewerter-Abweichung vom Median</h3>
    <ResponsiveContainer width="100%" height={450}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="Rater" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="Deviation" fillOpacity={0.35}>
          {data.map(entry => <Cell key={entry.Rater} fill={entry.fill} stroke={entry.fill} strokeWidth={1.5} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const BarChartPriceRatioInner = ({ data }) => {
  const withPrice = data
    .filter(d => d.Price && d.Sum > 0)
    .map((d, idx) => ({
      ...d,
      PriceScore: parseFloat((d.Price * d.Sum).toFixed(2)),
      fill: PALETTE[idx % PALETTE.length],
    }))
    .sort((a, b) => a.Sum - b.Sum);

  if (withPrice.length === 0) return <p>Keine Preisdaten vorhanden.</p>;

  return (
    <div className="chart-container">
      <h3>Preis-Leistungs-Verhältnis</h3>
      <ResponsiveContainer width="100%" height={450}>
        <BarChart data={withPrice} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="Brand" angle={-45} textAnchor="end" height={100} />
          <YAxis />
          <Tooltip formatter={v => v.toFixed(2)} />
          <Bar dataKey="PriceScore" fillOpacity={0.35}>
            {withPrice.map(entry => <Cell key={entry.Brand} fill={entry.fill} stroke={entry.fill} strokeWidth={1.5} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// --- Shared styles ---

const chartStyles = `
  .chart-container {
    margin-bottom: 3rem;
  }
  .chart-container h3 {
    margin-bottom: 1rem;
    font-size: 1.25rem;
  }
`;

// --- Named exports for use in MDX ---
// Usage: import { SumChart, DistributionChart, DeviationChart, PriceChart } from '../../components/TastingCharts';
// Each takes a `subject` prop and a `client:load` directive.

export function SumChart({ subject }) {
  const { aggregated, filtered, loading, error } = useTastingData(subject);
  if (loading) return <p>Lade Daten...</p>;
  if (error) return <p>Fehler: {error}</p>;
  if (filtered.length === 0) return <p>Keine Daten für '{subject}'.</p>;
  return <><BarChartSum data={aggregated} /><style>{chartStyles}</style></>;
}

export function DistributionChart({ subject }) {
  const { filtered, raters, aggregated, loading, error } = useTastingData(subject);
  if (loading) return <p>Lade Daten...</p>;
  if (error) return <p>Fehler: {error}</p>;
  if (filtered.length === 0) return <p>Keine Daten für '{subject}'.</p>;
  return <><BoxPlotChartInner rawData={filtered} raters={raters} aggregated={aggregated} /><style>{chartStyles}</style></>;
}

export function DeviationChart({ subject }) {
  const { deviations, filtered, loading, error } = useTastingData(subject);
  if (loading) return <p>Lade Daten...</p>;
  if (error) return <p>Fehler: {error}</p>;
  if (filtered.length === 0) return <p>Keine Daten für '{subject}'.</p>;
  return <><BarChartDeviationInner data={deviations} /><style>{chartStyles}</style></>;
}

export function PriceChart({ subject }) {
  const { aggregated, filtered, loading, error } = useTastingData(subject);
  if (loading) return <p>Lade Daten...</p>;
  if (error) return <p>Fehler: {error}</p>;
  if (filtered.length === 0) return <p>Keine Daten für '{subject}'.</p>;
  return <><BarChartPriceRatioInner data={aggregated} /><style>{chartStyles}</style></>;
}

// --- Default export — full dashboard (backward compatible) ---

export default function TastingCharts({ subject }) {
  const { filtered, raters, aggregated, deviations, loading, error } = useTastingData(subject);
  if (loading) return <p>Lade Daten...</p>;
  if (error) return <p>Fehler beim Laden der Daten: {error}</p>;
  if (filtered.length === 0) return <p>Keine Daten für '{subject}' vorhanden.</p>;

  return (
    <div style={{ margin: '2rem 0' }}>
      <BarChartSum data={aggregated} />
      <BoxPlotChartInner rawData={filtered} raters={raters} aggregated={aggregated} />
      <BarChartDeviationInner data={deviations} />
      <BarChartPriceRatioInner data={aggregated} />
      <style>{chartStyles}</style>
    </div>
  );
}
