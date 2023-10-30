import { AbstractPowerSyncDatabase, RNQSPowerSyncDatabaseOpenFactory } from '@journeyapps/powersync-sdk-react-native';
import { MockedPowerSyncDB } from './MockedPowerSyncDB';

export class MockOpenFactory extends RNQSPowerSyncDatabaseOpenFactory {
  getInstance(): AbstractPowerSyncDatabase {
    return new MockedPowerSyncDB(this.generateOptions());
  }
}
