// Socket.io connection
const socket = io();

// DOM elements
const taskInput = document.getElementById('taskInput');
const urlInput = document.getElementById('urlInput');
const fileInput = document.getElementById('fileInput');
const fileUploadArea = document.getElementById('fileUploadArea');
const uploadedFiles = document.getElementById('uploadedFiles');
const startBtn = document.getElementById('startBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const stopBtn = document.getElementById('stopBtn');
const executeBtn = null; // Removed - analysis panel no longer exists
const refreshBtn = document.getElementById('refreshBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const clearLogsBtn = null; // Removed - no longer needed
const browserView = document.getElementById('browserView');
const generatedScript = null; // Removed - analysis panel no longer exists
const imageAnalysis = null; // Removed - analysis panel no longer exists
const activityLog = null; // Removed - now using chat for activity logs
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const loadingOverlay = document.getElementById('loadingOverlay');

// New Dyna chat elements
const chatInput = document.getElementById('chatInput');
const sendMessage = document.getElementById('sendMessage');
const chatMessages = document.getElementById('chatMessages');
const minimizeChat = document.getElementById('minimizeChat');
const fileUploadModal = document.getElementById('fileUploadModal');
const closeModal = document.getElementById('closeModal');

// State
let isAutomationRunning = false;
let currentScript = '';
let uploadedFilesList = [];
let chatMinimized = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    updateConnectionStatus(false);
    addChatMessage('Hello! I\'m Dyna, your AI browser automation assistant. I can help you automate web tasks, take screenshots, and analyze web content. What would you like to automate today?', 'ai');
    addActivityMessage('Dyna AI Browser Agent initialized. Ready to automate!', 'info');
});

// Socket events
socket.on('connect', () => {
    updateConnectionStatus(true);
    addLogEntry('Connected to Dyna AI Browser Agent', 'success');
    addChatMessage('Great! I\'m connected and ready to help. You can start by describing a task you\'d like me to automate.', 'ai');
});

socket.on('disconnect', () => {
    updateConnectionStatus(false);
    addLogEntry('Disconnected from server', 'warning');
    addChatMessage('Connection lost. I\'ll try to reconnect automatically.', 'ai');
});

socket.on('screenshot', (screenshotData) => {
    displayScreenshot(screenshotData);
    hideLoading();
    addChatMessage('Screenshot captured! I can see the current page now. How would you like me to proceed?', 'ai');
});

socket.on('scriptGenerated', (data) => {
    addActivityMessage('Automation script generated successfully', 'success');
    addChatMessage('I\'ve generated an automation script based on your request. The script is ready to be executed.', 'ai');
    hideLoading();
});

socket.on('imageAnalysis', (data) => {
    addActivityMessage('AI vision analysis completed', 'info');
    addChatMessage(`Here's what I can see on the page: ${data.analysis}`, 'ai');
});

socket.on('executionResult', (result) => {
    if (result.success) {
        addLogEntry(`Execution completed: ${result.message}`, 'success');
        addChatMessage(`Task completed successfully! ${result.message}`, 'ai');
    } else {
        addLogEntry(`Execution failed: ${result.error}`, 'error');
        addChatMessage(`Sorry, I encountered an error: ${result.error}. Let me know if you'd like me to try a different approach.`, 'ai');
    }
    hideLoading();
});

socket.on('sessionInfo', (data) => {
    addLogEntry(`BrowserBase session created: ${data.sessionId}`, 'info');
    addLogEntry(`View replay at: ${data.replayUrl}`, 'info');
    
    // Add session info to UI
    const sessionInfo = document.createElement('div');
    sessionInfo.className = 'session-info fade-in';
    sessionInfo.innerHTML = `
        <div class="session-details">
            <h4><i class="fas fa-cloud"></i> BrowserBase Session</h4>
            <p><strong>Session ID:</strong> ${data.sessionId}</p>
            <a href="${data.replayUrl}" target="_blank" class="btn btn-sm btn-secondary">
                <i class="fas fa-external-link-alt"></i> View Replay
            </a>
        </div>
    `;
    
    // Add to browser view
    const browserContainer = document.querySelector('.browser-container');
    const existingSessionInfo = browserContainer.querySelector('.session-info');
    if (existingSessionInfo) {
        existingSessionInfo.remove();
    }
    browserContainer.insertBefore(sessionInfo, browserContainer.firstChild);
    
    addChatMessage('Browser session started! I can now navigate and interact with web pages for you.', 'ai');
});

socket.on('error', (data) => {
    addLogEntry(`Error: ${data.message}`, 'error');
    addChatMessage(`I encountered an error: ${data.message}. Please let me know if you'd like me to try again.`, 'ai');
    hideLoading();
    isAutomationRunning = false;
    updateButtons();
});

