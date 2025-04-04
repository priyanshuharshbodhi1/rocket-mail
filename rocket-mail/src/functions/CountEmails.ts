import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../../RocketMailApp";
import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";
import { IEmailCountParams } from "../models/LLMTask";

export interface ICountEmailsParams extends IEmailCountParams {
    // Additional properties specific to this function
    detailed?: boolean; // Whether to return detailed breakdown
}

/**
 * Count emails based on various filter criteria
 */
export async function countEmails({
    params,
    sender,
    read,
    modify,
    http,
    persistence,
    app
}: {
    params: ICountEmailsParams;
    sender: any;
    read: IRead;
    modify: IModify;
    http: IHttp;
    persistence: IPersistence;
    app: RocketMailApp;
}): Promise<{ success: boolean; message: string; data?: any }> {
    try {
        // Get email settings
        const settings = await getEmailSettings(
            read.getEnvironmentReader().getSettings()
        );

        // Create email service
        const emailService = await EmailServiceFactory.createEmailService(
            settings,
            sender.id,
            app.getLogger(),
            http,
            read,
            persistence
        );

        // Process relative date ranges
        const processedParams = await processRelativeDates(params);

        // Count the emails
        const emailCount = await emailService.countEmails(processedParams);
        
        // Convert the result to a number if it's not already
        const count = typeof emailCount === 'number' 
            ? emailCount 
            : Object.values(emailCount).reduce((sum, val) => sum + (val as number), 0);

        // Generate response message based on the count and parameters
        const message = generateCountMessage(count, processedParams);

        return {
            success: true,
            message,
            data: { count }
        };
    } catch (error) {
        app.getLogger().error('Error counting emails:', error);

        if (error.message && error.message.includes("not authenticated")) {
            return {
                success: false,
                message: `🔒 ${error.message} - Please use /rocket-mail login to authenticate first.`
            };
        }

        return {
            success: false,
            message: `❌ Error counting emails: ${error.message}`
        };
    }
}

/**
 * Process relative date references like "last week", "yesterday", etc.
 */
async function processRelativeDates(params: ICountEmailsParams): Promise<ICountEmailsParams> {
    const processedParams = { ...params };
    
    if (params.startDate) {
        const lowerStartDate = params.startDate.toLowerCase();
        
        // Process common relative date references
        if (lowerStartDate === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            processedParams.startDate = today.toISOString();
        }
        else if (lowerStartDate === 'yesterday') {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            processedParams.startDate = yesterday.toISOString();
        }
        else if (lowerStartDate === 'last week' || lowerStartDate === 'past week') {
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            processedParams.startDate = lastWeek.toISOString();
        }
        else if (lowerStartDate === 'last month' || lowerStartDate === 'past month') {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            processedParams.startDate = lastMonth.toISOString();
        }
        else if (lowerStartDate.includes('days ago')) {
            const daysAgo = parseInt(lowerStartDate.split(' ')[0]);
            if (!isNaN(daysAgo)) {
                const date = new Date();
                date.setDate(date.getDate() - daysAgo);
                processedParams.startDate = date.toISOString();
            }
        }
        // Handle "last X days" format
        else if (lowerStartDate.startsWith('last ') && lowerStartDate.endsWith(' days')) {
            const daysMatch = lowerStartDate.match(/last (\d+) days/);
            if (daysMatch && daysMatch[1]) {
                const days = parseInt(daysMatch[1]);
                if (!isNaN(days)) {
                    const date = new Date();
                    date.setDate(date.getDate() - days);
                    processedParams.startDate = date.toISOString();
                }
            }
        }
        // Handle "in the last X days" format
        else if (lowerStartDate.startsWith('in the last ') && lowerStartDate.endsWith(' days')) {
            const daysMatch = lowerStartDate.match(/in the last (\d+) days/);
            if (daysMatch && daysMatch[1]) {
                const days = parseInt(daysMatch[1]);
                if (!isNaN(days)) {
                    const date = new Date();
                    date.setDate(date.getDate() - days);
                    processedParams.startDate = date.toISOString();
                }
            }
        }
        // For numeric strings like "2", assume it means "X days ago"
        else if (/^\d+$/.test(lowerStartDate)) {
            const days = parseInt(lowerStartDate);
            if (!isNaN(days)) {
                const date = new Date();
                date.setDate(date.getDate() - days);
                processedParams.startDate = date.toISOString();
            }
        }
    }
    
    // Also check if endDate needs processing for relative dates
    if (params.endDate && typeof params.endDate === 'string') {
        const lowerEndDate = params.endDate.toLowerCase();
        
        if (lowerEndDate === 'today') {
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            processedParams.endDate = today.toISOString();
        }
        else if (lowerEndDate === 'yesterday') {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(23, 59, 59, 999);
            processedParams.endDate = yesterday.toISOString();
        }
        // For any other non-ISO date formats, try to parse
        else if (!lowerEndDate.includes('T')) { // Simple check if it's not already ISO format
            const parsedDate = new Date(params.endDate);
            if (!isNaN(parsedDate.getTime())) {
                parsedDate.setHours(23, 59, 59, 999);
                processedParams.endDate = parsedDate.toISOString();
            }
        }
    }
    
    // If no end date is specified, use today
    if (!processedParams.endDate) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        processedParams.endDate = today.toISOString();
    }
    
    return processedParams;
}

/**
 * Generate a human-readable message for the count result
 */
function generateCountMessage(count: number, params: ICountEmailsParams): string {
    let message = `Found ${count} email${count === 1 ? '' : 's'}`;
    
    // Add sender information if available
    if (params.sender) {
        message += ` from ${params.sender}`;
    }
    
    // Add recipient information if available
    if (params.recipient) {
        message += ` to ${params.recipient}`;
    }
    
    // Add subject information if available
    if (params.subject) {
        message += ` with subject containing "${params.subject}"`;
    }
    
    // Add body content information if available
    if (params.body) {
        message += ` containing "${params.body}"`;
    }
    
    // Add keyword information if available
    if (params.keywords && params.keywords.length > 0) {
        message += ` containing keywords: ${params.keywords.join(', ')}`;
    }
    
    // Add attachment information if available
    if (params.hasAttachment === true) {
        message += ` with attachments`;
    }
    
    // Add date range information if available
    if (params.startDate || params.endDate) {
        // Format dates safely
        let dateRangeText = '';
        
        if (params.startDate && params.endDate) {
            const startDate = new Date(params.startDate);
            const endDate = new Date(params.endDate);
            
            // Check if dates are valid
            const isStartValid = !isNaN(startDate.getTime());
            const isEndValid = !isNaN(endDate.getTime());
            
            if (isStartValid && isEndValid) {
                dateRangeText = ` between ${startDate.toLocaleDateString()} and ${endDate.toLocaleDateString()}`;
            } else if (isStartValid) {
                dateRangeText = ` since ${startDate.toLocaleDateString()}`;
            } else if (isEndValid) {
                dateRangeText = ` before ${endDate.toLocaleDateString()}`;
            }
        } else if (params.startDate) {
            const startDate = new Date(params.startDate);
            if (!isNaN(startDate.getTime())) {
                dateRangeText = ` since ${startDate.toLocaleDateString()}`;
            }
        } else if (params.endDate) {
            const endDate = new Date(params.endDate);
            if (!isNaN(endDate.getTime())) {
                dateRangeText = ` before ${endDate.toLocaleDateString()}`;
            }
        }
        
        message += dateRangeText;
    }
    
    // Add folder information if available
    if (params.folder) {
        message += ` in the "${params.folder}" folder`;
    }
    
    message += '.';
    
    return message;
}