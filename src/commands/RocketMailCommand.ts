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
import { CommandUtility } from "../services/CommandUtility";

export class RocketMailCommand implements ISlashCommand {
    public command = "rocket-mail";
    public i18nDescription = "Handles email commands";
    public i18nParamsExample = "<subcommand>";
    public providesPreview = false;
    
    constructor(private readonly app: RocketMailApp) {}

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        const command = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();

        const commandUtility = new CommandUtility({
            sender,
            room,
            command,
            context,
            read,
            modify, 
            http,
            persistence,
            app: this.app
        });

        await commandUtility.resolveCommand();
    }
}
