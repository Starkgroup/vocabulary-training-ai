// script.js

const version = 'Version 0.2 - API version';

// Utility function to convert a string to ArrayBuffer
function strToArrayBuffer(str) {
    return new TextEncoder().encode(str);
}

// Utility function to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// Utility function to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
}

// Function to derive a key from a passphrase
async function deriveKey(passphrase, salt = 'vocab-salt') {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode(salt),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// Function to encrypt data
async function encryptData(plainText, passphrase) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization vector
    const key = await deriveKey(passphrase);
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        enc.encode(plainText)
    );
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return arrayBufferToBase64(combined.buffer);
}

// Function to decrypt data
async function decryptData(cipherText, passphrase) {
    const combinedBuffer = base64ToArrayBuffer(cipherText);
    const combined = new Uint8Array(combinedBuffer);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const key = await deriveKey(passphrase);
    try {
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            data
        );
        const dec = new TextDecoder();
        return dec.decode(decrypted);
    } catch (e) {
        console.error('Decryption failed:', e);
        return null;
    }
}

// Define a passphrase for encryption
const PASSPHRASE = 'I know this method is not secure at all - but you know this is experimental an so ... screw it';

// Initialize variables
let vocabList = [];
let currentVocab = null;
let currentTask = '';
let isAwaitingAnswer = true;

// Variables for DOM elements
let taskElement;
let submitButton;
let nextButton;
let explanationContainer;
let explanationElement;
let restartButton;
let resetAppButton;
let infoWindowButton;
let userForm;
let userAnswerElement;

// Text content for UI elements
let uiText = {
    loadingTask: 'Loading ...',
    yourAnswerPlaceholder: 'Your answer',
    reviewAnswerButton: 'Is this correct?',
    nextTaskButton: 'Next task, please ...',
    addVocabAlt: 'Add Vocabulary',
    skipVocabAlt: 'I don\'t need to train this anymore',
    restartButtonAlt: 'Retrain all vocabulary',
    resetAppButtonAlt: 'Delete all settings and vocabulary',
    resetAppConfirmation: 'Are you sure you want to reset all app data? This will delete your vocabulary and progress too.',
    addVocabPrompt: 'Please enter the new vocabulary or sentences. A sentences always with punctuation in the end! One entry per line...',
    addVocabSuccess: 'Vocabulary added!',
    enterAllVocabPrompt: 'Please enter all three vocabulary items to start.',
    learnedAllVocab: 'You have successfully learned all vocabularies, great job!',
    modal: {
        apiKeyRequired: 'API Key Configuration',
        enterApiKeyPrompt: 'Please enter your OpenAI API key:',
        saveButton: 'Save',
        userLangTitle: 'What is your native language?',
        userLangPrompt: 'In English, please enter your native language:',
        userLangPlaceholder: 'For example: German',
        trainingLangTitle: 'Which language do you want to learn?',
        trainingLangPrompt: 'In English, please enter the language you want to learn:',
        trainingLangPlaceholder: 'For example: French',
        addFirstVocabTitle: 'First Vocabularies',
        addFirstVocabPrompt: 'Enter your vocabulary items in the language you are learning. You can also add full sentences (with punctuation like . / ! / ? in the end).',
        addVocabPlaceholder: 'Enter vocabulary',
        vocabularyNote: 'Please note: This is an experimental tool. There is no login - all information will be stored on this device. By deleting the cache, your progress will also be lost.'
    }
};

// Function to initialize the ownKey based on user preference
function initializeKeyPreference() {
    const storedOwnKey = localStorage.getItem('ownKey');
    if (storedOwnKey !== null) {
        ownKey = storedOwnKey === 'true';
    } else {
        ownKey = true; // Default value
    }

    // Update the UI toggle
    const useOwnKeyCheckbox = document.getElementById('useOwnKey');
    if (useOwnKeyCheckbox) {
        useOwnKeyCheckbox.checked = ownKey;
        useOwnKeyCheckbox.addEventListener('change', handleKeyToggle);
    }

    // Show/hide sections based on initial state
    toggleApiKeySections(ownKey);
}

// Function to handle the toggle switch


function handleKeyToggle(event) {
    ownKey = event.target.checked;
    localStorage.setItem('ownKey', ownKey.toString());

    toggleApiKeySections(ownKey);

    if (ownKey) {
        localStorage.removeItem('bearerToken');
        localStorage.removeItem('tokenExpiration');
    }
}

// Function to show/hide API key sections
function toggleApiKeySections(useOwnKey) {
    const ownKeySection = document.getElementById('ownKeySection');
    const backendKeySection = document.getElementById('backendKeySection');

    if (useOwnKey) {
        ownKeySection.style.display = 'block';
        backendKeySection.style.display = 'none';
    } else {
        ownKeySection.style.display = 'none';
        backendKeySection.style.display = 'block';
    }
}

