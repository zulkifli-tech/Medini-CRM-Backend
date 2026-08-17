import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { AiPolicyPort } from '../../shared/ports/ai-policy.port';
import { AiManagerController } from './presentation/ai-manager.controller';
import { AiManagerService } from './application/ai-manager.service';
import { AiManagerRepository } from './infrastructure/ai-manager.repository';

@Module({
  imports: [AuthModule],
  controllers: [AiManagerController],
  providers: [AiManagerService, AiManagerRepository, AiPolicyPort],
  exports: [AiManagerService, AiManagerRepository, AiPolicyPort],
})
export class AiManagerModule {}
