document.addEventListener('DOMContentLoaded', () => {
    // --- UI Logic: Tabs ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    // --- Splash Screen Logic ---
    const splashScreen = document.getElementById('splash-screen');
    
    if (splashScreen) {
        setTimeout(() => {
            splashScreen.classList.add('fade-out');
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 800); 
        }, 5000);
    }

    // --- Load Face API Models ---
    Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('./models')
    ]).then(() => {
        console.log('Face API models loaded');
    }).catch(err => console.error('Failed to load Face API models', err));

    // ==========================================
    // 1. IMAGE SCRUBBER (Batch + Stego)
    // ==========================================
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const threatDashboard = document.getElementById('threat-dashboard');
    const threatList = document.getElementById('threat-list');
    const miniPreviewImg = document.getElementById('mini-preview-img');
    const neutralizeBtn = document.getElementById('neutralize-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const autoCensorToggle = document.getElementById('auto-censor-toggle');
    const watermarkInput = document.getElementById('watermark-input');
    
    const canvas = document.getElementById('image-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const downloadBtn = document.getElementById('download-btn');
    const resetImgBtn = document.getElementById('reset-img-btn');
    const imgStats = document.getElementById('img-stats');

    let processedBlobs = []; // [{ name: 'file1.png', blob: Blob }]
    let pendingFiles = [];
    
    // Watermark Extraction
    const extractDropZone = document.getElementById('extract-drop-zone');
    const extractFileInput = document.getElementById('extract-file-input');
    const extractedDisplay = document.getElementById('extracted-watermark-display');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        extractDropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.classList.add('dragover');
        extractDropZone.classList.add('dragover');
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.classList.remove('dragover');
        extractDropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.match('image.*'));
        if(files.length > 0) handleFiles(files);
    });
    
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(f => f.type.match('image.*'));
        if(files.length > 0) handleFiles(files);
    });

    extractDropZone.addEventListener('drop', (e) => {
        if(e.dataTransfer.files.length > 0) handleExtract(e.dataTransfer.files[0]);
    });
    
    extractFileInput.addEventListener('change', (e) => {
        if(e.target.files.length > 0) handleExtract(e.target.files[0]);
    });

    // Make the sub-dropzone click to upload work too
    extractDropZone.addEventListener('click', () => extractFileInput.click());
    dropZone.addEventListener('click', () => fileInput.click());

    async function handleFiles(files) {
        pendingFiles = files;
        
        // Show threat dashboard for the first file only for simplicity
        let exifData = null;
        try {
            if (typeof exifr !== 'undefined') {
                exifData = await exifr.parse(files[0], { gps: true, tiff: true, exif: true });
            }
        } catch (err) {}

        const reader = new FileReader();
        reader.onload = (e) => {
            miniPreviewImg.src = e.target.result;
            showThreatDashboard(exifData, files.length);
        };
        reader.readAsDataURL(files[0]);
    }

    function showThreatDashboard(exif, count) {
        dropZone.classList.add('hidden');
        threatDashboard.classList.remove('hidden');
        threatList.innerHTML = '';
        
        if (count > 1) {
            addThreatItem('Batch Mode', `Processing ${count} images.`);
        }
        
        let threatsFound = 0;
        if (exif) {
            if (exif.latitude && exif.longitude) {
                addThreatItem('GPS Coordinates', `${exif.latitude.toFixed(6)}, ${exif.longitude.toFixed(6)}`);
                threatsFound++;
            }
            if (exif.Make || exif.Model) {
                addThreatItem('Device Profile', `${exif.Make || 'Unknown Make'} ${exif.Model || ''}`);
                threatsFound++;
            }
        }
        
        if (threatsFound === 0) {
            addThreatItem('Metadata Status', 'No significant EXIF data found. Safe to proceed with pixel perturbation.');
        }
    }

    function addThreatItem(label, value) {
        const li = document.createElement('li');
        li.className = 'threat-item';
        li.innerHTML = `<span class="threat-label">${label}</span><span class="threat-value">${value}</span>`;
        threatList.appendChild(li);
    }

    resetImgBtn.addEventListener('click', resetAll);
    cancelBtn.addEventListener('click', resetAll);

    function resetAll() {
        previewContainer.classList.add('hidden');
        threatDashboard.classList.add('hidden');
        dropZone.classList.remove('hidden');
        fileInput.value = '';
        processedBlobs = [];
        pendingFiles = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        downloadBtn.innerHTML = 'DOWNLOAD SCRUBBED IMAGE';
    }

    neutralizeBtn.addEventListener('click', () => {
        if (pendingFiles.length === 0) return;
        
        const originalText = neutralizeBtn.innerHTML;
        neutralizeBtn.innerHTML = '<span class="spinner-small"></span> NEUTRALIZING...';
        neutralizeBtn.disabled = true;
        cancelBtn.disabled = true;
        
        setTimeout(async () => {
            threatDashboard.classList.add('hidden');
            previewContainer.classList.remove('hidden');
            
            imgStats.innerHTML = `<span class="spinner-small"></span> Processing ${pendingFiles.length} file(s)...`;
            
            processedBlobs = [];
            for (let i = 0; i < pendingFiles.length; i++) {
                await processImage(pendingFiles[i]);
            }
            
            imgStats.innerHTML = `> ${pendingFiles.length} IMAGES SECURED <br> > READY FOR DOWNLOAD`;
            
            if (pendingFiles.length > 1) {
                downloadBtn.innerHTML = 'DOWNLOAD SECURE BATCH (.ZIP)';
            }
            
            neutralizeBtn.innerHTML = originalText;
            neutralizeBtn.disabled = false;
            cancelBtn.disabled = false;
        }, 50);
    });

    async function processImage(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = async () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                if (autoCensorToggle.checked && typeof faceapi !== 'undefined' && faceapi.nets.tinyFaceDetector.isLoaded) {
                    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 800, scoreThreshold: 0.3 });
                    const detections = await faceapi.detectAllFaces(canvas, options);
                    
                    detections.forEach(det => {
                        const box = det.box;
                        const barHeight = box.height * 0.3;
                        const barY = box.y + (box.height * 0.25);
                        
                        ctx.fillStyle = '#000000';
                        ctx.fillRect(box.x, barY, box.width, barHeight);
                        ctx.strokeStyle = '#00ff88';
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.moveTo(box.x, barY + (barHeight / 2));
                        ctx.lineTo(box.x + box.width, barY + (barHeight / 2));
                        ctx.stroke();
                        ctx.shadowColor = '#00ff88';
                        ctx.shadowBlur = 15;
                        ctx.stroke();
                        ctx.shadowBlur = 0;
                    });
                }

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // Canvas Camouflage (Noise)
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 0) continue;
                    if (Math.random() < 0.3) {
                        data[i] = clamp(data[i] + (Math.floor(Math.random() * 3) - 1));
                        data[i+1] = clamp(data[i+1] + (Math.floor(Math.random() * 3) - 1));
                        data[i+2] = clamp(data[i+2] + (Math.floor(Math.random() * 3) - 1));
                    }
                }
                
                // Steganography Injection
                const watermark = watermarkInput.value.trim();
                if (watermark) {
                    encodeSteganography(data, watermark);
                }

                ctx.putImageData(imageData, 0, 0);
                
                canvas.toBlob((blob) => {
                    let newName = file.name.replace(/\.[^/.]+$/, "") + "_ghost.png";
                    processedBlobs.push({ name: newName, blob: blob });
                    resolve();
                }, 'image/png');
            };
            
            const reader = new FileReader();
            reader.onload = (e) => img.src = e.target.result;
            reader.readAsDataURL(file);
        });
    }

    function clamp(val) { return Math.min(255, Math.max(0, val)); }

    downloadBtn.addEventListener('click', async () => {
        if (processedBlobs.length === 0) return;
        
        if (processedBlobs.length === 1) {
            const url = URL.createObjectURL(processedBlobs[0].blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = processedBlobs[0].name;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            if (typeof JSZip === 'undefined') {
                alert("JSZip failed to load, cannot create archive.");
                return;
            }
            const zip = new JSZip();
            processedBlobs.forEach(file => {
                zip.file(file.name, file.blob);
            });
            const content = await zip.generateAsync({type:"blob"});
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = "ghost_protocol_batch.zip";
            a.click();
            URL.revokeObjectURL(url);
        }
    });

    // Steganography Logic
    function encodeSteganography(data, text) {
        const textWithTerminator = text + "\0";
        let bitIndex = 0;
        let charIndex = 0;
        
        for (let i = 0; i < data.length; i++) {
            if ((i + 1) % 4 === 0) continue; // Skip alpha channel
            
            if (charIndex >= textWithTerminator.length) break;
            
            let charValue = textWithTerminator.charCodeAt(charIndex);
            let bit = (charValue >> (7 - bitIndex)) & 1;
            
            data[i] = (data[i] & ~1) | bit; // set LSB
            
            bitIndex++;
            if (bitIndex === 8) {
                bitIndex = 0;
                charIndex++;
            }
        }
    }

    function handleExtract(file) {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0);
                const data = tempCtx.getImageData(0, 0, img.width, img.height).data;
                
                let extractedText = "";
                let currentChar = 0;
                let bitIndex = 0;
                
                for (let i = 0; i < data.length; i++) {
                    if ((i + 1) % 4 === 0) continue; // Skip alpha
                    
                    let bit = data[i] & 1;
                    currentChar = (currentChar << 1) | bit;
                    bitIndex++;
                    
                    if (bitIndex === 8) {
                        if (currentChar === 0) break; // Null terminator
                        extractedText += String.fromCharCode(currentChar);
                        currentChar = 0;
                        bitIndex = 0;
                        
                        // Failsafe limit
                        if (extractedText.length > 500) break;
                    }
                }
                
                extractedDisplay.classList.remove('hidden');
                if (extractedText && extractedText.length > 0 && extractedText.length < 500 && /^[\x20-\x7E]*$/.test(extractedText)) {
                    extractedDisplay.innerHTML = `<strong>Watermark Found:</strong><br>${extractedText}`;
                } else {
                    extractedDisplay.innerHTML = `<span style="color:var(--danger)">No valid watermark found.</span>`;
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ==========================================
    // 2. TEXT CAMOUFLAGE (Scramble + Crypto)
    // ==========================================
    const textModeToggle = document.getElementById('text-mode-toggle');
    const textModeLabel = document.getElementById('text-mode-label');
    const passwordContainer = document.getElementById('password-container');
    const cryptoPassword = document.getElementById('crypto-password');
    const scrubTextBtn = document.getElementById('scrub-text-btn');
    const decryptTextBtn = document.getElementById('decrypt-text-btn');
    const textInput = document.getElementById('text-input');
    const textOutputContainer = document.getElementById('text-output-container');
    const textOutput = document.getElementById('text-output');
    const copyTextBtn = document.getElementById('copy-text-btn');
    const textStats = document.getElementById('text-stats');

    textModeToggle.addEventListener('change', () => {
        if (textModeToggle.checked) {
            textModeLabel.innerHTML = 'Mode: Deep Encrypt';
            passwordContainer.classList.remove('hidden');
            decryptTextBtn.classList.remove('hidden');
            scrubTextBtn.innerHTML = 'ENCRYPT TEXT';
        } else {
            textModeLabel.innerHTML = 'Mode: Ghost Scramble';
            passwordContainer.classList.add('hidden');
            decryptTextBtn.classList.add('hidden');
            scrubTextBtn.innerHTML = 'PROCESS TEXT';
        }
    });

    scrubTextBtn.addEventListener('click', async () => {
        const input = textInput.value;
        if (!input) return;

        if (textModeToggle.checked) {
            // Encrypt Mode
            const pwd = cryptoPassword.value;
            if (!pwd) return alert("Password required for Deep Encrypt.");
            try {
                const encryptedStr = await encryptText(input, pwd);
                textOutput.value = `-----BEGIN GHOST PROTOCOL-----\n${encryptedStr}\n-----END GHOST PROTOCOL-----`;
                textStats.innerHTML = "> AES-GCM ENCRYPTED";
            } catch (e) {
                alert("Encryption failed.");
            }
        } else {
            // Scramble Mode
            const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
            let output = '';
            let injectedCount = 0;

            for (let i = 0; i < input.length; i++) {
                output += input[i];
                if (Math.random() < 0.4 && input[i] !== ' ' && input[i] !== '\n') {
                    output += zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
                    injectedCount++;
                }
            }
            textOutput.value = output;
            textStats.innerHTML = `> ${injectedCount} INVISIBLE CHARACTERS INJECTED`;
        }

        textOutputContainer.classList.remove('hidden');
    });

    decryptTextBtn.addEventListener('click', async () => {
        const input = textInput.value;
        const pwd = cryptoPassword.value;
        if (!pwd) return alert("Password required for Decrypt.");
        
        const match = input.match(/-----BEGIN GHOST PROTOCOL-----\n([\s\S]*?)\n-----END GHOST PROTOCOL-----/);
        if (!match) return alert("Invalid Ghost Protocol block format.");
        
        try {
            const decrypted = await decryptText(match[1], pwd);
            textOutput.value = decrypted;
            textStats.innerHTML = "> SUCCESSFUL DECRYPTION";
            textOutputContainer.classList.remove('hidden');
        } catch (err) {
            alert("Decryption failed. Incorrect password or corrupted data.");
        }
    });

    copyTextBtn.addEventListener('click', () => {
        textOutput.select();
        document.execCommand('copy');
        
        const originalHTML = copyTextBtn.innerHTML;
        copyTextBtn.innerHTML = 'COPIED!';
        setTimeout(() => copyTextBtn.innerHTML = originalHTML, 2000);
    });

    // Web Crypto Helpers
    async function getCryptoKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), {name: "PBKDF2"}, false, ["deriveBits", "deriveKey"]
        );
        return await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
        );
    }

    async function encryptText(text, password) {
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await getCryptoKey(password, salt);
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, key, enc.encode(text)
        );
        
        const payload = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
        payload.set(salt, 0);
        payload.set(iv, salt.length);
        payload.set(new Uint8Array(ciphertext), salt.length + iv.length);
        
        // Convert to base64
        let binary = '';
        for (let i = 0; i < payload.byteLength; i++) {
            binary += String.fromCharCode(payload[i]);
        }
        return btoa(binary);
    }

    async function decryptText(base64Str, password) {
        const raw = atob(base64Str.trim());
        const payload = new Uint8Array(raw.length);
        for(let i = 0; i < raw.length; i++) payload[i] = raw.charCodeAt(i);
        
        const salt = payload.slice(0, 16);
        const iv = payload.slice(16, 28);
        const ciphertext = payload.slice(28);
        
        const key = await getCryptoKey(password, salt);
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv }, key, ciphertext
        );
        
        const dec = new TextDecoder();
        return dec.decode(decrypted);
    }

    // ==========================================
    // 3. AUDIO SCRUBBER (Voice Anonymizer)
    // ==========================================
    const audioDropZone = document.getElementById('audio-drop-zone');
    const audioFileInput = document.getElementById('audio-file-input');
    const audioPreviewContainer = document.getElementById('audio-preview-container');
    const audioElement = document.getElementById('audio-element');
    const downloadAudioBtn = document.getElementById('download-audio-btn');
    const resetAudioBtn = document.getElementById('reset-audio-btn');
    const audioStats = document.getElementById('audio-stats');

    let processedAudioBlobUrl = null;

    if(audioDropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            audioDropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            audioDropZone.classList.add('dragover');
        });

        ['dragleave', 'drop'].forEach(eventName => {
            audioDropZone.classList.remove('dragover');
        });

        audioDropZone.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.match('audio.*') || f.type.match('video.*'));
            if(files.length > 0) processAudio(files[0]);
        });
        
        audioDropZone.addEventListener('click', () => audioFileInput.click());
        
        audioFileInput.addEventListener('change', (e) => {
            if(e.target.files.length > 0) processAudio(e.target.files[0]);
        });
    }

    async function processAudio(file) {
        audioDropZone.classList.add('hidden');
        audioPreviewContainer.classList.remove('hidden');
        audioStats.innerHTML = `<span class="spinner-small"></span> Anonymizing Voice...`;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
            
            // Offline rendering
            const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            
            // 1. Pitch bend (lower slightly for anonymity)
            source.playbackRate.value = 0.85;

            // 2. WaveShaper Distortion (Cyberpunk effect)
            const distortion = offlineCtx.createWaveShaper();
            distortion.curve = makeDistortionCurve(10);
            distortion.oversample = '4x';
            
            // 3. White Noise Injection
            const noise = offlineCtx.createBufferSource();
            const noiseBuffer = offlineCtx.createBuffer(1, audioBuffer.length, offlineCtx.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) {
                noiseData[i] = Math.random() * 2 - 1;
            }
            noise.buffer = noiseBuffer;
            noise.loop = true;
            
            const noiseGain = offlineCtx.createGain();
            noiseGain.gain.value = 0.05; // Subtle background noise

            // Routing
            source.connect(distortion);
            distortion.connect(offlineCtx.destination);
            noise.connect(noiseGain);
            noiseGain.connect(offlineCtx.destination);
            
            source.start(0);
            noise.start(0);

            const renderedBuffer = await offlineCtx.startRendering();
            const wavBlob = audioBufferToWav(renderedBuffer);
            
            processedAudioBlobUrl = URL.createObjectURL(wavBlob);
            audioElement.src = processedAudioBlobUrl;
            
            audioStats.innerHTML = `> PITCH SHIFTED <br> > NOISE INJECTED <br> > READY TO DOWNLOAD`;
        } catch (err) {
            console.error(err);
            audioStats.innerHTML = `<span style="color:var(--danger)">Error processing audio.</span>`;
        }
    }

    function makeDistortionCurve(amount) {
        let k = typeof amount === 'number' ? amount : 50;
        let n_samples = 44100;
        let curve = new Float32Array(n_samples);
        let deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
            let x = i * 2 / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    if(resetAudioBtn) {
        resetAudioBtn.addEventListener('click', () => {
            audioDropZone.classList.remove('hidden');
            audioPreviewContainer.classList.add('hidden');
            audioFileInput.value = '';
            if (processedAudioBlobUrl) {
                URL.revokeObjectURL(processedAudioBlobUrl);
                processedAudioBlobUrl = null;
            }
            audioElement.src = "";
        });
    }

    if(downloadAudioBtn) {
        downloadAudioBtn.addEventListener('click', () => {
            if (!processedAudioBlobUrl) return;
            const a = document.createElement('a');
            a.href = processedAudioBlobUrl;
            a.download = "ghost_protocol_audio.wav";
            a.click();
        });
    }

    // WAV Encoder
    function audioBufferToWav(buffer) {
        let numOfChan = buffer.numberOfChannels,
            length = buffer.length * numOfChan * 2 + 44,
            bufferArray = new ArrayBuffer(length),
            view = new DataView(bufferArray),
            channels = [], i, sample, offset = 0, pos = 0;

        // write WAV header
        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"
        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16); // length = 16
        setUint16(1); // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2); // block-align
        setUint16(16); // 16-bit
        setUint32(0x61746164); // "data" - chunk
        setUint32(length - pos - 4); // chunk length

        for(i = 0; i < buffer.numberOfChannels; i++)
            channels.push(buffer.getChannelData(i));

        while(pos < length) {
            for(i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
                view.setInt16(pos, sample, true); 
                pos += 2;
            }
            offset++;
        }
        return new Blob([bufferArray], {type: "audio/wav"});

        function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
        function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
    }
});
