import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
    ILogger,
} from "@rocket.chat/apps-engine/definition/accessors";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { RocketMailApp } from "../RocketMailApp";
import { LLMService } from "../services/LLMService";
import { MessageService } from "../services/MessageService";
import { ISummarizeParams } from "../models/SummarizeParams";

export class SummarizeCommand {
    private messageService: MessageService;

    constructor(private readonly app: RocketMailApp) {
        this.messageService = new MessageService(app.getLogger());
    }

    // public async execute(
    //     args: Array<string>,
    //     sender: IUser,
    //     room: IRoom,
    //     read: IRead,
    //     modify: IModify,
    //     http: IHttp,
    //     persistence: IPersistence
    // ): Promise<void> {
    //     // Show processing message
    //     const processingMessage = modify
    //         .getCreator()
    //         .startMessage()
    //         .setSender(sender)
    //         .setRoom(room)
    //         .setText(`Processing your summarization request...\nThis may take a moment.`);

    //     await modify.getCreator().finish(processingMessage);

    //     try {
    //         // Step 1: Process natural language instruction
    //         const instruction = args.join(' ');
    //         const llmService = new LLMService(http, this.app.getLogger(), this.app);

    //         // Step 2: Extract parameters using LLM
    //         const params = await llmService.processSummarizeTask(instruction);
    //         this.app.getLogger().debug(`LLMService.processSummarizeTask -> Extracted parameters: ${JSON.stringify(params)}`);

    //         // Step 3: Fetch messages based on extracted parameters
    //         const messages = await this.messageService.getMessages(room, read, sender, params);

    //         if (messages.length === 0) {
    //             await this.sendResponse(
    //                 modify,
    //                 sender,
    //                 room,
    //                 `No messages found matching your criteria. Please try a different request.`
    //             );
    //             return;
    //         }

    //         // Step 4: Format messages for summarization
    //         const formattedMessages = this.messageService.formatMessagesForSummary(messages);

    //         // Step 5: Generate summary using LLM
    //         const summary = await llmService.generateSummary(formattedMessages, room.displayName || room.slugifiedName || 'Chat');

    //         // Step 6: Format as email
    //         const emailContent = this.formatEmailContent(
    //             summary,
    //             room.displayName || room.slugifiedName || 'Chat',
    //             params,
    //             messages.length
    //         );

    //         // Step 7: Send formatted email to the channel
    //         await this.sendResponse(modify, sender, room, emailContent);

    //     } catch (error) {
    //         this.app.getLogger().error("Error in summarize command:", error);
    //         await this.sendResponse(
    //             modify,
    //             sender,
    //             room,
    //             `❌ An error occurred while summarizing: ${error.message}`
    //         );
    //     }
    // }

    public async execute(
        args: Array<string>,
        sender: IUser,
        room: IRoom,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        // Step 0: Notify that processing has started
        await this.sendResponse(
            modify,
            sender,
            room,
            `Processing your summarization request... This may take a moment.`
        );

        try {
            // Step 1: Process natural language instruction
            const instruction = args.join(" ");
            await this.sendResponse(
                modify,
                sender,
                room,
                `Step 1: Received instruction - "${instruction}"`
            );

            // Initialize LLMService
            const llmService = new LLMService(
                http,
                this.app.getLogger(),
                this.app
            );

            // Step 2: Extract parameters using LLM
            const params = await llmService.processSummarizeTask(instruction);
            this.app.getLogger().debug(
                `LLMService.processSummarizeTask -> Extracted parameters: ${JSON.stringify(params)}`
            );
            await this.sendResponse(
                modify,
                sender,
                room,
                `Step 2: Extracted parameters - ${JSON.stringify(params)}`
            );

            // Step 3: Fetch messages based on extracted parameters
            const messages = await this.messageService.getMessages(room, read, sender, params);
            await this.sendResponse(
                modify,
                sender,
                room,
                `Step 3: Fetched ${messages.length} message(s) based on your criteria.`
            );

            if (messages.length === 0) {
                await this.sendResponse(
                    modify,
                    sender,
                    room,
                    `No messages found matching your criteria. Please try a different request.`
                );
                return;
            }

            // Step 4: Format messages for summarization
            const formattedMessages = this.messageService.formatMessagesForSummary(messages);
            await this.sendResponse(
                modify,
                sender,
                room,
                `Step 4: Formatted messages for summarization.`
            );

            // Optionally: Delay (comment out to remove, which is recommended to avoid timeouts)
            // const delayTime = 30000; // 30 seconds
            // await new Promise(resolve => setTimeout(resolve, delayTime));
            // await this.sendResponse(
            //     modify,
            //     sender,
            //     room,
            //     `Step 5: Waiting for ${delayTime / 1000} seconds before generating summary...`
            // );

            // Step 5 (renumbered): Generate summary using LLM
            const summary = await llmService.generateSummary(
                formattedMessages,
                room.displayName || room.slugifiedName || "Chat"
            );
            await this.sendResponse(
                modify,
                sender,
                room,
                `Step 5: Generated summary: ${summary.substring(0, 200)}...` // Truncated preview
            );

            // Step 6: Format as email
            const emailContent = this.formatEmailContent(
                summary,
                room.displayName || room.slugifiedName || "Chat",
                params,
                messages.length
            );
            await this.sendResponse(
                modify,
                sender,
                room,
                `Step 6: Formatted email content.`
            );

            // Step 7: Send formatted email to the channel
            await this.sendResponse(
                modify,
                sender,
                room,
                `Step 7: ${emailContent}`
            );
        } catch (error: any) {
            this.app.getLogger().error("Error in summarize command:", error);
            await this.sendResponse(
                modify,
                sender,
                room,
                `❌ An error occurred while summarizing: ${error.message}`
            );
        }
    }

    private formatEmailContent(
        summary: string,
        roomName: string,
        params: ISummarizeParams,
        messageCount: number
    ): string {
        const now = new Date();

        // Create subject line based on parameters
        let subject = `Summary of ${roomName}`;

        // Add timeframe information to subject
        if (params.timeframe) {
            switch (params.timeframe.type) {
                case "today":
                    subject += ` - Today`;
                    break;
                case "week":
                    subject += ` - Past Week`;
                    break;
                case "unread":
                    subject += ` - Unread Messages`;
                    break;
                case "custom":
                    if (
                        params.timeframe.startDate &&
                        params.timeframe.endDate
                    ) {
                        subject += ` - ${params.timeframe.startDate} to ${params.timeframe.endDate}`;
                    } else if (params.timeframe.startDate) {
                        subject += ` - Since ${params.timeframe.startDate}`;
                    }
                    break;
            }
        }

        // Add participant information if available
        if (params.participants && params.participants.length > 0) {
            subject += ` (${params.participants.join(", ")})`;
        }

        // Create to line
        const toLine = params.recipient_email
            ? `To: ${params.recipient_email}`
            : "To: [Recipient email will be added here]";

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
            *Analyzed ${messageCount} messages*
            *Time: ${now.toLocaleString()}*
        `;
    }

    private async sendResponse(
        modify: IModify,
        sender: IUser,
        room: IRoom,
        text: string
    ): Promise<void> {
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room)
            .setText(text);

        await modify.getCreator().finish(messageBuilder);
    }
}
