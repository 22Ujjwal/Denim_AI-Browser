/**
 * Enhanced BrowserAgent Helper Methods - Part 2
 * Contains action execution, parsing, and evaluation methods
 */

// Add these methods to the EnhancedBrowserAgent class

const EnhancedBrowserAgentHelpers = {
    
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    /**
     * Get evaluation criteria for current task type
     */
    getEvaluationCriteria() {
        const criteria = this.taskStrategies[this.currentTask.type]?.evaluation_criteria || [];
        return criteria.join(', ');
    },

    /**
     * Assess overall task progress
     */
    async assessTaskProgress(observation) {
        const indicators = this.getTaskProgressIndicators(observation);
        const maxIndicators = this.taskStrategies[this.currentTask.type]?.steps?.length || 5;
        
        return Math.min(100, (indicators.length / maxIndicators) * 100);
    },

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
    },

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
};

module.exports = EnhancedBrowserAgentHelpers;
