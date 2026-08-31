// ============================================
// FACE MESH MODULE
// Uses MediaPipe Face Mesh for precise gaze tracking
// ============================================

class FaceDetector {
    constructor() {
        this.isRunning = false;
        this.faceLandmarks = null;
        this.gazeDirection = 'center';
        this.headPosition = 'center';
        this.focusScore = 100;
        this.lookingAwayCount = 0;
        this.totalFrames = 0;
        this.detectionFailures = 0;
        this.noFaceFrames = 0;
        this.lastNudgeTime = 0;
        this.nudgeCooldown = 5000;
        this.onNudge = null;
        this.onFocusUpdate = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.ctx = null;
        this.faceMesh = null;
        this.camera = null;
        
        // Eye landmark indices for Face Mesh
        this.LEFT_EYE = [33, 133, 157, 158, 159, 160, 161, 173];
        this.RIGHT_EYE = [362, 263, 387, 386, 385, 384, 398, 466];
        this.LEFT_IRIS = [468, 469, 470, 471];
        this.RIGHT_IRIS = [472, 473, 474, 475];
        this.NOSE_TIP = 1;
        this.MOUTH_LEFT = 61;
        this.MOUTH_RIGHT = 291;
    }

    async initialize(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        // Set canvas dimensions
        this.canvasElement.width = 640;
        this.canvasElement.height = 480;

        // Use Face Mesh instead of Face Detection
        this.faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });

        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.faceMesh.onResults((results) => {
            this.handleResults(results);
        });

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });

            this.videoElement.srcObject = stream;
            await this.videoElement.play();

            this.isRunning = true;
            this.detectLoop();

            console.log('✅ Camera and Face Mesh initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize camera:', error);
            return false;
        }
    }

    async detectLoop() {
        if (!this.isRunning) return;

        try {
            await this.faceMesh.send({ image: this.videoElement });
        } catch (error) {
            this.detectionFailures = (this.detectionFailures || 0) + 1;
            if (this.detectionFailures > 10) {
                console.log('🔄 Resetting face detection...');
                this.detectionFailures = 0;
                this.faceLandmarks = null;
            }
        }

        // Draw video frame on canvas
        if (this.ctx && this.videoElement) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            this.ctx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
        }

        requestAnimationFrame(() => this.detectLoop());
    }

    handleResults(results) {
        this.totalFrames++;

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            this.faceLandmarks = landmarks;
            this.noFaceFrames = 0;
            this.detectionFailures = 0;
            this.lookingAwayCount = Math.max(0, this.lookingAwayCount - 5);

            // Draw face landmarks
            this.drawFaceLandmarks(landmarks);
            
            // Analyze gaze using eye tracking
            this.analyzeGaze(landmarks);
            
            // Update focus score
            this.updateFocusScore();
            
            // Draw focus indicator
            this.drawFocusIndicator();

        } else {
            this.noFaceFrames = (this.noFaceFrames || 0) + 1;
            
            if (this.noFaceFrames > 5) {
                this.faceLandmarks = null;
                this.gazeDirection = 'unknown';
                this.headPosition = 'unknown';
                this.lookingAwayCount += 2;
                this.updateFocusScore();
                this.checkNudge();
            }
        }
    }

    // ============================================
    // GAZE TRACKING USING EYE LANDMARKS
    // ============================================

    analyzeGaze(landmarks) {
        // Calculate eye openness for both eyes
        const leftOpen = this.getEyeOpenness(landmarks, this.LEFT_EYE);
        const rightOpen = this.getEyeOpenness(landmarks, this.RIGHT_EYE);
        
        // Calculate iris positions
        const leftIris = this.getIrisPosition(landmarks, this.LEFT_IRIS);
        const rightIris = this.getIrisPosition(landmarks, this.RIGHT_IRIS);
        
        // Get horizontal and vertical gaze
        const horizontal = this.getHorizontalGaze(landmarks, leftOpen, rightOpen, leftIris, rightIris);
        const vertical = this.getVerticalGaze(landmarks);
        
        // Combine results
        if (horizontal === 'center' && vertical === 'center') {
            this.gazeDirection = 'center';
        } else if (horizontal !== 'center') {
            this.gazeDirection = horizontal;
        } else {
            this.gazeDirection = vertical;
        }
        
        // Update looking away count
        if (this.gazeDirection !== 'center') {
            this.lookingAwayCount++;
        } else {
            this.lookingAwayCount = Math.max(0, this.lookingAwayCount - 2);
        }
    }

    // Calculate how open an eye is (aspect ratio)
    getEyeOpenness(landmarks, eyeIndices) {
        try {
            const p1 = landmarks[eyeIndices[0]]; // Top-left
            const p2 = landmarks[eyeIndices[1]]; // Bottom-left
            const p3 = landmarks[eyeIndices[2]]; // Top-right
            const p4 = landmarks[eyeIndices[3]]; // Bottom-right
            
            // Vertical distances
            const v1 = this.distance(p1, p2);
            const v2 = this.distance(p3, p4);
            const verticalAvg = (v1 + v2) / 2;
            
            // Horizontal distance
            const horizontal = this.distance(p1, p3);
            
            // Aspect ratio (vertical / horizontal)
            // Normal: ~0.25-0.3
            // Looking away: ~0.15-0.2 (eyes narrower)
            return verticalAvg / horizontal;
        } catch (e) {
            return 0.25; // Default value
        }
    }

    // Get iris position within the eye
    getIrisPosition(landmarks, irisIndices) {
        try {
            // Average of iris landmarks
            let x = 0, y = 0;
            let count = 0;
            for (const idx of irisIndices) {
                if (landmarks[idx]) {
                    x += landmarks[idx].x;
                    y += landmarks[idx].y;
                    count++;
                }
            }
            if (count > 0) {
                return { x: x / count, y: y / count };
            }
        } catch (e) {}
        return null;
    }

    // Determine horizontal gaze direction
    getHorizontalGaze(landmarks, leftOpen, rightOpen, leftIris, rightIris) {
        try {
            // Method 1: Compare eye openness
            const ratio = leftOpen / (rightOpen + 0.001);
            
            // Method 2: Check iris position relative to eye corners
            const leftEye = landmarks[33];
            const rightEye = landmarks[362];
            const faceWidth = this.distance(leftEye, rightEye);
            
            let irisOffset = 0;
            if (leftIris && rightIris) {
                const leftEyeCenter = this.getEyeCenter(landmarks, this.LEFT_EYE);
                const rightEyeCenter = this.getEyeCenter(landmarks, this.RIGHT_EYE);
                
                const leftOffset = leftIris.x - leftEyeCenter.x;
                const rightOffset = rightIris.x - rightEyeCenter.x;
                irisOffset = (leftOffset + rightOffset) / 2;
            }
            
            // Combine methods
            // Looking left: right eye is MORE open, iris shifts left
            // Looking right: left eye is MORE open, iris shifts right
            
            const opennessSignal = (ratio - 1) * 2;
            const irisSignal = irisOffset * 10;
            
            const combined = opennessSignal + irisSignal;
            
            if (combined > 0.3) {
                return 'right';
            } else if (combined < -0.3) {
                return 'left';
            } else {
                return 'center';
            }
        } catch (e) {
            return 'center';
        }
    }

    // Determine vertical gaze direction
    getVerticalGaze(landmarks) {
        try {
            const nose = landmarks[this.NOSE_TIP];
            const leftEye = landmarks[33];
            const rightEye = landmarks[362];
            
            const eyeCenterY = (leftEye.y + rightEye.y) / 2;
            const faceWidth = this.distance(leftEye, rightEye);
            
            // Nose should be between eyes (x) and slightly below (y)
            const noseOffsetY = (nose.y - eyeCenterY) / faceWidth;
            
            // Looking up: nose is closer to eyes (smaller Y offset)
            // Looking down: nose is further from eyes (larger Y offset)
            
            if (noseOffsetY < 0.35) {
                return 'up';
            } else if (noseOffsetY > 0.55) {
                return 'down';
            } else {
                return 'center';
            }
        } catch (e) {
            return 'center';
        }
    }

    // Helper: Get center of eye
    getEyeCenter(landmarks, eyeIndices) {
        let x = 0, y = 0;
        let count = 0;
        for (const idx of eyeIndices) {
            if (landmarks[idx]) {
                x += landmarks[idx].x;
                y += landmarks[idx].y;
                count++;
            }
        }
        return { x: x / count, y: y / count };
    }

    // Helper: Distance between two points
    distance(p1, p2) {
        return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }

    // ============================================
    // DRAWING FUNCTIONS
    // ============================================

    drawFaceLandmarks(landmarks) {
        if (!this.ctx) return;

        // Draw face mesh points (subtle)
        this.ctx.fillStyle = 'rgba(79, 70, 229, 0.3)';
        for (let i = 0; i < landmarks.length; i++) {
            const x = landmarks[i].x * this.canvasElement.width;
            const y = landmarks[i].y * this.canvasElement.height;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 2, 0, 2 * Math.PI);
            this.ctx.fill();
        }

        // Draw eye outlines
        this.drawEyeOutline(landmarks, this.LEFT_EYE, '#48bb78');
        this.drawEyeOutline(landmarks, this.RIGHT_EYE, '#48bb78');

        // Draw gaze direction indicator
        const nose = landmarks[this.NOSE_TIP];
        const noseX = nose.x * this.canvasElement.width;
        const noseY = nose.y * this.canvasElement.height;
        
        // Draw a small line showing gaze direction
        let dx = 0, dy = 0;
        if (this.gazeDirection === 'left') dx = -30;
        else if (this.gazeDirection === 'right') dx = 30;
        else if (this.gazeDirection === 'up') dy = -30;
        else if (this.gazeDirection === 'down') dy = 30;
        
        if (this.gazeDirection !== 'center' && this.gazeDirection !== 'unknown') {
            this.ctx.strokeStyle = '#fc8181';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 4]);
            this.ctx.beginPath();
            this.ctx.moveTo(noseX, noseY);
            this.ctx.lineTo(noseX + dx, noseY + dy);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Draw face status
        const statusColor = this.gazeDirection === 'center' ? '#48bb78' : '#fc8181';
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 180, 30);
        this.ctx.fillStyle = statusColor;
        this.ctx.font = '14px Arial';
        const status = this.gazeDirection === 'center' ? 'Looking at camera' : 
                      this.gazeDirection === 'unknown' ? 'Face not detected' :
                      `Looking ${this.gazeDirection}`;
        this.ctx.fillText(status, 20, 32);
    }

    drawEyeOutline(landmarks, eyeIndices, color) {
        if (!this.ctx) return;
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        for (let i = 0; i < eyeIndices.length; i++) {
            const idx = eyeIndices[i];
            if (landmarks[idx]) {
                const x = landmarks[idx].x * this.canvasElement.width;
                const y = landmarks[idx].y * this.canvasElement.height;
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
        }
        this.ctx.closePath();
        this.ctx.stroke();
    }

    drawFocusIndicator() {
        if (!this.ctx) return;

        const width = this.canvasElement.width;
        const height = this.canvasElement.height;

        // Focus score at top-right
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(width - 200, 10, 180, 40);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Focus: ${this.focusScore}%`, width - 190, 37);

        // Color indicator
        let color = '#48bb78';
        if (this.focusScore < 70) color = '#f6ad55';
        if (this.focusScore < 50) color = '#fc8181';

        this.ctx.beginPath();
        this.ctx.arc(width - 30, 30, 10, 0, 2 * Math.PI);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    // ============================================
    // FOCUS SCORE & NUDGE
    // ============================================

updateFocusScore() {
    let score = 100;

    // More aggressive penalty for looking away
    if (this.gazeDirection !== 'center' && this.gazeDirection !== 'unknown') {
        // Faster penalty: 5 points per second instead of 0.5
        const penalty = Math.min(40, this.lookingAwayCount * 2);
        score = Math.max(0, score - penalty);
    }

    // Severe penalty for no face detected
    if (this.gazeDirection === 'unknown') {
        // Drop quickly when face is missing
        const penalty = Math.min(50, this.lookingAwayCount * 3);
        score = Math.max(0, score - penalty);
    }

    // Recovery when looking at camera (slow and steady)
    if (this.gazeDirection === 'center' && this.lookingAwayCount < 5) {
        score = Math.min(100, score + 2);
    }

    this.focusScore = Math.round(score);

    if (this.onFocusUpdate) {
        this.onFocusUpdate(this.focusScore, this.gazeDirection);
    }

    this.checkNudge();
}

    checkNudge() {
        const now = Date.now();
        const timeSinceLastNudge = now - this.lastNudgeTime;

        if (this.focusScore < 80 && timeSinceLastNudge > this.nudgeCooldown) {
            this.lastNudgeTime = now;
            
            let message = '';
            //if (this.gazeDirection === 'unknown') {
               // message = "📷 I can't see your face. Please sit in front of the camera.";
            } if (this.gazeDirection !== 'center') {
                // Specific nudges based on gaze direction
                const directionMap = {
                    'left': 'Look straight at the camera',
                    'right': 'Face the camera directly',
                    'up': 'Keep your head level with the camera',
                    'down': 'Lift your head up'
                };
                message = `${directionMap[this.gazeDirection] || 'Look at the camera'}`;
            } else {
                message = "Stay focused on the interview.";
            }

            if (this.onNudge) {
                this.onNudge(message);
            }
        }
    }

    // ============================================
    // CONTROL FUNCTIONS
    // ============================================

    start() {
        this.isRunning = true;
        this.detectLoop();
    }

    stop() {
        this.isRunning = false;
        if (this.videoElement && this.videoElement.srcObject) {
            const tracks = this.videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        }
        this.videoElement.srcObject = null;
    }

    getStats() {
        return {
            focusScore: this.focusScore,
            gazeDirection: this.gazeDirection,
            lookingAwayCount: this.lookingAwayCount,
            totalFrames: this.totalFrames,
            isFaceDetected: this.faceLandmarks !== null
        };
    }
}