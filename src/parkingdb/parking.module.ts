import { Module } from '@nestjs/common';
import { parkingdbService } from './services/parking.service';

@Module({
  providers: [parkingdbService],
  exports: [parkingdbService],
})
export class parkingdbModule {}

