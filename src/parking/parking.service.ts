import { Injectable, NotFoundException, BadRequestException, Optional, Inject, forwardRef } from '@nestjs/common';
import { parkingdbService } from '../parkingdb/services/parking.service';
import { usersdbService } from '../Usuartiodb/Service/usuariodb.service';
import { ParkingGateway } from './parking.gateway';

export enum SlotStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  RESERVED = 'reserved',
  MAINTENANCE = 'maintenance',
}

export interface ReserveSlotDto {
  userId: string;
  zoneId: string;
  slotId?: string;
}

export interface ToggleSlotStatusDto {
  slotId: string;
  status: SlotStatus;
  sessionId?: string;
}
export interface StartParkingSessionDto {
  user_id: string;
  qr_code_id?: string;
  zoneId?: string;
  slotId?: string;
  entry_method?: 'qr' | 'manual' | 'app';
}

export interface EndParkingSessionDto {
  session_id: string;
  exit_method?: 'qr' | 'manual' | 'app' | 'automatic';
}


@Injectable()
export class ParkingService {
  constructor(
    private readonly redisMock: parkingdbService,
    private readonly postgresMock: usersdbService,
    @Optional() @Inject(forwardRef(() => ParkingGateway)) private readonly gateway?: ParkingGateway,
  ) {}

  async getAllSlots(zoneId?: string) {
    if (zoneId) {
      return this.redisMock.findSlotsByZone(zoneId);
    }
    return this.redisMock.findAllSlots();
  }


  async getSlotById(id: string) {
    const slot = await this.redisMock.findSlotById(id);
    if (!slot) {
      throw new NotFoundException(`Slot with id ${id} not found`);
    }
    return slot;
  }

  async getAllZones() {
    return this.redisMock.findAllZones();
  }

  async getZoneById(id: string) {
    const zone = await this.redisMock.findZoneById(id);
    if (!zone) {
      throw new NotFoundException(`Zone with id ${id} not found`);
    }
    return zone;
  }

  async reserveSlot(dto: ReserveSlotDto) {

    // 1️⃣ Buscar sesión activa
    const activeSession = await this.redisMock.findActiveSessionByUserId(dto.userId);
  
    if (!activeSession) {
      throw new BadRequestException('No active parking session found for user');
    }
  
    // 2️⃣ Si ya tiene slot, validar su estado
    if (activeSession.slot_id) {
      const currentSlot = await this.redisMock.findSlotById(activeSession.slot_id);
  
      if (currentSlot?.status === 'occupied') {
        throw new BadRequestException(
          'Cannot change parking slot once the vehicle is already parked'
        );
      }
    }
  
    // 3️⃣ Buscar nuevo slot
    let slot;
    let slotId: string;
  
    if (dto.slotId) {
      slot = await this.redisMock.findSlotById(dto.slotId);
  
      if (!slot) {
        throw new NotFoundException(`Slot ${dto.slotId} not found`);
      }
  
      if (slot.status !== 'available') {
        throw new BadRequestException(`Slot ${dto.slotId} is not available`);
      }
  
      if (slot.zone_id !== dto.zoneId) {
        throw new BadRequestException(
          `Slot ${dto.slotId} does not belong to zone ${dto.zoneId}`
        );
      }
  
      slotId = dto.slotId;
    } else {
      const availableSlots = await this.redisMock.findAvailableSlots(dto.zoneId);
  
      if (!availableSlots.length) {
        throw new BadRequestException(`No available slots in zone ${dto.zoneId}`);
      }
  
      slot = availableSlots[0];
      slotId = slot.id;
    }
  
    // 4️⃣ Liberar slot anterior (si existía)
    if (activeSession.slot_id) {
      await this.redisMock.updateSlotStatus(
        activeSession.slot_id,
        'available',
        null
      );
    }
  
    // 5️⃣ Reservar nuevo slot
    await this.redisMock.updateSlotStatus(
      slotId,
      'reserved',
      activeSession.id
    );
  
    // 6️⃣ Actualizar sesión
    activeSession.slot_id = slotId;
    activeSession.zone_id = dto.zoneId;
    activeSession.updated_at = new Date().toISOString();
  
    await this.redisMock.updateSession(activeSession.id, activeSession);

    // Emit WebSocket event
    if (this.gateway) {
      await this.gateway.emitSessionUpdate(activeSession);
      const zoneStats = await this.redisMock.getZoneStatistics(dto.zoneId);
      await this.gateway.emitZoneCapacityAlert(dto.zoneId, zoneStats.occupancy_percentage);
    }
  
    return {
      success: true,
      slotId,
      sessionId: activeSession.id,
      message: `Slot ${slot.slot_number} reserved successfully`,
    };
  }

