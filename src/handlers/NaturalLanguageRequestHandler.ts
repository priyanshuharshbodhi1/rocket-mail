import { IHttp, ILogger, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { RocketMailApp } from "../../RocketMailApp";
import { LLMService } from "../services/LLMService";
import { ContactService } from "../services/ContactService";
import {
    ILLMTaskResult,
    ILLMEmailAction,
    LLMEmailActionType,
    ISummarizeParams,
} from "../models/LLMTask";
import { getEmailSettings } from "../config/SettingsManager";
import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { MessageService } from "../services/MessagesRetrievalService";
import { IContact } from "../types/interfaces/IContact";
import { GmailService } from "../services/GmailService";
import { IUser } from "@rocket.chat/apps-engine/definition/users";

export class NaturalLanguageRequestHandler {
    private llmService: LLMService;
    private messageService: MessageService;

    constructor(
        private readonly read: IRead,
        private readonly http: IHttp,
        private readonly modify: IModify,
        private readonly persistence: IPersistence,
        private readonly contactService: ContactService,
        private readonly logger: ILogger,
        private readonly app?: RocketMailApp
    ) {
        this.llmService = new LLMService(http, logger, app);
        this.messageService = new MessageService(logger);
    }

    public async handleNaturalLanguageRequest(initialCommand: string, args: Array<string>, sender: IUser, room: IRoom): Promise<void> {
        const fullRequest = [initialCommand, ...args].join(' ');

        // Show processing message
        const appUser = await this.read.getUserReader().getAppUser() as IUser;
        const processingMessage = this.modify
            .getCreator()
            .startMessage()
            .setSender(appUser)
            .setRoom(room)
            .setGroupable(false)
            .setText(`Processing your request: "${fullRequest}"\nPlease wait...`);

        await this.read.getNotifier().notifyUser(sender, processingMessage.getMessage());

        try {
            // Process the natural language request
            const result = await this.processTask(fullRequest, sender, room);

            this.logger.debug(`LLMTaskHandler.processTask -> Result: ${JSON.stringify(result)}`);

            // Send the result message
            const resultMessage = this.modify
                .getCreator()
                .startMessage()
                .setSender(appUser)
                .setRoom(room)
                .setGroupable(false)
                .setText(result.success
                    ? result.message
                    : `❌ ${result.message}`
                );

            await this.read.getNotifier().notifyUser(sender, resultMessage.getMessage());
        } catch (error) {
            // Handle any unexpected errors
            this.logger.error('Error processing natural language request:', error);

            const errorMessage = this.modify
                .getCreator()
                .startMessage()
                .setSender(appUser)
                .setRoom(room)
                .setGroupable(false)
                .setText(`❌ An unexpected error occurred: ${error.message}\n\nPlease try again with a more specific request or use one of the standard commands (try /rocket-mail help).`);

            await this.read.getNotifier().notifyUser(sender, errorMessage.getMessage());
        }
    }

/////////////////////// METHODS //////////////////////

    public async processTask(task: string, sender: any, room?: IRoom): Promise<ILLMTaskResult> {
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

            // Store the room in the sender object for later use
            const enhancedSender = { ...sender, room };

            // Execute the appropriate action based on LLM analysis
            return await this.executeAction(llmAction, enhancedSender, room);
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
            // Process any contact references in the task text
            const contacts = await this.contactService.getContacts(userId, this.read);
            let processedTask = task;

            // Replace contact references (e.g., @John) with their email addresses
            for (const contact of contacts) {
                const contactRegex = new RegExp(`@${contact.name}\\b`, 'gi');
                processedTask = processedTask.replace(contactRegex, contact.email);
            }

            return processedTask;
        } catch (error) {
            this.logger.error('Error processing contact references:', error);
            return task; // Return original task if there's an error
        }
    }

    private formatContactsForContext(contacts: IContact[]): string {
        if (!contacts || contacts.length === 0) {
            return "[]";
        }

        const contactsObj = contacts.reduce((obj, contact) => {
            obj[contact.name] = contact.email;
            return obj;
        }, {});

        return JSON.stringify(contactsObj, null, 2);
    }

    private getAvailableFunctionsContext(): string {
        return `
        Available functions:

        1. send-email({
            to: [string],   // Required. Array of email addresses to send to
            cc: [string],   // Optional. Array of email addresses to CC
            bcc: [string],  // Optional. Array of email addresses to BCC
            subject: string, // Required. Subject of the email
            body: string    // Required. Body content of the email
        }) - Sends an email to the specified recipients.

        2. search-emails({
            query: string,  // Optional. Search term to find in emails
            from: string,   // Optional. Filter emails from a specific sender
            to: string,     // Optional. Filter emails sent to a specific recipient
            subject: string, // Optional. Filter emails with specific subject text
            after: string,  // Optional. Filter emails after this date (format: YYYY-MM-DD)
            before: string, // Optional. Filter emails before this date (format: YYYY-MM-DD)
            hasAttachment: boolean, // Optional. Filter emails with attachments
            limit: number   // Optional. Maximum number of results to return
        }) - Searches for emails matching the criteria.

        3. count-emails({
            sender: string,        // Optional. Email address of the sender
            subject: string,       // Optional. Text to search for in subject
            body: string,          // Optional. Text to search for in body
            keywords: [string],    // Optional. Keywords to search for in emails
            startDate: string,     // Optional. Start date (YYYY-MM-DD)
            endDate: string,       // Optional. End date (YYYY-MM-DD)
            folder: string,        // Optional. Folder/label name
            hasAttachment: boolean // Optional. Whether email has attachments
        }) - Counts emails matching the specified criteria.

        4. summarize-and-send({
            days: number,          // Optional. Number of past days to include (default: 2)
            participants: [string], // Optional. Filter messages by specific participants
            recipient: string,     // Required. Email address to send the summary to
            subject: string,       // Optional. Subject for the email
            format: string,        // Optional. Format of the summary (brief, detailed, bullet, paragraph)
            additionalContent: string // Optional. Additional text to include with the summary
        }) - Summarizes chat messages and sends the summary via email.

        5. get-report({
            days: number           // Optional. Number of past days to include (default: 7)
        }) - Generates an email activity report for the specified number of days.
        `;
    }

    private async executeAction(action: ILLMEmailAction, sender: any, room?: IRoom): Promise<ILLMTaskResult> {
        try {
            // Create the appropriate email service
            const settings = await getEmailSettings(
                this.read.getEnvironmentReader().getSettings()
            );

            const emailService = await EmailServiceFactory.createEmailService(
                settings,
                sender.id,
                this.logger,
                this.http,
                this.read,
                this.persistence
            );
            this.logger.debug(` executeAction details ${JSON.stringify(action)}`);

            // Check if there's user guidance that should be shown
            if (action.userGuidance) {
                return {
                    success: true,
                    message: `${action.rationale}\n\n💡 Suggestion: ${action.userGuidance}`
                };
            }

            switch (action.action) {
                case LLMEmailActionType.SEARCH_EMAILS:
                    return await this.handleSearchEmails(emailService, action.parameters);

                case LLMEmailActionType.COUNT_EMAILS:
                    // Use the dedicated countEmails function
                    if (!this.app) {
                        return {
                            success: false,
                            message: "App instance is not available. Unable to count emails."
                        };
                    }

                    const { countEmails } = await import('../functions/CountEmails');
                    const countResult = await countEmails({
                        params: action.parameters,
                        sender,
                        read: this.read,
                        modify: this.modify,
                        http: this.http,
                        persistence: this.persistence,
                        app: this.app
                    });
                    return countResult;

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
                        room: room || sender.room,
                        read: this.read,
                        modify: this.modify,
                        http: this.http,
                        persistence: this.persistence,
                        app: this.app
                    });
                    return result;

                case LLMEmailActionType.SUMMARIZE_AND_SEND:
                    // Use the dedicated summarizeAndSendEmail function
                    if (!this.app) {
                        return {
                            success: false,
                            message: "App instance is not available. Unable to summarize and send email."
                        };
                    }

                    // Log the room object to help with debugging
                    this.logger.debug(`Room object in SUMMARIZE_AND_SEND: ${JSON.stringify(room || sender.room)}`);

                    const { summarizeAndSendEmail } = await import('../functions/SummariseAndSendEmail');
                    const summarizeResult = await summarizeAndSendEmail({
                        params: action.parameters,
                        sender,
                        room: room || sender.room,
                        read: this.read,
                        modify: this.modify,
                        http: this.http,
                        persistence: this.persistence,
                        app: this.app
                    });
                    return summarizeResult;

                case LLMEmailActionType.SUMMARIZE:
                    return await this.handleSummarize(action.parameters, sender, room);

                case LLMEmailActionType.GET_REPORT:
                    // Use the ReportCommand directly
                    if (!this.app) {
                        return {
                            success: false,
                            message: "App instance is not available. Unable to generate report."
                        };
                    }

                    const { ReportCommand } = await import('./ReportHandler');
                    const reportCommand = new ReportCommand(this.app);
                    const days = action.parameters.days || 7;

                    // The execute method returns void, so we need to provide our own response
                    await reportCommand.execute(
                        [days.toString()],
                        sender,
                        room || sender.room,
                        this.read,
                        this.modify,
                        this.http,
                        this.persistence
                    );

                    return {
                        success: true,
                        message: `I've generated a report of your email activity for the past ${days} days.`
                    };

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

    private async handleSearchEmails(emailService: GmailService, parameters: any): Promise<ILLMTaskResult> {
        try {
            const emails = await emailService.searchEmails(parameters);

            if (!emails || emails.length === 0) {
                return {
                    success: true,
                    message: "No emails found matching your criteria."
                };
            }

            const emailList = emails.map((email: any, index: number) => {
                return `${index + 1}. **${email.subject || '(No Subject)'}**\n   From: ${email.from || 'Unknown'}\n   Date: ${email.date || 'Unknown'}\n   ID: \`${email.id}\``;
            }).join('\n\n');

            return {
                success: true,
                message: `Found ${emails.length} email(s) matching your criteria:\n\n${emailList}\n\nTo view a specific email, use \`/rocket-mail view <ID>\` with the ID shown above.`,
                data: { emails }
            };
        } catch (error) {
            return {
                success: false,
                message: `Error searching emails: ${error.message}`
            };
        }
    }

    private async handleCountEmails(emailService: GmailService, parameters: any): Promise<ILLMTaskResult> {
        try {
            const count = await emailService.countEmails(parameters);

            return {
                success: true,
                message: `Found ${count} email(s) matching your criteria.`,
                data: { count: count as number }
            };
        } catch (error) {
            return {
                success: false,
                message: `Error counting emails: ${error.message}`
            };
        }
    }

    private async handleViewEmail(emailService: GmailService, parameters: any): Promise<ILLMTaskResult> {
        try {
            if (!parameters.id) {
                return {
                    success: false,
                    message: "No email ID provided. Please specify which email to view."
                };
            }

            const email = await emailService.getEmailById(parameters.id);

            if (!email) {
                return {
                    success: false,
                    message: `Email with ID ${parameters.id} not found.`
                };
            }

            let message = `### Email: ${email.subject || '(No Subject)'}\n\n`;
            message += `**From:** ${email.from || 'Unknown'}\n`;
            message += `**To:** ${email.to || 'Unknown'}\n`;
            message += `**Date:** ${email.date || 'Unknown'}\n\n`;
            message += `${email.body || '(No content)'}\n\n`;

            if (email.attachments && email.attachments.length > 0) {
                message += `**Attachments:** ${email.attachments.length}\n`;
                email.attachments.forEach((attachment: any) => {
                    message += `- ${attachment.filename || 'Unnamed attachment'} (${attachment.mimeType || 'unknown type'})\n`;
                });
            }

            return {
                success: true,
                message,
                data: { email }
            };
        } catch (error) {
            return {
                success: false,
                message: `Error viewing email: ${error.message}`
            };
        }
    }

    private async handleSummarize(parameters: ISummarizeParams, sender: any, room?: IRoom): Promise<ILLMTaskResult> {
        try {
            if (!room && !sender.room) {
                return {
                    success: false,
                    message: "The room information is missing. Unable to summarize messages."
                };
            }

            const currentRoom = room || sender.room;
            this.logger.debug(`Room object in handleSummarize: ${JSON.stringify(currentRoom)}`);

            const messages = await this.messageService.getMessages(
                currentRoom,
                this.read,
                sender,
                parameters
            );

            if (!messages || messages.length === 0) {
                return {
                    success: true,
                    message: "No messages found to summarize based on your criteria."
                };
            }

            // Format messages for the summary
            const formattedMessages = this.messageService.formatMessagesForSummary(messages);

            // Generate a summary using LLM
            const channelName = currentRoom.displayName || currentRoom.name || "Channel";
            const summary = await this.llmService.generateSummary(formattedMessages, channelName);

            let response = `## Summary of ${messages.length} messages\n\n${summary}`;

            return {
                success: true,
                message: response,
                data: {
                    summary,
                    messageCount: messages.length
                }
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to generate summary: ${error.message}`
            };
        }
    }
}
