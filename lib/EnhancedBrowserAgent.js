const { chromium } = require('playwright-core');
const { Browserbase } = require('@browserbasehq/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');

/**
 * Enhanced BrowserAgent with Observe → Decide → Act → Evaluate cycle
 * Designed for autonomous task completion (flight booking, job applications, etc.)
 */
class EnhancedBrowserAgent {
    constructor(options = {}) {
        this.browserbaseApiKey = options.browserbaseApiKey || process.env.BROWSERBASE_API_KEY;
        this.browserbaseProjectId = options.browserbaseProjectId || process.env.BROWSERBASE_PROJECT_ID;
        this.geminiApiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
        
        // Enhanced configuration
        this.config = {
            sessionTimeout: options.sessionTimeout || parseInt(process.env.SESSION_TIMEOUT) || 300000,
            maxRetries: options.maxRetries || parseInt(process.env.MAX_RETRIES) || 3,
            screenshotQuality: options.screenshotQuality || parseInt(process.env.SCREENSHOT_QUALITY) || 80,
            enableLogging: options.enableLogging !== undefined ? options.enableLogging : process.env.ENABLE_LOGGING === 'true',
            evaluationInterval: 3000, // Time between evaluations (ms)
            maxStepsPerTask: 20,      // Maximum steps before timeout
            confidenceThreshold: 0.7  // Minimum confidence for action execution
        };
        
        // State management
        this.browser = null;
        this.context = null;
        this.page = null;
        this.session = null;
        this.bb = null;
        this.genAI = null;
        this.model = null;
        this.visionModel = null;
        this.isInitialized = false;
        this.sessionStartTime = null;
        
        // Task execution state
        this.currentTask = null;
        this.taskSteps = [];
        this.evaluationHistory = [];
        this.taskStartTime = null;
        this.stepCount = 0;
        
        // Task-specific strategies
        this.taskStrategies = {
            'search_flights': {
                websites: ['expedia.com', 'kayak.com', 'booking.com', 'google.com/travel'],
                steps: ['navigate', 'search', 'filter', 'compare', 'select'],
                evaluation_criteria: ['price', 'duration', 'stops']
            },
            'play_music': {
                websites: ['youtube.com', 'spotify.com'],
                steps: ['navigate', 'search', 'select', 'play'],
                evaluation_criteria: ['playing', 'relevant_content']
            },
            'apply_job': {
                websites: ['careers pages', 'linkedin.com', 'indeed.com'],
                steps: ['navigate', 'search', 'apply', 'fill_form', 'submit'],
                evaluation_criteria: ['application_submitted', 'form_complete']
            }
        };
        
        this.log('Enhanced BrowserAgent instance created', 'info');
    }

