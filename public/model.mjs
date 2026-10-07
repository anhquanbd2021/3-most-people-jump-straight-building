// A deterministic stand-in for the LLM. Not a neural net — a state machine
// that reads the TRANSCRIPT and emits the next step. That is the point of
// the lab: the model only knows what the loop lets through. Drop the
// feedback and the smartest "model" repeats itself forever.

export const TASK =
  'Summarize workspace/notes.txt into workspace/report.md. The report must mention the exporter.';

const NOTES = 'workspace/notes.txt';
const REPORT = 'workspace/report.md';

// transcript entries: { step, call: {name, input}, observation? }
// observation is absent when the loop drops feedback.
export function createScriptedModel() {
  return {
    async next(transcript) {
      const observations = transcript.filter(e => e.observation != null);
      const faulted = [...observations].reverse()
        .find(e => String(e.observation).startsWith('error:'));

      const notesEntry = observations.find(
        e => e.call.name === 'read_file' && e.call.input.path === NOTES
          && !String(e.observation).startsWith('error:'));
      const wroteReport = observations.some(
        e => e.call.name === 'write_file' && e.call.input.path === REPORT
          && !String(e.observation).startsWith('error:'));

      // Graceful degradation: a denied or missing tool becomes a statement
      // of reach, not a retry storm.
      if (faulted && ['read_file', 'search_docs'].includes(faulted.call.name)) {
        return {
          type: 'text',
          text: `I cannot reach what the task needs — ${faulted.observation}`,
        };
      }

      if (!notesEntry) {
        return { type: 'tool_call', name: 'read_file', input: { path: NOTES } };
      }
      if (!wroteReport) {
        const notes = notesEntry.observation;
        const summary = [
          '# Release report',
          '',
          `Source notes: ${notes.slice(0, 120)}`,
          '',
          'Highlight: the exporter shipped in v2.4 and improved p95 latency.',
        ].join('\n');
        return { type: 'tool_call', name: 'write_file', input: { path: REPORT, content: summary } };
      }
      return { type: 'text', text: 'Done — wrote workspace/report.md summarizing the notes.' };
    },
  };
}
