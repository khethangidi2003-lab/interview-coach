// ============================================
// STATE MANAGEMENT
// ============================================

let interviewState = {
    questions: [],
    currentIndex: 0,
    isInterviewActive: false,
    isSpeaking: false,
    isListening: false,
    answers: [],
    focusData: [],
    apiKey: '',
    jobDescription: ''
};

// ============================================
// SPEECH SYNTHESIS VOICE PRELOAD
// ============================================

let availableVoices = [];

// Preload voices as soon as the page loads
function loadVoices() {
    availableVoices = window.speechSynthesis.getVoices();
    console.log(`Loaded ${availableVoices.length} voices`);
}

if ('speechSynthesis' in window) {
    // Try immediately
    loadVoices();
    
    // Also listen for when voices finish loading
    window.speechSynthesis.onvoiceschanged = loadVoices;
}

// ============================================
// SPEECH-TO-TEXT — UNIVERSAL CROSS-BROWSER VERSION
// ============================================

let recognition = null;

// Detect browser/device for adaptive behavior
const BROWSER_INFO = (function() {
    const ua = navigator.userAgent;
    return {
        isMobile: /iPhone|iPad|iPod|Android/i.test(ua),
        isIOS: /iPhone|iPad|iPod/i.test(ua),
        isAndroid: /Android/i.test(ua),
        isSafari: /^((?!chrome|android).)*safari/i.test(ua),
        isChrome: /chrome/i.test(ua) && !/edge/i.test(ua),
        isEdge: /edge/i.test(ua),
        isFirefox: /firefox/i.test(ua),
        supportsSpeech: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
    };
})();

console.log('🌐 Browser detected:', BROWSER_INFO);

// ============================================
// DOM REFERENCES (Shared across pages)
// ============================================

const jobDescriptionInput = document.getElementById('jobDescription');
const generateBtn = document.getElementById('generateBtn');
const resultsSection = document.getElementById('resultsSection');
const completionSection = document.getElementById('completionSection');
const questionsContainer = document.getElementById('questionsContainer');
const interviewSection = document.getElementById('interviewSection');
const currentQuestion = document.getElementById('currentQuestion');
const answerDisplay = document.getElementById('answerDisplay');
const answerText = document.getElementById('answerText');
const questionCounter = document.getElementById('questionCounter');
const startInterviewBtn = document.getElementById('startInterviewBtn');
const startListeningBtn = document.getElementById('startListeningBtn');
const stopListeningBtn = document.getElementById('stopListeningBtn');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');
const endInterviewBtn = document.getElementById('endInterviewBtn');
const statusMessage = document.getElementById('statusMessage');
const apiSection = document.getElementById('apiSection');
const jdSection = document.getElementById('jdSection');
const feedbackSection = document.getElementById('feedbackSection');
const feedbackContent = document.getElementById('feedbackContent');
const getFeedbackBtn = document.getElementById('getFeedbackBtn');
const viewResultsBtn = document.getElementById('viewResultsBtn');
const homeBtn = document.getElementById('homeBtn');
const backFromResultsBtn = document.getElementById('backFromResultsBtn');
const homeFromResultsBtn = document.getElementById('homeFromResultsBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const goToInterview = document.getElementById('goToInterview');
const goToInterviewBtn = document.getElementById('goToInterviewBtn');

// ============================================
// LOADING CONTROLS
// ============================================
function showLoading(message, subMessage) {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    const sub = document.getElementById('loadingSub');
    
    if (overlay) {
        overlay.style.display = 'flex';
        if (text) text.textContent = message || 'Loading...';
        if (sub) sub.textContent = subMessage || 'Please wait';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function setButtonLoading(button, isLoading, loadingText) {
    const originalText = button.textContent;
    
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = originalText;
        button.innerHTML = `<span class="spinner-inline"></span> ${loadingText || 'Loading...'}`;
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || originalText;
    }
}

// ============================================
// PAGE DETECTION
// ============================================
function getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('index.html')) return 'index';
    if (path.includes('home.html')) return 'home';
    if (path.includes('interview.html')) return 'interview';
    if (path.includes('results.html')) return 'results';
    if (path.includes('faq.html')) return 'faq';
    if (path === '/' || path === '') return 'index';
    return 'index';
}

// ============================================
// FACE DETECTION
// ============================================

let faceDetector = null;
let focusScoreElement = document.getElementById('focusScore');
let gazeDirectionElement = document.getElementById('gazeDirection');
let focusNudgeElement = document.getElementById('focusNudge');

async function initFaceDetector() {
    try {
        const videoElement = document.getElementById('videoElement');
        const canvasElement = document.getElementById('canvasElement');
        
        if (!videoElement || !canvasElement) {
            console.log('Camera elements not found, skipping face detection');
            return false;
        }
        
        faceDetector = new FaceDetector();
        
        faceDetector.onFocusUpdate = function(score, gaze) {
            updateFocusDisplay(score, gaze);
        };
        
        faceDetector.onNudge = function(message) {
            console.log('Nudge suppressed:', message);
        };
        
        const success = await faceDetector.initialize(videoElement, canvasElement);
        if (!success) {
            console.warn('Face detection not available - continuing without camera');
        }
        return success;
    } catch (e) {
        console.log('Face detection skipped:', e.message);
        return false;
    }
}

function updateFocusDisplay(score, gaze) {
    if (focusScoreElement) {
        focusScoreElement.textContent = score + '%';
        focusScoreElement.className = 'stat-value';
        if (score >= 80) focusScoreElement.classList.add('high');
        else if (score >= 50) focusScoreElement.classList.add('medium');
        else focusScoreElement.classList.add('low');
    }
    
    if (gazeDirectionElement) {
        const gazeMap = {
            'center': 'Looking at camera',
            'left': 'Looking left',
            'right': 'Looking right',
            'up': 'Looking up',
            'down': 'Looking down',
            'unknown': 'Face not detected'
        };
        gazeDirectionElement.textContent = gazeMap[gaze] || gaze;
    }
    
    if (interviewState.isInterviewActive && 
        interviewState.focusData && 
        interviewState.focusData[interviewState.currentIndex]) {
        
        interviewState.focusData[interviewState.currentIndex].focusScores.push(score);
        
        if (gaze !== 'center' && gaze !== 'unknown') {
            interviewState.focusData[interviewState.currentIndex].gazeEvents.push(gaze);
        }
    }
}

function showNudge(message) {
    if (focusNudgeElement) {
        focusNudgeElement.textContent = message;
        focusNudgeElement.style.display = 'block';
        clearTimeout(focusNudgeElement._hideTimer);
        focusNudgeElement._hideTimer = setTimeout(() => {
            focusNudgeElement.style.display = 'none';
        }, 4000);
    }
}

// ============================================
// SPEECH RECOGNITION — INITIALIZATION
// ============================================

