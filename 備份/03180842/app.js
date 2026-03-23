document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const charInput = document.getElementById('char-input');
    const startBtn = document.getElementById('start-btn');
    const charList = document.getElementById('char-list');
    const writerTarget = document.getElementById('writer-target');
    const stage1Btn = document.getElementById('stage-1-btn');
    const stage3Btn = document.getElementById('stage-3-btn');
    const eraseBtn = document.getElementById('erase-btn');
    const strokeWidthSlider = document.getElementById('stroke-width-slider');
    const completionDialog = document.getElementById('completion-dialog');
    const confirmCompletionBtn = document.getElementById('confirm-completion-btn');
    const practiceAgainBtn = document.getElementById('practice-again-btn');

    // --- App State ---
    let writer = null;
    let characters = [];
    let currentCharacterIndex = -1;
    let currentStage = 1;
    let hasUsedHint = false;

    // --- Core Functions ---

    function renderCharList() {
        charList.innerHTML = '';
        characters.forEach((char, index) => {
            const listItem = document.createElement('li');
            listItem.textContent = char;
            listItem.dataset.index = index;
            if (index === currentCharacterIndex) {
                listItem.classList.add('active');
            }
            listItem.addEventListener('click', () => selectCharacter(index));
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

            onMistake: () => {
                if (navigator.vibrate) navigator.vibrate(200);
                writerTarget.classList.add('error-flash');
                setTimeout(() => writerTarget.classList.remove('error-flash'), 400);
            },
            onCompleteChar: () => {
                handleCharCompletion();
            }
        });
        
        setStage(1); // Always start a new character on stage 1
        writer.quiz();
    }
    
    function selectCharacter(index) {
        if (index < 0 || index >= characters.length) {
            writer = null;
            writerTarget.innerHTML = '<h3 style="color: #333;">🎉 恭喜，全部練習完成！ 🎉</h3>';
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
        writer.quiz();
    }

    function handleCharCompletion() {
        if (currentStage === 3 && !hasUsedHint) {
            writer.showCharacter({ opacity: 0.5, color: '#000' });
            completionDialog.style.display = 'flex';
        } else if (hasUsedHint) {
            alert('使用了求助，請再挑戰一次不看提示書寫！');
            loadCharacter(characters[currentCharacterIndex]);
        } else {
            // Give feedback for stage 1 completion
            writer.showCharacter({
                duration: 300,
                onComplete: () => {
                    setTimeout(() => {
                        if (writer) writer.hideCharacter({ duration: 300 });
                    }, 1000);
                }
            });
        }
    }

    function removeCurrentCharAndSelectNext() {
        if (currentCharacterIndex < 0) return;

        characters.splice(currentCharacterIndex, 1);
        
        if (currentCharacterIndex >= characters.length) {
            currentCharacterIndex = 0;
        }
        
        selectCharacter(currentCharacterIndex);
    }

    // --- Event Listeners ---

    startBtn.addEventListener('click', startPractice);
    charInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') startPractice(); });

    stage1Btn.addEventListener('click', () => setStage(1));
    stage3Btn.addEventListener('click', () => setStage(3));

    eraseBtn.addEventListener('click', () => {
        if (writer) {
            writer.quiz();
        }
    });

    strokeWidthSlider.addEventListener('input', (e) => {
        if (writer) {
            const newWidth = e.target.value / 10;
            writer.updateOptions({ strokeWidth: newWidth });
        }
    });

    confirmCompletionBtn.addEventListener('click', () => {
        completionDialog.style.display = 'none';
        removeCurrentCharAndSelectNext();
    });

    practiceAgainBtn.addEventListener('click', () => {
        completionDialog.style.display = 'none';
        writer.quiz();
    });

    window.addEventListener('resize', () => {
        if (writer) {
            const size = Math.min(writerTarget.clientWidth, writerTarget.clientHeight);
            writer.updateDimensions({ width: size, height: size });
        }
    });
});
