import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { SlashCommandContext } from "@rocket.chat/apps-engine/definition/slashcommands";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { RocketMailApp } from "../../RocketMailApp";
import { AddCommand } from "../handlers/contacts-handlers/AddHandler";
import { DeleteCommand } from "../handlers/contacts-handlers/DeleteHandler";
import { ListCommand } from "../handlers/contacts-handlers/ListHandler";
import { SendEmailCommand } from "../handlers/SendEmailHandler";
import { HelpCommand } from "../handlers/HelpHandler";
import { ContactService } from "./ContactService";
import { NaturalLanguageRequestHandler } from "../handlers/NaturalLanguageRequestHandler";
import { LoginCommand } from "../handlers/auth-handlers/LoginHandler";
import { LogoutCommand } from "../handlers/auth-handlers/LogoutHandler";
import { ReportCommand } from "../handlers/ReportHandler";
import { SubCommandEnum } from "../types/enums/SubCommandEnum";

export interface ExecutorProps {
    sender: IUser;
    room: IRoom;
    command: string[];
    context: SlashCommandContext;
    read: IRead;
    modify: IModify;
    http: IHttp;
    persistence: IPersistence;
    app: RocketMailApp;
}

export class CommandUtility implements ExecutorProps {
    sender: IUser;
    room: IRoom;
    command: string[];
    context: SlashCommandContext;
    read: IRead;
    modify: IModify;
    http: IHttp;
    persistence: IPersistence;
    app: RocketMailApp;
    private contactService: ContactService;

    constructor(props: ExecutorProps) {
        this.sender = props.sender;
        this.room = props.room;
        this.command = props.command;
        this.context = props.context;
        this.read = props.read;
        this.modify = props.modify;
        this.http = props.http;
        this.persistence = props.persistence;
        this.app = props.app;
        this.contactService = new ContactService(this.app);
    }

    private async handleSubcommands() {
        const [subcommand, ...args] = this.command;

        switch (subcommand.toLowerCase()) {
            case SubCommandEnum.SENDEMAIL:
                await new SendEmailCommand(this.app, this.contactService).execute(
                    args, this.sender, this.room, this.read, this.modify, this.http, this.persistence
                );
                break;
            case SubCommandEnum.ADD:
                await new AddCommand(this.app, this.contactService).execute(
                    args, this.sender, this.room, this.modify, this.persistence, this.read
                );
                break;
            case SubCommandEnum.DELETE:
                await new DeleteCommand(this.app, this.contactService).execute(
                    args, this.sender, this.room, this.modify, this.persistence, this.read
                );
                break;
            case SubCommandEnum.LIST:
                await new ListCommand(this.app, this.contactService).execute(
                    this.sender, this.room, this.modify, this.read
                );
                break;
            case SubCommandEnum.HELP:
                await new HelpCommand().execute(this.sender, this.room, this.modify, this.read);
                break;
            case SubCommandEnum.LOGIN:
                await new LoginCommand(this.app).executor(
                    this.context, this.read, this.modify, this.http, this.persistence
                );
                break;
            case SubCommandEnum.LOGOUT:
                await new LogoutCommand(this.app).executor(
                    this.context, this.read, this.modify, this.http, this.persistence
                );
                break;
            case SubCommandEnum.REPORT:
                await new ReportCommand(this.app).execute(
                    args, this.sender, this.room, this.read, this.modify, this.http, this.persistence
                );
                break;
            default:
                await this.handleNaturalLanguageRequest(subcommand, args);
                break;
        }
    }

    private async handleNaturalLanguageRequest(initialCommand: string, args: Array<string>): Promise<void> {
        const fullRequest = [initialCommand, ...args].join(' ');

        // Show processing message
        const appUser = await this.read.getUserReader().getAppUser() as IUser;
        const processingMessage = this.modify
            .getCreator()
            .startMessage()
            .setSender(appUser)
            .setRoom(this.room)
            .setGroupable(false)
            .setText(`Processing your request: "${fullRequest}"\nPlease wait...`);

        await this.read.getNotifier().notifyUser(this.sender, processingMessage.getMessage());

        try {
            // Initialize the LLM task handler
            const llmTaskHandler = new NaturalLanguageRequestHandler(
                this.read,
                this.http,
                this.modify,
                this.persistence,
                this.contactService,
                this.app.getLogger(),
                this.app
            );

            // Process the natural language request
            const result = await llmTaskHandler.processTask(fullRequest, this.sender, this.room);

            this.app.getLogger().debug(`LLMTaskHandler.processTask -> Result: ${JSON.stringify(result)}`);

            // Send the result message
            const resultMessage = this.modify
                .getCreator()
                .startMessage()
                .setSender(appUser)
                .setRoom(this.room)
                .setGroupable(false)
                .setText(result.success
                    ? result.message
                    : `❌ ${result.message}`
                );

            await this.read.getNotifier().notifyUser(this.sender, resultMessage.getMessage());
        } catch (error) {
            // Handle any unexpected errors
            this.app.getLogger().error('Error processing natural language request:', error);

            const errorMessage = this.modify
                .getCreator()
                .startMessage()
                .setSender(appUser)
                .setRoom(this.room)
                .setGroupable(false)
                .setText(`❌ An unexpected error occurred: ${error.message}\n\nPlease try again with a more specific request or use one of the standard commands (try /rocket-mail help).`);

            await this.read.getNotifier().notifyUser(this.sender, errorMessage.getMessage());
        }
    }

    public async resolveCommand() {
        if (this.command.length === 0) {
            await new HelpCommand().execute(this.sender, this.room, this.modify, this.read);
            return;
        }

        await this.handleSubcommands();
    }
}