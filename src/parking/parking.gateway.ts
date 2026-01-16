import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    credentials: true,
  },
})
export class ParkingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor() {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    client.join('parking-updates');
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe-zone')
  handleSubscribeZone(client: Socket, zoneId: string) {
    client.join(`zone-${zoneId}`);
    console.log(`Client ${client.id} subscribed to zone ${zoneId}`);
  }

  @SubscribeMessage('unsubscribe-zone')
  handleUnsubscribeZone(client: Socket, zoneId: string) {
    client.leave(`zone-${zoneId}`);
    console.log(`Client ${client.id} unsubscribed from zone ${zoneId}`);
  }

  // Method to emit zone capacity alerts
  async emitZoneCapacityAlert(zoneId: string, occupancyPercentage: number) {
    const threshold = 80; // Alert when 80% full
    if (occupancyPercentage >= threshold) {
      this.server.to(`zone-${zoneId}`).emit('zone-capacity-alert', {
        zoneId,
        occupancyPercentage,
        message: `Zone ${zoneId} is ${occupancyPercentage}% full. Consider alternative zones.`,
        severity: occupancyPercentage >= 90 ? 'high' : 'medium',
        timestamp: new Date().toISOString(),
      });
      
      // Also broadcast to all users
      this.server.to('parking-updates').emit('capacity-alert', {
        zoneId,
        occupancyPercentage,
        message: `Zone ${zoneId} is ${occupancyPercentage}% full.`,
        severity: occupancyPercentage >= 90 ? 'high' : 'medium',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Method to emit slot status updates
  async emitSlotUpdate(zoneId: string, slot: any) {
    this.server.to(`zone-${zoneId}`).emit('slot-update', {
      zoneId,
      slot,
      timestamp: new Date().toISOString(),
    });
  }

  // Method to emit session updates
  async emitSessionUpdate(session: any) {
    if (session.zone_id) {
      this.server.to(`zone-${session.zone_id}`).emit('session-update', {
        session,
        timestamp: new Date().toISOString(),
      });
    }
  }
}






