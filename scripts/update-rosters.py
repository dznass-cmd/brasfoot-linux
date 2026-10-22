#!/usr/bin/env python3
"""Import a public roster snapshot into the offline game database.

The default command only reads local files. --download explicitly downloads
public sources; the game never imports this script or contacts those services.
"""
import argparse
import collections
import concurrent.futures
import copy
import csv
import datetime as dt
import gzip
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import tempfile
import time
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'data/sources'
POSITION_INDEX = {'G': 0, 'L': 1, 'Z': 2, 'M': 3, 'A': 4}
SOURCE_POSITIONS = {'G': 'G', 'GK': 'G', 'D': 'Z', 'DEF': 'Z', 'M': 'M', 'MF': 'M', 'F': 'A', 'FW': 'A', 'A': 'A'}
TRAITS = {'G': ('Reflexo', 'Elasticidade'), 'Z': ('Marcação', 'Cabeceio'), 'L': ('Velocidade', 'Passe'), 'M': ('Passe', 'Técnica'), 'A': ('Finalização', 'Velocidade')}


def normalise(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode().lower())


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    atomic_write(path, text)


def atomic_write(path, text):
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as handle:
        handle.write(text)
        temporary = handle.name
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def read_snapshot(path):
    with gzip.open(path, 'rt', encoding='utf-8') as handle:
        return json.load(handle)


def save_snapshot(path, snapshot):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')).encode()
    path.write_bytes(gzip.compress(content, mtime=0))


def public_page(provider, team_id):
    return f'https://www.espn.com.br/futebol/time/elenco/_/id/{team_id}' if provider == 'ESPN' else ''


def condense_espn(raw, league, source_id, year):
    if int(raw.get('season', {}).get('year', 0)) != year:
        raise ValueError('A fonte não apresentou elenco da temporada solicitada.')
    if str(raw.get('team', {}).get('id')) != str(source_id) or raw.get('team', {}).get('isNational'):
        raise ValueError('Identidade do clube não confere.')
    athletes = raw.get('athletes', [])
    if athletes and 'items' in athletes[0]:
        athletes = [p for group in athletes for p in group.get('items', [])]
    players = {}
    for athlete in athletes:
        if athlete.get('gender', 'MALE') != 'MALE':
            continue
        status = athlete.get('status', {}).get('type', '')
        if status in ('retired', 'inactive', 'deceased'):
            continue
        owner = re.search(r'/teams/(\d+)', athlete.get('defaultTeam', {}).get('$ref', ''))
        if owner and owner.group(1) != str(source_id):
            continue
        position = athlete.get('position', {}).get('abbreviation', '').upper()
        if position not in SOURCE_POSITIONS or not athlete.get('displayName') or not str(athlete.get('id', '')).isdigit():
            continue
        stats = {s['name']: s.get('value', 0) for category in athlete.get('statistics', {}).get('splits', {}).get('categories', []) for s in category.get('stats', [])}
        player = {
            'id': str(athlete['id']), 'name': athlete['displayName'], 'fullName': athlete.get('fullName', athlete['displayName']),
            'birthDate': str(athlete.get('dateOfBirth') or '')[:10], 'age': athlete.get('age'),
            'position': position, 'jersey': athlete.get('jersey'), 'nationality': athlete.get('citizenship'),
            'stats': {k: stats[k] for k in ('appearances', 'subIns', 'totalGoals', 'goalAssists', 'saves') if k in stats}
        }
        players[player['id']] = player
    roster = {
        'provider': 'ESPN', 'sourceClubId': str(source_id), 'sourceClubName': raw['team'].get('displayName', ''),
        'seasonYear': year, 'fetchedAt': raw.get('timestamp') or dt.datetime.now(dt.timezone.utc).isoformat(),
        'sourceUrl': public_page('ESPN', source_id),
        'dataUrl': f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/teams/{source_id}/roster',
        'players': list(players.values()),
    }
    check_roster(roster)
    return roster