// Function to request a bearer token from the backend
async function requestBearerToken() {
    const response = await fetch('api/request-token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            expirationInSeconds: 86400, // 1 day
        }),
    });

    if (!response.ok) {
        throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const expiresAt = Date.now() + 86400 * 1000; // 1 day in milliseconds
    return { token: data.token, expiresAt };
}

// Function to translate UI text
async function translateUIText(targetLanguage) {
    const textToTranslate = JSON.stringify(uiText);

    const systemPrompt = 'You are a helpful assistant that translates JSON objects containing UI text into the target language while preserving the JSON structure. Use informal language (for example in German: "Du")';
    const userPrompt = `Translate the following JSON object into ${targetLanguage}. Preserve the JSON structure and keys. Do not translate any keys, only the values. Only return the JSON, no comments or remarks.

JSON to translate:
${textToTranslate}`;

    try {
        // Use the existing callChatGPTAPI function to get the translated text
        const responseContent = await callChatGPTAPI(systemPrompt, userPrompt);

        if (!responseContent) {
            throw new Error('Received empty response from ChatGPT API.');
        }

        // Parse the translated JSON
        const translatedText = JSON.parse(responseContent);

        // Update the uiText object with the translated text
        uiText = translatedText;

        // Store the translated UI text in localStorage with the language as a key
        localStorage.setItem(`uiText_${targetLanguage}`, JSON.stringify(uiText));

        console.log(`UI text successfully translated to ${targetLanguage}.`);
    } catch (error) {
        console.error('Error translating UI text:', error);
    }
}

// Function to update UI elements with translated text
function updateUIElements() {
    if (!taskElement || !submitButton || !nextButton || !explanationElement || !restartButton || !resetAppButton || !userAnswerElement) {
        console.error('One or more DOM elements are not initialized.');
        return;
    }

    taskElement.textContent = uiText.loadingTask;
    userAnswerElement.placeholder = uiText.yourAnswerPlaceholder;
    submitButton.textContent = uiText.reviewAnswerButton;
    nextButton.textContent = uiText.nextTaskButton;
    document.getElementById('addVocabAlt').title = uiText.addVocabAlt;
    document.getElementById('skipVocab').title = uiText.skipVocabAlt;
    restartButton.title = uiText.restartButtonAlt;
    resetAppButton.title = uiText.resetAppButtonAlt;

    // Update modals
    // API Key Modal
    const modalKey = document.getElementById('modalKey');
    modalKey.querySelector('h2').textContent = uiText.modal.apiKeyRequired;
    modalKey.querySelector('#ownKeySection p').textContent = uiText.modal.enterApiKeyPrompt;
    modalKey.querySelector('#saveApiKey').textContent = uiText.modal.saveButton;

    // User Language Modal
    const modalUserLang = document.getElementById('modalUserLang');
    modalUserLang.querySelector('h2').textContent = uiText.modal.userLangTitle;
    modalUserLang.querySelector('p').textContent = uiText.modal.userLangPrompt;
    modalUserLang.querySelector('#userLanguageInput').placeholder = uiText.modal.userLangPlaceholder;
    modalUserLang.querySelector('#saveUserLanguage').textContent = uiText.modal.saveButton;

    // Training Language Modal
    const modalTrainingLang = document.getElementById('modalTrainingLang');
    modalTrainingLang.querySelector('h2').textContent = uiText.modal.trainingLangTitle;
    modalTrainingLang.querySelector('p').textContent = uiText.modal.trainingLangPrompt;
    modalTrainingLang.querySelector('#trainingLanguageInput').placeholder = uiText.modal.trainingLangPlaceholder;
    modalTrainingLang.querySelector('#saveTrainingLanguage').textContent = uiText.modal.saveButton;

    // First Vocab Modal
    const modalFirstVocab = document.getElementById('modalFirstVocab');
    modalFirstVocab.querySelector('h2').textContent = uiText.modal.addFirstVocabTitle;
    modalFirstVocab.querySelector('p').textContent = uiText.modal.addFirstVocabPrompt;
    modalFirstVocab.querySelector('#firstVocabInput1').placeholder = uiText.modal.addVocabPlaceholder;
    modalFirstVocab.querySelector('#firstVocabInput2').placeholder = uiText.modal.addVocabPlaceholder;
    modalFirstVocab.querySelector('#firstVocabInput3').placeholder = uiText.modal.addVocabPlaceholder;
    modalFirstVocab.querySelector('#saveFirstVocab').textContent = uiText.modal.saveButton;
    modalFirstVocab.querySelector('#vocabularyNote').textContent = uiText.modal.vocabularyNote;

    // Add Vocabulary Modal
    const modalAddVocab = document.getElementById('modalAddVocab');
    modalAddVocab.querySelector('h2').textContent = uiText.addVocabAlt;
    modalAddVocab.querySelector('p').textContent = uiText.addVocabPrompt;
    document.getElementById('addVocabInput').placeholder = uiText.modal.addVocabPlaceholder;
    document.getElementById('saveAddVocab').textContent = uiText.modal.saveButton;
    document.getElementById('cancelAddVocab').textContent = 'Cancel'; // You can add this to uiText if needed
}

