import {
  AbstractPowerSyncDatabase,
  AbstractStreamingSyncImplementation,
  PowerSyncBackendConnector,
  SqliteBucketStorage,
  BucketStorageAdapter
} from '@journeyapps/powersync-sdk-common';
import { MockedPowerSyncRemote } from './MockedPowerSyncRemote';
import { MockedStreamingSyncImplementation } from './MockedStreamingSyncImplementation';

export class MockedPowerSyncDB extends AbstractPowerSyncDatabase {
  async _init(): Promise<void> {}

  protected generateBucketStorageAdapter(): BucketStorageAdapter {
    return new SqliteBucketStorage(this.database, AbstractPowerSyncDatabase.transactionMutex);
  }

  protected generateSyncStreamImplementation(
    connector: PowerSyncBackendConnector
  ): AbstractStreamingSyncImplementation {
    const remote = new MockedPowerSyncRemote(connector);

    return new MockedStreamingSyncImplementation({
      adapter: this.bucketStorageAdapter,
      remote,
      uploadCrud: async () => {
        await this.initialized;
        await connector.uploadData(this);
      },
      retryDelayMs: this.options.retryDelay
    });
  }
}
