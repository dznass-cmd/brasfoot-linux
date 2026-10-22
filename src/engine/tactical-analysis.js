// Observations of live matches. Never consumes randomness or changes simulation inputs.
class TacticalAnalysis {
  static METRICS = {
    possession: { label: 'Posse de bola', percent: true, decimals: 1 },
    xG: { label: 'Gols esperados (xG)', decimals: 2 },
    shots: { label: 'Finalizações' },
    accuracy: { label: 'Passes certos', percent: true, decimals: 1 },
    energy: { label: 'Energia em campo', percent: true, decimals: 1 }
  };

  static snapshot(state, teams) {
    return {
      minute: state.minute, possessionTotal: state.possessionTotal,
      ...Object.fromEntries(['shots', 'xG', 'passes', 'completedPasses'].map(key => [key, [...state.stats[key]]])),
      energy: teams.map((team, side) => {
        const ids = new Set(state.activeIds[side]);
        const active = team.players.filter(player => ids.has(player.id));
        return active.length ? active.reduce((sum, player) => sum + (state.finalEnergy?.[side]?.[player.id] ?? player.energy ?? 100), 0) / active.length : 0;
      })
    };
  }

  static ensure(state, teams) {
    // Automatic matches do not retain a minute-by-minute history in the career.
    if (!Number.isInteger(state.userSide) || state.tacticalAnalysis) return;
    state.tacticalAnalysis = { version: 1, startedAt: state.minute,
      samples: [this.snapshot(state, teams)], changes: [] };
  }

  static record(state, teams) {
    const history = state.tacticalAnalysis;
    if (!history || history.samples.at(-1).minute === state.minute) return;
    history.samples.push(this.snapshot(state, teams));
  }

  static change(state, side) {
    state.tacticalAnalysis?.changes.push({ minute: state.minute, side,
      formation: state.formations[side], style: state.styles[side],
      instructions: { ...state.instructions[side] }, setPieces: { ...state.setPieces[side] } });
  }

  static between(before, after, metric) {
    const minutes = after.minute - before.minute;
    if (metric === 'energy') return [...after.energy];
    if (minutes <= 0) return [null, null];
    if (metric === 'possession') {
      const home = Math.max(0, Math.min(100, (after.possessionTotal - before.possessionTotal) / minutes));
      return [home, 100 - home];
    }
    if (metric === 'accuracy') return [0, 1].map(side => {
      const passes = after.passes[side] - before.passes[side];
      return passes > 0 ? (after.completedPasses[side] - before.completedPasses[side]) / passes * 100 : null;
    });
    return [0, 1].map(side => Math.max(0, after[metric][side] - before[metric][side]));
  }

  static series(state, metric) {
    const samples = state.tacticalAnalysis?.samples || [];
    return samples.map((sample, index) => ({ minute: sample.minute,
      values: this.between(samples[Math.max(0, index - 5)], sample, metric) }));
  }

  static comparison(state, selection = 'latest') {
    const history = state.tacticalAnalysis;
    if (!history) return null;
    const index = selection === 'latest'
      ? history.changes.map(change => change.side).lastIndexOf(state.userSide) : Number(selection);
    const change = history.changes[index];
    if (!change) return null;
    const samples = history.samples;
    const at = samples.find(sample => sample.minute === change.minute);
    if (!at) return null;
    // Stop at the next change by either coach: those minutes belong to another setup.
    const next = history.changes[index + 1];
    const previous = history.changes[index - 1];
    const end = Math.min(samples.at(-1).minute, change.minute + 5, next?.minute ?? 90);
    const after = samples.find(sample => sample.minute === end) || at;
    const start = Math.max(history.startedAt, change.minute - 5, previous?.minute ?? 0);
    const before = samples.find(sample => sample.minute === start) || at;
    // Compare equal periods as data arrives; never compare a full five minutes to one.
    const minutes = Math.min(at.minute - before.minute, after.minute - at.minute);
    const left = samples.find(sample => sample.minute === at.minute - minutes) || at;
    const right = samples.find(sample => sample.minute === at.minute + minutes) || at;
    const pendingReason = at.minute === before.minute ? 'no-before'
      : next?.minute === change.minute ? 'replaced' : 'waiting';
    return { change, minutes, pendingReason, beforeRange: [left.minute, at.minute], afterRange: [at.minute, right.minute],
      metrics: Object.fromEntries(Object.keys(this.METRICS).map(metric => [metric, {
        before: this.between(left, at, metric), after: this.between(at, right, metric)
      }])) };
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = TacticalAnalysis;
else window.TacticalAnalysis = TacticalAnalysis;
