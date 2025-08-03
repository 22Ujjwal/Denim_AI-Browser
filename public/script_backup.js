// Socket.io connection
const socket = io();

// DOM elements
const taskInput = document.getElementById('taskInput'socket.on('error', (data) => {
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
});t urlInput = document.getElementById('urlInput');
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
    updateButtonStates();
});

// Event listeners
function initializeEventListeners() {
    // Dyna Chat functionality
    sendMessage.addEventListener('click', handleChatMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleChatMessage();
        }
    });
    
    minimizeChat.addEventListener('click', toggleChatMinimize);
    
    // Quick actions
    document.querySelectorAll('.quick-action').forEach(button => {
        button.addEventListener('click', handleQuickAction);
    });
    
    // Modal functionality
    closeModal.addEventListener('click', () => {
        fileUploadModal.style.display = 'none';
    });
    
    // File upload
    fileUploadArea.addEventListener('click', () => fileInput.click());
    fileUploadArea.addEventListener('dragover', handleDragOver);
    fileUploadArea.addEventListener('drop', handleFileDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // Buttons
    startBtn.addEventListener('click', startAutomation);
    screenshotBtn.addEventListener('click', takeScreenshot);
    stopBtn.addEventListener('click', stopAutomation);
    refreshBtn.addEventListener('click', takeScreenshot);
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Enter key shortcuts
    taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            startAutomation();
        }
    });
}

// Dyna Chat Functions
function handleChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addChatMessage(message, 'user');
    chatInput.value = '';
    
    // Process the message
    processChatMessage(message);
}

