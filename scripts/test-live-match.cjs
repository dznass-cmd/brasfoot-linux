const assert = require('node:assert/strict');
const Engine = require('../src/engine/match.js');
const teams = require('../data/teams.json');
const clone = value => JSON.parse(JSON.stringify(value));
const pair = () => [clone(teams.find(t => t.id === 255)), clone(teams.find(t => t.id === 487))];
function seeded(seed) { let n = seed; return () => { n = (Math.imul(1664525,n) + 1013904223) >>> 0; return n / 4294967296; }; }

{
  const [home, away] = pair();
  const state = Engine.createMatch(home, away);
  assert.deepEqual(state.scores, [0,0]);
  assert.equal(state.events.length, 0);
  assert.deepEqual(state.stats.shots, [0,0]);
  const random = seeded(15);
  for (let i=0;i<20;i++) Engine.stepMatch(state,home,away,random);
  assert.equal(state.minute,20);
  assert.ok(state.events.every(e=>e.minute<=20));
  const past = clone(state.events), active = clone(state.activeIds), scores = clone(state.scores);
  const before = Engine.calculateTeamPower(home,true,{players:Engine.playersFor(state,home,0),formation:'4-4-2',tacticStyle:'Equilibrado'});
  assert.equal(Engine.changeTactics(state,home,away,0,'4-3-3','Ofensivo').success,true);
  const after = Engine.calculateTeamPower(home,true,{players:Engine.playersFor(state,home,0),formation:state.formations[0],tacticStyle:state.styles[0]});
  assert.ok(after.attack>before.attack);
  assert.ok(after.defense<before.defense);
  assert.deepEqual(state.activeIds,active);
  assert.deepEqual(state.scores,scores);
  assert.deepEqual(state.events.slice(0,past.length),past);
  assert.equal(state.events.at(-1).minute,20);
  const out=home.players.find(p=>p.id===state.activeIds[0][1]);
  const incoming=home.players.find(p=>p.id===state.benchIds[0][0]);
  const energyAtExit=out.energy;
  assert.equal(Engine.substitute(state,home,away,0,out.id,incoming.id).success,true);
  assert.equal(Engine.substitute(state,home,away,0,incoming.id,out.id).success,false);
  assert.ok(!state.activeIds[0].includes(out.id));
  for (let i=20;i<90;i++) Engine.stepMatch(state,home,away,random);
  assert.equal(out.energy,energyAtExit);
  assert.ok(!state.events.some(e=>e.minute>20&&['GOL','GOL_PENALTI'].includes(e.type)&&e.playerId===out.id));
  assert.equal(state.finished,true);
  assert.equal(state.events.filter(e=>e.type==='FIM_JOGO').length,1);
  const end=JSON.stringify({state,home,away});
  Engine.stepMatch(state,home,away,random);Engine.finishMatch(state,home,away,random);
  assert.equal(JSON.stringify({state,home,away}),end);
  assert.equal(Engine.changeTactics(state,home,away,0,'4-4-2','Equilibrado').success,false);
}
{
  const [home,away]=pair();const state=Engine.createMatch(home,away);
  const incoming=home.players.find(p=>p.id===state.benchIds[0][0]);incoming.suspendedWeeks=1;
  assert.equal(Engine.substitute(state,home,away,0,state.activeIds[0][0],incoming.id).success,false);
  incoming.suspendedWeeks=0;
  const expelled=home.players.find(p=>p.id===state.activeIds[0][2]);
  Engine.sendOff(state,home,0,expelled,false);
  assert.equal(state.activeIds[0].length,10);
  assert.equal(Engine.substitute(state,home,away,0,expelled.id,incoming.id).success,false);
  for (let i=0;i<5;i++) {
    const out=state.activeIds[0].find(id=>!state.benchIds[0].includes(id));
    const next=state.benchIds[0].find(id=>!state.activeIds[0].includes(id)&&!state.exitedIds[0].includes(id));
    assert.equal(Engine.substitute(state,home,away,0,out,next).success,true);
  }
  assert.equal(state.substitutions[0],5);
  assert.equal(Engine.substitute(state,home,away,0,state.activeIds[0][0],state.benchIds[0][6]).success,false);
}
{
  const [home,away]=pair();const state=Engine.createMatch(home,away);
  for (let i=0;i<27;i++)Engine.stepMatch(state,home,away,seeded(i+9));
  const copy=clone({state,home,away});
  const left=seeded(87),right=seeded(87);
  while(!state.finished)Engine.stepMatch(state,home,away,left);
  while(!copy.state.finished)Engine.stepMatch(copy.state,copy.home,copy.away,right);
  assert.deepEqual(copy,{state,home,away});
}
{
  const [home,away]=pair();const state=Engine.createMatch(home,away);
  for (let i=0;i<45;i++)Engine.stepMatch(state,home,away,()=>.8);
  assert.equal(state.phase,'halftime');assert.equal(state.minute,45);
  assert.equal(state.events.at(-1).type,'INTERVALO');
  const result=Engine.simulateMatch(...pair(),{random:seeded(8)});
  assert.equal(result.events.at(-1).type,'FIM_JOGO');
  assert.equal(result.events.at(-1).homeScore,result.homeTeam.score);
  assert.ok(result.stats.shots[0]>=result.stats.shotsOnTarget[0]);
}
console.log('PASS: incremental events, tactical effects, valid substitutions, no re-entry, red cards, five-substitution limit, fatigue, interval, deterministic save/resume and idempotent finish.');
