/**
 * Tabletop Tracker Engine - Main Application Logic
 */

// --- Global State ---
const state = {
    gameEngine: 'massive-darkness-2',
    players: [],
    monsters: []
};

// --- Data Persistence ---
const Storage = {
    save(key, data) {
        try {
            localStorage.setItem(`tt_${key}`, JSON.stringify(data));
        } catch (e) { console.error('Storage Save Error:', e); }
    },
    load(key) {
        try {
            const data = localStorage.getItem(`tt_${key}`);
            const parsed = data ? JSON.parse(data) : null;
            return (Array.isArray(parsed) && parsed.length > 0) ? parsed : null;
        } catch (e) { return null; }
    }
};

// --- Frame Toggle ---
function toggleFrame(frameId) {
    console.log('Toggling frame:', frameId);
    document.querySelectorAll('.frame').forEach(f => {
        f.classList.remove('expanded');
        f.classList.add('collapsed');
        const icon = f.querySelector('.hud-toggle-icon');
        if (icon) icon.textContent = '▼';
    });
    const frame = document.getElementById(frameId);
    if (frame) {
        frame.classList.remove('collapsed');
        frame.classList.add('expanded');
        const icon = frame.querySelector('.hud-toggle-icon');
        if (icon) icon.textContent = '▲';
    }
}

// --- Player Stats ---
function updatePlayerStat(characterId, statType, amount) {
    const player = state.players.find(p => p.id === characterId);
    if (!player) return console.warn('Player not found:', characterId);

    if (statType === 'hp') {
        player.currentHp = Math.max(0, Math.min(player.maxHp, player.currentHp + amount));
    } else if (statType === 'mp') {
        player.currentMana = Math.max(0, Math.min(player.maxMana, player.currentMana + amount));
    } else if (statType === 'xp') {
        player.currentXp = Math.max(0, player.currentXp + amount);
        if (player.currentXp >= player.maxXp && amount > 0) {
            player.level++;
            player.currentXp -= player.maxXp;
            player.maxXp += 50;
        }
    }
    
    Storage.save('players', state.players);
    renderPlayers();
}

// --- Monster Stats ---
function adjustMobHealth(mobId, amount) {
    const monster = state.monsters.find(m => m.id === mobId);
    if (!monster) return;

    if (monster.type === 'mob-type') {
        monster.currentHp = Math.max(0, Math.min(monster.totalHp, monster.currentHp + amount));
        Storage.save('monsters', state.monsters);
        renderMonsters();
    } else if (monster.type === 'boss-type') {
        monster.currentHp = Math.max(0, Math.min(monster.maxHp, monster.currentHp + amount));
        Storage.save('monsters', state.monsters);
        renderMonsters();
    }
}

function clearMob(mobId) {
    state.monsters = state.monsters.filter(m => m.id !== mobId);
    Storage.save('monsters', state.monsters);
    const card = document.querySelector(`.monster-card[data-mob-id="${mobId}"]`);
    if (card) card.remove();
}

// --- Player Rendering ---
function renderPlayers() {
    const player1 = state.players.find(p => p.id === 'player1');
    const focusedCard = document.querySelector('.focused-character-card[data-character-id="player1"]');
    if (!player1 || !focusedCard) return;

    const nameEl = focusedCard.querySelector('.char-name');
    if (nameEl) nameEl.textContent = player1.name;
    const lvlEl = focusedCard.querySelector('.char-lvl');
    if (lvlEl) lvlEl.textContent = player1.level;

    const hudHp = document.querySelector('.hud-hp');
    const hudMaxHp = document.querySelector('.hud-maxhp');
    const hudMp = document.querySelector('.hud-mp');
    const hudMaxMp = document.querySelector('.hud-maxmp');
    const hudLvl = document.querySelector('.hud-lvl');
    const hudXp = document.querySelector('.hud-xp');
    const heroName = document.querySelector('.hero-name');

    if (hudHp) hudHp.textContent = player1.currentHp;
    if (hudMaxHp) hudMaxHp.textContent = player1.maxHp;
    if (hudMp) hudMp.textContent = player1.currentMana;
    if (hudMaxMp) hudMaxMp.textContent = player1.maxMana;
    if (hudLvl) hudLvl.textContent = player1.level;
    if (hudXp) hudXp.textContent = player1.currentXp;
    if (heroName) heroName.textContent = `${player1.name} (${player1.class})`;

    updateSegmentedBar(focusedCard.querySelector('.hp-vector .bar-container'), player1.currentHp, player1.maxHp, 'hp');
    updateSegmentedBar(focusedCard.querySelector('.mana-vector .bar-container'), player1.currentMana, player1.maxMana, 'mp');
    updateSegmentedBar(focusedCard.querySelector('.xp-vector .bar-container'), player1.currentXp, player1.maxXp, 'xp');
}

