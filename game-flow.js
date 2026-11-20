// Phone handoffs and private, one-vote-per-player ballots.
let ballots = [];
let voterIndex = 0;
let votingActive = false;

function playerName(index) {
    return players[index].name || ('Player ' + (index + 1));
}

function startVoting() {
    if (!allViewed || votingActive) return;
    votingActive = true;
    ballots = [];
    voterIndex = 0;
    endBtn.disabled = true;
    summaryContainer.innerHTML = '';
    document.getElementById('questionActions').style.display = 'none';
    showVotingHandoff();
}

function showVotingHandoff() {
    currentLabel.textContent = 'Private voting';
    progress.textContent = (voterIndex + 1) + ' / ' + players.length;
    wordBox.innerHTML = `<div class="handoff">${gameArt('handoff')}<div class="muted">Pass the phone to</div><div class="handoff-name">${escapeHtml(playerName(voterIndex))}</div><div class="muted">Your vote stays hidden until everyone has voted.</div><button id="openBallot" type="button" style="margin-top:16px">I’m ${escapeHtml(playerName(voterIndex))} — vote</button></div>`;
    document.getElementById('openBallot').addEventListener('click', showBallot);
}

function showBallot() {
    const voter = voterIndex;
    wordBox.innerHTML = `<div style="width:100%;text-align:left">${gameArt('ballot')}<strong>${escapeHtml(playerName(voter))}, who is the impostor?</strong><div class="muted" style="margin-top:8px">Choose another player, then confirm. You can also abstain.</div><div class="vote-options" id="voteOptions"></div><div id="voteConfirmation" aria-live="polite"></div></div>`;
    const options = document.getElementById('voteOptions');
    [...players.map((_, i) => i).filter(i => i !== voter), -1].forEach(target => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ghost vote-choice';
        button.setAttribute('aria-pressed', 'false');
        button.textContent = target === -1 ? 'Abstain' : playerName(target);
        button.addEventListener('click', () => {
            options.querySelectorAll('button').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
            const confirmation = document.getElementById('voteConfirmation');
            confirmation.innerHTML = `<div style="margin-top:14px">${target === -1 ? 'Abstain from this vote?' : 'Vote for ' + escapeHtml(playerName(target)) + '?'}</div><button id="confirmVote" type="button" style="margin-top:10px">Confirm & hide vote</button>`;
            document.getElementById('confirmVote').addEventListener('click', () => {
                if (!votingActive || voterIndex !== voter || ballots.length !== voter || target === voter) return;
                ballots.push(target);
                voterIndex++;
                if (voterIndex < players.length) showVotingHandoff();
                else showVoteResults();
            });
        });
        options.appendChild(button);
    });
}

function tallyVotes(votes, count) {
    const totals = Array(count).fill(0);
    votes.forEach(target => { if (Number.isInteger(target) && target >= 0 && target < count) totals[target]++; });
    const highest = Math.max(0, ...totals);
    const leaders = totals.map((total, i) => total === highest && highest > 0 ? i : -1).filter(i => i >= 0);
    return { totals, eliminated: leaders.length === 1 ? leaders[0] : null, tied: leaders.length > 1, abstentions: votes.filter(v => v === -1).length };
}

function roundWinner(eliminated, roundRoles) {
    if (eliminated !== null && roundRoles[eliminated] === 'jester') {
        return { title: 'Jester wins!', reason: 'The jester achieved their goal of being voted out.' };
    }
    if (!roundRoles.some(roleIsTreatedAsImpostor)) {
        return { title: 'Innocents win!', reason: 'There were no impostors in this round.' };
    }
    if (eliminated !== null && roleIsTreatedAsImpostor(roundRoles[eliminated])) {
        return { title: 'Innocents win!', reason: 'The group caught an impostor.' };
    }
    return { title: 'Impostors win!', reason: eliminated === null ? 'Nobody was voted out, so the impostors escaped.' : 'The group voted out an innocent player.' };
}

