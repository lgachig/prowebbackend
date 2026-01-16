import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { usersdbService } from '../Usuartiodb/Service/usuariodb.service';

interface LoginDto {
  password: string;
  email: string;
}

interface RegisterDto {
  full_name: string;
  password: string;
  email: string;
  role_id: number;
  institutional_id: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly postgresMock: usersdbService) {}

  async login(dto: LoginDto) {
    const user = await this.postgresMock.findUserByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const storedPassword = user.password_hash;
    if (storedPassword !== dto.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const role = await this.postgresMock.findRoleById(user.role_id);
    const qrCode = await this.postgresMock.findQRCodeByUserId(user.id);
    const vehicles = await this.postgresMock.findVehiclesByUserId(user.id);
    const priceRole = await this.postgresMock.findPriceRoleByRoleId(user.role_id);

    await this.postgresMock.updateUser(user.id, {
      last_login_at: new Date().toISOString(),
    });

    return {
      user: {
        ...user,
        role,
        qr_code: qrCode,
        vehicles,
        price_role: priceRole,
      },
      token: `mock-token-${user.id}`,
    };
  }

  async register(dto: RegisterDto) {

    const existingUser = await this.postgresMock.findUserByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const users = await this.postgresMock.findAllUsers();
    const existingInstitutionalId = users.find(u => u.institutional_id === dto.institutional_id);
    if (existingInstitutionalId) {
      throw new BadRequestException('Institutional ID already registered');
    }


    const userId = 'uuidv4()';
    const qrCodeId = 'uuidv4()';


    const db = await this.postgresMock.read();
    if (!db.qr_codes) db.qr_codes = [];
    db.qr_codes.push({
      id: qrCodeId,
      user_id: userId,
      qr_value: `QR-${dto.institutional_id}-${userId.substring(0, 8)}`,
      qr_image_url: `/qr-codes/qr-${userId.substring(0, 8)}.png`,
      qr_data: {
        user_id: userId,
        institutional_id: dto.institutional_id,
      },
      is_active: true,
      expires_at: null,
      last_used_at: null,
      usage_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await this.postgresMock.write(db);

   
    const newUser = {
      id: userId,
      institutional_id: dto.institutional_id,
      email: dto.email,
      password_hash: `${dto.password}`, // In production, hash with bcrypt
      full_name: dto.full_name,
      phone: null,
      profile_image_url: null,
      role_id: dto.role_id,
      qr_code_id: qrCodeId,
      is_active: true,
      is_verified: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login_at: null,
    };

    await this.postgresMock.createUser(newUser);

    const role = await this.postgresMock.findRoleById(dto.role_id);
    const qrCode = await this.postgresMock.findQRCodeByUserId(userId);
    const vehicles = await this.postgresMock.findVehiclesByUserId(userId);

    return {
      user: {
        ...newUser,
        role,
        qr_code: qrCode,
        vehicles,
      },
      token: `mock-token-${userId}`,
    };
  }

  async getAllUsers() {
    return this.postgresMock.findAllUsers();
  }

  async getUser(userId: string) {
    const user = await this.postgresMock.findUserById(userId);
    if (!user) {
      throw new BadRequestException(`User with id ${userId} not found`);
    }
    const role = await this.postgresMock.findRoleById(user.role_id);
    const qrCode = await this.postgresMock.findQRCodeByUserId(user.id);
    const vehicles = await this.postgresMock.findVehiclesByUserId(user.id);
    
    return {
      ...user,
      role,
      qr_code: qrCode,
      vehicles,
    };
  }

  async updateUser(userId: string, updates: any) {
    const user = await this.postgresMock.findUserById(userId);
    if (!user) {
      throw new BadRequestException(`User with id ${userId} not found`);
    }

    // Update user
    const userUpdates: any = {};
    if (updates.full_name) userUpdates.full_name = updates.full_name;
    if (updates.email) userUpdates.email = updates.email;
    if (updates.phone) userUpdates.phone = updates.phone;
    userUpdates.updated_at = new Date().toISOString();

    await this.postgresMock.updateUser(userId, userUpdates);

      // Update vehicle if provided
      if (updates.vehicle) {
        const vehicles = await this.postgresMock.findVehiclesByUserId(userId);
        const db = await this.postgresMock.read();
        
        if (vehicles.length > 0) {
          // Update existing vehicle
          const vehicleIndex = db.vehicles.findIndex(v => v.id === vehicles[0].id);
          if (vehicleIndex !== -1) {
            db.vehicles[vehicleIndex] = {
              ...db.vehicles[vehicleIndex],
              ...updates.vehicle,
              updated_at: new Date().toISOString(),
            };
            await this.postgresMock.write(db);
          }
        } else {
          // Create new vehicle if user doesn't have one
          const newVehicle = {
            id: `v${Date.now()}`,
            user_id: userId,
            license_plate: updates.vehicle.license_plate || '',
            make: updates.vehicle.make || '',
            model: updates.vehicle.model || '',
            color: updates.vehicle.color || '',
            year: new Date().getFullYear(),
            is_primary: true,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          
          if (!db.vehicles) db.vehicles = [];
          db.vehicles.push(newVehicle);
          await this.postgresMock.write(db);
        }
      }

    return this.getUser(userId);
  }
}
