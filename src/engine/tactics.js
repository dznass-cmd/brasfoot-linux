// Shared tactical settings for the lineup, live controls and simulation.
class TacticsEngine {
  static OPTIONS = {
    passing: { label: 'Passes', values: { balanced: 'Mistos', short: 'Curtos', direct: 'Diretos' } },
    focus: { label: 'Direção do ataque', values: { balanced: 'Variada', center: 'Pelo meio', wings: 'Pelas pontas', left: 'Pela esquerda', right: 'Pela direita' } },
    tempo: { label: 'Ritmo', values: { normal: 'Normal', slow: 'Cadenciado', fast: 'Rápido' } },
    pressing: { label: 'Pressão', values: { medium: 'Média', low: 'Baixa', high: 'Alta' } },
    line: { label: 'Linha defensiva', values: { normal: 'Normal', deep: 'Recuada', high: 'Adiantada' } },
    tackling: { label: 'Entradas', values: { normal: 'Normais', careful: 'Cautelosas', hard: 'Firmes' } },
    transition: { label: 'Transição', values: { balanced: 'Equilibrada', counter: 'Contra-ataque', retain: 'Conservar a bola' } }
  };
  static DEFAULTS = { passing: 'balanced', focus: 'balanced', tempo: 'normal', pressing: 'medium', line: 'normal', tackling: 'normal', transition: 'balanced' };
  static KEYS = Object.keys(this.DEFAULTS);
  static effectCache = new WeakMap();
  static SET_PIECES = { penalty: 'Pênaltis', freeKick: 'Faltas diretas', corner: 'Escanteios' };
  static PRESETS = {
    balanced: { label: 'Equilibrado', style: 'Equilibrado', instructions: {}, help: 'Distribui os ataques e mantém ritmo, pressão e linha intermediários.' },
    possession: { label: 'Posse de bola', style: 'Equilibrado', instructions: { passing: 'short', tempo: 'slow', transition: 'retain', focus: 'center' }, help: 'Mais circulação e precisão, com menos ataques rápidos.' },
    counter: { label: 'Contra-ataque', style: 'Equilibrado', instructions: { passing: 'direct', pressing: 'low', line: 'deep', transition: 'counter', tempo: 'fast' }, help: 'Recuo e saída rápida. Cede posse e tenta explorar os espaços do adversário.' },
    highPress: { label: 'Pressão alta', style: 'Ofensivo', instructions: { pressing: 'high', line: 'high', tempo: 'fast', tackling: 'hard' }, help: 'Aumenta a disputa no meio e o ritmo, com mais desgaste, faltas e espaço nas costas.' },
    wide: { label: 'Bola aérea', style: 'Ofensivo', instructions: { passing: 'direct', focus: 'wings', tempo: 'fast' }, help: 'Busca os lados e mais cruzamentos; favorece atletas com cabeceio e cruzamento.' },
    protect: { label: 'Segurar resultado', style: 'Defensivo', instructions: { passing: 'short', tempo: 'slow', pressing: 'low', line: 'deep', tackling: 'careful', transition: 'retain' }, help: 'Reduz o ritmo e o risco das entradas, com menor presença ofensiva.' }
  };
  static normalize(value = {}) {
    return Object.fromEntries(Object.entries(this.DEFAULTS).map(([key, fallback]) => [key,
      Object.hasOwn(this.OPTIONS[key].values, value?.[key]) ? value[key] : fallback]));
  }
  static valid(value) {
    return value && typeof value === 'object' && Object.entries(value).every(([key, setting]) => Object.hasOwn(this.OPTIONS, key) && Object.hasOwn(this.OPTIONS[key].values, setting));
  }
  static takers(value = {}, players = []) {
    return Object.fromEntries(Object.keys(this.SET_PIECES).map(key => [key, players.find(player => String(player.id) === String(value?.[key]))?.id ?? null]));
  }
  static preset(id) {
    const plan = this.PRESETS[id] || this.PRESETS.balanced;
    return { style: plan.style, instructions: this.normalize(plan.instructions) };
  }
  static summary(value) {
    const normalized = this.normalize(value);
    return Object.keys(this.OPTIONS).filter(key => normalized[key] !== this.DEFAULTS[key]).map(key => this.OPTIONS[key].values[normalized[key]]).join(' · ') || 'Instruções equilibradas';
  }
  static effects(value) {
    if (!value || typeof value !== 'object') value = this.DEFAULTS;
    const cached = this.effectCache.get(value);
    if (cached && this.KEYS.every((key, index) => cached.values[index] === value[key])) return cached.effects;
    const t = this.normalize(value);
    const e = { attack: 1, defense: 1, midfield: 1, energy: 1, passes: 1, accuracy: 0, possession: 0, attacks: 1, fouls: 1, cards: 1, tackling: 1, opponentAccuracy: 0 };
    if (t.passing === 'short') { e.passes *= 1.18; e.accuracy += .035; e.midfield *= 1.04; e.attack *= .97; }
    if (t.passing === 'direct') { e.passes *= .82; e.accuracy -= .045; e.attack *= 1.04; e.midfield *= .97; }
    if (t.tempo === 'slow') { e.attacks *= .86; e.energy *= .91; e.passes *= 1.08; e.accuracy += .015; }
    if (t.tempo === 'fast') { e.attacks *= 1.15; e.energy *= 1.16; e.accuracy -= .02; }
    if (t.pressing === 'high') { e.midfield *= 1.04; e.defense *= .98; e.energy *= 1.23; e.fouls *= 1.2; e.tackling *= 1.08; e.opponentAccuracy = -.025; }
    if (t.pressing === 'low') { e.midfield *= .97; e.defense *= 1.03; e.energy *= .9; e.fouls *= .85; }
    if (t.line === 'deep') { e.defense *= 1.05; e.midfield *= .94; e.attack *= .94; }
    if (t.line === 'high') { e.defense *= 1.03; e.midfield *= 1.035; }
    if (t.tackling === 'hard') { e.tackling *= 1.1; e.fouls *= 1.4; e.cards *= 1.25; }
    if (t.tackling === 'careful') { e.tackling *= .93; e.fouls *= .7; e.cards *= .8; }
    if (t.transition === 'counter') { e.possession -= 3; e.attack *= 1.02; }
    if (t.transition === 'retain') { e.possession += 3; e.passes *= 1.12; e.accuracy += .02; e.attacks *= .9; e.energy *= .95; }
    Object.freeze(e);
    this.effectCache.set(value, { values: this.KEYS.map(key => value[key]), effects: e });
    return e;
  }
  static laneWeight(player, slot, focus) {
    const side = slot?.side || player.side || 'C';
    if (focus === 'left' || focus === 'right') return side === (focus === 'left' ? 'E' : 'D') ? 1.9 : side === 'C' ? 1 : .45;
    if (focus === 'wings') return side !== 'C' || player.position === 'L' ? 1.6 : .7;
    if (focus === 'center') return side === 'C' ? 1.5 : .6;
    return 1;
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = TacticsEngine;
else window.TacticsEngine = TacticsEngine;
