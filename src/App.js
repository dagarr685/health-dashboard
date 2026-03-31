import React, { useState, useRef } from 'react';
import { Chart as ChartJS } from 'chart.js/auto';
import { Bar } from 'react-chartjs-2';
import './App.css';

function groupByDate(arr, agg = 'avg') {
  const map = {};
  arr.forEach(r => {
    if (!map[r.d]) map[r.d] = [];
    map[r.d].push(r.val);
  });
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([date, vals]) => ({
    date,
    val: agg === 'avg' ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.reduce((a, b) => a + b, 0)
  }));
}

function lastN(arr, n) { return arr.slice(-n); }

function calcRecovery(hrv, hr) {
  if (!hrv || !hr) return null;
  return Math.min(100, Math.max(0, Math.round((hrv / 50) * 60 + (1 - hr / 100) * 40)));
}

function calcStrain(cals, steps) {
  if (!cals && !steps) return null;
  return Math.min(21, Math.max(0, +((cals / 600 * 14 + steps / 12000 * 7) / 2).toFixed(1)));
}

function recoveryInfo(s) {
  if (s >= 67) return { label: 'Optimal', color: '#1D9E75', bg: '#EAF3DE', text: '#3B6D11' };
  if (s >= 34) return { label: 'Moderate', color: '#EF9F27', bg: '#FAEEDA', text: '#854F0B' };
  return { label: 'Low', color: '#E24B4A', bg: '#FCEBEB', text: '#A32D2D' };
}

function parseHealthXML(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const records = doc.querySelectorAll('Record');
  if (!records.length) return null;
  const data = { hr: [], hrv: [], steps: [], calories: [], sleep: [] };
  records.forEach(r => {
    const type = r.getAttribute('type') || '';
    const val = parseFloat(r.getAttribute('value'));
    const date = r.getAttribute('startDate') || r.getAttribute('creationDate') || '';
    const d = date.substring(0, 10);
    if (type.includes('HeartRate') && !type.includes('Variability') && !isNaN(val)) data.hr.push({ d, val });
    else if (type.includes('HeartRateVariabilitySDNN') && !isNaN(val)) data.hrv.push({ d, val });
    else if (type.includes('StepCount') && !isNaN(val)) data.steps.push({ d, val });
    else if (type.includes('ActiveEnergyBurned') && !isNaN(val)) data.calories.push({ d, val });
    else if (type.includes('SleepAnalysis')) {
      const start = new Date(r.getAttribute('startDate'));
      const end = new Date(r.getAttribute('endDate'));
      const mins = (end - start) / 60000;
      if (mins > 0) data.sleep.push({ d, mins, stage: r.getAttribute('value') || '' });
    }
  });
  return data;
}

function generateDemoData() {
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (29 - i));
    return d.toISOString().substring(0, 10);
  });
  const rand = (min, max) => min + Math.random() * (max - min);
  return {
    hr: days.flatMap(d => Array.from({ length: 8 }, () => ({ d, val: rand(52, 72) }))),
    hrv: days.map(d => ({ d, val: rand(28, 75) })),
    steps: days.flatMap(d => Array.from({ length: 3 }, () => ({ d, val: rand(800, 4000) }))),
    calories: days.map(d => ({ d, val: rand(300, 750) })),
    sleep: days.flatMap(d => ([
      { d, mins: rand(5, 25), stage: 'Awake' },
      { d, mins: rand(60, 180), stage: 'Core' },
      { d, mins: rand(40, 90), stage: 'Deep' },
      { d, mins: rand(40, 100), stage: 'REM' },
    ]))
  };
}

function Ring({ label, value, max, color, display, sub }) {
  const r = 44, cx = 56, cy = 56;
  const circ = 2 * Math.PI * r;
  const pct = Math.min((value || 0) / max, 1);
  const dash = pct * circ;
  return (
    <div className="ring-card">
      <div className="ring-label">{label}</div>
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
          strokeDashoffset={(circ * 0.25).toFixed(1)}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize="20" fontWeight="600" fill={color}>{display}</text>
      </svg>
      <div className="ring-sub">{sub}</div>
    </div>
  );
}

