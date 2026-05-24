function instantiateComponent(templateId, targetSelector, itemData) {
    const template = document.getElementById(templateId);
    const container = document.querySelector(targetSelector);

    if (!template || !container) return null;

    const clone = template.content.cloneNode(true);
    const rootElement = clone.firstElementChild;

    // Map your new template structures
    if (templateId === 'player-card-template') {
        rootElement.dataset.characterId = itemData.id;
        rootElement.querySelector('.character-name').textContent = itemData.name;
        rootElement.querySelector('.character-class').textContent = itemData.class;
        rootElement.querySelector('.level-value').textContent = itemData.level;
    } 
    else if (templateId === 'monster-group-template') {
        rootElement.dataset.mobId = itemData.id;
        rootElement.querySelector('.monster-title').textContent = itemData.title;
    }

    container.appendChild(clone);
}