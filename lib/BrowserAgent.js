const { chromium } = require('playwright-core');
const { Browserbase } = require('@browserbasehq/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');

/**
 * BrowserAgent - Comprehensive browser automation agent
 * Combines Browserbase, Playwright, and Gemini AI for intelligent web automation
 */
class BrowserAgent {
    constructor(options = {}) {
        this.browserbaseApiKey = options.browserbaseApiKey || process.env.BROWSERBASE_API_KEY;
        this.browserbaseProjectId = options.browserbaseProjectId || process.env.BROWSERBASE_PROJECT_ID;
        this.geminiApiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
        
        // Configuration
        this.config = {
            sessionTimeout: options.sessionTimeout || parseInt(process.env.SESSION_TIMEOUT) || 300000,
            maxRetries: options.maxRetries || parseInt(process.env.MAX_RETRIES) || 3,
            screenshotQuality: options.screenshotQuality || parseInt(process.env.SCREENSHOT_QUALITY) || 80,
            enableLogging: options.enableLogging !== undefined ? options.enableLogging : process.env.ENABLE_LOGGING === 'true'
        };
        
        // State
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
        
        this.log('BrowserAgent instance created', 'info');
    }

    /**
     * Initialize the browser agent with Browserbase session and Playwright connection
     */
    async initialize() {
        try {
            this.log('Initializing BrowserAgent...', 'info');
            
            // Check if API keys are provided
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
                apiKey: this.browserbaseApiKey
            });
            
            // Initialize Gemini AI
            this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
            this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            this.visionModel = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            // Create Browserbase session
            this.session = await this.bb.createSession({
                projectId: this.browserbaseProjectId,
                keepAlive: true
            });
            
            this.sessionStartTime = Date.now();
            this.log(`Browserbase session created: ${this.session.id}`, 'success');
            
            // Connect Playwright to Browserbase session
            this.browser = await chromium.connectOverCDP(this.session.connectUrl);
            
            // Use default context as recommended
            this.context = this.browser.contexts()[0];
            this.page = this.context.pages()[0];
            
            // Set up page defaults
            await this.page.setViewportSize({ width: 1920, height: 1080 });
            
            this.isInitialized = true;
            this.log('BrowserAgent initialized successfully', 'success');
            
            // Construct replay URL manually if not provided
            const replayUrl = this.session.replayUrl || `https://app.browserbase.com/sessions/${this.session.id}`;
            
