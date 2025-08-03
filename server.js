require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Initialize BrowserAgent
const BrowserAgent = require('./lib/BrowserAgent');
const EnhancedBrowserAgent = require('./lib/EnhancedBrowserAgent');
let browserAgent = null;
let enhancedAgent = null;

// Global variables
let browser = null;
let currentPage = null;
let currentSession = null;
let isProcessingImages = false;
let imageProcessingQueue = [];

// Initialize browser with BrowserAgent
async function initBrowser() {
  try {
    console.log('Initializing BrowserAgent...');
    
    browserAgent = new BrowserAgent({
      browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
      browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID,
      geminiApiKey: process.env.GEMINI_API_KEY,
      enableLogging: true
    });
    
    const result = await browserAgent.initialize();
    
    // Update global variables for backward compatibility
    currentSession = { 
      id: result.sessionId, 
      replayUrl: result.replayUrl 
    };
    
    console.log('BrowserAgent initialized successfully');
    console.log(`Session ID: ${result.sessionId}`);
    console.log(`View replay at: ${result.replayUrl}`);
    
    return result;
  } catch (error) {
    console.error('Failed to initialize BrowserAgent:', error);
    console.error('Error details:', error.message);
    
    // Reset browserAgent to null on failure
    browserAgent = null;
    
    // Log specific setup instructions
    if (error.message.includes('API key not configured')) {
      console.log('\n🔧 Setup Instructions:');
      console.log('1. Copy .env.example to .env');
      console.log('2. Add your Browserbase API key: BROWSERBASE_API_KEY=your_key');
      console.log('3. Add your Browserbase Project ID: BROWSERBASE_PROJECT_ID=your_project');
    }
    
    throw error;
  }
}

// Initialize Enhanced BrowserAgent for autonomous tasks
async function initEnhancedAgent() {
  try {
    console.log('Initializing Enhanced BrowserAgent...');
    
    enhancedAgent = new EnhancedBrowserAgent({
      browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
      browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID,
      geminiApiKey: process.env.GEMINI_API_KEY,
      enableLogging: true
    });
    
    await enhancedAgent.initialize();
    
    console.log('Enhanced BrowserAgent initialized successfully');
    return enhancedAgent;
  } catch (error) {
    console.error('Failed to initialize Enhanced BrowserAgent:', error);
    enhancedAgent = null;
    throw error;
  }
}