    /**
     * Initialize the enhanced browser agent
     */
    async initialize() {
        try {
            this.log('Initializing Enhanced BrowserAgent...', 'info');
            
            // Check API keys
            if (!this.browserbaseApiKey || this.browserbaseApiKey === 'your_browserbase_api_key_here') {
                throw new Error('Browserbase API key not configured. Please set BROWSERBASE_API_KEY in .env file.');
            }
            
            if (!this.browserbaseProjectId || this.browserbaseProjectId === 'your_browserbase_project_id_here') {
                throw new Error('Browserbase Project ID not configured. Please set BROWSERBASE_PROJECT_ID in .env file.');
            }
            
            if (!this.geminiApiKey || this.geminiApiKey === 'your_gemini_api_key_here') {
                throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in .env file.');
            }

            // Initialize Browserbase
            this.bb = new Browserbase({
                apiKey: this.browserbaseApiKey,
                projectId: this.browserbaseProjectId
            });

            // Initialize Gemini AI
            this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            this.visionModel = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

            this.log('All services initialized successfully', 'success');
            this.isInitialized = true;
            
        } catch (error) {
            this.log(`Initialization failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Main method to execute autonomous tasks using Observe → Decide → Act → Evaluate cycle
     */
    async executeAutonomousTask(taskDescription, options = {}) {
        this.ensureInitialized();
        
        try {
            this.log(`Starting autonomous task: ${taskDescription}`, 'info');
            
            // Initialize task state
            this.currentTask = {
                description: taskDescription,
                type: this.identifyTaskType(taskDescription),
                startTime: Date.now(),
                status: 'in_progress',
                options: options
            };
            
            this.taskSteps = [];
            this.evaluationHistory = [];
            this.stepCount = 0;
            
            // Create new browser session
            await this.createSession();
            
            // Main execution loop: Observe → Decide → Act → Evaluate
            while (this.stepCount < this.config.maxStepsPerTask) {
                this.stepCount++;
                
                this.log(`Step ${this.stepCount}: Starting ODAE cycle`, 'info');
                
                // OBSERVE: Gather current state
                const observation = await this.observe();
                
                // DECIDE: Determine next action based on observation
                const decision = await this.decide(observation);
                
                // Check if task is complete
                if (decision.taskComplete) {
                    this.log('Task marked as complete by decision engine', 'success');
                    break;
                }
                
                // ACT: Execute the decided action
                const actionResult = await this.act(decision);
                
                // EVALUATE: Assess the outcome
                const evaluation = await this.evaluate(actionResult);
                
                // Store step data
                this.taskSteps.push({
                    step: this.stepCount,
                    observation,
                    decision,
                    actionResult,
                    evaluation,
                    timestamp: Date.now()
                });
                
                // Check if evaluation indicates failure or need for retry
                if (evaluation.shouldRetry) {
                    this.log(`Step ${this.stepCount}: Retrying due to evaluation feedback`, 'warning');
                    continue;
                }
                
                if (evaluation.taskComplete) {
                    this.log('Task completed successfully based on evaluation', 'success');
                    break;
                }
                
                // Brief pause between steps
                await this.sleep(this.config.evaluationInterval);
            }
            
            // Final task evaluation
            const finalResult = await this.finalizeTask();
            
            this.log(`Task completed in ${this.stepCount} steps`, 'success');
            return finalResult;
            
        } catch (error) {
            this.log(`Autonomous task failed: ${error.message}`, 'error');
            this.currentTask.status = 'failed';
            this.currentTask.error = error.message;
            throw error;
        }
    }

    /**
     * OBSERVE: Gather comprehensive information about current page state
     */
    async observe() {
        this.log('OBSERVE: Gathering page state...', 'info');
        
        try {
            const observation = {
                url: this.page.url(),
                title: await this.page.title(),
                timestamp: Date.now(),
                step: this.stepCount
            };
            
            // Take screenshot for visual analysis
            observation.screenshot = await this.page.screenshot({
                type: 'png',
                quality: this.config.screenshotQuality,
                encoding: 'base64'
            });
            
            // Extract interactive elements
            observation.interactiveElements = await this.extractInteractiveElements();
            
            // Get page text content
            observation.pageText = await this.page.locator('body').textContent();
            
            // Extract forms
            observation.forms = await this.extractForms();
            
            // Get current scroll position and page dimensions
            observation.pageInfo = await this.page.evaluate(() => ({
                scrollY: window.scrollY,
                scrollHeight: document.body.scrollHeight,
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth
            }));
            
            this.log('OBSERVE: Complete', 'success');
            return observation;
            
        } catch (error) {
            this.log(`OBSERVE failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * DECIDE: Use AI to determine the next best action based on observation
     */
    async decide(observation) {
        this.log('DECIDE: Analyzing observation and planning next action...', 'info');
        
        try {
            const strategy = this.taskStrategies[this.currentTask.type] || {};
            
            const prompt = this.buildDecisionPrompt(observation, strategy);
            
            // Use vision model with screenshot for better decision making
            const result = await this.visionModel.generateContent([
                prompt,
                {
                    inlineData: {
                        data: observation.screenshot,
                        mimeType: 'image/png'
                    }
                }
            ]);
            
            const decisionText = result.response.text();
            const decision = this.parseDecision(decisionText);
            
            this.log(`DECIDE: Next action - ${decision.action} with confidence ${decision.confidence}`, 'info');
            return decision;
            
        } catch (error) {
            this.log(`DECIDE failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * ACT: Execute the decided action
     */
    async act(decision) {
        this.log(`ACT: Executing ${decision.action}...`, 'info');
        
        try {
            let result = { success: false, message: '', data: null };
            
            switch (decision.action) {
                case 'navigate':
                    result = await this.executeNavigation(decision.parameters);
                    break;
                case 'click':
                    result = await this.executeClick(decision.parameters);
                    break;
                case 'type':
                    result = await this.executeType(decision.parameters);
                    break;
                case 'search':
                    result = await this.executeSearch(decision.parameters);
                    break;
                case 'scroll':
                    result = await this.executeScroll(decision.parameters);
                    break;
                case 'wait':
                    result = await this.executeWait(decision.parameters);
                    break;
                case 'extract_data':
                    result = await this.executeDataExtraction(decision.parameters);
                    break;
                default:
                    throw new Error(`Unknown action: ${decision.action}`);
            }
            
            this.log(`ACT: ${decision.action} ${result.success ? 'succeeded' : 'failed'}`, 
                    result.success ? 'success' : 'warning');
            
            return result;
            
        } catch (error) {
            this.log(`ACT failed: ${error.message}`, 'error');
            return { success: false, message: error.message, data: null };
        }
    }

    /**
     * EVALUATE: Assess the outcome of the action and determine next steps
     */
    async evaluate(actionResult) {
        this.log('EVALUATE: Assessing action outcome...', 'info');
        
        try {
            const currentObservation = await this.observe();
            
            const evaluation = {
                actionSuccess: actionResult.success,
                taskProgress: await this.assessTaskProgress(currentObservation),
                shouldRetry: false,
                taskComplete: false,
                confidence: 0,
                nextSuggestion: null,
                timestamp: Date.now()
            };
            
            // Use AI to evaluate current state against task goals
            const evaluationPrompt = this.buildEvaluationPrompt(currentObservation, actionResult);
            
            const result = await this.visionModel.generateContent([
                evaluationPrompt,
                {
                    inlineData: {
                        data: currentObservation.screenshot,
                        mimeType: 'image/png'
                    }
                }
            ]);
            
            const aiEvaluation = this.parseEvaluation(result.response.text());
            
            // Merge AI evaluation with basic evaluation
            Object.assign(evaluation, aiEvaluation);
            
            this.evaluationHistory.push(evaluation);
            
            this.log(`EVALUATE: Progress ${evaluation.taskProgress}%, Complete: ${evaluation.taskComplete}`, 'info');
            
            return evaluation;
            
        } catch (error) {
            this.log(`EVALUATE failed: ${error.message}`, 'error');
            return {
                actionSuccess: false,
                taskProgress: 0,
                shouldRetry: true,
                taskComplete: false,
                confidence: 0,
                error: error.message
            };
        }
    }

    // ... Additional helper methods will continue in next part
    
    /**
     * Extract interactive elements from the page
     */
    async extractInteractiveElements() {
        return await this.page.evaluate(() => {
            const elements = [];
            
            // Buttons
            document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach((el, index) => {
                elements.push({
                    type: 'button',
                    index,
                    text: el.textContent?.trim() || el.value || '',
                    id: el.id,
                    className: el.className,
                    selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className.split(' ').join('.')}` : ''),
                    visible: el.offsetParent !== null
                });
            });
            
            // Links
            document.querySelectorAll('a').forEach((el, index) => {
                if (el.href && el.textContent?.trim()) {
                    elements.push({
                        type: 'link',
                        index,
                        text: el.textContent.trim(),
                        href: el.href,
                        id: el.id,
                        className: el.className,
                        selector: `a[href="${el.href}"]`,
                        visible: el.offsetParent !== null
                    });
                }
            });
            
            // Input fields
            document.querySelectorAll('input, textarea, select').forEach((el, index) => {
                elements.push({
                    type: 'input',
                    inputType: el.type || 'text',
                    index,
                    placeholder: el.placeholder || '',
                    name: el.name,
                    id: el.id,
                    className: el.className,
                    value: el.value,
                    selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.name ? `[name="${el.name}"]` : ''),
                    visible: el.offsetParent !== null
                });
            });
            
