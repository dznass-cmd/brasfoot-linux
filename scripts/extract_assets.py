#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brasfoot 22-23 Ban File Extractor & Database Generator
Parses all 703 team .ban files and outputs data/teams.json and data/leagues.json.
"""

import os
import sys
import glob
import struct
import json
import random

class JavaDeserializer:
    def __init__(self, data):
        self.data = data
        self.pos = 0
        self.handles = []
        
    def read_byte(self):
        val = self.data[self.pos]
        self.pos += 1
        return val

    def read_short(self):
        val = struct.unpack_from('>h', self.data, self.pos)[0]
        self.pos += 2
        return val

    def read_ushort(self):
        val = struct.unpack_from('>H', self.data, self.pos)[0]
        self.pos += 2
        return val

    def read_int(self):
        val = struct.unpack_from('>i', self.data, self.pos)[0]
        self.pos += 4
        return val

    def read_long(self):
        val = struct.unpack_from('>q', self.data, self.pos)[0]
        self.pos += 8
        return val

    def read_bool(self):
        return self.read_byte() != 0

    def read_utf(self):
        l = self.read_ushort()
        val = self.data[self.pos:self.pos+l].decode('utf-8', errors='replace')
        self.pos += l
        return val

    def assign_handle(self, obj):
        self.handles.append(obj)
        return obj

    def get_handle(self, idx):
        hi = idx - 0x7e0000
        if 0 <= hi < len(self.handles):
            return self.handles[hi]
        return None

    def read_object(self):
        if self.pos >= len(self.data):
            return None
        tc = self.read_byte()
        if tc == 0x70: # TC_NULL
            return None
        elif tc == 0x71: # TC_REFERENCE
            hid = self.read_int()
            return self.get_handle(hid)
        elif tc == 0x72: # TC_CLASSDESC
            return self.read_class_desc()
        elif tc == 0x73: # TC_OBJECT
            desc = self.read_object()
            if not isinstance(desc, dict):
                return None
            obj = {'__class__': desc.get('name', '')}
            self.assign_handle(obj)
            
            classes = []
            cur = desc
            while cur and isinstance(cur, dict):
                classes.append(cur)
                cur = cur.get('super')
            classes.reverse()

            for c in classes:
                for f in c.get('fields', []):
                    t = f['type']
                    fn = f['name']
                    if t == 'I': obj[fn] = self.read_int()
                    elif t == 'Z': obj[fn] = self.read_bool()
                    elif t == 'B': obj[fn] = self.read_byte()
                    elif t == 'S': obj[fn] = self.read_short()
                    elif t == 'J': obj[fn] = self.read_long()
                    elif t == 'F':
                        obj[fn] = struct.unpack_from('>f', self.data, self.pos)[0]
                        self.pos += 4
                    elif t == 'D':
                        obj[fn] = struct.unpack_from('>d', self.data, self.pos)[0]
                        self.pos += 8
                for f in c.get('fields', []):
                    t = f['type']
                    fn = f['name']
                    if t in ('L', '['):
                        obj[fn] = self.read_object()
                        
                if c.get('flags', 0) & 0x01:
                    if c.get('name') == 'java.util.ArrayList':
                        tc_b = self.read_byte()
                        if tc_b == 0x77:
                            blen = self.read_byte()
                            cap = struct.unpack_from('>i', self.data, self.pos)[0]
                            self.pos += blen
                        sz = obj.get('size', 0)
                        items = []
                        for _ in range(sz):
                            items.append(self.read_object())
                        obj['elements'] = items
                        b_end = self.read_byte()
                        assert b_end == 0x78
                    else:
                        while self.pos < len(self.data):
                            b = self.read_byte()
                            if b == 0x78:
                                break
                            elif b == 0x77:
                                self.pos += self.read_byte()
                            elif b == 0x7a:
                                self.pos += self.read_int()
                            else:
                                self.pos -= 1
                                self.read_object()
            return obj
            
        elif tc == 0x74: # TC_STRING
            s = self.read_utf()
            self.assign_handle(s)
            return s
        elif tc == 0x75: # TC_ARRAY
            desc = self.read_object()
            sz = self.read_int()
            arr = []
            self.assign_handle(arr)
            elem_t = desc['name'][1:] if desc and 'name' in desc else ''
            for _ in range(sz):
                if elem_t == 'Z': arr.append(self.read_bool())
                elif elem_t == 'I': arr.append(self.read_int())
                else: arr.append(self.read_object())
            return arr
        elif tc == 0x77: # TC_BLOCKDATA
            blen = self.read_byte()
            data = self.data[self.pos:self.pos+blen]
            self.pos += blen
            return data
        elif tc == 0x78: # TC_ENDBLOCKDATA
            return None
        else:
            return None

    def read_class_desc(self):
        name = self.read_utf()
        suid = self.read_long()
        desc = {'name': name, 'suid': suid, 'flags': self.read_byte()}
        self.assign_handle(desc)
        fc = self.read_ushort()
        fields = []
        for _ in range(fc):
            ft = chr(self.read_byte())
            fn = self.read_utf()
            f = {'name': fn, 'type': ft}
            if ft in ('L', '['):
                f['classname'] = self.read_object()
            fields.append(f)
        desc['fields'] = fields
        b = self.read_byte()
        assert b == 0x78
        desc['super'] = self.read_object()
        return desc


CHARACTERISTICS = [
    'Velocidade',   # 0
    'Finalização',  # 1
    'Passe',        # 2
    'Desarme',      # 3
    'Armação',      # 4
    'Cabeceio',     # 5
    'Técnica',      # 6
    'Marcação',     # 7
    'Cruzamento',   # 8
    'Drible',       # 9
    'Força',        # 10
    'Reflexo',      # 11
    'Saída de Gol', # 12
    'Elasticidade'  # 13
]

POSITION_MAP = {
    0: 'G',  # Goleiro
    1: 'L',  # Lateral
    2: 'Z',  # Zagueiro
    3: 'M',  # Meia
    4: 'A'   # Atacante
}

SIDE_MAP = {
    0: 'D',  # Direito
    1: 'E',  # Esquerdo
    2: 'C'   # Central / Ambos
}

def get_char_name(idx):
    if idx is not None and 0 <= idx < len(CHARACTERISTICS):
        return CHARACTERISTICS[idx]
    return 'Técnica'

def calculate_player_strength(tier, pos, is_starter, is_star, is_top, age):
    # Tier ranges 6 to 19 (for Brasil)
    # Strength in Brasfoot classic scale: ~25 to 55
    base = 28 + int((tier - 6) * 1.8)
    
    # Starter bonus
    if is_starter:
        base += random.choice([2, 3, 4])
    else:
        base -= random.choice([0, 1, 2, 3])
        
    if is_star:
        base += 3
    if is_top:
        base += 4
        
    # Peak age bonus (25-30)
    if 24 <= age <= 30:
        base += 1
    elif age < 20:
        base -= 2
    elif age > 34:
        base -= 1
        
    return max(15, min(65, base))

def calculate_player_value(strength, age, is_star, is_top):
    # Value in R$ (Reais)
    base_val = (strength ** 2.5) * 180
    if is_star: base_val *= 1.4
    if is_top: base_val *= 1.8
    if age < 23: base_val *= 1.3
    elif age > 32: base_val *= 0.6
    return int(round(base_val, -3))

def calculate_player_wage(value, strength):
    # Weekly salary
    wage = max(1000, int(value * 0.003 + strength * 200))
    return int(round(wage, -2))

def parse_all_teams():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    teams_dir = os.path.join(base_dir, 'extracted/game/teams')
    ban_files = glob.glob(os.path.join(teams_dir, '*.ban'))
    
    teams = []
    print(f'Starting extraction of {len(ban_files)} .ban files...')
    
    for idx, bf in enumerate(ban_files):
        try:
            with open(bf, 'rb') as f:
                raw = f.read()
            if raw[:4] != b'\xac\xed\x00\x05':
                continue
            deser = JavaDeserializer(raw[4:])
            obj = deser.read_object()
            if not obj or 'e' not in obj:
                continue
                
            file_ref = obj.get('d', '')
            if not file_ref:
                file_ref = os.path.basename(bf).replace('.ban', '')
                
            # Generate guaranteed unique sequential ID
            team_id = idx + 1
            tier = obj.get('c', 10)
            name = obj.get('e', file_ref)
            short_name = obj.get('nomep') or name[:3].upper()
            stadium = obj.get('f', 'Estádio Municipal')
            capacity = obj.get('g', 25000)
            manager = obj.get('h', 'Técnico Interino')
            color1 = obj.get('cor1', '#004469')
            color2 = obj.get('cor2', '#ffffff')
            country_id = obj.get('a', 29)
            state_id = obj.get('b', 0)
            reputation = obj.get('n', 3)
            
            # Check shield & shirt files
            shield_file = f'{file_ref}.png'
            shirt_file = f'{file_ref}.png'
            
            # Parse players
            raw_players = obj.get('l', {}).get('elements', []) if isinstance(obj.get('l'), dict) else []
            players = []
            
            for p_idx, p in enumerate(raw_players):
                if not p or not isinstance(p, dict) or 'a' not in p:
                    continue
                p_name = p.get('a', f'Jogador {p_idx+1}')
                p_age = p.get('d', 25)
                p_pos_idx = p.get('e', 3)
                p_pos = POSITION_MAP.get(p_pos_idx, 'M')
                p_side_idx = p.get('i', 2)
                p_side = SIDE_MAP.get(p_side_idx, 'C')
                is_starter = (p.get('f', 0) == 1)
                is_star = bool(p.get('b', False))
                is_top = bool(p.get('j', False))
                cr1_idx = p.get('g', 0)
                cr2_idx = p.get('h', 1)
                cr1 = get_char_name(cr1_idx)
                cr2 = get_char_name(cr2_idx)
                
                strength = calculate_player_strength(tier, p_pos, is_starter, is_star, is_top, p_age)
                val = calculate_player_value(strength, p_age, is_star, is_top)
                wage = calculate_player_wage(val, strength)
                
                players.append({
                    'id': f'{team_id}_{p_idx+1}',
                    'name': p_name,
                    'age': p_age,
                    'position': p_pos,
                    'positionIndex': p_pos_idx,
                    'side': p_side,
                    'isStarter': is_starter,
                    'isStar': is_star,
                    'isTopWorld': is_top,
                    'cr1': cr1,
                    'cr2': cr2,
                    'strength': strength,
                    'value': val,
                    'wage': wage,
                    'energy': 100,
                    'morale': 100,
                    'goals': 0,
                    'assists': 0,
                    'yellowCards': 0,
                    'redCards': 0,
                    'matchesPlayed': 0,
                    'injuredWeeks': 0,
                    'suspendedWeeks': 0
                })
                
            # If no players found, generate default squad
            if len(players) < 11:
                # Add basic squad if ban had no player list
                for i in range(16):
                    pos = 'G' if i < 2 else ('Z' if i < 6 else ('L' if i < 8 else ('M' if i < 13 else 'A')))
                    strg = calculate_player_strength(tier, pos, i < 11, False, False, 24)
                    players.append({
                        'id': f'{team_id}_{i+1}',
                        'name': f'Jogador {i+1}',
                        'age': random.randint(19, 32),
                        'position': pos,
                        'positionIndex': 0 if pos=='G' else (1 if pos=='L' else (2 if pos=='Z' else (3 if pos=='M' else 4))),
                        'side': 'C',
                        'isStarter': i < 11,
                        'isStar': False,
                        'isTopWorld': False,
                        'cr1': 'Passe',
                        'cr2': 'Velocidade',
                        'strength': strg,
                        'value': calculate_player_value(strg, 24, False, False),
                        'wage': calculate_player_wage(100000, strg),
                        'energy': 100,
                        'morale': 100,
                        'goals': 0,
                        'assists': 0,
                        'yellowCards': 0,
                        'redCards': 0,
                        'matchesPlayed': 0,
                        'injuredWeeks': 0,
                        'suspendedWeeks': 0
                    })
                    
            # Sort players: starters first, then by position (G, L, Z, M, A)
            players.sort(key=lambda p: (0 if p['isStarter'] else 1, p['positionIndex'], -p['strength']))

            teams.append({
                'id': team_id,
                'name': name,
                'shortName': short_name,
                'fileRef': file_ref,
                'countryId': country_id,
                'stateId': state_id,
                'tier': tier,
                'stadium': stadium,
                'capacity': max(5000, capacity),
                'manager': manager,
                'reputation': reputation,
                'color1': color1,
                'color2': color2,
                'shield': shield_file,
                'shirt': shirt_file,
                'ticketPrice': 30 if tier >= 16 else (20 if tier >= 12 else 15),
                'balance': int(tier * 750000 + random.randint(200000, 1000000)),
                'formation': '4-4-2',
                'tacticStyle': 'Equilibrado',
                'players': players
            })
        except Exception as e:
            # print(f'Error parsing {bf}: {e}')
            pass

    print(f'Successfully processed {len(teams)} teams!')
    
    # Save teams.json
    out_path = os.path.join(base_dir, 'data/teams.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(teams, f, ensure_ascii=False, indent=2)
    print(f'Saved database to {out_path} ({os.path.getsize(out_path) // 1024} KB)')
    
    # Build league structures
    # Brazilian teams (countryId == 29)
    bra_teams = [t for t in teams if t['countryId'] == 29]
    # Sort by tier descending, then reputation
    bra_teams.sort(key=lambda t: (-t['tier'], -t['reputation'], t['name']))
    
    serie_a = [t['id'] for t in bra_teams[:20]]
    serie_b = [t['id'] for t in bra_teams[20:40]]
    serie_c = [t['id'] for t in bra_teams[40:60]]
    serie_d = [t['id'] for t in bra_teams[60:80]]
    
    leagues = {
        'BRA': {
            'country': 'Brasil',
            'divisions': [
                {
                    'id': 'BRA_A',
                    'name': 'Brasileirão Série A',
                    'trophy': 'tr_nacional_BRA_d1.png',
                    'relegated': 4,
                    'promoted': 0,
                    'teams': serie_a
                },
                {
                    'id': 'BRA_B',
                    'name': 'Brasileirão Série B',
                    'trophy': 'tr_nacional_BRA_d2.png',
                    'relegated': 4,
                    'promoted': 4,
                    'teams': serie_b
                },
                {
                    'id': 'BRA_C',
                    'name': 'Brasileirão Série C',
                    'trophy': 'tr_nacional_BRA_d3.png',
                    'relegated': 4,
                    'promoted': 4,
                    'teams': serie_c
                },
                {
                    'id': 'BRA_D',
                    'name': 'Brasileirão Série D',
                    'trophy': 'tr_nacional_BRA_d4.png',
                    'relegated': 0,
                    'promoted': 4,
                    'teams': serie_d
                }
            ],
            'cup': {
                'id': 'BRA_COPA',
                'name': 'Copa do Brasil',
                'trophy': 'tr_copa_BRA.png',
                'teams': serie_a + serie_b
            }
        }
    }
    
    leagues_path = os.path.join(base_dir, 'data/leagues.json')
    with open(leagues_path, 'w', encoding='utf-8') as f:
        json.dump(leagues, f, ensure_ascii=False, indent=2)
    print(f'Saved leagues to {leagues_path}')

if __name__ == '__main__':
    parse_all_teams()
