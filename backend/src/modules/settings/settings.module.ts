import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { ConfigResolverPort } from '../../shared/ports/config-resolver.port';
import { SettingsController } from './presentation/settings.controller';
import { SettingsService } from './application/settings.service';
import { SettingsRepository } from './infrastructure/settings.repository';

@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
  providers: [SettingsService, SettingsRepository, ConfigResolverPort],
  exports: [SettingsService, ConfigResolverPort],
})
export class SettingsModule {}
