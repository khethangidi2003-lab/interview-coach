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
// DOM REFERENCES (Shared across pages)
// ============================================

// These will be null on pages where they don't exist
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
// LOADING CONTROLS — using loading3.svg
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

// Button loading state (optional)
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
    if (path.includes('index.html')) return 'index';   // Landing page
    if (path.includes('home.html')) return 'home';     // App page
    if (path.includes('interview.html')) return 'interview';
    if (path.includes('results.html')) return 'results';
    if (path.includes('faq.html')) return 'faq';
    if (path === '/' || path === '') return 'index';   // Default to landing
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
            showNudge(message);
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
    
    // Store focus data for feedback
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
// SPEECH-TO-TEXT
// ============================================

let recognition = null;

function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        setStatus('Your browser doesn\'t support speech recognition. Please use Chrome or Edge.', 'error');
        return false;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    // FIX: Keep listening continuously
    recognition.lang = 'en-US';
    recognition.continuous = true;      // ← Changed from false to true
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    // 🔥 FIX: Silence timer to auto-stop after 2 seconds of silence
    let silenceTimer = null;
    
    recognition.onresult = function(event) {
        // Reset silence timer when user speaks
        clearTimeout(silenceTimer);
        
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        
        if (interimTranscript) {
            answerText.textContent = interimTranscript + ' (still listening...)';
        }
        
        if (finalTranscript) {
            answerText.textContent = finalTranscript;
            interviewState.answers[interviewState.currentIndex] = finalTranscript;
            
            if (interviewState.isInterviewActive) {
                setStatus('Answer recorded! Click "Next Question" to continue.', 'success');
                if (nextQuestionBtn) nextQuestionBtn.disabled = false;
            }
        }
        
        // Auto-stop after 2 seconds of silence
        silenceTimer = setTimeout(() => {
            if (interviewState.isListening) {
                stopListening();
                setStatus('Stopped listening (silence detected)', '');
            }
        }, 2000);
    };
    
    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
            setStatus('Please allow microphone access to speak your answers.', 'error');
        } else if (event.error === 'no-speech') {
            setStatus('No speech detected. Click "Start Listening" and speak your answer.', '');
        } else {
            setStatus('Speech recognition error: ' + event.error, 'error');
        }
        interviewState.isListening = false;
        if (startListeningBtn) startListeningBtn.style.display = 'inline-block';
        if (stopListeningBtn) stopListeningBtn.style.display = 'none';
        clearTimeout(silenceTimer);
    };
    
    recognition.onend = function() {
        interviewState.isListening = false;
        if (startListeningBtn) startListeningBtn.style.display = 'inline-block';
        if (stopListeningBtn) stopListeningBtn.style.display = 'none';
        clearTimeout(silenceTimer);
    };
    
    return true;
}

function startListening() {
    if (!recognition) {
        if (!initSpeechRecognition()) {
            return;
        }
    }
    
    try {
        recognition.start();
        interviewState.isListening = true;
        if (startListeningBtn) startListeningBtn.style.display = 'none';
        if (stopListeningBtn) stopListeningBtn.style.display = 'inline-block';
        if (answerDisplay) answerDisplay.style.display = 'block';
        if (answerText) answerText.textContent = '🎤 Listening... speak your answer clearly.';
        setStatus('🎤 Listening... speak now', 'listening');
    } catch (error) {
        console.error('Failed to start listening:', error);
        if (error.message.includes('already started')) {
            recognition.stop();
            setTimeout(() => startListening(), 200);
        }
    }
}

