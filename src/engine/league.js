// league.js - Championship, Standings & Round-Robin Generator

class LeagueEngine {
  /**
   * Generates a double round-robin tournament fixture schedule (Turno e Returno)
   * Using the standard Circle / Berger algorithm
   * @param {Array} teamIds - Array of team IDs
   * @returns {Array} Array of rounds, each containing an array of matches [homeId, awayId]
   */
  static generateSchedule(teamIds) {
    const teams = [...teamIds];
    // If odd, add a bye dummy
    if (teams.length % 2 !== 0) {
      teams.push(null);
    }

    const n = teams.length;
    const roundsCount = n - 1;
    const matchesPerRound = n / 2;
    const firstHalfRounds = [];

    for (let r = 0; r < roundsCount; r++) {
      const roundMatches = [];
      for (let m = 0; m < matchesPerRound; m++) {
        const home = teams[m];
        const away = teams[n - 1 - m];
        if (home !== null && away !== null) {
          // Alternate home/away each round for fairness
          if ((r + m) % 2 === 0) {
            roundMatches.push({ homeId: home, awayId: away });
          } else {
            roundMatches.push({ homeId: away, awayId: home });
          }
        }
      }
      firstHalfRounds.push(roundMatches);
      // Rotate teams keeping index 0 fixed
      const last = teams.pop();
      teams.splice(1, 0, last);
    }

    // Second half (Returno): inverted home/away
    const secondHalfRounds = firstHalfRounds.map(round =>
      round.map(match => ({
        homeId: match.awayId,
        awayId: match.homeId
      }))
    );

    const allRounds = [...firstHalfRounds, ...secondHalfRounds];
    return allRounds.map((matches, idx) => ({
      roundNumber: idx + 1,
      isFinished: false,
      matches: matches.map(m => ({
        homeId: m.homeId,
        awayId: m.awayId,
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        events: []
      }))
    }));
  }

  /**
   * Calculates standings table from completed matches
   * @param {Array} teamList - Array of team objects in the division
   * @param {Array} rounds - Array of rounds
   * @returns {Array} Sorted table of standings
   */
  static calculateStandings(teamList, rounds) {
    const tableMap = {};
    for (const t of teamList) {
      tableMap[t.id] = {
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        fileRef: t.fileRef,
        shield: t.shield,
        points: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0
      };
    }

    for (const round of rounds) {
      for (const m of round.matches) {
        if (!m.isPlayed || m.homeScore === null || m.awayScore === null) continue;
        const h = tableMap[m.homeId];
        const a = tableMap[m.awayId];
        if (!h || !a) continue;

        h.played++;
        a.played++;
        h.goalsFor += m.homeScore;
        h.goalsAgainst += m.awayScore;
        a.goalsFor += m.awayScore;
        a.goalsAgainst += m.homeScore;

        if (m.homeScore > m.awayScore) {
          h.won++;
          h.points += 3;
          a.lost++;
        } else if (m.homeScore < m.awayScore) {
          a.won++;
          a.points += 3;
          h.lost++;
        } else {
          h.drawn++;
          h.points += 1;
          a.drawn++;
          a.points += 1;
        }
      }
    }

    return this.sortStandings(Object.values(tableMap));
  }

  static sortStandings(rows) {
    const table = rows.map(row => {
      row = { ...row };
      row.goalDiff = row.goalsFor - row.goalsAgainst;
      return row;
    });

    // Sort order: Points -> Wins -> Goal Difference -> Goals For -> Name
    table.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.won !== a.won) return b.won - a.won;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.name.localeCompare(b.name);
    });

    // Add position 1..N
    return table.map((row, idx) => ({ ...row, position: idx + 1 }));
  }

  /**
   * Retrieves top goal scorers
   * @param {Array} teamList - Teams in division
   * @returns {Array} Top 20 goal scorers
   */
  static getTopScorers(teamList) {
    const scorers = [];
    for (const t of teamList) {
      for (const p of t.players || []) {
        if (p.goals && p.goals > 0) {
          scorers.push({
            name: p.name,
            position: p.position,
            teamName: t.name,
            teamShield: t.shield,
            goals: p.goals
          });
        }
      }
    }
    scorers.sort((a, b) => b.goals - a.goals);
    return scorers.slice(0, 25);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LeagueEngine;
} else {
  window.LeagueEngine = LeagueEngine;
}
