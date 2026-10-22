#!/usr/bin/env python3
"""Synchronize and fix values, strengths, and star flags of famous/important players.

This script updates `data/teams.json` and `data/teams_data.js` so that star and world-class
players have authentic Brasfoot attributes, realistic market values and wages, proper club
affiliations, and visible star badges (★ / ⭐).
"""
import copy
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata

ROOT = Path(__file__).resolve().parents[1]

def normalise(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode().lower())

def calc_value(strength, age, is_star, is_top_world):
    age_factor = 1.3 if age < 23 else (0.6 if age > 32 else 1.0)
    star_factor = 1.4 if is_star else 1.0
    top_factor = 1.8 if is_top_world else 1.0
    val = round((strength ** 2.5) * 180 * star_factor * top_factor * age_factor, -3)
    return int(max(10000, val))

def calc_wage(value, strength):
    return int(round(max(1000, value * 0.003 + strength * 200), -2))

def atomic_write(path, text):
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as handle:
        handle.write(text)
        temporary = handle.name
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)

# Curated registry of famous / important players
# Format: (search_name, target_club_id, position, strength, isStar, isTopWorld, default_age, default_traits)
FAMOUS_REGISTRY = [
    # === TIER 1A: World Superstars / Ballon d'Or Tier (Str 63-65, isStar: True, isTopWorld: True) ===
    ('Vinícius Júnior', 535, 'A', 65, True, True, 26, ('Finalização', 'Velocidade')),
    ('Kylian Mbappé', 535, 'A', 65, True, True, 27, ('Velocidade', 'Finalização')),
    ('Erling Haaland', 410, 'A', 65, True, True, 26, ('Finalização', 'Força')),
    ('Rodri', 410, 'M', 65, True, True, 30, ('Passe', 'Marcação')),
    ('Jude Bellingham', 535, 'M', 64, True, True, 23, ('Técnica', 'Passe')),
    ('Harry Kane', 104, 'A', 64, True, True, 33, ('Finalização', 'Cabeceio')),
    ('Mohamed Salah', 394, 'A', 64, True, True, 34, ('Velocidade', 'Finalização')),
    ('Lionel Messi', 491, 'A', 64, True, True, 39, ('Drible', 'Passe')),
    ('Kevin De Bruyne', 410, 'M', 63, True, True, 35, ('Passe', 'Técnica')),
    ('Lamine Yamal', 97, 'A', 63, True, True, 19, ('Drible', 'Velocidade')),
    ('Jamal Musiala', 104, 'M', 63, True, True, 23, ('Drible', 'Técnica')),
    ('Florian Wirtz', 394, 'M', 63, True, True, 23, ('Passe', 'Técnica')),
    ('Phil Foden', 410, 'M', 63, True, True, 26, ('Técnica', 'Finalização')),
    ('Bukayo Saka', 62, 'A', 63, True, True, 25, ('Velocidade', 'Finalização')),
    ('Cole Palmer', 161, 'M', 63, True, True, 24, ('Finalização', 'Passe')),
    ('Cristiano Ronaldo', 31, 'A', 63, True, True, 41, ('Finalização', 'Cabeceio')),
    ('Robert Lewandowski', 97, 'A', 63, True, True, 38, ('Finalização', 'Cabeceio')),
    ('Federico Valverde', 535, 'M', 63, True, True, 28, ('Chute Longo', 'Velocidade')),
    ('Lautaro Martínez', 331, 'A', 63, True, True, 29, ('Finalização', 'Força')),
    ('Raphinha', 97, 'A', 63, True, True, 29, ('Velocidade', 'Finalização')),
    ('Thibaut Courtois', 535, 'G', 63, True, True, 34, ('Reflexo', 'Elasticidade')),
    ('Alisson Becker', 394, 'G', 63, True, True, 34, ('Reflexo', 'Saída de Gol')),
    ('Virgil van Dijk', 394, 'Z', 63, True, True, 35, ('Cabeceio', 'Marcação')),

    # === TIER 1B: Elite World-Class (Str 61-62, isStar: True, isTopWorld: True) ===
    ('Neymar', 568, 'A', 62, True, True, 34, ('Drible', 'Técnica')),
    ('Antoine Griezmann', 76, 'A', 62, True, True, 35, ('Técnica', 'Finalização')),
    ('Julián Álvarez', 76, 'A', 62, True, True, 26, ('Finalização', 'Velocidade')),
    ('Victor Osimhen', None, 'A', 62, True, True, 27, ('Velocidade', 'Finalização')),
    ('Viktor Gyökeres', 62, 'A', 62, True, True, 28, ('Finalização', 'Força')),
    ('Rafael Leão', None, 'A', 62, True, True, 27, ('Velocidade', 'Drible')),
    ('Bruno Fernandes', 411, 'M', 62, True, True, 32, ('Passe', 'Chute Longo')),
    ('Martin Ødegaard', 62, 'M', 62, True, True, 27, ('Passe', 'Visão')),
    ('William Saliba', 62, 'Z', 62, True, True, 25, ('Marcação', 'Velocidade')),
    ('Declan Rice', 62, 'M', 62, True, True, 27, ('Marcação', 'Passe')),
    ('Nicolò Barella', 331, 'M', 62, True, True, 29, ('Passe', 'Marcação')),
    ('Alessandro Bastoni', 331, 'Z', 62, True, True, 27, ('Marcação', 'Passe')),
    ('Rúben Dias', 410, 'Z', 62, True, True, 29, ('Marcação', 'Força')),
    ('Gianluigi Donnarumma', 410, 'G', 62, True, True, 27, ('Reflexo', 'Elasticidade')),
    ('Jan Oblak', 76, 'G', 62, True, True, 33, ('Reflexo', 'Elasticidade')),
    ('Marc-André ter Stegen', 97, 'G', 62, True, True, 34, ('Reflexo', 'Passe')),
    ('Emiliano Martínez', 161, 'G', 62, True, True, 34, ('Reflexo', 'Elasticidade')),
    ('Ousmane Dembélé', 491, 'A', 62, True, True, 29, ('Drible', 'Velocidade')),
    ('Achraf Hakimi', 491, 'L', 62, True, True, 27, ('Velocidade', 'Cruzamento')),
    ('Vitinha', 491, 'M', 62, True, True, 26, ('Passe', 'Técnica')),
    ('Khvicha Kvaratskhelia', 491, 'A', 62, True, True, 25, ('Drible', 'Finalização')),
    ('Rodrygo', 535, 'A', 62, True, True, 25, ('Drible', 'Finalização')),
    ('Antonio Rüdiger', 535, 'Z', 62, True, True, 33, ('Força', 'Marcação')),
    ('Trent Alexander-Arnold', 535, 'Z', 62, True, True, 28, ('Cruzamento', 'Passe')),
    ('Bernardo Silva', 535, 'M', 62, True, True, 32, ('Drible', 'Passe')),
    ('Pedri', 97, 'M', 62, True, True, 23, ('Visão', 'Passe')),
    ('Joshua Kimmich', 104, 'M', 62, True, True, 31, ('Passe', 'Marcação')),
    ('Alexander Isak', 394, 'A', 62, True, True, 27, ('Finalização', 'Velocidade')),
    ('Alexis Mac Allister', 394, 'M', 62, True, True, 27, ('Passe', 'Chute Longo')),
    ('Luka Modric', 535, 'M', 61, True, True, 41, ('Visão', 'Passe')),
    ('Manuel Neuer', 104, 'G', 61, True, True, 40, ('Saída de Gol', 'Reflexo')),
    ('Karim Benzema', 535, 'A', 61, True, True, 38, ('Finalização', 'Técnica')),
    ('Mike Maignan', 432, 'G', 61, True, True, 31, ('Reflexo', 'Elasticidade')),
    ('David Raya', 62, 'G', 61, True, True, 31, ('Reflexo', 'Saída de Gol')),
    ('Gregor Kobel', 119, 'G', 61, True, True, 28, ('Reflexo', 'Elasticidade')),
    ('Ederson', 248, 'G', 61, True, True, 33, ('Passe', 'Reflexo')),
    ('Gavi', 97, 'M', 61, True, True, 22, ('Marcação', 'Passe')),
    ('Dani Olmo', 97, 'M', 61, True, True, 28, ('Técnica', 'Finalização')),
    ('Frenkie de Jong', 97, 'M', 61, True, True, 29, ('Passe', 'Drible')),
    ('Jules Koundé', 97, 'Z', 61, True, True, 27, ('Marcação', 'Velocidade')),
    ('Eduardo Camavinga', 535, 'M', 61, True, True, 23, ('Desarme', 'Passe')),
    ('Aurélien Tchouaméni', 535, 'M', 61, True, True, 26, ('Marcação', 'Força')),
    ('Éder Militão', 535, 'Z', 61, True, True, 28, ('Velocidade', 'Cabeceio')),
    ('Dani Carvajal', 535, 'Z', 61, True, True, 34, ('Marcação', 'Cruzamento')),
    ('Gabriel Magalhães', 62, 'Z', 61, True, True, 28, ('Cabeceio', 'Marcação')),
    ('Gabriel Martinelli', 42, 'A', 61, True, True, 25, ('Velocidade', 'Finalização')),
    ('Kai Havertz', 62, 'A', 61, True, True, 27, ('Cabeceio', 'Técnica')),
    ('Bruno Guimarães', 62, 'M', 61, True, True, 28, ('Passe', 'Desarme')),
    ('Dominik Szoboszlai', 394, 'M', 61, True, True, 25, ('Chute Longo', 'Passe')),
    ('Ryan Gravenberch', 394, 'M', 61, True, True, 24, ('Passe', 'Força')),
    ('Jeremie Frimpong', 394, 'Z', 61, True, True, 25, ('Velocidade', 'Cruzamento')),
    ('Ronald Araújo', 394, 'Z', 61, True, True, 27, ('Força', 'Cabeceio')),
    ('Luis Díaz', 104, 'A', 61, True, True, 29, ('Drible', 'Velocidade')),
    ('Alphonso Davies', 104, 'L', 61, True, True, 25, ('Velocidade', 'Cruzamento')),
    ('Michael Olise', 104, 'M', 61, True, True, 24, ('Drible', 'Finalização')),
    ('Dayot Upamecano', 104, 'Z', 61, True, True, 27, ('Força', 'Marcação')),
    ('Leroy Sané', 104, 'A', 61, True, True, 30, ('Velocidade', 'Finalização')),
    ('Josko Gvardiol', 410, 'Z', 61, True, True, 24, ('Marcação', 'Passe')),
    ('John Stones', 410, 'Z', 61, True, True, 32, ('Passe', 'Cabeceio')),
    ('Enzo Fernández', 410, 'M', 61, True, True, 25, ('Passe', 'Visão')),
    ('Federico Dimarco', 331, 'L', 61, True, True, 28, ('Cruzamento', 'Chute Longo')),
    ('Hakan Çalhanoglu', 331, 'M', 61, True, True, 32, ('Chute Longo', 'Passe')),
    ('Marcus Thuram', 331, 'A', 61, True, True, 29, ('Velocidade', 'Finalização')),
    ('Rodrigo De Paul', 76, 'M', 61, True, True, 32, ('Marcação', 'Passe')),
    ('Ademola Lookman', 76, 'A', 61, True, True, 29, ('Drible', 'Finalização')),
    ('Marquinhos', 491, 'Z', 61, True, True, 32, ('Marcação', 'Cabeceio')),
    ('Warren Zaïre-Emery', 491, 'M', 61, True, True, 20, ('Passe', 'Força')),
    ('João Neves', 491, 'M', 61, True, True, 22, ('Passe', 'Marcação')),
    ('Bradley Barcola', 491, 'A', 61, True, True, 24, ('Velocidade', 'Drible')),
    ('Nuno Mendes', 491, 'L', 61, True, True, 24, ('Velocidade', 'Cruzamento')),
    ('Moisés Caicedo', 161, 'M', 61, True, True, 24, ('Desarme', 'Marcação')),
    ('Christopher Nkunku', 161, 'A', 61, True, True, 28, ('Finalização', 'Drible')),
    ('Dušan Vlahović', None, 'A', 61, True, True, 26, ('Finalização', 'Força')),
    ('Bremer', 352, 'Z', 61, True, True, 29, ('Força', 'Marcação')),
    ('Theo Hernández', 42, 'L', 61, True, True, 29, ('Velocidade', 'Força')),
    ('Rúben Neves', 42, 'M', 61, True, True, 29, ('Passe', 'Chute Longo')),
    ('Sergej Milinkovic-Savic', 42, 'M', 61, True, True, 31, ('Cabeceio', 'Passe')),
    ('Aleksandar Mitrovic', 42, 'A', 61, True, True, 32, ('Cabeceio', 'Finalização')),
    ('Yassine Bounou', 42, 'G', 61, True, True, 35, ('Reflexo', 'Elasticidade')),
    ('Son Heung-min', 638, 'A', 61, True, True, 34, ('Finalização', 'Velocidade')),
    ('Cristian Romero', 76, 'Z', 61, True, True, 28, ('Marcação', 'Desarme')),

    # === TIER 1C: International Stars / Rising Prodigies (Str 60, isStar: True, isTopWorld: True) ===
    ('Endrick', 535, 'A', 60, True, True, 20, ('Finalização', 'Força')),
    ('Arda Güler', 535, 'M', 60, True, True, 21, ('Técnica', 'Visão')),
    ('Pau Cubarsí', 97, 'Z', 60, True, True, 19, ('Marcação', 'Passe')),
    ('Alejandro Balde', 97, 'Z', 60, True, True, 23, ('Velocidade', 'Cruzamento')),
    ('Fermín López', 97, 'M', 60, True, True, 23, ('Finalização', 'Passe')),
    ('Andreas Christensen', 97, 'Z', 60, True, True, 30, ('Marcação', 'Cabeceio')),
    ('Wojciech Szczesny', 97, 'G', 60, True, True, 36, ('Reflexo', 'Elasticidade')),
    ('Cody Gakpo', 394, 'A', 60, True, True, 27, ('Finalização', 'Técnica')),
    ('Kim Min-Jae', 104, 'Z', 60, True, True, 29, ('Força', 'Marcação')),
    ('Mateo Kovacic', 410, 'M', 60, True, True, 32, ('Drible', 'Passe')),
    ('Jérémy Doku', 410, 'A', 60, True, True, 24, ('Drible', 'Velocidade')),
    ('Benjamin Pavard', 331, 'Z', 60, True, True, 30, ('Marcação', 'Cabeceio')),
    ('Marcos Llorente', 76, 'M', 60, True, True, 31, ('Velocidade', 'Força')),
    ('Koke', 76, 'M', 60, True, True, 34, ('Passe', 'Marcação')),
    ('Lucas Beraldo', 491, 'Z', 60, True, True, 22, ('Passe', 'Marcação')),
    ('Nicolas Jackson', 161, 'A', 60, True, True, 25, ('Velocidade', 'Finalização')),
    ('Douglas Luiz', 352, 'M', 60, True, True, 28, ('Passe', 'Chute Longo')),
    ('Manuel Locatelli', 352, 'M', 60, True, True, 28, ('Passe', 'Marcação')),
    ('Teun Koopmeiners', 352, 'M', 60, True, True, 28, ('Chute Longo', 'Passe')),
    ('Christian Pulisic', 432, 'M', 60, True, True, 28, ('Drible', 'Velocidade')),
    ('Fikayo Tomori', 432, 'Z', 60, True, True, 28, ('Velocidade', 'Marcação')),
    ('Malcom', 42, 'A', 60, True, True, 29, ('Drible', 'Finalização')),
    ('Kalidou Koulibaly', 42, 'Z', 60, True, True, 35, ('Força', 'Marcação')),
    ('Sadio Mané', 31, 'A', 60, True, True, 34, ('Velocidade', 'Finalização')),
    ('João Félix', 31, 'A', 60, True, True, 26, ('Técnica', 'Drible')),
    ('Aymeric Laporte', 31, 'Z', 60, True, True, 32, ('Cabeceio', 'Passe')),
    ('Marcelo Brozović', 31, 'M', 60, True, True, 33, ('Resistência', 'Passe')),
    ('Casemiro', 411, 'M', 60, True, True, 34, ('Marcação', 'Força')),
    ('Lisandro Martínez', 411, 'Z', 60, True, True, 28, ('Desarme', 'Passe')),
    ('Matthijs de Ligt', 411, 'Z', 60, True, True, 27, ('Cabeceio', 'Força')),
    ('James Maddison', 638, 'M', 60, True, True, 29, ('Passe', 'Chute Longo')),
    ('Richarlison', 638, 'A', 60, True, True, 29, ('Finalização', 'Cabeceio')),
    ('Sandro Tonali', 638, 'M', 60, True, True, 26, ('Passe', 'Marcação')),
    ('Ollie Watkins', 42, 'A', 60, True, True, 30, ('Velocidade', 'Finalização')),
    ('Granit Xhaka', 103, 'M', 60, True, True, 34, ('Passe', 'Liderança')),
    ('Victor Boniface', 103, 'A', 60, True, True, 25, ('Força', 'Finalização')),
    ('Patrik Schick', 103, 'A', 60, True, True, 30, ('Cabeceio', 'Finalização')),
    ('Marcel Sabitzer', 119, 'M', 60, True, True, 32, ('Chute Longo', 'Passe')),
    ('Gabriel Jesus', 97, 'A', 60, True, True, 29, ('Drible', 'Finalização')),

    # === TIER 2: Brazilian League Stars & Domestic Idols (Str 56-60, isStar: True) ===
    # Flamengo (ID 255)
    ('Pedro', 255, 'A', 60, True, False, 29, ('Finalização', 'Cabeceio')),
    ('Giorgian de Arrascaeta', 255, 'M', 60, True, False, 32, ('Visão', 'Passe')),
    ('Nicolás de la Cruz', 255, 'M', 58, True, False, 29, ('Passe', 'Marcação')),
    ('Gerson', 255, 'M', 58, True, False, 29, ('Força', 'Passe')),
    ('Gabriel Barbosa', 255, 'A', 58, True, False, 30, ('Finalização', 'Posicionamento')),
    ('Lucas Paquetá', 255, 'M', 58, True, True, 29, ('Técnica', 'Passe')),
    ('Alex Sandro', 255, 'L', 57, True, False, 35, ('Cruzamento', 'Marcação')),
    ('Agustín Rossi', 255, 'G', 57, True, False, 31, ('Reflexo', 'Pênaltis')),
    ('Léo Ortiz', 255, 'Z', 57, True, False, 30, ('Passe', 'Marcação')),
    ('Bruno Henrique', 255, 'A', 57, True, False, 35, ('Velocidade', 'Finalização')),
    ('Erick Pulgar', 255, 'M', 56, True, False, 32, ('Marcação', 'Passe')),
    ('Samuel Lino', 255, 'M', 56, True, False, 26, ('Drible', 'Velocidade')),

    # Palmeiras (ID 487)
    ('Estêvão', 487, 'A', 59, True, True, 19, ('Drible', 'Velocidade')),
    ('Raphael Veiga', 487, 'M', 58, True, False, 31, ('Chute Longo', 'Pênaltis')),
    ('Gustavo Gómez', 487, 'Z', 58, True, False, 33, ('Cabeceio', 'Liderança')),
    ('Joaquín Piquerez', 487, 'L', 58, True, False, 28, ('Cruzamento', 'Marcação')),
    ('Paulinho', 77, 'A', 58, True, False, 26, ('Velocidade', 'Finalização')),
    ('Maurício', 487, 'M', 57, True, False, 25, ('Passe', 'Finalização')),
    ('Felipe Anderson', 487, 'M', 57, True, False, 33, ('Drible', 'Visão')),
    ('Murilo', 487, 'Z', 57, True, False, 29, ('Cabeceio', 'Marcação')),
    ('Carlos Miguel', 487, 'G', 57, True, False, 28, ('Reflexo', 'Elasticidade')),
    ('Dudu', 487, 'A', 57, True, False, 34, ('Drible', 'Velocidade')),
    ('José Manuel López', 487, 'A', 56, True, False, 25, ('Cabeceio', 'Finalização')),

    # Corinthians (ID 176)
    ('Memphis Depay', 176, 'A', 59, True, True, 32, ('Finalização', 'Técnica')),
    ('Rodrigo Garro', 176, 'M', 58, True, False, 28, ('Passe', 'Chute Longo')),
    ('Yuri Alberto', 176, 'A', 58, True, False, 25, ('Velocidade', 'Finalização')),
    ('André Ramalho', 176, 'Z', 56, True, False, 34, ('Liderança', 'Marcação')),
    ('Hugo Souza', 176, 'G', 56, True, False, 27, ('Reflexo', 'Elasticidade')),
    ('Igor Coronado', 176, 'M', 56, True, False, 34, ('Técnica', 'Passe')),

    # São Paulo (ID 575)
    ('Lucas Moura', 575, 'A', 58, True, False, 34, ('Velocidade', 'Drible')),
    ('Jonathan Calleri', 575, 'A', 58, True, False, 33, ('Cabeceio', 'Finalização')),
    ('Luciano', 575, 'A', 57, True, False, 33, ('Finalização', 'Posicionamento')),
    ('Pablo Maia', 575, 'M', 56, True, False, 24, ('Marcação', 'Passe')),
    ('Robert Arboleda', 575, 'Z', 56, True, False, 34, ('Cabeceio', 'Força')),
    ('Ferreira', 575, 'A', 56, True, False, 28, ('Drible', 'Velocidade')),
    ('Rafael', 575, 'G', 56, True, False, 37, ('Reflexo', 'Saída de Gol')),

    # Atlético-MG (ID 77)
    ('Hulk', 77, 'A', 59, True, False, 40, ('Força', 'Chute Longo')),
    ('Gustavo Scarpa', 77, 'M', 58, True, False, 32, ('Cruzamento', 'Chute Longo')),
    ('Guilherme Arana', 77, 'L', 58, True, False, 29, ('Cruzamento', 'Apoio')),
    ('Bernard', 77, 'M', 57, True, False, 34, ('Velocidade', 'Drible')),
    ('Renan Lodi', 77, 'L', 57, True, False, 28, ('Velocidade', 'Cruzamento')),
    ('Éverson', 77, 'G', 56, True, False, 36, ('Reflexo', 'Pênaltis')),
    ('Lyanco', 77, 'Z', 56, True, False, 29, ('Força', 'Marcação')),
    ('Alan Franco', 77, 'M', 56, True, False, 28, ('Marcação', 'Passe')),
    ('Tomás Cuello', 77, 'A', 56, True, False, 26, ('Velocidade', 'Chute')),

    # Fluminense (ID 260)
    ('Thiago Silva', 260, 'Z', 59, True, True, 42, ('Liderança', 'Marcação')),
    ('Germán Cano', 260, 'A', 58, True, False, 38, ('Finalização', 'Posicionamento')),
    ('Jhon Arias', 260, 'M', 58, True, False, 29, ('Velocidade', 'Drible')),
    ('Ganso', 260, 'M', 57, True, False, 37, ('Visão', 'Passe')),
    ('Fábio', 260, 'G', 56, True, False, 46, ('Reflexo', 'Colocação')),
    ('Martinelli', 260, 'M', 56, True, False, 25, ('Passe', 'Marcação')),
    ('Kevin Serna', 260, 'A', 56, True, False, 28, ('Velocidade', 'Drible')),
    ('John Kennedy', 260, 'A', 56, True, False, 24, ('Finalização', 'Força')),

    # Botafogo (ID 121)
    ('Luiz Henrique', 121, 'A', 59, True, True, 25, ('Drible', 'Finalização')),
    ('Igor Jesus', 121, 'A', 58, True, False, 25, ('Força', 'Finalização')),
    ('Thiago Almada', 121, 'M', 58, True, True, 25, ('Drible', 'Passe')),
    ('Júnior Santos', 121, 'A', 57, True, False, 32, ('Força', 'Velocidade')),
    ('Alex Telles', 121, 'L', 57, True, False, 33, ('Cruzamento', 'Marcação')),
    ('Marlon Freitas', 121, 'M', 56, True, False, 31, ('Passe', 'Liderança')),
    ('Matheus Martins', 121, 'A', 56, True, False, 23, ('Drible', 'Velocidade')),
    ('John', 121, 'G', 56, True, False, 28, ('Reflexo', 'Elasticidade')),
    ('Jefferson Savarino', 121, 'A', 57, True, False, 29, ('Velocidade', 'Técnica')),

    # Vasco da Gama (ID 667)
    ('Philippe Coutinho', 667, 'M', 58, True, True, 34, ('Técnica', 'Chute Longo')),
    ('Pablo Vegetti', 667, 'A', 58, True, False, 38, ('Cabeceio', 'Finalização')),
    ('Dimitri Payet', 667, 'M', 57, True, False, 39, ('Passe', 'Visão')),
    ('Léo Jardim', 667, 'G', 57, True, False, 31, ('Reflexo', 'Elasticidade')),
    ('Lucas Piton', 667, 'L', 56, True, False, 26, ('Cruzamento', 'Velocidade')),
    ('Jair', 667, 'M', 56, True, False, 32, ('Marcação', 'Passe')),

    # Cruzeiro (ID 190)
    ('Matheus Pereira', 190, 'M', 58, True, False, 28, ('Visão', 'Passe')),
    ('Cássio', 190, 'G', 57, True, False, 39, ('Reflexo', 'Liderança')),
    ('Kaio Jorge', 190, 'A', 56, True, False, 24, ('Finalização', 'Velocidade')),
    ('Lucas Romero', 190, 'M', 56, True, False, 32, ('Marcação', 'Força')),
    ('Fabrício Bruno', 190, 'Z', 56, True, False, 30, ('Marcação', 'Velocidade')),
    ('Gabriel Veron', 190, 'A', 56, True, False, 24, ('Velocidade', 'Drible')),

    # Grêmio (ID 287)
    ('Martin Braithwaite', 287, 'A', 57, True, False, 35, ('Finalização', 'Força')),
    ('Yeferson Soteldo', 287, 'A', 57, True, False, 29, ('Drible', 'Velocidade')),
    ('Mathías Villasanti', 287, 'M', 57, True, False, 29, ('Marcação', 'Passe')),
    ('Diego Costa', 287, 'A', 57, True, False, 38, ('Força', 'Finalização')),
    ('Franco Cristaldo', 287, 'M', 56, True, False, 30, ('Passe', 'Técnica')),
    ('Walter Kannemann', 287, 'Z', 56, True, False, 35, ('Marcação', 'Força')),
    ('Agustín Marchesín', 287, 'G', 56, True, False, 38, ('Reflexo', 'Elasticidade')),

    # Internacional (ID 328)
    ('Alan Patrick', 328, 'M', 58, True, False, 35, ('Visão', 'Passe')),
    ('Rafael Borré', 328, 'A', 58, True, False, 31, ('Velocidade', 'Finalização')),
    ('Enner Valencia', 328, 'A', 58, True, False, 36, ('Velocidade', 'Finalização')),
    ('Sergio Rochet', 328, 'G', 57, True, False, 33, ('Reflexo', 'Saída de Gol')),
    ('Thiago Maia', 328, 'M', 56, True, False, 29, ('Marcação', 'Passe')),
    ('Bruno Henrique', 328, 'M', 56, True, False, 37, ('Passe', 'Chute Longo')),
    ('Vitão', 328, 'Z', 56, True, False, 26, ('Marcação', 'Cabeceio')),

    # Bahia (ID 90)
    ('Éverton Ribeiro', 90, 'M', 57, True, False, 37, ('Técnica', 'Passe')),
    ('Cauly', 90, 'M', 57, True, False, 31, ('Drible', 'Passe')),
    ('Jean Lucas', 90, 'M', 56, True, False, 28, ('Passe', 'Força')),
    ('Thaciano', 90, 'M', 56, True, False, 31, ('Força', 'Finalização')),
    ('Luciano Juba', 90, 'L', 56, True, False, 27, ('Cruzamento', 'Chute Longo')),

    # Fortaleza (ID 265)
    ('Juan Martín Lucero', 265, 'A', 57, True, False, 35, ('Finalização', 'Posicionamento')),
    ('Tomás Pochettino', 265, 'M', 56, True, False, 30, ('Passe', 'Chute Longo')),
    ('Tinga', 265, 'Z', 56, True, False, 33, ('Marcação', 'Velocidade')),
    ('João Ricardo', 265, 'G', 56, True, False, 38, ('Reflexo', 'Elasticidade')),
    ('Moisés', 265, 'A', 56, True, False, 30, ('Velocidade', 'Finalização')),

    # Athletico-PR (ID 79)
    ('Fernandinho', 79, 'M', 57, True, False, 41, ('Marcação', 'Liderança')),
    ('Nikão', 79, 'M', 56, True, False, 34, ('Chute Longo', 'Passe')),
    ('Pablo', 79, 'A', 56, True, False, 34, ('Finalização', 'Cabeceio')),

    # Santos (ID 568)
    ('Giuliano', 568, 'M', 56, True, False, 36, ('Passe', 'Técnica')),
    ('Willian Arão', 568, 'M', 56, True, False, 34, ('Marcação', 'Cabeceio')),
    ('Rony', 568, 'A', 56, True, False, 31, ('Velocidade', 'Força')),
]

