import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { RocketMailApp } from '../RocketMailApp';
import { ReportCommand } from '../commands/ReportCommand';
import { SettingsIds } from '../enums/SettingsIds';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export class ReportScheduler {
    private timer: NodeJS.Timeout | undefined;

    constructor(private readonly app: RocketMailApp) {}

    /**
     * Start the scheduler to send automatic reports
     */
    public async startScheduler(
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        // Clear any existing scheduler
        this.stopScheduler();

        // Check if automatic reports are enabled
        const enabled = await read.getEnvironmentReader().getSettings().getById(SettingsIds.ReportEnabled);
        if (!enabled || enabled.value !== true) {
            this.app.getLogger().debug('Automatic reports are disabled');
            return;
        }

        // Get the time to send reports
        const timeSetting = await read.getEnvironmentReader().getSettings().getById(SettingsIds.ReportTime);
        const timeStr = timeSetting && typeof timeSetting.value === 'string' ? timeSetting.value : '09:00';

        // Set up scheduler to check every minute if it's time to send reports
        this.timer = setInterval(async () => {
            try {
                const now = new Date();
                const [hour, minute] = timeStr.split(':').map(n => parseInt(n, 10));

                // Check if it's time to send reports
                if (now.getHours() === hour && now.getMinutes() === minute) {
                    this.app.getLogger().debug('Starting automatic report generation');
                    await this.generateReports(read, modify, http, persistence);
                }
            } catch (error) {
                this.app.getLogger().error('Error checking for automatic report time:', error);
            }
        }, 60 * 1000); // Check every minute

        this.app.getLogger().debug(`Scheduler started, will send reports at ${timeStr}`);
    }

    /**
     * Stop the scheduler
     */
    public stopScheduler(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
            this.app.getLogger().debug('Scheduler stopped');
        }
    }

    /**
     * Generate reports for all authenticated users
     */
    private async generateReports(
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        try {
            // Get all users with stored OAuth credentials
            const association = new RocketChatAssociationRecord(
                RocketChatAssociationModel.USER,
                'oauth'
            );

            const authenticatedUsers = await read.getPersistenceReader().readByAssociation(association);
            this.app.getLogger().debug(`Found ${authenticatedUsers.length} authenticated users for reports`);

            // Create report command
            const reportCommand = new ReportCommand(this.app);

            // Generate report for each user
            for (const userData of authenticatedUsers) {
                try {
                    // Check if userData has an association ID
                    if (userData && typeof userData === 'object' && 'userId' in userData) {
                        const userId = userData.userId as string;
                        await reportCommand.generateAutomaticReport(userId, read, modify, http, persistence);
                    }
                } catch (userError) {
                    this.app.getLogger().error(`Error generating report for user:`, userError);
                }
            }
        } catch (error) {
            this.app.getLogger().error('Error generating automatic reports:', error);
        }
    }
}
