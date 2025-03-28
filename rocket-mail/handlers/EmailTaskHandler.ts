import { IHttp, ILogger, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { LLMService } from '../services/LLMService';
import { GmailService } from '../services/GmailService';
import { OAuthService } from '../services/OAuthService';
import { 
    ILLMTaskRequest, 
    ILLMTaskResult, 
    LLMEmailActionType,
    IEmailSearchParams,
    IEmailCountParams,
    IEmailViewParams,
    IEmailSendParams 
} from '../models/LLMTask';
import { IEmailContent } from '../interfaces/IEmailService';
import { RocketMailApp } from '../RocketMailApp';

export class EmailTaskHandler {
    private llmService: LLMService;
    private oauthService: OAuthService;
    private initialized: boolean = false;

    constructor(
        private readonly app: RocketMailApp,
        private readonly http: IHttp,
        private readonly persistence: IPersistence,
        private readonly read: IRead,
        private readonly logger: ILogger
    ) {
        this.llmService = new LLMService(http, logger, app);
    }

    /**
     * Initialize services
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }
        
        // Initialize OAuth service with app settings
        const settings = {
            get: async (key: string) => {
                switch(key) {
                    case 'oauth_client_id':
                        return await this.app.getOAuthClientId();
                    case 'oauth_client_secret':
                        return await this.app.getOAuthClientSecret();
                    case 'oauth_redirect_uri':
                        return await this.app.getOAuthRedirectUri();
                    default:
                        return '';
                }
            }
        };
        
        this.oauthService = new OAuthService(
            this.http,
            this.persistence,
            this.read,
            this.logger,
            settings
        );

        await this.oauthService.initialize();
        this.initialized = true;
    }

    /**
     * Process an email task based on a user's request
     */
    public async processTask(userId: string, task: string): Promise<ILLMTaskResult> {
        try {
            // Ensure the handler is initialized
            await this.initialize();
            
            // Check if user is authenticated with Google
            const isAuthenticated = await this.oauthService.isAuthenticated(userId);
            if (!isAuthenticated) {
                return {
                    success: false,
                    message: '🔒 You need to authenticate with Google first. Please use `/rocket-mail auth` to connect your Gmail account.'
                };
            }

            // Process the task with LLM
            const taskRequest: ILLMTaskRequest = { userId, task };
            const emailAction = await this.llmService.processEmailTask(taskRequest);
            
            this.logger.debug('EmailTaskHandler.processTask -> Determined action:', emailAction);

            // Create Gmail service for the authenticated user
            const gmailService = new GmailService(
                userId,
                this.oauthService,
                this.http,
                this.logger
            );

            // Execute the appropriate action
            switch (emailAction.action) {
                case LLMEmailActionType.SEND_EMAIL:
                    return await this.handleSendEmail(gmailService, emailAction.parameters as IEmailSendParams);
                
                case LLMEmailActionType.VIEW_EMAIL:
                    return await this.handleViewEmail(gmailService, emailAction.parameters as IEmailViewParams);
                
                case LLMEmailActionType.SEARCH_EMAILS:
                    return await this.handleSearchEmails(gmailService, emailAction.parameters as IEmailSearchParams);
                
                case LLMEmailActionType.COUNT_EMAILS:
                    return await this.handleCountEmails(gmailService, emailAction.parameters as IEmailCountParams);
                
                default:
                    return {
                        success: false,
                        message: `❌ I couldn't understand what you want to do with your email. Please try again with a clearer request.`
                    };
            }
        } catch (error) {
            this.logger.error('EmailTaskHandler.processTask -> Error:', error);
            
            if (error.message.includes('authentication') || error.message.includes('auth') || error.message.includes('token')) {
                return {
                    success: false,
                    message: `❌ Authentication error: ${error.message}. Please try reconnecting with \`/rocket-mail auth\`.`
                };
            }
            
            return {
                success: false,
                message: `❌ Error processing your request: ${error.message}`
            };
        }
    }

    /**
     * Handle sending an email
     */
    private async handleSendEmail(gmailService: GmailService, params: IEmailSendParams): Promise<ILLMTaskResult> {
        try {
            // Validate required parameters
            const recipients = Array.isArray(params.to) ? params.to : [params.to];
            
            if (!recipients || recipients.length === 0 || !recipients[0]) {
                return {
                    success: false,
                    message: '❌ Missing recipient for the email. Please specify who you want to send the email to.'
                };
            }
            
            if (!params.body) {
                return {
                    success: false,
                    message: '❌ Missing content for the email. Please specify what you want to say in the email.'
                };
            }

            // Allow empty subject (subject can be an empty string)
            const subject = params.subject !== undefined ? params.subject : '';
            
            // Prepare email content
            const emailContent: IEmailContent = {
                from: 'me', // 'me' is a special alias in Gmail API that represents the authenticated user
                to: recipients.join(','),
                subject: subject,
                text: params.body,
                html: params.html
            };

            // Send the email
            await gmailService.sendEmail(emailContent);
            
            // Create success message
            const recipientText = recipients.length > 1 
                ? `${recipients.length} recipients` 
                : recipients[0];
            
            const subjectText = subject 
                ? `"${subject}"` 
                : '(No Subject)';
                
            return {
                success: true,
                message: `✅ Email sent successfully to ${recipientText} with subject ${subjectText}.`
            };
        } catch (error) {
            this.logger.error('EmailTaskHandler.handleSendEmail -> Error:', error);
            
            return {
                success: false,
                message: `❌ Failed to send email: ${error.message}`
            };
        }
    }

    /**
     * Handle viewing an email
     */
    private async handleViewEmail(gmailService: GmailService, params: IEmailViewParams): Promise<ILLMTaskResult> {
        this.logger.debug(`EmailTaskHandler.handleViewEmail -> Viewing email: ${params.emailId}`);
        
        if (params.emailId === 'latest' || params.emailId === 'last') {
            const email = await gmailService.getLastReceivedEmail();
            return { success: true, message: `✅ Last received email: ${email.subject}`, data: email };
        } else {
            const email = await gmailService.getEmailById(params.emailId);
            return { success: true, message: `✅ Email viewed successfully: ${email.subject}`, data: email };
        }
    }

    /**
     * Handle searching emails
     */
    private async handleSearchEmails(gmailService: GmailService, params: IEmailSearchParams): Promise<ILLMTaskResult> {
        this.logger.debug(`EmailTaskHandler.handleSearchEmails -> Searching with params: ${JSON.stringify(params)}`);
        
        const results = await gmailService.searchEmails(params);
        return {
            success: true,
            message: `✅ Found ${results.length} emails matching your search criteria.`,
            data: results
        };
    }

    /**
     * Handle counting emails
     */
    private async handleCountEmails(gmailService: GmailService, params: IEmailCountParams): Promise<ILLMTaskResult> {
        this.logger.debug(`EmailTaskHandler.handleCountEmails -> Counting with params: ${JSON.stringify(params)}`);
        
        const counts = await gmailService.countEmails(params);
        return {
            success: true,
            message: `✅ Email count: ${counts}`,
            data: counts
        };
    }
}
