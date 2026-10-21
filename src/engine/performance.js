// Ratings use only events and minutes produced by the offline match simulator.
class PerformanceEngine {
  static recordMatch(state, teams) {
    if (state.performanceRecorded || !state.finished) return;
    const ratings = teams.map((team, side) => team.players.filter(player => (state.minutesPlayed[side][player.id] || 0) > 0).map(player => {
      const minutes = state.minutesPlayed[side][player.id];
      const events = state.events.filter(event => event.teamIndex === side && event.playerId === player.id);
      const goals = events.filter(event => ['GOL', 'GOL_PENALTI'].includes(event.type)).length;
      const assists = state.events.filter(event => event.teamIndex === side && ['GOL', 'GOL_PENALTI'].includes(event.type)
        && (event.assistId === player.id || (!event.assistId && event.assist === player.name))).length;
      const shots = goals + events.filter(event => ['DEFESA', 'FINALIZACAO_FORA', 'PENALTI_PERDIDO'].includes(event.type)).length;
      const tackles = events.filter(event => event.type === 'DESARME').length;
      const saves = state.events.filter(event => event.teamIndex === 1 - side && event.keeperId === player.id
        && (event.type === 'DEFESA' || (event.type === 'PENALTI_PERDIDO' && event.saved))).length;
      const yellow = events.filter(event => event.type === 'CARTAO_AMARELO').length;
      const red = events.some(event => ['CARTAO_VERMELHO', 'SEGUNDO_AMARELO'].includes(event.type)) ? 1 : 0;
      const cleanSheet = minutes >= 60 && state.scores[1 - side] === 0 && ['G', 'Z', 'L'].includes(player.position) ? 1 : 0;
      const result = Math.sign(state.scores[side] - state.scores[1 - side]);
      const defensive = ['G', 'Z', 'L'].includes(player.position);
      const raw = 6 + result * .25 + goals * 1.05 + assists * .7 + Math.min(.3, (shots - goals) * .05)
        + Math.min(.7, tackles * .12) + Math.min(1.1, saves * .14) + cleanSheet * .6
        - (defensive ? state.scores[1 - side] * .12 : 0) - yellow * .2 - red * 1.4;
      return { id: player.id, name: player.name, position: player.position, teamId: team.id, minutes,
        goals, assists, saves, tackles, yellow, red, cleanSheet, rating: Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10, motm: 0 };
    }));
    const best = ratings.flat().sort((a, b) => b.rating - a.rating || b.goals - a.goals || b.assists - a.assists || b.minutes - a.minutes || String(a.id).localeCompare(String(b.id)))[0];
    if (best && !state.abandoned) best.motm = 1;
    ratings.forEach((rows, side) => rows.forEach(row => {
      const player = teams[side].players.find(entry => entry.id === row.id);
      const stats = player.performance ||= { games: 0, minutes: 0, ratingTotal: 0, goals: 0, assists: 0, motm: 0, cleanSheets: 0, recent: [] };
      stats.games++; stats.minutes += row.minutes; stats.ratingTotal = Math.round((stats.ratingTotal + row.rating) * 10) / 10;
      stats.goals += row.goals; stats.assists += row.assists; stats.motm += row.motm; stats.cleanSheets += row.cleanSheet;
      stats.recent.push([row.rating, row.minutes, row.goals, row.assists, teams[1 - side].id, state.scores[side], state.scores[1 - side]]);
      stats.recent = stats.recent.slice(-5);
    }));
    state.playerRatings = ratings;
    state.performanceRecorded = true;
  }

  static average(player) { return player.performance?.games ? player.performance.ratingTotal / player.performance.games : null; }
  static recentAverage(player) {
    const recent = player.performance?.recent || [];
    return recent.length ? recent.reduce((total, row) => total + row[0], 0) / recent.length : null;
  }
  static pack(ratings = []) {
    return ratings.map(rows => rows.map(row => [row.id, row.name, row.position, row.minutes, row.rating,
      row.goals, row.assists, row.saves, row.tackles, row.cleanSheet, row.motm, row.yellow, row.red]));
  }
  static unpack(ratings = [], teamIds = []) {
    return ratings.flatMap((rows, side) => rows.map(row => ({ id: row[0], name: row[1], position: row[2], minutes: row[3], rating: row[4],
      goals: row[5], assists: row[6], saves: row[7], tackles: row[8], cleanSheet: row[9], motm: row[10], yellow: row[11], red: row[12], teamId: teamIds[side] })));
  }
  static reports(state) {
    const teams = new Map(state.divisionTeams.map(team => [team.id, team]));
    return state.rounds.flatMap((round, index) => round.matches.filter(match => match.isPlayed
      && [match.homeId, match.awayId].includes(state.userTeamId)).map(match => ({ round: index + 1,
      homeId: match.homeId, awayId: match.awayId, homeName: teams.get(match.homeId)?.name || 'Mandante',
      awayName: teams.get(match.awayId)?.name || 'Visitante', homeScore: match.homeScore, awayScore: match.awayScore,
      playerRatings: match.playerRatings || [] })));
  }
  static archiveSeason(state) {
    const archive = state.performanceArchive ||= [];
    if (!archive.some(record => record.year === state.seasonYear && record.teamId === state.userTeamId)) {
      archive.push({ year: state.seasonYear, teamId: state.userTeamId, teamName: state.userTeam.name, matches: this.reports(state) });
    }
    state.performanceArchive = archive.slice(-2);
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = PerformanceEngine;
else window.PerformanceEngine = PerformanceEngine;
