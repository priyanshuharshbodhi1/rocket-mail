export interface ISummarizeParams {
    action?: 'summarize'; 
    timeframe?: {
        type: 'today' | 'week' | 'custom' | 'unread' | 'yesterday' | 'month';
        startDate?: string;
        endDate?: string;
    };
    participants?: string[];
    recipient_email?: string;
    user_intention?: string;
    
    // New fields
    type?: 'email_report' | 'email_thread' | 'chat_thread';
    days?: number;
    keywords?: string[];
    format?: 'bullet' | 'paragraph' | 'detailed' | 'brief';
    maxLength?: number;
}

export interface IMessage {
    id: string;
    sender: {
        username: string;
        name: string;
    };
    createdAt: string | Date;
    text: string;
    file?: {
        _id: string;
        name: string;
        type: string;
        url: string;
    };
}
