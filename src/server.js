// server.js - Brasfoot Linux Native Server
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MatchEngine = require('./engine/match');
const LeagueEngine = require('./engine/league');
const SquadEngine = require('./engine/squad');
const MarketEngine = require('./engine/market');
const FinanceEngine = require('./engine/finance');

const PORT = process.env.PORT || 3333;
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SAV_DIR = path.join(ROOT_DIR, 'sav');

if (!fs.existsSync(SAV_DIR)) {
  fs.mkdirSync(SAV_DIR, { recursive: true });
}

// Load databases
console.log('Carregando base de dados do Brasfoot...');
let allTeams = [];
let leaguesConfig = {};

try {
  const teamsRaw = fs.readFileSync(path.join(DATA_DIR, 'teams.json'), 'utf8');
  allTeams = JSON.parse(teamsRaw);
  const leaguesRaw = fs.readFileSync(path.join(DATA_DIR, 'leagues.json'), 'utf8');
  leaguesConfig = JSON.parse(leaguesRaw);
  console.log(`Carregados ${allTeams.length} times e configurações de ligas.`);
} catch (err) {
  console.error('Erro ao carregar dados:', err);
}

// Current active game state
let gameState = null;

function getTeamById(id) {
  return allTeams.find(t => t.id === Number(id));
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(filePath).pipe(res);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const query = Object.fromEntries(reqUrl.searchParams.entries());

  // Static Assets Mapping
  if (pathname.startsWith('/assets/')) {
    const relPath = pathname.replace('/assets/', '');
    const assetPath = path.join(ASSETS_DIR, relPath);
    return serveStatic(req, res, assetPath);
  }

  if (pathname.startsWith('/api/')) {
    try {
      // API Endpoints
      if (pathname === '/api/status' && req.method === 'GET') {
        return sendJson(res, 200, {
          status: 'ok',
          gameLoaded: gameState !== null,
          totalTeams: allTeams.length
        });
      }

      if (pathname === '/api/teams' && req.method === 'GET') {
        const countryId = query.countryId ? Number(query.countryId) : 29;
        const filtered = allTeams
          .filter(t => t.countryId === countryId)
          .map(t => ({
            id: t.id,
            name: t.name,
            tier: t.tier,
            shield: t.shield,
            stadium: t.stadium,
            capacity: t.capacity,
            manager: t.manager,
            color1: t.color1,
            color2: t.color2
          }));
        return sendJson(res, 200, filtered);
      }

      if (pathname === '/api/leagues' && req.method === 'GET') {
        return sendJson(res, 200, leaguesConfig);
      }

      // Start new game
      if (pathname === '/api/game/new' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const userTeamId = Number(body.teamId);
        const userTeam = getTeamById(userTeamId);
        if (!userTeam) {
          return sendJson(res, 400, { error: 'Time não encontrado' });
        }

        // Determine division
        let userDivision = leaguesConfig.BRA.divisions[0]; // default Serie A
        for (const div of leaguesConfig.BRA.divisions) {
          if (div.teams.includes(userTeamId)) {
            userDivision = div;
            break;
          }
        }

        // Deep copy division teams
        const divisionTeams = userDivision.teams.map(tid => {
          const t = JSON.parse(JSON.stringify(getTeamById(tid)));
          SquadEngine.autoSelectStarters(t, t.formation || '4-4-2');
          return t;
        });

        // Generate schedule
        const rounds = LeagueEngine.generateSchedule(userDivision.teams);

        gameState = {
          userTeamId,
          divisionId: userDivision.id,
          divisionName: userDivision.name,
          currentRound: 1,
          totalRounds: rounds.length,
          rounds,
          divisionTeams,
          history: [],
          seasonYear: 2023
        };

        return sendJson(res, 200, { success: true, gameState: getSanitizedGameState() });
      }

      // Get current game state
      if (pathname === '/api/game/state' && req.method === 'GET') {
        if (!gameState) {
          return sendJson(res, 404, { error: 'Nenhum jogo em andamento' });
        }
        return sendJson(res, 200, getSanitizedGameState());
      }

      // Simulate current round
      if (pathname === '/api/game/simulate-round' && req.method === 'POST') {
        if (!gameState) {
          return sendJson(res, 404, { error: 'Nenhum jogo em andamento' });
        }
        if (gameState.currentRound > gameState.totalRounds) {
          return sendJson(res, 400, { error: 'Campeonato encerrado!' });
        }

        const roundIdx = gameState.currentRound - 1;
        const round = gameState.rounds[roundIdx];
        const teamMap = {};
        for (const t of gameState.divisionTeams) {
          teamMap[t.id] = t;
        }

        let userMatchResult = null;
        const matchResults = [];

        for (const m of round.matches) {
          const home = teamMap[m.homeId];
          const away = teamMap[m.awayId];
          if (!home || !away) continue;

          // Check if this is user's match
          const isUserMatch = (home.id === gameState.userTeamId || away.id === gameState.userTeamId);
          const sim = MatchEngine.simulateMatch(home, away, { isNeutral: false });

          m.homeScore = sim.homeTeam.score;
          m.awayScore = sim.awayTeam.score;
          m.isPlayed = true;
          m.events = sim.events;
          m.stats = sim.stats;

          const matchSummary = {
            homeTeam: { id: home.id, name: home.name, shield: home.shield, score: m.homeScore },
            awayTeam: { id: away.id, name: away.name, shield: away.shield, score: m.awayScore },
            events: sim.events,
            stats: sim.stats,
            isUserMatch
          };

          matchResults.push(matchSummary);
          if (isUserMatch) {
            userMatchResult = matchSummary;
          }
        }

        round.isFinished = true;

        // Process finances & energy recovery for user team
        const userTeam = teamMap[gameState.userTeamId];
        const isHome = userMatchResult && userMatchResult.homeTeam.id === userTeam.id;
        const financeSummary = FinanceEngine.processRoundFinances(userTeam, isHome, userTeam.ticketPrice);
        
        // Recover energy for all division teams
        for (const t of gameState.divisionTeams) {
          SquadEngine.recoverEnergy(t);
        }

        gameState.currentRound++;

        return sendJson(res, 200, {
          success: true,
          userMatch: userMatchResult,
          allMatches: matchResults,
          financeSummary,
          gameState: getSanitizedGameState()
        });
      }

      // Tactics update
      if (pathname === '/api/game/tactics' && req.method === 'POST') {
        if (!gameState) return sendJson(res, 404, { error: 'Sem jogo' });
        const body = await parseJsonBody(req);
        const userTeam = gameState.divisionTeams.find(t => t.id === gameState.userTeamId);
        if (!userTeam) return sendJson(res, 404, { error: 'Time não encontrado' });

        if (body.formation) {
          userTeam.formation = body.formation;
          SquadEngine.autoSelectStarters(userTeam, body.formation);
        }
        if (body.tacticStyle) {
          userTeam.tacticStyle = body.tacticStyle;
        }

        return sendJson(res, 200, { success: true, team: userTeam });
      }

      // Swap lineup players
      if (pathname === '/api/game/swap-players' && req.method === 'POST') {
        if (!gameState) return sendJson(res, 404, { error: 'Sem jogo' });
        const body = await parseJsonBody(req);
        const userTeam = gameState.divisionTeams.find(t => t.id === gameState.userTeamId);
        const ok = SquadEngine.swapPlayers(userTeam, body.idx1, body.idx2);
        return sendJson(res, 200, { success: ok, players: userTeam.players });
      }

      // Stadium upgrade
      if (pathname === '/api/game/stadium-upgrade' && req.method === 'POST') {
        if (!gameState) return sendJson(res, 404, { error: 'Sem jogo' });
        const body = await parseJsonBody(req);
        const userTeam = gameState.divisionTeams.find(t => t.id === gameState.userTeamId);
        const result = FinanceEngine.upgradeStadium(userTeam, body.seats || 5000);
        return sendJson(res, 200, result);
      }

      // Ticket price update
      if (pathname === '/api/game/ticket-price' && req.method === 'POST') {
        if (!gameState) return sendJson(res, 404, { error: 'Sem jogo' });
        const body = await parseJsonBody(req);
        const userTeam = gameState.divisionTeams.find(t => t.id === gameState.userTeamId);
        userTeam.ticketPrice = Math.max(10, Math.min(150, Number(body.price) || 30));
        return sendJson(res, 200, { success: true, ticketPrice: userTeam.ticketPrice });
      }

      // Market search
      if (pathname === '/api/game/market/search' && req.method === 'GET') {
        const results = MarketEngine.searchPlayers(allTeams, query, gameState ? gameState.userTeamId : null);
        return sendJson(res, 200, results);
      }

      // Market buy
      if (pathname === '/api/game/market/buy' && req.method === 'POST') {
        if (!gameState) return sendJson(res, 404, { error: 'Sem jogo' });
        const body = await parseJsonBody(req);
        const userTeam = gameState.divisionTeams.find(t => t.id === gameState.userTeamId);
        const sellerTeam = allTeams.find(t => t.id === Number(body.teamId));
        if (!sellerTeam) return sendJson(res, 404, { error: 'Clube vendedor não encontrado' });

        const result = MarketEngine.buyPlayer(userTeam, sellerTeam, body.playerId, Number(body.offerPrice));
        return sendJson(res, 200, result);
      }

      // Market sell
      if (pathname === '/api/game/market/sell' && req.method === 'POST') {
        if (!gameState) return sendJson(res, 404, { error: 'Sem jogo' });
        const body = await parseJsonBody(req);
        const userTeam = gameState.divisionTeams.find(t => t.id === gameState.userTeamId);
        const result = MarketEngine.sellPlayer(userTeam, body.playerId);
        return sendJson(res, 200, result);
      }

      // Save game
      if (pathname === '/api/game/save' && req.method === 'POST') {
        if (!gameState) return sendJson(res, 404, { error: 'Sem jogo' });
        const savePath = path.join(SAV_DIR, 'savegame.json');
        fs.writeFileSync(savePath, JSON.stringify(gameState, null, 2), 'utf8');
        return sendJson(res, 200, { success: true, message: 'Jogo salvo com sucesso!' });
      }

      // Load game
      if (pathname === '/api/game/load' && req.method === 'POST') {
        const savePath = path.join(SAV_DIR, 'savegame.json');
        if (!fs.existsSync(savePath)) {
          return sendJson(res, 404, { error: 'Nenhum jogo salvo encontrado.' });
        }
        const data = fs.readFileSync(savePath, 'utf8');
        gameState = JSON.parse(data);
        return sendJson(res, 200, { success: true, gameState: getSanitizedGameState() });
      }

      // Unmatched API
      return sendJson(res, 404, { error: 'Endpoint não encontrado' });
    } catch (e) {
      console.error('API Error:', e);
      return sendJson(res, 500, { error: e.message });
    }
  }

  // Default: serve frontend UI
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  serveStatic(req, res, filePath);
});

