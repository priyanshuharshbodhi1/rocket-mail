import { IHttp, ILogger, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { ILLMEmailAction, ILLMTaskResult, LLMEmailActionType } from "../models/LLMTask";
import { LLMService } from "./LLMService";
import { ContactService } from "./ContactService";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../../RocketMailApp";
import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";
import { GmailService } from "./GmailService";
import { ReportCommand } from "../handlers/ReportHandler";
import { MessageService } from "./MessageService";
import { IContact } from "../types/interfaces/IContact";
import { IEmailSettings } from "../types/interfaces/IEmailService";

export class LLMTaskHandler {
    private llmService: LLMService;
    private logger: ILogger;
    private messageService: MessageService;

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
        this.messageService = new MessageService(logger);
    }

    public async processTask(task: string, sender: any): Promise<ILLMTaskResult> {
        try {
            // Get user's contact list for better context
            const contacts = await this.contactService.getContacts(sender.id, this.read);

            // Format contact list for LLM context
            const contactsContext = this.formatContactsForContext(contacts);

            // Get available functions to provide in the context
            const functionsContext = this.getAvailableFunctionsContext();

            // First, substitute any contact references in the task
            const processedTask = await this.processContactReferences(task, sender.id);

            // Send the task to the LLM for analysis along with contacts and functions
            const llmAction = await this.llmService.processEmailTask({
                task: processedTask,
                userId: sender.username,
                contacts: contactsContext,
                availableFunctions: functionsContext
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

    /**
     * Format contacts into a readable string for LLM context
     */
    private formatContactsForContext(contacts: IContact[]): string {
        if (!contacts || contacts.length === 0) {
            return "No saved contacts.";
        }

        return contacts.map(contact =>
            `${contact.name}: ${contact.email}`
        ).join(", ");
    }

    /**
     * Provide information about available functions for the LLM
     */
    private getAvailableFunctionsContext(): string {
        return `
        1. search_emails(params: {startDate, endDate, sender, subject, body, limit}) - Search emails matching criteria
        2. count_emails(params: {startDate, endDate, sender}) - Count emails in a date range
        3. view_email(emailId) - View a specific email by ID
        4. send_email(to, subject, body, cc) - Send a new email
        5. get_report(days) - Generate an email activity report for past N days
        6. summarize_thread(timeframe, participants) - Summarize conversation threads
        7. get_messages(room, timeframe, participants) - Retrieve messages from a chat
        `;
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
        this.logger.debug(`LLMTaskHandler.executeAction -> Executing action: ${action.action}`);
        
        try {
            const settings = await getEmailSettings(this.read.getEnvironmentReader().getSettings());
            const emailService = await EmailServiceFactory.createEmailService(
                settings,
                sender.id,
                this.logger,
                this.http,
                this.read,
                this.persistence
            );
            
            switch (action.action) {
                case LLMEmailActionType.SEARCH_EMAILS:
                    return await this.handleSearchEmails(emailService, action.parameters);
                
                case LLMEmailActionType.COUNT_EMAILS:
                    return await this.handleCountEmails(emailService, action.parameters);
                
                case LLMEmailActionType.VIEW_EMAIL:
                    return await this.handleViewEmail(emailService, action.parameters);
                
                case LLMEmailActionType.SEND_EMAIL:
                    // Use the dedicated sendEmail function from the functions directory
                    if (!this.app) {
                        return {
                            success: false,
                            message: "App instance is not available. Unable to send email."
                        };
                    }
                    
                    const { sendEmail } = await import('../functions/SendEmail');
                    const result = await sendEmail({
                        params: action.parameters,
                        sender,
                        room: sender.room,
                        read: this.read,
                        modify: this.modify,
                        http: this.http,
                        persistence: this.persistence,
                        app: this.app
                    });
                    return result;
                
                case LLMEmailActionType.SUMMARIZE:
                    return await this.handleSummarize(action.parameters, sender);
                
                case LLMEmailActionType.UNKNOWN:
                default:
                    return {
                        success: false,
                        message: `I couldn't understand that request. ${action.parameters?.error || ''}`
                    };
            }
        } catch (error) {
            this.logger.error('Error executing action:', error);
            return {
                success: false,
                message: `Error executing email action: ${error.message}`
            };
        }
    }

    /**
     * Handle the summarize action
     */
    private async handleSummarize(params: any, sender: any): Promise<ILLMTaskResult> {
        try {
            const type = params.type || 'email_report';

            // Handle email report generation
            if (type === 'email_report') {
                const days = params.days || 7;

                // Use the ReportCommand directly
                if (!this.app) {
                    return {
                        success: false,
                        message: "App instance is not available. Unable to generate report."
                    };
                }

                const reportCommand = new ReportCommand(this.app);
                await reportCommand.execute(
                    [days.toString()],
                    sender,
                    sender.room,
                    this.read,
                    this.modify,
                    this.http,
                    this.persistence
                );

                return {
                    success: true,
                    message: `I've generated a report of your email activity for the past ${days} days.`
                };
            }

            // Handle thread summarization
            if (type.includes('thread')) {
                // Get the room and timeframe
                const timeframe = params.timeframe || { type: 'today' };

                // Get messages based on the parameters
                const messages = await this.messageService.getMessages(
                    sender.room,
                    this.read,
                    sender,
                    params
                );

                if (messages.length === 0) {
                    return {
                        success: false,
                        message: "No messages found for summarization."
                    };
                }

                // Format messages for summarization
                const formattedMessages = this.messageService.formatMessagesForSummary(messages);

                // Generate summary
                const summary = await this.llmService.generateSummary(
                    formattedMessages,
                    sender.room.displayName || sender.room.slugifiedName || 'Chat'
                );

                // If recipient is specified, send as email
                if (params.recipient_email) {
                    const emailSettings = await getEmailSettings(this.read.getEnvironmentReader().getSettings());
                    const emailService = await EmailServiceFactory.createEmailService(
                        emailSettings,
                        sender.id,
                        this.logger,
                        this.http,
                        this.read,
                        this.persistence
                    );

                    // Send the summary as an email
                    await emailService.sendEmail({
                        from: emailSettings.email,
                        to: params.recipient_email,
                        subject: `Summary of ${sender.room.displayName || sender.room.slugifiedName || 'Conversation'}`,
                        text: summary
                    });

                    return {
                        success: true,
                        message: `📧 Successfully sent summary to ${params.recipient_email}:\n\n${summary.substring(0, 200)}...`
                    };
                }

                // Otherwise just return the summary
                return {
                    success: true,
                    message: `📝 **Summary**\n\n${summary}`
                };
            }

            return {
                success: false,
                message: "I couldn't understand the type of summary you wanted. Please try again."
            };
        } catch (error) {
            this.logger.error('Error handling summarize action:', error);
            return {
                success: false,
                message: `Failed to generate summary: ${error.message}`
            };
        }
    }

    private async handleSearchEmails(emailService: GmailService, params: any): Promise<ILLMTaskResult> {
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

    private async handleCountEmails(emailService: GmailService, params: any): Promise<ILLMTaskResult> {
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

    private async handleViewEmail(emailService: GmailService, params: any): Promise<ILLMTaskResult> {
        try {
            const email = await emailService.getEmailById(params.emailId);

            const resultText = `**Email Details**\n\n` +
                `From: ${email.from}\n` +
                `To: ${email.to}\n` +
                `Date: ${email.date}\n` +
                `Subject: ${email.subject}\n\n` +
                `**Content**:\n${email.content?.substring(0, 1500)}${
                    email.content?.length > 1500 ? "..." : ""
                }`;

            return {
                success: true,
                message: resultText,
                data: email
            };
        } catch (error) {
            this.logger.error('Error viewing email:', error);
            return {
                success: false,
                message: `Failed to retrieve email: ${error.message}`
            };
        }
    }

    private async handleSendEmail(emailService: GmailService, settings: IEmailSettings, params: any): Promise<ILLMTaskResult> {
        try {
            // Validate required parameters
            if (!params.to || !params.body) {
                return {
                    success: false,
                    message: "Missing required parameters for sending email. Please specify recipient and message content."
                };
            }

            // Format recipient(s)
            const recipients = Array.isArray(params.to) ? params.to : [params.to];

            // Create email content object
            const emailContent = {
                from: settings.email,
                to: recipients.join(', '),
                subject: params.subject || "No Subject",
                text: params.body,
                html: params.html
            };

            // Send the email
            await emailService.sendEmail(emailContent);

            return {
                success: true,
                message: `✅ Email sent successfully to ${emailContent.to} with subject "${emailContent.subject}"`
            };
        } catch (error) {
            this.logger.error('Error sending email:', error);
            return {
                success: false,
                message: `Failed to send email: ${error.message}`
            };
        }
    }
}
