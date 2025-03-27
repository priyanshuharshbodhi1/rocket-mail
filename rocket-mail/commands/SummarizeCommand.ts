import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { RocketMailApp } from "../RocketMailApp";
import { LLMService } from "../services/LLMService";

export class SummarizeCommand {
    constructor(
        private readonly app: RocketMailApp
    ) {}

    public async execute(
        args: Array<string>,
        sender: IUser,
        room: IRoom,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        // Show processing message
        const processingMessage = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room)
            .setText(`Processing your summarization request...\nThis may take a moment.`);

        await modify.getCreator().finish(processingMessage);

        try {
            // Parse arguments - options for time frame
            const { timeFrame, recipient } = this.parseArguments(args);
            
            // Fetch messages from the channel/thread
            const messages = await this.fetchMessages(room, read, timeFrame);
            
            if (messages.length === 0) {
                this.sendResponse(
                    modify,
                    sender,
                    room,
                    `No messages found in the specified time frame.`
                );
                return;
            }

            // Format messages for summarization
            const formattedMessages = this.formatMessagesForSummarization(messages);
            
            // Use LLM to summarize the messages
            const summary = await this.summarizeMessages(formattedMessages, http);

            // Format the email content
            const emailContent = this.formatEmailContent(summary, room.displayName || room.slugifiedName || 'Chat', timeFrame, recipient);

            // Send the formatted email to the channel
            this.sendResponse(modify, sender, room, emailContent);
            
        } catch (error) {
            this.app.getLogger().error("Error in summarize command:", error);
            this.sendResponse(
                modify,
                sender,
                room,
                `❌ An error occurred while summarizing: ${error.message}`
            );
        }
    }

    private parseArguments(args: Array<string>): { timeFrame: { days: number }, recipient: string | undefined } {
        // Default to last 24 hours
        let days = 1;
        let recipient: string | undefined = undefined;

        if (args.length > 0) {
            for (let i = 0; i < args.length; i++) {
                const arg = args[i].toLowerCase();
                
                // Check for time frame arguments
                if (arg === '--days' || arg === '-d') {
                    if (i + 1 < args.length) {
                        const daysArg = parseInt(args[i + 1]);
                        if (!isNaN(daysArg) && daysArg > 0) {
                            days = daysArg;
                            i++; // Skip the next argument which is the number
                        }
                    }
                }
                // Check for recipient argument
                else if (arg === '--to' || arg === '-t') {
                    if (i + 1 < args.length) {
                        recipient = args[i + 1];
                        i++; // Skip the next argument which is the recipient
                    }
                }
            }
        }

        return { timeFrame: { days }, recipient };
    }

    private async fetchMessages(room: IRoom, read: IRead, timeFrame: { days: number }) {
        // Calculate the timestamp for messages since X days ago
        const now = new Date();
        const fromDate = new Date();
        fromDate.setDate(now.getDate() - timeFrame.days);
        
        try {
            // Since getMessages is not available, we'll use the REST API method
            // through the built-in HTTP interface to get messages
            const roomId = room.id;
            
            // For the purposes of our implementation, we'll simulate fetching messages
            // In a real implementation, you would use the appropriate Rocket.Chat API
            // to fetch messages from the room
            
            // Example mock data structure
            const messages: Array<{
                id: string;
                sender: { username: string; name: string };
                createdAt: string;
                text: string;
            }> = [];
            
            // TODO: In a real implementation, you would use the Rocket.Chat API to fetch messages
            // This could be done through read.getEnvironmentReader().getServerSettings().getValueById('Site_Url')
            // and then making HTTP calls to the Rocket.Chat REST API
            
            // For now, we'll just create a sample message for demonstration
            messages.push({
                id: 'sample-id',
                sender: { username: 'user1', name: 'User One' },
                createdAt: new Date().toISOString(),
                text: 'This is a sample message for demonstration. In a real implementation, this would be fetched from the Rocket.Chat API.'
            });
            
            return messages;
        } catch (error) {
            this.app.getLogger().error('Error fetching messages:', error);
            throw new Error(`Failed to fetch messages: ${error.message}`);
        }
    }

    private formatMessagesForSummarization(messages: Array<any>): string {
        let formattedText = '';
        
        for (const message of messages) {
            const sender = message.sender ? (message.sender.username || message.sender.name || 'Unknown User') : 'Unknown User';
            const timestamp = message.createdAt ? new Date(message.createdAt).toISOString() : 'Unknown Time';
            const text = message.text || '';
            
            formattedText += `[${timestamp}] ${sender}: ${text}\n\n`;
        }
        
        return formattedText;
    }

    private async summarizeMessages(messagesText: string, http: IHttp): Promise<string> {
        const llmService = new LLMService(http, this.app.getLogger());
        
        try {
            // Create a prompt for summarization
            const prompt = `You are an AI assistant tasked with summarizing Rocket.Chat conversation history.
Please analyze the following conversation and create a concise but comprehensive summary.
Focus on the main topics discussed, key decisions made, action items, and any important information shared.
Format your response in a clear, professional way.

CONVERSATION HISTORY:
${messagesText}

SUMMARY:`;
            
            // Call the LLM service with the prompt
            const response = await llmService.callLLM(prompt);
            return response || "Unable to generate summary.";
        } catch (error) {
            this.app.getLogger().error('Error in summarizing messages:', error);
            throw new Error('Failed to generate summary');
        }
    }

    private formatEmailContent(summary: string, roomName: string, timeFrame: { days: number }, recipient?: string): string {
        const now = new Date();
        const fromDate = new Date();
        fromDate.setDate(now.getDate() - timeFrame.days);
        
        const subject = `Summary of ${roomName} - ${this.formatDate(fromDate)} to ${this.formatDate(now)}`;
        
        const toLine = recipient ? `To: ${recipient}` : 'To: [Recipient email will be added here]';
        
        return `
📧 **EMAIL FORMAT**

**From:** rocket-mail@rocket.chat
**${toLine}**
**Subject:** ${subject}
**Date:** ${now.toISOString()}

**Summary of Conversation in ${roomName}:**

${summary}

---
*This summary was generated by the Rocket-Mail app*
*Time period: Last ${timeFrame.days} day(s)*
        `;
    }

    private async sendResponse(modify: IModify, sender: IUser, room: IRoom, text: string): Promise<void> {
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room)
            .setText(text);

        await modify.getCreator().finish(messageBuilder);
    }
    
    /**
     * Format a date to a readable string
     * @param date The date to format
     * @returns Formatted date string (YYYY-MM-DD)
     */
    private formatDate(date: Date): string {
        return date.toISOString().split('T')[0];
    }
}
