import { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from '@journeyapps/powersync-sdk-react-native';

export class MockedPowerSyncConnector implements PowerSyncBackendConnector {
  constructor(protected dataUploader: () => Promise<void>) {}
  async fetchCredentials() {
    return {
      endpoint: '',
      token: ''
    };
  }
  async uploadData(database: AbstractPowerSyncDatabase) {
    return this.dataUploader();
  }
}
