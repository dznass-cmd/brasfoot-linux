(async function(stage, fixture) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const waitFor = async (condition, message) => {
    for (let i = 0; i < 2200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error(message);
  };
  const report = message => window.webkit.messageHandlers.offlineTest.postMessage(message);
  try {
    app.soundEnabled = false;
    if (stage === 0) {
      localStorage.clear();
      app.gameState = fixture; app.onGameLoaded();
      assert(app.gameState.careerVersion === 1 && app.gameState.reserveTeams.length === 60, 'Legacy save did not migrate.');
      assert(!document.getElementById('next-season-btn').hidden, 'The end-of-season action is missing.');
      const young = app.gameState.userTeam.players.find(p => !p.ageEstimated && p.age < 30);
      assert(young, 'Missing player for identity/age check.');
      app.gameState.continuityProbe = { year: app.gameState.seasonYear, playerId: young.id, age: young.age, balance: app.gameState.userTeam.balance };
      document.getElementById('next-season-btn').click();
      await waitFor(() => CareerEngine.preparationProgress(app.gameState).done >= 4, 'Background leagues did not start.');
      document.querySelector('#season-modal .modal-footer [data-close]').click();
      await waitFor(() => !app.seasonJob, 'Closing preparation did not stop.');
      const progress = CareerEngine.preparationProgress(app.gameState);
      assert(progress.done > 0 && progress.done < progress.total, 'The interruption did not preserve partial progress.');
      app.gameState.continuityProbe.completedRounds = progress.done;
      assert(app.persistState(), 'Partial closure did not fit in local storage.');
      report('RELOAD');
    } else if (stage === 1) {
      app.loadGame();
      const probe = app.gameState.continuityProbe;
      assert(CareerEngine.preparationProgress(app.gameState).done === probe.completedRounds, 'Partial closure progress was lost on reload.');
      await app.openSeasonEnd();
      assert(app.gameState.seasonSummary && !document.getElementById('advance-season-btn').disabled, 'Closure could not be completed or saved.');
      const summary = app.gameState.seasonSummary;
      assert(summary.divisions.every(d => d.results.length === 380), 'Closure lost fixtures.');
      const expectedDivision = summary.user.nextDivisionId, expectedBalance = probe.balance + summary.user.prize;
      document.getElementById('advance-season-btn').click();
      assert(app.gameState.seasonYear === probe.year + 1 && app.gameState.currentRound === 1, 'The next season did not start.');
      assert(app.gameState.divisionId === expectedDivision, 'Promotion/relegation did not update the user division.');
      assert(app.gameState.userTeam.balance === expectedBalance, 'Money was reset or prize was applied twice.');
      assert(app.gameState.seasonHistory.length === 1, 'Season history was not stored.');
      const aged = app.gameState.userTeam.players.find(p => p.id === probe.playerId);
      assert(aged && aged.age === probe.age + 1, 'Player identity or annual aging was lost.');
      assert(app.gameState.userTeam === app.gameState.divisionTeams.find(t => t.id === app.gameState.userTeamId), 'The user club is no longer canonical.');
      app.showView('standings-tab', 'history-view');
      assert(document.querySelectorAll('#career-history .season-history-entry').length === 1, 'History is missing from the interface.');
      const saved = JSON.stringify(app.gameState); app.startNextSeason();
      assert(JSON.stringify(app.gameState) === saved, 'Double advance duplicated a season or a prize.');
      app.playRound(); app.pauseLiveMatch();
      assert(app.currentSimMatch && !app.currentSimMatch.finished, 'The first fixture of the next year did not start.');
      for (let i = 0; i < 3; i++) { app.matchPaused = false; app.advanceLiveMinute(); }
      app.pauseLiveMatch(); assert(app.persistState(), 'The new year did not fit in local storage.');
      report('RELOAD');
    } else {
      app.loadGame();
      const probe = app.gameState.continuityProbe;
      assert(app.gameState.seasonYear === probe.year + 1 && app.gameState.seasonHistory.length === 1, 'Year/history did not survive reload.');
      assert(app.currentSimMatch.minute === 3 && app.matchPaused, 'The next-year fixture did not resume.');
      assert(app.currentSimMatch.homeId === app.gameState.rounds[0].matches.find(m => m.homeId === app.gameState.userTeamId || m.awayId === app.gameState.userTeamId).homeId, 'The new-year fixture changed on reload.');
      app.exportSaveFile();
      report('PASS: offline legacy migration, interrupted closure/resume, promotions, annual aging, history, prize, double-advance guard and next-year live save/reload.');
    }
  } catch (error) { report('FAIL: ' + error.message); }
})
