import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { buildSocketCorsOptions, parseCorsOrigins } from '../config/cors';

const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
const socketCorsOptions = buildSocketCorsOptions(corsOrigins, process.env.NODE_ENV === 'production');

@WebSocketGateway({
  cors: socketCorsOptions,
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TrackingGateway.name);

  constructor(private prisma: PrismaService) { }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('locationUpdate')
  async handleLocationUpdate(client: Socket, payload: { userId: string; lat: number; lng: number; speed: number; timestamp: string }) {
    this.logger.verbose(`Received location from ${payload.userId}: ${payload.lat}, ${payload.lng}`);

    try {
      // 1. Update In-Memory / Redis (for real-time dashboard)
      // Broadcast to admins (specific vehicle)
      this.server.emit(`vehicle:${payload.userId}`, payload);
      // Broadcast to global channel for Dashboard
      this.server.emit('vehicle:update', payload);

      // 2. Persist to Database (PostGIS)
      // In a real high-throughput scenario, you might buffer this or use a queue.
      // For MVP, we update direct.

      // Note: We need a vehicle associated with this user (driver)
      // const vehicle = await this.prisma.vehicle.findFirst({ where: { driverId: payload.userId } });

      // if (vehicle) {
      //   await this.prisma.vehicle.update({
      //     where: { id: vehicle.id },
      //     data: {
      //       currentLat: payload.lat,
      //       currentLng: payload.lng,
      //     }
      //   });
      // }
    } catch (error) {
      this.logger.error('Failed to process location update', error);
    }
  }
}
