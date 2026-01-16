import { Module, forwardRef } from '@nestjs/common';
import { ParkingService } from './parking.service';
import { ParkingController } from './parking.controller';
import { ParkingGateway } from './parking.gateway';
import { usersModule } from '../Usuartiodb/usersdb.module';
import { parkingdbModule } from '../parkingdb/parking.module';

@Module({
  imports: [usersModule, parkingdbModule],
  controllers: [ParkingController],
  providers: [
    ParkingService,
    ParkingGateway,
  ],
  exports: [ParkingService, ParkingGateway],
})
export class ParkingModule {}
