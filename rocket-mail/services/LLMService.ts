import { IHttp, ILogger } from '@rocket.chat/apps-engine/definition/accessors';
import { 
    ILLMEmailAction, 
    ILLMTaskRequest, 
    ILLMTaskResult, 
    LLMEmailActionType,
} from '../models/LLMTask';

export class LLMService {
    private apiUrl = 'https://api.deepinfra.com/v1/inference/mistralai/Mixtral-8x7B-Instruct-v0.1';
    private apiKey: string;

    constructor(
        private readonly http: IHttp,
        private readonly logger: ILogger
    ) {
        // In a real app, we would get this from the app's settings
        this.apiKey = process.env.DEEPINFRA_API_KEY || '';
    }

    /**
     * Process an email task using LLM
     */
    public async processEmailTask(taskRequest: ILLMTaskRequest): Promise<ILLMEmailAction> {
        this.logger.debug(`LLMService.processEmailTask -> Processing task: ${taskRequest.task}`);
        
        const prompt = `You are an email assistant that helps users process email-related tasks. 
Based on the user's request, determine what email action they want to perform and extract relevant parameters.

Possible actions:
1. search-emails: Find emails matching certain criteria
2. count-emails: Count emails matching certain criteria
3. view-email: View a specific email or the latest email
4. send-email: Compose and send a new email
5. unknown: If the user's intent doesn't match any of the above

For the request: "${taskRequest.task}"

Respond in this JSON format only:
{
  "action": "one of [search-emails, count-emails, view-email, send-email, unknown]",
  "parameters": {
    // Parameters specific to the action
    // For search-emails: startDate, endDate, sender, subject, body, folder, limit
    // For count-emails: startDate, endDate, sender
    // For view-email: emailId (use "latest" for the most recent email)
    // For send-email: to, subject, body, cc
  }
}

EXTREMELY IMPORTANT: 
- For send-email, always include: "to" (email addresses), "subject" (can be empty string if no subject mentioned), and "body"
- If the user explicitly wants to send an email WITHOUT a subject or says "no subject", set subject to an empty string ""
- If the user doesn't mention subject at all, try to generate an appropriate subject based on the content
- Parse time periods like "yesterday", "last week", "today" into actual date ranges
- Extract email addresses accurately - they typically contain @ symbol
- Never make up email content that the user didn't specify
- Never add extra text to subject or body content beyond what the user specified`;
        
        try {
            const response = await this.http.post(this.apiUrl, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                data: {
                    input: prompt,
                    temperature: 0.1,
                    max_tokens: 1000
                }
            });
            
            if (response.statusCode !== 200) {
                const errorContent = typeof response.content === 'string' ? response.content : 'No content returned';
                this.logger.error(`LLMService.processEmailTask -> Error: ${errorContent}`);
                throw new Error(`LLM API returned status ${response.statusCode}`);
            }
            
            if (!response.content) {
                throw new Error('Empty response from LLM API');
            }
            
            const data = JSON.parse(response.content);
            if (!data.output) {
                throw new Error('Invalid response from LLM API');
            }
            
            // Extract the JSON from the response
            const jsonMatch = data.output.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Could not extract JSON from LLM response');
            }
            
            const llmResponse = JSON.parse(jsonMatch[0]);
            
            // Parse the LLM's response into our action format
            const emailAction: ILLMEmailAction = {
                action: this.mapActionType(llmResponse.action),
                parameters: llmResponse.parameters || {}
            };
            
            // For send email action, ensure parameters are properly formatted
            if (emailAction.action === LLMEmailActionType.SEND_EMAIL) {
                // Ensure to/recipient is always in array format
                if (typeof emailAction.parameters.to === 'string') {
                    emailAction.parameters.to = [emailAction.parameters.to];
                }
                
                // Handle case where a user explicitly wants no subject (check for phrases or empty string)
                const taskLower = taskRequest.task.toLowerCase();
                const noSubjectPhrases = ['no subject', 'without subject', 'without a subject'];
                
                const hasNoSubjectPhrase = noSubjectPhrases.some(phrase => taskLower.includes(phrase));
                
                // If user specifically wants no subject or subject is set to empty string, keep it that way
                if (hasNoSubjectPhrase || emailAction.parameters.subject === '') {
                    emailAction.parameters.subject = '';
                }
                // If subject is undefined but not explicitly requested to be empty, provide a default
                else if (emailAction.parameters.subject === undefined || emailAction.parameters.subject === null) {
                    // Try to generate a minimal subject from the body (first few words)
                    const bodyText = emailAction.parameters.body || '';
                    const subjectFromBody = bodyText.split(' ').slice(0, 3).join(' ');
                    emailAction.parameters.subject = subjectFromBody || 'No Subject';
                }
                
                // Ensure body is not undefined
                if (!emailAction.parameters.body) {
                    emailAction.parameters.body = emailAction.parameters.text || 'No content provided';
                }
            }
            
