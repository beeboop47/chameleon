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
    wordBox.innerHTML = `<div class="handoff"><div class="muted">Pass the phone to</div><div class="handoff-name">${escapeHtml(playerName(voterIndex))}</div><div class="muted">Your vote stays hidden until everyone has voted.</div><button id="openBallot" type="button" style="margin-top:16px">I’m ${escapeHtml(playerName(voterIndex))} — vote</button></div>`;
    document.getElementById('openBallot').addEventListener('click', showBallot);
}

function showBallot() {
    const voter = voterIndex;
    wordBox.innerHTML = `<div style="width:100%;text-align:left"><strong>${escapeHtml(playerName(voter))}, who is the impostor?</strong><div class="muted" style="margin-top:8px">Choose a player, then confirm. You may vote for yourself or abstain.</div><div class="vote-options" id="voteOptions"></div><div id="voteConfirmation" aria-live="polite"></div></div>`;
    const options = document.getElementById('voteOptions');
    [...players.map((_, i) => i), -1].forEach(target => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ghost vote-choice';
        button.textContent = target === -1 ? 'Abstain' : playerName(target);
        button.addEventListener('click', () => {
            const confirmation = document.getElementById('voteConfirmation');
            confirmation.innerHTML = `<div style="margin-top:14px">${target === -1 ? 'Abstain from this vote?' : 'Vote for ' + escapeHtml(playerName(target)) + '?'}</div><button id="confirmVote" type="button" style="margin-top:10px">Confirm & hide vote</button>`;
            document.getElementById('confirmVote').addEventListener('click', () => {
                if (!votingActive || voterIndex !== voter || ballots.length !== voter) return;
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

function showVoteResults() {
    const result = tallyVotes(ballots, players.length);
    currentLabel.textContent = 'Voting complete';
    progress.textContent = players.length + ' / ' + players.length;
    wordBox.innerHTML = '<div><strong>All votes are in.</strong><div class="muted" style="margin-top:8px">You can share the screen now.</div></div>';
    let outcome = result.tied ? 'Tie — nobody is voted out.' : 'Everyone abstained — nobody is voted out.';
    if (result.eliminated !== null) outcome = playerName(result.eliminated) + ' is voted out.';
    summaryContainer.innerHTML = `<div class="summary"><strong>${escapeHtml(outcome)}</strong><div style="margin-top:12px">${result.totals.map((total, i) => `<div style="padding:6px 0">${escapeHtml(playerName(i))}: ${total} vote${total === 1 ? '' : 's'}</div>`).join('')}<div class="muted" style="margin-top:8px">Abstentions: ${result.abstentions}. A tie means no elimination.</div></div><button id="revealResults" type="button" style="margin-top:14px">Reveal final roles</button></div>`;
    document.getElementById('revealResults').addEventListener('click', () => {
        votingActive = false;
        showSummary();
        const outcomeEl = document.createElement('div');
        outcomeEl.className = 'summary';
        outcomeEl.textContent = outcome;
        summaryContainer.prepend(outcomeEl);
    });
}
