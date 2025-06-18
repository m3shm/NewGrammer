/**
 * @file overlay.js
 * @description Renders data in the overlay and sends events back to the content script.
 */

const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const dataState = document.getElementById('data-state');
const errorMessageEl = document.getElementById('error-message');
const closeBtn = document.getElementById('close-btn');

const translationSection = document.getElementById('translation-section');
const translationOutput = document.getElementById('translation-output');
const summarySection = document.getElementById('summary-section');
const summaryOutput = document.getElementById('summary-output');
const correctionsSection = document.getElementById('corrections-section');
const correctionsList = document.getElementById('corrections-list');
const applyAllBtn = document.getElementById('apply-all-btn');
const rewritesSection = document.getElementById('rewrites-section');
const rewriteOutput = document.getElementById('rewrite-output');
const plagiarismSection = document.getElementById('plagiarism-section');
const plagiarismBar = document.getElementById('plagiarism-bar');
const plagiarismText = document.getElementById('plagiarism-text');
const flashcardsSection = document.getElementById('flashcards-section');
const flashcardsList = document.getElementById('flashcards-list');

// We'll store the full corrected text here when we receive it from the background script.
let fullCorrectedText = '';
let rewritesData = {};

function showState(state) {
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    dataState.style.display = 'none';
    state.style.display = 'block';
}

window.addEventListener('message', (event) => {
    const { type, data, message, originalText } = event.data;

    if (type === 'LOADING') {
        showState(loadingState);
    } else if (type === 'ERROR') {
        errorMessageEl.textContent = message;
        showState(errorState);
    } else if (type === 'SHOW_DATA') {
        renderData(data, originalText); // Pass original text for rewrite payload
        showState(dataState);
    }
});

function renderData(data, originalText) {
    // Reset
    correctionsList.innerHTML = '';
    flashcardsList.innerHTML = '';
    [translationSection, summarySection, rewritesSection, plagiarismSection, flashcardsSection, correctionsSection].forEach(s => s.style.display = 'none');

    // Store data for later use in our event listeners
    fullCorrectedText = data.full_corrected_text || '';
    rewritesData = data.rewrites || {};

    // 1. Translation & Summary
    if (data.translation?.is_needed) {
        translationOutput.textContent = data.translation.translated_to_english;
        translationSection.style.display = 'block';
    }
    if (data.summary) {
        summaryOutput.textContent = data.summary;
        summarySection.style.display = 'block';
    }

    // 2. Corrections
    if (data.corrections?.length > 0) {
        correctionsSection.style.display = 'block';
        applyAllBtn.style.display = 'block'; // Show the "Apply All" button
        data.corrections.forEach(c => {
            const card = document.createElement('div');
            card.className = 'correction-card';
            card.innerHTML = `
                <p>Replace with: <strong>${c.correction}</strong></p>
                <small>${c.explanation}</small>
                <button class="apply-btn" data-original="${c.original}" data-correction="${c.correction}">Apply Fix</button>
            `;
            correctionsList.appendChild(card);
        });
    } else {
        // If there are no corrections, hide the whole section including the "Apply All" button.
        correctionsSection.style.display = 'none';
        applyAllBtn.style.display = 'none';
    }
    
    // 3. Tone Rewrites
    if (Object.values(rewritesData).some(t => t)) {
        rewritesSection.style.display = 'block';
        const initialTone = document.querySelector('.tab-link.active').dataset.tone;
        rewriteOutput.textContent = rewritesData[initialTone] || 'Not available.';
    }
    
    // 4. Plagiarism Score
    if (data.plagiarism_score !== undefined) {
        plagiarismSection.style.display = 'block';
        const score = Math.max(0, Math.min(100, data.plagiarism_score));
        plagiarismBar.style.width = `${score}%`;
        plagiarismText.textContent = `${score}% Likelihood`;
        plagiarismBar.style.backgroundColor = score > 60 ? 'var(--accent-color-danger)' : score > 30 ? 'var(--accent-color-warning)' : 'var(--accent-color-safe)';
    }

    // 5. Flashcards
    if (data.flashcards?.length > 0) {
        flashcardsSection.style.display = 'block';
        data.flashcards.forEach(f => {
            const card = document.createElement('div');
            card.className = 'flashcard';
            card.innerHTML = `<h5>${f.word}</h5><p><em>${f.definition}</em></p><p>"${f.example}"</p>`;
            flashcardsList.appendChild(card);
        });
    }
}

document.addEventListener('click', (e) => {
    // Single fix button
    if (e.target.matches('.apply-btn')) {
        window.parent.postMessage({
            type: 'APPLY_SINGLE_FIX',
            payload: { original: e.target.dataset.original, correction: e.target.dataset.correction }
        }, '*');
    }
    // "Apply All" button for corrections
    else if (e.target.matches('#apply-all-btn')) {
        window.parent.postMessage({ type: 'APPLY_ALL_FIXES', payload: { fullText: fullCorrectedText } }, '*');
    }
    // "Use This Version" for rewrites
    else if (e.target.matches('.apply-rewrite-btn')) {
        const rewriteText = rewriteOutput.textContent;
        // The original full text is needed to do a full replacement
        const originalText = document.querySelector('.correction-card')?.dataset.original || '';
        window.parent.postMessage({ type: 'APPLY_REWRITE', payload: { newText: rewriteText, originalText: originalText } }, '*');
    }
    // Tone tabs
    else if (e.target.matches('.tab-link')) {
        document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
        e.target.classList.add('active');
        rewriteOutput.textContent = rewritesData[e.target.dataset.tone] || 'Not available.';
    }
});

closeBtn.addEventListener('click', () => {
    window.parent.postMessage({ type: 'CLOSE_OVERLAY' }, '*');
});