// Process images at 2 images per second
async function processImageQueue() {
  if (isProcessingImages || imageProcessingQueue.length === 0) return;
  
  isProcessingImages = true;
  
  while (imageProcessingQueue.length > 0) {
    const { imageData, socketId, callback } = imageProcessingQueue.shift();
    
    try {
      const result = await analyzeImage(imageData);
      io.to(socketId).emit('imageAnalysis', result);
      if (callback) callback(result);
    } catch (error) {
      console.error('Image processing error:', error);
      io.to(socketId).emit('error', { message: 'Failed to process image' });
    }
    
    // Wait 500ms between images (2 images per second)
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  isProcessingImages = false;
}

// Analyze image with Gemini Vision
async function analyzeImage(imageData) {
  try {
    const prompt = `Analyze this screenshot of a web page. Describe:
    1. What elements are visible (buttons, forms, text, images)
    2. The current state of the page
    3. Any interactive elements that could be automated
    4. Suggestions for possible actions
    
    Be concise but thorough in your analysis.`;

    const result = await visionModel.generateContent([
      prompt,
      {
        inlineData: {
          data: imageData.split(',')[1], // Remove data:image/jpeg;base64, prefix
          mimeType: 'image/jpeg'
        }
      }
    ]);

    return {
      analysis: result.response.text(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Gemini Vision API error:', error);
    throw error;
  }
}

// Generate automation script with Gemini
async function generateAutomationScript(task, context = '') {
  try {
    const prompt = `Generate a Playwright automation script for the following task: "${task}"
    
    Context: ${context}
    
    Return a JavaScript function that uses Playwright to accomplish this task. 
    The function should be named 'automateTask' and accept a 'page' parameter.
    Include error handling and detailed comments.
    Use Playwright syntax (not Puppeteer).
    
    Example format:
    async function automateTask(page) {
      try {
        // Your automation code here
        await page.goto('https://example.com');
        await page.waitForLoadState('networkidle');
        // Use Playwright selectors and methods
        await page.click('button[type="submit"]');
        await page.fill('input[name="search"]', 'search term');
        // ... more steps
        return { success: true, message: 'Task completed successfully' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Script generation error:', error);
    throw error;
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Enhanced automation with BrowserAgent
  socket.on('startAutomation', async (data) => {
    try {
      const { task, url } = data;
      
      socket.emit('activityUpdate', {
        type: 'info',
        message: 'Initializing browser automation...'
      });
      
      // Initialize BrowserAgent if not already done
      if (!browserAgent || !browserAgent.isInitialized) {
        const initResult = await initBrowser();
        if (!initResult) {
          socket.emit('error', { 
            message: 'Failed to initialize browser session. Please check your API keys in .env file.' 
          });
          socket.emit('activityUpdate', {
            type: 'error',
            message: 'Browser initialization failed - check API credentials'
          });
          return;
        }
      }
      
      // Ensure agent is properly initialized
      if (!browserAgent || !browserAgent.isInitialized) {
        socket.emit('error', { 
          message: 'Browser agent is not properly initialized.' 
        });
        return;
      }
      
      socket.emit('activityUpdate', {
        type: 'success',
        message: 'Browser session initialized'
      });
      
      // Use BrowserAgent to navigate and process
      let result;
      if (url) {
        socket.emit('activityUpdate', {
          type: 'info',
          message: `Navigating to ${url}...`
        });
        
        result = await browserAgent.navigateAndProcess(url, task, {
          includeScreenshot: true,
          includeDom: true,
          executeActions: true
        });
      } else {
        socket.emit('activityUpdate', {
          type: 'info',
          message: 'Analyzing current page...'
        });
        
        result = await browserAgent.analyzePageWithGemini(task, {
          includeScreenshot: true,
          includeDom: true,
          executeActions: true
        });
      }
      
      // Send results to client
      socket.emit('automationResult', {
        analysis: result.analysis,
        actions: result.actions,
        pageData: {
          url: result.pageData.url,
          title: result.pageData.title
        }
      });
      
      // Send screenshot
      if (result.pageData.screenshot) {
        socket.emit('screenshot', `data:image/png;base64,${result.pageData.screenshot}`);
      }
      
      // Send session info
      const sessionInfo = browserAgent.getSessionInfo();
      socket.emit('sessionInfo', sessionInfo);
      
      socket.emit('activityUpdate', {
        type: 'success',
        message: 'Automation task completed successfully'
      });

    } catch (error) {
      console.error('Automation error:', error);
      socket.emit('error', { message: error.message });
      socket.emit('activityUpdate', {
        type: 'error',
        message: `Automation failed: ${error.message}`
      });
    }
  });

  // Enhanced autonomous task execution using Observe → Decide → Act → Evaluate cycle
  socket.on('startAutonomousTask', async (data) => {
    try {
      const { taskDescription, options = {} } = data;
      
      socket.emit('activityUpdate', {
        type: 'info',
        message: `Starting autonomous task: ${taskDescription}`
      });
      
      // Initialize Enhanced BrowserAgent if not already done
      if (!enhancedAgent) {
        socket.emit('activityUpdate', {
          type: 'info',
          message: 'Initializing enhanced AI agent...'
        });
        
        await initEnhancedAgent();
        
        if (!enhancedAgent) {
          socket.emit('error', { 
            message: 'Failed to initialize enhanced agent. Please check your API keys.' 
          });
          return;
        }
      }
      
      socket.emit('activityUpdate', {
        type: 'success',
        message: 'Enhanced AI agent ready - starting autonomous execution'
      });
      
      // Set up progress callbacks
      const progressCallback = (step, progress) => {
        socket.emit('taskProgress', {
          step: step.step,
          action: step.decision?.action,
          progress: step.evaluation?.taskProgress || 0,
          confidence: step.evaluation?.confidence || 0,
          reasoning: step.decision?.reasoning,
          url: step.observation?.url
        });
        
        socket.emit('activityUpdate', {
          type: 'info',
          message: `Step ${step.step}: ${step.decision?.action} - ${step.evaluation?.taskProgress || 0}% complete`
        });
      };
      
      // Execute the autonomous task
      const result = await enhancedAgent.executeAutonomousTask(taskDescription, {
        ...options,
        progressCallback
      });
      
      // Send completion result
      socket.emit('taskComplete', {
        success: result.success,
        duration: result.duration,
        stepsCompleted: result.stepsCompleted,
        finalUrl: result.finalUrl,
        confidence: result.confidence
      });
      
      socket.emit('activityUpdate', {
        type: result.success ? 'success' : 'warning',
        message: result.success 
          ? `Task completed successfully in ${result.stepsCompleted} steps!`
          : `Task partially completed (${result.confidence * 100}% confidence)`
      });
      
      // Send detailed step-by-step results for analysis
      socket.emit('taskAnalysis', {
        steps: result.steps.map(step => ({
          step: step.step,
          action: step.decision.action,
          reasoning: step.decision.reasoning,
          success: step.actionResult.success,
          progress: step.evaluation.taskProgress,
          confidence: step.evaluation.confidence
        }))
      });

    } catch (error) {
      console.error('Autonomous task error:', error);
      socket.emit('error', { message: error.message });
      socket.emit('activityUpdate', {
        type: 'error',
        message: `Autonomous task failed: ${error.message}`
      });
    }
  });

  // Execute specific action
  socket.on('executeAction', async (data) => {
    try {
      const { actionType, parameters } = data;
      
      if (!browserAgent || !browserAgent.isInitialized) {
        throw new Error('Browser agent not initialized. Please start automation first.');
      }
      
      socket.emit('activityUpdate', {
        type: 'info',
        message: `Executing ${actionType} action...`
      });
      
      const result = await browserAgent.executeAction(actionType, parameters);
      
      // Take screenshot after action
      const screenshot = await browserAgent.takeScreenshot();
      socket.emit('screenshot', `data:image/png;base64,${screenshot.toString('base64')}`);
      
      socket.emit('actionResult', result);
      socket.emit('activityUpdate', {
        type: 'success',
        message: `Action ${actionType} completed successfully`
      });

    } catch (error) {
      console.error('Action execution error:', error);
      socket.emit('error', { message: error.message });
      socket.emit('activityUpdate', {
        type: 'error',
        message: `Action failed: ${error.message}`
      });
    }
  });

  // Analyze current page
  socket.on('analyzePage', async (data) => {
    try {
      const { instruction, options = {} } = data;
      
      if (!browserAgent || !browserAgent.isInitialized) {
        throw new Error('Browser agent not initialized. Please start automation first.');
      }
      
      socket.emit('activityUpdate', {
        type: 'info',
        message: 'Analyzing current page with AI...'
      });
      
      const result = await browserAgent.analyzePageWithGemini(instruction, {
        executeActions: false,
        ...options
      });
      
      socket.emit('analysisResult', result);
      socket.emit('activityUpdate', {
        type: 'success',
        message: 'Page analysis completed'
      });

    } catch (error) {
      console.error('Page analysis error:', error);
      socket.emit('error', { message: error.message });
      socket.emit('activityUpdate', {
        type: 'error',
        message: `Analysis failed: ${error.message}`
      });
    }
  });

  // Take screenshot
  socket.on('takeScreenshot', async () => {
    try {
      if (!browserAgent || !browserAgent.isInitialized) {
        throw new Error('Browser agent not initialized.');
      }
      
      const screenshot = await browserAgent.takeScreenshot();
      socket.emit('screenshot', `data:image/png;base64,${screenshot.toString('base64')}`);
      
      socket.emit('activityUpdate', {
        type: 'success',
        message: 'Screenshot captured'
      });

    } catch (error) {
      console.error('Screenshot error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Legacy support for existing handlers
  socket.on('executeScript', async (data) => {
    try {
      const { script } = data;
      
      if (!browserAgent || !browserAgent.isInitialized) {
        throw new Error('Browser agent not initialized. Please start automation first.');
      }

      socket.emit('activityUpdate', {
        type: 'warning',
        message: 'Using legacy script execution - consider using new action-based approach'
      });

      // For backward compatibility, we can still execute scripts
      // but this is not recommended with the new BrowserAgent approach
      socket.emit('executionResult', { 
        success: false, 
        message: 'Script execution deprecated. Use action-based approach instead.' 
      });

    } catch (error) {
      console.error('Script execution error:', error);
      socket.emit('error', { message: error.message });
      socket.emit('activityUpdate', {
        type: 'error',
        message: `Script execution failed: ${error.message}`
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// REST API endpoints
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/analyze-text', async (req, res) => {
  try {
    const { text, task } = req.body;
    
    const prompt = `Analyze the following text in the context of the task: "${task}"
    
    Text: ${text}
    
    Provide insights on how this text relates to the automation task and suggest next steps.`;

    const result = await model.generateContent(prompt);
    
    res.json({
      success: true,
      analysis: result.response.text()
    });
  } catch (error) {
    console.error('Text analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/upload-context', upload.single('file'), async (req, res) => {
  try {
    const { task } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Process the uploaded file based on its type
    let fileContent = '';
    if (file.mimetype.startsWith('text/') || file.mimetype === 'application/json') {
      fileContent = fs.readFileSync(file.path, 'utf8');
    }

    const prompt = `Analyze this uploaded file in the context of the automation task: "${task}"
    
    File type: ${file.mimetype}
    File content: ${fileContent}
    
    How can this file's content help with the automation task?`;

    const result = await model.generateContent(prompt);
    
    res.json({
      success: true,
      analysis: result.response.text(),
      filename: file.filename
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize browser on startup
console.log('Starting Dyna AI Browser Agent...');
console.log('Browser initialization will happen on first automation request.');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 AI Browser Agent running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} to access the agent`);
  
  if (!process.env.BROWSERBASE_API_KEY || process.env.BROWSERBASE_API_KEY === 'your_browserbase_api_key_here') {
    console.log('\n⚠️  Warning: Browserbase API credentials not configured.');
    console.log('Some automation features will be limited until you configure:');
    console.log('- BROWSERBASE_API_KEY');
    console.log('- BROWSERBASE_PROJECT_ID');
    console.log('- GEMINI_API_KEY');
  }
});
