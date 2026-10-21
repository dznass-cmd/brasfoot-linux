(async function(stage) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const waitFor = async (condition, message) => {
    for (let i=0;i<100;i++) { if (condition()) return; await new Promise(r=>setTimeout(r,50)); }
    throw new Error(message);
  };
  const report = message => window.webkit.messageHandlers.offlineTest.postMessage(message);
  try {
    assert(app.allTeams.length===703, 'Local club database was not loaded.');
    assert(document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'"), 'Offline policy missing.');
    if (stage===0) {
      localStorage.clear();
      document.getElementById('main-new-game-btn').click();
      assert(document.querySelectorAll('.team-card').length===20,'Local club selection failed.');
      document.querySelector('[data-close="new-game-modal"]').click();
      document.getElementById('main-editor-btn').click();
      document.getElementById('editor-team-select').value=255;app.fillEditor();
      document.getElementById('editor-stadium').value='Estádio offline';app.saveEditor();
      app.startNewGame(255);app.soundEnabled=false;
      assert(app.gameState.userTeam.stadium==='Estádio offline','Offline editor save failed.');
      app.showView('market-tab');document.getElementById('market-search-btn').click();
      assert(document.querySelectorAll('#market-tbody tr').length>1,'Offline market failed.');
      app.showView('finance-tab');
      assert(document.getElementById('finance-tab').classList.contains('active'),'Club finances did not open.');
      assert(document.getElementById('finance-cash').textContent.includes('R$'),'Club cash is missing.');
      assert(document.querySelectorAll('[data-sponsor]').length===3,'Three sponsorship choices are required.');
      document.querySelector('[data-sponsor="stable"]').click();
      assert(app.gameState.userTeam.economy.sponsor.id==='stable','Offline sponsorship did not persist.');
      assert(document.querySelectorAll('#finance-wages-tbody tr').length===app.gameState.userTeam.players.length,'Salary breakdown is incomplete.');
      document.getElementById('ticket-price-slider').value=45;document.getElementById('ticket-price-slider').dispatchEvent(new Event('change'));
      assert(app.gameState.userTeam.ticketPrice===45,'Offline ticket adjustment failed.');
      app.showView('market-tab','contracts');
      assert(document.querySelectorAll('#market-contracts-tbody tr').length===app.gameState.userTeam.players.length,'Player contract list is incomplete.');
      document.querySelector('[data-renew-contract]:not(:disabled)').click();
      assert(document.getElementById('contract-modal').style.display==='flex','Contract conditions did not open.');
      assert(document.getElementById('contract-total').textContent.includes('Luvas agora'),'Immediate contract cost is missing.');
      document.querySelector('[data-close="contract-modal"]').click();
      app.showView('standings-tab','standings-view');
      assert(document.querySelectorAll('#standings-tbody tr').length===20,'Offline table failed.');
      app.showView('tactics-tab');
      const unavailable=app.gameState.userTeam.players[0];
      unavailable.injuredWeeks=1;
      app.playRound();
      assert(!app.gameState.activeMatch,'An unavailable starter was allowed to begin a match.');
      document.getElementById('auto-select-squad-btn').click();
      assert(SquadEngine.starters(app.gameState.userTeam).every(p=>SquadEngine.isAvailable(p)),'Automatic lineup kept an unavailable starter.');
      unavailable.injuredWeeks=0;
      const preview=MatchEngine.calculateTeamPower(app.gameState.userTeam,false);
      assert(document.getElementById('tactics-power-att').textContent===String(Math.round(preview.attack)),'Tactical preview is not using effective match power.');
      app.playRound();app.pauseLiveMatch();
      for(let i=0;i<3;i++){app.matchPaused=false;app.advanceLiveMinute()}app.pauseLiveMatch();
      const outgoing=[...document.querySelectorAll('#match-on-field button')].find(b=>b.querySelector('.match-player-position').textContent==='M');outgoing.click();
      const incoming=[...document.querySelectorAll('#match-reserves button:not(:disabled)')].find(b=>b.querySelector('.match-player-position').textContent==='M');incoming.click();
      document.getElementById('confirm-match-sub-btn').click();
      document.getElementById('match-formation').value='4-3-3';document.getElementById('match-style').value='Ofensivo';app.applyLiveTactics();
      assert(app.currentSimMatch.substitutions[app.currentSimMatch.userSide]===1,'Offline substitution failed.');
      assert(document.getElementById('match-opponent-tactics').textContent.includes(app.currentSimMatch.formations[1-app.currentSimMatch.userSide]),'Opponent tactics are missing from the coach panel.');
      assert(document.getElementById('match-effective-power').textContent.includes('Ataque'),'Effective sector power is missing from the coach panel.');
      assert([...document.querySelectorAll('#match-on-field button')].every(button=>button.title.includes('adaptação')),'Player role adaptation is missing.');
      for (const audio of document.querySelectorAll('audio')) {
        audio.muted=true;
        await Promise.race([audio.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Local audio playback timed out: '+audio.currentSrc+' state '+audio.networkState)),3000))]);
        assert(audio.readyState>=2,'Local audio could not decode.');audio.pause();
      }

      assert([...document.querySelectorAll('audio')].every(a=>!a.error),'Local audio error [wav='+new Audio().canPlayType('audio/wav')+', ogg='+new Audio().canPlayType('audio/ogg; codecs=vorbis')+']: '+JSON.stringify([...document.querySelectorAll('audio')].filter(a=>a.error).map(a=>({src:a.src,code:a.error.code,message:a.error.message}))));
      assert([...document.images].filter(i=>i.getClientRects().length).every(i=>i.complete&&i.naturalWidth>0),'A visible local image did not load.');
      assert(app.persistMatchProgress(), 'Could not save the live checkpoint.');report('RELOAD');
    } else {
      app.loadGame();app.soundEnabled=false;
      assert(app.currentSimMatch.minute===3&&app.matchPaused,'Offline progress did not resume.');
      assert(app.currentSimMatch.formations[app.currentSimMatch.userSide]==='4-3-3','Offline tactics were not saved.');
      assert(app.currentSimMatch.substitutions[app.currentSimMatch.userSide]===1,'Offline substitution was not saved.');
      assert(app.allTeams.find(t=>t.id===255).stadium==='Estádio offline','Local editor data did not persist.');
      const saved=JSON.stringify(app.gameState);
      app.skipMatchSimulation();
      assert(app.gameState.currentRound===2,'Offline round did not finish.');
      const completed=app.currentSimMatch;
      assert(completed.finished&&completed.finalized,'New engine did not finalize the live match.');
      const expectedXG=completed.stats.xG[0].toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
      assert(document.getElementById('stat-xg-home').textContent===expectedXG,'The displayed xG differs from the match state.');
      assert([...document.querySelectorAll('#match-on-field button')].every(button=>{
        const finalEnergy=completed.finalEnergy[completed.userSide][button.dataset.playerId];
        return button.querySelector('.match-player-energy').textContent===Math.round(finalEnergy)+'%';
      }),'Final player energy incorrectly includes post-match recovery.');
      document.getElementById('close-match-btn').click();
      app.showView('finance-tab');
      assert(app.gameState.userTeam.finances.seasons.some(season=>season.entries.some(entry=>entry.kind==='round')),'The completed round has no financial statement.');
      assert(document.querySelectorAll('#finance-statement-tbody tr').length>0,'The financial statement is missing.');
      assert(FinanceEngine.overview(app.gameState.userTeam,app.gameState.seasonYear).categories.tv>0,'TV revenue was not paid.');
      assert(FinanceEngine.overview(app.gameState.userTeam,app.gameState.seasonYear).categories.sponsor>0,'Sponsorship revenue was not paid.');
      app.importSaveFile({target:{files:[new File([saved],'offline-save.json',{type:'application/json'})]}});
      await waitFor(()=>app.gameState.activeMatch?.minute===3,'Local file import failed.');
      assert(app.matchPaused,'Imported live match should be paused.');
      app.exportSaveFile();
      report('PASS: clubs, images, audio, market, finances, tables, live match, availability, effective power, adaptation, xG, final energy, substitution, tactics, reload and local file import.');
    }
  } catch(error) { report('FAIL: '+error.message); }
})