// Function to validate API Key
async function validateApiKey(apiKey) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'reply to ping with pong' },
                    { role: 'user', content: 'ping' }
                ]
            })
        });

        if (response.ok) {
            return true;
        } else {
            const errorData = await response.json();
            console.error('API Key validation failed:', errorData);
            return false;
        }
    } catch (error) {
        console.error('Error validating API Key:', error);
        return false;
    }
}

// Function to show the initial API key modal
function infoWindow() {
    const modalInfo = document.getElementById('modalInfo');
    modalInfo.style.display = 'block';
    const modalInfoButton = modalInfo.querySelector('#infoRead');

    // Remove existing Event Listeners to prevent duplicates
    modalInfoButton.replaceWith(modalInfoButton.cloneNode(true));
    document.getElementById('infoRead').addEventListener('click', async () => {
        modalInfo.style.display = 'none';
    });
}

// Function to show the API key modal
function requestApiKey() {
    return new Promise((resolve, reject) => {
        const modalKey = document.getElementById('modalKey');
        modalKey.style.display = 'block';
        const saveApiKeyButton = modalKey.querySelector('#saveApiKey');

        // Remove existing Event Listeners to prevent duplicates
        saveApiKeyButton.replaceWith(saveApiKeyButton.cloneNode(true));
        const newSaveApiKeyButton = modalKey.querySelector('#saveApiKey');

        newSaveApiKeyButton.addEventListener('click', async () => {
            const key = document.getElementById('apiKeyInput').value.trim();
            if (key) {
                // Disable the button and show loading text
                newSaveApiKeyButton.disabled = true;
                newSaveApiKeyButton.textContent = 'Validating...';

                const isValid = await validateApiKey(key);
                if (isValid) {
                    try {
                        const encryptedKey = await encryptData(key, PASSPHRASE);
                        localStorage.setItem('apiKey', encryptedKey);
                        // Hide the modal
                        modalKey.style.display = 'none';
                        // Reset button text and state
                        newSaveApiKeyButton.textContent = 'Save';
                        newSaveApiKeyButton.disabled = false;
                        resolve();
                    } catch (encryptionError) {
                        console.error('Encryption failed:', encryptionError);
                        alert('An error occurred while encrypting the API key. Please try again.');
                        // Reset button text and state
                        newSaveApiKeyButton.textContent = 'Save';
                        newSaveApiKeyButton.disabled = false;
                        reject(encryptionError);
                    }
                } else {
                    alert(`The API key you entered is invalid. Please check your OpenAI credit balance and the key itself.\n\nA quick explanation of what happened: The app tried to use your API key with OpenAI to validate the connection. Without a valid key, the app won't work. But the response was invalid. Either you have a typo in the key or you have no credit balance on your OpenAI developer account. Both can only be fixed on your end...`);
                    // Reset button text and state
                    newSaveApiKeyButton.textContent = 'Save';
                    newSaveApiKeyButton.disabled = false;
                    reject(new Error('Invalid API Key'));
                }
            } else {
                alert('Please enter an API key.');
            }
        });
    });
}


// Function to show the user language modal
function requestUserLanguage() {
    return new Promise((resolve, reject) => {
        const modalUserLang = document.getElementById('modalUserLang');
        modalUserLang.style.display = 'block';
        const saveUserLangButton = modalUserLang.querySelector('#saveUserLanguage');

        // Remove existing Event Listeners to prevent duplicates
        saveUserLangButton.replaceWith(saveUserLangButton.cloneNode(true));
        const newSaveUserLangButton = modalUserLang.querySelector('#saveUserLanguage');

        newSaveUserLangButton.addEventListener('click', () => {
            const language = document.getElementById('userLanguageInput').value.trim();
            if (language) {
                localStorage.setItem('userLanguage', language);
                modalUserLang.style.display = 'none';
                resolve();
            } else {
                alert('Please enter your native language.');
                reject(new Error('No language entered'));
            }
        });
    });
}

function requestTrainingLanguage() {
    return new Promise((resolve, reject) => {
        const modalTrainingLang = document.getElementById('modalTrainingLang');
        modalTrainingLang.style.display = 'block';
        const saveTrainingLangButton = modalTrainingLang.querySelector('#saveTrainingLanguage');

        // Remove existing Event Listeners to prevent duplicates
        saveTrainingLangButton.replaceWith(saveTrainingLangButton.cloneNode(true));
        const newSaveTrainingLangButton = modalTrainingLang.querySelector('#saveTrainingLanguage');

        newSaveTrainingLangButton.addEventListener('click', () => {
            const language = document.getElementById('trainingLanguageInput').value.trim();
            if (language) {
                localStorage.setItem('trainingLanguage', language);
                modalTrainingLang.style.display = 'none';
                resolve();
            } else {
                alert('Please enter the language you want to learn.');
                reject(new Error('No training language entered'));
            }
        });
    });
}

