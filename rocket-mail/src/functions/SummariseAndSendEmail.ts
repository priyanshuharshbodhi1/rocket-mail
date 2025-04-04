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
    if (!params.recipient) {
        return {
            success: false,
            message: "No recipient specified for the summary email"
        };
    }

    // Check if we have valid parameters for either email or chat summarization
    const isEmailSummarize = params.emailIds && params.emailIds.length > 0;
    const isChatSummarize = !!room; // We have a room to summarize

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
            // Create a message service to retrieve chat messages
            const messageService = new MessageService(app.getLogger());
            
            // Create summarize params
            const summarizeParams: ISummarizeParams = {
                timeframe: {
                    type: 'custom',
                }
            };
            
            // Set days parameter (default to 2 days if not specified)
            const days = params.days || 2;
            if (days) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - days);
                if (summarizeParams.timeframe) {
                    summarizeParams.timeframe.startDate = startDate.toISOString();
                }
            }
            
            // Set participants if provided
            if (params.participants && params.participants.length > 0) {
                summarizeParams.participants = params.participants;
            }
            
            // Get messages from the current room
            const messages = await messageService.getMessages(
                room as IRoom,
                read,
                sender,
                summarizeParams
            );
            
            if (!messages || messages.length === 0) {
                return {
                    success: false,
                    message: "No messages found for the specified criteria"
                };
            }
            
            // Format messages for summarization
            contentToSummarize = messageService.formatMessagesForSummary(messages);
            contentType = "chat messages";
            
            // Generate a summary of the messages
            const channelName = room.displayName || room.name || "Chat";
            const summaryPrompt = `
Please summarize the following ${messages.length} chat messages from the last ${days} day(s).
${params.format ? `Format the summary in ${params.format} style.` : ''}
${params.additionalContent ? `Additional context: ${params.additionalContent}` : ''}

MESSAGES:
${contentToSummarize}
`;
            
            summary = await llmService.generateSummary(summaryPrompt, channelName);
            
            if (!summary) {
                return {
                    success: false,
                    message: "Failed to generate a summary of the chat messages"
                };
            }
            
            // Prepare the email subject and content
            const subject = params.subject || `Summary of chat conversation from last ${days} day(s)`;
            
            let emailBody = `# Chat Conversation Summary\n\n`;
            emailBody += `${summary}\n\n`;
            
            if (params.additionalContent) {
                emailBody += `## Additional Context\n\n${params.additionalContent}\n\n`;
            }
            
            emailBody += `## Original Messages\n\n`;
            emailBody += `*These messages were collected from ${new Date(messages[0].createdAt).toLocaleString()} to ${new Date(messages[messages.length-1].createdAt).toLocaleString()}*\n\n`;
            emailBody += "```\n";
            emailBody += contentToSummarize;
            emailBody += "\n```\n";
            
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
                message: `Summary of chat conversation from last ${days} day(s) sent to ${params.recipient}`,
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
