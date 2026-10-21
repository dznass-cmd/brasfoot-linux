(async function(stage, fixture) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const report = message => window.webkit.messageHandlers.offlineTest.postMessage(message);
  try {
    if (stage === 0) {
      localStorage.clear();
      app.gameState = fixture;
      app.onGameLoaded();
      app.persistState();
      const stored = localStorage.getItem(app.SAVE_KEY);
      assert(stored && JSON.parse(stored).currentRound === 39, 'Full season did not fit in local storage.');
      const decoded = JSON.parse(stored);
      assert(typeof decoded._saveRevision === 'string', 'Full season save is missing its committed revision.');
      delete decoded._saveRevision;
      assert(JSON.stringify(decoded) === JSON.stringify(app.gameState), 'Full season save was truncated or altered.');
      report('RELOAD');
    } else {
      app.loadGame();
      assert(app.gameState.currentRound === 39, 'Full season did not survive a native reload.');
      assert(app.gameState.rounds.every(round => round.isFinished), 'A finished season lost its round records.');
      assert(app.gameState.rounds.flatMap(round => round.matches).filter(match => match.isPlayed).length === 380, 'Full season lost matches.');
      app.exportSaveFile();
      report('PASS: complete 380-match season persisted, reloaded and exported in the offline native app.');
    }
  } catch (error) { report('FAIL: ' + error.message); }
})
