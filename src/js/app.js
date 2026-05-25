/**
 * Tabletop Tracker Engine - Main Application Logic
 */

// --- Global State ---
const state = {
    gameEngine: 'massive-darkness-2',
    players: [],
    monsters: []
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
    const app = document.getElementById('app');
    const isVertical = app.classList.contains('layout-vertical');
    app.classList.remove('layout-vertical', 'layout-horizontal');
    app.classList.add(isVertical ? 'layout-horizontal' : 'layout-vertical');
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
    const nextLevel = CharacterLibrary.getNextLevelEntry(1);
    state.players = [{
        id: 'player1',
        libId: charId,
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
    }];
    Storage.save('players', state.players);
    renderPlayers();
    renderMonsters();
    updateLevelUpButton();
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

        const card = document.createElement('div');
        card.className = 'player-mini-card';
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
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderFocusedPlayer() {
    const player1 = state.players.find(p => p.id === 'player1');
    const card = document.querySelector('.focused-character-card[data-character-id="player1"]');
    if (!player1 || !card) return;

    const nameEl = card.querySelector('.char-name');
    if (nameEl) nameEl.textContent = player1.name;
    const lvlEl = card.querySelector('.char-lvl');
    if (lvlEl) lvlEl.textContent = player1.level;

    const heroName = document.querySelector('.player-frame-header .frame-title');
    if (heroName) heroName.textContent = 'PLAYER STATS';

    updateSegmentedBar(card.querySelector('.hp-vector .bar-container'), player1.currentHp, player1.maxHp, 'hp');
    updateSegmentedBar(card.querySelector('.mana-vector .bar-container'), player1.currentMana, player1.maxMana, 'mp');
    updateSegmentedBar(card.querySelector('.xp-vector .bar-container'), player1.currentXp, player1.maxXp, 'xp');
}

// --- Monster Rendering ---
function renderMonsters() {
    const container = document.getElementById('monster-cards-container');
    if (!container) return;
    container.innerHTML = '';

    state.monsters.forEach(m => {
        const card = document.createElement('div');
        card.className = `monster-card ${m.type === 'boss-type' ? 'boss-type' : 'mob-type'}`;
        card.dataset.mobId = m.id;

        if (m.type === 'boss-type') {
            card.innerHTML = `
                <div class="monster-header">
                    <h4>${m.name} <span class="sub-text">(Roaming · Tier ${m.tier})</span></h4>
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
            container.appendChild(card);
            updateSegmentedBar(card.querySelector('.bar-container'), m.currentHp, m.maxHp, 'boss');
        } else {
            card.innerHTML = `
                <div class="monster-header">
                    <h4>${m.name} <span class="sub-text">(Group · Tier ${m.tier})</span></h4>
                    <button class="btn alert-btn remove-mob-trigger" data-mob-id="${m.id}">REMOVE</button>
                </div>
                <div class="mob-health-breakdown">
                    <div class="entity-health-block encounter-bar">
                        <span class="label">LEADER + MINIONS</span>
                        <div class="bar-container"></div>
                    </div>
                    <div class="figurines-header"><hr><span>FIGURINES</span><hr></div>
                    <div class="minions-grid" data-mob-id="${m.id}"></div>
                </div>
                <div class="monster-controls">
                    <button class="btn btn-dmg" data-mob-id="${m.id}" data-amount="-5">-5 DMG</button>
                    <button class="btn btn-dmg" data-mob-id="${m.id}" data-amount="-1">-1 DMG</button>
                    <button class="btn btn-heal" data-mob-id="${m.id}" data-amount="1">+1 HEAL</button>
                    ${m.treasure > 0 ? `<span class="treasure-badge">✦ ${m.treasure} TR</span>` : ''}
                </div>
            `;
            container.appendChild(card);
            updateSegmentedBar(card.querySelector('.encounter-bar .bar-container'), m.currentHp, m.totalHp, 'mob');
            renderMinionGrid(card, m);
        }
    });
    updateMobSummary();
}

function renderMinionGrid(card, m) {
    const grid = card.querySelector('.minions-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const baseHp = m.baseHp;
    let remainingDamage = m.totalHp - m.currentHp;
    const letters = 'ABCDEFGHIJKLMNOP'.split('');
    const states = [];
    for (let i = m.minionCount - 1; i >= 0; i--) {
        const dmg = Math.min(remainingDamage, baseHp);
        const hp = baseHp - dmg;
        remainingDamage -= dmg;
        states.unshift({
            status: hp <= 0 ? 'dead' : (hp >= baseHp ? 'alive' : 'partial'),
            text: hp <= 0 ? '[X]' : (hp >= baseHp ? `${baseHp}/${baseHp}` : `${hp}/${baseHp}`)
        });
    }
    states.forEach((s, i) => {
        const block = document.createElement('div');
        block.className = `entity-health-block ${i === 0 ? 'leader' : 'minion'} ${s.status}`;
        block.innerHTML = `<span class="label">${i === 0 ? 'LEADER' : `MINION ${letters[i - 1]}`}</span><div class="mini-health-dot">${s.text}</div>`;
        grid.appendChild(block);
    });
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

// --- Event Delegation ---
document.body.addEventListener('click', (e) => {
    // Layout toggle
    if (e.target.id === 'layout-toggle') { toggleLayout(); return; }

    // Frame Toggle
    const header = e.target.closest('.player-frame-header, .resume-hud');
    if (header) {
        const frameId = header.dataset.toggleFrame;
        if (frameId) { toggleFrame(frameId); return; }
    }

    // LEVEL UP
    if (e.target.id === 'btn-level-up') { levelUp(); return; }

    // Player Buttons (DMG/HEAL)
    const pBtn = e.target.closest('.focused-character-card .btn');
    if (pBtn && !pBtn.classList.contains('level-up-btn')) {
        const pCard = pBtn.closest('.focused-character-card');
        const charId = pCard.dataset.characterId;
        const statType = pBtn.dataset.statType;
        const amount = parseInt(pBtn.dataset.amount) || 0;
        updatePlayerStat(charId, statType, amount);
        return;
    }

    // Spawn Monster
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
        document.getElementById('app').classList.remove('layout-vertical');
        document.getElementById('app').classList.add('layout-horizontal');
    }

    await Promise.all([MonsterLibrary.load(), CharacterLibrary.load()]);

    state.players = Storage.load('players') || [];
    state.monsters = Storage.load('monsters') || [];

    renderPlayers();
    renderMonsters();
    populateSelector();
    populateCharacterSelector();
    updateLevelUpButton();

    // Auto-spawn 4 players if none saved
    if (state.players.length === 0 && CharacterLibrary.getList().length > 0) {
        // Shuffle and pick 4
        const list = [...CharacterLibrary.getList()];
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        const chosen = list.slice(0, Math.min(4, list.length));

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
}

init();