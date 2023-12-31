import _ from 'lodash';
import Logger, { ILogger } from 'js-logger';

import {
  BucketRequest,
  isStreamingKeepalive,
  isStreamingSyncCheckpoint,
  isStreamingSyncCheckpointComplete,
  isStreamingSyncCheckpointDiff,
  isStreamingSyncData,
  StreamingSyncLine,
  StreamingSyncRequest
} from './streaming-sync-types';
import { AbstractRemote } from './AbstractRemote';
import ndjsonStream from 'can-ndjson-stream';
import { BucketChecksum, BucketStorageAdapter, Checkpoint } from '../bucket/BucketStorageAdapter';
import { SyncStatus, SyncStatusOptions } from '../../../db/crud/SyncStatus';
import { SyncDataBucket } from '../bucket/SyncDataBucket';
import { BaseObserver, BaseListener } from '../../../utils/BaseObserver';

export enum LockType {
  CRUD = 'crud',
  SYNC = 'sync'
}
/**
 * Abstract Lock to be implemented by various JS environments
 */
export interface LockOptions<T> {
  callback: () => Promise<T>;
  type: LockType;
  signal?: AbortSignal;
}

export interface AbstractStreamingSyncImplementationOptions {
  adapter: BucketStorageAdapter;
  remote: AbstractRemote;
  uploadCrud: () => Promise<void>;
  logger?: ILogger;
  retryDelayMs?: number;
}

export interface StreamingSyncImplementationListener extends BaseListener {
  statusChanged?: (status: SyncStatus) => void;
}

export const DEFAULT_STREAMING_SYNC_OPTIONS = {
  retryDelayMs: 5000,
  logger: Logger.get('PowerSyncStream')
};

const CRUD_UPLOAD_DEBOUNCE_MS = 1000;

export abstract class AbstractStreamingSyncImplementation extends BaseObserver<StreamingSyncImplementationListener> {
  protected _lastSyncedAt: Date | null;
  protected options: AbstractStreamingSyncImplementationOptions;

  syncStatus: SyncStatus;

  constructor(options: AbstractStreamingSyncImplementationOptions) {
    super();
    this.options = { ...DEFAULT_STREAMING_SYNC_OPTIONS, ...options };
    this.syncStatus = new SyncStatus({
      connected: false,
      lastSyncedAt: null,
      dataFlow: {
        uploading: false,
        downloading: false
      }
    });
  }

  get lastSyncedAt() {
    const lastSynced = this.syncStatus.lastSyncedAt;
    return lastSynced && new Date(lastSynced);
  }

  protected get logger() {
    return this.options.logger!;
  }

  get isConnected() {
    return this.syncStatus.connected;
  }

  abstract obtainLock<T>(lockOptions: LockOptions<T>): Promise<T>;

  async hasCompletedSync() {
    return this.options.adapter.hasCompletedSync();
  }

  triggerCrudUpload = _.debounce(
    () => {
      if (!this.syncStatus.connected || this.syncStatus.dataFlowStatus.uploading) {
        return;
      }
      this._uploadAllCrud();
    },
    CRUD_UPLOAD_DEBOUNCE_MS,
    { trailing: true }
  );

  protected async _uploadAllCrud(): Promise<void> {
    return this.obtainLock({
      type: LockType.CRUD,
      callback: async () => {
        this.updateSyncStatus({
          dataFlow: {
            uploading: true
          }
        });
        while (true) {
          try {
            const done = await this.uploadCrudBatch();
            if (done) {
              break;
            }
          } catch (ex) {
            this.updateSyncStatus({
              connected: false,
              dataFlow: {
                uploading: false
              }
            });
            await this.delayRetry();
            break;
          } finally {
            this.updateSyncStatus({
              dataFlow: {
                uploading: false
              }
            });
          }
        }
      }
    });
  }

  protected async uploadCrudBatch(): Promise<boolean> {
    const hasCrud = await this.options.adapter.hasCrud();
    if (hasCrud) {
      await this.options.uploadCrud();
      return false;
    } else {
      await this.options.adapter.updateLocalTarget(() => this.getWriteCheckpoint());
      return true;
    }
  }

