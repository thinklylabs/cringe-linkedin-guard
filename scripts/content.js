// ==================== Utility Functions ====================

function getApiKeyIfEnabled() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(["geminiApiKey", "isEnabled"], (data) => {
            if (data.isEnabled && data.geminiApiKey) {
                resolve(data.geminiApiKey);
            } else {
                console.warn("Gemini API key not found or extension is disabled.");
                resolve(null);
            }
        });
    });
}

function getMutedWords() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(["mutedWords"], (data) => {
            resolve(data.mutedWords || []);
        });
    });
}

function getShowWords() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(["showWords"], (data) => {
            resolve(data.showWords || []);
        });
    });
}

function containsWords(text, words) {
    if (!words || words.length === 0) return false;
    const lowerText = text.toLowerCase();
    return words.some(word => lowerText.includes(word.toLowerCase()));
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function estimateTimeSavedInSeconds(postText) {
    const wordCount = postText.split(/\s+/).length;
    if (wordCount <= 20) return 5;
    if (wordCount <= 50) return 10;
    return 20;
}

function updateCringeStats(postText) {
    chrome.storage.sync.get(["cringeCount", "timeSavedInMinutes"], (data) => {
        const newCount = (data.cringeCount || 0) + 1;
        const newTimeSavedInMinutes = parseFloat(data.timeSavedInMinutes || 0) + estimateTimeSavedInSeconds(postText) / 60;
        chrome.storage.sync.set({ cringeCount: newCount, timeSavedInMinutes: newTimeSavedInMinutes });
    });
}

// ==================== Post Filtering ====================

function cringeGuardThisPost(post, filterMode) {
    const parentDiv = post.closest('.feed-shared-update-v2__control-menu-container');
    if (!parentDiv) return;

    if (filterMode === 'remove') {
        const postContainer = parentDiv.closest('.feed-shared-update-v2');
        if (postContainer) {
            postContainer.style.display = 'none';
            postContainer.style.visibility = 'hidden';
            postContainer.style.height = '0';
            postContainer.style.overflow = 'hidden';
            postContainer.style.margin = '0';
            postContainer.style.padding = '0';
            postContainer.style.opacity = '0';
            postContainer.style.pointerEvents = 'none';
        }
        console.log('[Scroll Safe] Post removed');
        return;
    }

    // Blur effect
    const wrapper = document.createElement('div');
    while (parentDiv.firstChild) wrapper.appendChild(parentDiv.firstChild);
    wrapper.style.filter = 'blur(10px)';
    wrapper.style.transition = 'all 0.3s ease';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.position = 'relative';
    wrapper.style.opacity = '0.95';
    parentDiv.style.position = 'relative';

    const button = document.createElement('button');
    button.innerText = 'Click to View';
    button.style.cssText = `
        position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        z-index:10; background-color:#0a66c2; color:white; border:none;
        padding:12px 24px; font-size:14px; border-radius:24px;
        cursor:pointer; font-weight:600; box-shadow:0 0 10px rgba(0,0,0,0.1);
        transition: all 0.2s ease;
    `;
    button.onmouseover = () => { button.style.backgroundColor = '#004182'; button.style.boxShadow = '0 0 12px rgba(0,0,0,0.15)'; };
    button.onmouseout = () => { button.style.backgroundColor = '#0a66c2'; button.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)'; };
    button.addEventListener('click', () => { wrapper.style.filter=''; wrapper.style.opacity='1'; button.style.display='none'; });

    parentDiv.appendChild(wrapper);
    parentDiv.appendChild(button);
}

// ==================== Cringe Detection ====================

async function checkForCringe({ actorName, actorDescription, actorSubDescription, postContent }) {
    // 0. Promoted posts
    if (actorDescription.toLowerCase().includes('promoted') || actorSubDescription.toLowerCase().includes('promoted')) return true;

    // 1. Muted words
    const mutedWords = await getMutedWords();
    if (containsWords(actorName, mutedWords) || containsWords(actorDescription, mutedWords) || containsWords(actorSubDescription, mutedWords) || containsWords(postContent, mutedWords)) return true;

    // 2. Show words whitelist
    const showWords = await getShowWords();
    if (containsWords(postContent, showWords)) return false; // explicitly allow post

    // 3. Gemini API check
    const apiKey = await getApiKeyIfEnabled();
    if (!apiKey) return false;

    const GEMINI_API_URL = 'https://genai.googleapis.com/v1beta2/models/gemini-2.5-flash:generateText';
    const SYSTEM_PROMPT = `
        You are a LinkedIn post analyzer. Determine if a post is cringe based on these criteria:
        - Selling a course with unrelated emotional story
        - Overly emotional or clickbait stories with no tech content
        - Motivational quotes not tied to tech growth
        - Non-tech political/social commentary
        - Purely personal content without professional context
        - Posts asking to comment/tag/like with no substance
        - Generalized/redundant content
        - Brand promotional content/ads
        - Overly generic advice without specifics
        - Viral memes unrelated to professional goals
        - Written by an AI
        - Overly personal/TMI content
        - Excessive self-promotion/bragging
        - Inappropriate workplace behavior
        - Forced/artificial inspiration
        - Obvious humble bragging
        - Misleading or out-of-context info
    `;

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: SYSTEM_PROMPT, inputs: [postContent], temperature: 0.1 })
        });
        const data = await response.json();
        if (data.error) { console.error('Gemini API Error:', data.error); return false; }
        return data.predictions[0].output.toLowerCase().includes('post_is_cringe');
    } catch (error) {
        console.error('Error checking post:', error);
        return false;
    }
}

