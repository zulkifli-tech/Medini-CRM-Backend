import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { PatientsReadPort } from '../../shared/ports/patients.read-port';
import { WhatsappController } from './presentation/whatsapp.controller';
import { WhatsappService } from './application/whatsapp.service';
import { WhatsappRepository } from './infrastructure/whatsapp.repository';
import { WahaAdapter } from './infrastructure/waha.adapter';
import { WhatsappTransportWorker } from './infrastructure/whatsapp-transport.worker';
import { RECOVERY_SWEEP, RecoverySweep } from '../../infrastructure/outbox/recovery.scheduler';

/** F-04 (+N6-3): stranded queued-message reconciliation and auto-pause resume,
 *  driven by the central recovery scheduler's hourly tick. */
const WHATSAPP_RECOVERY_SWEEP = {
  provide: RECOVERY_SWEEP,
  useFactory: (whatsapp: WhatsappService): RecoverySweep[] => [
    { name: 'whatsapp-reconcile-queued', run: (ctx) => whatsapp.reconcileQueuedMessages(ctx) },
    { name: 'whatsapp-auto-resume', run: (ctx) => whatsapp.autoResumeExpiredChannels(ctx) },
  ],
  inject: [WhatsappService],
  multi: true,
};

@Module({
  imports: [AuthModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappRepository, PatientsReadPort, WahaAdapter, WhatsappTransportWorker, WHATSAPP_RECOVERY_SWEEP],
  exports: [WhatsappService],
})
export class WhatsappModule {}