function stopListening() {
    if (recognition && interviewState.isListening) {
        try {
            recognition.stop();
        } catch (e) {}
        interviewState.isListening = false;
        if (startListeningBtn) startListeningBtn.style.display = 'inline-block';
        if (stopListeningBtn) stopListeningBtn.style.display = 'none';
        setStatus('Stopped listening. Click "Start Listening" to try again.', '');
    }
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
    
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(voice => voice.name.includes('Female') || voice.name.includes('Samantha'));
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
// GENERATE QUESTIONS
// ============================================

async function generateQuestions() {
    const jobDescription = jobDescriptionInput ? jobDescriptionInput.value.trim() : '';
    
    if (!jobDescription) {
        alert('Please paste a job description.');
        return;
    }
    
    interviewState.jobDescription = jobDescription;
    // Page loader
    showLoading('Generating Questions...', 'This takes about 5-10 seconds');

    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
    }
    
    try {
        const prompt = `
You are an expert HR interviewer. Based on this job description, generate exactly 7 interview questions.

Instructions:
- 3 behavioral questions (asking about past experiences)
- 2 technical questions (specific skills for the job)
- 2 questions about company culture and values

Return ONLY a JSON array of strings. No extra text, no numbering, no bullet points.

Example format: ["Question 1", "Question 2", "Question 3"]

Job Description:
${jobDescription}
        `.trim();
        
        // Call your Vercel serverless API (NO API KEY HERE!)
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
                        content: 'You are an expert HR interviewer. You always respond with valid JSON arrays.'
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
        
        interviewState.questions = questions;
        
        // Store in session storage for interview page
        sessionStorage.setItem('interviewQuestions', JSON.stringify(questions));
        sessionStorage.setItem('jobDescription', jobDescription);
        
        // AUTO-REDIRECT TO INTERVIEW PAGE
        console.log('Auto-redirecting to interview...');
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
    
    // 🔥 FIX: Hide preparation message
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
    
    // 🔥 FIX: Hide Start Interview button, show listening buttons
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
    
    // FIX: Only show Start Listening button, hide Start Interview
    if (startListeningBtn) startListeningBtn.style.display = 'inline-block';
    if (stopListeningBtn) stopListeningBtn.style.display = 'none';
    if (nextQuestionBtn) nextQuestionBtn.disabled = true;
    
    // FIX: Ensure Start Interview button is hidden during questions
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
    
    // Store results in session storage for results page
    sessionStorage.setItem('interviewAnswers', JSON.stringify(interviewState.answers));
    sessionStorage.setItem('interviewFocusData', JSON.stringify(interviewState.focusData));
    
    // Redirect to results page
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
        
        // Store partial results
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
        questionsContainer.innerHTML = '<p style="color: var(--text-secondary);">No questions available.</p>';
        return;
    }
    
    interviewState.questions.forEach((question, index) => {
        const div = document.createElement('div');
        div.className = 'question-item';
        
        // FOCUS DATA REMOVED — only shows question and answer
        div.innerHTML = `
            <div>
                <strong><span class="question-number">${index + 1}.</span> ${question}</strong>
                <div class="question-answer">
                    Your answer: ${interviewState.answers[index] || '(No answer provided)'}
                </div>
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
    // SHOW LOADING
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
            const gazeTotal = Object.values(cameraSummary.gazeDistribution).reduce((a, b) => a + b, 0);
            const gazePercent = gazeTotal > 0 
                ? Math.round((cameraSummary.gazeDistribution.center / gazeTotal) * 100) 
                : 0;

            cameraInsights = `
Camera/Body Language Data:
- Average Focus Score: ${cameraSummary.averageFocus}% (100% = perfect eye contact)
- Overall Presence Score: ${cameraSummary.overallPresenceScore}%
- Times looked away: ${cameraSummary.lookingAwayCount}
- Gaze distribution: ${gazePercent}% looking at camera
- Questions that caused focus drops: ${cameraSummary.questionsWithLowFocus.length > 0 
    ? cameraSummary.questionsWithLowFocus.map(q => `Q${q.questionIndex + 1} (${q.avgFocus}%)`).join(', ') 
    : 'None'}
- ${cameraSummary.lookingAwayCount === 0 ? ' Maintained excellent eye contact throughout' : '⚠️ Some eye contact issues detected'}
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
    "bodyLanguage": "Assessment of body language and presence based on camera data",
    "tip": "One actionable tip for improvement"
}

Be honest but constructive. If camera data is available, incorporate it into the bodyLanguage and overall assessment.
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

        // HIDE LOADING — SUCCESS
        hideLoading();

    } catch (error) {
        console.error('Feedback error:', error);
        // HIDE LOADING — ERROR
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
    let scoreEmoji = '📊';
    if (feedback.score >= 8) {
        scoreClass = 'excellent';
        scoreEmoji = '🌟';
    } else if (feedback.score >= 6) {
        scoreClass = 'good';
        scoreEmoji = '👍';
    } else if (feedback.score >= 4) {
        scoreClass = 'average';
        scoreEmoji = '📊';
    } else {
        scoreClass = 'poor';
        scoreEmoji = '💪';
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
                    <span>Looked away: <strong>${summary.lookingAwayCount}</strong> times</span>
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
                ${scoreEmoji} ${feedback.score}/10 — ${feedback.scoreLabel || 'Good'}
            </div>
            
            ${cameraHTML}
            
            <div class="feedback-section">
                <h4>Strengths</h4>
                <ul>
                    ${feedback.strengths.map(s => `<li class="positive">${s}</li>`).join('')}
                </ul>
            </div>
            
            <div class="feedback-section">
                <h4>🔧 Areas for Improvement</h4>
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
                <p>${feedback.answeredQuestions ? ' Yes' : ' No'}</p>
                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 4px;">${feedback.answerExplanation}</p>
            </div>
            
            <div class="feedback-section">
                <h4>Filler Words Analysis</h4>
                <p>${feedback.fillerAnalysis}</p>
            </div>
            
            <div class="feedback-section" style="background: var(--surface-alt); padding: 16px; border-left: 3px solid var(--accent);">
                <h4 style="color: var(--accent);">💡 Actionable Tip</h4>
                <p>${feedback.tip}</p>
            </div>
        `;
    }
    
    if (feedbackSection) feedbackSection.style.display = 'block';
}

// ============================================
// PDF EXPORT
// ============================================

async function exportToPDF() {
    showLoading('Generating PDF...', 'This takes about 3-5 seconds');

    if (exportPdfBtn) {
        exportPdfBtn.textContent = '⏳ Generating PDF...';
        exportPdfBtn.disabled = true;
    }
    
    try {
        // Calculate summary stats
        let totalFocus = 0;
        let focusCount = 0;
        let totalLookedAway = 0;
        
        if (interviewState.focusData) {
            interviewState.focusData.forEach(data => {
                if (data && data.focusScores && data.focusScores.length > 0) {
                    const avg = data.focusScores.reduce((a, b) => a + b, 0) / data.focusScores.length;
                    totalFocus += avg;
                    focusCount++;
                }
                if (data && data.gazeEvents) {
                    totalLookedAway += data.gazeEvents.length;
                }
            });
        }
        
        const avgFocus = focusCount > 0 ? Math.round(totalFocus / focusCount) : 0;
        const answeredQuestions = interviewState.answers.filter(a => a && a.trim() !== '').length;
        const totalQuestions = interviewState.questions.length;
        
        // Build the professional report
        let contentHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
                    
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: 'Inter', Arial, sans-serif;
                        color: #0A1628;
                        background: white;
                        padding: 0;
                        margin: 0;
                        -webkit-font-smoothing: antialiased;
                    }
                    
                    .report-container {
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 40px 40px 30px;
                    }
                    
                    /* Header */
                    .report-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 2px solid #C9A84C;
                        padding-bottom: 20px;
                        margin-bottom: 28px;
                    }
                    
                    .report-header-left {
                        display: flex;
                        align-items: center;
                        gap: 14px;
                    }
                    
                    .report-logo-img {
                        height: 44px;
                        width: auto;
                        display: block;
                    }
                    
                    .report-title {
                        font-size: 22px;
                        font-weight: 700;
                        color: #0A1628;
                        letter-spacing: -0.02em;
                    }
                    
                    .report-title span {
                        color: #C9A84C;
                    }
                    
                    .report-subtitle {
                        font-size: 11px;
                        color: #7A8798;
                        margin-top: 1px;
                        letter-spacing: 0.02em;
                    }
                    
                    .report-meta {
                        text-align: right;
                        font-size: 11px;
                        color: #7A8798;
                        line-height: 1.7;
                    }
                    
                    .report-meta strong {
                        color: #0A1628;
                        font-weight: 600;
                    }
                    
                    /* Executive Summary */
                    .executive-summary {
                        background: #F5F6F8;
                        border-radius: 4px;
                        padding: 20px 24px;
                        margin-bottom: 28px;
                        border-left: 3px solid #C9A84C;
                    }
                    
                    .executive-summary h2 {
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.06em;
                        color: #7A8798;
                        margin-bottom: 12px;
                    }
                    
                    .summary-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 12px;
                    }
                    
                    .summary-item {
                        text-align: center;
                    }
                    
                    .summary-item .number {
                        font-size: 26px;
                        font-weight: 700;
                        color: #0A1628;
                        letter-spacing: -0.02em;
                    }
                    
                    .summary-item .number.gold {
                        color: #C9A84C;
                    }
                    
                    .summary-item .number.green {
                        color: #1A7A4A;
                    }
                    
                    .summary-item .number.orange {
                        color: #B8860B;
                    }
                    
                    .summary-item .label {
                        font-size: 11px;
                        color: #7A8798;
                        margin-top: 2px;
                        letter-spacing: 0.02em;
                    }
                    
                    /* Section Headers */
                    .section-header {
                        font-size: 16px;
                        font-weight: 600;
                        color: #0A1628;
                        margin: 28px 0 14px 0;
                        padding-bottom: 8px;
                        border-bottom: 1px solid #E2E4E8;
                        letter-spacing: -0.01em;
                    }
                    
                    /* Question Items */
                    .question-item {
                        padding: 14px 18px;
                        background: #F5F6F8;
                        border-radius: 4px;
                        margin-bottom: 10px;
                        border-left: 3px solid #C9A84C;
                    }
                    
                    .question-item .q {
                        font-weight: 600;
                        font-size: 14px;
                        color: #0A1628;
                        margin-bottom: 4px;
                        line-height: 1.6;
                    }
                    
                    .question-item .a {
                        font-size: 13px;
                        color: #3D4A5C;
                        padding-left: 6px;
                        margin-top: 4px;
                        line-height: 1.7;
                    }
                    
                    .question-item .a-label {
                        font-size: 10px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.04em;
                        color: #7A8798;
                        display: inline-block;
                        margin-right: 4px;
                    }
                    
                    .question-item .focus-badge {
                        display: inline-block;
                        font-size: 10px;
                        font-weight: 500;
                        padding: 2px 10px;
                        border-radius: 12px;
                        margin-top: 6px;
                        letter-spacing: 0.02em;
                    }
                    
                    .focus-badge.high {
                        background: #E6F4EC;
                        color: #1A7A4A;
                    }
                    
                    .focus-badge.medium {
                        background: #FDF3E0;
                        color: #B8860B;
                    }
                    
                    .focus-badge.low {
                        background: #FDE8E8;
                        color: #B22222;
                    }
                    
                    .no-answer {
                        color: #7A8798;
                        font-style: italic;
                        font-size: 13px;
                    }
                    
                    /* Feedback Section */
                    .feedback-score-box {
                        text-align: center;
                        padding: 14px;
                        background: #F5F6F8;
                        border-radius: 4px;
                        margin-bottom: 14px;
                    }
                    
                    .feedback-score-box .score-number {
                        font-size: 34px;
                        font-weight: 300;
                        letter-spacing: -0.02em;
                    }
                    
                    .feedback-section-item {
                        padding: 12px 16px;
                        background: white;
                        border: 1px solid #E2E4E8;
                        border-radius: 4px;
                        margin-bottom: 10px;
                    }
                    
                    .feedback-section-item .label {
                        font-size: 10px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.04em;
                        color: #7A8798;
                        display: block;
                        margin-bottom: 4px;
                    }
                    
                    .feedback-section-item .content {
                        font-size: 13px;
                        color: #3D4A5C;
                        line-height: 1.7;
                    }
                    
                    .feedback-section-item ul {
                        padding-left: 18px;
                        margin: 4px 0;
                    }
                    
                    .feedback-section-item ul li {
                        font-size: 13px;
                        color: #3D4A5C;
                        margin-bottom: 2px;
                        line-height: 1.6;
                    }
                    
                    /* Footer */
                    .report-footer {
                        margin-top: 32px;
                        padding-top: 16px;
                        border-top: 1px solid #E2E4E8;
                        text-align: center;
                        font-size: 10px;
                        color: #7A8798;
                        letter-spacing: 0.02em;
                    }
                    
                    .report-footer strong {
                        color: #0A1628;
                        font-weight: 600;
                    }
                    
                    /* Responsive */
                    @media (max-width: 600px) {
                        .report-container {
                            padding: 24px 16px;
                        }
                        .report-header {
                            flex-direction: column;
                            text-align: center;
                            gap: 10px;
                        }
                        .report-meta {
                            text-align: center;
                        }
                        .summary-grid {
                            grid-template-columns: 1fr 1fr;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="report-container">
                    
                    <!-- HEADER -->
                    <div class="report-header">
                        <div class="report-header-left">
                            <img src="logo.PNG" alt="Interview Coach" class="report-logo-img">
                            <div>
                                <div class="report-title">Interview<span>Coach</span></div>
                                <div class="report-subtitle">AI-Powered Interview Practice</div>
                            </div>
                        </div>
                        <div class="report-meta">
                            <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
                            <div><strong>Questions:</strong> ${totalQuestions}</div>
                            <div><strong>Answered:</strong> ${answeredQuestions} of ${totalQuestions}</div>
                        </div>
                    </div>
                    
                    <!-- EXECUTIVE SUMMARY -->
                    <div class="executive-summary">
                        <h2>Executive Summary</h2>
                        <div class="summary-grid">
                            <div class="summary-item">
                                <div class="number ${avgFocus >= 80 ? 'green' : avgFocus >= 50 ? 'orange' : ''}">${avgFocus}%</div>
                                <div class="label">Average Focus</div>
                            </div>
                            <div class="summary-item">
                                <div class="number gold">${answeredQuestions}/${totalQuestions}</div>
                                <div class="label">Questions Answered</div>
                            </div>
                            <div class="summary-item">
                                <div class="number ${totalLookedAway === 0 ? 'green' : 'orange'}">${totalLookedAway}</div>
                                <div class="label">Times Looked Away</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- INTERVIEW DETAILS -->
                    <div class="section-header">Interview Summary</div>
        `;
        
        // Add questions and answers
        interviewState.questions.forEach((question, index) => {
            const answer = interviewState.answers[index] || '';
            const hasAnswer = answer && answer.trim() !== '';
            
            let focusHTML = '';
            if (interviewState.focusData && interviewState.focusData[index]) {
                const data = interviewState.focusData[index];
                const avgFocus = data.focusScores && data.focusScores.length > 0 
                    ? Math.round(data.focusScores.reduce((a, b) => a + b, 0) / data.focusScores.length) 
                    : 0;
                const timesLookedAway = data.gazeEvents ? data.gazeEvents.length : 0;
                
                let focusClass = 'high';
                if (avgFocus < 50) focusClass = 'low';
                else if (avgFocus < 80) focusClass = 'medium';
                
                let focusText = `${avgFocus}% Focus`;
                if (timesLookedAway > 0) {
                    focusText += ` · ${timesLookedAway} look${timesLookedAway > 1 ? 's' : ''} away`;
                }
                
                focusHTML = `<span class="focus-badge ${focusClass}">${focusText}</span>`;
            }
            
            contentHTML += `
                <div class="question-item">
                    <div class="q">Q${index + 1}: ${question}</div>
                    <div class="a">
                        <span class="a-label">Answer:</span>
                        ${hasAnswer ? answer : '<span class="no-answer">No answer provided</span>'}
                    </div>
                    ${focusHTML}
                </div>
            `;
        });
        
        // Add feedback if available
        if (feedbackContent && feedbackContent.innerHTML) {
            const scoreElement = feedbackContent.querySelector('.feedback-score');
            const sections = feedbackContent.querySelectorAll('.feedback-section');
            
            if (scoreElement || sections.length > 0) {
                contentHTML += `
                    <div class="section-header">AI Feedback</div>
                `;
                
                if (scoreElement) {
                    const scoreText = scoreElement.textContent.trim();
                    const scoreClass = scoreElement.className.includes('excellent') ? '#1A7A4A' : 
                                      scoreElement.className.includes('good') ? '#0A1628' :
                                      scoreElement.className.includes('average') ? '#B8860B' : '#B22222';
                    contentHTML += `
                        <div class="feedback-score-box">
                            <div class="score-number" style="color:${scoreClass};">${scoreText}</div>
                        </div>
                    `;
                }
                
                sections.forEach(section => {
                    const title = section.querySelector('h4');
                    const content = section.querySelector('p, ul');
                    if (title && content) {
                        let contentHTMLStr = '';
                        if (content.tagName === 'UL') {
                            const items = content.querySelectorAll('li');
                            let listHTML = '<ul>';
                            items.forEach(item => {
                                listHTML += `<li>${item.textContent}</li>`;
                            });
                            listHTML += '</ul>';
                            contentHTMLStr = listHTML;
                        } else {
                            contentHTMLStr = `<div class="content">${content.textContent}</div>`;
                        }
                        contentHTML += `
                            <div class="feedback-section-item">
                                <span class="label">${title.textContent}</span>
                                ${contentHTMLStr}
                            </div>
                        `;
                    }
                });
            }
        }
        
        contentHTML += `
                    <div class="report-footer">
                        &copy; 2026 Interview Coach — Created by <strong>Khetha Ngidi</strong> &bull; AI-Powered Interview Practice
                    </div>
                    
                </div>
            </body>
            </html>
        `;
        
        const container = document.createElement('div');
        container.innerHTML = contentHTML;
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '800px';
        container.style.backgroundColor = 'white';
        document.body.appendChild(container);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#FFFFFF',
            width: 800,
            height: container.scrollHeight
        });
        
        document.body.removeChild(container);
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight * ratio);
        hideLoading();
        pdf.save(`interview-summary-${new Date().toISOString().slice(0,10)}.pdf`);
        
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
// SINGLE DOMContentLoaded LISTENER (EVERYTHING IN ONE PLACE)
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    const page = getCurrentPage();
    console.log(`Page: ${page}`);
    
    // --- PRIVACY MODAL (HIGHEST PRIORITY) ---
    // Show modal after a tiny delay
    setTimeout(function() {
        checkPrivacyConsent();
    }, 50);
    
    // Accept button
    const acceptBtn = document.getElementById('acceptPrivacyBtn');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            acceptPrivacy();
        });
        console.log('Accept button ready');
    }
    
    // --- PAGE-SPECIFIC LOGIC ---
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
            console.log('❓ FAQ page');
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
// PRIVACY MODAL — No Blinking!
// ============================================