  async toggleSlotStatus(dto: ToggleSlotStatusDto) {
    const slot = await this.redisMock.findSlotById(dto.slotId);
    if (!slot) {
      throw new NotFoundException(`Slot with id ${dto.slotId} not found`);
    }

    // If setting to occupied, verify session exists
    if (dto.status === 'occupied' && dto.sessionId) {
      const session = await this.redisMock.findSessionById(dto.sessionId);
      if (!session) {
        throw new NotFoundException(`Session with id ${dto.sessionId} not found`);
      }
      // Update session with slot info if not already set
      if (!session.slot_id || session.slot_id !== dto.slotId) {
        await this.redisMock.updateSession(dto.sessionId, {
          slot_id: dto.slotId,
          zone_id: slot.zone_id,
          updated_at: new Date().toISOString(),
        });
      }
    }

    const updatedSlot = await this.redisMock.updateSlotStatus(dto.slotId, dto.status, dto.sessionId);

    // Emit WebSocket event for slot update
    if (this.gateway) {
      await this.gateway.emitSlotUpdate(updatedSlot.zone_id, updatedSlot);
      
      // Check zone capacity and emit alert if needed
      const zoneStats = await this.redisMock.getZoneStatistics(updatedSlot.zone_id);
      await this.gateway.emitZoneCapacityAlert(updatedSlot.zone_id, zoneStats.occupancy_percentage);
    }

    return updatedSlot;
  }

  async startParkingSession(dto: StartParkingSessionDto) {
    let activeSession = await this.redisMock.findActiveSessionByUserId(dto.user_id);
    
    // If session exists and slot is being set, update it
    if (activeSession && (dto.slotId || dto.zoneId)) {
      const updates: any = {
        updated_at: new Date().toISOString(),
      };
      
      if (dto.slotId) {
        updates.slot_id = dto.slotId;
        // Get zone from slot if not provided
        if (!dto.zoneId) {
          const slot = await this.redisMock.findSlotById(dto.slotId);
          if (slot) {
            updates.zone_id = slot.zone_id;
          }
        }
      }
      
      if (dto.zoneId) {
        updates.zone_id = dto.zoneId;
      }
      
      activeSession = await this.redisMock.updateSession(activeSession.id, updates);
      
      // Emit WebSocket event
      if (this.gateway) {
        await this.gateway.emitSessionUpdate(activeSession);
      }
      
      return activeSession;
    }
    
    // If session exists but no slot update, return it
    if (activeSession) {
      return activeSession;
    }
  
    // Create new session
    const qrCode = await this.postgresMock.findQRCodeByUserId(dto.user_id);
    const vehicles = await this.postgresMock.findVehiclesByUserId(dto.user_id);
    const user = await this.postgresMock.findUserByEmail(dto.user_id);
    
    // Get base rate from pricing rules
    let baseRate = 0.25; // default
    if (user?.role_id) {
      const pricingRule = await this.postgresMock.findPriceRoleByRoleId(user.role_id);
      if (pricingRule) {
        baseRate = pricingRule.rate_per_hour || 0.25;
      }
    }
  
    const session = {
      id: crypto.randomUUID(),
      user_id: dto.user_id,
      vehicle_id: vehicles[0]?.id || null,
      zone_id: dto.zoneId || null,
      slot_id: dto.slotId || null,
      qr_code_id: qrCode?.id || qrCode || null,
      entry_time: new Date().toISOString(),
      exit_time: null,
      entry_method: dto.entry_method || 'qr',
      exit_method: null,
      duration_minutes: null,
      base_rate: baseRate,
      total_cost: null,
      payment_status: 'pending',
      transaction_id: null,
      status: 'active',
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  
    const newSession = await this.redisMock.createSession(session);
    
    // Emit WebSocket event
    if (this.gateway) {
      await this.gateway.emitSessionUpdate(newSession);
    }
    
    return newSession;
  }

  async endParkingSession(dto: EndParkingSessionDto) {
    const session = await this.redisMock.findSessionById(dto.session_id);
    if (!session) {
      throw new NotFoundException(`Session with id ${dto.session_id} not found`);
    }
    if (session.status !== 'active') {
      throw new BadRequestException(`Session ${dto.session_id} is not active`);
    }

    const exitTime = new Date();
    const entryTime = new Date(session.entry_time);
    const durationMs = exitTime.getTime() - entryTime.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);

    // Calculate total cost based on pricing rules
    const user = await this.postgresMock.findUserById(session.user_id);
    let baseRate = session.base_rate || 0.25; // Use session base_rate if available
    if (!baseRate && user?.role_id) {
      const pricingRule = await this.postgresMock.findPriceRoleByRoleId(user.role_id);
      if (pricingRule) {
        baseRate = pricingRule.rate_per_hour || 0.25;
      }
    }
    const totalCost = (durationMinutes / 60) * baseRate;

    // Free slot if it was occupied or reserved
    if (session.slot_id) {
      const slot = await this.redisMock.findSlotById(session.slot_id);
      if (slot && (slot.status === 'occupied' || slot.status === 'reserved')) {
        await this.redisMock.updateSlotStatus(session.slot_id, 'available', null);
        
        // Emit WebSocket event for slot update
        if (this.gateway) {
          await this.gateway.emitSlotUpdate(slot.zone_id, {
            ...slot,
            status: 'available',
            current_session_id: null,
          });
        }
      }
    }

    // Mark session as completed (not deleted) for history/statistics
    const updatedSession = await this.redisMock.updateSession(dto.session_id, {
      exit_time: exitTime.toISOString(),
      exit_method: dto.exit_method || 'qr',
      duration_minutes: durationMinutes,
      total_cost: totalCost,
      payment_status: 'completed',
      status: 'completed',
      updated_at: exitTime.toISOString(),
    });

    // Emit WebSocket event for session update
    if (this.gateway) {
      await this.gateway.emitSessionUpdate(updatedSession);
    }

    return {
      session: updatedSession,
      duration_minutes: durationMinutes,
      total_cost: totalCost,
    };
  }

