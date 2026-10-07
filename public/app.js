// Layer Atlas UI — runs the same zero-dep modules the tests and CLI use.
import { runScenario, SCENARIO_NAMES, PRESET_LABELS } from './scenarios.mjs';

const $ = (sel) => document.querySelector(sel);
const results = $('#results');
let selected = 'healthy';

document.querySelectorAll('.mode').forEach(btn => {
  btn.addEventListener('click', () => {
    selected = btn.dataset.scenario;
    document.querySelectorAll('.mode').forEach(b => b.classList.toggle('selected', b === btn));
  });
});
document.querySelector('.mode[data-scenario="healthy"]').classList.add('selected');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function diagnosisHtml(d) {
  return `<div class="diagnosis ${d.layer}">
    <span class="layer-tag">${esc(d.layer)}</span>
    <strong>${esc(d.symptom)}</strong>
    <ul>${d.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
  </div>`;
}

function transcriptHtml(r) {
  const rows = r.calls.map(c => `
    <tr class="${c.ok ? '' : 'dimmed'}">
      <td class="mono">${c.step ?? ''}</td>
      <td class="mono">${esc(c.name)}(${esc(JSON.stringify(c.input))})</td>
      <td class="obs">${esc(c.observation ?? '(dropped)')}</td>
    </tr>`).join('');
  return `<h2>Transcript</h2>
    <table><thead><tr><th>step</th><th>call</th><th>observation</th></tr></thead>
    <tbody>${rows}</tbody></table>
    ${r.resultMessage ? `<p class="summary">model said: “${esc(r.resultMessage)}”</p>` : ''}`;
}

function graphHtml(r) {
  const ev = (r.events ?? []).map(e =>
    `<li class="mono">${esc(e.type)}${e.node ? ' · ' + esc(e.node) : ''}${e.reason ? ' — ' + esc(e.reason) : ''}</li>`).join('');
  const findings = r.shared?.findings;
  return `<h2>Workflow</h2>
    <ul>${ev}</ul>
    <table><thead><tr><th>shared key</th><th>value</th></tr></thead><tbody>
      <tr><td class="mono">findings.metrics</td><td class="obs">${esc(findings?.metrics ?? '— lost —')}</td></tr>
      <tr><td class="mono">findings.risks</td><td class="obs">${esc(findings?.risks ?? '— lost —')}</td></tr>
      <tr><td class="mono">report</td><td class="obs">${esc((r.shared?.report ?? '').replace(/\n/g, ' ⏎ '))}</td></tr>
    </tbody></table>
    <p class="summary">conflicts: ${r.graphStats.conflicts} · retries: ${r.graphStats.retries} · lost updates: ${r.graphStats.lostUpdates}</p>`;
}

function cardHtml(r) {
  const verdictClass = r.goalMet ? 'verdict-done' : 'verdict-bad';
  return `<div class="card" id="run-card">
    <h2>${esc(r.label)} <span class="${verdictClass}">— ${esc(r.outcome)}</span></h2>
    <p class="task">${esc(r.task)}</p>
    ${diagnosisHtml(r.diagnosis)}
    ${r.calls.length && !r.graphStats ? transcriptHtml(r) : ''}
    ${r.graphStats ? graphHtml(r) : ''}
    ${r.calls.length && r.graphStats ? transcriptHtml(r) : ''}
  </div>`;
}

$('#run').addEventListener('click', async () => {
  results.innerHTML = '<p>running…</p>';
  const r = await runScenario(selected);
  results.innerHTML = cardHtml(r);
});

$('#run-all').addEventListener('click', async () => {
  results.innerHTML = '<p>running all six…</p>';
  const rows = [];
  for (const name of SCENARIO_NAMES) {
    const r = await runScenario(name);
    rows.push(`<tr>
      <td class="mono">${esc(name)}</td>
      <td class="${r.goalMet ? 'verdict-done' : 'verdict-bad'}">${esc(r.outcome)}</td>
      <td>${r.steps}</td>
      <td class="mono">${esc(r.diagnosis.layer)}</td>
      <td>${esc(r.diagnosis.symptom)}</td>
    </tr>`);
  }
  results.innerHTML = `<div class="card"><h2>All six presets, side by side</h2>
    <table><thead><tr><th>scenario</th><th>outcome</th><th>steps</th><th>layer</th><th>symptom</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>
    <p class="summary">Same task, same model — the layer you degraded decides the symptom.</p></div>`;
});
