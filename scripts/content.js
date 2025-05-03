function getApiKeyIfEnabled() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(["groqApiKey", "isEnabled"], (data) => {
            if (data.isEnabled && data.groqApiKey) {
                resolve(data.groqApiKey);
            } else {
                console.warn("GROQ API key not found or extension is disabled.");
                resolve(null);
            }
        });
    });
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

async function initExtension() {
    const apiKey = await getApiKeyIfEnabled();
    if (!apiKey) {
        console.warn("GROQ API key not found. Please set your API key in the extension settings.");
        return; // Stop execution if no API key
    }

    cringeGuardExistingPosts();
    observeNewPosts();
}

function estimateTimeSavedInSeconds(postText) {
    const wordCount = postText.split(/\s+/).length;

    if (wordCount <= 20) return 5;   // Short posts (~5 sec saved)
    if (wordCount <= 50) return 10;  // Medium posts (~10 sec saved)
    return 20;                       // Long posts (~20 sec saved)
}

function updateCringeStats(postText) {
    chrome.storage.sync.get(["cringeCount", "timeSavedInMinutes"], (data) => {
        const newCount = (data.cringeCount || 0) + 1;
        const estimatedTimeSavedInSeconds = estimateTimeSavedInSeconds(postText);

        const newTimeSavedInMinutes = parseFloat(data.timeSavedInMinutes || 0) + estimatedTimeSavedInSeconds / 60; // Convert to minutes

        chrome.storage.sync.set({ cringeCount: newCount, timeSavedInMinutes: newTimeSavedInMinutes });
    });
}

function cringeGuardThisPost(post, filterMode) {
    const parentDiv = post.closest('.feed-shared-update-v2__control-menu-container');

    if (parentDiv) {
        // completely hiding the post from DOM if filterMode is 'remove'
        if (filterMode === 'remove') { // TODO - refactor is needed here.
            const postContainer = parentDiv.closest('.feed-shared-update-v2');

            if (postContainer) {
                postContainer.style.display = 'none';
                postContainer.style.visibility = 'hidden';
                postContainer.style.height = '0';
                postContainer.style.overflow = 'hidden';
                postContainer.style.margin = '0';
                postContainer.style.padding = '0';
                postContainer.style.opacity = '0';
                postContainer.style.pointerEvents = 'none'; // Prevents interaction
            }
            console.log('[Cringe Guard] Post removed');
            return;
        }
        const wrapper = document.createElement('div');
        while (parentDiv.firstChild) {
            wrapper.appendChild(parentDiv.firstChild);
        }

        wrapper.style.filter = 'blur(10px)';
        wrapper.style.transition = 'all 0.3s ease';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.position = 'relative';
        wrapper.style.opacity = '0.95';

        parentDiv.style.position = 'relative';

        const button = document.createElement('button');
        button.innerText = 'Click to View';
        button.style.position = 'absolute';
        button.style.top = '50%';
        button.style.left = '50%';
        button.style.transform = 'translate(-50%, -50%)';
        button.style.zIndex = '10';
        button.style.backgroundColor = '#0a66c2';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.padding = '12px 24px';
        button.style.fontSize = '14px';
        button.style.borderRadius = '24px';
        button.style.cursor = 'pointer';
        button.style.fontWeight = '600';
        button.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
        button.style.transition = 'all 0.2s ease';

        button.onmouseover = () => {
            button.style.backgroundColor = '#004182';
            button.style.boxShadow = '0 0 12px rgba(0,0,0,0.15)';
        };

        button.onmouseout = () => {
            button.style.backgroundColor = '#0a66c2';
            button.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
        };

        button.addEventListener('click', () => {
            wrapper.style.filter = '';
            wrapper.style.opacity = '1';
            button.style.display = 'none';
        });

        parentDiv.appendChild(wrapper);
        parentDiv.appendChild(button);
    }
}

async function checkForCringe(post) {
    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const apiKey = await getApiKeyIfEnabled();
    if (!apiKey) return; // Stop execution if no API key

    const SYSTEM_PROMPT_PREFIX = `
        You are a LinkedIn post analyzer. Your job is to determine if a post meets the following criteria:
    `;

    const POST_CRITERIA = `
        - Selling a course, and using some emotional unrelated story
        - Overly emotional or clickbait stories with no tech-related content
        - Using "life lessons" or motivational quotes that aren't tied to personal growth in tech or learning.
        - Non-tech political or social commentary that doesn’t add value to professional discussions
        - Posts that are purely personal (vacations, family pictures) without a professional context
        - asking to "Comment 'interested' if you want to get the job!"
        - "Tag 3 people" or "like if you agree" with no substance or tech-related discussions
        - Generalized or redundant content
        - Any brand promotional content / Ad
        - Overly generic advice like "Keep learning every day" without mentioning any specific tools, frameworks, or learning paths.
        - Anything that’s just a viral meme or random content not related to a professional or technical goal.
        - Written by an LLM
        - Overly personal or TMI content
        - Excessive self-promotion or bragging
        - Inappropriate workplace behavior
        - Forced or artificial inspiration
        - Obvious humble bragging
        - Inappropriate emotional display for professional setting
        - Contains misleading or out-of-context information
    `;

    const prompt = `${SYSTEM_PROMPT_PREFIX} ${POST_CRITERIA}
        If any of the above criteria are met, the post should be considered as a cringe post.`;

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gemma2-9b-it",
                messages: [
                    { role: "system", content: prompt },
                    { role: "user", content: "Linkedin Post:\n\n" + post.innerText.trim() + "\n\nVery briefly list if the post matches any of the defined cringe criteria. If none, conclude with POST_IS_NOT_CRINGE otherwise POST_IS_CRINGE." }
                ],
                temperature: 0.1 // Lowering temperature for more consistent responses
            })
        });

        const data = await response.json();
        const isCringe = data.choices[0].message.content.toLowerCase().includes('post_is_cringe');
        if (isCringe) {
            const { filterMode } = await new Promise(resolve => {
                chrome.storage.sync.get(['filterMode'], data => {
                    resolve({ filterMode: data.filterMode || 'blur' }); // Defaulting to 'blur' if not set
                });
            });

            cringeGuardThisPost(post, filterMode);
            updateCringeStats(post.innerText);
        }
        return isCringe;
    } catch (error) {
        console.error('Error checking post:', error);
        return false;
    }
}

const debouncedCheckForCringe = debounce(checkForCringe, 1000);

function cringeGuardExistingPosts() {
    const posts = document.querySelectorAll('.update-components-update-v2__commentary');
    for (const post of posts) {
        debouncedCheckForCringe(post);
    }
}

function observeNewPosts() {
    const alreadyProcessedPosts = new Set();

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const posts = node.querySelectorAll('.update-components-update-v2__commentary');
                        for (const post of posts) {
                            if (!alreadyProcessedPosts.has(post)) {
                                alreadyProcessedPosts.add(post);
                                checkForCringe(post);
                            }
                        }
                    }
                });
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

initExtension();