function initSpeechRecognition() {
    if (!BROWSER_INFO.supportsSpeech) {
        setStatus(
            'Speech recognition is not supported in this browser. ' +
            'Please use Chrome, Edge, or Safari.',
            'error'
        );
        return false;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    if (BROWSER_INFO.isIOS || BROWSER_INFO.isAndroid) {
        recognition.continuous = false;
        recognition.interimResults = true;
    } else if (BROWSER_INFO.isSafari) {
        recognition.continuous = false;
        recognition.interimResults = false;
    } else {
        recognition.continuous = true;
        recognition.interimResults = true;
    }
    
    console.log('🎤 Recognition config:', {
        continuous: recognition.continuous,
        interimResults: recognition.interimResults,
        lang: recognition.lang
    });
    
    // ============================================
    // SESSION STATE (lives inside this function)
    // ============================================
    
    let saveTimer = null;
    let isSaving = false;
    let committedAtStart = '';
    let lockedIndex = -1;
    
    // ============================================
    // ON START — Lock index and snapshot the answer
    // ============================================
    
    recognition.onstart = function() {
        console.log('🎤 Recognition started');
        lockedIndex = interviewState.currentIndex;
        committedAtStart = interviewState.answers[lockedIndex] || '';
        clearTimeout(saveTimer);
        isSaving = false;
        console.log(`🔒 Locked to Q${lockedIndex + 1}, committed: "${committedAtStart}"`);
    };
    
    // ============================================
    // ON RESULT — Use lockedIndex everywhere
    // ============================================
    
    recognition.onresult = function(event) {
        clearTimeout(saveTimer);
        
        if (lockedIndex < 0 || lockedIndex >= interviewState.answers.length) {
            console.warn('⚠️ Invalid lockedIndex, ignoring result');
            return;
        }
        
        let interimText = '';
        let finalText = '';
        
        for (let i = 0; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalText += transcript + ' ';
            } else {
                interimText += transcript;
            }
        }
        
        finalText = finalText.replace(/\s+/g, ' ').trim();
        interimText = interimText.replace(/\s+/g, ' ').trim();
        
        const sessionText = finalText || interimText;
        
        const displayText = sessionText
            ? (committedAtStart ? committedAtStart + ' ' + sessionText : sessionText)
            : committedAtStart;
        
        if (answerText) {
            if (interimText && !finalText) {
                answerText.textContent = displayText + ' (listening...)';
            } else {
                answerText.textContent = displayText;
            }
        }
        
        saveTimer = setTimeout(function() {
            if (isSaving) return;
            isSaving = true;
            
            if (interviewState.currentIndex !== lockedIndex) {
                console.log(`⏭️ Skipping stale save (locked=${lockedIndex}, current=${interviewState.currentIndex})`);
                isSaving = false;
                return;
            }
            
            if (sessionText) {
                const finalAnswer = committedAtStart
                    ? (committedAtStart + ' ' + sessionText).replace(/\s+/g, ' ').trim()
                    : sessionText;
                
                interviewState.answers[lockedIndex] = finalAnswer;
                
                if (answerText) {
                    answerText.textContent = finalAnswer;
                }
                
                console.log(`✅ Saved to Q${lockedIndex + 1}:`, finalAnswer);
                
                if (interviewState.isInterviewActive) {
                    setStatus('Answer recorded. Click "Next Question" to continue.', 'success');
                    if (nextQuestionBtn) nextQuestionBtn.disabled = false;
                }
            }
            
            if (interviewState.isListening) {
                setTimeout(function() {
                    if (interviewState.isListening) {
                        try { recognition.stop(); } catch (e) {}
                    }
                }, 500);
            }
            
            isSaving = false;
        }, BROWSER_INFO.isMobile ? 2500 : 1800);
    };
    
    // ============================================
    // ON ERROR
    // ============================================
    
    recognition.onerror = function(event) {
        console.error('❌ Speech error:', event.error);
        
        const errorMessages = {
            'not-allowed': 'Microphone access denied. Please allow microphone permission.',
            'no-speech': 'No speech detected. Please speak clearly.',
            'audio-capture': 'No microphone found. Please check your device.',
            'network': 'Network error. Please check your connection.',
            'aborted': '',
            'service-not-allowed': 'Speech service not available in this browser.'
        };
        
        const message = errorMessages[event.error] || ('Speech error: ' + event.error);
        if (message) setStatus(message, 'error');
        
        interviewState.isListening = false;
        if (startListeningBtn) startListeningBtn.style.display = 'inline-block';
        if (stopListeningBtn) stopListeningBtn.style.display = 'none';
        clearTimeout(saveTimer);
        isSaving = false;
    };
    
    // ============================================
    // ON END
    // ============================================
    
    recognition.onend = function() {
        console.log('🎤 Recognition ended');
        interviewState.isListening = false;
        if (startListeningBtn) startListeningBtn.style.display = 'inline-block';
        if (stopListeningBtn) stopListeningBtn.style.display = 'none';
        clearTimeout(saveTimer);
        isSaving = false;
    };
    
    return true;
}

// ============================================
// START LISTENING
// ============================================

function startListening() {
    if (!BROWSER_INFO.supportsSpeech) {
        setStatus(
            'Speech recognition is not supported in this browser. ' +
            'Please use Chrome, Edge, or Safari.',
            'error'
        );
        return;
    }
    
    if (!recognition) {
        if (!initSpeechRecognition()) {
            return;
        }
    }
    
    if (interviewState.isListening) {
        console.log('Already listening');
        return;
    }
    
    try {
        try {
            recognition.stop();
        } catch (e) {}
        
        setTimeout(function() {
            try {
                recognition.start();
                
                interviewState.isListening = true;
                if (startListeningBtn) startListeningBtn.style.display = 'none';
                if (stopListeningBtn) stopListeningBtn.style.display = 'inline-block';
                if (answerDisplay) answerDisplay.style.display = 'block';
                
                const currentAnswer = interviewState.answers[interviewState.currentIndex] || '';
                if (answerText) {
                    answerText.textContent = currentAnswer 
                        ? currentAnswer + ' (listening for more...)' 
                        : 'Listening... speak your answer clearly.';
                }
                
                setStatus('Listening... speak now', 'listening');
                
            } catch (error) {
                console.error('Failed to start:', error);
                
                if (error.message.includes('already started')) {
                    interviewState.isListening = true;
                    if (startListeningBtn) startListeningBtn.style.display = 'none';
                    if (stopListeningBtn) stopListeningBtn.style.display = 'inline-block';
                } else {
                    setStatus('Could not start listening: ' + error.message, 'error');
                }
            }
        }, BROWSER_INFO.isIOS ? 300 : 50);
        
    } catch (error) {
        console.error('Start listening error:', error);
        setStatus('Could not start listening. Please try again.', 'error');
    }
}

// ============================================
// STOP LISTENING
// ============================================

