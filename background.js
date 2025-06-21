/**
 * @file background.js (Service Worker)
 * @description Handles API requests to Gemini, caching, and state management.
 */

console.log("Gemini Writer background script loaded. 🧠");

// In-memory cache to avoid redundant API calls for the same text.
const cache = new Map();

// --- 1. Main Message Listener ---
// Listens for messages from content scripts.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_TEXT") {
    handleAnalysisRequest(request, sender)
      .then(sendResponse)
      .catch(error => {
        console.error("Gemini API Error:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }
});

async function handleAnalysisRequest(request, sender) {
  const { text } = request;

  const textHash = simpleHash(text);
  if (cache.has(textHash)) {
    console.log("Gemini Writer: Returning response from cache. ⚡");
    await updateStats(cache.get(textHash));
    return { data: cache.get(textHash) };
  }

  const settings = await getSettings();
  if (!settings.apiKey) {
    return { error: "Gemini API key is not set. Please set it in the extension options." };
  }

  try {
    // UPDATED: The prompt is now smarter!
    const prompt = buildPrompt(text, settings);
    const apiResponse = await callGeminiApi(prompt, settings.apiKey);
    const jsonData = parseGeminiResponse(apiResponse);
    
    cache.set(textHash, jsonData);
    await updateStats(jsonData);

    return { data: jsonData };

  } catch (error) {
    console.error("Gemini Writer: Error in handleAnalysisRequest:", error);
    return { error: error.message || "An unknown error occurred." };
  }
}

// --- 2. Gemini API Interaction ---
async function callGeminiApi(prompt, apiKey, retries = 2) {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody.error?.message}`);
      }
      
      return await response.json();

    } catch (error) {
      console.error(`Gemini API call attempt ${i + 1} failed:`, error);
      if (i === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

function parseGeminiResponse(apiResponse) {
    try {
        const content = apiResponse.candidates[0].content.parts[0].text;
        const cleanedContent = content.replace(/^```json\n?/, '').replace(/```$/, '');
        return JSON.parse(cleanedContent);
    } catch (e) {
        console.error("Failed to parse JSON from Gemini response:", apiResponse);
        throw new Error("The API returned an invalid or unexpected format.");
    }
}

// --- 3. Prompt Engineering ---
function buildPrompt(text, settings) {
  const styleGuideInstruction = settings.styleGuide ?
    `CRITICALLY, you must also enforce all rules from the Company Style Guide. This includes adding required text (like "Best Regards, [Name]") if the rule specifies it and it is missing. Treat the style guide as a set of direct commands. The style guide is: "${settings.styleGuide}"` :
    '';

  const toneRewriteInstruction = settings.enableTone ?
    `2. **Tone Rewrites**: Provide rewrites of the entire text in "formal", "friendly", and "concise" tones.` :
    '';
  
  // MODIFIED: Added full_corrected_text to the schema for our "Apply All" button.
  const schema = `{
      "corrections": [{ "original": "string", "correction": "string", "explanation": "string" }],
      "full_corrected_text": "string",
      "rewrites": { "formal": "string", "friendly": "string", "concise": "string" },
      "plagiarism_score": "number (0-100)",
      "flashcards": [{ "word": "string", "definition": "string", "example": "string" }],
      "translation": { "is_needed": "boolean", "translated_to_english": "string" },
      "summary": "string (one paragraph, only if original text > 120 words)"
    }`;

  // MODIFIED: Updated the prompt to ask for both individual fixes and one fully corrected text.
  return `
    You are an expert corporate communications coach. Your goal is to make the user's writing more professional, clear, and effective for a business context. Analyze the user's text and provide feedback ONLY in the following JSON format. Do not include any other explanatory text.

    **JSON Schema to strictly follow:**
    ${schema}

    **Analysis Tasks:**
    1. **Corrections**: Identify all grammar, spelling, punctuation, and style errors. Provide each as a separate object in the "corrections" array.
    2. **Full Corrected Text**: IMPORTANT! Provide the entire, final, corrected version of the user's text in the "full_corrected_text" field. This version should incorporate ALL fixes from step 1.
    ${toneRewriteInstruction}
    3. **Plagiarism Score**: Estimate the likelihood of plagiarism.
    4. **Vocabulary Flashcards**: Suggest 3 vocabulary words.
    5. **Multilingual Analysis**: If the text isn't English, translate it.
    6. **Summary**: Summarize if the text is long.
    7. **Professionalism & Style Guide Polish**: Pay special attention to informalities. ${styleGuideInstruction}

    **User's Text to Analyze:**
    ---
    ${text}
    ---
    `;
}

// --- 4. Helpers & Utilities ---
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

async function getSettings() {
  const defaults = {
    apiKey: '',
    enableCorrections: true,
    enableTone: true,
    enablePlagiarism: true,
    enableFlashcards: true,
    enableSummary: true,
    styleGuide: ''
  };
  return await chrome.storage.sync.get(defaults);
}

async function updateStats(jsonData) {
    const { stats } = await chrome.storage.local.get({ 
        stats: { words_fixed: 0, api_calls: 0, start_date: new Date().toISOString() } 
    });

    stats.api_calls += 1;
    if (jsonData.corrections && jsonData.corrections.length > 0) {
        stats.words_fixed += jsonData.corrections.reduce((acc, c) => acc + c.original.split(' ').length, 0);
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    if (new Date(stats.start_date) < oneWeekAgo) {
        stats.start_date = new Date().toISOString();
        stats.words_fixed = 0;
        stats.api_calls = 0;
    }

    await chrome.storage.local.set({ stats });
    console.log("Gemini Writer: Stats updated.", stats);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Gemini Writer Assistant has been installed! 🎉");
});

// Allow Node.js testing by exporting functions when module is available
if (typeof module !== 'undefined') {
  module.exports = {
    parseGeminiResponse,
  };
}