function checkPrivacyConsent() {
    const hasAccepted = localStorage.getItem('privacyConsent');
    const modal = document.getElementById('privacyModal');
    
    console.log('🔍 Privacy check:', hasAccepted ? 'Accepted' : 'Not accepted');
    
    if (!hasAccepted && modal) {
        // 🔥 Show modal using class (smooth, no blink)
        modal.classList.add('active');
        console.log('✅ Modal shown');
    } else if (modal) {
        modal.classList.remove('active');
        console.log('❌ Modal hidden');
    }
}

function acceptPrivacy() {
    localStorage.setItem('privacyConsent', 'true');
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.classList.remove('active');
        console.log('✅ Privacy accepted');
    }
}

// Call when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Show modal after a tiny delay (ensures DOM is ready)
    setTimeout(function() {
        checkPrivacyConsent();
    }, 50);
    
    // Accept button
    const acceptBtn = document.getElementById('acceptPrivacyBtn');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            acceptPrivacy();
        });
        console.log('✅ Accept button ready');
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
    // --- Privacy Policy ---
    const privacyLink = document.getElementById('privacyLink');
    if (privacyLink) {
        privacyLink.addEventListener('click', function(e) {
            e.preventDefault();
            showPrivacyModal();
        });
        console.log('✅ Privacy Policy link ready');
    }

    // --- Terms of Service (placeholder) ---
    const termsLink = document.getElementById('termsLink');
    if (termsLink) {
        termsLink.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Terms of Service coming soon.');
        });
        console.log('✅ Terms of Service link ready');
    }

    // --- Contact → LinkedIn ---
    const contactLink = document.getElementById('contactLink');
    if (contactLink) {
        contactLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.open('https://linkedin.com/in/khetha-ngidi-843841399', '_blank');
        });
        console.log('✅ Contact link ready');
    }
});

// Function to show privacy modal (can be called from anywhere)
function showPrivacyModal() {
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.classList.add('active');
        console.log('🔒 Privacy modal shown');
    }
}
// ============================================
// INITIALIZATION LOG
// ============================================

console.log('Interview Coach - Ready!');
console.log(`Current page: ${getCurrentPage()}`);
console.log('API key is on the server');
console.log('Camera focus tracking integrated');