            // Handle special case for count emails
            if (emailAction.action === LLMEmailActionType.COUNT_EMAILS) {
                // If startDate or endDate is missing, set defaults
                if (!emailAction.parameters.startDate) {
                    // Default to 7 days ago
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                    emailAction.parameters.startDate = oneWeekAgo.toISOString().split('T')[0];
                }
                
                if (!emailAction.parameters.endDate) {
                    // Default to today
                    emailAction.parameters.endDate = new Date().toISOString().split('T')[0];
                }
            }
            
            this.logger.debug(`LLMService.processEmailTask -> Parsed action: ${JSON.stringify(emailAction)}`);
            return emailAction;
        } catch (error) {
            this.logger.error(`LLMService.processEmailTask -> Error: ${error.message}`);
            // Default to unknown action on error
            return {
                action: LLMEmailActionType.UNKNOWN,
                parameters: {}
            };
        }
    }
    
    /**
     * Format the task result using LLM
     */
    public async formatTaskResult(result: any, actionType: LLMEmailActionType): Promise<string> {
        this.logger.debug(`LLMService.formatTaskResult -> Formatting result for ${actionType}`);
        
        let promptContent = '';
        
        switch (actionType) {
            case LLMEmailActionType.SEARCH_EMAILS:
                promptContent = `You searched for emails and found ${result.count} matching emails. ${result.count > 0 ? 'Here\'s a summary:' : ''}`;
                if (result.count > 0) {
                    result.emails.forEach((email, index) => {
                        promptContent += `\n\n${index + 1}. From: ${email.from}`;
                        promptContent += `\n   Subject: ${email.subject}`;
                        promptContent += `\n   Date: ${email.date}`;
                        if (email.snippet) {
                            promptContent += `\n   Snippet: ${email.snippet}`;
                        }
                    });
                }
                break;
                
            case LLMEmailActionType.COUNT_EMAILS:
                promptContent = `I counted your emails based on your criteria. Found ${result.counts} emails.`;
                break;
                
            case LLMEmailActionType.VIEW_EMAIL:
                if (result.email) {
                    promptContent = `Here is the email you requested:\n\n`;
                    promptContent += `From: ${result.email.from}\n`;
                    promptContent += `To: ${result.email.to}\n`;
                    promptContent += `Subject: ${result.email.subject}\n`;
                    promptContent += `Date: ${result.email.date}\n\n`;
                    promptContent += `${result.email.bodyText || result.email.bodyHtml || 'No content available'}`;
                } else {
                    promptContent = `Could not find the requested email.`;
                }
                break;
                
            case LLMEmailActionType.SEND_EMAIL:
                promptContent = `Email has been sent to ${result.to} with subject "${result.subject || '(No Subject)'}".`;
                break;
                
            default:
                promptContent = `The operation completed but I'm not sure how to format the result: ${JSON.stringify(result)}`;
        }
        
        try {
            const response = await this.http.post(this.apiUrl, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                data: {
                    input: `You are an email assistant. Format this information into a friendly, conversational response: ${promptContent}`,
                    temperature: 0.7,
                    max_tokens: 500
                }
            });
            
            if (response.statusCode !== 200 || !response.content) {
                return promptContent; // Fall back to unformatted content
            }
            
            const data = JSON.parse(response.content);
            return typeof data.output === 'string' ? data.output : promptContent;
        } catch (error) {
            this.logger.error(`LLMService.formatTaskResult -> Error: ${error.message}`);
            return promptContent; // Fall back to unformatted content
        }
    }
    
    /**
     * Map string action to enum
     */
    private mapActionType(action: string): LLMEmailActionType {
        switch (action.toLowerCase()) {
            case 'search-emails':
                return LLMEmailActionType.SEARCH_EMAILS;
            case 'count-emails':
                return LLMEmailActionType.COUNT_EMAILS;
            case 'view-email':
                return LLMEmailActionType.VIEW_EMAIL;
            case 'send-email':
                return LLMEmailActionType.SEND_EMAIL;
            default:
                return LLMEmailActionType.UNKNOWN;
        }
    }
}
