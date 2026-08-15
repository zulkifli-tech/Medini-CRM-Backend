import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { AppointmentsController } from './presentation/appointments.controller';
import { AppointmentsService } from './application/appointments.service';
import { AppointmentsRepository } from './infrastructure/appointments.repository';
import { PatientsReadPort } from '../../shared/ports/patients.read-port';

@Module({
  imports: [AuthModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsRepository, PatientsReadPort],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