def condense_ogol(page, url, country, year):
    clean = lambda value: html.unescape(re.sub('<[^>]+>', '', value)).strip()
    title_match = re.search('<title>(.*?)</title>', page, re.S)
    title = clean(title_match.group(1)) if title_match else ''
    if re.search(r'\((?:Feminino|Futsal|Fut\.|S\d|Sub|B\)|Vôlei|Basquete|Handebol)', title, re.I):
        raise ValueError('A página corresponde a outra modalidade, categoria ou equipe.')
    if normalise(country) not in normalise(title.split(' - Jogos')[0]):
        raise ValueError('O país do clube na fonte não confere.')
    selected = re.search(r'<option[^>]*selected[^>]*>(\d{4}(?:/\d{2,4})?)', page)
    if not selected or int(selected.group(1)[:4]) != year:
        raise ValueError('Temporada atual não confirmada na fonte.')
    if 'id="team_squad"' not in page:
        raise ValueError('A página não contém elenco.')
    players = {}
    position = None
    for token in re.split(r'(<div class="section">[^<]+</div>|<div class="staff">)', page.split('id="team_squad"', 1)[1]):
        if token.startswith('<div class="section">'):
            position = clean(token)
        elif position in ('Goleiro', 'Defensor', 'Meia', 'Atacante'):
            match = re.search(r'href="(/jogador/[^"?]+)(?:\?[^"]*)?"[^>]*>(.*?)</a>', token, re.S)
            if not match:
                continue
            age = re.search(r'(\d+) anos', token)
            jersey = re.search(r'<div class="number">([^<]+)', token)
            source_id = match.group(1).rsplit('/', 1)[1]
            if not source_id.isdigit():
                continue
            players[source_id] = {
                'id': source_id, 'name': clean(match.group(2)), 'position': {'Goleiro': 'G', 'Defensor': 'D', 'Meia': 'M', 'Atacante': 'F'}[position],
                'age': int(age.group(1)) if age else None, 'jersey': clean(jersey.group(1)) if jersey else None, 'stats': {}
            }
    roster = {
        'provider': 'ogol', 'sourceClubId': url.split('/equipe/', 1)[1].split('?', 1)[0],
        'sourceClubName': title.split(' - ')[0], 'seasonYear': year, 'seasonLabel': selected.group(1),
        'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'sourceUrl': url, 'dataUrl': url, 'players': list(players.values())
    }
    check_roster(roster)
    return roster


def check_roster(roster):
    players = roster.get('players', [])
    if len(players) < 15 or len(players) > 100:
        raise ValueError(f'Elenco insuficiente ou incoerente: {len(players)} jogadores.')
    if not any(p['position'] in ('G', 'GK') for p in players):
        raise ValueError('Elenco sem goleiro confirmado.')
    if len({p['id'] for p in players}) != len(players):
        raise ValueError('Identificadores de jogadores duplicados na fonte.')


