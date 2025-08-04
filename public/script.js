// Socket.io connection
const socket = io();

// DOM elements
const taskInput = document.getElementById('taskInput');
// Removed: urlInput - no longer needed for cleaner UI
// Removed: fileInput, fileUploadArea, uploadedFiles - file upload functionality removed
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
const statusIndicator = document.getElementById('statusIndicator');

// New Dyna chat elements
const chatInput = document.getElementById('chatInput');
const sendMessage = document.getElementById('sendMessage');
const chatMessages = document.getElementById('chatMessages');
const minimizeChat = document.getElementById('minimizeChat');
// Removed: fileUploadModal, closeModal - file upload functionality removed

// State
let isAutomationRunning = false;
let currentScript = '';
// Removed: uploadedFilesList - file upload functionality removed
let chatMinimized = false;
let browserViewWindow = null;
let currentSessionId = null;

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
        showStatus('Task completed!', 'ready');
    } else {
        addLogEntry(`Execution failed: ${result.error}`, 'error');
        addChatMessage(`Sorry, I encountered an error: ${result.error}. Let me know if you'd like me to try a different approach.`, 'ai');
        showStatus('Task failed', 'error');
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
    
    // Handle different types of errors specifically
    if (data.code === 'QUOTA_EXCEEDED' || data.message.includes('quota')) {
        addChatMessage(`⚠️ I've reached my daily AI quota limit. This happens when I've analyzed too many requests today. Please try again tomorrow, or consider upgrading the Gemini API plan for more requests.`, 'ai');
        addActivityMessage('Daily AI quota exceeded - automation paused', 'error');
        
        // Fetch and display quota status
        fetchQuotaStatus();
    } else if (data.code === 'SESSION_LIMIT_EXCEEDED' || data.message.includes('concurrent sessions')) {
        addChatMessage(`🔒 I can only run one automation at a time on the current plan. Please wait for any running sessions to finish, or consider upgrading to a paid Browserbase plan for more concurrent sessions.`, 'ai');
        addActivityMessage('Concurrent session limit reached', 'error');
    } else if (data.code === 'SESSION_CREATION_FAILED' || data.message.includes('session')) {
        addChatMessage(`🌐 I'm having trouble creating a browser session. This usually happens when there are too many active sessions. Please try again in a moment.`, 'ai');
        addActivityMessage('Browser session creation failed', 'error');
    } else if (data.code === 'API_KEY_EXPIRED' || data.message.includes('expired')) {
        addChatMessage(`🔑 My AI capabilities are temporarily unavailable due to an expired API key. Please contact the administrator to update the configuration.`, 'ai');
        addActivityMessage('AI API key expired', 'error');
    } else {
        addChatMessage(`I encountered an error: ${data.message}. Please let me know if you'd like me to try again.`, 'ai');
    }
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
    
    // Auto-open browser view when session starts
    if (message.includes('🎬 Watch live automation:')) {
        const urlMatch = message.match(/sessions\/([a-f0-9-]+)/);
        if (urlMatch) {
            const sessionId = urlMatch[1];
            // Small delay to ensure session is ready
            setTimeout(() => {
                openBrowserView(sessionId);
            }, 2000);
        }
    }
});

// New socket events for autonomous task execution
socket.on('taskProgress', (data) => {
    const { step, action, progress, confidence, reasoning, url } = data;
    
    // Update chat with progress
    const progressMessage = `Step ${step}: ${action} (${progress}% complete, ${Math.round(confidence * 100)}% confidence)`;
    addChatMessage(progressMessage, 'ai');
    
    // Show reasoning if available
    if (reasoning) {
        addChatMessage(`💭 Reasoning: ${reasoning}`, 'ai');
    }
    
    // Update browser view URL if changed
    if (url && browserView) {
        browserView.src = url;
    }
});