function stopListening() {
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {}
    }
    
    interviewState.isListening = false;
    if (startListeningBtn) startListeningBtn.style.display = 'inline-block';
    if (stopListeningBtn) stopListeningBtn.style.display = 'none';
    
    setStatus('Stopped listening. Click "Start Listening" to try again.', '');
}

// ============================================
// TEXT-TO-SPEECH
// ============================================

function speakText(text, callback) {
    if (!('speechSynthesis' in window)) {
        setStatus('Your browser doesn\'t support text-to-speech.', 'error');
        if (callback) callback();
        return;
    }
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    if (availableVoices.length === 0) {
        availableVoices = window.speechSynthesis.getVoices();
    }
    
    const femaleVoice = availableVoices.find(voice => 
        voice.name.includes('Female') || 
        voice.name.includes('Samantha') ||
        voice.name.includes('Google US English')
    );
    
    if (femaleVoice) {
        utterance.voice = femaleVoice;
    }
    
    interviewState.isSpeaking = true;
    setStatus('Speaking question...', 'speaking');
    
    utterance.onend = function() {
        interviewState.isSpeaking = false;
        setStatus('Click "Start Listening" to speak your answer.', '');
        if (callback) callback();
    };
    
    utterance.onerror = function(event) {
        console.error('Speech error:', event);
        interviewState.isSpeaking = false;
        setStatus('Could not speak the question. Please read it yourself.', 'error');
        if (callback) callback();
    };
    
    window.speechSynthesis.speak(utterance);
}

// ============================================
// GENERAL QUESTIONS
// ============================================

function addGeneralQuestions(aiQuestions) {
    const generalQuestions = [
        "Tell me about yourself and your background.",
        "Why do you think you are the best fit for this role?",
        "What are your greatest professional strengths?"
    ];
    
    return [...generalQuestions, ...aiQuestions];
}

// ============================================
// GENERATE QUESTIONS
// ============================================

async function generateQuestions() {
    const jobDescription = jobDescriptionInput ? jobDescriptionInput.value.trim() : '';
    
    if (!jobDescription) {
        alert('Please paste a job description.');
        return;
    }
    
    interviewState.jobDescription = jobDescription;
    showLoading('Generating Questions...', 'This takes about 5-10 seconds');

    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
    }
    
    try {
        const prompt = `
You are a supportive interview coach helping a candidate prepare for their interview. Based on this job description, generate 7 thoughtful questions that will help the candidate practice and build confidence.

Instructions:
- 3 behavioral questions (asking about past experiences)
- 2 technical questions (specific skills for the job)
- 2 questions about company culture and values

Make the questions clear and encouraging. Avoid overly aggressive or trick questions.

Return ONLY a JSON array of strings. No extra text, no numbering, no bullet points.

Example format: ["Question 1", "Question 2", "Question 3"]

Job Description:
${jobDescription}
        `.trim();
        
        const response = await fetch('/api/groq', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a supportive interview coach. You always respond with valid JSON arrays.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to generate questions');
        }
        
        const data = await response.json();
        const aiMessage = data.choices[0].message.content;
        
        let cleanedMessage = aiMessage;
        cleanedMessage = cleanedMessage.replace(/```json\s*/g, '');
        cleanedMessage = cleanedMessage.replace(/```\s*/g, '');
        cleanedMessage = cleanedMessage.trim();
        
        let questions;
        try {
            questions = JSON.parse(cleanedMessage);
        } catch (parseError) {
            const arrayMatch = cleanedMessage.match(/\[(.*)\]/s);
            if (arrayMatch) {
                try {
                    questions = JSON.parse(arrayMatch[0]);
                } catch {
                    throw new Error('The AI returned an unexpected format. Please try again.');
                }
            } else {
                throw new Error('The AI returned an unexpected format. Please try again.');
            }
        }
        
        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error('The AI did not return a valid list of questions.');
        }
        
        interviewState.questions = addGeneralQuestions(questions);
        
        sessionStorage.setItem('interviewQuestions', JSON.stringify(interviewState.questions));
        sessionStorage.setItem('jobDescription', jobDescription);
        
        console.log(`✅ ${interviewState.questions.length} questions generated (3 general + 7 AI)`);
        console.log('🔄 Auto-redirecting to interview...');
        hideLoading();
        window.location.href = 'interview.html';
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
        hideLoading();
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Questions';
        }
    }
}

// ============================================
// INTERVIEW FLOW
// ============================================

function loadInterviewData() {
    const savedQuestions = sessionStorage.getItem('interviewQuestions');
    const savedJobDescription = sessionStorage.getItem('jobDescription');
    
    if (savedQuestions) {
        try {
            interviewState.questions = JSON.parse(savedQuestions);
            interviewState.jobDescription = savedJobDescription || '';
            console.log(`Loaded ${interviewState.questions.length} questions from session storage`);
            return true;
        } catch (e) {
            console.error('Failed to load questions:', e);
            return false;
        }
    }
    return false;
}

async function startInterview() {
    console.log('START INTERVIEW TRIGGERED');
    
    if (interviewState.questions.length === 0) {
        if (!loadInterviewData()) {
            alert('No questions found. Please generate questions first.');
            window.location.href = 'home.html';
            return;
        }
    }
    
    console.log(`${interviewState.questions.length} questions found`);
    
    const prepMessage = document.getElementById('preparationMessage');
    if (prepMessage) prepMessage.style.display = 'none';
    
    const currentQuestionEl = document.getElementById('currentQuestion');
    if (currentQuestionEl) currentQuestionEl.style.display = 'block';
    
    const controlsGroup = document.getElementById('controlsGroup');
    if (controlsGroup) controlsGroup.style.display = 'flex';
    
    try {
        console.log('Starting camera...');
        const cameraContainer = document.getElementById('cameraContainer');
        if (cameraContainer) {
            cameraContainer.style.display = 'grid';
            console.log('Camera container visible');
        }
        await initFaceDetector();
        console.log('Face detector initialized');
    } catch (e) {
        console.log('Face detection skipped:', e.message);
    }
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Your browser doesn\'t support speech recognition. Please use Chrome or Edge for voice features.');
    }
    
    interviewState.currentIndex = 0;
    interviewState.answers = new Array(interviewState.questions.length).fill('');
    interviewState.focusData = new Array(interviewState.questions.length).fill(null).map(() => ({
        focusScores: [],
        gazeEvents: []
    }));
    interviewState.isInterviewActive = true;
    console.log('Interview state reset with focusData initialized');
    
    if (startInterviewBtn) startInterviewBtn.style.display = 'none';
    if (startListeningBtn) startListeningBtn.style.display = 'inline-block';
    if (stopListeningBtn) stopListeningBtn.style.display = 'none';
    if (nextQuestionBtn) {
        nextQuestionBtn.style.display = 'inline-block';
        nextQuestionBtn.disabled = true;
    }
    if (endInterviewBtn) endInterviewBtn.style.display = 'inline-block';
    console.log('Buttons updated');
    
    console.log('Showing first question...');
    showQuestion(0);
}

