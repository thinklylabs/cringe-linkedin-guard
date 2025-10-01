document.addEventListener("DOMContentLoaded", function () {
    const apiKeyInput = document.getElementById("api-key");
    const saveButton = document.getElementById("save-button");
    const successMessage = document.createElement("p");

    successMessage.innerText = "✅ API Key saved successfully!";
    successMessage.style.color = "#0077b5";
    successMessage.style.fontSize = "14px";
    successMessage.style.fontWeight = "500";
    successMessage.style.textAlign = "center";
    successMessage.style.marginTop = "10px";
    successMessage.style.display = "none";

    document.querySelector(".api-key-section").appendChild(successMessage);

    // Load API key from Chrome storage
    chrome.storage.sync.get("geminiApiKey", function (data) {
        if (data.geminiApiKey) {
            apiKeyInput.value = data.geminiApiKey;
        }
    });

    // Save API key to Chrome storage
    saveButton.addEventListener("click", function () {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) return;

        chrome.storage.sync.set({ geminiApiKey: apiKey }, function () {
            successMessage.style.display = "block";
            successMessage.style.opacity = "1";

            // Hide message after 3 seconds
            setTimeout(() => {
                successMessage.style.opacity = "0";
                setTimeout(() => {
                    successMessage.style.display = "none";
                }, 300);
            }, 3000);
        });
    });
});