function showVoteResults() {
    const result = tallyVotes(ballots, players.length);
    const winner = roundWinner(result.eliminated, roles);
    currentLabel.textContent = 'Voting complete';
    progress.textContent = players.length + ' / ' + players.length;
    wordBox.innerHTML = `<div class="handoff" role="status">${gameArt('trophy')}<div class="muted">Round over</div><div class="handoff-name">${escapeHtml(winner.title)}</div><div>${escapeHtml(winner.reason)}</div><div class="muted" style="margin-top:12px">You can share the screen now.</div></div>`;
    let outcome = result.tied ? 'Tie — nobody is voted out.' : 'Everyone abstained — nobody is voted out.';
    if (result.eliminated !== null) outcome = playerName(result.eliminated) + ' is voted out.';
    const specialResults = roles.map((role, i) => {
        if (role === 'assassin' && assassinTargets[i] != null) return `${playerName(i)} (Assassin): ${result.eliminated === assassinTargets[i] ? 'objective won — target voted out' : 'objective lost — target survived'}.`;
        if (role === 'follower' && followerTargets[i] != null) return `${playerName(i)} (Follower): ${result.eliminated !== followerTargets[i] ? 'objective won — target survived' : 'objective lost — target voted out'}.`;
        return '';
    }).filter(Boolean);
    summaryContainer.innerHTML = `<div class="summary"><strong>${escapeHtml(outcome)}</strong><div style="margin-top:12px">${result.totals.map((total, i) => `<div style="padding:6px 0">${escapeHtml(playerName(i))}: ${total} vote${total === 1 ? '' : 's'}</div>`).join('')}<div class="muted" style="margin-top:8px">Abstentions: ${result.abstentions}. A tie means no elimination.</div></div><button id="revealResults" type="button" style="margin-top:14px">Reveal final roles</button></div>`;
    if (specialResults.length) {
        const objectives = document.createElement('div');
        objectives.className = 'summary';
        specialResults.forEach(text => {
            const line = document.createElement('div');
            line.textContent = text;
            objectives.appendChild(line);
        });
        summaryContainer.appendChild(objectives);
    }
    document.getElementById('revealResults').addEventListener('click', () => {
        votingActive = false;
        showSummary();
        const outcomeEl = document.createElement('div');
        outcomeEl.className = 'summary';
        outcomeEl.textContent = outcome;
        summaryContainer.prepend(outcomeEl);
    });
}

function updateModeUI() {
    const mode = gameModeSel.value;
    bluffHintContainer.style.display = mode === 'bluff' ? 'block' : 'none';
    questionContainer.style.display = mode === 'question' ? 'block' : 'none';
    document.getElementById('wordImpostorContainer').style.display = mode === 'wordImpostor' ? 'block' : 'none';
    const descriptions = {
        word: ['Classic Word', 'One shared word. The impostor has to bluff without seeing it.', 'card'],
        wordImpostor: ['Word Impostor', 'Two similar words. Everyone thinks they belong. Describe yours and listen for the difference.', 'pair'],
        question: ['Question', 'Answer in private. Compare the answers and spot who had a different question.', 'discussion'],
        bluff: ['Bluff', 'The impostor gets a sideways hint. Can they talk their way through?', 'card']
    };
    const [title, description, art] = descriptions[mode] || descriptions.word;
    document.getElementById('modePreview').innerHTML = `${gameArt(art)}<div><strong>${title}</strong><div class="muted">${description}</div></div>`;
}

function validateRoundSetup() {
    if (gameModeSel.value !== 'wordImpostor') return true;
    const phrase = document.getElementById('phrase').value.trim();
    const decoy = document.getElementById('impostorPhrase').value.trim();
    if (!phrase || !decoy) {
        alert('Word Impostor needs both a main word and a related impostor word. Enter them or generate a pair.');
        return false;
    }
    if (normalizeForComparison(phrase) === normalizeForComparison(decoy)) {
        alert('The impostor word must be different from the main word.');
        return false;
    }
    const count = document.getElementById('mode').value === 'random'
        ? Number(document.getElementById('impostorCount').value)
        : players.filter(p => p.selectedRole === 'impostor' || p.selectedRole === 'assassin').length;
    if (count < 1 || count >= players.length) {
        alert('Choose at least one impostor and leave at least one player on the innocent side.');
        return false;
    }
    return true;
}

function showWordImpostorCard(role, player) {
    const word = role === 'wordImpostor'
        ? roundWords.impostorPhrase
        : (player.customWord || '').trim() || roundWords.phrase;
    // Identical label, art and instructions for both roles: only the word differs.
    wordBox.innerHTML = `<div class="private-word">${gameArt('card')}<div class="muted">Your word</div><div class="secret-word">${escapeHtml(word)}</div><div class="muted">Give a clue without saying your word.<br>Listen carefully to everyone else.</div></div>`;
    revealBtn.disabled = true;
    nextBtn.disabled = false;
}

updateModeUI();
