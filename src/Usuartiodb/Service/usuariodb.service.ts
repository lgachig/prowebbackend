import { Injectable } from '@nestjs/common';
import { JsonFileService } from '../../common/services/json-file.service';

export interface RelationalDb {
  users: any[];
  roles: any[];
  pricing_rules: any[];
  vehicles: any[];
  qr_codes: any[];
}

@Injectable()
export class usersdbService {
  private readonly jsonService: JsonFileService<RelationalDb>;

  constructor() {
    this.jsonService = new JsonFileService<RelationalDb>('relational_db.json');
  }

  async read(): Promise<RelationalDb> {
    return this.jsonService.read();
  }
  async write(data: RelationalDb): Promise<void> {
    return this.jsonService.write(data);
  }

  async findAllUsers(): Promise<any[]> {
    const db = await this.read();
    return db.users || [];
  }

  async createUser(user: any): Promise<void> {
    const db = await this.read();
    db.users.push(user);
    await this.write(db);
  }

  async findUserByEmail(email: string): Promise<any | undefined> {
    const db = await this.read();
    return db.users.find(user => user.email === email);
  }

  async findRoleById(roleId: number): Promise<any | undefined> {
    const db = await this.read();
    return db.roles.find(role => role.id === roleId);
  }
  async findQRCodeByUserId(userId: string): Promise<any | undefined> {
    const db = await this.read();
    return db.qr_codes.find(qr => qr.user_id === userId);
  }
  async findVehiclesByUserId(userId: String): Promise<any[]> {
    const db = await this.read();
    return db.vehicles.filter(vehicle => vehicle.user_id === userId);
  }
  async updateUser(userId: string | number, updates: Partial<any>): Promise<void> {
    const db = await this.read();
    const userIndex = db.users.findIndex(user => user.id === userId);
    if (userIndex !== -1) {
      db.users[userIndex] = { ...db.users[userIndex], ...updates };
      await this.write(db);
    }
  }
  async findPriceRoleByRoleId(roleId: number): Promise<any | undefined> {
    const db = await this.read();
    return db.pricing_rules.find(pricing => pricing.role_id === roleId);
  }

  async findSessionsByUserId(userId: string): Promise<any[]> {
    const db = await this.read();
    return db.users.filter(session => session.user_id === userId);
  }

  async findUserById(userId: string): Promise<any | undefined> {
    const db = await this.read();
    return db.users.find(user => user.id === userId);
  }

}