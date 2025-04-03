import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    ISlashCommand,
    SlashCommandContext,
} from "@rocket.chat/apps-engine/definition/slashcommands";
import { RocketMailApp } from "../../RocketMailApp";
import { AddCommand } from "../commands/AddCommand";
import { DeleteCommand } from "../commands/DeleteCommand";
import { ListCommand } from "../commands/ListCommand";
import { SendEmailCommand } from "../commands/SendEmailCommand";
import { LastEmailCommand } from "../commands/LastEmailCommand";
import { HelpCommand } from "../commands/HelpCommand";
import { SearchEmailCommand } from "../commands/SearchEmailCommand";
import { ViewEmailCommand } from "../commands/ViewEmailCommand";
import { CountEmailCommand } from "../commands/CountEmailCommand";
import { ContactService } from "../services/ContactService";
import { LLMTaskHandler } from "../services/LLMTaskHandler";
import { LoginCommand } from "../commands/LoginCommand";
import { LogoutCommand } from "../commands/LogoutCommand";
import { ReportCommand } from "../commands/ReportCommand";

export class CommandHandler implements ISlashCommand {
    public command = "rocket-mail";
    public i18nDescription = "Handles email commands";
    public i18nParamsExample = "<subcommand>";
    public providesPreview = false;
    private contactService: ContactService;

    constructor(private readonly app: RocketMailApp) {
        this.contactService = new ContactService(app);
    }

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        const [subcommand, ...args] = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();

        if (!subcommand) {
            await new HelpCommand().execute(sender, room, modify);
            return;
        }

        switch (subcommand.toLowerCase()) {
            case 'sendemail':
                await new SendEmailCommand(this.app, this.contactService).execute(
                    args, sender, room, read, modify, http, persistence
                );
                break;
            case 'lastemail':
                await new LastEmailCommand(this.app).execute(
                    sender, room, read, modify, http, persistence
                );
                break;
            case 'add':
                await new AddCommand(this.app, this.contactService).execute(
                    args, sender, room, modify, persistence, read
                );
                break;
            case 'delete':
                await new DeleteCommand(this.app, this.contactService).execute(
                    args, sender, room, modify, persistence, read
                );
                break;
            case 'list':
                await new ListCommand(this.app, this.contactService).execute(
                    sender, room, modify, read
                );
                break;
            case 'help':
                await new HelpCommand().execute(sender, room, modify);
                break;
            case 'login':
                await new LoginCommand(this.app).executor(
                    context, read, modify, http, persistence
                );
                break;
            case 'logout':
                await new LogoutCommand(this.app).executor(
                    context, read, modify, http, persistence
                );
                break;
            case 'search':
                await new SearchEmailCommand(this.app).execute(
                    args, sender, room, read, modify, http, persistence
                );
                break;
            case 'view':
                await new ViewEmailCommand(this.app).execute(
                    args, sender, room, read, modify, http, persistence
                );
                break;
            case 'count':
                await new CountEmailCommand(this.app).execute(
                    args, sender, room, read, modify, http, persistence
                );
                break;
            case 'report':
                await new ReportCommand(this.app).execute(
                    args, sender, room, read, modify, http, persistence
                );
                break;
            default:
                // Handle as natural language request
                await this.handleNaturalLanguageRequest(subcommand, args, sender, room, read, modify, http, persistence);
                break;
        }
    }

    private async handleNaturalLanguageRequest(
        initialCommand: string,
        args: Array<string>,
        sender,
        room,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        const fullRequest = [initialCommand, ...args].join(' ');

        // Show processing message
        const processingMessage = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room)
            .setText(`Processing your request: "${fullRequest}"\nPlease wait...`);

        await modify.getCreator().finish(processingMessage);

        try {
            // Initialize the LLM task handler
            const llmTaskHandler = new LLMTaskHandler(
                read,
                http,
                modify,
                persistence,
                this.contactService,
                this.app.getLogger(),
                this.app
            );

            // Process the natural language request
            const result = await llmTaskHandler.processTask(fullRequest, sender);

            this.app.getLogger().debug(`LLMTaskHandler.processTask -> Result: ${JSON.stringify(result)}`);

            // Send the result message
            const resultMessage = modify
                .getCreator()
                .startMessage()
                .setSender(sender)
                .setRoom(room)
                .setText(result.success
                    ? result.message
                    : `❌ ${result.message}`
                );

            await modify.getCreator().finish(resultMessage);
        } catch (error) {
            // Handle any unexpected errors
            this.app.getLogger().error('Error processing natural language request:', error);

            const errorMessage = modify
                .getCreator()
                .startMessage()
                .setSender(sender)
                .setRoom(room)
                .setText(`❌ An unexpected error occurred: ${error.message}\n\nPlease try again with a more specific request or use one of the standard commands (try /rocket-mail help).`);

            await modify.getCreator().finish(errorMessage);
        }
    }
}