            return {
                success: true,
                sessionId: this.session.id,
                replayUrl: replayUrl
            };
            
        } catch (error) {
            this.log(`Failed to initialize BrowserAgent: ${error.message}`, 'error');
            throw new Error(`BrowserAgent initialization failed: ${error.message}`);
        }
    }

    /**
     * Navigate to URL and complete specified task
     */
    async navigateAndProcess(url, task, options = {}) {
        this.ensureInitialized();
        
        try {
            this.log(`Navigating to ${url} with task: ${task}`, 'info');
            
            // Navigate to URL
            await this.page.goto(url, { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            
            this.log(`Successfully navigated to ${url}`, 'success');
            
            // Wait for page to stabilize
            await this.page.waitForTimeout(2000);
            
            // Analyze page and execute task
            const result = await this.analyzePageWithGemini(task, {
                includeScreenshot: true,
                includeDom: true,
                ...options
            });
            
            return result;
            
        } catch (error) {
            this.log(`Navigation and processing failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Use Gemini to analyze current page and provide actionable insights
     */
    async analyzePageWithGemini(instruction, options = {}) {
        this.ensureInitialized();
        
        try {
            this.log(`Analyzing page with instruction: ${instruction}`, 'info');
            
            const analysisData = await this.gatherPageData(options);
            
            // Construct comprehensive prompt for Gemini
            const prompt = this.buildAnalysisPrompt(instruction, analysisData, options);
            
            // Get AI analysis
            let result;
            if (options.includeScreenshot && analysisData.screenshot) {
                // Use vision model for screenshot analysis
                const parts = [
                    {
                        text: prompt
                    }
                ];
                
                // Add screenshot if available
                if (analysisData.screenshot) {
                    parts.push({
                        inlineData: {
                            data: analysisData.screenshot,
                            mimeType: 'image/png'
                        }
                    });
                }
                
                result = await this.visionModel.generateContent(parts);
            } else {
                // Use text model for DOM analysis
                result = await this.model.generateContent(prompt);
            }
            
            const analysis = result.response.text();
            this.log('AI analysis completed', 'success');
            
            // Parse and execute actions if requested
            if (options.executeActions !== false) {
                const actions = this.parseActionsFromAnalysis(analysis);
                if (actions.length > 0) {
                    await this.executeActionSequence(actions);
                }
            }
            
            return {
                analysis,
                pageData: analysisData,
                actions: this.parseActionsFromAnalysis(analysis)
            };
            
        } catch (error) {
            this.log(`Page analysis failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Execute a specific browser action based on AI decisions
     */
    async executeAction(actionType, parameters, retryCount = 0) {
        this.ensureInitialized();
        
        try {
            this.log(`Executing action: ${actionType}`, 'info');
            
            switch (actionType.toLowerCase()) {
                case 'click':
                    await this.clickElement(parameters);
                    break;
                case 'type':
                case 'fill':
                    await this.fillElement(parameters);
                    break;
                case 'scroll':
                    await this.scrollPage(parameters);
                    break;
                case 'wait':
                    await this.waitForElement(parameters);
                    break;
                case 'navigate':
                    await this.page.goto(parameters.url);
                    break;
                case 'screenshot':
                    return await this.takeScreenshot();
                default:
                    throw new Error(`Unknown action type: ${actionType}`);
            }
            
            this.log(`Action ${actionType} completed successfully`, 'success');
            return { success: true, actionType, parameters };
            
        } catch (error) {
            this.log(`Action ${actionType} failed: ${error.message}`, 'error');
            
            if (retryCount < this.config.maxRetries) {
                this.log(`Retrying action ${actionType} (attempt ${retryCount + 1})`, 'warning');
                await this.page.waitForTimeout(1000);
                return await this.executeAction(actionType, parameters, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Gather comprehensive page data for AI analysis
     */
    async gatherPageData(options = {}) {
        const data = {
            url: this.page.url(),
            title: await this.page.title(),
            timestamp: new Date().toISOString()
        };
        
        try {
            // Screenshot for Gemini Vision model analysis
            if (options.includeScreenshot !== false) {
                let screenshotData = await this.page.screenshot({
                    type: 'png',
                    encoding: 'base64'
                    // Note: quality is not supported for PNG, only for JPEG
                });
                
                // Handle both Buffer and string returns
                if (Buffer.isBuffer(screenshotData)) {
                    data.screenshot = screenshotData.toString('base64');
                    this.log(`Screenshot converted from Buffer to base64 string: ${data.screenshot.length} characters`, 'debug');
                } else if (typeof screenshotData === 'string') {
                    data.screenshot = screenshotData;
                    this.log(`Screenshot returned as base64 string: ${data.screenshot.length} characters`, 'debug');
                } else {
                    this.log(`Warning: Screenshot returned unexpected type: ${typeof screenshotData}`, 'warning');
                    data.screenshot = null;
                }
            }
            
            // DOM content
            if (options.includeDom !== false) {
                data.bodyText = await this.page.locator('body').textContent();
                data.forms = await this.extractForms();
                data.links = await this.extractLinks();
                data.buttons = await this.extractButtons();
            }
            
            // Page metrics
            if (options.includeMetrics) {
                data.metrics = await this.page.evaluate(() => ({
                    loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
                    domReady: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
                    pageHeight: document.body.scrollHeight,
                    pageWidth: document.body.scrollWidth
                }));
            }
            
        } catch (error) {
            this.log(`Error gathering page data: ${error.message}`, 'warning');
        }
        
        return data;
    }

    /**
     * Extract form information from the page
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
     * Extract link information from the page
     */
    async extractLinks() {
        return await this.page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            return links.slice(0, 50).map((link, index) => ({
                index,
                text: link.textContent.trim(),
                href: link.href,
                id: link.id,
                className: link.className
            }));
        });
    }

    /**
     * Extract button information from the page
     */
    async extractButtons() {
        return await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
            return buttons.map((button, index) => ({
                index,
                text: button.textContent.trim() || button.value,
                type: button.type,
                id: button.id,
                className: button.className,
                disabled: button.disabled
            }));
        });
    }

    /**
     * Build comprehensive analysis prompt for Gemini
     */
    buildAnalysisPrompt(instruction, pageData, options = {}) {
        let prompt = `You are an intelligent browser automation agent analyzing a web page to complete this task: "${instruction}"\n\n`;
        
        prompt += `Current page information:\n`;
        prompt += `URL: ${pageData.url}\n`;
        prompt += `Title: ${pageData.title}\n\n`;
        
        if (pageData.bodyText) {
            prompt += `Page content (first 2000 characters):\n${pageData.bodyText.slice(0, 2000)}\n\n`;
        }
        
        if (pageData.forms && pageData.forms.length > 0) {
            prompt += `Available forms:\n`;
            pageData.forms.forEach(form => {
                prompt += `- Form ${form.index}: ${form.fields.length} fields\n`;
            });
            prompt += '\n';
        }
        
        if (pageData.buttons && pageData.buttons.length > 0) {
            prompt += `Available buttons:\n`;
            pageData.buttons.slice(0, 10).forEach(button => {
                prompt += `- "${button.text}" (${button.type})\n`;
            });
            prompt += '\n';
        }
        
        prompt += `Please analyze the page and provide:\n`;
        prompt += `1. What you can see and understand about the current page\n`;
        prompt += `2. How to complete the requested task: "${instruction}"\n`;
        prompt += `3. Specific actions needed (if any) in this format:\n`;
        prompt += `   ACTION: click|type|scroll|wait\n`;
        prompt += `   TARGET: element selector or description\n`;
        prompt += `   VALUE: value to enter (for type actions)\n`;
        prompt += `   REASON: why this action is needed\n\n`;
        
        prompt += `Be specific and actionable in your response.`;
        
        return prompt;
    }

    /**
     * Parse actions from AI analysis response
     */
    parseActionsFromAnalysis(analysis) {
        const actions = [];
        const lines = analysis.split('\n');
        
        let currentAction = {};
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('ACTION:')) {
                if (currentAction.type) {
                    actions.push(currentAction);
                }
                currentAction = { type: trimmed.replace('ACTION:', '').trim().toLowerCase() };
            } else if (trimmed.startsWith('TARGET:')) {
                currentAction.target = trimmed.replace('TARGET:', '').trim();
            } else if (trimmed.startsWith('VALUE:')) {
                currentAction.value = trimmed.replace('VALUE:', '').trim();
            } else if (trimmed.startsWith('REASON:')) {
                currentAction.reason = trimmed.replace('REASON:', '').trim();
            }
        }
        
        if (currentAction.type) {
            actions.push(currentAction);
        }
        
        return actions;
    }

    /**
     * Execute a sequence of actions
     */
    async executeActionSequence(actions) {
        this.log(`Executing ${actions.length} actions`, 'info');
        
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            this.log(`Executing action ${i + 1}/${actions.length}: ${action.type}`, 'info');
            
            try {
                await this.executeAction(action.type, action);
                await this.page.waitForTimeout(1000); // Wait between actions
            } catch (error) {
                this.log(`Failed to execute action ${i + 1}: ${error.message}`, 'error');
                // Continue with next action
            }
        }
    }

    /**
     * Click an element based on various selectors
     */
    async clickElement(parameters) {
        const { target, text } = parameters;
        
        let locator;
        
        if (target) {
            // Try different selector strategies
            try {
                locator = this.page.locator(target);
                await locator.first().click();
                return;
            } catch (error) {
                // Continue to text-based search
            }
        }
        
        if (text) {
            // Try clicking by text content
            locator = this.page.getByText(text);
            await locator.first().click();
        }
    }

    /**
     * Fill an element with text
     */
    async fillElement(parameters) {
        const { target, value, text } = parameters;
        
        let locator;
        
        if (target) {
            locator = this.page.locator(target);
        } else if (text) {
            locator = this.page.getByPlaceholder(text).or(this.page.getByLabel(text));
        }
        
        if (locator) {
            await locator.first().fill(value);
        }
    }

    /**
     * Scroll the page
     */
    async scrollPage(parameters) {
        const { direction = 'down', amount = 500 } = parameters;
        
        if (direction === 'down') {
            await this.page.mouse.wheel(0, amount);
        } else if (direction === 'up') {
            await this.page.mouse.wheel(0, -amount);
        }
    }

    /**
     * Wait for an element to appear
     */
    async waitForElement(parameters) {
        const { target, timeout = 10000 } = parameters;
        
        if (target) {
            await this.page.waitForSelector(target, { timeout });
        }
    }

    /**
     * Take a screenshot of the current page for AI analysis
     */
    async takeScreenshot(options = {}) {
        this.ensureInitialized();
        
        const screenshot = await this.page.screenshot({
            type: 'png',
            fullPage: options.fullPage || false,
            ...options
            // Note: quality option removed for PNG compatibility
        });
        
        return screenshot;
    }

    /**
     * Get session information
     */
    getSessionInfo() {
        const replayUrl = this.session?.replayUrl || (this.session?.id ? `https://app.browserbase.com/sessions/${this.session.id}` : null);
        return {
            sessionId: this.session?.id,
            replayUrl: replayUrl,
            isInitialized: this.isInitialized,
            sessionAge: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0
        };
    }

    /**
     * Check if session is still valid (within timeout)
     */
    isSessionValid() {
        if (!this.sessionStartTime) return false;
        return (Date.now() - this.sessionStartTime) < this.config.sessionTimeout;
    }

    /**
     * Ensure the agent is initialized
     */
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('BrowserAgent is not initialized. Call initialize() first.');
        }
        
        if (!this.isSessionValid()) {
            throw new Error('Browser session has expired. Please reinitialize.');
        }
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        try {
            this.log('Cleaning up BrowserAgent resources...', 'info');
            
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            
            if (this.session && this.bb) {
                // Note: Browserbase sessions typically auto-cleanup
                // but you can implement explicit cleanup if needed
            }
            
            this.isInitialized = false;
            this.log('BrowserAgent cleanup completed', 'success');
            
        } catch (error) {
            this.log(`Cleanup error: ${error.message}`, 'error');
        }
    }

    /**
     * Logging utility
     */
    log(message, level = 'info') {
        if (!this.config.enableLogging) return;
        
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [BrowserAgent] [${level.toUpperCase()}]`;
        
        switch (level) {
            case 'error':
                console.error(`${prefix} ${message}`);
                break;
            case 'warning':
                console.warn(`${prefix} ${message}`);
                break;
            case 'success':
                console.log(`\x1b[32m${prefix} ${message}\x1b[0m`);
                break;
            default:
                console.log(`${prefix} ${message}`);
        }
    }
}

module.exports = BrowserAgent;
