import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { FinanceController } from './presentation/finance.controller';
import { FinanceIntegrationController } from './presentation/finance-integration.controller';
import { FinanceService } from './application/finance.service';
import { ClinicalFinanceService } from './application/clinical-finance.service';
import { FinanceIntegrationService } from './application/finance-integration.service';
import { FinanceCoreRepository } from './infrastructure/finance-core.repository';
import { FinanceClinicalRepository } from './infrastructure/finance-clinical.repository';
import { FinanceIntegrationRepository } from './infrastructure/finance-integration.repository';
import { BukkuAdapter } from './infrastructure/bukku.adapter';
import { BukkuWorker } from './infrastructure/bukku.worker';
import { AccountingPort } from '../../shared/ports/accounting.port';
import { FinanceReadPort } from '../../shared/ports/finance.read-port';
import { RECOVERY_SWEEP, RecoverySweep } from '../../infrastructure/outbox/recovery.scheduler';

/** F-08 (Bukku): re-enqueue sync records stranded when Redis was down after
 *  the durable commit — driven by the central recovery scheduler's tick. */
const BUKKU_RECOVERY_SWEEP = {
  provide: RECOVERY_SWEEP,
  useFactory: (integration: FinanceIntegrationService): RecoverySweep => ({
    name: 'bukku-reconcile-pending',
    run: (ctx) => integration.reconcilePendingSyncs(ctx),
  }),
  inject: [FinanceIntegrationService],
  multi: true,
};

/**
 * FinanceModule — Sprint 4 Finance core. Operational financial records +
 * management intelligence + commission + Bukku integration boundary.
 *
 * Boundaries (LOCKED): CRM is NOT POS / accounting / invoice issuer. Clinical
 * references are read via ClinicalReadPort (ClinicalModule exports it). No
 * payment processing, no invoice engine, no Bukku real adapter (Sprint 8).
 */
@Module({
  imports: [AuthModule, ClinicalModule],
  controllers: [FinanceController, FinanceIntegrationController],
  providers: [
    FinanceService, FinanceCoreRepository,
    ClinicalFinanceService, FinanceClinicalRepository,
    FinanceIntegrationService, FinanceIntegrationRepository,
    FinanceReadPort,
    { provide: AccountingPort, useClass: BukkuAdapter },
    BukkuWorker,
    BUKKU_RECOVERY_SWEEP,
  ],
  exports: [FinanceService, ClinicalFinanceService, FinanceIntegrationService, FinanceReadPort],
})
export class FinanceModule {}
