/**
 * Tabletop Tracker Engine - Main Application Logic
 */

// --- Global State ---
const state = {
    gameEngine: 'massive-darkness-2',
    players: [],
    monsters: [],
    turnDone: {}  // track turn state per player id
};

// --- Character Library ---
const CharacterLibrary = {
    raw: null,
    loaded: false,
    async load() {
        if (this.loaded) return;
        try {
            const engine = document.querySelector('#app')?.dataset?.gameEngine || 'massive-darkness-2';
            const resp = await fetch(`./src/data/${engine}/characters.base-game.json`);
            this.raw = await resp.json();
            this.loaded = true;
            console.log(`CharacterLibrary: Loaded ${this.getList().length} characters from ${this.raw.classes.length} classes.`);
        } catch (e) { console.error('CharacterLibrary: Failed to load:', e); }
    },
    /** Returns all characters flat with class_name attached */
    getList() {
        if (!this.raw || !this.raw.classes) return [];
        const all = [];
        this.raw.classes.forEach(cls => {
            cls.characters.forEach(ch => {
                all.push({
                    id: `${cls.class_name}-${ch.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    name: ch.name,
                    className: cls.class_name,
                    classSource: cls.source,
                    starting_hp: ch.starting_hp,
                    starting_mp: ch.starting_mp,
                    ability: ch.ability
                });
            });
        });
        return all;
    },
    get(id) { return this.getList().find(c => c.id === id) || null; },
    /** Get the universal level table entry for a given level */
    getLevelEntry(level) {
        if (!this.raw || !this.raw.level_table) return null;
        return this.raw.level_table.find(l => l.level === level) || null;
    },
    /** Get the next level entry after current level */
    getNextLevelEntry(level) {
        return this.getLevelEntry(level + 1);
    },
    /** Calculate cumulative stat_bonus for all levels up to (and including) the given level */
    getCumulativeBonus(level) {
        let hp = 0, mp = 0;
        if (!this.raw || !this.raw.level_table) return { hp, mp };
        this.raw.level_table.forEach(l => {
            if (l.level <= level) {
                hp += l.stat_bonus.hp;
                mp += l.stat_bonus.mp;
            }
        });
        return { hp, mp };
    }
};

// --- Data Persistence ---
const Storage = {
    save(key, data) {
        try { localStorage.setItem(`tt_${key}`, JSON.stringify(data)); } catch (e) { console.error('Storage Save Error:', e); }
    },
    load(key) {
        try {
            const data = localStorage.getItem(`tt_${key}`);
            const parsed = data ? JSON.parse(data) : null;
            return (Array.isArray(parsed) && parsed.length > 0) ? parsed : null;
        } catch (e) { return null; }
    }
};

// --- Helpers ---
let idCounter = Date.now();
function uniqueId() { return `mob-${idCounter++}`; }

function getHighestPlayerLevel() {
    if (!state.players.length) return 1;
    return Math.max(...state.players.map(p => p.level));
}

function getMinionCount() {
    return 1 + state.players.length;
}

// --- Frame Toggle (AND) ---
function toggleFrame(frameId) {
    const frame = document.getElementById(frameId);
    if (!frame) return;
    const isCollapsed = frame.classList.contains('collapsed');
    frame.classList.toggle('collapsed', !isCollapsed);
    frame.classList.toggle('expanded', isCollapsed);
    const icon = frame.querySelector('.hud-toggle-icon');
    if (icon) icon.textContent = isCollapsed ? '▲' : '▼';
}

// --- Layout Toggle ---
function toggleLayout() {
    const container = document.getElementById('frames-container');
    if (!container) return;
    const isVertical = container.classList.contains('layout-vertical');
    container.classList.remove('layout-vertical', 'layout-horizontal');
    container.classList.add(isVertical ? 'layout-horizontal' : 'layout-vertical');
    try { localStorage.setItem('tt_layout', isVertical ? 'horizontal' : 'vertical'); } catch(e) {}
}

// --- Level Up ---
function levelUp() {
    const player = state.players.find(p => p.id === 'player1');
    if (!player) return;

    const nextEntry = CharacterLibrary.getNextLevelEntry(player.level);
    if (!nextEntry) return; // already max level

    // Check if player has enough XP
    if (player.currentXp < nextEntry.xp_required) return;

    const overflowXp = player.currentXp - nextEntry.xp_required;
    player.level++;
    player.currentXp = Math.max(0, overflowXp);

    // Recalculate max stats from starting base + cumulative bonuses
    const bonus = CharacterLibrary.getCumulativeBonus(player.level);
    player.maxHp = player.starting_hp + bonus.hp;
    player.maxMana = player.starting_mp + bonus.mp;

    // Update maxXp to next level's requirement
    const nextNext = CharacterLibrary.getNextLevelEntry(player.level);
    player.maxXp = nextNext ? nextNext.xp_required : 0;

    Storage.save('players', state.players);
    renderPlayers();
    renderMonsters();
    updateLevelUpButton();
}

function updateLevelUpButton() {
    const btn = document.getElementById('btn-level-up');
    if (!btn) return;
    const player = state.players.find(p => p.id === 'player1');
    if (player && player.maxXp > 0 && player.currentXp >= player.maxXp) {
        btn.style.display = 'inline-block';
    } else {
        btn.style.display = 'none';
    }
}

// --- Player Stats ---
function updatePlayerStat(characterId, statType, amount) {
    const player = state.players.find(p => p.id === characterId);
    if (!player) return;

    if (statType === 'hp') {
        player.currentHp = Math.max(0, Math.min(player.maxHp, player.currentHp + amount));
    } else if (statType === 'mp') {
        player.currentMana = Math.max(0, Math.min(player.maxMana, player.currentMana + amount));
    } else if (statType === 'xp') {
        player.currentXp = Math.max(0, player.currentXp + amount);
    }
    
    Storage.save('players', state.players);
    renderPlayers();
    renderMonsters();
    updateLevelUpButton();
}

// --- Character Selection ---
function selectCharacter(charId) {
    if (!charId) return;
    const charDef = CharacterLibrary.get(charId);
    if (!charDef) return;

    // If we already have this character, just re-select it
    const existing = state.players.find(p => p.libId === charId);
    if (existing) return;

    // Add as a new character
    addCharacterById(charId);
}

function addCharacterById(charId) {
    const charDef = CharacterLibrary.get(charId);
    if (!charDef) return;
    const nextLevel = CharacterLibrary.getNextLevelEntry(1);
    const usedIds = new Set(state.players.map(p => p.libId));
    if (usedIds.has(charId)) return;
    const newId = `player${state.players.length + 1}`;
    state.players.push({
        id: newId,
        libId: charDef.id,
        name: charDef.name,
        className: charDef.className,
        classSource: charDef.classSource,
        starting_hp: charDef.starting_hp,
        starting_mp: charDef.starting_mp,
        level: 1,
        currentHp: charDef.starting_hp,
        maxHp: charDef.starting_hp,
        currentMana: charDef.starting_mp,
        maxMana: charDef.starting_mp,
        currentXp: 0,
        maxXp: nextLevel ? nextLevel.xp_required : 0
    });
    Storage.save('players', state.players);
    renderPlayers();
    renderMonsters();
    updateLevelUpButton();
}

// --- Add Character (random) ---
function addCharacter() {
    const usedIds = new Set(state.players.map(p => p.libId));
    const available = CharacterLibrary.getList().filter(c => !usedIds.has(c.id));
    if (available.length === 0) return;
    const pick = available[Math.floor(Math.random() * available.length)];
    addCharacterById(pick.id);
}

// --- Turn toggle ---
function toggleTurn(charId) {
    state.turnDone[charId] = !state.turnDone[charId];
    renderPlayers();
}

// --- Potion click ---
function adjustPotion(potionType, delta, chipElement) {
    const chip = chipElement || document.getElementById(`${potionType}-potion`);
    if (!chip) return;
    const countEl = chip.querySelector('.potion-count');
    let count = parseInt(countEl.textContent) || 0;
    count = Math.max(0, Math.min(5, count + delta));
    countEl.textContent = count;
}

// --- Monster Spawn ---
function spawnMonster(type, libId) {
    const tier = getHighestPlayerLevel();
    const tierData = MonsterLibrary.getTierData(type, libId, tier);
    if (!tierData) return;
    const libEntry = MonsterLibrary.get(libId, type);
    if (!libEntry) return;

    const id = uniqueId();
    if (type === 'group') {
        const minionCount = getMinionCount();
        state.monsters.push({ id, type: 'mob-type', libId, name: libEntry.name, tier, treasure: tierData.treasure, baseHp: tierData.hp, minionCount, currentHp: tierData.hp * minionCount, totalHp: tierData.hp * minionCount });
    } else {
        state.monsters.push({ id, type: 'boss-type', libId, name: libEntry.name, tier, treasure: tierData.treasure, currentHp: tierData.hp, maxHp: tierData.hp });
    }
    Storage.save('monsters', state.monsters);
    renderMonsters();
}

// --- Monster Stats ---
function adjustMobHealth(mobId, amount) {
    const m = state.monsters.find(x => x.id === mobId);
    if (!m) return;
    if (m.type === 'mob-type') m.currentHp = Math.max(0, Math.min(m.totalHp, m.currentHp + amount));
    else m.currentHp = Math.max(0, Math.min(m.maxHp, m.currentHp + amount));
    Storage.save('monsters', state.monsters);
    renderMonsters();
}

function removeMob(mobId) {
    state.monsters = state.monsters.filter(m => m.id !== mobId);
    Storage.save('monsters', state.monsters);
    renderMonsters();
}

// --- Player Rendering ---
function renderPlayers() {
    renderPlayerGrid();
    renderFocusedPlayer();
    renderPlayerDetailCards();
}

function renderPlayerGrid() {
    const grid = document.getElementById('player-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    state.players.forEach(p => {
        const hpPct = p.maxHp > 0 ? (p.currentHp / p.maxHp * 100) : 0;
        const mpPct = p.maxMana > 0 ? (p.currentMana / p.maxMana * 100) : 0;
        const isLow = p.currentHp <= p.maxHp * 0.25;
        const canLevel = p.currentXp >= p.maxXp;
        const isTurnDone = state.turnDone[p.id] || false;

        const card = document.createElement('div');
        card.className = 'player-mini-card';
        card.dataset.playerId = p.id;
        card.innerHTML = `
            <div>
                <span class="mini-name">${p.name}</span>
                <span class="mini-class">${p.className || ''}</span>
            </div>
            <div class="mini-stat-row">
                <span class="mini-label">HP</span>
                <span class="mini-value">${p.currentHp}/${p.maxHp}</span>
                <div class="mini-bar-bg mini-bar-hp"><div class="mini-bar-fill" style="width:${hpPct}%"></div></div>
            </div>
            <div class="mini-stat-row">
                <span class="mini-label">MP</span>
                <span class="mini-value">${p.currentMana}/${p.maxMana}</span>
                <div class="mini-bar-bg mini-bar-mp"><div class="mini-bar-fill" style="width:${mpPct}%"></div></div>
            </div>
            <div class="mini-stat-row">
                <span class="mini-level">Lv.${p.level}</span>
                ${isLow ? '<span class="mini-alert">⚠ LOW</span>' : ''}
                ${canLevel ? '<span class="mini-levelup">⭐ LVL UP!</span>' : ''}
                <button class="mini-turn-btn ${isTurnDone ? 'toggled' : ''}" data-player-id="${p.id}">${isTurnDone ? '✓ DONE' : '✓'}</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderFocusedPlayer() {
    const player1 = state.players.find(p => p.id === 'player1');
    const card = document.querySelector('.focused-character-card[data-character-id="player1"]');
    if (!card) return;
    
    // Hide card if no player1 exists
    if (!player1) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';
    
    const nameEl = card.querySelector('.char-name');
    if (nameEl) nameEl.textContent = player1.name;
    const lvlEl = card.querySelector('.char-lvl');
    if (lvlEl) lvlEl.textContent = player1.level;

    const heroName = document.querySelector('.player-frame-header .frame-title');
    if (heroName) heroName.textContent = 'PLAYER STATS';

    const isTurnDone = state.turnDone['player1'] || false;
    const turnBtn = card.querySelector('.turn-done-btn');
    if (turnBtn) {
        turnBtn.classList.toggle('toggled', isTurnDone);
        turnBtn.textContent = isTurnDone ? '✓ DONE' : '✓ TURN';
    }

    updateSegmentedBar(card.querySelector('.hp-vector .bar-container'), player1.currentHp, player1.maxHp, 'hp');
    updateSegmentedBar(card.querySelector('.mana-vector .bar-container'), player1.currentMana, player1.maxMana, 'mp');
    updateSegmentedBar(card.querySelector('.xp-vector .bar-container'), player1.currentXp, player1.maxXp, 'xp');
}

function renderPlayerDetailCards() {
    const container = document.getElementById('player-detail-cards');
    if (!container) return;
    container.innerHTML = '';

    state.players.forEach(p => {
        if (p.id === 'player1') return; // player1 is rendered as the focused card in HTML

        const hpPct = p.maxHp > 0 ? (p.currentHp / p.maxHp * 100) : 0;
        const mpPct = p.maxMana > 0 ? (p.currentMana / p.maxMana * 100) : 0;
        const isTurnDone = state.turnDone[p.id] || false;

        const card = document.createElement('div');
        card.className = 'focused-character-card detail-card';
        card.dataset.characterId = p.id;
        card.innerHTML = `
            <div class="focused-header">
                <h2><span class="char-name">${p.name}</span> <span class="level-indicator">Level <span class="char-lvl">${p.level}</span></span></h2>
                <div class="focused-actions">
                    <button class="btn btn-step turn-done-btn ${isTurnDone ? 'toggled' : ''}" data-player-id="${p.id}">${isTurnDone ? '✓ DONE' : '✓ TURN'}</button>
                    <button class="btn alert-btn remove-player-trigger" data-player-id="${p.id}">REMOVE</button>
                </div>
            </div>
            <div class="potion-row">
                <span class="potion-chip detail-potion-chip" data-potion="hp" data-player-id="${p.id}">🧪 <span class="potion-count">2</span></span>
                <span class="potion-chip detail-potion-chip" data-potion="mp" data-player-id="${p.id}">🔮 <span class="potion-count">1</span></span>
            </div>
            
            <div class="stat-slider-group">
                <div class="vector-control hp-vector">
                    <label>Health Points</label>
                    <div class="slider-interaction">
                        <button class="btn btn-dmg" data-character-id="${p.id}" data-stat-type="hp" data-amount="-1">DMG</button>
                        <div class="bar-container"></div>
                        <button class="btn btn-heal" data-character-id="${p.id}" data-stat-type="hp" data-amount="1">HEAL</button>
                    </div>
                </div>

                <div class="vector-control mana-vector">
                    <label>Mana Pool</label>
                    <div class="slider-interaction">
                        <button class="btn btn-dmg" data-character-id="${p.id}" data-stat-type="mp" data-amount="-1">DMG</button>
                        <div class="bar-container"></div>
                        <button class="btn btn-heal" data-character-id="${p.id}" data-stat-type="mp" data-amount="1">HEAL</button>
                    </div>
                </div>

                <div class="vector-control xp-vector">
                    <label>Experience (Progress Tracker)</label>
                    <div class="slider-interaction">
                        <button class="btn btn-step" data-character-id="${p.id}" data-stat-type="xp" data-amount="-1">-1</button>
                        <div class="bar-container readonly"></div>
                        <button class="btn btn-step" data-character-id="${p.id}" data-stat-type="xp" data-amount="1">+1</button>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);

        // Update bars
        updateSegmentedBar(card.querySelector('.hp-vector .bar-container'), p.currentHp, p.maxHp, 'hp');
        updateSegmentedBar(card.querySelector('.mana-vector .bar-container'), p.currentMana, p.maxMana, 'mp');
        updateSegmentedBar(card.querySelector('.xp-vector .bar-container'), p.currentXp, p.maxXp, 'xp');
    });
}

// --- Monster Rendering ---
function renderMonsters() {
    const container = document.getElementById('monster-cards-container');
    if (!container) return;
    container.innerHTML = '';

    const mobs = state.monsters.filter(m => m.type === 'mob-type');
    const roamings = state.monsters.filter(m => m.type === 'boss-type');

    // Mob column
    const mobCol = document.createElement('div');
    mobCol.className = 'monster-column';
    mobCol.innerHTML = '<div class="monster-column-header">MOB GROUPS</div>';
    mobs.forEach(m => {
        const card = createMobCard(m);
        mobCol.appendChild(card);
    });
    container.appendChild(mobCol);

    // Roaming column
    const roamCol = document.createElement('div');
    roamCol.className = 'monster-column';
    roamCol.innerHTML = '<div class="monster-column-header">ROAMING BOSSES</div>';
    roamings.forEach(m => {
        const card = createRoamingCard(m);
        roamCol.appendChild(card);
    });
    container.appendChild(roamCol);

    updateMobSummary();
}

function createMobCard(m) {
    const card = document.createElement('div');
    card.className = 'monster-card mob-type';
    card.dataset.mobId = m.id;

    const baseHp = m.baseHp;
    let remainingDamage = m.totalHp - m.currentHp;
    let blocksHtml = '';

    for (let i = m.minionCount - 1; i >= 0; i--) {
        const dmg = Math.min(remainingDamage, baseHp);
        const hp = baseHp - dmg;
        remainingDamage -= dmg;

        let status, hpText;
        if (hp <= 0) { status = 'dead'; hpText = '[X]'; }
        else if (hp >= baseHp) { status = 'alive'; hpText = `${baseHp}/${baseHp}`; }
        else { status = 'partial'; hpText = `${hp}/${baseHp}`; }

        blocksHtml = `
            <div class="fig-compact-block ${status}">
                <span class="fig-hp-text">${hpText}</span>
            </div>
        ` + blocksHtml;
    }

    card.innerHTML = `
        <div class="monster-header">
            <h4>${m.name} <span class="sub-text">(Tier ${m.tier})</span></h4>
            <button class="btn alert-btn remove-mob-trigger" data-mob-id="${m.id}">REMOVE</button>
        </div>
        <div class="mob-health-breakdown">
            <div class="entity-health-block encounter-bar">
                <div class="bar-container"></div>
            </div>
            <div class="fig-compact-row">${blocksHtml}</div>
        </div>
        <div class="monster-controls">
            <button class="btn btn-dmg" data-mob-id="${m.id}" data-amount="-5">-5 DMG</button>
            <button class="btn btn-dmg" data-mob-id="${m.id}" data-amount="-1">-1 DMG</button>
            <button class="btn btn-heal" data-mob-id="${m.id}" data-amount="1">+1 HEAL</button>
            ${m.treasure > 0 ? `<span class="treasure-badge">✦ ${m.treasure} TR</span>` : ''}
        </div>
    `;
    // Use updateSegmentedBar for the encounter bar (one segment per HP)
    updateSegmentedBar(card.querySelector('.encounter-bar .bar-container'), m.currentHp, m.totalHp, 'mob');
    return card;
}

function createRoamingCard(m) {
    const card = document.createElement('div');
    card.className = 'monster-card boss-type';
    card.dataset.mobId = m.id;
    card.innerHTML = `
        <div class="monster-header">
            <h4>${m.name} <span class="sub-text">(Tier ${m.tier})</span></h4>
            <button class="btn alert-btn remove-mob-trigger" data-mob-id="${m.id}">REMOVE</button>
        </div>
        <div class="vector-control hp-vector">
            <div class="bar-container"></div>
        </div>
        <div class="monster-controls">
            <button class="btn btn-dmg-macro" data-mob-id="${m.id}" data-amount="-10">-10</button>
            <button class="btn btn-dmg" data-mob-id="${m.id}" data-amount="-5">-5</button>
            <button class="btn btn-dmg" data-mob-id="${m.id}" data-amount="-1">-1</button>
            <button class="btn btn-heal" data-mob-id="${m.id}" data-amount="1">+1 HEAL</button>
            ${m.treasure > 0 ? `<span class="treasure-badge">✦ ${m.treasure} TR</span>` : ''}
        </div>
    `;
    updateSegmentedBar(card.querySelector('.bar-container'), m.currentHp, m.maxHp, 'boss');
    return card;
}

function updateMobSummary() {
    const mc = document.getElementById('mob-count');
    const fc = document.getElementById('figure-count');
    if (mc) mc.textContent = state.monsters.length;
    if (fc) {
        let f = 0;
        state.monsters.forEach(m => { f += m.type === 'mob-type' ? m.minionCount : 1; });
        fc.textContent = f;
    }
}

// --- Segmented Bar ---
function updateSegmentedBar(container, current, max, labelType) {
    if (!container) return;
    // Clear and rebuild
    container.classList.add('segmented');
    container.innerHTML = '';
    for (let i = 0; i < max; i++) {
        const seg = document.createElement('div');
        seg.className = 'segment';
        if (i < current) seg.classList.add('filled');
        container.appendChild(seg);
    }
    const overlay = document.createElement('span');
    overlay.className = 'bar-text';
    let s = '';
    if (labelType === 'xp') s = ' XP';
    else if (labelType === 'boss' || labelType === 'mob') s = ' HP';
    overlay.textContent = `${current} / ${max}${s}`;
    container.appendChild(overlay);
}

// --- Selectors ---
function populateSelector() {
    const typeSelect = document.getElementById('selector-type');
    const monsterSelect = document.getElementById('selector-monster');
    if (!typeSelect || !monsterSelect) return;
    const type = typeSelect.value;
    monsterSelect.innerHTML = '<option value="">— Select monster —</option>';
    MonsterLibrary.getList(type).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} (${m.tiers.map(t => `T${t.tier}: ${t.hp}hp`).join(', ')})`;
        monsterSelect.appendChild(opt);
    });
}

function populateCharacterSelector() {
    const sel = document.getElementById('character-selector');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select character —</option>';
    CharacterLibrary.getList().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.className})`;
        sel.appendChild(opt);
    });
}

// --- Navigation handlers ---
function focusFrame(frameId) {
    const target = document.getElementById(frameId);
    if (!target) return;
    document.querySelectorAll('.frame').forEach(f => {
        const shouldExpand = f.id === frameId;
        f.classList.toggle('expanded', shouldExpand);
        f.classList.toggle('collapsed', !shouldExpand);
        const icon = f.querySelector('.hud-toggle-icon');
        if (icon) icon.textContent = shouldExpand ? '▲' : '▼';
    });
}

function resetToDefaults() {
    if (!confirm('Reset all data? This will clear players and monsters.')) return;
    localStorage.removeItem('tt_players');
    localStorage.removeItem('tt_monsters');
    localStorage.removeItem('tt_layout');
    location.reload();
}

// --- Event Delegation ---
document.body.addEventListener('click', (e) => {
    // Nav: Characters
    if (e.target.id === 'nav-characters') { focusFrame('player-frame'); return; }
    // Nav: Monsters
    if (e.target.id === 'nav-monsters') { focusFrame('monster-frame'); return; }
    // Nav: Layout toggle
    if (e.target.id === 'nav-layout') { toggleLayout(); return; }
    // Nav: Reset
    if (e.target.id === 'nav-reset') { resetToDefaults(); return; }

    // Frame Toggle
    const header = e.target.closest('.player-frame-header, .resume-hud');
    if (header) {
        const frameId = header.dataset.toggleFrame;
        if (frameId) { toggleFrame(frameId); return; }
    }

    // Remove player
    const removeBtn = e.target.closest('.remove-player-trigger');
    if (removeBtn) {
        const pid = removeBtn.dataset.playerId;
        if (pid) {
            state.players = state.players.filter(x => x.id !== pid);
            delete state.turnDone[pid];
            // Renumber players sequentially to keep IDs consistent
            const newTurnDone = {};
            state.players.forEach((p, idx) => {
                const newId = `player${idx + 1}`;
                if (state.turnDone[p.id]) newTurnDone[newId] = true;
                p.id = newId;
            });
            state.turnDone = newTurnDone;
            Storage.save('players', state.players);
            renderPlayers();
            renderMonsters();
            updateLevelUpButton();
        }
        return;
    }

    // Add Character
    if (e.target.id === 'btn-add-character') { addCharacter(); return; }

    // Turn done toggle (both mini-card and detail card)
    const turnBtn = e.target.closest('.turn-done-btn, .mini-turn-btn');
    if (turnBtn) {
        // For the player1 static button, the charId comes from parent card or click target
        const charId = turnBtn.dataset.playerId || turnBtn.closest('.focused-character-card')?.dataset?.characterId;
        if (charId) { toggleTurn(charId); return; }
    }

    // Potion click (adds +1 on click)
    const potionChip = e.target.closest('.potion-chip');
    if (potionChip) {
        const type = potionChip.dataset.potion;
        adjustPotion(type, 1, potionChip);
        return;
    }

    // LEVEL UP
    if (e.target.id === 'btn-level-up') { levelUp(); return; }

    // Player Buttons (DMG/HEAL) - works for both focused card and detail cards
    const pBtn = e.target.closest('.focused-character-card .btn');
    if (pBtn && !pBtn.classList.contains('level-up-btn')) {
        const pCard = pBtn.closest('.focused-character-card');
        const charId = pBtn.dataset.characterId || pCard.dataset.characterId;
        const statType = pBtn.dataset.statType;
        const amount = parseInt(pBtn.dataset.amount) || 0;
        if (charId) { updatePlayerStat(charId, statType, amount); return; }
    }

    // Spawn Monster (in-frame selector)
    if (e.target.id === 'btn-add-monster') {
        const type = document.getElementById('selector-type').value;
        const monsterId = document.getElementById('selector-monster').value;
        if (!monsterId) return;
        spawnMonster(type, monsterId);
        return;
    }

    // Monster Buttons
    const mBtn = e.target.closest('.monster-card .btn');
    if (mBtn) {
        const mCard = mBtn.closest('.monster-card');
        const mobId = mCard.dataset.mobId;
        if (mBtn.classList.contains('remove-mob-trigger')) { removeMob(mobId); return; }
        adjustMobHealth(mobId, parseInt(mBtn.dataset.amount) || 0);
        return;
    }
});

// --- Change Events ---
document.addEventListener('change', (e) => {
    if (e.target.id === 'selector-type') populateSelector();
    if (e.target.id === 'character-selector') selectCharacter(e.target.value);
});

// --- Initialization ---
async function init() {
    console.log('Initializing Application...');

    const savedLayout = (() => { try { return localStorage.getItem('tt_layout'); } catch(e) { return null; } })();
    if (savedLayout === 'horizontal') {
        const container = document.getElementById('frames-container');
        if (container) {
            container.classList.remove('layout-vertical');
            container.classList.add('layout-horizontal');
        }
    }

    await Promise.all([MonsterLibrary.load(), CharacterLibrary.load()]);

    state.players = Storage.load('players') || [];
    state.monsters = Storage.load('monsters') || [];

    // Restore turn states from any stored data
    state.turnDone = {};

    renderPlayers();
    renderMonsters();
    populateSelector();
    populateCharacterSelector();
    updateLevelUpButton();

    // Auto-spawn 3 players if none saved
    if (state.players.length === 0 && CharacterLibrary.getList().length > 0) {
        // Shuffle and pick 3
        const list = [...CharacterLibrary.getList()];
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        const chosen = list.slice(0, Math.min(3, list.length));

        const nextLvl = CharacterLibrary.getNextLevelEntry(1);
        state.players = chosen.map((charDef, idx) => ({
            id: `player${idx + 1}`,
            libId: charDef.id,
            name: charDef.name,
            className: charDef.className,
            classSource: charDef.classSource,
            starting_hp: charDef.starting_hp,
            starting_mp: charDef.starting_mp,
            level: 1,
            currentHp: charDef.starting_hp,
            maxHp: charDef.starting_hp,
            currentMana: charDef.starting_mp,
            maxMana: charDef.starting_mp,
            currentXp: 0,
            maxXp: nextLvl ? nextLvl.xp_required : 0
        }));

        const sel = document.getElementById('character-selector');
        if (sel) sel.value = state.players[0].libId;

        Storage.save('players', state.players);
        renderPlayers();
        renderMonsters();
        updateLevelUpButton();
    }

    // Auto-spawn default monsters if none saved
    if (state.monsters.length === 0) {
        const groupList = MonsterLibrary.getList('group');
        const roamingList = MonsterLibrary.getList('roaming');
        
        if (groupList.length > 0) {
            spawnMonster('group', groupList[0].id);
        }
        if (roamingList.length > 0) {
            spawnMonster('roaming', roamingList[0].id);
        }
    }

    // Right-click subtracts potion
    document.body.addEventListener('contextmenu', (e) => {
        const potionChip = e.target.closest('.potion-chip');
        if (potionChip) {
            e.preventDefault();
            const type = potionChip.dataset.potion;
            adjustPotion(type, -1, potionChip);
        }
    });
}

init();