// import { EmailProviders } from '../config/Settings';
import { EmailProviders } from '../enums/EmailProviders';


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
