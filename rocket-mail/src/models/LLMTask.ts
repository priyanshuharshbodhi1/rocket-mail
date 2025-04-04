export interface ILLMTaskRequest {
    task: string;
    userId?: string;
    contacts?: string;
    availableFunctions?: string;
}

export interface ILLMTaskResult {
    success: boolean;
    message: string;
    data?: any;
}

export enum LLMEmailActionType {
    SEARCH_EMAILS = 'search-emails',
    COUNT_EMAILS = 'count-emails',
    VIEW_EMAIL = 'view-email',
    SEND_EMAIL = 'send-email',
    SUMMARIZE = 'summarize',
    SUMMARIZE_AND_SEND = 'summarize-and-send',
    GET_REPORT = 'get-report',
    UNKNOWN = 'unknown'
}

export interface ILLMEmailAction {
    action: LLMEmailActionType;
    parameters: any;
    rationale?: string;
    userGuidance?: string; // Optional guidance to show to the user
}

export interface IEmailSendParams {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    html?: string;
    attachments?: any[];
    recipient?: string; // For compatibility with older code
}

export interface IEmailSearchParams {
    query?: string;
    from?: string;
    to?: string;
    subject?: string;
    after?: string;
    before?: string;
    hasAttachment?: boolean;
    limit?: number;
}

export interface IEmailCountParams {
    sender?: string;
    recipient?: string;
    subject?: string;
    body?: string;
    keywords?: string[];
    startDate?: string;
    endDate?: string;
    folder?: string;
    hasAttachment?: boolean;
    isUnread?: boolean;
    detailed?: boolean; // Whether to return detailed breakdown by day
}

export interface IEmailViewParams {
    id: string;
}

export interface ISummarizeParams {
    days?: number;
    participants?: string[];
    timeframe?: {
        type: 'today' | 'yesterday' | 'week' | 'month' | 'custom';
        startDate?: string;
        endDate?: string;
    };
    format?: 'bullet' | 'paragraph' | 'detailed' | 'brief';
}

export interface ISummarizeAndSendParams {
    days?: number;
    participants?: string[];
    recipient: string;
    subject?: string;
    format?: 'bullet' | 'paragraph' | 'detailed' | 'brief';
    additionalContent?: string;
}

export interface IReportParams {
    days: number;
}