function showQuestion(index) {
    console.log(`showQuestion called with index: ${index}`);
    console.log(`Total questions: ${interviewState.questions.length}`);
    
    if (index >= interviewState.questions.length) {
        console.log('🏁 All questions completed!');
        showCompletionScreen();
        return;
    }
    
    const question = interviewState.questions[index];
    console.log(`Question ${index + 1}: ${question.substring(0, 50)}...`);
    
    if (interviewState.focusData && interviewState.focusData[index]) {
        interviewState.focusData[index] = {
            focusScores: [],
            gazeEvents: []
        };
        console.log(`Focus data reset for question ${index + 1}`);
    }
    
    if (currentQuestion) currentQuestion.textContent = question;
    if (questionCounter) questionCounter.textContent = `Question ${index + 1} of ${interviewState.questions.length}`;
    
    if (answerDisplay) answerDisplay.style.display = 'none';
    if (answerText) answerText.textContent = 'Waiting for you to speak...';
    
    if (startListeningBtn) startListeningBtn.style.display = 'inline-block';
    if (stopListeningBtn) stopListeningBtn.style.display = 'none';
    if (nextQuestionBtn) nextQuestionBtn.disabled = true;
    if (startInterviewBtn) startInterviewBtn.style.display = 'none';
    
    console.log('UI updated, now speaking question...');
    
    speakText(question, function() {
        console.log('Question spoken!');
        setStatus('Click "Start Listening" to speak your answer.', '');
        if (answerDisplay) answerDisplay.style.display = 'block';
        if (answerText) answerText.textContent = 'Press "Start Listening" and speak your answer clearly.';
        console.log('Answer display shown');
    });
}

function showNextQuestion() {
    console.log('Moving to next question...');
    
    // Flush current answer before switching index
    const currentAnswer = interviewState.answers[interviewState.currentIndex];
    if (answerText && currentAnswer) {
        interviewState.answers[interviewState.currentIndex] = currentAnswer;
    }
    
    stopListening();
    
    if (startListeningBtn) startListeningBtn.style.display = 'none';
    if (stopListeningBtn) stopListeningBtn.style.display = 'none';
    
    interviewState.currentIndex++;
    console.log(`Current index: ${interviewState.currentIndex}`);
    
    if (interviewState.currentIndex < interviewState.questions.length) {
        showQuestion(interviewState.currentIndex);
    } else {
        showCompletionScreen();
    }
}

function showCompletionScreen() {
    console.log('Showing completion screen...');
    
    stopListening();
    interviewState.isInterviewActive = false;
    window.speechSynthesis.cancel();
    
    const cameraContainer = document.getElementById('cameraContainer');
    if (cameraContainer) {
        cameraContainer.style.display = 'none';
    }
    if (faceDetector) {
        try {
            faceDetector.stop();
        } catch (e) {}
    }
    
    sessionStorage.setItem('interviewAnswers', JSON.stringify(interviewState.answers));
    sessionStorage.setItem('interviewFocusData', JSON.stringify(interviewState.focusData));
    
    window.location.href = 'results.html';
}

function endInterviewEarly() {
    if (confirm('Are you sure you want to end the interview early?')) {
        stopListening();
        interviewState.isInterviewActive = false;
        window.speechSynthesis.cancel();
        
        const cameraContainer = document.getElementById('cameraContainer');
        if (cameraContainer) {
            cameraContainer.style.display = 'none';
        }
        if (faceDetector) {
            try {
                faceDetector.stop();
            } catch (e) {}
        }
        
        sessionStorage.setItem('interviewAnswers', JSON.stringify(interviewState.answers));
        sessionStorage.setItem('interviewFocusData', JSON.stringify(interviewState.focusData));
        
        window.location.href = 'results.html';
    }
}

// ============================================
// RESULTS PAGE
// ============================================
function loadResultsData() {
    const savedQuestions = sessionStorage.getItem('interviewQuestions');
    const savedAnswers = sessionStorage.getItem('interviewAnswers');
    const savedFocusData = sessionStorage.getItem('interviewFocusData');
    
    if (savedQuestions) {
        try {
            interviewState.questions = JSON.parse(savedQuestions);
        } catch (e) {
            console.error('Failed to load questions:', e);
        }
    }
    
    if (savedAnswers) {
        try {
            interviewState.answers = JSON.parse(savedAnswers);
        } catch (e) {
            console.error('Failed to load answers:', e);
        }
    }
    
    if (savedFocusData) {
        try {
            interviewState.focusData = JSON.parse(savedFocusData);
        } catch (e) {
            console.error('Failed to load focus data:', e);
        }
    }
    
    return interviewState.questions.length > 0;
}

function displayFullResults() {
    if (!questionsContainer) return;
    questionsContainer.innerHTML = '';
    
    if (!interviewState.questions || interviewState.questions.length === 0) {
        questionsContainer.innerHTML = '<p class="no-answer" style="text-align:center;padding:40px 0;">No questions available.</p>';
        return;
    }
    
    const dateEl = document.getElementById('resultsDate');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    interviewState.questions.forEach((question, index) => {
        const div = document.createElement('div');
        div.className = 'question-item';
        
        const answer = interviewState.answers[index] || '';
        const hasAnswer = answer && answer.trim() !== '';
        
        div.innerHTML = `
            <div class="question-text">
                <span class="question-number">${index + 1}.</span> ${question}
            </div>
            <div class="question-answer">
                <span class="answer-label">Answer:</span>
                ${hasAnswer ? answer : '<span class="no-answer">No answer provided</span>'}
            </div>
        `;
        questionsContainer.appendChild(div);
    });
}

function getCameraSummary() {
    const summary = {
        averageFocus: 0,
        totalFrames: 0,
        lookingAwayCount: 0,
        gazeDistribution: { center: 0, left: 0, right: 0, up: 0, down: 0, unknown: 0 },
        questionsWithLowFocus: [],
        overallPresenceScore: 0
    };
    
    if (!interviewState.focusData || interviewState.focusData.length === 0) {
        return summary;
    }
    
    let allScores = [];
    let totalGazeEvents = 0;
    
    interviewState.focusData.forEach((data, index) => {
        if (data && data.focusScores && data.focusScores.length > 0) {
            const avg = data.focusScores.reduce((a, b) => a + b, 0) / data.focusScores.length;
            allScores.push(avg);
            
            if (avg < 60) {
                summary.questionsWithLowFocus.push({
                    questionIndex: index,
                    question: interviewState.questions[index] || `Question ${index + 1}`,
                    avgFocus: Math.round(avg)
                });
            }
        }
        
        if (data && data.gazeEvents) {
            totalGazeEvents += data.gazeEvents.length;
            data.gazeEvents.forEach(event => {
                if (summary.gazeDistribution[event] !== undefined) {
                    summary.gazeDistribution[event]++;
                }
            });
        }
    });
    
    summary.totalFrames = allScores.length;
    summary.averageFocus = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
    summary.lookingAwayCount = totalGazeEvents;
    
    let presenceScore = summary.averageFocus;
    if (summary.lookingAwayCount > 0) {
        presenceScore = Math.max(0, presenceScore - (summary.lookingAwayCount * 2));
    }
    if (summary.lookingAwayCount === 0 && presenceScore > 80) {
        presenceScore = Math.min(100, presenceScore + 5);
    }
    summary.overallPresenceScore = Math.round(Math.min(100, presenceScore));
    
    return summary;
}

