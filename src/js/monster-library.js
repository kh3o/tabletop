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
            // Determine engine from app
            const engine = document.querySelector('#app')?.dataset?.gameEngine || 'massive-darkness-2';
            const basePath = `./src/data/${engine}`;

            // Load group monsters
            const groupResp = await fetch(`${basePath}/groups.base-game.json`);
            const groupData = await groupResp.json();
            groupData.forEach(m => {
                this.data.group[m.id] = m;
            });

            // Load roaming monsters
            const roamingResp = await fetch(`${basePath}/roaming.base-game.json`);
            const roamingData = await roamingResp.json();
            roamingData.forEach(m => {
                this.data.roaming[m.id] = m;
            });

            this.loaded = true;
            console.log(`MonsterLibrary: Loaded ${Object.keys(this.data.group).length} groups and ${Object.keys(this.data.roaming).length} roaming.`);
        } catch (e) {
            console.error('MonsterLibrary: Failed to load data files:', e);
        }
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
        if (!monster || !monster.tiers) return null;
        return monster.tiers.find(t => t.tier === tier) || monster.tiers[monster.tiers.length - 1];
    }
};