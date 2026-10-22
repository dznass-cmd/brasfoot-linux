/* Runs only with --legacy-smoke-test, using a dedicated test profile. */
(function () {
  if (!window.BrasfootDesktop.testing) return;
  function assert(value, message) { if (!value) throw new Error(message); }
  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      try {
        assert(app.allTeams.length === 703, '703 clubs');
        assert(typeof MatchEngine.stepMatch === 'function', 'match engine');
        if (BrasfootDesktop.resume) {
          app.gameState = app.getSaveStore().load();
          assert(app.gameState && app.gameState.activeMatch.minute === 3, 'save from previous process');
          app.onGameLoaded();
          assert(app.currentSimMatch && app.currentSimMatch.minute === 3, 'restored match');
          assert(app.matchPaused, 'resumed match stays paused');
          assert(app.currentSimMatch.tacticalAnalysis.samples.length === 4, 'tactical chart history restored');
          assert(document.querySelector('#match-analysis-chart svg'), 'restored tactical chart');
          BrasfootDesktop.report('PASS: saved career and live match restored in another process');
          setTimeout(function () { BrasfootDesktop.capture(function () { BrasfootDesktop.finish(true); }); }, 1500);
          return;
        }
        localStorage.clear();
        document.getElementById('main-new-game-btn').click();
        assert(document.querySelectorAll('.team-card').length === 20, 'club selection');
        app.startNewGame(255);
        app.soundEnabled = false;
        assert(app.gameState && app.gameState.userTeam.id === 255, 'new career');
        ['squad-tab', 'standings-tab', 'teams-tab', 'market-tab', 'finance-tab', 'manager-profile-tab', 'tactics-tab'].forEach(function (view) {
          app.showView(view);
          assert(document.getElementById(view).classList.contains('active'), view);
        });
        assert(getComputedStyle(document.getElementById('game-container')).display === 'flex', 'legacy layout');
        app.playRound(); app.pauseLiveMatch();
        assert(app.gameState.activeMatch, 'live match');
        for (var i = 0; i < 3; i++) { app.matchPaused = false; app.advanceLiveMinute(); }
        app.pauseLiveMatch();
        assert(app.gameState.activeMatch.minute === 3, 'three match minutes');
        assert(app.currentSimMatch.tacticalAnalysis.samples.length === 4, 'tactical samples');
        document.querySelector('[data-match-tab="analysis"]').click();
        var metric = document.getElementById('match-analysis-metric');
        metric.value = 'energy'; metric.dispatchEvent(new Event('change'));
        assert(document.querySelector('#match-analysis-chart svg'), 'live tactical chart');
        assert(!/NaN|Infinity/.test(document.getElementById('match-analysis-chart').innerHTML), 'finite tactical chart values');
        document.querySelector('[data-match-tab="all"]').click();
        assert(app.persistMatchProgress(), 'save checkpoint');
        var saved = app.getSaveStore().load();
        assert(saved && saved.activeMatch.minute === 3, 'read checkpoint');
        assert(document.querySelectorAll('audio').length > 0, 'local audio assets');
        BrasfootDesktop.report('PASS: clubs, new career, seven screens, legacy layout, live match and save/resume');
        setTimeout(function () { BrasfootDesktop.capture(function () { BrasfootDesktop.finish(true); }); }, 1500);
      } catch (error) {
        BrasfootDesktop.report('FAIL: ' + error.message + '\n' + error.stack);
        BrasfootDesktop.finish(false);
      }
    }, 1000);
  });
}());