async function getFeedback() {
    showLoading('Analyzing Your Interview...', 'This takes about 5-10 seconds');

    if (getFeedbackBtn) {
        getFeedbackBtn.disabled = true;
        getFeedbackBtn.textContent = 'Analyzing...';
    }

    if (feedbackContent) {
        feedbackContent.innerHTML = `
            <div class="feedback-loading">
                <div class="spinner"></div>
                <p>AI is analyzing your interview answers...</p>
                <p style="font-size: 14px; color: var(--text-muted); margin-top: 8px;">This takes about 5-10 seconds</p>
            </div>
        `;
    }
    if (feedbackSection) feedbackSection.style.display = 'block';

    try {
        let transcript = '';
        interviewState.questions.forEach((question, index) => {
            const answer = interviewState.answers[index] || '(No answer provided)';
            transcript += `Q${index + 1}: ${question}\n`;
            transcript += `A${index + 1}: ${answer}\n\n`;
        });

        const cameraSummary = getCameraSummary();

        let cameraInsights = '';
        if (cameraSummary.totalFrames > 0) {
            cameraInsights = `
Camera/Body Language Data:
- Average Focus Score: ${cameraSummary.averageFocus}%
- Presence Score: ${cameraSummary.overallPresenceScore}%
- Questions that caused focus drops: ${cameraSummary.questionsWithLowFocus.length > 0 
    ? cameraSummary.questionsWithLowFocus.map(q => `Q${q.questionIndex + 1} (${q.avgFocus}%)`).join(', ') 
    : 'None'}
- ${cameraSummary.averageFocus >= 80 ? 'Maintained strong presence throughout the interview' : 'Some presence issues detected'}
`;
        } else {
            cameraInsights = 'No camera data available. Camera may not have been active during the interview.';
        }

        const prompt = `
You are an expert interview coach. Analyze this interview transcript AND camera/body language data to provide comprehensive feedback.

${cameraInsights}

Interview Transcript:
${transcript}

Provide feedback including the following sections. Format as JSON:
{
    "score": 8,
    "scoreLabel": "Good",
    "strengths": ["Strength 1", "Strength 2", "Strength 3"],
    "improvements": ["Improvement 1", "Improvement 2", "Improvement 3"],
    "communication": "Assessment of communication skills (clarity, confidence, conciseness)",
    "answeredQuestions": true/false,
    "answerExplanation": "Brief explanation of how well they answered",
    "fillerAnalysis": "Analysis of filler word usage (um, uh, like)",
    "bodyLanguage": "Assessment of body language and presence",
    "tip": "One actionable tip for improvement"
}

Be honest but constructive. If camera data is available, incorporate the focus score into the bodyLanguage and overall assessment.
`;

        const response = await fetch('/api/groq', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert interview coach. Always respond with valid JSON only.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1024
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to get feedback');
        }

        const data = await response.json();
        const aiMessage = data.choices[0].message.content;

        let cleanedMessage = aiMessage;
        cleanedMessage = cleanedMessage.replace(/```json\s*/g, '');
        cleanedMessage = cleanedMessage.replace(/```\s*/g, '');
        cleanedMessage = cleanedMessage.trim();

        let feedback;
        try {
            feedback = JSON.parse(cleanedMessage);
        } catch (parseError) {
            const jsonMatch = cleanedMessage.match(/\{.*\}/s);
            if (jsonMatch) {
                try {
                    feedback = JSON.parse(jsonMatch[0]);
                } catch {
                    throw new Error('Could not parse feedback. Please try again.');
                }
            } else {
                throw new Error('Could not parse feedback. Please try again.');
            }
        }

        feedback._cameraSummary = cameraSummary;
        displayFeedback(feedback);
        if (exportPdfBtn) exportPdfBtn.style.display = 'inline-block';

        hideLoading();

    } catch (error) {
        console.error('Feedback error:', error);
        hideLoading();
        if (feedbackContent) {
            feedbackContent.innerHTML = `
                <div class="error">
                    Error: ${error.message}
                    <br><br>
                    <strong>Tips:</strong>
                    <ul>
                        <li>Make sure you have internet connection</li>
                        <li>Check the Vercel logs for more details</li>
                        <li>Try again in a moment</li>
                    </ul>
                </div>
            `;
        }
    } finally {
        if (getFeedbackBtn) {
            getFeedbackBtn.disabled = false;
            getFeedbackBtn.textContent = 'Get Feedback';
        }
    }
}

