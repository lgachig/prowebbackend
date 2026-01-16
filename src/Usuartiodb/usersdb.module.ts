import { Module } from '@nestjs/common';
import { usersdbService } from './Service/usuariodb.service';

@Module({
  providers: [usersdbService],
  exports: [usersdbService],
})
export class usersModule {}

