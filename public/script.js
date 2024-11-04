// script.js

const version = 'Version 0.2a - Enhanced prompts';

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
        ownKey = false; // Default value
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
async function requestBearerToken(password) {
    const response = await fetch('https://vocab.storbeck.me/api/request-token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            password: password
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

    const systemMsg = 'You are a helpful assistant that translates JSON objects containing UI text into the target language while preserving the JSON structure. Use informal language (for example in German: "Du")';
    const userMsg = `Translate the following JSON object into ${targetLanguage}. Preserve the JSON structure and keys. Do not translate any keys, only the values. Only return the JSON, no comments or remarks.

JSON to translate:
${textToTranslate}`;

    const messageTranslate = [
        { role: 'system', content: systemMsg },
        { role: 'assistant', content: userMsg }
    ]

    try {
        // Use the existing callChatGPTAPI function to get the translated text
        const responseContent = await callChatGPTAPI(messageTranslate);

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
    return new Promise((resolve, reject) => {
        const modalInfo = document.getElementById('modalInfo');
        modalInfo.style.display = 'block';
        const modalInfoButton = modalInfo.querySelector('#infoRead');

        // Remove existing Event Listeners to prevent duplicates
        modalInfoButton.replaceWith(modalInfoButton.cloneNode(true));
        document.getElementById('infoRead').addEventListener('click', async () => {
            modalInfo.style.display = 'none';
            resolve();
        });
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
            console.log('save')
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
                const apiPassword = document.getElementById('apiPasswordInput').value.trim(); // Read the API password
                const { token, expiresAt } = await requestBearerToken(apiPassword); // Send the password with the request
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
                await infoWindow()
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
                await infoWindow()
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
            const messageTask = [
                { role: 'system', content: `You create training vocabulary as a JSON object with the following structure: {"words": ["word1", "word2", "word3"]}` },
                { role: 'user', content: `Provide three random easy words in the language ${trainingLanguage}` }
            ];

            let response = await callChatGPTAPI(messageTask);

            const { words } = JSON.parse(response);

            if (words && words.length === 3) {
                vocabList.push({ word: words[0], score: 5 });
                vocabList.push({ word: words[1], score: 5 });
                vocabList.push({ word: words[2], score: 5 });
                localStorage.setItem('vocabList', JSON.stringify(vocabList));
            }
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
            console.log("translating UI")
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

    currentVocab = selectWeightedRandomVocab();

    if (currentVocab === null) {
        taskElement.textContent = uiText.learnedAllVocab;
        submitButton.style.display = 'none';
        userAnswerElement.style.display = 'none';
        document.getElementById('skipVocab').style.display = 'none';
        restartButton.style.display = 'inline-block';
        resetAppButton.style.display = 'inline-block';
        return;
    }

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

/**
 * Selects a random vocabulary item.
 * Prefers higher scores but includes all vocabs, even those with a score of 0.
 * If all scores are 0, selects uniformly at random.
 * @returns {Vocab|null} The selected vocabulary item or null if the list is empty.
 */
function selectWeightedRandomVocab() {
    if (vocabList.length === 0) return null;

    // Check if all vocab scores are 0
    const allScoresZero = vocabList.every(vocab => vocab.score === 0);

    if (allScoresZero) {
        // Perform uniform random selection
        return null;
    } else {
        // Perform weighted random selection
        // Define a base weight to ensure even items with score 0 have a chance
        const baseWeight = 1;

        // Calculate total weight
        const totalWeight = vocabList.reduce((sum, vocab) => sum + (vocab.score + baseWeight), 0);

        // Generate a random number between 0 and totalWeight
        let random = Math.random() * totalWeight;

        // Select the vocab based on the weighted random number
        for (const vocab of vocabList) {
            random -= (vocab.score + baseWeight);
            if (random < 0) {
                return vocab;
            }
        }

        // Fallback in case of rounding errors
        return vocabList[vocabList.length - 1];
    }
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
            // Original Methods
            `Leave out a difficult vocabulary word (single or compound words) in this ${trainingLanguage} sentence: "${word}". Replace the word with '...........' and ask me in ${userLanguage} to fill in the blank, providing as a hint the ${userLanguage} translation of the missing word. Do not hint at the answer in ${trainingLanguage}!`,
            
            `Ask me in ${userLanguage} for the approximate translation of the sentence ${word} from ${trainingLanguage} into ${userLanguage}. Do not hint at the full ${userLanguage} sentence for "${word}", because that is what I want to train!`,
            
            // Additional Suggested Methods
            `Present the ${trainingLanguage} sentence "${word}" in ${userLanguage} with one key phrase removed and replaced by '..........'. Prompt me to supply the missing phrase in ${trainingLanguage}, using context clues provided in ${userLanguage}.`,
            
            `Convert the ${trainingLanguage} sentence "${word}" into a multiple-choice question in ${userLanguage}, where the I must select the correct translation of a specific word or phrase from ${trainingLanguage}.`,
            
            `Break down the ${trainingLanguage} sentence "${word}" into its grammatical components and ask me in ${userLanguage} to reconnect the sentence, to enhance my understanding of sentence structure.`,
            
            `Provide a synonym or antonym in ${userLanguage} for a selected word in the ${trainingLanguage} sentence "${word}" and ask me to replace it with the appropriate term, maintaining the sentence's original meaning.`,
            
            `Present the ${trainingLanguage} sentence "${word}" in ${userLanguage} with shuffled word order and ask me to rearrange the words to form the correct sentence in ${trainingLanguage}.`,
            
            `Extract an idiomatic expression from the ${trainingLanguage} sentence "${word}" and ask me to explain its meaning in ${userLanguage}, promoting deeper linguistic comprehension.`,
            
        ];
    } else {
        methods = [
            // Original Methods
            `I want to practice the ${trainingLanguage} vocabulary '${word}'. Create a ${userLanguage} sentence with the translation and formulate a request in ${userLanguage} for me to translate this sentence into ${trainingLanguage}. Do not hint at the vocabulary '${word}', because that is what I want to train!`,
            
            `Formulate in ${userLanguage} a request for me to translate '${word}' from ${trainingLanguage} into ${userLanguage}. The request must contain the word '${word}' (if the word is a noun, use it with the correct ${trainingLanguage} article, for example in German "der/die/das")!`,
            
            `Formulate in ${userLanguage} a request for the user to translate the approximate meaning of the ${trainingLanguage} vocabulary '${word}' from ${userLanguage} into ${trainingLanguage}.Do not hint at the answer '${word}', because that is what I want to train. The request must contain the ${userLanguage} translation as a word!`,
            
            `Formulate in ${userLanguage} a request for the user to transform the ${trainingLanguage} vocabulary '${word}' (e.g., conjugate verbs, pluralize nouns, modify numbers). The request will be simple and focused on one task, not multiple tasks. Do not hint at the answer or provide the translation, as that is my training focus.`,
            
            // Additional Suggested Methods
            `Provide a ${userLanguage} definition of the ${trainingLanguage} word '${word}' and ask me to supply the correct ${trainingLanguage} term, reinforcing vocabulary retention.`,
            
            `Use the ${trainingLanguage} word '${word}' in a context-rich ${userLanguage} sentence and ask me to identify and translate the word back into ${trainingLanguage}.`,
            
            `Present the ${trainingLanguage} word '${word}' alongside its ${userLanguage} synonym and ask me to use '${word}' correctly in a new sentence in ${trainingLanguage}.`,
            
            `Generate a fill-in-the-blank exercise (with the blanks as '...........') in ${trainingLanguage} where I must insert the appropriate form of '${word}' in ${trainingLanguage} based on grammatical cues in an unordered list.`,
            
            `Create a matching exercise where I must pair the ${trainingLanguage} word '${word}' with its correct ${userLanguage} translation among a list of options.`,
            
            `Formulate a true or false statement in ${userLanguage} involving the ${trainingLanguage} word '${word}' and ask me to verify its accuracy, providing explanations as needed.`,
            
            `Design a short dialogue in ${userLanguage} incorporating the ${trainingLanguage} word '${word}' and ask me to translate the dialogue back into ${trainingLanguage}.`,
            
            `Present a scenario in ${userLanguage} that naturally uses the ${trainingLanguage} word '${word}' and ask me to respond appropriately in ${trainingLanguage}, enhancing practical usage skills.`,
            
            `Create a story prompt in ${userLanguage} that includes the ${trainingLanguage} word '${word}' and ask me to write a continuation or conclusion in ${trainingLanguage}, fostering creative application.`,
        ];
    }
        const method = methods[Math.floor(Math.random() * methods.length)];

    const system = `The assistant is a supporter in learning ${trainingLanguage} vocabulary and sentences. When creating a task for the user, the assistant always pays attention to the correct usage of the ${trainingLanguage} language, like grammar, sentence structure, and spelling. The assistant avoids unnecessary phrases like "thank you very much", "sure!" or "of course I will help you". The assistant will only formulate the task in ${userLanguage} and as if the assistant is talking to the user directly. The assistant uses informal language (e.g., in German "Du"). The assistant will not put the answer to a task in the task description. The assistant will never have the word in both languages in one task.`;

    const messageTask = [
        { role: 'system', content: system },
        { role: 'assistant', content: method }
    ]

    let response = await callChatGPTAPI(messageTask);

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

        const system = `The assistant is an encouraging, helpful, and friendly supporter in learning ${trainingLanguage} vocabulary and sentences. When evaluating answers, the assistant always pays attention to the correct usage of the ${trainingLanguage} language, like grammar, sentence structure, and spelling. The assistant will return a JSON with '"correct": true / false / null' and an evaluation for the user in the field "explanation" with ${userLanguage} text in Markdown format (for full sentences include the punctuation in the markdown highlighting) - the assistant will never use quotation marks like """ in the JSON as this may invalidate the JSON. If the answer is correct, the evaluation can be short and simple but may also include additional usages, information about the origin, or declensions of the word. If the answer is incorrect, the assistant explains to the user informally (for example in German using "du") how to avoid these mistakes in the future, pointing out correct spellings, easily confusable words, or grammatical connections if necessary. In the evaluation, all ${trainingLanguage} vocabulary or ${trainingLanguage} sentences should be italicized. For small spelling errors, "correct": null can be returned, but the evaluation should point out the minor mistakes. if the user doesn't know the answer, the assistant provides detailed assistance. The assistant Evaluates errors for the user in a detailed and friendly manner. If the user does not add an article to a noun, the assistant always reminds the user of the correct article (like der/die/das in German). If the user responds approximately correct, this should be considered "correct": null. Finally, point out things like synonyms, antonyms, declination, or related words. If the task was not ideal, the assistant will give the user the benefit of the doubt and rate it as correct. If there are multiple meanings to a word, each possible answer is correct.`;
        const vocab = `Create a task for me based on the following vocabulary: ${currentVocab.word}`;
        const originalTask = `Sure, here is a task for you: ${currentTask}`;
        const answer = `This is my answer: ${userAnswer} - please check if it is correct. `;

        const messageCheck = [
            { role: 'system', content: system },
            { role: 'user', content: vocab },
            { role: 'assistant', content: originalTask },
            { role: 'user', content: answer }
        ]

        const response = await callChatGPTAPI(messageCheck);

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

async function callChatGPTAPI(messages) {
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
                    messages
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
            const response = await fetch('https://vocab.storbeck.me/api/openai-proxy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${bearerToken}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages
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
