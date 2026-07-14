import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { VideosService } from '../videos/videos.service';

interface UserSocketData {
  userId: string;
  username: string;
  currentRoom?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/collaboration',
})
export class CollaborationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('CollaborationGateway');
  private userSockets: Map<string, UserSocketData> = new Map();

  constructor(
    private jwtService: JwtService,
    private videosService: VideosService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Collaboration Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Authenticate user from token
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userData: UserSocketData = {
        userId: payload.sub,
        username: payload.username || payload.email,
      };

      this.userSockets.set(client.id, userData);
      client.data = userData;

      // Personal room for server-initiated pushes (notifications) that
      // aren't tied to any particular video room.
      client.join(`user:${userData.userId}`);

      this.logger.log(`Client connected: ${client.id} (${userData.username})`);
    } catch (error) {
      this.logger.error('Authentication failed:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userData = this.userSockets.get(client.id);
    if (userData) {
      // Leave room if in one
      if (userData.currentRoom) {
        client.leave(userData.currentRoom);
        client.to(userData.currentRoom).emit('user:left', {
          userId: userData.userId,
          username: userData.username,
        });
      }

      this.userSockets.delete(client.id);
      this.logger.log(`Client disconnected: ${client.id} (${userData.username})`);
    }
  }

  @SubscribeMessage('join:video')
  async handleJoinVideo(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { videoId: string },
  ) {
    const userData = this.userSockets.get(client.id);
    if (!userData) return;

    try {
      await this.videosService.findOwned(data.videoId, userData.userId);
    } catch {
      client.emit('error', { message: 'Not authorized to join this video' });
      return;
    }

    const room = `video:${data.videoId}`;

    // Leave previous room if any
    if (userData.currentRoom) {
      client.leave(userData.currentRoom);
      client.to(userData.currentRoom).emit('user:left', {
        userId: userData.userId,
        username: userData.username,
      });
    }

    // Join new room
    client.join(room);
    userData.currentRoom = room;

    // Get all users in room
    const usersInRoom = Array.from(this.userSockets.values())
      .filter((u) => u.currentRoom === room)
      .map((u) => ({ userId: u.userId, username: u.username }));

    // Notify others
    client.to(room).emit('user:joined', {
      userId: userData.userId,
      username: userData.username,
    });

    // Send current users list to new user
    client.emit('room:users', usersInRoom);

    this.logger.log(`${userData.username} joined room ${room}`);
  }

  @SubscribeMessage('leave:video')
  handleLeaveVideo(@ConnectedSocket() client: Socket) {
    const userData = this.userSockets.get(client.id);
    if (!userData || !userData.currentRoom) return;

    client.leave(userData.currentRoom);
    client.to(userData.currentRoom).emit('user:left', {
      userId: userData.userId,
      username: userData.username,
    });

    userData.currentRoom = undefined;
  }

  /**
   * The `join:video` handler is the only place ownership is actually
   * checked. Every other per-message handler below must broadcast into the
   * room the socket already validated and joined — not into whatever room
   * name the client's payload happens to name — otherwise a connected
   * client could spoof `videoId` to broadcast into a video room it was
   * never authorized to join.
   */
  private roomFor(userData: UserSocketData, videoId: string): string | null {
    const room = `video:${videoId}`;
    return userData.currentRoom === room ? room : null;
  }

  @SubscribeMessage('comment:new')
  handleNewComment(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      videoId: string;
      content: string;
      timestamp: number;
      frameNumber: number;
    },
  ) {
    const userData = this.userSockets.get(client.id);
    if (!userData) return;
    const room = this.roomFor(userData, data.videoId);
    if (!room) return;

    // Broadcast to others only (not sender)
    client.to(room).emit('comment:new', {
      userId: userData.userId,
      username: userData.username,
      content: data.content,
      timestamp: data.timestamp,
      frameNumber: data.frameNumber,
      createdAt: new Date(),
    });
  }

  @SubscribeMessage('comment:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { videoId: string; isTyping: boolean },
  ) {
    const userData = this.userSockets.get(client.id);
    if (!userData) return;
    const room = this.roomFor(userData, data.videoId);
    if (!room) return;

    // Broadcast to others (not sender)
    client.to(room).emit('comment:typing', {
      userId: userData.userId,
      username: userData.username,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage('video:seek')
  handleVideoSeek(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { videoId: string; timestamp: number },
  ) {
    const userData = this.userSockets.get(client.id);
    if (!userData) return;
    const room = this.roomFor(userData, data.videoId);
    if (!room) return;

    // Broadcast to others
    client.to(room).emit('video:seek', {
      userId: userData.userId,
      username: userData.username,
      timestamp: data.timestamp,
    });
  }

  @SubscribeMessage('video:play')
  handleVideoPlay(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { videoId: string; timestamp: number },
  ) {
    const userData = this.userSockets.get(client.id);
    if (!userData) return;
    const room = this.roomFor(userData, data.videoId);
    if (!room) return;

    client.to(room).emit('video:play', {
      userId: userData.userId,
      username: userData.username,
      timestamp: data.timestamp,
    });
  }

  @SubscribeMessage('video:pause')
  handleVideoPause(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { videoId: string; timestamp: number },
  ) {
    const userData = this.userSockets.get(client.id);
    if (!userData) return;
    const room = this.roomFor(userData, data.videoId);
    if (!room) return;

    client.to(room).emit('video:pause', {
      userId: userData.userId,
      username: userData.username,
      timestamp: data.timestamp,
    });
  }

  @SubscribeMessage('comment:resolved')
  handleCommentResolved(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { videoId: string; commentId: string; resolved: boolean },
  ) {
    const userData = this.userSockets.get(client.id);
    if (!userData) return;
    const room = this.roomFor(userData, data.videoId);
    if (!room) return;

    client.to(room).emit('comment:resolved', {
      commentId: data.commentId,
      resolved: data.resolved,
      userId: userData.userId,
    });
  }

  @SubscribeMessage('comment:reaction')
  handleCommentReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { videoId: string; commentId: string },
  ) {
    const userData = this.userSockets.get(client.id);
    if (!userData) return;
    const room = this.roomFor(userData, data.videoId);
    if (!room) return;

    // Payload-light: clients just refetch that comment's reactions on receipt.
    client.to(room).emit('comment:reaction', {
      commentId: data.commentId,
      userId: userData.userId,
    });
  }

  /** Server-initiated push (e.g. from NotificationsService) to a specific user's personal room. */
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}