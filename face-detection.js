// ============================================
// FACE PRESENCE MODULE
// Uses MediaPipe Face Mesh for face detection only
// Mobile-optimized
// ============================================

// 🔥 Detect mobile once at the top
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
console.log('📱 Device type:', IS_MOBILE ? 'Mobile' : 'Desktop');

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
        
        // 🔥 Mobile optimization: lower resolution
        this.frameWidth = IS_MOBILE ? 320 : 640;
        this.frameHeight = IS_MOBILE ? 240 : 480;
        
        // 🔥 Mobile optimization: throttle FPS
        this.lastFrameTime = 0;
        this.targetFPS = IS_MOBILE ? 15 : 30; // 15 FPS on mobile, 30 on desktop
        this.frameInterval = 1000 / this.targetFPS;
    }

    async initialize(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        // 🔥 Set canvas to match mobile/desktop resolution
        this.canvasElement.width = this.frameWidth;
        this.canvasElement.height = this.frameHeight;

        this.faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });

        // 🔥 CRITICAL: Disable refineLandmarks on mobile (biggest speed boost)
        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: !IS_MOBILE,  // false on mobile, true on desktop
            minDetectionConfidence: IS_MOBILE ? 0.4 : 0.5,  // Lower on mobile for faster detection
            minTrackingConfidence: IS_MOBILE ? 0.4 : 0.5
        });

        this.faceMesh.onResults((results) => {
            this.handleResults(results);
        });

        try {
            // 🔥 Request lower resolution on mobile
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: this.frameWidth, 
                    height: this.frameHeight, 
                    facingMode: 'user' 
                }
            });

            this.videoElement.srcObject = stream;
            await this.videoElement.play();

            this.isRunning = true;
            this.detectLoop();

            console.log(`✅ Camera initialized at ${this.frameWidth}x${this.frameHeight} @ ${this.targetFPS}fps`);
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize camera:', error);
            return false;
        }
    }

    async detectLoop(timestamp) {
        if (!this.isRunning) return;

        // 🔥 FPS THROTTLE: Skip frames to hit target FPS
        if (timestamp) {
            const elapsed = timestamp - this.lastFrameTime;
            if (elapsed < this.frameInterval) {
                requestAnimationFrame((t) => this.detectLoop(t));
                return;
            }
            this.lastFrameTime = timestamp;
        }

        try {
            // 🔥 Only send to face mesh, don't draw here
            await this.faceMesh.send({ image: this.videoElement });
        } catch (error) {
            this.detectionFailures = (this.detectionFailures || 0) + 1;
            if (this.detectionFailures > 10) {
                console.log('🔄 Resetting face detection...');
                this.detectionFailures = 0;
                this.faceLandmarks = null;
            }
        }

        requestAnimationFrame((t) => this.detectLoop(t));
    }

    handleResults(results) {
        this.totalFrames++;

        // 🔥 Always draw the video frame first (even if no face)
        if (this.ctx && this.videoElement) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            this.ctx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
        }

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            this.faceLandmarks = landmarks;
            this.noFaceFrames = 0;
            this.detectionFailures = 0;
            
            // Face is present — slowly recover focus
            this.lookingAwayCount = Math.max(0, this.lookingAwayCount - 3);

            // 🔥 Draw with mobile-optimized function
            this.drawFaceLandmarks(landmarks);
            this.drawFocusIndicator();
            this.updateFocusScore();

        } else {
            // No face detected — increase penalty
            this.noFaceFrames = (this.noFaceFrames || 0) + 1;
            
            if (this.noFaceFrames > 5) {
                this.faceLandmarks = null;
                this.lookingAwayCount += 2;
                this.updateFocusScore();
                this.checkNudge();
            }
            
            // Still draw focus indicator when no face
            this.drawFocusIndicator();
        }
    }

    // ============================================
    // DRAWING FUNCTIONS — MOBILE OPTIMIZED
    // ============================================

    drawFaceLandmarks(landmarks) {
        if (!this.ctx) return;

        // 🔥 On mobile: skip the 468 dots (huge performance hit)
        // On desktop: draw them (looks cool)
        if (!IS_MOBILE) {
            this.ctx.fillStyle = 'rgba(79, 70, 229, 0.3)';
            for (let i = 0; i < landmarks.length; i += 2) {  // Every 2nd point for speed
                const x = landmarks[i].x * this.canvasElement.width;
                const y = landmarks[i].y * this.canvasElement.height;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        }

        // Draw bounding box (fast on both platforms)
        const xPositions = landmarks.map(p => p.x * this.canvasElement.width);
        const yPositions = landmarks.map(p => p.y * this.canvasElement.height);
        
        const minX = Math.min(...xPositions) - 15;
        const maxX = Math.max(...xPositions) + 15;
        const minY = Math.min(...yPositions) - 15;
        const maxY = Math.max(...yPositions) + 15;

        // Green bounding box — we're only tracking presence
        this.ctx.strokeStyle = '#48bb78';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    }

    drawFocusIndicator() {
        if (!this.ctx) return;

        const width = this.canvasElement.width;
        const height = this.canvasElement.height;

        // 🔥 Smaller indicator on mobile
        const boxWidth = IS_MOBILE ? 130 : 200;
        const boxHeight = IS_MOBILE ? 30 : 40;
        const fontSize = IS_MOBILE ? '12px' : '16px';

        // Focus score background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(width - boxWidth - 10, 10, boxWidth, boxHeight);
        
        // Focus text
        this.ctx.fillStyle = 'white';
        this.ctx.font = `${fontSize} Arial`;
        this.ctx.fillText(
            `Focus: ${this.focusScore}%`, 
            width - boxWidth - 5, 
            boxHeight - 5
        );

        // Color indicator
        let color = '#48bb78';
        if (this.focusScore < 70) color = '#f6ad55';
        if (this.focusScore < 50) color = '#fc8181';

        // Colored circle
        this.ctx.beginPath();
        this.ctx.arc(width - 25, 25, IS_MOBILE ? 8 : 10, 0, 2 * Math.PI);
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

        if (this.lookingAwayCount > 0) {
            const penalty = Math.min(50, this.lookingAwayCount * 2.5);
            score = Math.max(0, score - penalty);
        }

        if (this.faceLandmarks === null && this.noFaceFrames > 5) {
            const penalty = Math.min(60, this.noFaceFrames * 1.5);
            score = Math.max(0, score - penalty);
        }

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

        if (this.focusScore < 65 && this.lookingAwayCount > 10 && timeSinceLastNudge > this.nudgeCooldown) {
            this.lastNudgeTime = now;
            
            let message = "We can't see your face. Please sit in front of the camera.";
            
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
        this.lastFrameTime = 0;
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