(async function(stage, fixture) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const report = message => window.webkit.messageHandlers.offlineTest.postMessage(message);
  const waitFor = async (condition, message) => {
    for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
    throw new Error(message);
  };
  const openProfile = () => document.getElementById('profile-nav-btn').click();
  try {
    app.soundEnabled = false;
    if (stage === 0) {
      localStorage.clear(); app.gameState = fixture; app.onGameLoaded(); openProfile();
      assert(document.getElementById('manager-profile-tab').classList.contains('active'), 'Profile tab did not open.');
      assert(document.querySelectorAll('.manager-trophy').length === 1, 'Existing title is missing.');
      assert(document.querySelectorAll('[data-offer-accept]').length === 3, 'Expected three invitations.');
      assert(document.documentElement.scrollWidth <= window.innerWidth, 'Profile overflowed the viewport.');
      const input = document.getElementById('manager-profile-name'); input.value = 'Treinador Teste';
      document.getElementById('manager-name-form').requestSubmit();
      assert(app.gameState.managerProfile.name === 'Treinador Teste' && app.gameState.userTeam.manager === 'Treinador Teste', 'Name was not saved.');
      const state = app.gameState;
      const offer = state.managerProfile.offers.find(entry => entry.divisionId !== state.divisionId);
      const destination = CareerEngine.teams(state).find(team => team.id === offer.teamId);
      state.profileProbe = { oldTeamId: state.userTeamId, oldBalance: state.userTeam.balance, oldDivisionId: state.divisionId,
        destinationId: destination.id, destinationBalance: destination.balance, offerId: offer.id, destinationPlayers: destination.players.map(player => player.id) };
      const decline = state.managerProfile.offers.find(entry => entry.id !== offer.id);
      document.querySelector(`[data-offer-decline="${decline.id}"]`).click();
      assert(document.querySelectorAll('[data-offer-accept]').length === 2, 'Decline did not update invitations.');
      document.querySelector(`[data-offer-accept="${offer.id}"]`).click();
      assert(!document.getElementById('profile-offer-confirmation').hidden, 'Transfer review is missing.');
      document.getElementById('profile-cancel-offer-btn').click();
      assert(document.getElementById('profile-offer-confirmation').hidden && app.gameState.userTeamId === state.userTeamId, 'Cancel changed the club.');
      assert(app.persistState(), 'Could not save profile before reload.'); report('RELOAD');
    } else if (stage === 1) {
      app.loadGame(); openProfile(); const probe = app.gameState.profileProbe;
      assert(app.gameState.managerProfile.name === 'Treinador Teste', 'Manager name lost on reload.');
      assert(document.querySelectorAll('[data-offer-accept]').length === 2, 'Declined invitation reappeared.');
      document.querySelector(`[data-offer-accept="${probe.offerId}"]`).click();
      document.getElementById('profile-confirm-offer-btn').click();
      const state = app.gameState;
      assert(state.userTeamId === probe.destinationId && state.userTeam.manager === 'Treinador Teste', 'Transfer did not switch the club.');
      assert(state.divisionId !== probe.oldDivisionId && state.userTeam.balance === probe.destinationBalance, 'Division or club finances changed incorrectly.');
      assert(CareerEngine.teams(state).find(team => team.id === probe.oldTeamId).balance === probe.oldBalance, 'Former club lost its balance.');
      assert(JSON.stringify(state.userTeam.players.map(player => player.id)) === JSON.stringify(probe.destinationPlayers), 'Destination roster was replaced.');
      assert(document.querySelectorAll('.manager-tenure').length === 2 && document.querySelectorAll('.manager-trophy').length === 1, 'Career history or trophy disappeared.');
      assert(document.querySelectorAll('#career-history .season-results ol li').length === 38, 'Former club results vanished after the move.');
      assert(document.getElementById('profile-offer-count').hidden, 'Offer badge did not clear.');
      assert(document.documentElement.scrollWidth <= window.innerWidth, 'Transferred profile overflowed the viewport.');
      document.querySelector('.main-content').scrollTop = 0;
      await new Promise(resolve => setTimeout(resolve, 150)); report('SNAPSHOT');
      await waitFor(() => window.profileSnapshotDone, 'Profile screenshot did not finish.');
      app.playRound(); app.pauseLiveMatch();
      assert(app.currentSimMatch && !app.currentSimMatch.finished, 'First match at the destination did not start.');
      for (let i = 0; i < 3; i++) { app.matchPaused = false; app.advanceLiveMinute(); }
      app.pauseLiveMatch(); assert(app.persistState(), 'Could not save transferred live match.'); report('RELOAD');
    } else {
      app.loadGame(); const state = app.gameState, probe = state.profileProbe;
      assert(state.userTeamId === probe.destinationId && state.managerProfile.tenures.length === 2, 'Transfer did not survive reload.');
      assert(app.currentSimMatch.minute === 3 && app.matchPaused, 'Transferred live match did not resume.');
      app.skipMatchSimulation(); document.getElementById('close-match-btn').click(); openProfile();
      const overview = CareerEngine.profileOverview(state);
      assert(overview.total.played === 39 && overview.tenures[0].stats.played === 38 && overview.tenures[1].stats.played === 1, 'Match statistics assigned to the wrong tenure.');
      assert(overview.trophies.length === 1 && overview.trophies[0].teamId === probe.oldTeamId, 'Trophy changed ownership.');
      assert(state.currentRound === 2 && overview.pendingOffers.length === 0, 'Career cannot continue normally.');
      app.exportSaveFile();
      report('PASS: native profile, name, title, decline/cancel, cross-division acceptance, history, save/reload and first match with the new club.');
    }
  } catch (error) { report('FAIL: ' + error.message); }
})
