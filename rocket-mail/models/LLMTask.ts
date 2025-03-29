export interface ILLMTaskResult {
    success: boolean;
    message: string;
    data?: any;
}

export interface ILLMTaskRequest {
    task: string;
    userId: string;
    contacts?: string;
    availableFunctions?: string;
}

export interface ILLMEmailAction {
    action: LLMEmailActionType;
    parameters: any;
}

export interface IEmailSearchParams {
    startDate?: string;
    endDate?: string;
    sender?: string;
    subject?: string;
    body?: string;
    folder?: string;
    limit?: number;
}

export interface IEmailCountParams {
    startDate: string;
    endDate: string;
    sender?: string;
}

export interface IEmailSendParams {
    to: string[];
    subject: string;
    body: string;
    html?: string;
    cc?: string[];
}

export interface IEmailViewParams {
    emailId: string;
}

export enum LLMEmailActionType {
    SEARCH_EMAILS = 'search-emails',
    COUNT_EMAILS = 'count-emails',
    VIEW_EMAIL = 'view-email',
    SEND_EMAIL = 'send-email',
    SUMMARIZE = 'summarize',
    UNKNOWN = 'unknown'
}
