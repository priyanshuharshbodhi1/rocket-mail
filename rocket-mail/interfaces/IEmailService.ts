import { EmailProviders } from '../enums/EmailProviders';
import { IEmailCountParams, IEmailSearchParams } from '../models/LLMTask';

export interface IEmailSettings {
    email: string;
    provider: EmailProviders;
}

export interface IEmailContent {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
}

export interface ISearchOptions {
    startDate?: Date;
    endDate?: Date;
    keyword?: string;
    folder?: string;
}

export interface IEmailSummary {
    id: string;
    from: string;
    date: string;
    subject: string;
}

export interface IEmailDetails extends IEmailSummary {
    to: string;
    content: string;
}

/**
 * Email service interface that must be implemented by all email providers
 */
export interface IEmailService {
    /**
     * Send an email
     */
    sendEmail(emailContent: IEmailContent): Promise<boolean>;

    /**
     * Get the most recently received email
     */
    getLastReceivedEmail(): Promise<IEmailDetails>;

    /**
     * Search for emails based on given parameters
     */
    searchEmails(params: IEmailSearchParams): Promise<IEmailSummary[]>;

    /**
     * Count emails by date range and criteria
     */
    countEmails(params: IEmailCountParams): Promise<Record<string, number>>;

    /**
     * Get details of a specific email by ID
     */
    getEmailById(emailId: string): Promise<IEmailDetails>;

    /**
     * Generate a comprehensive email report with statistics
     */
    generateEmailReport(startDate: string, endDate: string): Promise<Record<string, any>>;
}
