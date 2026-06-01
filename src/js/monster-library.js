/**
 * Monster Library - Loads and manages monster definitions from JSON data files.
 */
const MonsterLibrary = {
    data: {
        group: {},
        roaming: {}
    },
    loaded: false,

    async load() {
        if (this.loaded) return;
        try {
            const engine = document.querySelector('#app')?.dataset?.gameEngine || 'massive-darkness-2';
            const basePath = `./src/data/${engine}`;
            const groupFiles = [`${basePath}/groups.base-game.json`];
            const roamingFiles = [`${basePath}/roaming.base-game.json`, `${basePath}/roaming.hellscape.json`];

            await Promise.all([
                ...groupFiles.map(async (path) => {
                    const resp = await fetch(path);
                    if (!resp.ok) return;
                    const data = await resp.json();
                    this.normalizeMonsterList(data).forEach(m => {
                        this.data.group[m.id] = m;
                    });
                }),
                ...roamingFiles.map(async (path) => {
                    const resp = await fetch(path);
                    if (!resp.ok) return;
                    const data = await resp.json();
                    this.normalizeMonsterList(data).forEach(m => {
                        this.data.roaming[m.id] = m;
                    });
                })
            ]);

            this.loaded = true;
            console.log(`MonsterLibrary: Loaded ${Object.keys(this.data.group).length} groups and ${Object.keys(this.data.roaming).length} roaming.`);
        } catch (e) {
            console.error('MonsterLibrary: Failed to load data files:', e);
        }
    },

    normalizeMonsterList(data) {
        if (!data) return [];
        const list = Array.isArray(data) ? data : (Array.isArray(data.monsters) ? data.monsters : []);
        return list.map((monster) => {
            if (!monster || !monster.id) return null;
            const normalized = { ...monster };

            if (!Array.isArray(normalized.tiers)) {
                if (Array.isArray(normalized.ranks)) {
                    normalized.tiers = normalized.ranks.map(rank => ({
                        tier: rank.rank,
                        hp: typeof rank.health === 'number' ? rank.health : (typeof rank.hp === 'number' ? rank.hp : 0),
                        treasure: typeof rank.treasure === 'number' ? rank.treasure : 0
                    }));
                } else {
                    normalized.tiers = [];
                }
            } else {
                normalized.tiers = normalized.tiers.map(entry => ({
                    tier: entry.tier,
                    hp: typeof entry.hp === 'number' ? entry.hp : (typeof entry.health === 'number' ? entry.health : 0),
                    treasure: typeof entry.treasure === 'number' ? entry.treasure : 0
                }));
            }

            return normalized;
        }).filter(Boolean);
    },

    getList(type) {
        const cat = this.data[type];
        if (!cat) return [];
        return Object.values(cat);
    },

    get(id, type) {
        const cat = this.data[type];
        if (!cat) return null;
        return cat[id] || null;
    },

    /** Get the tier data for a monster at a given tier level */
    getTierData(type, id, tier) {
        const monster = this.get(id, type);
        if (!monster || !monster.tiers || monster.tiers.length === 0) return null;
        return monster.tiers.find(t => t.tier === tier) || monster.tiers[monster.tiers.length - 1];
    }
};
