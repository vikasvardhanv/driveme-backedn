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
    this.broadcastVehicleUpdate(payload);
  }

  // Public method for AzugaService to call
  broadcastVehicleUpdate(payload: { userId: string; lat: number; lng: number; speed: number; timestamp: string }) {
    this.server.emit(`vehicle:${payload.userId}`, payload);
    this.server.emit('vehicle:update', payload);
  }
}