  async getActiveSession(userId: string) {
    return this.redisMock.findActiveSessionByUserId(userId);
  }

  private async getUserIdFromSession(sessionId: string): Promise<string | null> {
    const session = await this.redisMock.findSessionById(sessionId);
    return session?.user_id || null;
  }

  async getSlotStatistics(zoneId?: string) {
    const allSlots = zoneId ? await this.redisMock.findSlotsByZone(zoneId) : await this.redisMock.findAllSlots();
    const statistics = {
      total: allSlots.length,
      available: allSlots.filter(slot => slot.status === SlotStatus.AVAILABLE).length,
      occupied: allSlots.filter(slot => slot.status === SlotStatus.OCCUPIED).length,
      reserved: allSlots.filter(slot => slot.status === SlotStatus.RESERVED).length,
      maintenance: allSlots.filter(slot => slot.status === SlotStatus.MAINTENANCE).length,
    };
  
    return statistics;
  }

  async getSessionHistory(filters: {
    zoneId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }) {
    const allSessions = await this.redisMock.findAllSessions();
    let filtered = allSessions;

    if (filters.zoneId) {
      filtered = filtered.filter(s => s.zone_id === filters.zoneId);
    }
    if (filters.userId) {
      filtered = filtered.filter(s => s.user_id === filters.userId);
    }
    if (filters.status) {
      filtered = filtered.filter(s => s.status === filters.status);
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      filtered = filtered.filter(s => new Date(s.entry_time) >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      filtered = filtered.filter(s => new Date(s.entry_time) <= end);
    }

    return filtered.sort((a, b) => 
      new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime()
    );
  }

  async getStatisticsByTimeRange(filters: {
    zoneId?: string;
    dayOfWeek?: string;
    hour?: number;
    filterType: 'day' | 'hour';
  }) {
    const allSessions = await this.redisMock.findAllSessions();
    const allSlots = filters.zoneId 
      ? await this.redisMock.findSlotsByZone(filters.zoneId)
      : await this.redisMock.findAllSlots();
    
    const totalSlots = allSlots.length || 1; // Avoid division by zero
    const completedSessions = allSessions.filter(s => s.status === 'completed' || s.status === 'active');
    
    let filtered = completedSessions;
    if (filters.zoneId) {
      filtered = filtered.filter(s => s.zone_id === filters.zoneId);
    }

    const now = new Date();
    const data: { label: string; value: number; timestamp: string }[] = [];

    if (filters.filterType === 'hour') {
      // Get data for hours around the selected hour (7 hours total)
      const selectedHour = filters.hour !== undefined ? filters.hour : 10;
      const dayOfWeekMap: { [key: string]: number } = {
        'Monday': 1,
        'Tuesday': 2,
        'Wednesday': 3,
        'Thursday': 4,
        'Friday': 5,
        'Saturday': 6,
        'Sunday': 0
      };
      
      // If dayOfWeek is provided, filter sessions to that specific day
      let dayFiltered = filtered;
      if (filters.dayOfWeek && dayOfWeekMap[filters.dayOfWeek] !== undefined) {
        const targetDayOfWeek = dayOfWeekMap[filters.dayOfWeek];
        dayFiltered = filtered.filter(s => {
          const entryTime = new Date(s.entry_time);
          return entryTime.getDay() === targetDayOfWeek;
        });
      }
      
      for (let i = -3; i <= 3; i++) {
        const hour = (selectedHour + i + 24) % 24;
        const date = new Date(now);
        
        // If dayOfWeek is provided, set the date to that day of the current week
        if (filters.dayOfWeek && dayOfWeekMap[filters.dayOfWeek] !== undefined) {
          const targetDayOfWeek = dayOfWeekMap[filters.dayOfWeek];
          const currentDay = date.getDay();
          let dayDiff = targetDayOfWeek - currentDay;
          if (dayDiff < 0) dayDiff += 7; // If target day has passed this week, use next week
          date.setDate(date.getDate() + dayDiff);
        }
        
        date.setHours(hour, 0, 0, 0);
        date.setMinutes(0, 0, 0);
        
        // Filter sessions that were active during this hour
        // Check if session entry_time and exit_time overlap with this hour
        const hourSessions = dayFiltered.filter(s => {
          const entryTime = new Date(s.entry_time);
          const exitTime = s.exit_time ? new Date(s.exit_time) : now;
          
          // Create hour start and end timestamps
          const hourStart = new Date(date);
          const hourEnd = new Date(date);
          hourEnd.setHours(hour + 1, 0, 0, 0);
          
          // Check if session overlaps with this hour
          return (entryTime < hourEnd && exitTime > hourStart);
        });

        // Calculate occupancy percentage from real sessions only
        const realOccupancy = hourSessions.length;
        const occupancyPercentage = totalSlots > 0 
          ? Math.round((realOccupancy / totalSlots) * 100) 
          : 0;
        
        const suffix = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        data.push({
          label: `${displayHour}${suffix}`,
          value: Math.min(100, Math.max(0, occupancyPercentage)),
          timestamp: date.toISOString(),
        });
      }
    } else {
      // Get data for days of the week
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const selectedHour = filters.hour !== undefined ? filters.hour : 10;
      const dayOfWeekMap: { [key: string]: number } = {
        'Monday': 1,
        'Tuesday': 2,
        'Wednesday': 3,
        'Thursday': 4,
        'Friday': 5,
        'Saturday': 6,
        'Sunday': 0
      };
      
      days.forEach((day, dayIndex) => {
        const date = new Date(now);
        // Calculate date for this day of week (last week)
        const currentDay = date.getDay();
        const targetDay = dayOfWeekMap[day] !== undefined ? dayOfWeekMap[day] : dayIndex + 1;
        let dayDiff = targetDay - currentDay;
        if (dayDiff > 0) dayDiff -= 7; // Go to last week
        date.setDate(date.getDate() + dayDiff);
        date.setHours(selectedHour, 0, 0, 0);
        date.setMinutes(0, 0, 0);

        // Filter sessions that were active during this day and hour
        const daySessions = filtered.filter(s => {
          const entryTime = new Date(s.entry_time);
          const exitTime = s.exit_time ? new Date(s.exit_time) : now;
          
          // Create hour start and end timestamps for this day
          const hourStart = new Date(date);
          const hourEnd = new Date(date);
          hourEnd.setHours(selectedHour + 1, 0, 0, 0);
          
          // Check if session overlaps with this day and hour
          return (entryTime < hourEnd && exitTime > hourStart);
        });

        // Calculate occupancy percentage from real sessions only
        const realOccupancy = daySessions.length;
        const occupancyPercentage = totalSlots > 0 
          ? Math.round((realOccupancy / totalSlots) * 100) 
          : 0;

        data.push({
          label: day.substring(0, 3),
          value: Math.min(100, Math.max(0, occupancyPercentage)),
          timestamp: date.toISOString(),
        });
      });
    }

    return data;
  }



  
}