            return elements.filter(el => el.visible);
        });
    }

    /**
     * Extract forms from the page
     */
    async extractForms() {
        return await this.page.evaluate(() => {
            const forms = Array.from(document.querySelectorAll('form'));
            return forms.map((form, index) => ({
                index,
                id: form.id,
                action: form.action,
                method: form.method,
                fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
                    type: field.type,
                    name: field.name,
                    id: field.id,
                    placeholder: field.placeholder,
                    required: field.required,
                    value: field.value
                }))
            }));
        });
    }

    /**
     * Build decision prompt for AI
     */
    buildDecisionPrompt(observation, strategy) {
        return `
You are Dyna, an autonomous web automation agent. Your goal is to complete the task: "${this.currentTask.description}"

CURRENT SITUATION:
- URL: ${observation.url}
- Page Title: ${observation.title}
- Step: ${this.stepCount}/${this.config.maxStepsPerTask}

TASK TYPE: ${this.currentTask.type}
STRATEGY: ${strategy.steps ? strategy.steps.join(' → ') : 'adaptive'}

AVAILABLE INTERACTIVE ELEMENTS:
${observation.interactiveElements.map(el => 
    `- ${el.type}: "${el.text}" (${el.selector})`
).join('\n')}

FORMS ON PAGE:
${observation.forms.map(form => 
    `- Form ${form.index}: ${form.fields.map(f => f.name || f.placeholder).join(', ')}`
).join('\n')}

PAGE CONTEXT:
${observation.pageText.substring(0, 1000)}...

PREVIOUS STEPS:
${this.taskSteps.slice(-3).map(step => 
    `Step ${step.step}: ${step.decision.action} - ${step.evaluation.taskProgress}% complete`
).join('\n')}

INSTRUCTIONS:
1. Analyze the current page and determine the BEST next action to progress toward the goal
2. Consider the task type and appropriate strategy
3. Be specific about which element to interact with
4. Provide confidence level (0-1)

Respond in this JSON format:
{
    "action": "navigate|click|type|search|scroll|wait|extract_data",
    "parameters": {
        "selector": "CSS selector or element description",
        "text": "text to type (if applicable)",
        "url": "URL to navigate to (if applicable)",
        "data": "specific data to extract (if applicable)"
    },
    "reasoning": "Why this action will help complete the task",
    "confidence": 0.85,
    "taskComplete": false,
    "expectedOutcome": "What should happen after this action"
}
`;
    }

    /**
     * Build evaluation prompt for AI
     */
    buildEvaluationPrompt(observation, actionResult) {
        const lastStep = this.taskSteps[this.taskSteps.length - 1];
        
        return `
You are evaluating the outcome of an action for the task: "${this.currentTask.description}"

LAST ACTION TAKEN:
Action: ${lastStep?.decision.action}
Parameters: ${JSON.stringify(lastStep?.decision.parameters)}
Success: ${actionResult.success}
Message: ${actionResult.message}

CURRENT PAGE STATE:
- URL: ${observation.url}
- Title: ${observation.title}

TASK PROGRESS INDICATORS:
${this.getTaskProgressIndicators(observation)}

EVALUATION CRITERIA for ${this.currentTask.type}:
${this.getEvaluationCriteria()}

Respond in this JSON format:
{
    "taskProgress": 75,
    "taskComplete": false,
    "shouldRetry": false,
    "confidence": 0.9,
    "nextSuggestion": "click on search button",
    "reasoning": "The form has been filled correctly, now need to submit",
    "progressIndicators": ["form filled", "ready to submit"]
}
`;
    }

    /**
     * Parse AI decision response
     */
    parseDecision(decisionText) {
        try {
            // Extract JSON from response
            const jsonMatch = decisionText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in decision response');
            }
            
            const decision = JSON.parse(jsonMatch[0]);
            
            // Validate decision structure
            if (!decision.action) {
                throw new Error('Decision missing action field');
            }
            
            // Set defaults
            decision.confidence = decision.confidence || 0.5;
            decision.parameters = decision.parameters || {};
            decision.taskComplete = decision.taskComplete || false;
            
            return decision;
            
        } catch (error) {
            this.log(`Failed to parse decision: ${error.message}`, 'warning');
            // Fallback decision
            return {
                action: 'wait',
                parameters: { duration: 2000 },
                reasoning: 'Failed to parse AI decision, waiting before retry',
                confidence: 0.1,
                taskComplete: false
            };
        }
    }

    /**
     * Parse AI evaluation response
     */
    parseEvaluation(evaluationText) {
        try {
            const jsonMatch = evaluationText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in evaluation response');
            }
            
            const evaluation = JSON.parse(jsonMatch[0]);
            
            // Set defaults
            evaluation.taskProgress = Math.max(0, Math.min(100, evaluation.taskProgress || 0));
            evaluation.taskComplete = evaluation.taskComplete || false;
            evaluation.shouldRetry = evaluation.shouldRetry || false;
            evaluation.confidence = evaluation.confidence || 0.5;
            
            return evaluation;
            
        } catch (error) {
            this.log(`Failed to parse evaluation: ${error.message}`, 'warning');
            return {
                taskProgress: 10,
                taskComplete: false,
                shouldRetry: false,
                confidence: 0.1,
                reasoning: 'Failed to parse AI evaluation'
            };
        }
    }

    /**
     * Execute navigation action
     */
    async executeNavigation(parameters) {
        try {
            const url = parameters.url || parameters.selector;
            this.log(`Navigating to: ${url}`, 'info');
            
            await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            
            return {
                success: true,
                message: `Successfully navigated to ${url}`,
                data: { url: this.page.url() }
            };
        } catch (error) {
            return {
                success: false,
                message: `Navigation failed: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * Execute click action
     */
    async executeClick(parameters) {
        try {
            const selector = parameters.selector;
            this.log(`Clicking element: ${selector}`, 'info');
            
            // Wait for element to be visible and clickable
            await this.page.waitForSelector(selector, { timeout: 10000 });
            
            // Scroll element into view if needed
            await this.page.locator(selector).scrollIntoViewIfNeeded();
            
            // Click the element
            await this.page.click(selector);
            
            // Wait a moment for any page changes
            await this.sleep(1000);
            
            return {
                success: true,
                message: `Successfully clicked ${selector}`,
                data: { selector }
            };
        } catch (error) {
            return {
                success: false,
                message: `Click failed: ${error.message}`,
                data: { selector: parameters.selector }
            };
        }
    }

    /**
     * Execute type action
     */
    async executeType(parameters) {
        try {
            const selector = parameters.selector;
            const text = parameters.text;
            
            this.log(`Typing "${text}" into ${selector}`, 'info');
            
            await this.page.waitForSelector(selector, { timeout: 10000 });
            
            // Clear existing content
            await this.page.fill(selector, '');
            
            // Type new text
            await this.page.type(selector, text, { delay: 100 });
            
            return {
                success: true,
                message: `Successfully typed "${text}" into ${selector}`,
                data: { selector, text }
            };
        } catch (error) {
            return {
                success: false,
                message: `Type failed: ${error.message}`,
                data: { selector: parameters.selector, text: parameters.text }
            };
        }
    }

    /**
     * Execute search action (combination of type + click search button)
     */
    async executeSearch(parameters) {
        try {
            const query = parameters.text || parameters.query;
            const searchSelector = parameters.selector || 'input[type="search"], input[name*="search"], input[placeholder*="search"], input[placeholder*="Search"]';
            
            this.log(`Searching for: ${query}`, 'info');
            
            // Type in search box
            const typeResult = await this.executeType({ selector: searchSelector, text: query });
            if (!typeResult.success) {
                return typeResult;
            }
            
            // Look for search button or press Enter
            const searchButton = await this.page.locator('button:has-text("Search"), input[type="submit"], button[type="submit"]').first();
            
            if (await searchButton.count() > 0) {
                await searchButton.click();
            } else {
                // Press Enter as fallback
                await this.page.press(searchSelector, 'Enter');
            }
            
            // Wait for search results
            await this.sleep(3000);
            
            return {
                success: true,
                message: `Successfully searched for "${query}"`,
                data: { query, searchSelector }
            };
        } catch (error) {
            return {
                success: false,
                message: `Search failed: ${error.message}`,
                data: { query: parameters.text }
            };
        }
    }

    /**
     * Execute scroll action
     */
    async executeScroll(parameters) {
        try {
            const direction = parameters.direction || 'down';
            const amount = parameters.amount || 500;
            
            if (direction === 'down') {
                await this.page.mouse.wheel(0, amount);
            } else if (direction === 'up') {
                await this.page.mouse.wheel(0, -amount);
            }
            
            await this.sleep(1000);
            
            return {
                success: true,
                message: `Scrolled ${direction} by ${amount}px`,
                data: { direction, amount }
            };
        } catch (error) {
            return {
                success: false,
                message: `Scroll failed: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * Execute wait action
     */
    async executeWait(parameters) {
        const duration = parameters.duration || 2000;
        await this.sleep(duration);
        
        return {
            success: true,
            message: `Waited for ${duration}ms`,
            data: { duration }
        };
    }

    /**
     * Execute data extraction
     */
    async executeDataExtraction(parameters) {
        try {
            const dataType = parameters.data || 'general';
            
            let extractedData = {};
            
            switch (dataType) {
                case 'prices':
                    extractedData = await this.extractPrices();
                    break;
                case 'products':
                    extractedData = await this.extractProducts();
                    break;
                case 'links':
                    extractedData = await this.extractLinks();
                    break;
                default:
                    extractedData = await this.extractGeneralData();
            }
            
            return {
                success: true,
                message: `Successfully extracted ${dataType} data`,
                data: extractedData
            };
        } catch (error) {
            return {
                success: false,
                message: `Data extraction failed: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * Get task progress indicators based on task type
     */
    getTaskProgressIndicators(observation) {
        const url = observation.url.toLowerCase();
        const title = observation.title.toLowerCase();
        const text = observation.pageText.toLowerCase();
        
        const indicators = [];
        
        switch (this.currentTask.type) {
            case 'search_flights':
                if (url.includes('expedia') || url.includes('kayak') || url.includes('booking')) {
                    indicators.push('on flight booking site');
                }
                if (text.includes('from') && text.includes('to')) {
                    indicators.push('flight search form visible');
                }
                if (text.includes('results') || text.includes('flights found')) {
                    indicators.push('search results displayed');
                }
                break;
                
            case 'play_music':
                if (url.includes('youtube')) {
                    indicators.push('on youtube');
                }
                if (text.includes('playing') || text.includes('pause')) {
                    indicators.push('media player visible');
                }
                break;
                
            case 'apply_job':
                if (text.includes('application') || text.includes('apply')) {
                    indicators.push('job application page');
                }
                if (text.includes('submit') || text.includes('send')) {
                    indicators.push('application form ready');
                }
                break;
        }
        
        return indicators;
    }

    /**
     * Get evaluation criteria for current task type
     */
    getEvaluationCriteria() {
        const criteria = this.taskStrategies[this.currentTask.type]?.evaluation_criteria || [];
        return criteria.join(', ');
    }

    /**
     * Assess overall task progress
     */
    async assessTaskProgress(observation) {
        const indicators = this.getTaskProgressIndicators(observation);
        const maxIndicators = this.taskStrategies[this.currentTask.type]?.steps?.length || 5;
        
        return Math.min(100, (indicators.length / maxIndicators) * 100);
    }

    /**
     * Extract prices from the page
     */
    async extractPrices() {
        return await this.page.evaluate(() => {
            const priceElements = document.querySelectorAll('[class*="price"], [class*="cost"], [class*="amount"]');
            const prices = [];
            
            priceElements.forEach(el => {
                const text = el.textContent.trim();
                const priceMatch = text.match(/\$[\d,]+\.?\d*/);
                if (priceMatch) {
                    prices.push({
                        text: text,
                        price: priceMatch[0],
                        element: el.tagName + (el.className ? '.' + el.className.split(' ').join('.') : '')
                    });
                }
            });
            
            return prices;
        });
    }

    /**
     * Finalize task execution
     */
    async finalizeTask() {
        const endTime = Date.now();
        const duration = endTime - this.currentTask.startTime;
        
        const finalObservation = await this.observe();
        const finalEvaluation = await this.evaluate({ success: true, message: 'Task finalization' });
        
        const result = {
            task: this.currentTask,
            duration: duration,
            stepsCompleted: this.stepCount,
            finalUrl: finalObservation.url,
            finalTitle: finalObservation.title,
            success: finalEvaluation.taskComplete || finalEvaluation.taskProgress > 80,
            confidence: finalEvaluation.confidence,
            steps: this.taskSteps,
            evaluationHistory: this.evaluationHistory
        };
        
        this.log(`Task finalized: ${result.success ? 'SUCCESS' : 'PARTIAL'} (${duration}ms, ${this.stepCount} steps)`, 
                result.success ? 'success' : 'warning');
        
        return result;
    }
    
    /**
     * Identify the type of task based on description
     */
    identifyTaskType(taskDescription) {
        const lowerDesc = taskDescription.toLowerCase();
        
        if (lowerDesc.includes('flight') || lowerDesc.includes('book') && lowerDesc.includes('travel')) {
            return 'search_flights';
        }
        if (lowerDesc.includes('music') || lowerDesc.includes('play') || lowerDesc.includes('song')) {
            return 'play_music';
        }
        if (lowerDesc.includes('job') || lowerDesc.includes('apply') || lowerDesc.includes('career')) {
            return 'apply_job';
        }
        
        return 'general_task';
    }

    /**
     * Create a new browser session
     */
    async createSession() {
        try {
            this.log('Creating new browser session...', 'info');
            
            this.session = await this.bb.createSession();
            this.log(`Session created with ID: ${this.session.id}`, 'success');
            
            this.browser = await chromium.connectOverCDP(this.session.connectUrl);
            this.context = this.browser.contexts()[0];
            this.page = this.context.pages()[0];
            
            this.sessionStartTime = Date.now();
            
            // Set up page event listeners
            this.page.on('console', msg => this.log(`Browser console: ${msg.text()}`, 'debug'));
            this.page.on('pageerror', err => this.log(`Page error: ${err.message}`, 'warning'));
            
        } catch (error) {
            this.log(`Session creation failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Utility methods
     */
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('BrowserAgent not initialized. Call initialize() first.');
        }
    }

    log(message, level = 'info') {
        if (!this.config.enableLogging) return;
        
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        console.log(`${prefix} ${message}`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = EnhancedBrowserAgent;
