// Shared lineup rules for the coach, opponents and match engine.
class SquadEngine {
  static POSITION_FITS = { LZ: .88, ZL: .88, LM: .80, ML: .80, MZ: .74, ZM: .74, AM: .80, MA: .80, AL: .62, LA: .62, AZ: .52, ZA: .52 };
  static FORMATIONS = {
    '4-4-2': { G: 1, L: 2, Z: 2, M: 4, A: 2 },
    '4-3-3': { G: 1, L: 2, Z: 2, M: 3, A: 3 },
    '3-5-2': { G: 1, L: 0, Z: 3, M: 5, A: 2 },
    '4-5-1': { G: 1, L: 2, Z: 2, M: 5, A: 1 },
    '4-2-3-1': { G: 1, L: 2, Z: 2, M: 5, A: 1 },
    '3-4-3': { G: 1, L: 0, Z: 3, M: 4, A: 3 },
    '5-3-2': { G: 1, L: 2, Z: 3, M: 3, A: 2 },
    '5-4-1': { G: 1, L: 2, Z: 3, M: 4, A: 1 },
    '4-1-4-1': { G: 1, L: 2, Z: 2, M: 5, A: 1 },
    '4-4-2 diamante': { G: 1, L: 2, Z: 2, M: 4, A: 2 },
    '4-3-2-1': { G: 1, L: 2, Z: 2, M: 5, A: 1 }
  };
  static FORMATION_MODIFIERS = {
    '4-1-4-1': { defense: 1.04, midfield: 1.02, attack: .96 },
    '4-4-2 diamante': { defense: .97, midfield: 1.05, attack: 1.02 },
    '4-3-2-1': { defense: .98, midfield: 1.03, attack: 1.03 }
  };

  static isAvailable(player) {
    return !((player.injuredWeeks || 0) > 0 || (player.suspendedWeeks || 0) > 0
      || (player.pendingInjuryWeeks || 0) > 0 || (player.pendingSuspensionWeeks || 0) > 0);
  }

  static availabilityLabel(player) {
    const injury = Math.max(player.injuredWeeks || 0, player.pendingInjuryWeeks || 0);
    const suspension = Math.max(player.suspendedWeeks || 0, player.pendingSuspensionWeeks || 0);
    return [injury ? `Lesão: ${injury} rodada(s)` : '', suspension ? `Suspensão: ${suspension} jogo(s)` : ''].filter(Boolean).join(' · ');
  }

  static formationSlots(formation = '4-4-2') {
    const counts = this.FORMATIONS[formation] || this.FORMATIONS['4-4-2'];
    const slots = [{ role: 'G', side: 'C' }];
    if (counts.L) slots.push({ role: 'L', side: 'E' });
    for (let i = 0; i < counts.Z; i++) slots.push({ role: 'Z', side: 'C' });
    if (counts.L) slots.push({ role: 'L', side: 'D' });
    const specialSides = { '4-1-4-1': ['C', 'E', 'C', 'C', 'D'], '4-4-2 diamante': ['C', 'E', 'D', 'C'], '4-3-2-1': ['E', 'C', 'D', 'E', 'D'] };
    for (let i = 0; i < counts.M; i++) {
      const side = specialSides[formation]?.[i] || (formation === '4-2-3-1' ? (i === 2 ? 'E' : i === 4 ? 'D' : 'C')
        : i === 0 ? 'E' : i === counts.M - 1 ? 'D' : 'C');
      slots.push({ role: 'M', side });
    }
    for (let i = 0; i < counts.A; i++) slots.push({ role: 'A', side: counts.A === 3 ? (i === 0 ? 'E' : i === 2 ? 'D' : 'C') : 'C' });
    return slots.map((slot, index) => ({ ...slot, index }));
  }

  static positionFit(player, slot = { role: player.position, side: 'C' }) {
    const role = slot.role;
    let fit = 1;
    if (player.position !== role) {
      const pair = player.position + role;
      fit = player.position === 'G' || role === 'G' ? .18
        : player.positionDetailEstimated && (pair === 'LZ' || pair === 'ZL') ? .96 : (this.POSITION_FITS[pair] || .65);
    }
    if (!player.sideEstimated && ['D', 'E'].includes(player.side) && ['D', 'E'].includes(slot.side) && player.side !== slot.side) fit *= .94;
    return fit;
  }

