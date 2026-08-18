import { Global, Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository';
import { ScopedOutboxDispatcher } from './outbox.dispatcher';
import { OutboxWorker } from './outbox.worker';
import { OutboxRuntime } from './outbox.runtime';
import { ScopedOutboxRecovery } from './outbox.recovery';
import { RecoveryScheduler } from './recovery.scheduler';

@Global()
@Module({
  providers: [OutboxRepository, ScopedOutboxDispatcher, OutboxWorker, OutboxRuntime, ScopedOutboxRecovery, RecoveryScheduler],
  exports: [ScopedOutboxDispatcher, OutboxWorker, ScopedOutboxRecovery, RecoveryScheduler],
})
export class OutboxModule {}
