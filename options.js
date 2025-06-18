/**
 * @file options.js
 * @description Handles saving and loading of user settings.
 */

const apiKeyInput = document.getElementById('api-key');
const enableCorrectionsInput = document.getElementById('enable-corrections');
const enableToneInput = document.getElementById('enable-tone');
const enablePlagiarismInput = document.getElementById('enable-plagiarism');
const enableFlashcardsInput = document.getElementById('enable-flashcards');
const enableSummaryInput = document.getElementById('enable-summary');
const styleGuideInput = document.getElementById('style-guide');
const saveBtn = document.getElementById('save-btn');
const statusMsg = document.getElementById('status-msg');
const statsContainer = document.getElementById('stats-container');

// --- 1. Save Settings ---
function saveSettings() {
    const settings = {
        apiKey: apiKeyInput.value,
        enableCorrections: enableCorrectionsInput.checked,
        enableTone: enableToneInput.checked,
        enablePlagiarism: enablePlagiarismInput.checked,
        enableFlashcards: enableFlashcardsInput.checked,
        enableSummary: enableSummaryInput.checked,
        styleGuide: styleGuideInput.value
    };

    chrome.storage.sync.set(settings, () => {
        statusMsg.textContent = 'Settings saved successfully! ✅';
        setTimeout(() => {
            statusMsg.textContent = '';
        }, 2000);
    });
}

// --- 2. Load Settings ---
function loadSettings() {
    const defaults = {
        apiKey: '',
        enableCorrections: true,
        enableTone: true,
        enablePlagiarism: true,
        enableFlashcards: true,
        enableSummary: true,
        styleGuide: ''
    };
    chrome.storage.sync.get(defaults, (items) => {
        apiKeyInput.value = items.apiKey;
        enableCorrectionsInput.checked = items.enableCorrections;
        enableToneInput.checked = items.enableTone;
        enablePlagiarismInput.checked = items.enablePlagiarism;
        enableFlashcardsInput.checked = items.enableFlashcards;
        enableSummaryInput.checked = items.enableSummary;
        styleGuideInput.value = items.styleGuide;
    });
}

// --- 3. Load Stats ---
function loadStats() {
    const key = 'gemini-writer-stats';
    chrome.storage.local.get({ 
        stats: { words_fixed: 0, api_calls: 0, start_date: new Date().toISOString() } 
    }, ({ stats }) => {
        const startDate = new Date(stats.start_date);
        const daysRunning = Math.ceil((new Date() - startDate) / (1000 * 60 * 60 * 24));
        statsContainer.innerHTML = `
            <p><strong>API Calls This Week:</strong> ${stats.api_calls}</p>
            <p><strong>Words Corrected:</strong> ${stats.words_fixed}</p>
            <p><em>Stats reset weekly. Current cycle started ${daysRunning} day(s) ago.</em></p>
        `;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadStats();
});
saveBtn.addEventListener('click', saveSettings);