function promptInitialVocabularies() {
    return new Promise((resolve, reject) => {
        const modalFirstVocab = document.getElementById('modalFirstVocab');
        modalFirstVocab.style.display = 'block';
        const saveFirstVocabButton = modalFirstVocab.querySelector('#saveFirstVocab');

        // Remove any previous event listeners to prevent duplicates
        saveFirstVocabButton.replaceWith(saveFirstVocabButton.cloneNode(true));
        const newSaveFirstVocabButton = modalFirstVocab.querySelector('#saveFirstVocab');

        newSaveFirstVocabButton.addEventListener('click', () => {
            const vocab1 = document.getElementById('firstVocabInput1').value.trim();
            const vocab2 = document.getElementById('firstVocabInput2').value.trim();
            const vocab3 = document.getElementById('firstVocabInput3').value.trim();
            if (vocab1 && vocab2 && vocab3) {
                vocabList.push({ word: vocab1, score: 5 });
                vocabList.push({ word: vocab2, score: 5 });
                vocabList.push({ word: vocab3, score: 5 });
                localStorage.setItem('vocabList', JSON.stringify(vocabList));
                modalFirstVocab.style.display = 'none';
                resolve();
            } else {
                alert(uiText.enterAllVocabPrompt);
                reject(new Error('Incomplete vocab entries'));
            }
        });
    });
}

function obtainBearerToken() {
    return new Promise((resolve, reject) => {
        const modalKey = document.getElementById('modalKey');
        modalKey.style.display = 'block';
        const requestBackendTokenButton = document.getElementById('requestBackendToken');

        // Remove existing Event Listeners to prevent duplicates
        requestBackendTokenButton.replaceWith(requestBackendTokenButton.cloneNode(true));
        const newRequestBackendTokenButton = modalKey.querySelector('#requestBackendToken');

        newRequestBackendTokenButton.addEventListener('click', async () => {
            newRequestBackendTokenButton.disabled = true;
            newRequestBackendTokenButton.textContent = 'Obtaining Token...';

            try {
                const { token, expiresAt } = await requestBearerToken();
                localStorage.setItem('bearerToken', token);
                localStorage.setItem('tokenExpiration', expiresAt.toString());

                // Hide the modal after obtaining the token
                modalKey.style.display = 'none';
                resolve();
            } catch (error) {
                console.error('Error obtaining bearer token:', error);
                alert('Failed to obtain bearer token. Please try again later.');
                reject(error);
            } finally {
                newRequestBackendTokenButton.disabled = false;
                newRequestBackendTokenButton.textContent = 'Obtain Token';
            }
        });
    });
}



let ownKey = null;

const userLanguage = localStorage.getItem('userLanguage');
const trainingLanguage = localStorage.getItem('trainingLanguage');

const storedApiKey = localStorage.getItem('apiKey');
const storedBearerToken = localStorage.getItem('bearerToken');

initializeApp();

async function initializeApp() {
    const lastVersion = localStorage.getItem('version');
    if (version !== lastVersion) {
        localStorage.setItem('version', version);
        try {
            localStorage.removeItem(`uiText_${userLanguage}`);
        } catch {

        } 
    }
    document.getElementById('version').innerText = version;

    ownKey = localStorage.getItem('ownKey') === 'true'; // Ensure it's a boolean
    if (ownKey === null) {
        console.log('ownKey not set in localStorage');
        ownKey = true; // Default to using own API key
        localStorage.setItem('ownKey', ownKey.toString());
    }

    if (ownKey) {
        const storedApiKey = localStorage.getItem('apiKey');
        if (!storedApiKey) {
            try {
                await requestApiKey();
            } catch (error) {
                console.error('API Key setup failed:', error);
                return;
            }
        }
    } else {
        const storedBearerToken = localStorage.getItem('bearerToken');
        const tokenExpiration = localStorage.getItem('tokenExpiration');
        if (!storedBearerToken || !tokenExpiration || Date.now() > parseInt(tokenExpiration)) {
            // Token is missing or expired, prompt user to obtain a new token
            try {
                await obtainBearerToken();
            } catch (error) {
                console.error('Bearer Token setup failed:', error);
                return;
            }
        }
    }

    const trainingLanguage = localStorage.getItem('trainingLanguage');
    if (!trainingLanguage) {
        try {
            await requestTrainingLanguage();
        } catch (error) {
            console.error('Training Language setup failed:', error);
            return;
        }
    }

    const userLanguage = localStorage.getItem('userLanguage');
    if (!userLanguage) {
        try {
            await requestUserLanguage();
        } catch (error) {
            console.error('User Language setup failed:', error);
            return;
        }
    }

    const storedUIText = localStorage.getItem(`uiText_${userLanguage}`);
    if (storedUIText) {
        uiText = JSON.parse(storedUIText);
    } else {
        if (userLanguage && userLanguage.toLowerCase() !== 'english') {
            await translateUIText(userLanguage);
        } else {
            console.log('English - no translation necessary');
        }
    }

    loadVocabList();

    if (!Array.isArray(vocabList) || vocabList.length === 0) {
        try {
            await promptInitialVocabularies();
        } catch (error) {
            console.error('Initial Vocabularies setup failed:', error);
            return;
        }
    }

    // Initialize DOM elements
    taskElement = document.getElementById('task');
    submitButton = document.getElementById('submitAnswer');
    nextButton = document.getElementById('nextQuestion');
    explanationContainer = document.getElementById('explanationContainer');
    explanationElement = document.getElementById('explanation');
    restartButton = document.getElementById('restartButton');
    resetAppButton = document.getElementById('resetApp');
    infoWindowButton = document.getElementById('infoWindow');
    userForm = document.getElementById('userForm');
    userAnswerElement = document.getElementById('userAnswer');

    // Update the UI elements with the translated text
    updateUIElements();

    setupEventListeners();
    loadNextQuestion();
}

