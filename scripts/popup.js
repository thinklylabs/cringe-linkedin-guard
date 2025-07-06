document.addEventListener("DOMContentLoaded", function () {
    // check the stored API key when popup opens
    chrome.storage.sync.get("groqApiKey", function (data) {
        const errorCard = document.querySelector(".error-card");

        if (data.groqApiKey) {
            errorCard.style.display = "none";
        }
    });

    // toggle swish for cringe guard
    const toggleSwitch = document.getElementById("toggle-switch");

    // Load initial state from Chrome storage
    chrome.storage.sync.get("isEnabled", function (data) {
        toggleSwitch.checked = data.isEnabled ?? false; // Default to false
    });

    // Listen for toggle changes
    toggleSwitch.addEventListener("change", function () {
        chrome.storage.sync.set({ isEnabled: toggleSwitch.checked });
    });

    chrome.storage.sync.get(["cringeCount", "timeSavedInMinutes"], function (data) {
        document.getElementById("cringe-count").innerText = data.cringeCount || 0;
        document.getElementById("time-saved").innerText = Math.ceil(data.timeSavedInMinutes || 0) + "m";
    });

    // Load filter mode setting
    chrome.storage.sync.get("filterMode", function (data) {
        const filterMode = data.filterMode || "blur"; // Default to blur if not set
        const toggleSlider = document.querySelector('.toggle-slider');

        if (filterMode === "remove") {
            toggleSlider.classList.add('remove');
            toggleSlider.classList.remove('blur');
            // TODO - description should be changed only from 1 place
            document.getElementById('mode-description').textContent =
                "Vanish cringe completely";
        } else {
            toggleSlider.classList.add('blur');
            toggleSlider.classList.remove('remove');
            document.getElementById('mode-description').textContent =
                "Blurs cringe until you decide";
        }
    });

    // Listen for filter mode changes
    const toggleSlider = document.querySelector('.toggle-slider');
    toggleSlider.addEventListener('click', function () {
        const currentMode = this.classList.contains('blur') ? 'blur' : 'remove';
        const newMode = currentMode === 'blur' ? 'remove' : 'blur';

        this.classList.remove(currentMode);
        this.classList.add(newMode);

        // Update description
        if (newMode === 'remove') {
            document.getElementById('mode-description').textContent =
                "Vanish cringe completely";
        } else {
            document.getElementById('mode-description').textContent =
                "Blurs cringe until you decide";
        }

        chrome.storage.sync.set({ filterMode: newMode });
        console.log(`Filter mode changed to: ${newMode}`);
    });

    // take user to the settings page
    const settingsButton = document.querySelector('.settings-icon');
    settingsButton.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Mute words functionality
    let mutedWords = [];

    function loadMutedWords() {
        chrome.storage.sync.get(['mutedWords'], (data) => {
            mutedWords = data.mutedWords || [];
            updateMutedWordsDisplay();
        });
    }

    function saveMutedWords() {
        chrome.storage.sync.set({ mutedWords: mutedWords });
    }

    function updateMutedWordsDisplay() {
        const container = document.getElementById('muted-words-list');
        const emptyState = document.getElementById('empty-state');
        const clearAllBtn = document.getElementById('clear-all-btn');
        const muteCount = document.getElementById('mute-count');

        muteCount.textContent = `${mutedWords.length} word${mutedWords.length !== 1 ? 's' : ''}`;

        if (mutedWords.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'block';
            clearAllBtn.style.display = 'none';
        } else {
            container.style.display = 'flex';
            emptyState.style.display = 'none';
            clearAllBtn.style.display = 'block';

            container.innerHTML = '';
            mutedWords.forEach((word, index) => {
                const wordTag = document.createElement('div');
                wordTag.className = 'muted-word-tag';
                wordTag.innerHTML = `
                    <span>${word}</span>
                    <button class="remove-word-btn">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                `;

                const removeBtn = wordTag.querySelector('.remove-word-btn');
                removeBtn.addEventListener('click', () => removeMutedWord(index));

                container.appendChild(wordTag);
            });
        }
    }

    function addMutedWord() {
        const input = document.getElementById('mute-input');
        const word = input.value.trim().toLowerCase();

        if (word && !mutedWords.includes(word) && mutedWords.length < 20) {
            mutedWords.push(word);
            saveMutedWords();
            updateMutedWordsDisplay();
            input.value = '';
            updateAddButtonState();
        }
    }

    function removeMutedWord(index) {
        console.log(`Removing muted word at index ${index}`);
        mutedWords.splice(index, 1);
        saveMutedWords();
        updateMutedWordsDisplay();
        updateAddButtonState();
    }

    function clearAllMutedWords() {
        mutedWords = [];
        saveMutedWords();
        updateMutedWordsDisplay();
        updateAddButtonState();
    }

    function updateAddButtonState() {
        const input = document.getElementById('mute-input');
        const addBtn = document.getElementById('add-word-btn');
        const word = input.value.trim().toLowerCase();

        const isValid = word && !mutedWords.includes(word) && mutedWords.length < 20;
        addBtn.disabled = !isValid;
    }

    // Event listeners
    document.getElementById('add-word-btn').addEventListener('click', addMutedWord);
    document.getElementById('clear-all-btn').addEventListener('click', clearAllMutedWords);

    const muteInput = document.getElementById('mute-input');
    muteInput.addEventListener('input', updateAddButtonState);
    muteInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addMutedWord();
        }
    });

    // Initialize
    loadMutedWords();
    updateAddButtonState();
});