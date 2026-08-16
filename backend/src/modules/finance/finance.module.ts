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
import { FinanceReadPort } from '../../shared/ports/finance.read-port';

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
  ],
  exports: [FinanceService, ClinicalFinanceService, FinanceIntegrationService, FinanceReadPort],
})
export class FinanceModule {}