function getSanitizedGameState() {
  if (!gameState) return null;
  const userTeam = gameState.divisionTeams.find(t => t.id === gameState.userTeamId);
  const standings = LeagueEngine.calculateStandings(gameState.divisionTeams, gameState.rounds);
  const topScorers = LeagueEngine.getTopScorers(gameState.divisionTeams);

  const currentRoundIdx = Math.min(gameState.currentRound - 1, gameState.totalRounds - 1);
  const currentRoundMatches = (gameState.rounds[currentRoundIdx]?.matches || []).map(m => {
    const h = gameState.divisionTeams.find(t => t.id === m.homeId);
    const a = gameState.divisionTeams.find(t => t.id === m.awayId);
    return {
      homeId: m.homeId,
      awayId: m.awayId,
      homeName: h ? h.name : 'Time A',
      awayName: a ? a.name : 'Time B',
      homeShield: h ? h.shield : '',
      awayShield: a ? a.shield : '',
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      isPlayed: m.isPlayed,
      isUserMatch: (m.homeId === gameState.userTeamId || m.awayId === gameState.userTeamId)
    };
  });

  return {
    userTeam,
    divisionId: gameState.divisionId,
    divisionName: gameState.divisionName,
    currentRound: gameState.currentRound,
    totalRounds: gameState.totalRounds,
    standings,
    topScorers,
    currentRoundMatches,
    seasonYear: gameState.seasonYear
  };
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`=========================================`);
  console.log(`⚽ Brasfoot Linux rodando nativamente!`);
  console.log(`🌐 Acesse no navegador: http://127.0.0.1:${PORT}`);
  console.log(`=========================================`);
});