def request(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'BrasfootRosterImporter/1.0 (public roster snapshot)'})
            with urllib.request.urlopen(req, timeout=25) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def download_snapshot(year, as_of, previous=None):
    configuration = json.loads((SOURCES / 'club-source-map.json').read_text())
    mapping = configuration['clubs']
    countries = json.loads((ROOT / 'data/countries.json').read_text())
    baseline = read_snapshot(SOURCES / 'legacy-teams-22-23.json.gz')
    teams = {str(t['id']): t for t in baseline}
    snapshot = {'asOf': as_of.isoformat(), 'seasonYear': year, 'clubs': {}, 'failures': {}}

    def current_teams(league):
        try:
            url = f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/teams?limit=1000'
            result = json.loads(request(url))['sports'][0]['leagues'][0]
            return {str(t['team']['id']): url for t in result.get('teams', [])} if result.get('season', {}).get('year') == year else {}
        except Exception:
            return {}

    current = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for clubs in pool.map(current_teams, configuration['catalogueLeagues']):
            current.update(clubs)

    def collect(item):
        local_id, source = item
        errors = []
        espn = source.get('espn')
        if espn:
            for league in espn['leagues']:
                try:
                    url = f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/teams/{espn["id"]}/roster'
                    roster = condense_espn(json.loads(request(url)), league, espn['id'], year)
                    if str(espn['id']) in current:
                        roster['activityEvidence'] = {'type': 'current-competition', 'url': current[str(espn['id'])]}
                    else:
                        activity_url = f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/teams/{espn["id"]}/schedule?season={year}'
                        schedule = json.loads(request(activity_url))
                        dates = [e.get('date', '') for e in schedule.get('events', []) if f'{year}-01-01' <= e.get('date', '')[:10] <= as_of.isoformat()]
                        if not dates:
                            raise ValueError('Elenco sem participação atual confirmada; cabeçalho de temporada insuficiente.')
                        roster['activityEvidence'] = {'type': 'current-match', 'url': activity_url, 'lastMatchDate': max(dates)}
                    return local_id, roster, None
                except Exception as error:
                    errors.append(str(error))
        if source.get('ogol'):
            try:
                ogol = source['ogol']
                url = ogol['url'] if isinstance(ogol, dict) else ogol
                roster = condense_ogol(request(url).decode(), url, countries[str(teams[local_id]['countryId'])], year)
                if isinstance(ogol, dict) and normalise(ogol['name']) != normalise(roster['sourceClubName']):
                    raise ValueError('O nome do clube na página de destino não confere com o cadastro da fonte.')
                return local_id, roster, None
            except Exception as error:
                errors.append(str(error))
        return local_id, None, '; '.join(dict.fromkeys(errors)) or 'Clube sem fonte pública identificada.'

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for number, (local_id, roster, error) in enumerate(pool.map(collect, mapping.items()), 1):
            if roster:
                snapshot['clubs'][local_id] = roster
            else:
                snapshot['failures'][local_id] = error
                # An unavailable source must not erase the last successful import.
                if previous and local_id in previous.get('clubs', {}):
                    snapshot['clubs'][local_id] = copy.deepcopy(previous['clubs'][local_id])
            if number % 40 == 0:
                print(f'{number}/{len(mapping)} fontes consultadas; {len(snapshot["clubs"])} elencos disponíveis.', flush=True)
    return snapshot


def player_age(source, as_of):
    try:
        birth = dt.date.fromisoformat(source.get('birthDate', ''))
        age = as_of.year - birth.year - ((as_of.month, as_of.day) < (birth.month, birth.day))
    except (ValueError, TypeError):
        age = source.get('age')
    if isinstance(age, (int, float)) and 14 <= age <= 55:
        return int(age), False
    return 25, True  # Internal simulation value; the UI displays an unknown age as "—".


def old_player(source, age, lookup, reference_year):
    candidates = {}
    for name in (source['name'], source.get('fullName', '')):
        for p in lookup.get(normalise(name), []):
            if abs((p['age'] + reference_year - 2023) - age) <= 2:
                candidates[p['id']] = p
    return next(iter(candidates.values())) if len(candidates) == 1 else None


def convert_player(source, team, roster, as_of, lookup):
    age, unknown_age = player_age(source, as_of)
    old = old_player(source, age, lookup, as_of.year)
    position = SOURCE_POSITIONS[source['position']]
    if old and (old['position'] == position or (source['position'] in ('D', 'DEF') and old['position'] in ('L', 'Z'))):
        position = old['position']
    else:
        old = None
    seed = int(hashlib.sha256(f'{roster["provider"]}:{source["id"]}'.encode()).hexdigest()[:8], 16)
    appearances = max(0, int(source.get('stats', {}).get('appearances', 0)))
    strength = old['strength'] if old else max(15, min(65, 28 + round((team['tier'] - 6) * 1.8) + (3 if appearances >= 8 else 0) + seed % 5 - 2 + (1 if 24 <= age <= 30 else -2 if age < 20 else -1 if age > 34 else 0)))
    star = bool(old and old.get('isStar'))
    top = bool(old and old.get('isTopWorld'))
    value = int(round((strength ** 2.5) * 180 * (1.4 if star else 1) * (1.8 if top else 1) * (1.3 if age < 23 else .6 if age > 32 else 1), -3))
    wage = int(round(max(1000, value * .003 + strength * 200), -2))
    traits = (old['cr1'], old['cr2']) if old else TRAITS[position]
    return {
        'id': f'{roster["provider"].lower()}_{source["id"]}', 'name': html.unescape(source['name']), 'fullName': html.unescape(source.get('fullName') or source['name']),
        'age': age, 'ageEstimated': unknown_age, 'birthDate': source.get('birthDate') or None,
        'position': position, 'positionIndex': POSITION_INDEX[position], 'sourcePosition': source['position'],
        'positionDetailEstimated': source['position'] in ('D', 'DEF') and not bool(old),
        'side': old.get('side', 'C') if old else 'C', 'sideEstimated': not bool(old),
        'isStarter': False, 'isStar': star, 'isTopWorld': top, 'cr1': traits[0], 'cr2': traits[1],
        'strength': strength, 'value': value, 'wage': wage, 'energy': 100, 'morale': 100,
        'goals': 0, 'assists': 0, 'yellowCards': 0, 'redCards': 0, 'matchesPlayed': 0, 'injuredWeeks': 0, 'suspendedWeeks': 0,
        'jerseyNumber': source.get('jersey') or None, 'nationality': source.get('nationality') or None,
        'sourceId': None if source.get('idType') == 'local-surrogate' else source['id'],
        'sourceRecordKey': source['id'], 'sourceProvider': roster['provider'], 'sourceStats': source.get('stats', {}),
        'attributesSource': 'game-estimate', 'attributesFromLegacy': bool(old),
    }