function addChatMessage(text, sender) {
    const message = document.createElement('div');
    message.className = `message ${sender}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = sender === 'ai' ? '<i class="fas fa-sparkles"></i>' : '<i class="fas fa-user"></i>';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = text;
    
    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = new Date().toLocaleTimeString();
    
    content.appendChild(messageText);
    content.appendChild(messageTime);
    message.appendChild(avatar);
    message.appendChild(content);
    
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addActivityMessage(message, type = 'info') {
    const activityMessage = document.createElement('div');
    activityMessage.className = 'activity-message';
    
    const content = document.createElement('div');
    content.className = `activity-content ${type}`;
    
    const timestamp = document.createElement('span');
    timestamp.className = 'activity-timestamp';
    timestamp.textContent = `[${new Date().toLocaleTimeString()}]`;
    
    const icon = document.createElement('i');
    icon.className = `fas activity-icon ${getActivityIcon(type)}`;
    
    const messageText = document.createElement('span');
    messageText.textContent = message;
    
    content.appendChild(timestamp);
    content.appendChild(icon);
    content.appendChild(messageText);
    activityMessage.appendChild(content);
    
    chatMessages.appendChild(activityMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Remove old activity messages if too many
    const activityMessages = chatMessages.querySelectorAll('.activity-message');
    if (activityMessages.length > 50) {
        activityMessages[0].remove();
    }
}

function getActivityIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'error': return 'fa-times-circle';
        default: return 'fa-info-circle';
    }
}

function processChatMessage(message) {
    // Set the task input for backward compatibility
    taskInput.value = message;
    
    // Add AI response
    setTimeout(() => {
        addChatMessage('I understand! Let me help you with that task. I\'ll start working on it right away.', 'ai');
        
        // Trigger automation based on message content
        if (message.toLowerCase().includes('screenshot') || message.toLowerCase().includes('capture')) {
            takeScreenshot();
        } else if (message.toLowerCase().includes('analyze') || message.toLowerCase().includes('analysis')) {
            if (browserView.querySelector('img')) {
                addChatMessage('I can see there\'s already a screenshot loaded. Let me analyze it for you.', 'ai');
                // Trigger analysis if there's already a screenshot
            } else {
                addChatMessage('I\'ll take a screenshot first and then analyze it for you.', 'ai');
                takeScreenshot();
            }
        } else {
            // Start automation for other tasks
            startAutomation();
        }
    }, 500);
}

function handleQuickAction(e) {
    const action = e.currentTarget.dataset.action;
    
    switch (action) {
        case 'screenshot':
            addChatMessage('Taking a screenshot for you!', 'ai');
            takeScreenshot();
            break;
        case 'analyze':
            if (browserView.querySelector('img')) {
                addChatMessage('Analyzing the current page...', 'ai');
                // Trigger analysis
            } else {
                addChatMessage('I\'ll take a screenshot first and then analyze it.', 'ai');
                takeScreenshot();
            }
            break;
        case 'upload':
            fileUploadModal.style.display = 'flex';
            break;
    }
}

function toggleChatMinimize() {
    chatMinimized = !chatMinimized;
    const chatbox = document.querySelector('.dyna-chatbox');
    
    if (chatMinimized) {
        chatbox.style.height = '80px';
        chatMessages.style.display = 'none';
        document.querySelector('.chat-input-container').style.display = 'none';
        minimizeChat.innerHTML = '<i class="fas fa-plus"></i>';
    } else {
        chatbox.style.height = 'auto';
        chatMessages.style.display = 'flex';
        document.querySelector('.chat-input-container').style.display = 'block';
        minimizeChat.innerHTML = '<i class="fas fa-minus"></i>';
    }
}

// File handling
function handleDragOver(e) {
    e.preventDefault();
    fileUploadArea.style.borderColor = '#4096ff';
    fileUploadArea.style.background = 'rgba(64, 150, 255, 0.05)';
}

function handleFileDrop(e) {
    e.preventDefault();
    fileUploadArea.style.borderColor = 'rgba(64, 150, 255, 0.3)';
    fileUploadArea.style.background = 'transparent';
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    handleFiles(files);
}

function handleFiles(files) {
    files.forEach(file => {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            addLogEntry(`File ${file.name} is too large (max 5MB)`, 'warning');
            return;
        }
        
        uploadedFilesList.push(file);
        displayUploadedFile(file);
        uploadFileToServer(file);
    });
}

function displayUploadedFile(file) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item fade-in';
    fileItem.innerHTML = `
        <i class="fas fa-file"></i>
        <span>${file.name}</span>
        <small>(${formatFileSize(file.size)})</small>
    `;
    uploadedFiles.appendChild(fileItem);
}

function uploadFileToServer(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('task', taskInput.value);

    showLoading();
    
    fetch('/api/upload-context', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            addLogEntry(`File ${file.name} uploaded and analyzed`, 'success');
            addChatMessage(`Great! I've uploaded and analyzed "${file.name}". This context will help me better understand your automation needs.`, 'ai');
        } else {
            addLogEntry(`Failed to upload ${file.name}: ${data.error}`, 'error');
            addChatMessage(`Sorry, I couldn't upload "${file.name}": ${data.error}. Please try again.`, 'ai');
        }
        hideLoading();
    })
    .catch(error => {
        addLogEntry(`Upload error: ${error.message}`, 'error');
        addChatMessage(`Upload error: ${error.message}. Please try again.`, 'ai');
        hideLoading();
    });
}

// Automation controls
function startAutomation() {
    const task = taskInput.value.trim();
    if (!task) {
        addLogEntry('Please enter a task description', 'warning');
        addChatMessage('Please describe what you\'d like me to automate first.', 'ai');
        return;
    }

    isAutomationRunning = true;
    updateButtonStates();
    showLoading();
    
    const data = {
        task: task,
        url: urlInput.value.trim() || null
    };

    socket.emit('startAutomation', data);
    addLogEntry(`Starting automation: ${task}`, 'info');
    addChatMessage(`Starting to work on: "${task}". This may take a moment...`, 'ai');
}

function takeScreenshot() {
    showLoading();
    socket.emit('takeScreenshot');
    addLogEntry('Taking screenshot...', 'info');
}

function stopAutomation() {
    isAutomationRunning = false;
    updateButtonStates();
    addLogEntry('Automation stopped', 'warning');
    addChatMessage('Automation stopped. Let me know if you need help with anything else!', 'ai');
}

function executeScript() {
    addActivityMessage('No script execution interface available', 'warning');
    addChatMessage('Script execution has been simplified. Automation runs automatically after generation.', 'ai');
}

// Display functions
function displayScreenshot(screenshotData) {
    browserView.innerHTML = `<img src="${screenshotData}" alt="Browser Screenshot" class="fade-in">`;
}

