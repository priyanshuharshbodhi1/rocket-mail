export interface IEmailSettings {
    email: string;
    password: string;
    imapServer: string;
    smtpServer: string;
    smtpPort: number;
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