def apply_snapshot(snapshot, snapshot_path):
    baseline = read_snapshot(SOURCES / 'legacy-teams-22-23.json.gz')
    teams = copy.deepcopy(baseline)
    as_of = dt.date.fromisoformat(snapshot['asOf'])
    lookup = collections.defaultdict(list)
    for team in baseline:
        for p in team['players']:
            lookup[normalise(p['name'])].append(p)
    clubs = copy.deepcopy(snapshot['clubs'])
    owners = collections.defaultdict(set)
    for team_id, roster in clubs.items():
        for p in roster['players']:
            owners[(roster['provider'], p['id'])].add(team_id)
    conflicts = {key: ids for key, ids in owners.items() if len(ids) > 1}
    # Conflicting affiliations are not guessed: remove the disputed row from all lists.
    for roster in clubs.values():
        roster['players'] = [p for p in roster['players'] if (roster['provider'], p['id']) not in conflicts]
    report = []
    for team in teams:
        roster = clubs.get(str(team['id']))
        reason = snapshot.get('failures', {}).get(str(team['id']), 'Clube sem fonte pública atual identificada.')
        if roster:
            try:
                if roster['provider'] == 'ESPN' and not roster.get('activityEvidence'):
                    raise ValueError('Participação atual do clube não confirmada.')
                check_roster(roster)
                players = [convert_player(p, team, roster, as_of, lookup) for p in roster['players']]
                # A deterministic initial selection; the tactics engine selects the actual eleven on a new game.
                players.sort(key=lambda p: (-float(p['sourceStats'].get('appearances', 0)), -p['strength'], p['id']))
                for index, p in enumerate(players):
                    p['isStarter'] = index < 11
                team['players'] = players
                team['rosterData'] = {k: v for k, v in roster.items() if k != 'players'}
                team['rosterData'].update({'status': 'updated', 'playerCount': len(players), 'gameAttributesEstimated': True})
                report.append({'id': team['id'], 'name': team['name'], 'countryId': team['countryId'], 'status': 'updated', 'playersBefore': len(baseline[len(report)]['players']), 'playersAfter': len(players), **team['rosterData']})
                continue
            except (ValueError, KeyError, TypeError) as error:
                reason = str(error)
        team['rosterData'] = {'status': 'legacy', 'seasonYear': 2023, 'provider': 'Brasfoot 22/23', 'reason': reason}
        report.append({'id': team['id'], 'name': team['name'], 'countryId': team['countryId'], 'status': 'legacy', 'playersAfter': len(team['players']), 'reason': reason})
    updated = [t for t in teams if t['rosterData']['status'] == 'updated']
    if not updated:
        raise ValueError('Nenhum elenco atual foi aceito; a base não será alterada.')
    source_ids = [p['id'] for t in updated for p in t['players']]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError('A importação produziria jogadores com identificadores duplicados.')
    if [t['id'] for t in teams] != [t['id'] for t in baseline]:
        raise ValueError('A importação alteraria os identificadores dos clubes.')
    metadata = {
        'version': f'rosters-{snapshot["asOf"]}', 'asOf': snapshot['asOf'], 'seasonYear': snapshot['seasonYear'],
        'totalClubs': len(teams), 'updatedClubs': len(updated), 'legacyClubs': len(teams) - len(updated),
        'updatedPlayers': len(source_ids), 'sources': sorted({t['rosterData']['provider'] for t in updated}),
        'snapshot': str(snapshot_path.relative_to(ROOT)), 'gameAttributesEstimated': True,
    }
    leagues = json.loads((ROOT / 'data/leagues.json').read_text())
    updated_ids = {t['id'] for t in updated}
    metadata['divisionCoverage'] = [{'id': division['id'], 'name': division['name'], 'total': len(division['teams']), 'updated': sum(i in updated_ids for i in division['teams'])} for country in leagues.values() for division in country.get('divisions', [])]
    write_json(ROOT / 'data/teams.json', teams)
    atomic_write(ROOT / 'data/teams_data.js', 'window.BRASFOOT_TEAMS = ' + json.dumps(teams, ensure_ascii=False, separators=(',', ':')) + ';\n')
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("fix_famous_players", str(ROOT / 'scripts/fix-famous-players.py'))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.fix_famous_players()
    except Exception as error:
        print(f'Aviso ao sincronizar craques e estrelas: {error}')
    write_json(ROOT / 'data/roster-update.json', {**metadata, 'clubs': report, 'conflictingSourcePlayers': [{'provider': key[0], 'id': key[1], 'clubs': sorted(ids)} for key, ids in conflicts.items()]})
    countries = json.loads((ROOT / 'data/countries.json').read_text())
    csv_text = io.StringIO()
    writer = csv.writer(csv_text, delimiter=';')
    writer.writerow(['clube', 'país', 'elenco', 'temporada', 'jogadores', 'fonte', 'data_coleta', 'url', 'motivo'])
    for entry in report:
        writer.writerow([entry['name'], countries[str(entry['countryId'])], entry['status'], entry.get('seasonYear', 2023), entry['playersAfter'], entry.get('provider', 'Brasfoot 22/23'), entry.get('fetchedAt', ''), entry.get('sourceUrl', ''), entry.get('reason', '')])
    atomic_write(ROOT / 'data/roster-update.csv', '\ufeff' + csv_text.getvalue())
    atomic_write(ROOT / 'data/database_info.js', '// Public roster snapshot metadata; no network access at runtime.\nwindow.BRASFOOT_DATABASE = ' + json.dumps(metadata, ensure_ascii=False) + ';\n')
    print(f'Base atualizada: {len(updated)}/{len(teams)} clubes; {len(source_ids)} jogadores atuais; {len(teams)-len(updated)} clubes identificados como base antiga.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, help='Arquivo local .json.gz; não acessa a internet.')
    parser.add_argument('--download', action='store_true', help='Baixar listas públicas antes da importação (requer internet).')
    parser.add_argument('--apply', action='store_true', help='Atualizar teams.json, teams_data.js e os relatórios locais.')
    parser.add_argument('--year', type=int, default=dt.date.today().year)
    parser.add_argument('--as-of', type=dt.date.fromisoformat, default=dt.date.today())
    args = parser.parse_args()
    path = args.snapshot or SOURCES / f'public-rosters-{args.as_of.isoformat()}.json.gz'
    if args.download:
        candidates = sorted(p for p in SOURCES.glob('public-rosters-*.json.gz') if p.name <= f'public-rosters-{args.as_of.isoformat()}.json.gz')
        previous_path = path if path.exists() else candidates[-1] if candidates else None
        previous = read_snapshot(previous_path) if previous_path else None
        snapshot = download_snapshot(args.year, args.as_of, previous)
        save_snapshot(path, snapshot)
        print(f'Cópia local das fontes: {path}')
    else:
        snapshot = read_snapshot(path)
    if args.apply:
        apply_snapshot(snapshot, path.resolve())
    else:
        print(f'{len(snapshot["clubs"])} elencos na cópia local de {snapshot["asOf"]}. Use --apply para atualizar a base.')


if __name__ == '__main__':
    main()