// Enhanced BrowserAgent event handlers
socket.on('automationResult', (data) => {
    hideLoading();
    isAutomationRunning = false;
    updateButtons();
    
    const { analysis, actions, pageData } = data;
    
    let message = `I've completed the automation task! Here's what I found:\n\n**Page Analysis:**\n${analysis}`;
    
    if (actions && actions.length > 0) {
        message += `\n\n**Actions Performed:** ${actions.length} actions executed`;
        actions.forEach((action, index) => {
            message += `\n${index + 1}. ${action.type} - ${action.reason || 'Action completed'}`;
        });
    }
    
    addChatMessage(message, 'ai');
    
    if (pageData) {
        addActivityMessage(`Processed page: ${pageData.title} (${pageData.url})`, 'success');
    }
});

socket.on('actionResult', (data) => {
    addActivityMessage(`Action ${data.actionType} completed successfully`, 'success');
});

socket.on('analysisResult', (data) => {
    const { analysis, pageData, actions } = data;
    
    let message = `**Page Analysis Results:**\n\n${analysis}`;
    
    if (actions && actions.length > 0) {
        message += `\n\n**Suggested Actions:**`;
        actions.forEach((action, index) => {
            message += `\n${index + 1}. ${action.type} on "${action.target}" - ${action.reason}`;
        });
    }
    
    addChatMessage(message, 'ai');
    
    if (pageData) {
        addActivityMessage(`Analyzed page: ${pageData.title}`, 'info');
    }
});

socket.on('activityUpdate', (data) => {
    const { type, message } = data;
    addActivityMessage(message, type);
});

// Event listeners
function initializeEventListeners() {
    // Start automation button
    startBtn?.addEventListener('click', startAutomation);
    
    // Screenshot button
    screenshotBtn?.addEventListener('click', takeScreenshot);
    
    // Stop button
    stopBtn?.addEventListener('click', stopAutomation);
    
    // Refresh button
    refreshBtn?.addEventListener('click', refreshBrowserView);
    
    // Fullscreen button
    fullscreenBtn?.addEventListener('click', toggleFullscreen);
    
    // Chat input
    chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
    
    // Send message button
    sendMessage?.addEventListener('click', sendChatMessage);
    
    // Minimize chat button
    minimizeChat?.addEventListener('click', toggleChatMinimize);
    
    // File upload modal
    fileUploadArea?.addEventListener('click', () => {
        fileUploadModal?.classList.add('active');
    });
    
    closeModal?.addEventListener('click', () => {
        fileUploadModal?.classList.remove('active');
    });
    
    // File input
    fileInput?.addEventListener('change', handleFileUpload);
    
    // Quick action buttons (will be added dynamically)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('quick-action-btn')) {
            const action = e.target.textContent.trim();
            handleQuickAction(action);
        }
    });
}

// Chat functions
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    addChatMessage(message, 'user');
    chatInput.value = '';
    
    // Process the message as a command or automation task
    processUserMessage(message);
}

function processUserMessage(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check for quick commands
    if (lowerMessage.includes('screenshot') || lowerMessage.includes('capture')) {
        takeScreenshot();
        return;
    }
    
    if (lowerMessage.includes('analyze') && lowerMessage.includes('page')) {
        analyzeCurrentPage(message);
        return;
    }
    
    // Default to automation task
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : '';
    
    startAutomationWithTask(message, url);
}

function analyzeCurrentPage(instruction) {
    showLoading('Analyzing current page...');
    addActivityMessage('Starting page analysis with AI', 'info');
    
    socket.emit('analyzePage', {
        instruction: instruction,
        options: {
            includeScreenshot: true,
            includeDom: true,
            executeActions: false
        }
    });
}

