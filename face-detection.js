// ============================================
// FACE PRESENCE MODULE
// Uses MediaPipe Face Mesh for face detection only
// ============================================

class FaceDetector {
    constructor() {
        this.isRunning = false;
        this.faceLandmarks = null;
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
    }

    async initialize(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        this.canvasElement.width = 640;
        this.canvasElement.height = 480;

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

            console.log('✅ Camera and Face Mesh initialized (Face Presence only)');
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
            
            // 🔥 Face is present — slowly recover focus
            this.lookingAwayCount = Math.max(0, this.lookingAwayCount - 3);

            // Draw face landmarks
            this.drawFaceLandmarks(landmarks);
            
            // Update focus score
            this.updateFocusScore();
            
            // Draw focus indicator
            this.drawFocusIndicator();

        } else {
            // 🔥 No face detected — increase penalty
            this.noFaceFrames = (this.noFaceFrames || 0) + 1;
            
            if (this.noFaceFrames > 5) {
                this.faceLandmarks = null;
                this.lookingAwayCount += 2;
                this.updateFocusScore();
                this.checkNudge();
            }
        }
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

        // Draw a simple face bounding box
        const xPositions = landmarks.map(p => p.x * this.canvasElement.width);
        const yPositions = landmarks.map(p => p.y * this.canvasElement.height);
        
        const minX = Math.min(...xPositions) - 20;
        const maxX = Math.max(...xPositions) + 20;
        const minY = Math.min(...yPositions) - 20;
        const maxY = Math.max(...yPositions) + 20;

        // 🔥 Always green — we're only tracking presence, not gaze
        this.ctx.strokeStyle = '#48bb78';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        // Draw label
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(minX, minY - 30, 120, 24);
        this.ctx.fillStyle = '#48bb78';
        this.ctx.font = '12px Arial';
        this.ctx.fillText('✅ Face Detected', minX + 8, minY - 12);

        // Draw face status at top-left
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 140, 30);
        this.ctx.fillStyle = '#48bb78';
        this.ctx.font = '14px Arial';
        this.ctx.fillText('✅ Face present', 20, 32);
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

        // 🔥 Penalty based on how long face has been away
        if (this.lookingAwayCount > 0) {
            const penalty = Math.min(50, this.lookingAwayCount * 2.5);
            score = Math.max(0, score - penalty);
        }

        // 🔥 Extra penalty for no face detected
        if (this.faceLandmarks === null && this.noFaceFrames > 5) {
            const penalty = Math.min(60, this.noFaceFrames * 1.5);
            score = Math.max(0, score - penalty);
        }

        // Recovery when face is present
        if (this.faceLandmarks !== null && this.lookingAwayCount < 10) {
            score = Math.min(100, score + 2);
        }

        this.focusScore = Math.round(score);

        if (this.onFocusUpdate) {
            const gazeStatus = this.faceLandmarks !== null ? 'present' : 'away';
            this.onFocusUpdate(this.focusScore, gazeStatus);
        }

        this.checkNudge();
    }

    checkNudge() {
        const now = Date.now();
        const timeSinceLastNudge = now - this.lastNudgeTime;

        // 🔥 Only nudge when face has been away for a while
        if (this.focusScore < 65 && this.lookingAwayCount > 10 && timeSinceLastNudge > this.nudgeCooldown) {
            this.lastNudgeTime = now;
            
            let message = "👤 We can't see your face. Please sit in front of the camera.";
            
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
            lookingAwayCount: this.lookingAwayCount,
            totalFrames: this.totalFrames,
            isFaceDetected: this.faceLandmarks !== null
        };
    }
}