socket.on('taskComplete', (data) => {
    const { success, duration, stepsCompleted, finalUrl, confidence, sessionId, replayUrl } = data;
    
    isAutomationRunning = false;
    updateButtons();
    hideLoading();
    
    const durationSeconds = Math.round(duration / 1000);
    const successMessage = success 
        ? `✅ Task completed successfully in ${stepsCompleted} steps (${durationSeconds}s)!`
        : `⚠️ Task partially completed (${Math.round(confidence * 100)}% confidence)`;
    
    addChatMessage(successMessage, 'ai');
    
    // Show status indicator
    if (success) {
        showStatus(`Completed in ${durationSeconds}s!`, 'ready');
    } else {
        showStatus(`Partially completed`, 'error');
    }
    
    if (finalUrl) {
        addChatMessage(`🌐 Final page: ${finalUrl}`, 'ai');
    }
    
    // Add replay URL for viewing the automation
    if (replayUrl) {
        addChatMessage(`🎬 [Watch Automation Replay](${replayUrl})`, 'ai');
        addActivityMessage(`Session replay available: ${replayUrl}`, 'info');
    } else if (sessionId) {
        const fallbackUrl = `https://app.browserbase.com/sessions/${sessionId}`;
        addChatMessage(`🎬 [Watch Automation Replay](${fallbackUrl})`, 'ai');
    }
});

socket.on('taskAnalysis', (data) => {
    const { steps } = data;
    
    // Create a detailed analysis for the user
    let analysisText = "📊 Task Analysis:\n\n";
    steps.forEach(step => {
        analysisText += `Step ${step.step}: ${step.action}\n`;
        analysisText += `  └ ${step.reasoning}\n`;
        analysisText += `  └ Success: ${step.success ? '✅' : '❌'}, Progress: ${step.progress}%\n\n`;
    });
    
    addChatMessage(analysisText, 'ai');
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
    
    // Removed: File upload modal functionality - no longer needed for cleaner UI
    
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
    
    // Check for autonomous task keywords
    const autonomousKeywords = [
        'play', 'search', 'search for', 'find', 'book', 'apply', 'buy', 'order', 
        'download', 'upload', 'fill', 'submit', 'register', 'login',
        'navigate to', 'go to', 'visit', 'open', 'complete', 'automate',
        'watch', 'browse', 'explore', 'look for'
    ];
    
    const isAutonomousTask = autonomousKeywords.some(keyword => 
        lowerMessage.includes(keyword)
    ) || lowerMessage.includes('flight') || lowerMessage.includes('job') || 
       lowerMessage.includes('music') || lowerMessage.includes('bollywood') ||
       lowerMessage.includes('chatgpt') || lowerMessage.includes('youtube');
    
    if (isAutonomousTask) {
        // Use Enhanced BrowserAgent for autonomous execution
        startAutonomousTask(message);
        return;
    }
    
    // Default to regular automation task
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : '';
    
    startAutomationWithTask(message, url);
}

// Start autonomous task execution using Enhanced BrowserAgent
function startAutonomousTask(taskDescription) {
    if (isAutomationRunning) {
        addChatMessage('I\'m already working on a task. Please wait for it to complete.', 'ai');
        return;
    }
    
    isAutomationRunning = true;
    updateButtons();
    showLoading('Starting autonomous task...');
    
    addChatMessage(`🚀 Starting autonomous task: "${taskDescription}"`, 'ai');
    addChatMessage('I will use my Observe → Decide → Act → Evaluate cycle to complete this task step by step.', 'ai');
    
    socket.emit('startAutonomousTask', {
        taskDescription: taskDescription,
        options: {
            maxSteps: 20,
            confidenceThreshold: 0.7
        }
    });
}

function analyzeCurrentPage(instruction) {
    showLoading('Analyzing page...');
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
    
    if (!task) {
        addChatMessage('Please provide a task description so I know what to automate.', 'ai');
        return;
    }
    
    startAutomationWithTask(task);
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

function showLoading(message = 'Dyna is processing...') {
    if (statusIndicator) {
        const statusText = statusIndicator.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = message;
        }
        statusIndicator.className = 'status-indicator show processing';
    }
}

function hideLoading() {
    if (statusIndicator) {
        const statusText = statusIndicator.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = 'Ready';
        }
        statusIndicator.className = 'status-indicator show';
        
        // Hide after a short delay
        setTimeout(() => {
            statusIndicator.className = 'status-indicator';
        }, 2000);
    }
}

function showStatus(message, type = 'ready') {
    if (statusIndicator) {
        const statusText = statusIndicator.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = message;
        }
        statusIndicator.className = `status-indicator show ${type}`;
        
        // Auto-hide after 3 seconds unless it's processing
        if (type !== 'processing') {
            setTimeout(() => {
                statusIndicator.className = 'status-indicator';
            }, 3000);
        }
    }
}

