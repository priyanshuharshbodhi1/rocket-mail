import { App } from '@rocket.chat/apps-engine/definition/App';
import {
    IAppAccessors,
    IConfigurationExtend,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { extendSettings } from './config/SettingsManager';
import { CommandHandler } from './handlers/CommandHandler';

export class RocketMailApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    /**
     * Initialize the app
     * @param configuration
     */
    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        await Promise.all([
            extendSettings(configuration.settings),
            configuration.slashCommands.provideSlashCommand(new CommandHandler(this)),
        ]);
    }
}