async function getApiKey() {
    if (ownKey === true) {
        const encryptedKey = localStorage.getItem('apiKey');
        if (!encryptedKey) {
            console.error('API Key is missing. Please enter your OpenAI API key.');
            return null;
        }
        const decryptedKey = await decryptData(encryptedKey, PASSPHRASE);
        if (!decryptedKey) {
            console.error('Failed to decrypt the API Key.');
            return null;
        }
        return decryptedKey;
    } else {
        const bearerToken = localStorage.getItem('bearerToken');
        const tokenExpiration = localStorage.getItem('tokenExpiration');

        if (!bearerToken || !tokenExpiration || Date.now() > parseInt(tokenExpiration)) {
            console.error('Bearer token is missing or expired.');
            localStorage.removeItem('bearerToken');
            localStorage.removeItem('tokenExpiration');
            requestApiKey();
            return null;
        }

        return bearerToken;
    }
}

function loadVocabList() {
    const storedVocabList = localStorage.getItem('vocabList');
    if (storedVocabList) {
        try {
            vocabList = JSON.parse(storedVocabList);
        } catch (e) {
            console.error('Error parsing vocabulary list:', e);
            vocabList = [];
        }
    } else {
        vocabList = [];
    }
}

function setupEventListeners() {
    restartButton.addEventListener('click', restartTraining);
    resetAppButton.addEventListener('click', resetApp);
    infoWindowButton.addEventListener('click', infoWindow);
    document.getElementById('addVocab').addEventListener('click', addVocab);
    document.getElementById('skipVocab').addEventListener('click', skipVocab);
    submitButton.addEventListener('click', submitAnswer);
    nextButton.addEventListener('click', loadNextQuestion);

    userAnswerElement.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey && isAwaitingAnswer) {
            event.preventDefault();
            submitAnswer();
            userAnswerElement.blur();
        }
    });

    userForm.addEventListener('submit', function (event) {
        event.preventDefault();
    });
}

async function loadNextQuestion() {
    // Hide the nextQuestion button immediately
    nextButton.style.display = 'none';

    // Reset UI elements
    userAnswerElement.classList.remove('correct', 'incorrect', 'partial');
    isAwaitingAnswer = true;
    explanationContainer.style.display = 'none';
    userAnswerElement.value = '';
    userAnswerElement.disabled = false; // Re-enable the input for the new question

    // Optionally, you can show a loading indicator here
    taskElement.textContent = uiText.loadingTask;

    const highScoreVocabs = getHighScoreVocabs();
    if (highScoreVocabs.length === 0) {
        taskElement.textContent = uiText.learnedAllVocab;
        submitButton.style.display = 'none';
        userAnswerElement.style.display = 'none';
        document.getElementById('skipVocab').style.display = 'none';
        restartButton.style.display = 'inline-block';
        resetAppButton.style.display = 'inline-block';
        return;
    }

    currentVocab = selectRandomVocab();
    if (!currentVocab) {
        console.error('No vocabulary available to select.');
        // Optionally, show the submit button again
        submitButton.style.display = 'inline-block';
        return;
    }

    try {
        currentTask = await generateTask(currentVocab.word);
        taskElement.innerHTML = currentTask;

        // Show the submit button after the new task is loaded
        submitButton.style.display = 'inline-block';
    } catch (error) {
        console.error('Error loading next question:', error);
        taskElement.textContent = 'Error loading the next task. Please try again.';
        // Optionally, show the nextButton again to allow retry
        nextButton.style.display = 'inline-block';
    }
}

