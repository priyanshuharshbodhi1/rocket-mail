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

    sendEmail(emailContent: IEmailContent): Promise<boolean>;

    getLastReceivedEmail(): Promise<IEmailDetails>;

    searchEmails(params: IEmailSearchParams): Promise<IEmailSummary[]>;

    countEmails(params: IEmailCountParams): Promise<Record<string, number>>;

    getEmailById(emailId: string): Promise<IEmailDetails>;

    generateEmailReport(startDate: string, endDate: string): Promise<Record<string, any>>;
}
