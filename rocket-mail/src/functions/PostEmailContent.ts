import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../../RocketMailApp";
import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";
import { IPostEmailContentParams } from "../models/LLMTask";

export async function postEmailContent({
    params,
    sender,
    room,
    read,
    modify,
    http,
    persistence,
    app
}: {
    params: IPostEmailContentParams;
    sender: any;
    room: any;
    read: IRead;
    modify: IModify;
    http: IHttp;
    persistence: IPersistence;
    app: RocketMailApp;
}): Promise<{ success: boolean; message: string; data?: any }> {
    try {
        const settings = await getEmailSettings(
            read.getEnvironmentReader().getSettings()
        );

        const emailService = await EmailServiceFactory.createEmailService(
            settings,
            sender.id,
            app.getLogger(),
            http,
            read,
            persistence
        );

        // Search for emails matching criteria
        const searchParams = { ...params };
        
        // If no query but there's a from value that doesn't look like an email,
        // move it to query for better search results
        if (!searchParams.query && searchParams.from && !searchParams.from.includes('@')) {
            searchParams.query = searchParams.from;
            delete searchParams.from;
        }
        
        // Search for emails
        const emails = await emailService.searchEmails(searchParams);

        if (emails.length === 0) {
            return {
                success: false,
                message: "No emails found matching your search criteria."
            };
        }

        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        // Determine how many emails to process (limit to 3 for reasonable output size)
        const processCount = Math.min(emails.length, params.limit || 3);
        
        // For summary view of multiple emails
        if (emails.length > 1 && params.contentType === 'preview') {
            let resultText = `📨 **Found ${emails.length} emails matching your criteria**\n\n`;
            
            for (let i = 0; i < processCount; i++) {
                const email = emails[i];
                resultText += `**${i+1}. ${email.subject}**\n`;
                resultText += `   From: ${email.from}\n`;
                resultText += `   Date: ${email.date}\n\n`;
            }
            
            if (emails.length > processCount) {
                resultText += `_...and ${emails.length - processCount} more emails_\n\n`;
            }
            
            resultText += "To see full content, try asking for a specific email by subject or sender.";
            
            messageBuilder.setText(resultText);
            await modify.getCreator().finish(messageBuilder);
            
            return {
                success: true,
                message: "Email previews displayed in channel."
            };
        }
        
        // Get full detail for the first matching email
        const email = await emailService.getEmailById(emails[0].id);
        let resultText = '';
        
        switch (params.contentType) {
            case 'subject':
                resultText = `📨 **Found Email**\n\n**Subject**: ${email.subject}\n\nFrom: ${email.from}\nDate: ${email.date}`;
                break;
                
            case 'body':
                resultText = `📨 **Email Content**\n\n**Subject**: ${email.subject}\nFrom: ${email.from}\nDate: ${email.date}\n\n---\n\n${email.body || email.content}`;
                break;
                
            case 'full':
                resultText = `📨 **Complete Email**\n\n`;
                resultText += `**From**: ${email.from}\n`;
                resultText += `**To**: ${email.to}\n`;
                resultText += `**Date**: ${email.date}\n`;
                resultText += `**Subject**: ${email.subject}\n\n`;
                resultText += `---\n\n${email.body || email.content}\n\n`;
                
                if (email.attachments && email.attachments.length > 0) {
                    resultText += `\n📎 **Attachments (${email.attachments.length})**:\n`;
                    email.attachments.forEach((attachment, index) => {
                        resultText += `${index + 1}. ${attachment.filename} (${formatFileSize(attachment.size)})\n`;
                    });
                }
                break;
                
            case 'attachment':
                if (!email.attachments || email.attachments.length === 0) {
                    return {
                        success: false,
                        message: "The email does not contain any attachments."
                    };
                }
                
                let filteredAttachments = email.attachments;
                
                // Filter by file type if specified
                if (params.fileType) {
                    const fileType = params.fileType.toLowerCase();
                    filteredAttachments = filteredAttachments.filter(att => {
                        const contentType = att.contentType?.toLowerCase() || '';
                        const filename = att.filename?.toLowerCase() || '';
                        return contentType.includes(fileType) || filename.endsWith(`.${fileType}`);
                    });
                }
                
                // Filter by file name if specified
                if (params.fileName) {
                    const fileName = params.fileName.toLowerCase();
                    filteredAttachments = filteredAttachments.filter(att => 
                        att.filename?.toLowerCase().includes(fileName));
                }
                
                if (filteredAttachments.length === 0) {
                    return {
                        success: false,
                        message: "No attachments match your criteria."
                    };
                }
                
                resultText = `📨 **Email Attachments**\n\n`;
                resultText += `From: ${email.from}\n`;
                resultText += `Subject: ${email.subject}\n`;
                resultText += `Date: ${email.date}\n\n`;
                resultText += `📎 **Attachments (${filteredAttachments.length})**:\n`;
                
                filteredAttachments.forEach((attachment, index) => {
                    resultText += `${index + 1}. ${attachment.filename} (${formatFileSize(attachment.size)})\n`;
                });
                
                break;
                
            default:
                // Default to preview
                resultText = `📨 **Email Preview**\n\n`;
                resultText += `**Subject**: ${email.subject}\n`;
                resultText += `**From**: ${email.from}\n`;
                resultText += `**Date**: ${email.date}\n\n`;
                
                const previewLength = 200;
                const bodyText = email.body || email.content || '';
                const preview = bodyText.length > previewLength ? 
                    bodyText.substring(0, previewLength) + '...' : 
                    bodyText;
                    
                resultText += preview;
                
                if (email.attachments && email.attachments.length > 0) {
                    resultText += `\n\n📎 Has ${email.attachments.length} attachment(s)`;
                }
        }
        
        messageBuilder.setText(resultText);
        await modify.getCreator().finish(messageBuilder);
        
        return {
            success: true,
            message: "Email content has been posted to the channel."
        };
        
    } catch (error) {
        app.getLogger().error('Error posting email content:', error);

        if (error.message && error.message.includes("not authenticated")) {
            return {
                success: false,
                message: `🔒 ${error.message} - Please use /rocket-mail login to authenticate first.`
            };
        }

        return {
            success: false,
            message: `❌ Error posting email content: ${error.message}`
        };
    }
}

function formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}