function getHighScoreVocabs() {
    if (vocabList.length === 0) return [];

    // Generate a random integer between 0 and 2 (inclusive)
    const randomChance = Math.floor(Math.random() * 3); // Possible values: 0, 1, 2

    if (randomChance === 0) { // 1 in 3 chance
        // Select a random vocab item
        const randomIndex = Math.floor(Math.random() * vocabList.length);
        return [vocabList[randomIndex]]; // Return as an array to maintain consistent return type
    } else {
        // Proceed with high-score filtering
        const maxScore = Math.max(...vocabList.map(v => v.score));

        // Filter vocabularies with scores within 3 points of the maxScore and at least 1
        return vocabList.filter(v => v.score >= (maxScore - 3) && v.score >= 1);
    }
}

function selectRandomVocab() {
    const highScoreVocabs = getHighScoreVocabs();
    if (highScoreVocabs.length === 0) {
        return null;
    }
    return highScoreVocabs[Math.floor(Math.random() * highScoreVocabs.length)];
}

function restartTraining() {
    if (Array.isArray(vocabList)) {
        vocabList.forEach(v => v.score = 5);
        localStorage.setItem('vocabList', JSON.stringify(vocabList));
    } else {
        console.error('Vocabulary list is not available or invalid.');
    }

    submitButton.style.display = 'inline-block';
    userAnswerElement.style.display = 'block';
    document.getElementById('skipVocab').style.display = 'inline-block';
    restartButton.style.display = 'none';
    resetAppButton.style.display = 'none';

    loadNextQuestion();
}

async function generateTask(word) {
    const userLanguage = localStorage.getItem('userLanguage');
    const trainingLanguage = localStorage.getItem('trainingLanguage');

    const isSentence = /^[A-ZÄÖÜ].*[.!?]$/.test(word);
    let methods = [];
    if (isSentence) {
        methods = [
            `The assistant will leave out a difficult vocabulary word (single or compound words) in this ${trainingLanguage} sentence: ${word} - The assistant will replace the word with '...........' and ask the user in ${userLanguage} to fill in the blank, providing as a hint the ${userLanguage} translation of the missing word. The assistant will not hint at the answer in ${trainingLanguage}!`,
            `The assistant will ask the user in ${userLanguage} for the approximate translation of the sentence from ${trainingLanguage} into ${userLanguage}: '${word}'. The assistant will not hint at the full sentence '${word}', because that is what the user wants to train!`
        ];
    } else {
        methods = [
            `The user wants to practice the ${trainingLanguage} vocabulary '${word}'. The assistant will create a ${userLanguage} sentence with the translation and formulate a request in ${userLanguage} for the user to translate this sentence into ${trainingLanguage}. The assistant will not hint at the vocabulary '${word}', because that is what the user wants to train!`,
            `The assistant will formulate in ${userLanguage} a request for the user to translate '${word}' from ${trainingLanguage} into ${userLanguage}. The request must contain the word '${word}' (if the word is a noun, use it with the correct ${trainingLanguage} article, for example in German "der/die/das")!`,
            `The assistant will formulate in ${userLanguage} a request for the user to translate the approximate meaning of the ${trainingLanguage} vocabulary '${word}' from ${userLanguage} into ${trainingLanguage}. The assistant will not hint at the answer '${word}', because that is what the user wants to train. The request must contain the ${userLanguage} translation as a word!`,
            `The assistant will formulate in ${userLanguage} a request for the user to transform the ${trainingLanguage} vocabulary '${word}', (if it's a verb, decline it correctly for example, for nouns create the plural or something similar). The request will be simple and focused on one task, not for example five full sentences, but a full declination is okay. The assistant will not hint at the answer to the task and not give the translation, because that is what the user wants to train.`,
        ];
    }
    const method = methods[Math.floor(Math.random() * methods.length)];

    const systemPrompt = `The assistant is a supporter in learning ${trainingLanguage} vocabulary and sentences. When creating a task for the user, the assistant always pays attention to the correct usage of the ${trainingLanguage} language, like grammar, sentence structure, and spelling. The assistant avoids unnecessary phrases like "thank you very much", "sure!" or "of course I will help you". The assistant will only formulate the task in ${userLanguage} and as if the assistant is talking to the user directly. The assistant uses informal language (e.g., in German "Du"). The assistant will not put the answer to a task in the task description.`;

    let response = await callChatGPTAPI(systemPrompt, method);

    response = markdownToHTML(response);

    return response;
}

