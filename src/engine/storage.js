// Full careers keep the original JSON shape. Live checkpoints belong to one
// committed revision, so a stale journal can never overwrite a newer career.
class SaveStore {
  static revisionCounter = 0;

  constructor(storage, key) {
    this.storage = storage;
    this.key = key;
    this.checkpointKey = `${key}_match_checkpoint`;
    this.committed = null;
  }

  save(state) {
    if (!state) throw new Error('Nenhuma carreira aberta para salvar.');
    const revision = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${++SaveStore.revisionCounter}-${Math.random().toString(36).slice(2)}`;
    this.storage.setItem(this.key, JSON.stringify({ ...state, _saveRevision: revision }));
    this.committed = { state, revision, match: state.activeMatch, year: state.seasonYear, round: state.currentRound };
    // The base write above is atomic. Cleanup failure cannot undo it; the old
    // checkpoint has a different revision and will be ignored on the next load.
    try { this.storage.removeItem(this.checkpointKey); } catch (_) { /* best effort */ }
    return true;
  }

  checkpoint(state) {
    const match = state?.activeMatch, base = this.committed;
    if (!match || match.finished || !base || base.state !== state || base.match !== match
      || base.year !== state.seasonYear || base.round !== state.currentRound) return this.save(state);
    const teams = [match.homeId, match.awayId].map(id => state.divisionTeams.find(team => team.id === id));
    if (teams.some(team => !team)) throw new Error('Não foi possível localizar os elencos da partida.');
    const checkpoint = { version: 1, revision: base.revision, year: state.seasonYear,
      round: state.currentRound, match, teams };
    this.storage.setItem(this.checkpointKey, JSON.stringify(checkpoint));
    return true;
  }

  load() {
    const encoded = this.storage.getItem(this.key);
    if (!encoded) return null;
    const state = JSON.parse(encoded), revision = state._saveRevision;
    delete state._saveRevision;
    try {
      const checkpoint = JSON.parse(this.storage.getItem(this.checkpointKey) || 'null');
      const original = state.activeMatch, match = checkpoint?.match;
      if (revision && checkpoint?.version === 1 && checkpoint.revision === revision
        && checkpoint.year === state.seasonYear && checkpoint.round === state.currentRound
        && original && !original.finished && match && !match.finished && !match.finalized
        && match.homeId === original.homeId && match.awayId === original.awayId
        && match.roundIndex === original.roundIndex && match.userSide === original.userSide
        && Number.isInteger(match.minute) && match.minute >= original.minute && match.minute < 90
        && checkpoint.teams?.length === 2 && checkpoint.teams.every((team, index) =>
          team.id === [original.homeId, original.awayId][index] && Array.isArray(team.players))) {
        const teams = new Map(checkpoint.teams.map(team => [team.id, team]));
        state.divisionTeams = state.divisionTeams.map(team => teams.get(team.id) || team);
        state.userTeam = state.divisionTeams.find(team => team.id === state.userTeamId);
        state.activeMatch = match;
      }
    } catch (error) {
      console.warn('Checkpoint indisponível; recuperando o último save completo:', error);
    }
    this.committed = revision ? { state, revision, match: state.activeMatch, year: state.seasonYear, round: state.currentRound } : null;
    return state;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = SaveStore;
else window.SaveStore = SaveStore;
