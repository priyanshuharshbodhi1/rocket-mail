import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../../RocketMailApp";
import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";
import { LLMService } from "../services/LLMService";
import { sendEmail } from "./SendEmail";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { MessageService } from "../services/MessagesRetrievalService";
import { ISummarizeParams } from "../models/SummarizeParams";
import { IEmailDetails } from "../types/interfaces/IEmailService";

interface ISummarizeAndSendParams {
    // For email summarization
    emailIds?: string[];
    // For chat summarization
    days?: number;
    participants?: string[];
    roomId?: string;
    // Common parameters
    recipient: string;
    subject?: string;
    additionalContent?: string;
    format?: 'bullet' | 'paragraph' | 'detailed' | 'brief';
}

export async function summarizeAndSendEmail({
    params,
    sender,
    room,
    read,
    modify,
    http,
    persistence,
    app
}: {
    params: ISummarizeAndSendParams;
    sender: any;
    room: any;
    read: IRead;
    modify: IModify;
    http: IHttp;
    persistence: IPersistence;
    app: RocketMailApp;
}): Promise<{ success: boolean; message: string; data?: any }> {
    app.getLogger().debug(`SummarizeAndSendEmail params: ${JSON.stringify(params)}`);
    
    if (!params.recipient) {
        return {
            success: false,
            message: "No recipient specified for the summary email. Please include a recipient email address."
        };
    }

    // Check if we have valid parameters for either email or chat summarization
    const isEmailSummarize = params.emailIds && params.emailIds.length > 0;
    const isChatSummarize = !!room || !!params.roomId; // We have a room to summarize

    if (!isEmailSummarize && !isChatSummarize) {
        return {
            success: false,
            message: "No content provided to summarize. Please specify either email IDs or ensure you're in a chat room."
        };
    }

    try {
        const settings = await getEmailSettings(
            read.getEnvironmentReader().getSettings()
        );

        // Create the LLM service for summarization
        const llmService = new LLMService(http, app.getLogger(), app);
        
        let summary: string;
        let contentToSummarize: string;
        let contentType: string;
        
        // Handle Email Summarization
        if (isEmailSummarize && params.emailIds) {
            const emailService = await EmailServiceFactory.createEmailService(
                settings,
                sender.id,
                app.getLogger(),
                http,
                read,
                persistence
            );

            // Fetch all the emails to summarize
            const emails: IEmailDetails[] = [];
            for (const emailId of params.emailIds) {
                try {
                    const email = await emailService.getEmailById(emailId);
                    if (email) {
                        emails.push(email as IEmailDetails);
                    }
                } catch (err) {
                    app.getLogger().error(`Error fetching email ${emailId}:`, err);
                    // Continue with other emails even if one fails
                }
            }

            if (emails.length === 0) {
                return {
                    success: false,
                    message: "Could not retrieve any of the specified emails"
                };
            }

            // Generate a summary of the emails
            contentToSummarize = emails.map(email => {
                return `
From: ${email.from || 'Unknown'}
Date: ${email.date || 'Unknown'}
Subject: ${email.subject || 'No Subject'}
--
${email.body || "No content"}
                `;
            }).join("\n\n---\n\n");
            
            contentType = "emails";
            
            // Create summary sections for email body
            summary = await llmService.generateSummary(contentToSummarize, "Email Summary");
            
            if (!summary) {
                return {
                    success: false,
                    message: "Failed to generate a summary of the emails"
                };
            }
            
            // Prepare the email content
            const subject = params.subject || `Summary of ${emails.length} emails`;
            
            let emailBody = `# Email Summary\n\n`;
            emailBody += `${summary}\n\n`;
            
            if (params.additionalContent) {
                emailBody += `## Additional Notes\n\n${params.additionalContent}\n\n`;
            }
            
            emailBody += `## Original Emails\n\n`;
            
            for (const email of emails) {
                emailBody += `### ${email.subject || 'No Subject'}\n`;
                emailBody += `**From:** ${email.from || 'Unknown'}\n`;
                emailBody += `**Date:** ${email.date || 'Unknown'}\n\n`;
                emailBody += `${email.body || "No content"}\n\n`;
            }
            
            // Convert markdown to HTML for the email
            const htmlBody = convertMarkdownToHtml(emailBody);
            
            // Send the summary email
            const sendResult = await sendEmail({
                params: {
                    to: [params.recipient],
                    subject,
                    body: emailBody,
                    html: htmlBody
                },
                sender,
                room,
                read,
                modify,
                http,
                persistence,
                app
            });
            
            if (!sendResult.success) {
                return sendResult;
            }
            
            return {
                success: true,
                message: `Summary of ${emails.length} emails sent to ${params.recipient} with subject "${subject}"`,
                data: {
                    summary,
                    emailsIncluded: emails.map(e => ({ id: e.id || 'unknown', subject: e.subject || 'No Subject' }))
                }
            };
        } 
        // Handle Chat Messages Summarization
        else if (isChatSummarize) {
            // If roomId is provided, try to fetch the room
            let currentRoom = room;
            if (!currentRoom && params.roomId) {
                try {
                    currentRoom = await read.getRoomReader().getById(params.roomId);
                    if (!currentRoom) {
                        return {
                            success: false,
                            message: `Could not find room with ID ${params.roomId}`
                        };
                    }
                } catch (error) {
                    app.getLogger().error(`Error fetching room ${params.roomId}:`, error);
                    return {
                        success: false,
                        message: `Error finding room: ${error.message}`
                    };
                }
            }
            
            if (!currentRoom) {
                return {
                    success: false,
                    message: "No room specified for summarization. Please use this command in a channel or provide a roomId."
                };
            }
            
            // Create message service for retrieving messages
            const messageService = new MessageService(app.getLogger());
            
            // Default to 2 days if not specified
            const days = params.days || 2;
            
            // Create summarize params from the provided parameters
            const summarizeParams: ISummarizeParams = {
                days,
                participants: params.participants,
                format: params.format
            };
            
            // Retrieve messages from the room
            const messages = await messageService.getMessages(
                currentRoom,
                read,
                sender,
                summarizeParams
            );
            
            if (!messages || messages.length === 0) {
                return {
                    success: true,
                    message: `No messages found in the last ${days} day(s) to summarize.`
                };
            }
            
            // Format messages for summarization
            contentToSummarize = messageService.formatMessagesForSummary(messages);
            contentType = "chat messages";
            
            // Generate a summary of the messages
            const channelName = currentRoom.displayName || currentRoom.name || "Chat";
            const summaryPrompt = `
Please summarize the following ${messages.length} chat messages from the last ${days} day(s).
${params.format ? `Format the summary in ${params.format} style.` : ''}
${params.additionalContent ? `Additional context: ${params.additionalContent}` : ''}

MESSAGES:
${contentToSummarize}
`;
            
            app.getLogger().debug(`Generating summary for ${messages.length} messages`);
            summary = await llmService.generateSummary(summaryPrompt, channelName);
            
            if (!summary) {
                return {
                    success: false,
                    message: "Failed to generate a summary of the chat messages. Please try again."
                };
            }
            
            // Prepare the email subject and content
            const subject = params.subject || `Summary of ${channelName} conversation from last ${days} day(s)`;
            
            let emailBody = `# Chat Conversation Summary: ${channelName}\n\n`;
            emailBody += `${summary}\n\n`;
            
            if (params.additionalContent) {
                emailBody += `## Additional Context\n\n${params.additionalContent}\n\n`;
            }
            
            emailBody += `## Time Period\n\n`;
            emailBody += `*These messages were collected from ${new Date(messages[0].createdAt).toLocaleString()} to ${new Date(messages[messages.length-1].createdAt).toLocaleString()}*\n\n`;
            
            // Convert markdown to HTML for the email
            const htmlBody = convertMarkdownToHtml(emailBody);
            
            app.getLogger().debug(`Sending summary email to ${params.recipient}`);
            
            // Send the summary email
            const sendResult = await sendEmail({
                params: {
                    to: [params.recipient],
                    subject,
                    body: emailBody,
                    html: htmlBody
                },
                sender,
                room: currentRoom,
                read,
                modify,
                http,
                persistence,
                app
            });
            
            if (!sendResult.success) {
                return sendResult;
            }
            
            return {
                success: true,
                message: `Summary of ${channelName} conversation from last ${days} day(s) sent to ${params.recipient}`,
                data: {
                    summary,
                    messageCount: messages.length,
                    timeframe: `${days} day(s)`
                }
            };
        }
        
        // This shouldn't happen due to our earlier check
        return {
            success: false,
            message: "Unable to determine what to summarize"
        };
    } catch (error) {
        app.getLogger().error("Error summarizing and sending content:", error);
        
        if (error.message && error.message.includes("not authenticated")) {
            return {
                success: false,
                message: `🔒 ${error.message} - Please use /rocket-mail login to authenticate first.`
            };
        }
        
        return {
            success: false,
            message: `❌ Error summarizing and sending content: ${error.message}`
        };
    }
}

// Helper function to convert markdown to HTML
function convertMarkdownToHtml(markdown: string): string {
    let html = markdown
        .replace(/^# (.*)$/gm, '<h1>$1</h1>')
        .replace(/^## (.*)$/gm, '<h2>$1</h2>')
        .replace(/^### (.*)$/gm, '<h3>$1</h3>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    return `<div style="font-family: Arial, sans-serif;">${html}</div>`;
}