async function submitAnswer() {
    if (!isAwaitingAnswer) return;

    const userAnswer = userAnswerElement.value.trim();
    if (!userAnswer) {
        alert(uiText.yourAnswerPlaceholder);
        return;
    }

    isAwaitingAnswer = false;

    // Hide the submit button and disable the input to prevent further input
    submitButton.style.display = 'none';
    userAnswerElement.disabled = true;
    explanationContainer.style.display = 'none';

    try {
        const userLanguage = localStorage.getItem('userLanguage');
        const trainingLanguage = localStorage.getItem('trainingLanguage');

        const systemPrompt = `The assistant is an encouraging, helpful, and friendly supporter in learning ${trainingLanguage} vocabulary and sentences. When evaluating answers, the assistant always pays attention to the correct usage of the ${trainingLanguage} language, like grammar, sentence structure, and spelling. It will only formulate the review as if the assistant is talking to the user directly.`;

        const checkPrompt = `The assistant will check the following user answer to the given task and return a JSON with '"correct": true / false / null' and an evaluation for the user in the field "explanation" with ${userLanguage} text in Markdown format (for full sentences including punctuation) - the assistant will never use quotation marks like """ in the JSON as this may invalidate the JSON. If the answer is correct, the evaluation can be short and simple but may also include additional usages, information about the origin, or declensions of the word. If the answer is incorrect, the assistant explains to the user informally (for example in German using "du") how to avoid these mistakes in the future, pointing out correct spellings, easily confusable words, or grammatical connections if necessary. In the evaluation, all ${trainingLanguage} vocabulary or ${trainingLanguage} sentences should be italicized. For small spelling errors (missing letters or missing accents, for example), "correct": null can be returned, but the evaluation should point out the minor mistakes.

Vocabulary: ${currentVocab.word}

Task: ${currentTask}

User's answer: ${userAnswer} - if the user doesn't know the answer, provide detailed assistance. Evaluate errors for the user in a detailed and friendly manner, offering help in deriving the incorrect words or sentences from ${userLanguage} into ${trainingLanguage}. If the user does not add an article to a noun, the assistant always reminds the user of the correct article (like der/die/das in German). If the user responds approximately correctly but not exactly with ${currentVocab.word}, this should be considered "correct": null. Finally, point out things like synonyms, antonyms, declination, or related words.`;

        const response = await callChatGPTAPI(systemPrompt, checkPrompt);

        try {
            const result = JSON.parse(response);
            explanationContainer.style.display = 'block';
            explanationElement.innerHTML = markdownToHTML(result.explanation);
            adjustScore(result.correct);
            enableVocabClick();

            userAnswerElement.classList.remove('correct', 'incorrect', 'partial');

            if (result.correct === true) {
                userAnswerElement.classList.add('correct');
            } else if (result.correct === false) {
                userAnswerElement.classList.add('incorrect');
            } else if (result.correct === null) {
                userAnswerElement.classList.add('partial');
            }

            // Show the nextQuestion button after processing the response
            nextButton.style.display = 'inline-block';
        } catch (e) {
            console.error('Error processing the answer:', e);
            explanationContainer.style.display = 'block';
            explanationElement.textContent = 'Error processing the answer.';
            // Optionally, show the submit button again to allow retry
            submitButton.style.display = 'inline-block';
            userAnswerElement.disabled = false;
            isAwaitingAnswer = true;
        }
    } catch (error) {
        console.error('Error during submitAnswer:', error);
        alert('An error occurred while submitting your answer. Please try again.');
        // Show the submit button again to allow retry
        submitButton.style.display = 'inline-block';
        userAnswerElement.disabled = false;
        isAwaitingAnswer = true;
    }
}

function adjustScore(correct) {
    const vocabIndex = vocabList.findIndex(v => v.word === currentVocab.word);
    if (vocabIndex === -1) {
        console.error('Current vocabulary not found in the list.');
        return;
    }

    if (correct === true) {
        vocabList[vocabIndex].score -= 1;
    } else if (correct === false) {
        vocabList[vocabIndex].score += 1;
    }
    vocabList[vocabIndex].score = Math.max(0, Math.min(10, vocabList[vocabIndex].score));
    localStorage.setItem('vocabList', JSON.stringify(vocabList));
}

function skipVocab() {
    const vocabIndex = vocabList.findIndex(v => v.word === currentVocab.word);
    if (vocabIndex === -1) {
        console.error('Current vocabulary not found in the list.');
        return;
    }
    vocabList[vocabIndex].score = 0;
    localStorage.setItem('vocabList', JSON.stringify(vocabList));
    loadNextQuestion();
}

function addVocab() {
    const modalAddVocab = document.getElementById('modalAddVocab');
    modalAddVocab.style.display = 'block';

    // Clear previous input
    document.getElementById('addVocabInput').value = '';

    // Remove existing event listeners to prevent duplicates
    const saveAddVocabButton = document.getElementById('saveAddVocab');
    const cancelAddVocabButton = document.getElementById('cancelAddVocab');

    saveAddVocabButton.replaceWith(saveAddVocabButton.cloneNode(true));
    cancelAddVocabButton.replaceWith(cancelAddVocabButton.cloneNode(true));

    document.getElementById('saveAddVocab').addEventListener('click', () => {
        const inputText = document.getElementById('addVocabInput').value.trim();
        if (inputText) {
            const words = inputText.split('\n').map(word => word.trim()).filter(word => word);
            words.forEach(newVocab => {
                vocabList.push({ word: newVocab, score: 5 });
            });
            localStorage.setItem('vocabList', JSON.stringify(vocabList));
            modalAddVocab.style.display = 'none';
        } else {
            alert('Please enter valid vocabulary items.');
        }
    });

    document.getElementById('cancelAddVocab').addEventListener('click', () => {
        modalAddVocab.style.display = 'none';
    });
}

