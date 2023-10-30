import {
  AbstractStreamingSyncImplementationOptions,
  ReactNativeStreamingSyncImplementation,
  StreamingSyncLine,
  StreamingSyncRequest
} from '@journeyapps/powersync-sdk-react-native';

/**
 * Mock PowerSync stream instance
 */
const PAYLOAD = `{"checkpoint":{"last_op_id":"833","write_checkpoint":"35","buckets":[{"bucket":"user_lists['57ff018e-5513-4f48-88a2-67a0c680bf29']","count":3,"checksum":2057128786},{"bucket":"user_lists['4430c1c3-a9ce-4a63-b0fd-ef99068a438b']","count":2,"checksum":1511966762}]}}
{"data":{"bucket":"user_lists['57ff018e-5513-4f48-88a2-67a0c680bf29']","data":[{"op_id":"810","op":"PUT","object_type":"lists","object_id":"57ff018e-5513-4f48-88a2-67a0c680bf29","data":{"id":"57ff018e-5513-4f48-88a2-67a0c680bf29","created_at":"2023-10-26 15:23:08Z","name":"dsfsdfsdf","owner_id":"b1825946-ae3c-43df-96cd-40be659d2716"},"checksum":1939980745,"subkey":"64fb30600f072d6da30dca3b/ede75215-5446-5777-a363-17693eff82b8"},{"op_id":"816","op":"REMOVE","object_type":"lists","object_id":"57ff018e-5513-4f48-88a2-67a0c680bf29","data":null,"checksum":2472134592,"subkey":"64fb30600f072d6da30dca3b/ede75215-5446-5777-a363-17693eff82b8"},{"op_id":"820","op":"PUT","object_type":"lists","object_id":"57ff018e-5513-4f48-88a2-67a0c680bf29","data":{"id":"57ff018e-5513-4f48-88a2-67a0c680bf29","created_at":"2023-10-26 15:23:08Z","name":"dsfsdfsdf","owner_id":"b1825946-ae3c-43df-96cd-40be659d2716"},"checksum":1939980745,"subkey":"653f53386e95c062b049af89/ede75215-5446-5777-a363-17693eff82b8"}],"has_more":false,"after":"0","next_after":"820"}}
{"data":{"bucket":"user_lists['4430c1c3-a9ce-4a63-b0fd-ef99068a438b']","data":[{"op_id":"822","op":"PUT","object_type":"lists","object_id":"4430c1c3-a9ce-4a63-b0fd-ef99068a438b","data":{"id":"4430c1c3-a9ce-4a63-b0fd-ef99068a438b","created_at":"2023-10-30 06:54:41Z","name":"dfdsfdsf","owner_id":"b1825946-ae3c-43df-96cd-40be659d2716"},"checksum":755983381,"subkey":"653f53386e95c062b049af89/e84c35f4-7c9c-56d8-8810-6dcb3ae242fe"},{"op_id":"826","op":"PUT","object_type":"lists","object_id":"4430c1c3-a9ce-4a63-b0fd-ef99068a438b","data":{"id":"4430c1c3-a9ce-4a63-b0fd-ef99068a438b","created_at":"2023-10-30 06:54:41Z","name":"dfdsfdsf","owner_id":"b1825946-ae3c-43df-96cd-40be659d2716"},"checksum":755983381,"subkey":"653f53386e95c062b049af89/e84c35f4-7c9c-56d8-8810-6dcb3ae242fe"}],"has_more":false,"after":"0","next_after":"826"}}
{"checkpoint_complete":{"last_op_id":"833"}}
{"token_expires_in":2321}`;

const PAYLOAD_LINES = PAYLOAD.split('\n');

export class MockedStreamingSyncImplementation extends ReactNativeStreamingSyncImplementation {
  lineIndex: number;
  constructor(options: AbstractStreamingSyncImplementationOptions) {
    super(options);
    this.lineIndex = 0;
  }
  async *streamingSyncRequest(req: StreamingSyncRequest, signal: AbortSignal): AsyncGenerator<StreamingSyncLine> {
    if (this.lineIndex >= PAYLOAD_LINES.length) {
      return;
    }
    const line = PAYLOAD_LINES[this.lineIndex++];
    const value = JSON.parse(line);
    yield value;
  }
}
