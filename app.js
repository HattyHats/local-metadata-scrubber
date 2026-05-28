document.addEventListener('DOMContentLoaded', () => {
    // --- UI Logic: Tabs ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- Image Scrubber Logic ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const threatDashboard = document.getElementById('threat-dashboard');
    const threatList = document.getElementById('threat-list');
    const miniPreviewImg = document.getElementById('mini-preview-img');
    const neutralizeBtn = document.getElementById('neutralize-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const autoCensorToggle = document.getElementById('auto-censor-toggle');
    
    const canvas = document.getElementById('image-canvas');
    const ctx = canvas.getContext('2d');
    const downloadBtn = document.getElementById('download-btn');
    const resetImgBtn = document.getElementById('reset-img-btn');
    const imgStats = document.getElementById('img-stats');

    let processedImageDataUrl = null;
    let originalFilename = '';
    let pendingImage = null;
    
    // Load face-api models
    Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models')
    ]).then(() => {
        console.log('Face API models loaded');
    }).catch(err => console.error('Failed to load Face API models', err));

    // Drag and Drop Events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            handleFile(files[0]);
        }
    }

    async function handleFile(file) {
        if (!file.type.match('image.*')) {
            alert('Please upload an image file (JPEG, PNG, WEBP).');
            return;
        }

        originalFilename = file.name;
        
        // Extract EXIF data using exifr
        let exifData = null;
        try {
            exifData = await exifr.parse(file, { gps: true, tiff: true, exif: true });
        } catch (err) {
            console.error('No EXIF found or failed to parse', err);
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                pendingImage = img;
                miniPreviewImg.src = e.target.result;
                showThreatDashboard(exifData);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function showThreatDashboard(exif) {
        dropZone.classList.add('hidden');
        threatDashboard.classList.remove('hidden');
        
        threatList.innerHTML = '';
        
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
            if (exif.DateTimeOriginal) {
                addThreatItem('Capture Date', new Date(exif.DateTimeOriginal).toLocaleString());
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

    cancelBtn.addEventListener('click', resetAll);
    resetImgBtn.addEventListener('click', resetAll);

    function resetAll() {
        previewContainer.classList.add('hidden');
        threatDashboard.classList.add('hidden');
        dropZone.classList.remove('hidden');
        fileInput.value = '';
        processedImageDataUrl = null;
        pendingImage = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    neutralizeBtn.addEventListener('click', async () => {
        if (!pendingImage) return;
        
        threatDashboard.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        
        await processImage(pendingImage);
    });

    async function processImage(img) {
        const startTime = performance.now();
        
        // Set canvas dimensions to image dimensions
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Drawing onto canvas strips EXIF automatically
        ctx.drawImage(img, 0, 0);

        // Cyberpunk Face Censorship
        let facesCensored = 0;
        if (autoCensorToggle.checked && typeof faceapi !== 'undefined') {
            const detections = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions());
            facesCensored = detections.length;
            
            detections.forEach(det => {
                const box = det.box;
                // Draw Cyberpunk Neon Bar over eyes
                const barHeight = box.height * 0.3;
                const barY = box.y + (box.height * 0.25); // Position around eyes
                
                // Black base
                ctx.fillStyle = '#000000';
                ctx.fillRect(box.x, barY, box.width, barHeight);
                
                // Neon glow line
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(box.x, barY + (barHeight / 2));
                ctx.lineTo(box.x + box.width, barY + (barHeight / 2));
                ctx.stroke();
                
                // Shadow/Glow effect
                ctx.shadowColor = '#00ff88';
                ctx.shadowBlur = 15;
                ctx.stroke();
                ctx.shadowBlur = 0; // reset
            });
        }

        // Perturb pixels (Canvas Camouflage)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let modifiedPixels = 0;

        for (let i = 0; i < data.length; i += 4) {
            // Skip pure black pixels to avoid perturbing the censorship bars
            if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 0) continue;
            
            if (Math.random() < 0.3) {
                // Modify RGB by -1, 0, or 1
                data[i] = clamp(data[i] + (Math.floor(Math.random() * 3) - 1));     // R
                data[i+1] = clamp(data[i+1] + (Math.floor(Math.random() * 3) - 1)); // G
                data[i+2] = clamp(data[i+2] + (Math.floor(Math.random() * 3) - 1)); // B
                modifiedPixels++;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        
        // Use PNG to preserve exact pixel values (lossless)
        processedImageDataUrl = canvas.toDataURL('image/png');

        const endTime = performance.now();
        const processingTime = (endTime - startTime).toFixed(2);

        // Update UI
        let censorStats = facesCensored > 0 ? `<br> > ${facesCensored} FACES CENSORED` : '';
        imgStats.innerHTML = `> METADATA STRIPPED ${censorStats} <br> > ${modifiedPixels.toLocaleString()} PIXELS PERTURBED <br> > PROCESSED IN ${processingTime}ms`;
    }

    function clamp(val) {
        return Math.min(255, Math.max(0, val));
    }

    downloadBtn.addEventListener('click', () => {
        if (!processedImageDataUrl) return;
        
        const a = document.createElement('a');
        a.href = processedImageDataUrl;
        // Append _ghost to original filename, change extension to png
        const nameWithoutExt = originalFilename.substring(0, originalFilename.lastIndexOf('.')) || originalFilename;
        a.download = `${nameWithoutExt}_ghost.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // --- Text Scrubber Logic ---
    const textInput = document.getElementById('text-input');
    const scrubTextBtn = document.getElementById('scrub-text-btn');
    const textOutputContainer = document.getElementById('text-output-container');
    const textOutput = document.getElementById('text-output');
    const copyTextBtn = document.getElementById('copy-text-btn');
    const textStats = document.getElementById('text-stats');

    // Array of zero-width / invisible characters
    const invisibleChars = [
        '\u200B', // Zero-width space
        '\u200C', // Zero-width non-joiner
        '\u200D', // Zero-width joiner
        '\uFEFF'  // Zero-width no-break space
    ];

    scrubTextBtn.addEventListener('click', () => {
        const input = textInput.value;
        if (!input) return;

        const startTime = performance.now();
        let output = '';
        let injections = 0;

        // Iterate through each character and randomly inject invisible chars
        for (let i = 0; i < input.length; i++) {
            output += input[i];
            
            // 40% chance to inject an invisible character after each visible one
            if (Math.random() < 0.4) {
                const randomChar = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
                output += randomChar;
                injections++;
            }
        }

        const endTime = performance.now();
        const processingTime = (endTime - startTime).toFixed(2);

        textOutput.value = output;
        textOutputContainer.classList.remove('hidden');
        textStats.innerHTML = `> ${injections} GHOST CHARS INJECTED (${processingTime}ms)`;
    });

    copyTextBtn.addEventListener('click', async () => {
        if (!textOutput.value) return;
        
        try {
            await navigator.clipboard.writeText(textOutput.value);
            const originalText = copyTextBtn.innerHTML;
            copyTextBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                COPIED!
            `;
            setTimeout(() => {
                copyTextBtn.innerHTML = originalText;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy text to clipboard.');
        }
    });
    // --- Splash Screen Logic ---
    const splashScreen = document.getElementById('splash-screen');
    const enterBtn = document.getElementById('enter-btn');
    
    if (enterBtn && splashScreen) {
        enterBtn.addEventListener('click', () => {
            splashScreen.classList.add('fade-out');
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 800); // Matches CSS transition duration
        });
    }

    // --- Matrix Background Effect ---
    const matrixCanvas = document.getElementById('matrix-canvas');
    if (matrixCanvas) {
        const mCtx = matrixCanvas.getContext('2d');
        
        matrixCanvas.width = window.innerWidth;
        matrixCanvas.height = window.innerHeight;
        
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+{}|[]<>?'.split('');
        const fontSize = 14;
        const rows = Math.ceil(matrixCanvas.height / fontSize);
        const streams = [];
        
        // Start streams at random horizontal positions so the screen is immediately full
        for (let y = 0; y < rows; y++) {
            streams[y] = Math.random() * (matrixCanvas.width / fontSize);
        }
        
        function drawMatrix() {
            mCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            mCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
            
            mCtx.fillStyle = '#00ff88'; // var(--neon-green)
            mCtx.font = fontSize + 'px monospace';
            
            for (let i = 0; i < streams.length; i++) {
                const text = chars[Math.floor(Math.random() * chars.length)];
                // Draw text: x = stream progress, y = row index
                mCtx.fillText(text, streams[i] * fontSize, i * fontSize);
                
                if (streams[i] * fontSize > matrixCanvas.width && Math.random() > 0.975) {
                    streams[i] = 0;
                }
                streams[i]++;
            }
        }
        
        setInterval(drawMatrix, 33);
        
        window.addEventListener('resize', () => {
            matrixCanvas.width = window.innerWidth;
            matrixCanvas.height = window.innerHeight;
        });
    }
});
