/**
 * @file content.js
 * @description This script runs on web pages to detect editable fields,
 * send text to the background script for analysis, and display the UI.
 */

console.log("Gemini Writer Assistant content script loaded. ✨");

let activeElement = null;
let debounceTimer;
const DEBOUNCE_DELAY = 800; // ms
let overlayFrame = null;

// --- 1. Debounce Function ---
const debounce = (func, delay) => {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
};

// --- 2. Core Logic to Process Text ---
const processText = async (element) => {
  const text = element.isContentEditable ? element.innerText : element.value;
  if (text.trim().length < 10) { 
    hideOverlay();
    return;
  }

  console.log("Gemini Writer: Debounced event triggered. Sending text to background:", text.substring(0, 50) + "...");

  showOverlay(element);
  overlayFrame.contentWindow.postMessage({ type: 'LOADING' }, '*');

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ANALYZE_TEXT",
      text: text
    });

    console.log("Gemini Writer: Received analysis from background:", response);

    if (response.error) {
      overlayFrame.contentWindow.postMessage({ type: 'ERROR', message: response.error }, '*');
    } else if (response.data) {
      overlayFrame.contentWindow.postMessage({ type: 'SHOW_DATA', data: response.data, originalText: text }, '*');
    }

  } catch (error) {
    console.error("Gemini Writer: Could not communicate with background script.", error);
    if (overlayFrame) {
       overlayFrame.contentWindow.postMessage({ type: 'ERROR', message: 'Extension context lost. Please reload the page.' }, '*');
    }
  }
};

const debouncedProcessText = debounce(processText, DEBOUNCE_DELAY);

// --- 3. UI Overlay Management ---
function showOverlay(element) {
  if (!overlayFrame) {
    overlayFrame = document.createElement('iframe');
    overlayFrame.id = 'gemini-writer-overlay';
    overlayFrame.src = chrome.runtime.getURL('overlay.html');
    overlayFrame.style.border = 'none';
    document.body.appendChild(overlayFrame);
    window.addEventListener('message', handleOverlayMessages);
  }

  const rect = element.getBoundingClientRect();
  overlayFrame.style.display = 'block';
  overlayFrame.style.top = `${window.scrollY + rect.bottom + 5}px`;
  overlayFrame.style.left = `${window.scrollX + rect.left}px`;
  overlayFrame.style.width = `${rect.width < 350 ? 350 : rect.width}px`;
}

function hideOverlay() {
  if (overlayFrame) {
    overlayFrame.style.display = 'none';
  }
}

// --- 4. Event Listeners ---
document.addEventListener('focusin', (e) => {
  const element = e.target;
  if (element.tagName === 'TEXTAREA' || element.isContentEditable) {
    activeElement = element;
    activeElement.addEventListener('keyup', () => debouncedProcessText(activeElement));
  }
});

document.addEventListener('focusout', (e) => {
  setTimeout(() => {
    if (document.activeElement !== activeElement && document.activeElement !== overlayFrame) {
        // We're keeping this commented for now to prevent aggressive hiding
        // hideOverlay();
        // activeElement = null;
    }
  }, 200);
});

document.addEventListener('click', (e) => {
    if (overlayFrame && !overlayFrame.contains(e.target) && e.target !== activeElement) {
        hideOverlay();
    }
});


// --- 5. Handling Messages from the Overlay UI ---
function handleOverlayMessages(event) {
    if (event.source !== overlayFrame.contentWindow) return;

    const { type, payload } = event.data;
    if (!activeElement) return;
    
    // Helper function to apply new text to the active element.
    const applyText = (newText) => {
        if (activeElement.isContentEditable) {
            activeElement.innerText = newText;
        } else {
            activeElement.value = newText;
        }
    };

    if (type === 'APPLY_SINGLE_FIX') {
        const { original, correction } = payload;
        const currentText = activeElement.isContentEditable ? activeElement.innerText : activeElement.value;
        // Replace only the first instance to avoid unintended changes
        const updatedText = currentText.replace(original, correction);
        applyText(updatedText);
        // After applying, re-analyze to get fresh suggestions on the updated text
        debouncedProcessText(activeElement);

    } else if (type === 'APPLY_ALL_FIXES') {
        // The background script now provides the full corrected text, which is much safer.
        applyText(payload.fullText);
        hideOverlay(); // We're all done, so we can hide the panel.

    } else if (type === 'APPLY_REWRITE') {
        applyText(payload.newText);
        hideOverlay();
    
    } else if (type === 'CLOSE_OVERLAY') {
        hideOverlay();
    }
}
