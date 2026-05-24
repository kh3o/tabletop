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
            // Ensure we don't return an empty array if we expect data
            return (Array.isArray(parsed) && parsed.length > 0) ? parsed : null;
        } catch (e) { return null; }
    }
};

// --- State Management ---
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

function updatePlayerStat(characterId, statType, amount) {
    const player = state.players.find(p => p.id === characterId);
    if (!player) return console.warn('Player not found:', characterId);

    console.log(`Updating ${statType} by ${amount} for ${characterId}`);

    if (statType === 'hp') {
        player.currentHp = Math.max(0, Math.min(player.maxHp, player.currentHp + amount));
    } else if (statType === 'mp') {
        player.currentMana = Math.max(0, Math.min(player.maxMana, player.currentMana + amount));
    } else if (statType === 'xp') {
        player.currentXp += amount;
        if (player.currentXp >= player.maxXp) {
            player.level++;
            player.currentXp -= player.maxXp;
            player.maxXp += 50;
        }
    }
    
    Storage.save('players', state.players);
    renderPlayers();
}

function adjustMobHealth(mobId, amount) {
    const monster = state.monsters.find(m => m.id === mobId);
    if (!monster) return;

    if (monster.type === 'mob-type' && monster.leader) {
        monster.leader.currentHp = Math.max(0, monster.leader.currentHp + amount);
    } else if (monster.type === 'boss-type') {
        monster.currentHp = Math.max(0, monster.currentHp + amount);
    }
    
    Storage.save('monsters', state.monsters);
    renderMonsters();
}

function clearMob(mobId) {
    state.monsters = state.monsters.filter(m => m.id !== mobId);
    Storage.save('monsters', state.monsters);
    // Remove the card from DOM immediately
    const card = document.querySelector(`.monster-card[data-mob-id="${mobId}"]`);
    if (card) card.remove();
    renderMonsters();
}

// --- Rendering Logic ---
function renderPlayers() {
    const player1 = state.players.find(p => p.id === 'player1');
    const focusedCard = document.querySelector('.focused-character-card[data-character-id="player1"]');
    if (!player1 || !focusedCard) return;

    // 1. Update HUD (The header part that stays visible when collapsed)
    const resumeHud = document.querySelector('#player-frame .resume-hud');
    if (resumeHud) {
        // Use optional chaining or check for null to prevent crashes
        const heroName = resumeHud.querySelector('.hero-name');
        if (heroName) heroName.textContent = `${player1.name} (${player1.class})`;
        
        const hpBadge = resumeHud.querySelector('.stat-badge.hp');
        if (hpBadge) hpBadge.textContent = `HP: ${player1.currentHp}/${player1.maxHp}`;
        
        const mpBadge = resumeHud.querySelector('.stat-badge.mana');
        if (mpBadge) mpBadge.textContent = `MP: ${player1.currentMana}/${player1.maxMana}`;
        
        const xpBadge = resumeHud.querySelector('.stat-badge.xp');
        if (xpBadge) xpBadge.textContent = `LVL: ${player1.level} (${player1.currentXp} XP)`;
    }

    // 2. Update the Main Card
    // Check both potential class names for the level indicator
    const levelDisp = focusedCard.querySelector('.level-indicator') || focusedCard.querySelector('.level-value');
    if (levelDisp) levelDisp.textContent = `Level ${player1.level}`;
    
    const updateBar = (selector, current, max, label = "") => {
        const container = focusedCard.querySelector(selector);
        if (!container) return;
        const bar = container.querySelector('.bar-fill');
        if (bar) {
            bar.style.width = `${(current / max) * 100}%`;
            bar.textContent = `${current} / ${max} ${label}`;
        }
    };

    updateBar('.hp-vector', player1.currentHp, player1.maxHp);
    updateBar('.mana-vector', player1.currentMana, player1.maxMana);
    updateBar('.xp-vector', player1.currentXp, player1.maxXp, "XP");
}

function renderMonsters() {
    state.monsters.forEach(m => {
        const card = document.querySelector(`.monster-card[data-mob-id="${m.id}"]`);
        if (!card) return;
        
        if (m.type === 'mob-type') {
            const fill = card.querySelector('.leader .bar-fill');
            fill.style.width = `${(m.leader.currentHp / m.leader.maxHp) * 100}%`;
            fill.textContent = `${m.leader.currentHp} / ${m.leader.maxHp} HP`;
        } else if (m.type === 'boss-type') {
            const fill = card.querySelector('.hp-vector .bar-fill');
            fill.style.width = `${(m.currentHp / m.maxHp) * 100}%`;
            fill.textContent = `${m.currentHp} / ${m.maxHp} HP`;
        }
    });
}

// --- Event Delegation ---
document.body.addEventListener('click', (e) => {
    // 1. Frame Toggle
    const resumeHud = e.target.closest('.resume-hud');
    if (resumeHud) {
        const frame = resumeHud.closest('.frame');
        if (frame) toggleFrame(frame.id);
        return;
    }

    // 2. Player Stat Buttons
    const pBtn = e.target.closest('.focused-character-card .btn');
    if (pBtn) {
        const pCard = pBtn.closest('.focused-character-card');
        const charId = pCard.dataset.characterId;
        const statType = pBtn.dataset.statType;
        const amount = parseInt(pBtn.dataset.amount) || 0;
        updatePlayerStat(charId, statType, amount);
        return;
    }

    // 3. Monster Stat Buttons
    const mBtn = e.target.closest('.monster-card .btn');
    if (mBtn) {
        const mCard = mBtn.closest('.monster-card');
        const mobId = mCard.dataset.mobId;
        const amount = parseInt(mBtn.dataset.amount) || 0;

        if (mBtn.classList.contains('clear-mob-trigger')) {
            clearMob(mobId);
        } else {
            adjustMobHealth(mobId, amount);
        }
    }
});

// --- Initialization ---
function init() {
    console.log('Initializing Application...');
    state.players = Storage.load('players') || [
        { id: 'player1', name: 'Elias', class: 'Paladin', level: 2, currentHp: 12, maxHp: 15, currentMana: 4, maxMana: 6, currentXp: 24, maxXp: 50 }
    ];
    state.monsters = Storage.load('monsters') || [
        { id: 'ghoul-mob-1', type: 'mob-type', leader: { currentHp: 12, maxHp: 12 } },
        { id: 'cyclops-boss-1', type: 'boss-type', currentHp: 52, maxHp: 80 }
    ];
    renderPlayers();
    renderMonsters();
}

// Start the app
init();