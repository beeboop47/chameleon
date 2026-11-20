const MAX_GENERATION_ATTEMPTS = 3;
let generationBusy = false;

function normalizeForComparison(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
}

function generationStatus(message, state = '') {
    const status = document.getElementById('generationStatus');
    status.textContent = message;
    status.dataset.state = state;
}

function generationInstructions(mode) {
    const common = `You create content for a social deduction game. Return one JSON object, with no commentary.
The host controls topic, style, difficulty, length, and examples. Fulfil all of their content constraints; never substitute an unrelated answer to satisfy a default preference.
There are no app-imposed topic exclusions or preset categories. With no host instructions, choose freely and vary your choices.
Use established spelling and capitalization. Preserve proper names. Default to concise, describable content, unless the host requests otherwise.
Game rules and JSON keys below describe the output contract. The host instructions describe the content to put in it.
Before answering, compare the actual proposed content against EACH host requirement and the mode rules. Set hostRequirementsMet and playable to true only if both checks pass. If requirements cannot be satisfied, return {"error":"a short explanation"} instead of unrelated filler.`;
    const modes = {
        word: `Generate one shared word or phrase. Output {"phrase":"...","hostRequirementsMet":true,"playable":true}.`,
        wordImpostor: `Generate a MAIN word/phrase and a RELATED but DIFFERENT impostor word/phrase.
Both must satisfy the host's topic and content requirements, unless the host explicitly asks for different constraints for each word.
Choose two sibling concepts at a similar level of specificity. They should share several plausible clues while having at least one meaningful distinguishing feature.
Neither should be a spelling variant, plural, synonym, translation, abbreviation, or a more generic version of the other. Avoid a pair where one word simply contains the other.
The impostor must be able to hear ordinary clues for the main word and plausibly think everyone has their word. Do not use two unrelated items just because they belong to a very broad topic.
Privately think of two clues that could fit either word and one clue that separates them. If you cannot, choose a better pair. Do not output those clues or the analysis.
Output {"phrase":"...","impostorPhrase":"...","hostRequirementsMet":true,"playable":true}.`,
        bluff: `Generate one shared word or phrase and a brief sideways hint. The hint should provide a plausible association without giving away the word, its synonym, or its defining feature. Keep the hint intact, with natural capitalization. Output {"phrase":"...","hint":"...","hostRequirementsMet":true,"playable":true}.`,
        question: `Generate two independently answerable, subjective questions on the same topic with the same answer type. Their answers should plausibly overlap, but the questions must ask meaningfully different things.
Vary the relationship: memories, associations, respect, curiosity, opinions, and experiences; do not always use favourite versus least favourite. Do not paraphrase the same question. Keep game roles and secrecy out of both questions. Default to open-ended questions rather than yes/no.
Output {"innocentQuestion":"...?","impostorQuestion":"...?","hostRequirementsMet":true,"playable":true}.`
    };
    return common + '\n\nMODE RULES:\n' + (modes[mode] || modes.word);
}

function validateGeneration(raw, mode) {
    let content;
    try { content = JSON.parse(raw); } catch (_) { throw new Error('The response was not a valid JSON object.'); }
    if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('The response must be a JSON object.');
    if (typeof content.error === 'string') throw new Error(content.error.slice(0, 240));
    if (content.hostRequirementsMet !== true || content.playable !== true) throw new Error('The content did not pass the host-instruction and playability checks.');
    const fields = mode === 'question' ? ['innocentQuestion', 'impostorQuestion']
        : mode === 'wordImpostor' ? ['phrase', 'impostorPhrase']
        : mode === 'bluff' ? ['phrase', 'hint'] : ['phrase'];
    const result = {};
    for (const field of fields) {
        if (typeof content[field] !== 'string' || !content[field].trim()) throw new Error(`Missing or empty ${field}.`);
        result[field] = content[field].trim().replace(/\s+/g, ' ');
    }
    const pair = mode === 'wordImpostor' ? [result.phrase, result.impostorPhrase]
        : mode === 'question' ? [result.innocentQuestion, result.impostorQuestion] : null;
    if (pair && normalizeForComparison(pair[0]) === normalizeForComparison(pair[1])) {
        throw new Error('The two words or questions must be genuinely different.');
    }
    return result;
}