function displayFeedback(feedback) {
    let scoreClass = 'average';
    if (feedback.score >= 8) {
        scoreClass = 'excellent';
    } else if (feedback.score >= 6) {
        scoreClass = 'good';
    } else if (feedback.score >= 4) {
        scoreClass = 'average';
    } else {
        scoreClass = 'poor';
    }
    
    let cameraHTML = '';
    if (feedback._cameraSummary && feedback._cameraSummary.totalFrames > 0) {
        const summary = feedback._cameraSummary;
        const presenceColor = summary.overallPresenceScore >= 80 ? 'var(--success)' : 
                             summary.overallPresenceScore >= 50 ? 'var(--warning)' : 'var(--danger)';
        
        cameraHTML = `
            <div class="feedback-section" style="background: var(--surface-alt); border-left: 3px solid var(--accent);">
                <h4>Body Language & Presence</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Focus Score</div>
                        <div style="font-size: 1.2rem; font-weight: 600; color: ${summary.averageFocus >= 80 ? 'var(--success)' : summary.averageFocus >= 50 ? 'var(--warning)' : 'var(--danger)'};">${summary.averageFocus}%</div>
                        <div style="width: 100%; height: 4px; background: var(--border); border-radius: 2px; margin-top: 4px; overflow: hidden;">
                            <div style="width: ${summary.averageFocus}%; height: 100%; background: ${summary.averageFocus >= 80 ? 'var(--success)' : summary.averageFocus >= 50 ? 'var(--warning)' : 'var(--danger)'}; border-radius: 2px;"></div>
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Presence Score</div>
                        <div style="font-size: 1.2rem; font-weight: 600; color: ${presenceColor};">${summary.overallPresenceScore}%</div>
                        <div style="width: 100%; height: 4px; background: var(--border); border-radius: 2px; margin-top: 4px; overflow: hidden;">
                            <div style="width: ${summary.overallPresenceScore}%; height: 100%; background: ${presenceColor}; border-radius: 2px;"></div>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 8px; display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.85rem;">
                    ${summary.questionsWithLowFocus.length > 0 ? 
                        `<span style="color: var(--warning);">Questions with focus drop: ${summary.questionsWithLowFocus.map(q => `Q${q.questionIndex + 1}`).join(', ')}</span>` : 
                        `<span style="color: var(--success);">Maintained consistent focus</span>`
                    }
                </div>
                ${feedback.bodyLanguage ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 0.9rem;">${feedback.bodyLanguage}</div>` : ''}
            </div>
        `;
    }
    
    if (feedbackContent) {
        feedbackContent.innerHTML = `
            <div class="feedback-score ${scoreClass}">
                ${feedback.score}/10 — ${feedback.scoreLabel || 'Good'}
            </div>
            
            ${cameraHTML}
            
            <div class="feedback-section">
                <h4>Strengths</h4>
                <ul>
                    ${feedback.strengths.map(s => `<li class="positive">${s}</li>`).join('')}
                </ul>
            </div>
            
            <div class="feedback-section">
                <h4>Areas for Improvement</h4>
                <ul>
                    ${feedback.improvements.map(i => `<li class="negative">${i}</li>`).join('')}
                </ul>
            </div>
            
            <div class="feedback-section">
                <h4>Communication Skills</h4>
                <p>${feedback.communication}</p>
            </div>
            
            <div class="feedback-section">
                <h4>Did You Answer the Questions?</h4>
                <p>${feedback.answeredQuestions ? 'Yes' : 'No'}</p>
                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 4px;">${feedback.answerExplanation}</p>
            </div>
            
            <div class="feedback-section">
                <h4>Filler Words Analysis</h4>
                <p>${feedback.fillerAnalysis}</p>
            </div>
            
            <div class="feedback-section" style="background: var(--surface-alt); padding: 16px; border-left: 3px solid var(--accent);">
                <h4 style="color: var(--accent);">Actionable Tip</h4>
                <p>${feedback.tip}</p>
            </div>
        `;
    }
    
    if (feedbackSection) feedbackSection.style.display = 'block';
}

// ============================================
// PDF EXPORT
// ============================================

// Opens the modal and waits for the user to confirm details
function promptForPDFDetails() {
    return new Promise((resolve) => {
        const modal = document.getElementById('pdfDetailsModal');
        const nameInput = document.getElementById('pdfName');
        const surnameInput = document.getElementById('pdfSurname');
        const positionInput = document.getElementById('pdfPosition');
        const cancelBtn = document.getElementById('pdfCancelBtn');
        const confirmBtn = document.getElementById('pdfConfirmBtn');

        if (!modal) {
            // If modal not present, proceed without details
            resolve({ name: '', surname: '', position: '' });
            return;
        }

        // Reset fields
        nameInput.value = '';
        surnameInput.value = '';
        positionInput.value = '';

        modal.classList.add('active');
        setTimeout(() => nameInput.focus(), 50);

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey);
        };

        const onConfirm = () => {
            const name = nameInput.value.trim();
            const surname = surnameInput.value.trim();
            const position = positionInput.value.trim();

            if (!name || !surname) {
                // Simple inline validation
                if (!name) nameInput.style.borderColor = 'var(--danger)';
                if (!surname) surnameInput.style.borderColor = 'var(--danger)';
                return;
            }

            cleanup();
            resolve({ name, surname, position });
        };

        const onCancel = () => {
            cleanup();
            resolve(null); // null = user cancelled
        };

        const onBackdrop = (e) => {
            if (e.target === modal) onCancel();
        };

        const onKey = (e) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter') onConfirm();
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey);
    });
}

async function exportToPDF() {
    // 🔥 Step 1: Ask for candidate details first
    const details = await promptForPDFDetails();

    if (!details) {
        // User cancelled — do nothing
        return;
    }

    showLoading('Generating PDF...', 'This takes about 3-5 seconds');
    if (exportPdfBtn) {
        exportPdfBtn.textContent = 'Generating PDF...';
        exportPdfBtn.disabled = true;
    }

    try {
        let totalFocus = 0, focusCount = 0;
        (interviewState.focusData || []).forEach(d => {
            if (d?.focusScores?.length) {
                totalFocus += d.focusScores.reduce((a, b) => a + b, 0) / d.focusScores.length;
                focusCount++;
            }
        });

        const avgFocus = focusCount ? Math.round(totalFocus / focusCount) : 0;
        const answered = interviewState.answers.filter(a => a && a.trim()).length;
        const total = interviewState.questions.length;
        const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

        // Candidate details
        const candidateName = `${details.name} ${details.surname}`.trim();
        const candidatePosition = details.position || '';

        let logoHTML = '';
        try {
            const logoResponse = await fetch('browserLogo.png');
            if (logoResponse.ok) {
                const blob = await logoResponse.blob();
                const reader = new FileReader();
                const logoData = await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                logoHTML = `<img src="${logoData}" alt="Interview Coach" style="height:32px; width:auto; display:block;">`;
            }
        } catch (e) {
            console.warn('Logo not loaded:', e);
        }

        let html = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',Arial,sans-serif; color:#0A1628; background:#fff; padding:40px 48px; -webkit-font-smoothing:antialiased; }

  .report { max-width:100%; }

  .header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:16px; border-bottom:2px solid #0A1628; margin-bottom:20px; }
  .header-left { display:flex; align-items:center; gap:12px; }
  .header-left .name { font-size:18px; font-weight:600; letter-spacing:-.02em; }
  .header-kicker { font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:#8A94A3; }
  .header-meta { text-align:right; font-size:10px; color:#8A94A3; line-height:1.6; }
  .header-logo { height:32px; width:auto; display:block; }

  .candidate-block { margin-bottom:24px; padding:14px 18px; background:#F7F8FA; border-left:3px solid #0A1628; border-radius:0 4px 4px 0; }
  .candidate-block .candidate-name { font-size:16px; font-weight:600; color:#0A1628; letter-spacing:-.01em; }
  .candidate-block .candidate-position { font-size:12px; color:#5A6675; margin-top:3px; }
  .candidate-block .candidate-kicker { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:#8A94A3; margin-bottom:4px; }

  .stats { display:flex; gap:48px; padding:16px 0 20px; border-bottom:1px solid #E6E8EC; margin-bottom:24px; }
  .stat .value { font-size:26px; font-weight:300; letter-spacing:-.03em; line-height:1; }
  .stat .label { margin-top:6px; font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:#8A94A3; }

  .section-title { font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:#8A94A3; margin:26px 0 14px; }

  .q-item { padding:0 0 14px 16px; margin-bottom:14px; border-left:1px solid #E6E8EC; border-bottom:1px solid #F1F2F5; }
  .q-item:last-child { border-bottom:none; }
  .q-item .num { font-size:9px; letter-spacing:.12em; color:#B0B7C2; }
  .q-item .question { font-size:13px; font-weight:600; line-height:1.5; margin:3px 0 6px; }
  .q-item .answer { font-size:12px; line-height:1.7; color:#445061; }
  .q-item .answer.empty { color:#A3ABB8; font-style:italic; }

  .focus-block { padding:14px 18px; background:#F7F8FA; border-radius:4px; margin-bottom:16px; display:flex; align-items:center; gap:20px; }
  .focus-block .focus-value { font-size:22px; font-weight:300; letter-spacing:-.03em; color:#0A1628; }
  .focus-block .focus-label { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:#8A94A3; margin-top:2px; }
  .focus-block .focus-bar { flex:1; height:4px; background:#E6E8EC; border-radius:2px; overflow:hidden; }
  .focus-block .focus-bar-fill { height:100%; border-radius:2px; }

  .fb-item { padding:0 0 10px 16px; margin-bottom:10px; border-left:1px solid #E6E8EC; }
  .fb-item .label { font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:#8A94A3; margin-bottom:4px; }
  .fb-item p, .fb-item li { font-size:12px; line-height:1.7; color:#445061; }
  .fb-item ul { padding-left:16px; }
  .score { font-size:36px; font-weight:300; letter-spacing:-.03em; margin-bottom:16px; }

  .no-break { page-break-inside: avoid; }
  .break-after { page-break-after: avoid; }
</style>
<div class="report">
  <div class="header">
    <div class="header-left">
      ${logoHTML}
      <div>
        <div class="header-kicker">Interview Report</div>
        <div class="name">InterviewCoach</div>
      </div>
    </div>
    <div class="header-meta">${dateStr}<br>${answered} of ${total} answered</div>
  </div>

  <div class="candidate-block">
    <div class="candidate-kicker">Candidate</div>
    <div class="candidate-name">${esc(candidateName)}</div>
    ${candidatePosition ? `<div class="candidate-position">interviewed for: ${esc(candidatePosition)}</div>` : ''}
  </div>

  <div class="stats">
    <div class="stat"><div class="value">${answered}<span style="color:#C3C9D2">/${total}</span></div><div class="label">Questions answered</div></div>
  </div>

  <div class="section-title">Questions &amp; Answers</div>`;

        interviewState.questions.forEach((question, i) => {
            const answer = interviewState.answers[i] || '';
            const has = !!answer.trim();
            html += `
  <div class="q-item no-break">
    <div class="num">Q${String(i + 1).padStart(2, '0')}</div>
    <div class="question">${esc(question)}</div>
    <div class="answer${has ? '' : ' empty'}">${has ? esc(answer) : 'No answer provided'}</div>
  </div>`;
        });

        // ============================================
        // AI FEEDBACK (with focus at the top)
        // ============================================

        if (feedbackContent?.innerHTML) {
            const scoreEl = feedbackContent.querySelector('.feedback-score');
            const sections = feedbackContent.querySelectorAll('.feedback-section');
            if (scoreEl || sections.length) {
                html += `<div class="section-title">AI Feedback</div>`;
                if (scoreEl) {
                    const scoreText = esc(scoreEl.textContent.trim());
                    html += `<div class="score">${scoreText}</div>`;
                }

                // 🔥 Focus block moved here — shown at top of feedback
                if (avgFocus > 0) {
                    let focusColor = '#48bb78';
                    if (avgFocus < 70) focusColor = '#f6ad55';
                    if (avgFocus < 50) focusColor = '#fc8181';
                    html += `
  <div class="focus-block no-break">
    <div>
      <div class="focus-value">${avgFocus}%</div>
      <div class="focus-label">Average Eye Focus</div>
    </div>
    <div class="focus-bar">
      <div class="focus-bar-fill" style="width:${avgFocus}%; background:${focusColor};"></div>
    </div>
  </div>`;
                }

                sections.forEach(section => {
                    const title = section.querySelector('h4');
                    const content = section.querySelector('p, ul');
                    if (!title || !content) return;
                    const titleText = title.textContent.toLowerCase();
                    if (titleText.includes('gaze') || titleText.includes('look away') || titleText.includes('eye contact')) {
                        return;
                    }
                    const body = content.tagName === 'UL'
                        ? `<ul>${[...content.querySelectorAll('li')].map(li => `<li>${esc(li.textContent)}</li>`).join('')}</ul>`
                        : `<p>${esc(content.textContent)}</p>`;
                    html += `<div class="fb-item no-break"><div class="label">${esc(title.textContent)}</div>${body}</div>`;
                });
            }
        }

        html += `
</div>`;

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const marginTop = 14;
        const marginBottom = 14;
        const marginLeft = 12;
        const marginRight = 12;
        const contentWidth = pageWidth - marginLeft - marginRight;
        const contentHeight = pageHeight - marginTop - marginBottom;

        const container = document.createElement('div');
        container.innerHTML = html;
        Object.assign(container.style, {
            position: 'fixed',
            left: '-10000px',
            top: '0',
            width: '750px',
            background: '#fff',
            padding: '0'
        });
        document.body.appendChild(container);
        await new Promise(r => setTimeout(r, 150));

        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#FFFFFF',
            windowWidth: 750,
            height: container.scrollHeight
        });
        document.body.removeChild(container);

        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = contentWidth / imgWidth;
        const pageContentHeight = contentHeight / ratio;

        let currentY = 0;
        let pageNum = 1;
        const totalPages = Math.ceil(imgHeight / pageContentHeight);

        while (currentY < imgHeight) {
            const sliceHeight = Math.min(pageContentHeight, imgHeight - currentY);

            const slice = document.createElement('canvas');
            slice.width = imgWidth;
            slice.height = sliceHeight;
            const ctx = slice.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, slice.width, slice.height);
            ctx.drawImage(canvas, 0, currentY, imgWidth, sliceHeight, 0, 0, imgWidth, sliceHeight);

            if (currentY > 0) {
                pdf.addPage();
            }

            const imgData = slice.toDataURL('image/jpeg', 0.92);
            const imgWidthMm = contentWidth;
            const imgHeightMm = (sliceHeight / imgWidth) * contentWidth;

            pdf.addImage(imgData, 'JPEG', marginLeft, marginTop, imgWidthMm, imgHeightMm);

            const footerY = pageHeight - 10;
            pdf.setFontSize(8);
            pdf.setTextColor('#A3ABB8');

            pdf.text(`© ${new Date().getFullYear()} Interview Coach`, marginLeft, footerY);

            const rightText = `Created by Khetha Ngidi  •  Page ${pageNum} of ${totalPages}`;
            const rightTextWidth = pdf.getStringUnitWidth(rightText) * 8 / pdf.internal.scaleFactor;
            pdf.text(rightText, pageWidth - marginRight - rightTextWidth, footerY);

            currentY += sliceHeight;
            pageNum++;
        }

        hideLoading();
        pdf.save(`interview-report-${new Date().toISOString().slice(0, 10)}.pdf`);

    } catch (error) {
        console.error('PDF export error:', error);
        hideLoading();
        alert('Failed to generate PDF. Error: ' + error.message);
    } finally {
        if (exportPdfBtn) {
            exportPdfBtn.textContent = 'Export as PDF';
            exportPdfBtn.disabled = false;
        }
    }
}