function addChatMessage(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}-message`;
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-text">${formatMessage(message)}</div>
            <div class="message-time">${timestamp}</div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Add typewriter effect for AI messages
    if (sender === 'ai') {
        typeWriterEffect(messageDiv.querySelector('.message-text'), message);
    }
}

function formatMessage(message) {
    // Convert markdown-style formatting
    return message
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function typeWriterEffect(element, text) {
    element.innerHTML = '';
    let i = 0;
    const formattedText = formatMessage(text);
    
    function type() {
        if (i < formattedText.length) {
            element.innerHTML += formattedText.charAt(i);
            i++;
            setTimeout(type, 10);
        }
    }
    
    type();
}

// Activity message function
function addActivityMessage(message, type = 'info') {
    const colors = {
        info: '#3b82f6',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444'
    };
    
    const activityDiv = document.createElement('div');
    activityDiv.className = 'activity-message';
    activityDiv.innerHTML = `
        <span class="activity-indicator" style="background-color: ${colors[type]}"></span>
        <span class="activity-text">${message}</span>
    `;
    
    chatMessages.appendChild(activityDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        activityDiv.style.opacity = '0.5';
    }, 10000);
}

function toggleChatMinimize() {
    chatMinimized = !chatMinimized;
    const chatContainer = document.querySelector('.chat-container');
    
    if (chatMinimized) {
        chatContainer.classList.add('minimized');
        minimizeChat.innerHTML = '<i class="fas fa-expand"></i>';
    } else {
        chatContainer.classList.remove('minimized');
        minimizeChat.innerHTML = '<i class="fas fa-minus"></i>';
    }
}

// Quick actions
function handleQuickAction(action) {
    switch (action) {
        case 'Take Screenshot':
            takeScreenshot();
            break;
        case 'Analyze Page':
            analyzeCurrentPage('Analyze this page and tell me what you can see');
            break;
        case 'Find Forms':
            analyzeCurrentPage('Find all forms on this page and describe what they do');
            break;
        case 'List Links':
            analyzeCurrentPage('List all the important links on this page');
            break;
        default:
            addChatMessage(`I'm not sure how to handle "${action}". Can you describe what you'd like me to do?`, 'ai');
    }
}

// Automation functions
function startAutomation() {
    const task = taskInput?.value?.trim() || '';
    const url = urlInput?.value?.trim() || '';
    
    if (!task) {
        addChatMessage('Please provide a task description so I know what to automate.', 'ai');
        return;
    }
    
    startAutomationWithTask(task, url);
}

function startAutomationWithTask(task, url = '') {
    if (isAutomationRunning) {
        addChatMessage('I\'m already working on a task. Please wait for it to complete.', 'ai');
        return;
    }
    
    isAutomationRunning = true;
    updateButtons();
    showLoading('Starting automation...');
    
    addChatMessage(`Starting automation task: "${task}"${url ? ` on ${url}` : ''}`, 'ai');
    addActivityMessage('Initializing browser automation', 'info');
    
    socket.emit('startAutomation', { task, url });
}

function takeScreenshot() {
    showLoading('Taking screenshot...');
    addActivityMessage('Capturing page screenshot', 'info');
    socket.emit('takeScreenshot');
}

function stopAutomation() {
    isAutomationRunning = false;
    updateButtons();
    hideLoading();
    addChatMessage('Automation stopped.', 'ai');
    addActivityMessage('Automation stopped by user', 'warning');
}

function refreshBrowserView() {
    if (browserView) {
        // Just take a new screenshot to refresh
        takeScreenshot();
    }
}

function toggleFullscreen() {
    const browserContainer = document.querySelector('.browser-container');
    if (browserContainer) {
        browserContainer.classList.toggle('fullscreen');
        
        if (browserContainer.classList.contains('fullscreen')) {
            fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    }
}

// UI update functions
function updateButtons() {
    if (startBtn) {
        startBtn.disabled = isAutomationRunning;
    }
    if (stopBtn) {
        stopBtn.disabled = !isAutomationRunning;
    }
    if (screenshotBtn) {
        screenshotBtn.disabled = isAutomationRunning;
    }
}

function updateConnectionStatus(connected) {
    if (connectionStatus) {
        connectionStatus.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    }
    if (statusText) {
        statusText.textContent = connected ? 'Connected' : 'Disconnected';
    }
}

function showLoading(message = 'Processing...') {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        const loadingText = loadingOverlay.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

function displayScreenshot(imageData) {
    if (browserView) {
        browserView.src = imageData;
        browserView.style.display = 'block';
    }
}

// File upload functions
function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            addChatMessage(`File ${file.name} is too large. Maximum size is 5MB.`, 'ai');
            return;
        }
        
        uploadedFilesList.push(file);
        addFileToUI(file);
        
        // Upload file to server
        uploadFileToServer(file);
    });
    
    fileUploadModal?.classList.remove('active');
}

function addFileToUI(file) {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'uploaded-file';
    fileDiv.innerHTML = `
        <i class="fas fa-file"></i>
        <span>${file.name}</span>
        <button onclick="removeFile('${file.name}')" class="remove-file">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    uploadedFiles?.appendChild(fileDiv);
}

function uploadFileToServer(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('task', taskInput?.value || 'General automation context');
    
    fetch('/api/upload-context', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            addChatMessage(`File ${file.name} uploaded successfully! I'll use this context for automation.`, 'ai');
            addActivityMessage(`File context added: ${file.name}`, 'success');
        } else {
            addChatMessage(`Failed to upload ${file.name}: ${data.error}`, 'ai');
        }
    })
    .catch(error => {
        addChatMessage(`Error uploading ${file.name}: ${error.message}`, 'ai');
    });
}

function removeFile(filename) {
    uploadedFilesList = uploadedFilesList.filter(file => file.name !== filename);
    
    const fileElements = uploadedFiles?.querySelectorAll('.uploaded-file');
    fileElements?.forEach(element => {
        if (element.querySelector('span').textContent === filename) {
            element.remove();
        }
    });
}

// Legacy function for compatibility
function addLogEntry(message, type = 'info') {
    // Convert to activity message for the new UI
    addActivityMessage(message, type);
}

// Initialize on load
updateButtons();