function resetApp() {
    const confirmation = confirm(uiText.resetAppConfirmation);
    if (confirmation) {
        localStorage.clear();
        // Optionally, clear specific items if needed
        // localStorage.removeItem('apiKey');
        location.reload();
    }
}

async function callChatGPTAPI(systemPrompt, userPrompt) {
    console.log("ownKey", ownKey)
    if (ownKey === true) {
        // Use the user's own API key
        console.log("ownKey true")

        const apiKey = await getApiKey();
        if (!apiKey) {
            console.error('API Key is missing or invalid.');
            return '';
        }

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            let content = data.choices[0].message.content;

            content = content.replace(/^```(?:json)?\n?/, '');
            content = content.replace(/\n?```$/, '');
            content = content.replace(/\\"/g, "'");
            content = content.replace(/\\`/g, "'");

            return content;
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            return '';
        }
    } else {
        console.log("Going through API route")

        // Use the backend's API key via the proxy
        const bearerToken = await getApiKey(); // Now holds the bearer token

        if (!bearerToken) {
            console.error('Bearer token is missing or invalid.');
            return '';
        }

        try {
            const response = await fetch('api/openai-proxy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${bearerToken}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI Proxy API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            let content = data.choices[0].message.content;

            content = content.replace(/^```(?:json)?\n?/, '');
            content = content.replace(/\n?```$/, '');
            content = content.replace(/\\"/g, "'");
            content = content.replace(/\\`/g, "'");

            return content;
        } catch (error) {
            console.error('Error calling OpenAI Proxy API:', error);
            return '';
        }
    }
}

// Initialize the key preference on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeKeyPreference();

    // Event listener for the "Obtain Token" button
    document.getElementById('requestBackendToken').addEventListener('click', async () => {
        const requestTokenButton = document.getElementById('requestBackendToken');
        requestTokenButton.disabled = true;
        requestTokenButton.textContent = 'Obtaining Token...';

        try {
            const { token, expiresAt } = await requestBearerToken();
            localStorage.setItem('bearerToken', token);
            localStorage.setItem('tokenExpiration', expiresAt.toString());

            // Hide the modal after obtaining the token
            const modalKey = document.getElementById('modalKey');
            modalKey.style.display = 'none';

        } catch (error) {
            console.error('Error obtaining bearer token:', error);
            alert('Failed to obtain bearer token. Please try again later.');
        } finally {
            requestTokenButton.disabled = false;
            requestTokenButton.textContent = 'Obtain Token';
        }
    });

});

// Function to convert markdown to HTML
function markdownToHTML(markdown) {
    if (!markdown) return '';
    markdown = markdown.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
    markdown = markdown.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');
    markdown = markdown.replace(/(^|\n)(\d+)\. (.+)/g, function (match, newline, number, item) {
        return `${newline}<ol><li>${item}</li></ol>`;
    });
    markdown = markdown.replace(/(^|\n)[\*\-] (.+)/g, function (match, newline, item) {
        return `${newline}<ul><li>${item}</li></ul>`;
    });
    markdown = markdown.replace(/<\/(ul|ol)>\n<\1>/g, '\n');
    markdown = markdown.replace(/\n/g, '<br>');
    return markdown;
}

function enableVocabClick() {
    const emElements = explanationElement.querySelectorAll('em');
    emElements.forEach(em => {
        em.style.cursor = 'pointer';
        em.addEventListener('click', () => {
            const modalAddVocab = document.getElementById('modalAddVocab');
            modalAddVocab.style.display = 'block';

            // Pre-fill the input with the clicked word
            const existingWord = em.textContent.replace(/['"`]/g, "").trim();
            document.getElementById('addVocabInput').value = existingWord;

            // Remove existing event listeners to prevent duplicates
            const saveAddVocabButton = document.getElementById('saveAddVocab');
            const cancelAddVocabButton = document.getElementById('cancelAddVocab');

            saveAddVocabButton.replaceWith(saveAddVocabButton.cloneNode(true));
            cancelAddVocabButton.replaceWith(cancelAddVocabButton.cloneNode(true));

            document.getElementById('saveAddVocab').addEventListener('click', () => {
                const editedVocab = document.getElementById('addVocabInput').value.trim();
                if (editedVocab) {
                    vocabList.push({ word: editedVocab, score: 5 });
                    localStorage.setItem('vocabList', JSON.stringify(vocabList));
                    modalAddVocab.style.display = 'none';
                } else {
                    alert('Please enter a valid vocabulary item.');
                }
            });

            document.getElementById('cancelAddVocab').addEventListener('click', () => {
                modalAddVocab.style.display = 'none';
            });
        });
    });
}