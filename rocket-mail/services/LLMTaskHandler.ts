import { IHttp, ILogger, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { ILLMEmailAction, ILLMTaskResult, LLMEmailActionType } from "../models/LLMTask";
import { LLMService } from "./LLMService";
import { EmailService } from "./EmailService";
import { ContactService } from "./ContactService";
import { getEmailSettings } from "../config/SettingsManager";
import { IEmailSettings } from "../interfaces/IEmailService";
import { RocketMailApp } from "../RocketMailApp";

export class LLMTaskHandler {
    private llmService: LLMService;
    private logger: ILogger;

    constructor(
        private readonly read: IRead,
        private readonly http: IHttp,
        private readonly modify: IModify,
        private readonly persistence: IPersistence,
        private readonly contactService: ContactService,
        logger: ILogger,
        private readonly app?: RocketMailApp
    ) {
        this.llmService = new LLMService(http, logger, app);
        this.logger = logger;
    }

    public async processTask(task: string, sender: any): Promise<ILLMTaskResult> {
        try {
            // First, substitute any contact references in the task
            const processedTask = await this.processContactReferences(task, sender.id);
            
            // Send the task to the LLM for analysis
            const llmAction = await this.llmService.processEmailTask({
                task: processedTask,
                userId: sender.username
            });

            // Execute the appropriate action based on LLM analysis
            return await this.executeAction(llmAction, sender);
        } catch (error) {
            this.logger.error('Error processing LLM task:', error);
            return {
                success: false,
                message: `An error occurred while processing your request: ${error.message}`
            };
        }
    }

    private async processContactReferences(task: string, userId: string): Promise<string> {
        try {
            // Get user contacts
            const contacts = await this.contactService.getContacts(userId, this.read);
            
            // If no contacts, just return the original task
            if (!contacts || contacts.length === 0) {
                return task;
            }

            let processedTask = task;
            
            // Check for contact references and replace them with email addresses
            for (const contact of contacts) {
                // Match patterns like "@contact_name" or "contact:contact_name"
                const patterns = [
                    new RegExp(`@${contact.name}\\b`, 'gi'),
                    new RegExp(`contact:${contact.name}\\b`, 'gi'),
                    new RegExp(`\\b${contact.name}\\b`, 'gi')
                ];
                
                for (const pattern of patterns) {
                    if (pattern.test(processedTask)) {
                        // Replace with the actual email address
                        processedTask = processedTask.replace(pattern, contact.email);
                        break; // Only replace once per contact
                    }
                }
            }
            
            return processedTask;
        } catch (error) {
            this.logger.error('Error processing contact references:', error);
            return task; // Return original task if there's an error
        }
    }

    private async executeAction(action: ILLMEmailAction, sender: any): Promise<ILLMTaskResult> {
        const settings = await getEmailSettings(this.read.getEnvironmentReader().getSettings());
        const emailService = new EmailService(settings, this.logger, this.http);

        switch (action.action as LLMEmailActionType) {
            case LLMEmailActionType.SEARCH_EMAILS:
                return await this.handleSearchEmails(emailService, action.parameters);
                
            case LLMEmailActionType.COUNT_EMAILS:
                return await this.handleCountEmails(emailService, action.parameters);
                
            case LLMEmailActionType.VIEW_EMAIL:
                return await this.handleViewEmail(emailService, action.parameters);
                
            case LLMEmailActionType.SEND_EMAIL:
                return await this.handleSendEmail(emailService, settings, action.parameters);
                
            case LLMEmailActionType.UNKNOWN:
            default:
                return {
                    success: false,
                    message: "I couldn't understand what email task you wanted me to perform. Please try rephrasing your request."
                };
        }
    }

    private async handleSearchEmails(emailService: EmailService, params: any): Promise<ILLMTaskResult> {
        try {
            const emails = await emailService.searchEmails(params);
            
            if (emails.length === 0) {
                return {
                    success: true,
                    message: "No emails found matching your criteria."
                };
            }
            
            let resultText = "**Found Emails**\n\n";
            
            emails.forEach((email, index) => {
                resultText += `**${index + 1}.** From: ${email.from}\n`;
                resultText += `   Date: ${email.date}\n`;
                resultText += `   Subject: ${email.subject}\n`;
                resultText += `   ID: ${email.id}\n\n`;
            });
            
            resultText += `*To view the full content of an email, you can ask: "show me email with ID ${emails[0].id}"*`;
            
            return {
                success: true,
                message: resultText,
                data: emails
            };
        } catch (error) {
            this.logger.error('Error searching emails:', error);
            return {
                success: false,
                message: `Failed to search emails: ${error.message}`
            };
        }
    }

    private async handleCountEmails(emailService: EmailService, params: any): Promise<ILLMTaskResult> {
        try {
            const counts = await emailService.countEmails(params);
            
            let resultText = "**Email Count Results**\n\n";
            let total = 0;
            
            for (const [date, count] of Object.entries(counts)) {
                resultText += `${date}: ${count} emails\n`;
                total += count;
            }
            
            resultText += `\n**Total: ${total} emails**`;
            
            if (total === 0) {
                resultText = "No emails found for the specified time period.";
            }
            
            return {
                success: true,
                message: resultText,
                data: counts
            };
        } catch (error) {
            this.logger.error('Error counting emails:', error);
            return {
                success: false,
                message: `Failed to count emails: ${error.message}`
            };
        }
    }

    private async handleViewEmail(emailService: EmailService, params: any): Promise<ILLMTaskResult> {
        try {
            const email = await emailService.getEmailById(params.emailId);
            
            const resultText = `**Email Details**\n\n` +
                `From: ${email.from}\n` +
                `To: ${email.to}\n` +
                `Date: ${email.date}\n` +
                `Subject: ${email.subject}\n\n` +
                `**Content:**\n\n${email.content}`;
            
            return {
                success: true,
                message: resultText,
                data: email
            };
        } catch (error) {
            this.logger.error('Error retrieving email:', error);
            return {
                success: false,
                message: `Failed to retrieve email: ${error.message}`
            };
        }
    }

    private async handleSendEmail(
        emailService: EmailService, 
        settings: IEmailSettings, 
        params: any
    ): Promise<ILLMTaskResult> {
        try {
            // Validate parameters
            if (!params.to || !params.subject || !params.body) {
                return {
                    success: false,
                    message: "Missing required parameters for sending email. Need recipient, subject, and body."
                };
            }
            
            // Convert single recipient to array if needed
            const to = Array.isArray(params.to) ? params.to.join(', ') : params.to;
            
            const emailContent = {
                from: settings.email,
                to: to,
                subject: params.subject,
                text: params.body,
                html: params.html
            };
            
            const result = await emailService.sendEmail(emailContent);
            
            if (result) {
                return {
                    success: true,
                    message: `Email sent successfully to ${to}`,
                    data: { recipient: to, subject: params.subject }
                };
            } else {
                return {
                    success: false,
                    message: "Failed to send email"
                };
            }
        } catch (error) {
            this.logger.error('Error sending email:', error);
            return {
                success: false,
                message: `Failed to send email: ${error.message}`
            };
        }
    }
}