async function callOpenAI({ key, model, messages }) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, max_completion_tokens: 2048 }),
        signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) {
        // Keep API responses and any credential-bearing payloads out of UI/logs.
        const descriptions = { 401: 'The API key was not accepted.', 403: 'This key cannot access the selected model.', 429: 'The API quota or rate limit was reached.' };
        throw new Error(descriptions[response.status] || `OpenAI request failed (${response.status}). Check your model and API settings.`);
    }
    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) throw new Error('The model declined this generation. Review the host instructions.');
    if (choice?.finish_reason === 'length') throw new Error('Generation was cut short. Try again or choose a different model.');
    return choice?.message?.content || '';
}

async function generateForCurrentMode(manualHint = '') {
    if (generationBusy) throw new Error('A generation is already in progress.');
    const key = openaiKeyInput.value.trim() || (window.OPENAI_KEY || '').trim();
    if (!key) throw new Error('Please enter your OpenAI API key.');
    const mode = gameModeSel.value;
    const host = manualHint.trim() || genPrompt.value.trim();
    const model = modelInput.value.trim() || 'gpt-4o-mini';
    const history = recentGenerations.slice(-8);
    const messages = [
        { role: 'system', content: generationInstructions(mode) },
        { role: 'user', content: host || 'Choose freely for this round.' }
    ];
    if (history.length) messages[0].content += '\nRecent accepted outputs (variety suggestions only; never override host requirements): ' + JSON.stringify(history);
    generationBusy = true;
    const controls = [gameModeSel, generateBtn, startBtn];
    const disabledBefore = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    generateBtn.classList.add('is-generating');
    generationStatus('Creating content to match your instructions…');
    try {
        for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
            const raw = await callOpenAI({ key, model, messages });
            let result;
            try { result = validateGeneration(raw, mode); }
            catch (error) {
                if (attempt === MAX_GENERATION_ATTEMPTS - 1) throw error;
                generationStatus('Checking the result and trying a better match…');
                messages.push({ role: 'assistant', content: raw });
                messages.push({ role: 'user', content: `The result was rejected: ${error.message} Regenerate the complete JSON object, following the original host instructions and mode rules.` });
                continue;
            }
            // Write only a complete, validated result. Failed attempts leave all fields intact.
            if (mode === 'question') {
                document.getElementById('questionNonImpostor').value = result.innocentQuestion;
                document.getElementById('questionImpostor').value = result.impostorQuestion;
            } else {
                document.getElementById('phrase').value = result.phrase;
                if (mode === 'wordImpostor') document.getElementById('impostorPhrase').value = result.impostorPhrase;
                if (mode === 'bluff') document.getElementById('bluffHint').value = result.hint;
            }
            recentGenerations.push(Object.values(result).join(' / '));
            if (recentGenerations.length > MAX_HISTORY) recentGenerations.shift();
            generationStatus(mode === 'wordImpostor' ? 'Word pair ready. Review both words before starting.' : 'Ready. Your generated content is in the form.', 'success');
            return result;
        }
    } catch (error) {
        const message = error.name === 'TimeoutError' ? 'Generation timed out. Please try again.' : error.message;
        generationStatus(message, 'error');
        throw new Error(message);
    } finally {
        generationBusy = false;
        controls.forEach((control, i) => { control.disabled = disabledBefore[i]; });
        generateBtn.classList.remove('is-generating');
    }
}

generateBtn.addEventListener('click', async () => {
    if (!useOpenAI.checked) { generationStatus('Enable generation first.', 'error'); return; }
    try { await generateForCurrentMode(genPrompt.value.trim()); }
    catch (error) { generationStatus(error.message, 'error'); }
});