def fix_famous_players():
    teams_path = ROOT / 'data/teams.json'
    teams_data_path = ROOT / 'data/teams_data.js'
    
    with open(teams_path, 'r', encoding='utf-8') as f:
        teams = json.load(f)
    
    teams_by_id = {t['id']: t for t in teams}

    # 1. Relocate displaced iconic players to their true club
    def find_and_remove_player(search_name, preferred_origin_cid=None):
        target_norm = normalise(search_name)
        candidates = []
        for t in teams:
            for p in t['players']:
                if normalise(p['name']) == target_norm or normalise(p.get('fullName', '')) == target_norm:
                    candidates.append((t, p))
        if not candidates:
            # Substring match if exact match not found
            for t in teams:
                for p in t['players']:
                    if target_norm in normalise(p['name']) or target_norm in normalise(p.get('fullName', '')):
                        candidates.append((t, p))
        if not candidates:
            return None
        chosen = None
        if preferred_origin_cid is not None:
            for t, p in candidates:
                if t['id'] == preferred_origin_cid:
                    chosen = (t, p)
                    break
        if not chosen:
            chosen = candidates[0]
        orig_t, orig_p = chosen
        orig_t['players'] = [p for p in orig_t['players'] if p['id'] != orig_p['id']]
        return orig_p

    def ensure_player_in_club(p_data, target_cid):
        target_team = teams_by_id[target_cid]
        target_team['players'] = [p for p in target_team['players'] if p['id'] != p_data['id'] and normalise(p['name']) != normalise(p_data['name'])]
        target_team['players'].append(p_data)

    RELOCATIONS = [
        ('Hulk', 260, 77),                  # Fluminense -> Atlético-MG
        ('Estêvão', 161, 487),              # Chelsea -> Palmeiras
        ('Raphael Veiga', 48, 487),         # América -> Palmeiras
        ('Matheus Pereira', 176, 190),      # Corinthians -> Cruzeiro
        ('Pablo Vegetti', 156, 667),        # Cerro Porteño -> Vasco
        ('Philippe Coutinho', 568, 667),    # Santos -> Vasco
        ('Luiz Henrique', None, 121),       # Avaí/Zenit -> Botafogo
        ('Thiago Almada', 550, 121),        # River Plate -> Botafogo
        ('Kevin De Bruyne', 454, 410),      # Napoli -> Manchester City
        ('Rodri', 97, 410),                 # Barcelona -> Manchester City
        ('Luka Modric', 432, 535),          # Milan -> Real Madrid
        ('Gabriel Barbosa', 568, 255),      # Santos -> Flamengo
        ('Cássio', 46, 190),                # América-MG -> Cruzeiro
        ('Enner Valencia', 113, 328),       # Boca Juniors -> Internacional
        ('Rafael Borré', 550, 328),         # River Plate -> Internacional
        ('Jhon Arias', 487, 260),           # Palmeiras -> Fluminense
        ('Guilherme Arana', 260, 77),       # Fluminense -> Atlético-MG
        ('Paulinho', 487, 77),              # Palmeiras -> Atlético-MG
        ('Marc-André ter Stegen', 14, 97),  # Ajax -> Barcelona
        ('Dani Carvajal', 274, 535),        # Getafe -> Real Madrid
        ('Gerson', 190, 255),               # Cruzeiro -> Flamengo
        ('John Stones', 331, 410),          # Inter -> Manchester City
        ('Bradley Barcola', 394, 491),      # Liverpool -> PSG
        ('Christopher Nkunku', 383, 161),   # Leipzig -> Chelsea
        ('Aleksandar Mitrovic', 32, 42),    # Al-Rayyan -> Al-Hilal
        ('Aymeric Laporte', 73, 31),        # Athletic Bilbao -> Al Nassr
        ('Marcelo Brozovic', 33, 31),       # Al-Sadd -> Al Nassr
        ('Jefferson Savarino', 260, 121),   # Fluminense -> Botafogo
        ('Yeferson Soteldo', 260, 287),     # Fluminense -> Grêmio
        ('Cauly', 575, 90),                 # São Paulo -> Bahia
        ('Thaciano', 568, 90),              # Santos -> Bahia
        ('Agustín Marchesín', 113, 287),    # Boca Juniors -> Grêmio
        ('Dudu', 77, 487),                  # Atlético-MG -> Palmeiras
        ('Vitão', 255, 328),                # Flamengo -> Internacional
    ]

    for p_name, from_cid, to_cid in RELOCATIONS:
        p_obj = find_and_remove_player(p_name, from_cid)
        if p_obj:
            ensure_player_in_club(p_obj, to_cid)
            print(f'Relocated {p_name} to {teams_by_id[to_cid]["name"]}')

    # 2. Add legendary missing stars if not present in any club
    MISSING_LEGENDS = [
        ('Lionel Messi', 491, 'A', 64, 39, ('Drible', 'Passe'), 'espn_legacy_messi'),
        ('Robert Lewandowski', 97, 'A', 63, 38, ('Finalização', 'Cabeceio'), 'espn_legacy_lewandowski'),
        ('Mohamed Salah', 394, 'A', 64, 34, ('Velocidade', 'Finalização'), 'espn_legacy_salah'),
        ('Antoine Griezmann', 76, 'A', 62, 35, ('Técnica', 'Finalização'), 'espn_legacy_griezmann'),
        ('Dimitri Payet', 667, 'M', 57, 39, ('Passe', 'Visão'), 'espn_legacy_payet'),
        ('Igor Jesus', 121, 'A', 58, 25, ('Força', 'Finalização'), 'espn_legacy_igor_jesus'),
        ('Karim Benzema', 535, 'A', 61, 38, ('Finalização', 'Técnica'), 'espn_legacy_benzema'),
        ('Rodrigo De Paul', 76, 'M', 61, 32, ('Marcação', 'Passe'), 'espn_legacy_depaul'),
        ('Son Heung-min', 638, 'A', 61, 34, ('Finalização', 'Velocidade'), 'espn_legacy_son'),
        ('Nicolas Jackson', 161, 'A', 60, 25, ('Velocidade', 'Finalização'), 'espn_legacy_jackson'),
        ('Casemiro', 411, 'M', 60, 34, ('Marcação', 'Força'), 'espn_legacy_casemiro'),
        ('Granit Xhaka', 103, 'M', 60, 34, ('Passe', 'Liderança'), 'espn_legacy_xhaka'),
        ('Igor Coronado', 176, 'M', 56, 34, ('Técnica', 'Passe'), 'espn_legacy_coronado'),
        ('Gabriel Veron', 190, 'A', 56, 24, ('Velocidade', 'Drible'), 'espn_legacy_veron'),
        ('Nikão', 79, 'M', 56, 34, ('Chute Longo', 'Passe'), 'espn_legacy_nikao'),
        ('Leroy Sané', 104, 'A', 61, 30, ('Velocidade', 'Finalização'), 'espn_legacy_sane'),
        ('Malcom', 42, 'A', 60, 29, ('Drible', 'Finalização'), 'espn_legacy_malcom'),
        ('Diego Costa', 287, 'A', 57, 38, ('Força', 'Finalização'), 'espn_legacy_diego_costa'),
        ('Franco Cristaldo', 287, 'M', 56, 30, ('Passe', 'Técnica'), 'espn_legacy_cristaldo'),
        ('Juan Martín Lucero', 265, 'A', 57, 35, ('Finalização', 'Posicionamento'), 'espn_legacy_lucero'),
        ('Tomás Pochettino', 265, 'M', 56, 30, ('Passe', 'Chute Longo'), 'espn_legacy_pochettino'),
        ('Tinga', 265, 'Z', 56, 33, ('Marcação', 'Velocidade'), 'espn_legacy_tinga'),
        ('Moisés', 265, 'A', 56, 30, ('Velocidade', 'Finalização'), 'espn_legacy_moises'),
        ('Fernandinho', 79, 'M', 57, 41, ('Marcação', 'Liderança'), 'espn_legacy_fernandinho'),
        ('Pablo', 79, 'A', 56, 34, ('Finalização', 'Cabeceio'), 'espn_legacy_pablo'),
        ('Giuliano', 568, 'M', 56, 36, ('Passe', 'Técnica'), 'espn_legacy_giuliano'),
        ('Marlon Freitas', 121, 'M', 56, 31, ('Passe', 'Liderança'), 'espn_legacy_marlon_freitas'),
        ('John', 121, 'G', 56, 28, ('Reflexo', 'Elasticidade'), 'espn_legacy_john_gk'),
    ]

    star_player_ids = set()
    top_world_ids = set()

    for p_name, target_cid, pos, strength, age, traits, p_id in MISSING_LEGENDS:
        target_norm = normalise(p_name)
        already = False
        target_team = teams_by_id[target_cid]
        for p in target_team['players']:
            if normalise(p['name']) == target_norm:
                already = True
                star_player_ids.add(p['id'])
                if target_cid in (491, 97, 394, 76, 667, 535, 638, 161, 411, 103, 42, 104):
                    top_world_ids.add(p['id'])
                break
        if not already:
            is_top = target_cid in (491, 97, 394, 76, 667, 535, 638, 161, 411, 103, 42, 104)
            new_player = {
                'id': p_id,
                'name': p_name,
                'fullName': p_name,
                'age': age,
                'ageEstimated': False,
                'birthDate': None,
                'position': pos,
                'positionIndex': {'G': 0, 'L': 1, 'Z': 2, 'M': 3, 'A': 4}[pos],
                'sourcePosition': pos,
                'positionDetailEstimated': False,
                'side': 'C',
                'sideEstimated': False,
                'isStarter': True,
                'isStar': True,
                'isTopWorld': is_top,
                'cr1': traits[0],
                'cr2': traits[1],
                'strength': strength,
                'value': calc_value(strength, age, True, is_top),
                'wage': 35000,
                'energy': 100,
                'morale': 100,
                'goals': 0, 'assists': 0, 'yellowCards': 0, 'redCards': 0, 'matchesPlayed': 0,
                'injuredWeeks': 0, 'suspendedWeeks': 0,
                'jerseyNumber': None, 'nationality': None,
                'attributesSource': 'curated-elite',
                'attributesFromLegacy': True
            }
            new_player['wage'] = calc_wage(new_player['value'], strength)
            target_team['players'].append(new_player)
            star_player_ids.add(new_player['id'])
            if is_top:
                top_world_ids.add(new_player['id'])
            print(f'Added missing player: {p_name} to {target_team["name"]}')

    # 3. Apply registry attributes strictly
    updated_count = 0
    not_matched = []

    for name, target_cid, pos, strength, is_star, is_top_world, def_age, traits in FAMOUS_REGISTRY:
        norm_name = normalise(name)
        matched_player = None

        if target_cid is not None:
            team = teams_by_id[target_cid]
            for p in team['players']:
                p_norm = normalise(p['name'])
                p_fn_norm = normalise(p.get('fullName', ''))
                if p_norm == norm_name or p_fn_norm == norm_name:
                    matched_player = p
                    break
            if not matched_player:
                # Substring match within target team only
                for p in team['players']:
                    p_norm = normalise(p['name'])
                    if norm_name in p_norm and (pos is None or p.get('position') == pos):
                        matched_player = p
                        break
        else:
            # Exact match across all teams
            for t in teams:
                for p in t['players']:
                    if normalise(p['name']) == norm_name and (pos is None or p.get('position') == pos):
                        matched_player = p
                        break
                if matched_player:
                    break

        if not matched_player:
            not_matched.append(f"{name} (Target CID: {target_cid})")
            continue

        if name == 'Cássio' and target_cid == 190:
            matched_player['age'] = 39

        matched_player['strength'] = strength
        matched_player['isStar'] = is_star
        matched_player['isTopWorld'] = is_top_world
        if traits:
            matched_player['cr1'], matched_player['cr2'] = traits
        age = matched_player.get('age') or def_age
        matched_player['value'] = calc_value(strength, age, is_star, is_top_world)
        matched_player['wage'] = calc_wage(matched_player['value'], strength)
        star_player_ids.add(matched_player['id'])
        if is_top_world:
            top_world_ids.add(matched_player['id'])
        updated_count += 1

    print(f'\nTotal registry players updated: {updated_count}')
    if not_matched:
        print(f'Unmatched entries ({len(not_matched)}):', not_matched)

    # 4. Verify all IDs are unique
    all_ids = [p['id'] for t in teams for p in t['players']]
    if len(all_ids) != len(set(all_ids)):
        seen = set()
        duplicates = 0
        for t in teams:
            for p in t['players']:
                if p['id'] in seen:
                    duplicates += 1
                    p['id'] = f"{p['id']}_dup{duplicates}"
                seen.add(p['id'])
        print(f'Resolved {duplicates} duplicate IDs.')

    # 5. Clean up any accidental star flags from non-registry players
    cleaned_stars = 0
    for t in teams:
        for p in t['players']:
            if p['id'] in star_player_ids:
                p['isStar'] = True
                p['isTopWorld'] = (p['id'] in top_world_ids)
            else:
                if p.get('isStar') or p.get('isTopWorld'):
                    cleaned_stars += 1
                p['isStar'] = False
                p['isTopWorld'] = False
            # Ensure value matches formula
            s = int(p.get('strength', 30))
            a = int(p.get('age', 26))
            star = bool(p.get('isStar'))
            top = bool(p.get('isTopWorld'))
            p['value'] = calc_value(s, a, star, top)
            p['wage'] = calc_wage(p['value'], s)

    print(f'Cleaned {cleaned_stars} stale star flags.')

    # 6. Verify minimum players and goalkeepers
    for t in teams:
        if len(t['players']) < 15:
            print(f"WARNING: Team {t['name']} has {len(t['players'])} players!")
        if not any(p.get('position') == 'G' for p in t['players']):
            print(f"WARNING: Team {t['name']} has no GK!")

    # 7. Write data/teams.json and data/teams_data.js
    text_json = json.dumps(teams, ensure_ascii=False, indent=2) + '\n'
    atomic_write(teams_path, text_json)
    
    text_js = 'window.BRASFOOT_TEAMS = ' + json.dumps(teams, ensure_ascii=False, separators=(',', ':')) + ';\n'
    atomic_write(teams_data_path, text_js)
    
    print('Successfully updated teams.json and teams_data.js!')

def main():
    fix_famous_players()

if __name__ == '__main__':
    main()
