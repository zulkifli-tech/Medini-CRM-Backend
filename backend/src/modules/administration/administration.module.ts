import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { AdministrationController } from './presentation/administration.controller';
import { AdministrationService } from './application/administration.service';
import { AdministrationRepository } from './infrastructure/administration.repository';
import { RefreshTokenService } from '../../core/auth/refresh-token.service';
import { StaffRegistrationService } from '../../core/auth/staff-registration.service';

@Module({
  imports: [AuthModule],
  controllers: [AdministrationController],
  providers: [AdministrationService, AdministrationRepository, RefreshTokenService, StaffRegistrationService],
  exports: [AdministrationService],
})
export class AdministrationModule {}