// --- Monster Rendering ---
function renderMonsters() {
    state.monsters.forEach(m => {
        const card = document.querySelector(`.monster-card[data-mob-id="${m.id}"]`);
        if (!card) return;
        
        if (m.type === 'boss-type') {
            updateSegmentedBar(card.querySelector('.hp-vector .bar-container'), m.currentHp, m.maxHp, 'boss');
        } else if (m.type === 'mob-type') {
            // Update encounter total bar
            updateSegmentedBar(card.querySelector('.encounter-bar .bar-container'), m.currentHp, m.totalHp, 'mob');
            
            // Add FIGURINES separator header (only once)
            const breakdown = card.querySelector('.mob-health-breakdown');
            if (!breakdown.querySelector('.figurines-header')) {
                const figHeader = document.createElement('div');
                figHeader.className = 'figurines-header';
                figHeader.innerHTML = '<hr><span>FIGURINES</span><hr>';
                breakdown.insertBefore(figHeader, card.querySelector('.minions-grid'));
            }
            
            // Regenerate minion grid
            const grid = card.querySelector('.minions-grid');
            if (!grid) return;
            grid.innerHTML = '';
            
            const baseHp = m.baseHp || 5;
            const totalHp = m.totalHp;
            const currentHp = m.currentHp;
            let remainingDamage = totalHp - currentHp;
            
            // Build minions from last (most damaged) to first (leader, least damaged)
            const labelLetters = 'ABCDEFGHIJKLMNOP'.split('');
            const minionStates = [];
            for (let i = m.minionCount - 1; i >= 0; i--) {
                const damageToThis = Math.min(remainingDamage, baseHp);
                const minionHp = baseHp - damageToThis;
                remainingDamage -= damageToThis;
                
                let status, hpText;
                if (minionHp <= 0) {
                    status = 'dead';
                    hpText = '[X]';
                } else if (minionHp >= baseHp) {
                    status = 'alive';
                    hpText = `${baseHp}/${baseHp}`;
                } else {
                    status = 'partial';
                    hpText = `${minionHp}/${baseHp}`;
                }
                
                minionStates.unshift({ status, hpText });
            }
            
            // Render in order: LEADER first, then MINION A, MINION B, etc.
            minionStates.forEach((ms, i) => {
                const label = i === 0 ? 'LEADER' : `MINION ${labelLetters[i - 1]}`;
                const blockClass = i === 0 ? 'leader' : 'minion';
                const block = document.createElement('div');
                block.className = `entity-health-block ${blockClass} ${ms.status}`;
                block.innerHTML = `
                    <span class="label">${label}</span>
                    <div class="mini-health-dot">${ms.hpText}</div>
                `;
                grid.appendChild(block);
            });
        }
    });
}

// --- Segmented Bar Helper ---
function updateSegmentedBar(container, current, max, labelType) {
    if (!container) return;
    
    container.classList.add('segmented');
    container.innerHTML = '';

    for (let i = 0; i < max; i++) {
        const segment = document.createElement('div');
        segment.className = 'segment';
        if (i < current) {
            segment.classList.add('filled');
        }
        container.appendChild(segment);
    }

    const textOverlay = document.createElement('span');
    textOverlay.className = 'bar-text';
    let suffix = '';
    if (labelType === 'xp') suffix = ' XP';
    else if (labelType === 'boss' || labelType === 'mob') suffix = ' HP';
    textOverlay.textContent = `${current} / ${max}${suffix}`;
    container.appendChild(textOverlay);
}

// --- Event Delegation ---
document.body.addEventListener('click', (e) => {
    const resumeHud = e.target.closest('.resume-hud');
    if (resumeHud) {
        const frame = resumeHud.closest('.frame');
        if (frame) toggleFrame(frame.id);
        return;
    }

    const pBtn = e.target.closest('.focused-character-card .btn');
    if (pBtn) {
        const pCard = pBtn.closest('.focused-character-card');
        const charId = pCard.dataset.characterId;
        const statType = pBtn.dataset.statType;
        const amount = parseInt(pBtn.dataset.amount) || 0;
        updatePlayerStat(charId, statType, amount);
        return;
    }

    const mBtn = e.target.closest('.monster-card .btn');
    if (mBtn) {
        const mCard = mBtn.closest('.monster-card');
        const mobId = mCard.dataset.mobId;

        if (mBtn.classList.contains('clear-mob-trigger')) {
            clearMob(mobId);
            return;
        }

        const amount = parseInt(mBtn.dataset.amount) || 0;
        adjustMobHealth(mobId, amount);
        return;
    }
});

// --- Migrate old monster data format to new format ---
function migrateMonsterData(monsters) {
    return monsters.map(m => {
        if (m.type === 'mob-type' && m.leader && !m.totalHp) {
            return { 
                id: m.id, 
                type: 'mob-type', 
                baseHp: Math.round(m.leader.maxHp / (m.minionCount || 5)) || 5, 
                minionCount: m.minionCount || 5, 
                currentHp: m.leader.currentHp || m.currentHp || 20, 
                totalHp: m.leader.maxHp || m.totalHp || 25 
            };
        }
        return m;
    });
}

// --- Initialization ---
function init() {
    console.log('Initializing Application...');
    state.players = Storage.load('players') || [
        { id: 'player1', name: 'Elias', class: 'Paladin', level: 2, currentHp: 10, maxHp: 12, currentMana: 4, maxMana: 6, currentXp: 24, maxXp: 50 }
    ];
    let loadedMonsters = Storage.load('monsters');
    if (loadedMonsters) {
        loadedMonsters = migrateMonsterData(loadedMonsters);
    }
    state.monsters = loadedMonsters || [
        { 
            id: 'ghoul-mob-1', 
            type: 'mob-type', 
            baseHp: 5, 
            minionCount: 3, 
            currentHp: 15, 
            totalHp: 15 
        },
        { id: 'cyclops-boss-1', type: 'boss-type', currentHp: 52, maxHp: 80 }
    ];
    renderPlayers();
    renderMonsters();
}

init();