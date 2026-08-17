import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { PatientsReadPort } from '../../shared/ports/patients.read-port';
import { WhatsappController } from './presentation/whatsapp.controller';
import { WhatsappService } from './application/whatsapp.service';
import { WhatsappRepository } from './infrastructure/whatsapp.repository';

@Module({
  imports: [AuthModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappRepository, PatientsReadPort],
  exports: [WhatsappService],
})
export class WhatsappModule {}