// ============================================
// SET STATUS
// ============================================
function setStatus(message, type) {
    if (statusMessage) {
        statusMessage.textContent = message;
        statusMessage.className = 'status';
        if (type) {
            statusMessage.classList.add(type);
        }
    }
}

// ============================================
// DOMContentLoaded — ALL PAGE LOGIC
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    const page = getCurrentPage();
    console.log(`Page: ${page}`);
    
    setTimeout(function() {
        checkPrivacyConsent();
    }, 50);
    
    const acceptBtn = document.getElementById('acceptPrivacyBtn');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            acceptPrivacy();
        });
        console.log('Accept button ready');
    }
    
    switch(page) {
        case 'index':
            console.log('Landing page');
            break;
            
        case 'home':
            console.log('App page');
            if (generateBtn) {
                generateBtn.addEventListener('click', generateQuestions);
            }
            if (goToInterviewBtn) {
                goToInterviewBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    window.location.href = 'interview.html';
                });
            }
            break;
            
        case 'interview':
            console.log('Interview page');
            if (!loadInterviewData()) {
                alert('No questions found. Please generate questions first.');
                window.location.href = 'home.html';
                return;
            }
            
            if (currentQuestion) {
                currentQuestion.textContent = 'Ready for your interview. Click "Start Interview" to begin.';
            }
            if (questionCounter) {
                questionCounter.textContent = 'Ready to start';
            }
            if (startInterviewBtn) {
                startInterviewBtn.style.display = 'inline-block';
            }
            if (nextQuestionBtn) {
                nextQuestionBtn.style.display = 'none';
            }
            if (endInterviewBtn) {
                endInterviewBtn.style.display = 'none';
            }
            
            if (startInterviewBtn) {
                startInterviewBtn.addEventListener('click', startInterview);
            }
            if (startListeningBtn) {
                startListeningBtn.addEventListener('click', startListening);
            }
            if (stopListeningBtn) {
                stopListeningBtn.addEventListener('click', stopListening);
            }
            if (nextQuestionBtn) {
                nextQuestionBtn.addEventListener('click', function() {
                    if (!this.disabled) showNextQuestion();
                });
            }
            if (endInterviewBtn) {
                endInterviewBtn.addEventListener('click', function() {
                    if (confirm('Are you sure you want to end the interview early?')) {
                        endInterviewEarly();
                    }
                });
            }
            break;
            
        case 'results':
            console.log('Results page');
            if (!loadResultsData()) {
                alert('No interview data found. Please complete an interview first.');
                window.location.href = 'home.html';
                return;
            }
            displayFullResults();
            if (getFeedbackBtn) {
                getFeedbackBtn.style.display = 'inline-block';
                getFeedbackBtn.addEventListener('click', getFeedback);
            }
            if (exportPdfBtn) {
                exportPdfBtn.addEventListener('click', exportToPDF);
            }
            break;
            
        case 'faq':
            console.log('FAQ page');
            document.querySelectorAll('.faq-question').forEach(button => {
                button.addEventListener('click', function() {
                    const item = this.closest('.faq-item');
                    if (!item) return;
                    const isOpen = item.classList.contains('open');
                    const category = item.closest('.faq-category');
                    if (category) {
                        category.querySelectorAll('.faq-item').forEach(other => {
                            if (other !== item) other.classList.remove('open');
                        });
                    }
                    if (isOpen) {
                        item.classList.remove('open');
                    } else {
                        item.classList.add('open');
                    }
                });
            });
            break;
    }
});

