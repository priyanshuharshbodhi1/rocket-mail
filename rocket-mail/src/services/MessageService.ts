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
            // Check if we're in a thread context
            const threadId = this.getThreadIdFromContext(room);

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

    private getThreadIdFromContext(room: IRoom): string | undefined {
        // Per Rocket.Chat's API, a thread is associated with a parent message ID
        // This would come from the context where the command was executed

        // Look for thread context in room customFields
        if (room.customFields && room.customFields.threadId) {
            return room.customFields.threadId as string;
        }

        // If not found in customFields, we don't have access to threadId in this context
        return undefined;
    }

    private async getRoomMessages(
        room: IRoom,
        read: IRead,
        user: IUser,
        params: ISummarizeParams
    ): Promise<IMessage[]> {
        // Calculate date range based on timeframe
        const { startDate, limit } = this.calculateTimeframeParams(params);
        const messageLimit = limit || 100; // Increase default limit to get more context

        // Get messages from the room with proper options
        const roomReader = read.getRoomReader();
        const messages = await roomReader.getMessages(room.id, {
            limit: messageLimit,
            skip: 0,
            sort: { createdAt: "desc" }, // Get newest first, then reverse for chronological order
        });

        // Reverse to get chronological order
        const chronologicalMessages = [...messages].reverse();

        // Filter messages
        let filteredMessages = chronologicalMessages;

        // Filter by date if needed
        if (startDate) {
            const today = new Date();
            filteredMessages = filteredMessages.filter((message) => {
                if (!message.createdAt) return false;
                const createdAt = new Date(message.createdAt);
                return createdAt >= startDate && createdAt <= today;
            });
        }

        // Filter by participants if needed
        if (params.participants && params.participants.length > 0) {
            filteredMessages = filteredMessages.filter((message) => {
                return params.participants && message.sender &&
                       params.participants.includes(message.sender.username);
            });
        }

        // Convert to IMessage format
        return filteredMessages.map(message => ({
            id: message.id || 'no-id',
            sender: {
                username: message.sender?.username || 'unknown',
                name: message.sender?.name || message.sender?.username || 'unknown'
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
        // Use the messageReader to get thread messages
        const messageReader = read.getMessageReader();

        // Get the parent message first
        const parentMessage = await messageReader.getById(threadId);

        if (!parentMessage) {
            throw new Error('Thread parent message not found');
        }

        // Since there's no direct method to get thread messages in the API,
        // we'll need to get messages from the room and filter by thread
        const roomReader = read.getRoomReader();
        const allRoomMessages = await roomReader.getMessages(room.id, {
            limit: 100, // Get a reasonable number of messages
            skip: 0,
            sort: { createdAt: "desc" },
        });

        // Filter to get only messages that belong to the thread
        const threadMessages = allRoomMessages.filter(message =>
            message.threadId === threadId && message.id !== threadId
        );

        if (!threadMessages || threadMessages.length === 0) {
            // Return just the parent message if no replies
            return [{
                id: parentMessage.id || 'no-id',
                sender: {
                    username: parentMessage.sender?.username || 'unknown',
                    name: parentMessage.sender?.name || parentMessage.sender?.username || 'unknown'
                },
                createdAt: parentMessage.createdAt || new Date(),
                text: parentMessage.text || ''
            }];
        }

        // Calculate date range based on timeframe
        const { startDate } = this.calculateTimeframeParams(params);

        // Include parent message at the beginning and then all replies
        let allMessages = [parentMessage, ...threadMessages];

        // Filter by date if needed
        if (startDate) {
            const today = new Date();
            allMessages = allMessages.filter((message) => {
                if (!message.createdAt) return false;
                const createdAt = new Date(message.createdAt);
                return createdAt >= startDate && createdAt <= today;
            });
        }

        // Filter by participants if needed
        if (params.participants && params.participants.length > 0) {
            allMessages = allMessages.filter((message) => {
                return params.participants && message.sender &&
                       params.participants.includes(message.sender.username);
            });
        }

        // Convert to IMessage format
        return allMessages.map(message => ({
            id: message.id || 'no-id',
            sender: {
                username: message.sender?.username || 'unknown',
                name: message.sender?.name || message.sender?.username || 'unknown'
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
            // Format the date for readability rather than using ISO format
            const timestamp = typeof message.createdAt === 'string'
                ? new Date(message.createdAt).toLocaleString()
                : (message.createdAt as Date).toLocaleString();

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
                result.limit = 50; // Increased from 20 to get more context
                break;

            default:
                // Default to today if unknown type
                result.startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                break;
        }

        return result;
    }
}
