import { Injectable } from '@nestjs/common';
import { JsonFileService } from '../../common/services/json-file.service';

export interface RealtimeDb {
  parking_zones: any[];
  parking_slots: any[];
  parking_sessions: any[];
}

@Injectable()
export class parkingdbService {
  private readonly jsonService: JsonFileService<RealtimeDb>;

  constructor() {
    this.jsonService = new JsonFileService<RealtimeDb>('realtime_db.json');
  }

  async read(): Promise<RealtimeDb> {
    return this.jsonService.read();
  }

  async write(data: RealtimeDb): Promise<void> {
    return this.jsonService.write(data);
  }

  // Zones operations
  async findAllZones(): Promise<any[]> {
    const db = await this.read();
    return db.parking_zones || [];
  }

  async findZoneById(id: string): Promise<any | null> {
    const db = await this.read();
    return db.parking_zones?.find(z => z.id === id) || null;
  }

  async findZoneByCode(code: string): Promise<any | null> {
    const db = await this.read();
    return db.parking_zones?.find(z => z.code === code) || null;
  }

  // Slots operations (ultra-fast reads as per Redis simulation)
  async findAllSlots(): Promise<any[]> {
    const db = await this.read();
    return db.parking_slots || [];
  }

  async findSlotsByZone(zoneId: string): Promise<any[]> {
    const db = await this.read();
    return db.parking_slots?.filter(s => s.zone_id === zoneId) || [];
  }

  async findSlotById(id: string): Promise<any | null> {
    const db = await this.read();
    return db.parking_slots?.find(s => s.id === id) || null;
  }

  async findSlotByNumber(zoneId: string, slotNumber: string): Promise<any | null> {
    const db = await this.read();
    return db.parking_slots?.find(s => s.zone_id === zoneId && s.slot_number === slotNumber) || null;
  }

  async findAvailableSlots(zoneId?: string): Promise<any[]> {
    const db = await this.read();
    let slots = db.parking_slots || [];
    if (zoneId) {
      slots = slots.filter(s => s.zone_id === zoneId);
    }
    return slots.filter(s => s.status === 'available' && s.is_active);
  }

  async updateSlotStatus(id: string, status: string, sessionId?: string | null): Promise<any> {
    const db = await this.read();
    const index = db.parking_slots?.findIndex(s => s.id === id);
    if (index === -1 || index === undefined) {
      throw new Error(`Slot with id ${id} not found`);
    }
    db.parking_slots[index] = {
      ...db.parking_slots[index],
      status,
      current_session_id: sessionId !== undefined ? sessionId : db.parking_slots[index].current_session_id,
      updated_at: new Date().toISOString()
    };
    await this.write(db);
    return db.parking_slots[index];
  }

  // Sessions operations
  async findAllSessions(): Promise<any[]> {
    const db = await this.read();
    return db.parking_sessions || [];
  }

  async findActiveSessions(): Promise<any[]> {
    const db = await this.read();
    return db.parking_sessions?.filter(s => s.status === 'active') || [];
  }

  async findSessionById(id: string): Promise<any | null> {
    const db = await this.read();
    return db.parking_sessions?.find(s => s.id === id) || null;
  }

  async findActiveSessionByUserId(userId: string): Promise<any | null> {
    const db = await this.read();
    return db.parking_sessions?.find(s => s.user_id === userId && s.status === 'active') || null;
  }

  async createSession(session: any): Promise<any> {
    const db = await this.read();
    if (!db.parking_sessions) db.parking_sessions = [];
    db.parking_sessions.push(session);
    await this.write(db);
    return session;
  }

  async updateSession(id: string, updates: Partial<any>): Promise<any> {
    const db = await this.read();
    const index = db.parking_sessions?.findIndex(s => s.id === id);
    if (index === -1 || index === undefined) {
      throw new Error(`Session with id ${id} not found`);
    }
    db.parking_sessions[index] = {
      ...db.parking_sessions[index],
      ...updates,
      updated_at: new Date().toISOString()
    };
    await this.write(db);
    return db.parking_sessions[index];
  }

  // Statistics helpers
  async getZoneStatistics(zoneId: string): Promise<{
    total_slots: number;
    available_slots: number;
    occupied_slots: number;
    reserved_slots: number;
    occupancy_percentage: number;
  }> {
    const slots = await this.findSlotsByZone(zoneId);
    const total = slots.length;
    const available = slots.filter(s => s.status === 'available').length;
    const occupied = slots.filter(s => s.status === 'occupied').length;
    const reserved = slots.filter(s => s.status === 'reserved').length;
    
    // Calcular porcentaje de ocupación (ocupados + reservados)
    const totalUsed = occupied + reserved;
    
    return {
      total_slots: total,
      available_slots: available,
      occupied_slots: occupied,
      reserved_slots: reserved,
      occupancy_percentage: total > 0 ? Math.round((totalUsed / total) * 100) : 0
    };
  }
}