function SleepBars({ sleep }) {
  const stageKeys = {
    Awake: ['Awake', 'SleepAnalysisAwake'],
    Core: ['Core', 'AsleepCore', 'SleepAnalysisAsleep', 'InBed'],
    Deep: ['Deep', 'AsleepDeep', 'SleepStage3'],
    REM: ['REM', 'AsleepREM', 'SleepStageREM']
  };
  const stageColors = { Awake: '#E24B4A', Core: '#378ADD', Deep: '#7F77DD', REM: '#1D9E75' };
  const dates = [...new Set(sleep.map(r => r.d))].sort().slice(-7);

  return (
    <div>
      <div className="legend-row">
        {Object.entries(stageColors).map(([s, c]) => (
          <span key={s} className="legend-item">
            <span className="legend-dot" style={{ background: c }} />{s}
          </span>
        ))}
      </div>
      {dates.map(d => {
        const daySleep = sleep.filter(r => r.d === d);
        const totals = {};
        Object.keys(stageKeys).forEach(s => {
          totals[s] = daySleep.filter(r => stageKeys[s].some(k => r.stage.includes(k))).reduce((a, r) => a + r.mins, 0);
        });
        const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
        return (
          <div key={d} className="sleep-row">
            <span className="sleep-date">{d.substring(5)}</span>
            <div className="sleep-track">
              {Object.entries(stageColors).map(([s, c]) => (
                <div key={s} style={{ background: c, width: `${(totals[s] / total * 100).toFixed(1)}%`, height: '100%', display: 'inline-block' }} />
              ))}
            </div>
            <span className="sleep-val">{(total / 60).toFixed(1)}h</span>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hrRange, setHrRange] = useState('7d');
  const [strainRange, setStrainRange] = useState('7d');
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    if (!file.name.endsWith('.xml')) { setError('Please upload export.xml (unzip the archive first)'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseHealthXML(ev.target.result);
      if (!parsed) { setError('Could not parse file. Make sure it is export.xml from Apple Health.'); return; }
      setData(parsed);
    };
    reader.readAsText(file);
  };

  const hrByDay = data ? groupByDate(data.hr, 'avg') : [];
  const hrvByDay = data ? groupByDate(data.hrv, 'avg') : [];
  const stepsByDay = data ? groupByDate(data.steps, 'sum') : [];
  const calsByDay = data ? groupByDate(data.calories, 'sum') : [];

  const latest = arr => arr.length ? arr[arr.length - 1].val : null;
  const latestHR = latest(hrByDay);
  const latestHRV = latest(hrvByDay);
  const latestSteps = latest(stepsByDay);
  const latestCals = latest(calsByDay);
  const recovery = calcRecovery(latestHRV, latestHR);
  const strain = calcStrain(latestCals, latestSteps);
  const recInfo = recovery !== null ? recoveryInfo(recovery) : null;

  const totalSleep = data ? data.sleep.filter(r => !r.stage.includes('Awake')).reduce((a, r) => a + r.mins, 0) : 0;
  const sleepHrs = (totalSleep / 60).toFixed(1);

  const nHR = hrRange === '7d' ? 7 : hrRange === '14d' ? 14 : 30;
  const nStrain = strainRange === '7d' ? 7 : strainRange === '14d' ? 14 : 30;

  const buildDates = (arr1, arr2, n) => {
    const s = new Set([...lastN(arr1, n).map(r => r.date), ...lastN(arr2, n).map(r => r.date)]);
    return [...s].filter(Boolean).sort().slice(-n);
  };

  const hrDates = buildDates(hrByDay, hrvByDay, nHR);
  const strainDates = buildDates(stepsByDay, calsByDay, nStrain);

  const toMap = arr => Object.fromEntries(arr.map(r => [r.date, r.val]));
  const hrMap = toMap(hrByDay);
  const hrvMap = toMap(hrvByDay);
  const stepsMap = toMap(stepsByDay);
  const calsMap = toMap(calsByDay);

  const hrChartData = {
    labels: hrDates.map(d => d.substring(5)),
    datasets: [
      { type: 'line', label: 'Resting HR', data: hrDates.map(d => hrMap[d] ? Math.round(hrMap[d]) : null), borderColor: '#E24B4A', backgroundColor: 'rgba(226,75,74,0.08)', tension: 0.4, pointRadius: 3, yAxisID: 'y' },
      { type: 'bar', label: 'HRV (ms)', data: hrDates.map(d => hrvMap[d] ? Math.round(hrvMap[d]) : null), backgroundColor: 'rgba(55,138,221,0.45)', borderColor: '#378ADD', borderWidth: 1, yAxisID: 'y2' }
    ]
  };

  const strainChartData = {
    labels: strainDates.map(d => d.substring(5)),
    datasets: [
      { label: 'Active cals', data: strainDates.map(d => calsMap[d] ? Math.round(calsMap[d]) : 0), backgroundColor: 'rgba(29,158,117,0.6)', borderColor: '#1D9E75', borderWidth: 1, yAxisID: 'y' },
      { label: 'Steps x100', data: strainDates.map(d => stepsMap[d] ? Math.round(stepsMap[d] / 100) : 0), backgroundColor: 'rgba(127,119,221,0.5)', borderColor: '#7F77DD', borderWidth: 1, yAxisID: 'y2' }
    ]
  };

  const chartOpts = (y1color, y2color) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { position: 'left', grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: 11 }, color: y1color } },
      y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { size: 11 }, color: y2color } },
      x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: 11 }, color: '#888', maxTicksLimit: 8 } }
    }
  });

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">⌚</span>
            <span className="logo-text">HealthDash</span>
          </div>
          <div className="header-right">
            {data && <span className="data-tag">Data loaded</span>}
            <input type="file" ref={fileRef} onChange={handleFile} accept=".xml" style={{ display: 'none' }} />
            <button className="btn-outline" onClick={() => fileRef.current.click()}>Import Health data</button>
            <button className="btn-demo" onClick={() => { setError(''); setData(generateDemoData()); }}>Demo</button>
          </div>
        </div>
      </header>

      <main className="main">
        {!data ? (
          <div className="empty">
            <div className="empty-icon">⌚</div>
            <h2>Your personal health dashboard</h2>
            <p>Import your Apple Health export to see your recovery, sleep, HRV, and strain — all in one place. Your data never leaves your device.</p>
            <div className="steps">
              {[
                ['1', 'Open the Health app on iPhone'],
                ['2', 'Tap your profile → Export All Health Data'],
                ['3', 'Transfer export.zip to your Mac and unzip it'],
                ['4', 'Click Import Health data above']
              ].map(([n, t]) => (
                <div key={n} className="step-item">
                  <span className="step-num">{n}</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <div className="empty-actions">
              <button className="btn-demo-lg" onClick={() => { setError(''); setData(generateDemoData()); }}>Try with demo data</button>
              <button className="btn-primary" onClick={() => fileRef.current.click()}>Import Health data</button>
            </div>
          </div>
        ) : (
          <>
            {error && <p className="error">{error}</p>}
            <div className="section-title">Today's overview</div>
            <div className="metric-grid">
              {[
                { label: 'Recovery', value: recovery !== null ? recovery : '—', unit: recovery !== null ? '%' : '', badge: recInfo ? { label: recInfo.label, bg: recInfo.bg, color: recInfo.text } : null },
                { label: 'Resting HR', value: latestHR !== null ? Math.round(latestHR) : '—', unit: 'bpm' },
                { label: 'HRV', value: latestHRV !== null ? Math.round(latestHRV) : '—', unit: 'ms' },
                { label: 'Steps', value: latestSteps !== null ? Math.round(latestSteps).toLocaleString() : '—', unit: 'today' },
                { label: 'Active cals', value: latestCals !== null ? Math.round(latestCals) : '—', unit: 'kcal' },
                { label: 'Strain', value: strain !== null ? strain : '—', unit: '/ 21' },
                { label: 'Sleep', value: sleepHrs, unit: 'hrs' },
              ].map(m => (
                <div key={m.label} className="metric-card">
                  <div className="metric-label">{m.label}</div>
                  <div className="metric-value">{m.value}<span className="metric-unit"> {m.unit}</span></div>
                  {m.badge && <span className="badge" style={{ background: m.badge.bg, color: m.badge.color }}>{m.badge.label}</span>}
                </div>
              ))}
            </div>

            <div className="ring-row">
              <Ring label="Recovery" value={recovery || 0} max={100} color={recInfo?.color || '#888'} display={recovery !== null ? recovery + '%' : '—'} sub={recInfo?.label || 'No data'} />
              <Ring label="Sleep" value={Math.min(parseFloat(sleepHrs), 10)} max={10} color="#378ADD" display={sleepHrs + 'h'} sub="last night" />
              <Ring label="Strain" value={strain || 0} max={21} color="#7F77DD" display={strain !== null ? String(strain) : '—'} sub={strain !== null ? (strain >= 14 ? 'High' : strain >= 7 ? 'Moderate' : 'Light') : 'No data'} />
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <span className="chart-title">Heart rate & HRV</span>
                <div className="tabs">
                  {['7d', '14d', '30d'].map(r => (
                    <button key={r} className={`tab ${hrRange === r ? 'active' : ''}`} onClick={() => setHrRange(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="legend-row">
                <span className="legend-item"><span className="legend-dot" style={{ background: '#E24B4A' }} />Resting HR (bpm)</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#378ADD' }} />HRV (ms)</span>
              </div>
              <div style={{ position: 'relative', height: 220 }}>
                <Bar data={hrChartData} options={chartOpts('#E24B4A', '#378ADD')} />
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <span className="chart-title">Sleep stages</span>
                <span className="chart-sub">Last 7 nights</span>
              </div>
              <SleepBars sleep={data.sleep} />
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <span className="chart-title">Activity & strain</span>
                <div className="tabs">
                  {['7d', '14d', '30d'].map(r => (
                    <button key={r} className={`tab ${strainRange === r ? 'active' : ''}`} onClick={() => setStrainRange(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="legend-row">
                <span className="legend-item"><span className="legend-dot" style={{ background: '#1D9E75' }} />Active calories</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#7F77DD' }} />Steps x100</span>
              </div>
              <div style={{ position: 'relative', height: 220 }}>
                <Bar data={strainChartData} options={chartOpts('#1D9E75', '#7F77DD')} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
