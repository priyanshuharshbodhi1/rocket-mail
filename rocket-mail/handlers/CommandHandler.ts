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
import { RocketMailApp } from "../RocketMailApp";
import { AddCommand } from "../commands/AddCommand";
import { DeleteCommand } from "../commands/DeleteCommand";
import { ListCommand } from "../commands/ListCommand";
import { SendEmailCommand } from "../commands/SendEmailCommand";
import { LastEmailCommand } from "../commands/LastEmailCommand";
import { HelpCommand } from "../commands/HelpCommand";
import { ContactService } from "../services/ContactService";

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
                    args, sender, room, read, modify, http
                );
                break;
            case 'lastemail':
                await new LastEmailCommand(this.app).execute(
                    sender, room, read, modify, http
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
            default:
                await this.handleLLMTask(subcommand, args, sender, room, modify);
                break;
        }
    }

    private async handleLLMTask(task: string, args: Array<string>, sender, room, modify): Promise<void> {
        const fullTask = [task, ...args].join(' ');

        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room)
            .setText(`Processing task: "${fullTask}"\n\nThis functionality will be implemented to use an LLM to process email-related tasks.`);

        await modify.getCreator().finish(messageBuilder);
    }
}