// ============================================
// PRIVACY MODAL
// ============================================

function checkPrivacyConsent() {
    const hasAccepted = localStorage.getItem('privacyConsent');
    const modal = document.getElementById('privacyModal');
    
    console.log('Privacy check:', hasAccepted ? 'Accepted' : 'Not accepted');
    
    if (!hasAccepted && modal) {
        modal.classList.add('active');
        console.log('Modal shown');
    } else if (modal) {
        modal.classList.remove('active');
        console.log('Modal hidden');
    }
}

function acceptPrivacy() {
    localStorage.setItem('privacyConsent', 'true');
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.classList.remove('active');
        console.log('Privacy accepted');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        checkPrivacyConsent();
    }, 50);
    
    const acceptBtn = document.getElementById('acceptPrivacyBtn');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            acceptPrivacy();
        });
        console.log('Accept button ready');
    }
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', function(event) {
    const page = getCurrentPage();
    
    if (page === 'interview' && interviewState.isInterviewActive) {
        if (event.key === ' ' && !event.repeat) {
            event.preventDefault();
            if (interviewState.isListening) {
                stopListening();
            } else {
                startListening();
            }
        }
        
        if (event.key === 'Enter' && nextQuestionBtn && !nextQuestionBtn.disabled && !event.repeat) {
            event.preventDefault();
            if (interviewState.currentIndex < interviewState.questions.length - 1) {
                showNextQuestion();
            } else {
                showCompletionScreen();
            }
        }
    }
    
    if (page === 'home' && jobDescriptionInput) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            if (generateBtn) generateBtn.click();
        }
    }
});

// ============================================
// FALLBACK: Direct click handler for Start Interview
// ============================================
setTimeout(function() {
    const btn = document.getElementById('goToInterviewBtn');
    if (btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'interview.html';
        });
    }
}, 300);

// ============================================
// FOOTER LINKS
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    const privacyLink = document.getElementById('privacyLink');
    if (privacyLink) {
        privacyLink.addEventListener('click', function(e) {
            e.preventDefault();
            showPrivacyModal();
        });
        console.log('Privacy Policy link ready');
    }

    const termsLink = document.getElementById('termsLink');
    if (termsLink) {
        termsLink.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Terms of Service coming soon.');
        });
        console.log('Terms of Service link ready');
    }

    const contactLink = document.getElementById('contactLink');
    if (contactLink) {
        contactLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.open('https://linkedin.com/in/khetha-ngidi-843841399', '_blank');
        });
        console.log('Contact link ready');
    }
});

function showPrivacyModal() {
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.classList.add('active');
        console.log('Privacy modal shown');
    }
}

// ============================================
// INITIALIZATION LOG
// ============================================

console.log('Interview Coach - Ready!');
console.log(`Current page: ${getCurrentPage()}`);
console.log('API key is on the server');
console.log('Camera focus tracking integrated');