document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const themeCheckbox = document.getElementById('theme-checkbox');
    const body = document.body;
    const charInput = document.getElementById('char-input');
    const startBtn = document.getElementById('start-btn');
    const charList = document.getElementById('char-list');
    const writerTarget = document.getElementById('writer-target');
    const stage1Btn = document.getElementById('stage-1-btn');
    const stage3Btn = document.getElementById('stage-3-btn');
    const eraseBtn = document.getElementById('erase-btn');
    const playSoundBtn = document.getElementById('play-sound-btn');
    const strokeWidthSlider = document.getElementById('stroke-width-slider');
    const completionDialog = document.getElementById('completion-dialog');
    const practiceAgainBtn = document.getElementById('practice-again-btn');
    const completionFeedback = document.getElementById('completion-feedback');
    const completionSound = document.getElementById('completion-sound');

    // --- App State ---
    let writer = null;
    let characters = [];
    let currentCharacterIndex = -1;
    let currentStage = 1;
    let hasUsedHint = false;
    
    // --- Theme Initialization ---
    function applyTheme(isDarkMode) {
        body.classList.toggle('dark-mode', isDarkMode);
        themeCheckbox.checked = isDarkMode;
        
        // Update HanziWriter colors if it exists
        if (writer) {
            const highlightColor = getComputedStyle(document.documentElement).getPropertyValue('--highlight-color').trim();
            const outlineColor = isDarkMode ? '#444' : '#f0f0f0';
            writer.updateColor('strokeColor', highlightColor, {
                duration: 300
            });
            writer.updateColor('outlineColor', outlineColor, {
                duration: 300
            });
        }
    }

    themeCheckbox.addEventListener('change', () => {
        const isDarkMode = themeCheckbox.checked;
        localStorage.setItem('darkMode', isDarkMode);
        applyTheme(isDarkMode);
    });

    // Load theme from local storage
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    applyTheme(savedDarkMode);

    // --- Core Functions ---

    function speakCharacter(char) {
        if ('speechSynthesis' in window && char) {
            // Cancel any previous speech to avoid overlap
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(char);
            utterance.lang = 'zh-CN';
            utterance.rate = 0.8; // Slow down the speech slightly
            window.speechSynthesis.speak(utterance);
        }
    }

    function renderCharList() {
        charList.innerHTML = '';
        characters.forEach((char, index) => {
            const listItem = document.createElement('li');
            listItem.textContent = char;
            listItem.dataset.index = index;
            if (index === currentCharacterIndex) {
                listItem.classList.add('active');
            }
            listItem.addEventListener('click', () => {
                speakCharacter(char);
                selectCharacter(index);
            });
            charList.appendChild(listItem);
        });
    }

    function loadCharacter(char) {
        writerTarget.innerHTML = '';
        hasUsedHint = false; // Reset hint status for the new character
        
        const size = Math.min(writerTarget.clientWidth, writerTarget.clientHeight);
        const strokeWidth = strokeWidthSlider.value / 10;

        writer = HanziWriter.create(writerTarget, char, {
            width: size,
            height: size,
            padding: 5,
            showCharacter: false,
            showOutline: true,
            strokeAnimationSpeed: 1,
            delayBetweenStrokes: 100,
            strokeWidth: strokeWidth,
            
            strokeColor: getComputedStyle(document.documentElement).getPropertyValue('--highlight-color').trim(),
            highlightColor: getComputedStyle(document.documentElement).getPropertyValue('--highlight-color').trim(),
            outlineColor: '#f0f0f0',
        });
        
        // Speak the character *after* the writer is created to avoid race conditions
        speakCharacter(char); 
        
        setStage(1); // Always start a new character on stage 1
    }
    
    function selectCharacter(index) {
        if (index < 0 || index >= characters.length) {
            writer = null;
            writerTarget.innerHTML = '<h3>🎉 恭喜，全部練習完成！ 🎉</h3>';
            characters = [];
            currentCharacterIndex = -1;
            renderCharList();
            return;
        };
        currentCharacterIndex = index;
        renderCharList();
        loadCharacter(characters[currentCharacterIndex]);
    }

    function startPractice() {
        const inputText = charInput.value.trim();
        if (!inputText) return;
        characters = [...new Set(inputText.split(''))];
        if (characters.length > 0) {
            selectCharacter(0);
        } else {
            writer = null;
            writerTarget.innerHTML = '';
            characters = [];
            currentCharacterIndex = -1;
            renderCharList();
        }
    }

    function startQuiz() {
        if (!writer) return;
        writer.quiz({
            onMistake: () => {
                if (navigator.vibrate) navigator.vibrate(200);
                writerTarget.classList.add('error-flash');
                setTimeout(() => writerTarget.classList.remove('error-flash'), 400);
            },
            onComplete: handleCharCompletion
        });
    }

    function setStage(stage) {
        if (!writer) return;

        if (currentStage === 3 && stage === 1) {
            hasUsedHint = true;
        }

        currentStage = stage;
        
        // Update button active states
        stage1Btn.classList.toggle('active', currentStage === 1);
        stage3Btn.classList.toggle('active', currentStage === 3);

        const highlightColor = getComputedStyle(document.documentElement).getPropertyValue('--highlight-color').trim();
        switch (stage) {
            case 1:
                writer.updateColor('strokeColor', highlightColor);
                writer.updateColor('outlineColor', '#f0f0f0');
                writer.showOutline();
                break;
            case 3:
                writer.hideOutline();
                break;
        }
        startQuiz();
    }

    function handleCharCompletion() {
        // --- Play sound and show visual feedback ---
        if (completionSound) {
            completionSound.load();
            completionSound.play().catch(e => console.error("Audio playback failed.", e));
        }
        completionFeedback.classList.add('show');
        
        const feedbackDuration = 1500;
        setTimeout(() => {
            completionFeedback.classList.remove('show');
        }, feedbackDuration);

        // --- New Automatic Progression Logic ---
        setTimeout(() => {
            if (currentStage === 1) {
                // If hint stage is complete, automatically move to challenge stage
                setStage(3);
            } else if (currentStage === 3) {
                if (hasUsedHint) {
                    // If challenge is complete but hint was used, show dialog to try again
                    completionDialog.style.display = 'flex';
                } else {
                    // If challenge is complete without hint, automatically move to the next character
                    removeCurrentCharAndSelectNext();
                }
            }
        }, 500); // Small delay after feedback to feel natural
    }

    function removeCurrentCharAndSelectNext() {
        if (currentCharacterIndex < 0) return;

        characters.splice(currentCharacterIndex, 1);
        
        if (currentCharacterIndex >= characters.length) {
            currentCharacterIndex = 0;
        }
        
        selectCharacter(currentCharacterIndex);
    }

    // --- Event Listeners & Initialization ---
    function main() {
        // Priority 1: Check for preloaded characters (for packaged version)
        if (window.preloadedCharacters && typeof window.preloadedCharacters === 'string' && window.preloadedCharacters.length > 0) {
            characters = [...new Set(window.preloadedCharacters.split(''))];
            
            // Use a timeout to ensure the writer container's dimensions are calculated correctly.
            setTimeout(() => {
                if (writerTarget.clientWidth > 0) {
                    selectCharacter(0);
                } else {
                    console.warn("Writer target not ready, trying again in 300ms.");
                    setTimeout(() => selectCharacter(0), 300);
                }
            }, 100);
            return; // End here for packaged mode.
        }

        // Priority 2: Fallback to interactive mode for local development.
        // Defensively check if the elements exist before adding listeners.
        if (startBtn && charInput) {
            startBtn.addEventListener('click', startPractice);
            charInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') startPractice();
            });
        }
    }

    main(); // Run the main initialization logic

    stage1Btn.addEventListener('click', () => setStage(1));
    stage3Btn.addEventListener('click', () => setStage(3));

    eraseBtn.addEventListener('click', () => {
        if (writer) {
            startQuiz();
        }
    });

    playSoundBtn.addEventListener('click', () => {
        if (currentCharacterIndex > -1) {
            speakCharacter(characters[currentCharacterIndex]);
        }
    });

    strokeWidthSlider.addEventListener('input', (e) => {
        if (writer) {
            const newWidth = e.target.value / 10;
            writer.updateOptions({ strokeWidth: newWidth });
        }
    });

    practiceAgainBtn.addEventListener('click', () => {
        completionDialog.style.display = 'none';
        loadCharacter(characters[currentCharacterIndex]);
    });

    window.addEventListener('resize', () => {
        if (writer) {
            const size = Math.min(writerTarget.clientWidth, writerTarget.clientHeight);
            writer.updateDimensions({ width: size, height: size });
        }
    });
});
