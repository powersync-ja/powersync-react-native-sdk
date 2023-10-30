import Chance from 'chance';
import { beforeEach, describe, it } from '../mocha/MochaRNAdapter';
import chai from 'chai';
import { AbstractPowerSyncDatabase, QueryResult } from '@journeyapps/powersync-sdk-react-native';
import { MockedPowerSyncConnector } from '../powersync/MockedPowerSyncConnector';
import { AppSchema } from '../powersync/AppSchema';
import { MockOpenFactory } from '../powersync/MockOpenFactory';

const { expect } = chai;
const chance = new Chance();

// Need to store the db on the global state since this variable will be cleared on hot reload,
// Attempting to open an already open DB results in an error.
let powersync: AbstractPowerSyncDatabase;

export function registerBaseTests() {
  beforeEach(async () => {
    try {
      if (powersync) {
        await powersync.disconnectAndClear();
      } else {
        const factory = new MockOpenFactory({ dbFilename: 'testdd.db', schema: AppSchema });
        powersync = factory.getInstance();
        await powersync.init();
      }
      await powersync.connect(new MockedPowerSyncConnector(async () => {}));
    } catch (e) {
      console.warn('error on before each', e);
    }
  });

  describe('Syncing', () => {
    it('Should download data', async () => {
      const res = await new Promise<QueryResult>(async (resolve, reject) => {
        const abort = new AbortController();
        for await (const res of powersync.watch('SELECT * FROM lists', [], { signal: abort.signal })) {
          console.log('res', res);
          if (res.rows?.length > 0) {
            resolve(res);
            abort.abort();
          }
        }
      });
      expect(res.rows?.length).to.greaterThan(0);
    });
  });
}