// UI helpers
function updateConnectionStatus(connected) {
    if (connected) {
        connectionStatus.classList.add('connected');
        statusText.textContent = 'Connected';
    } else {
        connectionStatus.classList.remove('connected');
        statusText.textContent = 'Disconnected';
    }
}

function updateButtonStates() {
    startBtn.disabled = isAutomationRunning;
    stopBtn.disabled = !isAutomationRunning;
    screenshotBtn.disabled = isAutomationRunning;
}

function addLogEntry(message, type = 'info') {
    addActivityMessage(message, type);
}

function clearLogs() {
    // Clear activity messages from chat
    const activityMessages = chatMessages.querySelectorAll('.activity-message');
    activityMessages.forEach(msg => msg.remove());
    addChatMessage('Activity log has been cleared for you!', 'ai');
}

function showLoading() {
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

function toggleFullscreen() {
    const browserContainer = document.querySelector('.browser-container');
    if (browserContainer.classList.contains('fullscreen')) {
        browserContainer.classList.remove('fullscreen');
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    } else {
        browserContainer.classList.add('fullscreen');
        fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'Enter':
                if (document.activeElement === taskInput) {
                    startAutomation();
                }
                break;
            case 's':
                e.preventDefault();
                takeScreenshot();
                break;
            case 'e':
                e.preventDefault();
                if (!executeBtn.disabled) {
                    executeScript();
                }
                break;
        }
    }
});

// Auto-resize textarea
taskInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Add fullscreen styles
const fullscreenStyles = `
    .browser-container.fullscreen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 999;
        background: rgba(0, 0, 0, 0.95);
        margin: 0;
        padding: 20px;
        border-radius: 0;
    }
    
    .browser-container.fullscreen .browser-view {
        width: 100%;
        height: calc(100% - 60px);
    }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = fullscreenStyles;
document.head.appendChild(styleSheet);

// Initialize animations and enhanced interactions
function initializeAnimations() {
    // Add stagger animation to buttons
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach((btn, index) => {
        btn.style.animationDelay = `${index * 0.1}s`;
        btn.classList.add('fade-in');
    });
    
    // Add hover effects to panels
    const panels = document.querySelectorAll('.glass-panel');
    panels.forEach(panel => {
        panel.addEventListener('mouseenter', () => {
            panel.style.transform = 'translateY(-2px)';
            panel.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
        });
        
        panel.addEventListener('mouseleave', () => {
            panel.style.transform = 'translateY(0)';
            panel.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
        });
    });
    
    // Enhanced chat input interactions
    chatInput.addEventListener('focus', () => {
        document.querySelector('.chat-input-wrapper').style.transform = 'scale(1.02)';
    });
    
    chatInput.addEventListener('blur', () => {
        document.querySelector('.chat-input-wrapper').style.transform = 'scale(1)';
    });
    
    // Add typing animation for AI messages
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList && node.classList.contains('ai-message')) {
                        const messageText = node.querySelector('.message-text');
                        if (messageText) {
                            const text = messageText.textContent;
                            messageText.textContent = '';
                            typeWriter(messageText, text, 20);
                        }
                    }
                });
            }
        });
    });
    
    observer.observe(chatMessages, { childList: true });
}

// Typewriter effect for AI messages
function typeWriter(element, text, speed = 50) {
    let i = 0;
    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

// Enhanced keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'Enter':
                if (document.activeElement === taskInput || document.activeElement === chatInput) {
                    if (document.activeElement === chatInput) {
                        handleChatMessage();
                    } else {
                        startAutomation();
                    }
                }
                break;
            case 's':
                e.preventDefault();
                takeScreenshot();
                addChatMessage('Taking a screenshot as requested!', 'ai');
                break;
            case '/':
                e.preventDefault();
                chatInput.focus();
                break;
        }
    }
    
    // ESC to minimize/maximize chat
    if (e.key === 'Escape' && document.activeElement === chatInput) {
        toggleChatMinimize();
    }
});

// Initialize animations when page loads
setTimeout(initializeAnimations, 500);

// Welcome message with slight delay
setTimeout(() => {
    addChatMessage('💡 Tip: You can use Ctrl+/ to focus on the chat and Ctrl+S to take screenshots!', 'ai');
}, 2000);
