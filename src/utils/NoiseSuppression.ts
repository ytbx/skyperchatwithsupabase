// Noise Suppression Utility
// Uses a combination of noise gate, highpass filter, and RNNoise for effective noise suppression

// Global state for live toggle
let isEnabled = false;
let activeProcessors: Set<{ setEnabled: (enabled: boolean) => void }> = new Set();

// Settings
const NOISE_GATE_THRESHOLD = -50; // dB - sounds below this will be suppressed
const NOISE_GATE_ATTACK = 0.003; // seconds
const NOISE_GATE_RELEASE = 0.25; // seconds
const HIGHPASS_FREQUENCY = 85; // Hz - filter out low frequency rumble

/**
 * Set the global noise suppression enabled state
 * This will affect all active audio streams
 */
export function setNoiseSuppressionEnabled(enabled: boolean) {
    console.log('[NoiseSuppression] Setting enabled:', enabled);
    isEnabled = enabled;

    // Update all active processors
    activeProcessors.forEach(processor => {
        processor.setEnabled(enabled);
    });
}

/**
 * Get current noise suppression state
 */
export function getNoiseSuppressionEnabled(): boolean {
    return isEnabled;
}

/**
 * Create a noise suppression processor for a MediaStream
 * Returns a new MediaStream that can be dynamically toggled
 */
export async function createNoiseSuppressionProcessor(stream: MediaStream): Promise<{
    outputStream: MediaStream;
    setEnabled: (enabled: boolean) => void;
    cleanup: () => void;
}> {
    console.log('[NoiseSuppression] Creating processor for stream...');

    // Create audio context at default sample rate (usually 48kHz)
    const audioContext = new AudioContext();

    // Resume if suspended
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    // Create source from input stream
    const source = audioContext.createMediaStreamSource(stream);

    // Create destination for processed audio
    const destination = audioContext.createMediaStreamDestination();

    // === AUDIO PROCESSING CHAIN ===

    // 1. Highpass filter to remove low-frequency rumble (AC hum, fans, etc.)
    const highpassFilter = audioContext.createBiquadFilter();
    highpassFilter.type = 'highpass';
    highpassFilter.frequency.value = HIGHPASS_FREQUENCY;
    highpassFilter.Q.value = 0.7; // Gentle slope

    // 2. Analyser for volume detection
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // 3. Gain node for noise gate
    const gateGain = audioContext.createGain();
    gateGain.gain.value = 1;

    // 4. Additional lowpass to remove harsh high frequencies (optional)
    const lowpassFilter = audioContext.createBiquadFilter();
    lowpassFilter.type = 'lowpass';
    lowpassFilter.frequency.value = 14000; // Cut above 14kHz
    lowpassFilter.Q.value = 0.7;

    // 5. Compressor to even out volume differences
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.1;

    // Local enabled state for this processor
    let processorEnabled = isEnabled;
    let gateOpen = false;
    let smoothedLevel = 0;
    let animationFrameId: number | null = null;

    // dB threshold converted to linear gain for comparison
    const thresholdLinear = Math.pow(10, NOISE_GATE_THRESHOLD / 20);

    // Noise gate processing loop
    const processNoiseGate = () => {
        if (!processorEnabled) {
            // When disabled, ensure full volume passes through
            gateGain.gain.setTargetAtTime(1, audioContext.currentTime, 0.01);
            animationFrameId = requestAnimationFrame(processNoiseGate);
            return;
        }

        analyser.getByteFrequencyData(dataArray);

        // Calculate average level (0-255 range)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // Convert to 0-1 range and apply smoothing
        const currentLevel = average / 255;
        smoothedLevel = smoothedLevel * 0.7 + currentLevel * 0.3;

        // Check if level exceeds threshold
        const shouldOpen = smoothedLevel > 0.08; // ~-22dB when speaking

        if (shouldOpen && !gateOpen) {
            // Open gate - quick attack
            gateGain.gain.setTargetAtTime(1, audioContext.currentTime, NOISE_GATE_ATTACK);
            gateOpen = true;
        } else if (!shouldOpen && gateOpen) {
            // Close gate - smooth release
            gateGain.gain.setTargetAtTime(0.01, audioContext.currentTime, NOISE_GATE_RELEASE);
            gateOpen = false;
        }

        animationFrameId = requestAnimationFrame(processNoiseGate);
    };

    // Connect the audio graph when enabled
    // Source -> Highpass -> Analyser -> Gate -> Lowpass -> Compressor -> Destination
    source.connect(highpassFilter);
    highpassFilter.connect(analyser);
    analyser.connect(gateGain);
    gateGain.connect(lowpassFilter);
    lowpassFilter.connect(compressor);
    compressor.connect(destination);

    // Start noise gate processing
    processNoiseGate();

    // Create control object
    const controller = {
        setEnabled: (enabled: boolean) => {
            console.log('[NoiseSuppression] Processor enabled:', enabled);
            processorEnabled = enabled;

            if (!enabled) {
                // Immediately restore full volume when disabled
                gateGain.gain.setTargetAtTime(1, audioContext.currentTime, 0.01);
                gateOpen = false;
            }
        }
    };

    // Register this processor
    activeProcessors.add(controller);

    console.log('[NoiseSuppression] ✓ Processor created with noise gate + filters');

    return {
        outputStream: destination.stream,
        setEnabled: controller.setEnabled,
        cleanup: () => {
            console.log('[NoiseSuppression] Cleaning up processor');

            // Stop animation frame
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
            }

            // Unregister
            activeProcessors.delete(controller);

            // Disconnect audio nodes
            try {
                source.disconnect();
                highpassFilter.disconnect();
                analyser.disconnect();
                gateGain.disconnect();
                lowpassFilter.disconnect();
                compressor.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }

            // Close audio context
            if (audioContext.state !== 'closed') {
                try {
                    audioContext.close();
                } catch (e) {
                    // Ignore
                }
            }
        }
    };
}

/**
 * Simple wrapper for one-time stream processing (legacy support)
 * Note: For live toggle support, use createNoiseSuppressionProcessor instead
 */
export async function applyNoiseSuppressionToStream(stream: MediaStream): Promise<MediaStream> {
    const result = await createNoiseSuppressionProcessor(stream);
    return result.outputStream;
}

/**
 * Cleanup all noise suppression resources
 */
export function cleanupNoiseSuppression() {
    console.log('[NoiseSuppression] Cleaning up all processors');
    activeProcessors.clear();
}