function displayScreenshot(imageData) {
    if (browserView) {
        browserView.src = imageData;
        browserView.style.display = 'block';
    }
}

// File upload functions
// File upload functionality removed for cleaner UI experience
// Users can provide context directly through chat messages

// Legacy function for compatibility
function addLogEntry(message, type = 'info') {
    // Convert to activity message for the new UI
    addActivityMessage(message, type);
}

// Browser View Window Functions
async function openBrowserView(sessionId) {
    try {
        // Get debug info from Browserbase
        const response = await fetch(`/api/session/${sessionId}/debug`);
        const debugInfo = await response.json();
        
        if (debugInfo.debuggerFullscreenUrl) {
            // Update the browser view panel instead of opening new window
            const browserView = document.getElementById('browserView');
            const placeholder = browserView.querySelector('.placeholder');
            
            if (placeholder) {
                // Replace placeholder with iframe
                browserView.innerHTML = `
                    <iframe 
                        src="${debugInfo.debuggerFullscreenUrl}"
                        style="width: 100%; height: 100%; border: none;"
                        title="Live Browser Automation">
                    </iframe>
                    <div class="browser-view-controls">
                        <button onclick="refreshBrowserView('${sessionId}')" class="btn btn-small">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button onclick="openExternalBrowserView('${sessionId}')" class="btn btn-small">
                            <i class="fas fa-external-link-alt"></i> Open in New Window
                        </button>
                    </div>
                `;
                
                currentSessionId = sessionId;
                addActivityMessage('🎬 Live browser view loaded in panel!', 'success');
            }
        } else {
            throw new Error('Debug URL not available');
        }
    } catch (error) {
        console.error('Failed to load browser view:', error);
        addActivityMessage('⚠️ Failed to load live browser view. Using external link.', 'warning');
        
        // Show error in browser panel
        const browserView = document.getElementById('browserView');
        browserView.innerHTML = `
            <div class="placeholder error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Browser View Unavailable</h3>
                <p>Unable to load live view. Click below to open externally.</p>
                <button onclick="openExternalBrowserView('${sessionId}')" class="btn btn-primary">
                    <i class="fas fa-external-link-alt"></i> Open External View
                </button>
            </div>
        `;
    }
}

function refreshBrowserView(sessionId) {
    if (sessionId) {
        openBrowserView(sessionId);
    }
}

function openExternalBrowserView(sessionId) {
    const fallbackUrl = `https://app.browserbase.com/sessions/${sessionId}`;
    window.open(fallbackUrl, '_blank');
}

function reopenBrowserView() {
    if (currentSessionId) {
        openBrowserView(currentSessionId);
    }
}

function closeBrowserView() {
    const browserView = document.getElementById('browserView');
    browserView.innerHTML = `
        <div class="placeholder">
            <i class="fas fa-globe"></i>
            <h3>Ready to Start</h3>
            <p>Ask Dyna to automate a web task to begin</p>
        </div>
    `;
    currentSessionId = null;
}

// Initialize on load
updateButtons();

// Quota management functions
async function fetchQuotaStatus() {
    try {
        const response = await fetch('/api/quota-status');
        const quotaData = await response.json();
        
        displayQuotaStatus(quotaData);
        return quotaData;
    } catch (error) {
        console.error('Failed to fetch quota status:', error);
        return null;
    }
}

function displayQuotaStatus(quotaData) {
    const quotaInfo = `
        <div class="quota-status">
            <h4>📊 AI Usage Today</h4>
            <div class="quota-bar">
                <div class="quota-fill" style="width: ${(quotaData.apiCallsUsed / quotaData.maxCalls) * 100}%"></div>
            </div>
            <p>${quotaData.apiCallsUsed} / ${quotaData.maxCalls} requests used</p>
            <p class="quota-remaining">${quotaData.remaining} requests remaining</p>
            ${quotaData.queueLength > 0 ? `<p class="quota-queue">⏳ ${quotaData.queueLength} requests queued</p>` : ''}
        </div>
    `;
    
    addChatMessage(quotaInfo, 'system');
}

// Check quota status on page load (after initialization)
setTimeout(() => {
    fetchQuotaStatus();
}, 3000);