// ==================== Post Processing ====================

const alreadyProcessedPosts = new Set();

async function processPost(post) {
    const commentaryElement = post.querySelector('.update-components-update-v2__commentary');
    if (!commentaryElement || alreadyProcessedPosts.has(commentaryElement)) return;
    alreadyProcessedPosts.add(commentaryElement);

    const actorContainer = post.querySelector('.update-components-actor__container');
    let actorName = 'Unknown', actorDescription = 'No description', actorSubDescription = 'No sub-description';

    if (actorContainer) {
        const nameEl = actorContainer.querySelector('.update-components-actor__title span[aria-hidden="true"]');
        const descEl = actorContainer.querySelector('.update-components-actor__description span[aria-hidden="true"]');
        const subDescEl = actorContainer.querySelector('.update-components-actor__sub-description span[aria-hidden="true"]');
        if (nameEl) actorName = nameEl.textContent.trim();
        if (descEl) actorDescription = descEl.textContent.trim();
        if (subDescEl) actorSubDescription = subDescEl.textContent.trim();
    }

    const isCringe = await checkForCringe({
        actorName,
        actorDescription,
        actorSubDescription,
        postContent: commentaryElement.innerText.trim(),
    });

    if (isCringe) {
        const { filterMode } = await new Promise(resolve => {
            chrome.storage.sync.get(['filterMode'], data => resolve({ filterMode: data.filterMode || 'blur' }));
        });
        cringeGuardThisPost(post, filterMode);
        updateCringeStats(post.innerText);
    }
}

// ==================== DOM Observation ====================

function cringeGuardExistingPosts() {
    document.querySelectorAll('.feed-shared-update-v2__control-menu-container').forEach(processPost);
}

function observeNewPosts() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        node.querySelectorAll('.feed-shared-update-v2__control-menu-container').forEach(processPost);
                    }
                });
            }
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// ==================== Initialization ====================

async function initExtension() {
    const apiKey = await getApiKeyIfEnabled();
    if (!apiKey) return console.warn("Gemini API key not found. Set it in extension settings.");
    cringeGuardExistingPosts();
    observeNewPosts();
}

initExtension();
