export interface ISummarizeParams {
    action: 'summarize'; 
    timeframe?: {
        type: 'today' | 'week' | 'custom' | 'unread';
        startDate?: string;
        endDate?: string;
    };
    participants?: string[];
    recipient_email?: string;
    user_intention?: string;
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
