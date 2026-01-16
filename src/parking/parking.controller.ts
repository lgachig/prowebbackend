import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ParkingService } from './parking.service';

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
  qr_code_id: string;
  zoneId?: string;
  slotId?: string;
  entry_method?: 'qr' | 'manual' | 'app';
}

export interface EndParkingSessionDto {
  session_id: string;
  exit_method?: 'qr' | 'manual' | 'app' | 'automatic';
}

@Controller('parking')
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  @Get('zones')
  async getAllZones() {
    return this.parkingService.getAllZones();
  }

  @Get('sessions/active/:userId')
  async getActiveSession(@Param('userId') userId: string) {
    return this.parkingService.getActiveSession(userId);
  }

  @Get('static')
  async getStaticData(@Query('zoneId') zoneId?: string) {
    const stats = await this.parkingService.getSlotStatistics(zoneId);
    
    // Calculate occupancy percentage
    const totalUsed = (stats.occupied || 0) + (stats.reserved || 0);
    const occupancyPercentage = stats.total > 0 
      ? Math.round((totalUsed / stats.total) * 100) 
      : 0;
    
    return {
      ...stats,
      occupancy_percentage: occupancyPercentage,
    };
  }

  @Get('slots')
  async getAllSlots(@Query('zoneId') zoneId?: string) {
    return this.parkingService.getAllSlots(zoneId);
  }

  @Post('reserve')
  async reserveSlot(@Body() dto: ReserveSlotDto) {
    return this.parkingService.reserveSlot(dto);
  }




  @Get('zones/:id')
  async getZoneById(@Param('id') id: string) {
    return this.parkingService.getZoneById(id);
  }



  @Get('slots/:id')
  async getSlotById(@Param('id') id: string) {
    return this.parkingService.getSlotById(id);
  }



  @Post('toggle-status')
  async toggleSlotStatus(@Body() dto: ToggleSlotStatusDto) {
    return this.parkingService.toggleSlotStatus(dto);
  }

  @Post('sessions/start')
  async startSession(@Body() dto: StartParkingSessionDto) {
    return this.parkingService.startParkingSession(dto);
  }

  @Post('sessions/end')
  async endSession(@Body() dto: EndParkingSessionDto) {
    return this.parkingService.endParkingSession(dto);
  }

  @Get('sessions/history')
  async getSessionHistory(
    @Query('zoneId') zoneId?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
  ) {
    return this.parkingService.getSessionHistory({
      zoneId,
      userId,
      startDate,
      endDate,
      status,
    });
  }

  @Get('statistics/traffic-flow')
  async getTrafficFlow(
    @Query('zoneId') zoneId?: string,
    @Query('dayOfWeek') dayOfWeek?: string,
    @Query('hour') hour?: string,
    @Query('filterType') filterType: 'day' | 'hour' = 'hour',
  ) {
    return this.parkingService.getStatisticsByTimeRange({
      zoneId,
      dayOfWeek,
      hour: hour ? parseInt(hour) : undefined,
      filterType,
    });
  }

  @Get('statistics/recent-activity')
  async getRecentActivity(
    @Query('limit') limit?: string,
    @Query('zoneId') zoneId?: string,
  ) {
    const sessions = await this.parkingService.getSessionHistory({
      zoneId,
      status: undefined, // Get both active and completed
    });
    const limitNum = limit ? parseInt(limit) : 10;
    return sessions.slice(0, limitNum);
  }

}
