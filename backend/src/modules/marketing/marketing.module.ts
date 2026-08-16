import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { PatientsReadPort } from '../../shared/ports/patients.read-port';
import { MarketingController } from './presentation/marketing.controller';
import { MarketingService } from './application/marketing.service';
import { MarketingRepository } from './infrastructure/marketing.repository';

@Module({
  imports: [AuthModule],
  controllers: [MarketingController],
  providers: [MarketingService, MarketingRepository, PatientsReadPort],
  exports: [MarketingService],
})
export class MarketingModule {}
