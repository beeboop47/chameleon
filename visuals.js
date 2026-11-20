// Small, local vector illustrations: no image requests during private play.
function gameArt(kind) {
    const drawings = {
        handoff: '<rect x="25" y="5" width="38" height="64" rx="8"/><path d="M39 12h10M39 62h10M9 35h18m-7-7 7 7-7 7M61 35h18m-7-7 7 7-7 7"/><path d="m37 36 6 6 10-13"/>',
        card: '<rect x="16" y="13" width="38" height="52" rx="7" transform="rotate(-12 35 39)"/><rect x="32" y="8" width="38" height="52" rx="7" fill="#0b172b"/><path d="M43 25h16M43 32h11"/><path d="m45 45 5 5 9-11"/>',
        ballot: '<path d="m29 28-8-15 25-9 13 25M37 15l6 6 6-10"/><path d="M14 34h60v32H14zM14 34l11-10h38l11 10M32 34h24"/><path d="m34 49 7 7 13-14"/>',
        trophy: '<path d="M28 9h32v16c0 17-32 17-32 0zM28 15H15v7c0 12 13 12 16 12M60 15h13v7c0 12-13 12-16 12M44 39v19M30 65h28M35 58h18"/><path d="m44 15 2 5 6 1-4 4 1 6-5-3-5 3 1-6-4-4 6-1z"/>',
        discussion: '<path d="M8 15h48v31H28L17 57V46H8zM56 27h23v29H66L55 66V56H40v-9"/><path d="M20 26h23M20 34h15"/>',
        pair: '<rect x="8" y="11" width="30" height="48" rx="6"/><rect x="50" y="11" width="30" height="48" rx="6"/><path d="M16 26h14M16 34h10M58 26h14M58 34h10M41 35h6M44 32v6"/>'
    };
    return `<svg class="game-art" viewBox="0 0 88 76" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawings[kind] || drawings.card}</svg>`;
}

function roleName(role) {
    return ({ normal: 'Innocent', impostor: 'Impostor', wordImpostor: 'Word Impostor', doubleAgent: 'Double Agent' })[role]
        || role.charAt(0).toUpperCase() + role.slice(1);
}

document.getElementById('mascot').innerHTML = `<svg class="chameleon" viewBox="0 0 240 170" fill="none" aria-hidden="true">
    <ellipse cx="122" cy="150" rx="87" ry="6" fill="#60a5fa" opacity=".08"/>
    <path d="M21 141c65-13 131-16 201-10" stroke="#334865" stroke-width="5" stroke-linecap="round"/>
    <path class="chameleon-tail" d="M87 98c-50-38-87 6-56 25 21 13 39-14 20-22-12-5-19 8-9 11" stroke="#60a5fa" stroke-width="13" stroke-linecap="round"/>
    <path d="M69 96c5-29 30-51 62-51 21 0 29 12 41 17l27 2-10 17-16 20-41 13-41-2z" fill="#17314b" stroke="#79b8eb" stroke-width="2"/>
    <path d="m79 78 9-14 4 8 10-17 5 8 11-18 7 7 8-12 8 12" stroke="#9bb8e8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m101 106-8 24 15 5m37-29 12 24 14 2" stroke="#79b8eb" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m89 136 11-4 9 3m49 0 10-3 8 2M172 86l15-4" stroke="#b5d8f8" stroke-width="2" stroke-linecap="round"/>
    <circle cx="161" cy="64" r="15" fill="#223f5b" stroke="#9ec9f5" stroke-width="2"/>
    <g class="chameleon-eye"><circle cx="165" cy="63" r="7" fill="#b8d9fb"/><circle cx="167" cy="62" r="4" fill="#071029"/><circle cx="168" cy="60" r="1.5" fill="white"/></g>
    <path d="M92 88h2m15-10h2m13 14h2m10-22h2m-30 31h2" stroke="#60a5fa" stroke-width="4" stroke-linecap="round" opacity=".5"/>
    <path class="mascot-spark" d="M205 30v10m-5-5h10M49 46v8m-4-4h8" stroke="#a5b4fc" stroke-width="2" stroke-linecap="round"/>
</svg>`;
