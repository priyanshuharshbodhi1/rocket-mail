import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {IUser} from "@rocket.chat/apps-engine/definition/users";
import {
    ISlashCommand,
    SlashCommandContext,
} from "@rocket.chat/apps-engine/definition/slashcommands";
import { RocketMailApp } from "../../RocketMailApp";
import { AddCommand } from "../handlers/contacts-handlers/AddHandler";
import { DeleteCommand } from "../handlers/contacts-handlers/DeleteHandler";
import { ListCommand } from "../handlers/contacts-handlers/ListHandler";
import { SendEmailCommand } from "../handlers/SendEmailHandler";
import { HelpCommand } from "../handlers/HelpHandler";
import { ContactService } from "../services/ContactService";
import { NaturalLanguageRequestHandler } from "../handlers/NaturalLanguageRequestHandler";
import { LoginCommand } from "../handlers/auth-handlers/LoginHandler";
import { LogoutCommand } from "../handlers/auth-handlers/LogoutHandler";
import { ReportCommand } from "../handlers/ReportHandler";

export class RocketMailCommand implements ISlashCommand {
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
            await new HelpCommand().execute(sender, room, modify, read);
            return;
        }

        switch (subcommand.toLowerCase()) {
            case 'sendemail':
                await new SendEmailCommand(this.app, this.contactService).execute(
                    args, sender, room, read, modify, http, persistence
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
                await new HelpCommand().execute(sender, room, modify, read);
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
            case 'report':
                await new ReportCommand(this.app).execute(
                    args, sender, room, read, modify, http, persistence
                );
                break;
            default:
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
        const appUser = await read.getUserReader().getAppUser() as IUser;
        const processingMessage = modify
            .getCreator()
            .startMessage()
            .setSender(appUser)
            .setRoom(room)
            .setGroupable(false)
            .setText(`Processing your request: "${fullRequest}"\nPlease wait...`);

        await read.getNotifier().notifyUser(sender, processingMessage.getMessage());

        try {
            // Initialize the LLM task handler
            const llmTaskHandler = new NaturalLanguageRequestHandler(
                read,
                http,
                modify,
                persistence,
                this.contactService,
                this.app.getLogger(),
                this.app
            );

            // Process the natural language request
            const result = await llmTaskHandler.processTask(fullRequest, sender, room);

            this.app.getLogger().debug(`LLMTaskHandler.processTask -> Result: ${JSON.stringify(result)}`);

            // Send the result message
            const resultMessage = modify
                .getCreator()
                .startMessage()
                .setSender(appUser)
                .setRoom(room)
                .setGroupable(false)
                .setText(result.success
                    ? result.message
                    : `❌ ${result.message}`
                );

            await read.getNotifier().notifyUser(sender, resultMessage.getMessage());
        } catch (error) {
            // Handle any unexpected errors
            this.app.getLogger().error('Error processing natural language request:', error);

            const errorMessage = modify
                .getCreator()
                .startMessage()
                .setSender(appUser)
                .setRoom(room)
                .setGroupable(false)
                .setText(`❌ An unexpected error occurred: ${error.message}\n\nPlease try again with a more specific request or use one of the standard commands (try /rocket-mail help).`);

            await read.getNotifier().notifyUser(sender, errorMessage.getMessage());
        }
    }
}