  async getWriteCheckpoint(): Promise<string> {
    const response = await this.options.remote.get('/write-checkpoint2.json');
    return response['data']['write_checkpoint'] as string;
  }

  async streamingSync(signal?: AbortSignal): Promise<void> {
    signal?.addEventListener('abort', () => {
      this.updateSyncStatus({
        connected: false,
        dataFlow: {
          downloading: false
        }
      });
    });

    while (true) {
      try {
        if (signal?.aborted) {
          break;
        }
        await this.streamingSyncIteration(signal);
        // Continue immediately
      } catch (ex) {
        this.logger.error(ex);
        this.updateSyncStatus({
          connected: false
        });
        // On error, wait a little before retrying
        await this.delayRetry();
      }
    }
  }

  async streamingSyncIteration(signal?: AbortSignal, progress?: () => void): Promise<{ retry?: boolean }> {
    return await this.obtainLock({
      type: LockType.SYNC,
      signal,
      callback: async () => {
        this.logger.debug('Streaming sync iteration started');
        this.options.adapter.startSession();
        const bucketEntries = await this.options.adapter.getBucketStates();
        const initialBuckets = new Map<string, string>();

        bucketEntries.forEach((entry) => {
          initialBuckets.set(entry.bucket, entry.op_id);
        });

        const req: BucketRequest[] = Array.from(initialBuckets.entries()).map(([bucket, after]) => ({
          name: bucket,
          after: after
        }));

        let targetCheckpoint: Checkpoint | null = null;
        let validatedCheckpoint: Checkpoint | null = null;
        let appliedCheckpoint: Checkpoint | null = null;

        let bucketSet = new Set<string>(initialBuckets.keys());

        for await (let line of this.streamingSyncRequest(
          {
            buckets: req,
            include_checksum: true,
            raw_data: true
          },
          signal
        )) {
          // A connection is active and messages are being received
          if (!this.syncStatus.connected) {
            // There is a connection now
            _.defer(() => this.triggerCrudUpload());
            this.updateSyncStatus({
              connected: true
            });
          }

          if (isStreamingSyncCheckpoint(line)) {
            targetCheckpoint = line.checkpoint;
            const bucketsToDelete = new Set<string>(bucketSet);
            const newBuckets = new Set<string>();
            for (let checksum of line.checkpoint.buckets) {
              newBuckets.add(checksum.bucket);
              bucketsToDelete.delete(checksum.bucket);
            }
            if (bucketsToDelete.size > 0) {
              this.logger.debug('Removing buckets', [...bucketsToDelete]);
            }
            bucketSet = newBuckets;
            await this.options.adapter.removeBuckets([...bucketsToDelete]);
            await this.options.adapter.setTargetCheckpoint(targetCheckpoint);
          } else if (isStreamingSyncCheckpointComplete(line)) {
            this.logger.debug('Checkpoint complete', targetCheckpoint);
            const result = await this.options.adapter.syncLocalDatabase(targetCheckpoint);
            if (!result.checkpointValid) {
              // This means checksums failed. Start again with a new checkpoint.
              // TODO: better back-off
              await new Promise((resolve) => setTimeout(resolve, 50));
              return { retry: true };
            } else if (!result.ready) {
              // Checksums valid, but need more data for a consistent checkpoint.
              // Continue waiting.
              // landing here the whole time
            } else {
              appliedCheckpoint = _.clone(targetCheckpoint);
              this.logger.debug('validated checkpoint', appliedCheckpoint);
              this.updateSyncStatus({
                connected: true,
                lastSyncedAt: new Date(),
                dataFlow: {
                  downloading: false
                }
              });
            }

            validatedCheckpoint = _.clone(targetCheckpoint);
          } else if (isStreamingSyncCheckpointDiff(line)) {
            // TODO: It may be faster to just keep track of the diff, instead of the entire checkpoint
            if (targetCheckpoint == null) {
              throw new Error('Checkpoint diff without previous checkpoint');
            }
            const diff = line.checkpoint_diff;
            const newBuckets = new Map<string, BucketChecksum>();
            for (let checksum of targetCheckpoint.buckets) {
              newBuckets.set(checksum.bucket, checksum);
            }
            for (let checksum of diff.updated_buckets) {
              newBuckets.set(checksum.bucket, checksum);
            }
            for (let bucket of diff.removed_buckets) {
              newBuckets.delete(bucket);
            }

            const newCheckpoint: Checkpoint = {
              last_op_id: diff.last_op_id,
              buckets: [...newBuckets.values()],
              write_checkpoint: diff.write_checkpoint
            };
            targetCheckpoint = newCheckpoint;

            bucketSet = new Set<string>(newBuckets.keys());

            const bucketsToDelete = diff.removed_buckets;
            if (bucketsToDelete.length > 0) {
              this.logger.debug('Remove buckets', bucketsToDelete);
            }
            await this.options.adapter.removeBuckets(bucketsToDelete);
            await this.options.adapter.setTargetCheckpoint(targetCheckpoint);
          } else if (isStreamingSyncData(line)) {
            const { data } = line;
            this.updateSyncStatus({
              dataFlow: {
                downloading: true
              }
            });
            await this.options.adapter.saveSyncData({ buckets: [SyncDataBucket.fromRow(data)] });
          } else if (isStreamingKeepalive(line)) {
            const remaining_seconds = line.token_expires_in;
            if (remaining_seconds == 0) {
              // Connection would be closed automatically right after this
              this.logger.debug('Token expiring; reconnect');
              return { retry: true };
            }
            this.triggerCrudUpload();
          } else {
            this.logger.debug('Sync complete');

            if (_.isEqual(targetCheckpoint, appliedCheckpoint)) {
              this.updateSyncStatus({
                connected: true,
                lastSyncedAt: new Date()
              });
            } else if (_.isEqual(validatedCheckpoint, targetCheckpoint)) {
              const result = await this.options.adapter.syncLocalDatabase(targetCheckpoint);
              if (!result.checkpointValid) {
                // This means checksums failed. Start again with a new checkpoint.
                // TODO: better back-off
                await new Promise((resolve) => setTimeout(resolve, 50));
                return { retry: false };
              } else if (!result.ready) {
                // Checksums valid, but need more data for a consistent checkpoint.
                // Continue waiting.
              } else {
                appliedCheckpoint = _.clone(targetCheckpoint);
                this.updateSyncStatus({
                  connected: true,
                  lastSyncedAt: new Date(),
                  dataFlow: {
                    downloading: false
                  }
                });
              }
            }
          }
          progress?.();
        }
        this.logger.debug('Stream input empty');
        // Connection closed. Likely due to auth issue.
        return { retry: true };
      }
    });
  }

  async *streamingSyncRequest(req: StreamingSyncRequest, signal: AbortSignal): AsyncGenerator<StreamingSyncLine> {
    const body = await this.options.remote.postStreaming('/sync/stream', req, {}, signal);
    const stream = ndjsonStream(body);
    const reader = stream.getReader();

    try {
      while (true) {
        // Read from the stream
        const { done, value } = await reader.read();
        // Exit if we're done
        if (done) return;
        // Else yield the chunk
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  protected updateSyncStatus(options: SyncStatusOptions) {
    const updatedStatus = new SyncStatus({
      connected: options.connected ?? this.syncStatus.connected,
      lastSyncedAt: options.lastSyncedAt ?? this.syncStatus.lastSyncedAt,
      dataFlow: _.merge(_.clone(this.syncStatus.dataFlowStatus), options.dataFlow ?? {})
    });

    if (!this.syncStatus.isEqual(updatedStatus)) {
      this.syncStatus = updatedStatus;
      this.iterateListeners((cb) => cb.statusChanged?.(updatedStatus));
    }
  }

  private async delayRetry() {
    return new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs));
  }
}
