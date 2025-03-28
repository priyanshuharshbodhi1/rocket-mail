import { IHttp, ILogger, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { IMessage } from "../models/SummarizeParams";
import { ISummarizeParams } from "../models/SummarizeParams";

export class MessageService {
    constructor(
        private readonly logger: ILogger
    ) {}

    public async getMessages(
        room: IRoom,
        read: IRead,
        user: IUser,
        params: ISummarizeParams
    ): Promise<IMessage[]> {
        this.logger.debug(`MessageService.getMessages -> Retrieving messages for room ${room.id}`);

        try {
            // Check if we're in a thread - in Rocket.Chat a thread is a message with replies
            // We'll check for a threadId property in the room context, though this may need to be
            // determined differently based on your specific Rocket.Chat version
            const threadId = this.getThreadIdFromRoom(room);

            if (threadId) {
                return this.getThreadMessages(room, read, user, threadId, params);
            } else {
                return this.getRoomMessages(room, read, user, params);
            }
        } catch (error) {
            this.logger.error(`MessageService.getMessages -> Error: ${error.message}`);
            throw new Error(`Failed to retrieve messages: ${error.message}`);
        }
    }

    // Helper to extract thread ID from room context
    private getThreadIdFromRoom(room: IRoom): string | undefined {
        // In a real implementation, this would depend on how Rocket.Chat represents threads
        // This is a placeholder - replace with actual implementation based on your RC version
        return (room as any).threadId;
    }

    private async getRoomMessages(
        room: IRoom,
        read: IRead,
        user: IUser,
        params: ISummarizeParams
    ): Promise<IMessage[]> {
        // Calculate date range based on timeframe
        const { startDate, limit } = this.calculateTimeframeParams(params);

        // Get messages from the room
        const messages = await read.getRoomReader().getMessages(room.id, {
            limit: limit || 10,
            sort: { createdAt: 'asc' }
        });

        // Filter messages
        let filteredMessages = messages;

        // Filter by date if needed
        if (startDate) {
            const today = new Date();
            filteredMessages = messages.filter((message) => {
                const createdAt = new Date(message.createdAt);
                return createdAt >= startDate && createdAt <= today;
            });
        }

        // Filter by participants if needed
        if (params.participants && params.participants.length > 0) {
            filteredMessages = filteredMessages.filter((message) => {
                return params.participants && params.participants.includes(message.sender.username);
            });
        }

        // Convert to IMessage format
        return filteredMessages.map(message => ({
            id: message.id || 'no-id',
            sender: {
                username: message.sender.username,
                name: message.sender.name || message.sender.username
            },
            createdAt: message.createdAt || new Date(),
            text: message.text || ''
        }));
    }

    private async getThreadMessages(
        room: IRoom,
        read: IRead,
        user: IUser,
        threadId: string,
        params: ISummarizeParams
    ): Promise<IMessage[]> {
        // Get the thread
        const threadReader = read.getThreadReader();
        const thread = await threadReader.getThreadById(threadId);

        if (!thread) {
            throw new Error('Thread not found');
        }

        // Calculate date range based on timeframe
        const { startDate } = this.calculateTimeframeParams(params);

        // Filter messages
        let filteredMessages = thread;

        // Filter by date if needed
        if (startDate) {
            const today = new Date();
            filteredMessages = thread.filter((message) => {
                if (!message.createdAt) return false;
                const createdAt = new Date(message.createdAt);
                return createdAt >= startDate && createdAt <= today;
            });
        }

        // Filter by participants if needed
        if (params.participants && params.participants.length > 0) {
            filteredMessages = filteredMessages.filter((message) => {
                return params.participants && params.participants.includes(message.sender.username);
            });
        }

        // Remove the duplicate first message that Rocket.Chat includes in threads
        if (filteredMessages.length > 0) {
            filteredMessages.shift();
        }

        // Convert to IMessage format
        return filteredMessages.map(message => ({
            id: message.id || 'no-id',
            sender: {
                username: message.sender.username,
                name: message.sender.name || message.sender.username
            },
            createdAt: message.createdAt || new Date(),
            text: message.text || ''
        }));
    }

    public formatMessagesForSummary(messages: IMessage[]): string {
        if (messages.length === 0) {
            return 'No messages found.';
        }

        return messages.map(message => {
            const timestamp = typeof message.createdAt === 'string'
                ? new Date(message.createdAt).toISOString()
                : (message.createdAt as Date).toISOString();

            return `[${timestamp}] ${message.sender.name}: ${message.text}`;
        }).join('\n\n');
    }

    private calculateTimeframeParams(params: ISummarizeParams): { startDate?: Date, limit?: number } {
        const result: { startDate?: Date, limit?: number } = {};
        const now = new Date();

        if (!params.timeframe) {
            // Default to today
            result.startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            return result;
        }

        switch (params.timeframe.type) {
            case 'today':
                result.startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                break;

            case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
                result.startDate = weekAgo;
                break;

            case 'custom':
                if (params.timeframe.startDate) {
                    result.startDate = new Date(params.timeframe.startDate);
                }
                break;

            case 'unread':
                // For unread, we'll just limit the number of messages
                result.limit = 20;
                break;
        }

        return result;
    }
}
