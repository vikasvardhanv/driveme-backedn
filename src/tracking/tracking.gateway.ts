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

// Map to track driver connections
const driverConnections = new Map<string, string>(); // driverId -> socketId

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
    // Remove driver from connections map
    for (const [driverId, socketId] of driverConnections.entries()) {
      if (socketId === client.id) {
        driverConnections.delete(driverId);
        this.logger.debug(`Driver ${driverId} disconnected`);
        break;
      }
    }
  }

  @SubscribeMessage('driverConnect')
  handleDriverConnect(client: Socket, payload: { driverId: string }) {
    this.logger.log(`Driver ${payload.driverId} connected with socket ${client.id}`);
    driverConnections.set(payload.driverId, client.id);
    // Join driver-specific room for targeted messages
    client.join(`driver:${payload.driverId}`);
    // Acknowledge connection
    client.emit('connected', { status: 'ok', driverId: payload.driverId });
  }

  @SubscribeMessage('locationUpdate')
  async handleLocationUpdate(client: Socket, payload: { userId: string; lat: number; lng: number; speed: number; timestamp: string; tripId?: string }) {
    this.logger.debug(`Received locationUpdate from ${client.id}: ${JSON.stringify(payload)}`);
    this.broadcastVehicleUpdate(payload);

    // If tripId is provided, update trip with current location
    if (payload.tripId) {
      try {
        await this.prisma.trip.update({
          where: { id: payload.tripId },
          data: { updatedAt: new Date() },
        });
      } catch (error) {
        this.logger.debug(`Could not update trip ${payload.tripId}`);
      }
    }
  }

  @SubscribeMessage('tripStatusUpdate')
  async handleTripStatusUpdate(client: Socket, payload: {
    tripId: string;
    status: string;
    driverId: string;
    pickupOdometer?: number;
    dropoffOdometer?: number;
    actualPickupTime?: string;
    actualDropoffTime?: string;
    driverSignatureUrl?: string;
    memberSignatureUrl?: string;
  }) {
    this.logger.log(`Trip ${payload.tripId} status update: ${payload.status}`);

    try {
      // Update trip in database
      const updateData: any = { status: payload.status };
      if (payload.pickupOdometer) updateData.pickupOdometer = payload.pickupOdometer;
      if (payload.dropoffOdometer) updateData.dropoffOdometer = payload.dropoffOdometer;
      if (payload.actualPickupTime) updateData.actualPickupTime = new Date(payload.actualPickupTime);
      if (payload.actualDropoffTime) updateData.actualDropoffTime = new Date(payload.actualDropoffTime);
      if (payload.driverSignatureUrl) updateData.driverSignatureUrl = payload.driverSignatureUrl;
      if (payload.memberSignatureUrl) updateData.memberSignatureUrl = payload.memberSignatureUrl;

      // Calculate trip miles if both odometer readings present
      if (payload.dropoffOdometer && payload.pickupOdometer) {
        updateData.tripMiles = payload.dropoffOdometer - payload.pickupOdometer;
      }

      const trip = await this.prisma.trip.update({
        where: { id: payload.tripId },
        data: updateData,
        include: { driver: true, member: true, vehicle: true, company: true },
      });

      // Broadcast to dispatchers/admins
      this.server.emit('trip:statusChanged', {
        tripId: trip.id,
        status: trip.status,
        driverId: trip.driverId,
        updatedAt: trip.updatedAt,
      });

      // Acknowledge to driver
      client.emit('tripUpdateAck', { tripId: payload.tripId, status: 'success' });

    } catch (error) {
      this.logger.error(`Failed to update trip ${payload.tripId}`, error);
      client.emit('tripUpdateAck', { tripId: payload.tripId, status: 'error', message: error.message });
    }
  }

  // Public method for AzugaService to call
  broadcastVehicleUpdate(payload: { userId: string; lat: number; lng: number; speed: number; timestamp: string }) {
    this.logger.debug(`Broadcasting vehicle:update for ${payload.userId}`);
    this.server.emit(`vehicle:${payload.userId}`, payload);
    this.server.emit('vehicle:update', payload);
  }

  // Broadcast new trip assignment to specific driver
  broadcastTripAssignment(driverId: string, trip: any) {
    this.logger.log(`Broadcasting trip assignment to driver ${driverId}`);
    this.server.to(`driver:${driverId}`).emit('trip:assigned', trip);
    // Also broadcast to all dispatchers
    this.server.emit('trip:updated', trip);
  }

  // Broadcast trip update to all connected clients
  broadcastTripUpdate(trip: any) {
    this.logger.log(`Broadcasting trip update: ${trip.id}`);
    this.server.emit('trip:updated', trip);
    // Also send to specific driver if assigned
    if (trip.driverId) {
      this.server.to(`driver:${trip.driverId}`).emit('trip:updated', trip);
    }
  }

  // Broadcast trip cancellation
  broadcastTripCancellation(tripId: string, driverId?: string) {
    this.logger.log(`Broadcasting trip cancellation: ${tripId}`);
    this.server.emit('trip:cancelled', { tripId });
    if (driverId) {
      this.server.to(`driver:${driverId}`).emit('trip:cancelled', { tripId });
    }
  }
}
