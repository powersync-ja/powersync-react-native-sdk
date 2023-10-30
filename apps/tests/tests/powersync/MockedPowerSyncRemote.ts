import { AbstractRemote } from '@journeyapps/powersync-sdk-common';

export class MockedPowerSyncRemote extends AbstractRemote {
  async post(path: string, data: any, headers: Record<string, string> = {}): Promise<any> {
    throw new Error('Not used in tests yet.');
  }

  async get(path: string, headers?: Record<string, string>): Promise<any> {
    throw new Error('Not used in tests yet.');
  }

  /**
   * This remote simply resolves an example streaming response
   */
  async postStreaming(
    path: string,
    data: any,
    headers: Record<string, string> = {},
    signal?: AbortSignal
  ): Promise<any> {
    throw new Error('Not used in tests yet');
  }
}