  static condition(player, injured = false) {
    const energy = Math.max(0, Math.min(100, Number(player.energy ?? 100)));
    const morale = Math.max(40, Math.min(110, Number(player.morale ?? 100)));
    return (.35 + .65 * energy / 100) * (.85 + .15 * morale / 100) * (injured ? .55 : 1);
  }

  static lineupRating(player, slot) {
    return (Number(player.strength) || 30) * this.positionFit(player, slot) * this.condition(player);
  }

  // Fill natural positions first, then cover vacancies with the best remaining fit.
  // Slot order is shared with the pitch and match assignments.
  static selectLineup(players, formation = '4-4-2') {
    const slots = this.formationSlots(formation);
    const remaining = [...players];
    const chosen = Array(slots.length).fill(null);
    for (const naturalOnly of [true, false]) {
      for (const slot of slots) {
        if (chosen[slot.index]) continue;
        let best = null, bestRating = -1;
        for (const player of remaining) {
          if (naturalOnly && player.position !== slot.role) continue;
          const rating = this.lineupRating(player, slot);
          if (rating > bestRating) { best = player; bestRating = rating; }
        }
        if (best) { chosen[slot.index] = best; remaining.splice(remaining.indexOf(best), 1); }
      }
    }
    return chosen.map((player, index) => player ? { player, slot: slots[index] } : null).filter(Boolean);
  }

  static assignPositions(players, formation) {
    return Object.fromEntries(this.selectLineup(players, formation).map(({ player, slot }) => [player.id, slot]));
  }

  static autoSelectStarters(team, formation = '4-4-2') {
    formation = this.FORMATIONS[formation] ? formation : '4-4-2';
    const all = team.players || [];
    const starters = this.selectLineup(all.filter(p => this.isAvailable(p)), formation).map(entry => entry.player);
    // Unavailable reserves must never fill empty places in a short lineup.
    const reserves = all.filter(p => !starters.includes(p)).sort((a, b) => Number(this.isAvailable(b)) - Number(this.isAvailable(a))
      || this.lineupRating(b, { role: b.position }) - this.lineupRating(a, { role: a.position }));
    team.players = [...starters, ...reserves];
    team.players.forEach(p => { p.isStarter = starters.includes(p); });
    team.starterCount = starters.length;
    team.formation = formation;
    return team;
  }

  static starters(team) {
    return (team.players || []).slice(0, team.starterCount ?? 11);
  }

  static recoverEnergy(team, { played = true } = {}) {
    for (const player of team.players || []) {
      const minutes = played ? (player.lastMatchMinutes || 0) : 0;
      const recovery = minutes === 0 ? 27 : minutes <= 60 ? 21 : 18;
      player.energy = Math.min(100, (player.energy ?? 100) + recovery);
      player.morale = Math.max(40, Math.min(110, (player.morale ?? 100) + Math.sign(100 - (player.morale ?? 100))));
      // Serve old absences first; a sanction earned today starts NEXT round.
      player.injuredWeeks = Math.max(0, (player.injuredWeeks || 0) - 1, player.pendingInjuryWeeks || 0);
      player.suspendedWeeks = Math.max(0, (player.suspendedWeeks || 0) - (played ? 1 : 0), player.pendingSuspensionWeeks || 0);
      delete player.pendingInjuryWeeks;
      delete player.pendingSuspensionWeeks;
      player.lastMatchMinutes = 0;
    }
  }

  static swapPlayers(team, idx1, idx2) {
    if (!team.players || idx1 < 0 || idx2 < 0 || idx1 >= team.players.length || idx2 >= team.players.length) return false;
    const count = team.starterCount ?? 11;
    if ((idx1 < count && idx2 >= count && !this.isAvailable(team.players[idx2]))
      || (idx2 < count && idx1 >= count && !this.isAvailable(team.players[idx1]))) return false;
    [team.players[idx1], team.players[idx2]] = [team.players[idx2], team.players[idx1]];
    team.players.forEach((p, idx) => { p.isStarter = idx < count; });
    return true;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = SquadEngine;
else window.SquadEngine = SquadEngine;
