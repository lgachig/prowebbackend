import { Controller, Post, Body, UseInterceptors, Get, Put, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';

// Definimos las interfaces aquí y las exportamos para que el servicio use las mismas
export interface LoginDto {
  password: string;
  email: string;
}

export interface RegisterDto {
  full_name: string;
  password: string;
  email: string;
  institutional_id: string;
  role_id: number;
}

@Controller('auth')
@UseInterceptors(AuditInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login') 
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
  
  @Get('all')
  async getAllUsers() {
    return this.authService.getAllUsers();
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.authService.getUser(id);
  }

  @Put('users/:id')
  async updateUser(@Param('id') id: string, @Body() updates: any) {
    return this.authService.updateUser(id, updates);
  }
}