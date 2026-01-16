import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { usersModule } from '../Usuartiodb/usersdb.module';

@Module({
  imports: [usersModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
