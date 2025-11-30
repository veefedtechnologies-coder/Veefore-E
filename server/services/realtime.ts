import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
// Removed User and Workspace imports - using mongodb-storage directly

export interface SocketWithWorkspace extends Socket {
  workspaceId?: string;
  userId?: string;
  authenticated?: boolean;
}

export class RealtimeService {
  private static io: SocketServer;
  private static workspaceRooms: Map<string, Set<string>> = new Map(); // workspaceId -> socketIds
  private static userSockets: Map<string, string> = new Map(); // userId -> socketId

  /**
   * Initialize WebSocket server with workspace support
   */
  static initialize(server: HttpServer): void {
    console.log('🔌 Initializing WebSocket server for real-time metrics updates...');

    this.io = new SocketServer(server, {
      cors: {
        origin: [
          process.env.CLIENT_URL || "http://localhost:3000",
          "http://localhost:3000",
          "http://localhost:5173",
          "https://veefore-webhook.veefore.com"
        ],
        methods: ["GET", "POST"],
        credentials: true
      },
      path: '/ws/metrics',
      transports: ['websocket', 'polling'],
      allowUpgrades: true,
      allowEIO3: true,
      pingTimeout: 30000,
      pingInterval: 10000
    });

    // Authentication middleware
    this.io.use(async (socket: SocketWithWorkspace, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        
        // For development, allow connections without strict token validation
        if (!token) {
          console.warn('⚠️ WebSocket connection attempt without authentication token - allowing for development');
        }

        // For development/testing, accept any token (including Firebase tokens)
        // In production, you should verify Firebase tokens properly
        console.log('🔐 WebSocket authentication token received:', token ? 'present' : 'missing');
        
                  // For development, use default values without MongoDB dependency
          socket.userId = token || 'anonymous';
          socket.workspaceId = '684402c2fd2cd4eb6521b386'; // Use workspace ID that matches frontend
        console.log(`✅ WebSocket authenticated (development mode): user=${socket.userId}, workspace=${socket.workspaceId}`);
        
        socket.authenticated = true;
        next();
      } catch (error) {
        console.error('🚨 WebSocket authentication failed:', error);
                  // For development, allow connection even on error
          socket.userId = 'anonymous';
          socket.workspaceId = '684402c2fd2cd4eb6521b386';
        socket.authenticated = true;
        console.log(`✅ WebSocket authenticated (error fallback): user=${socket.userId}, workspace=${socket.workspaceId}`);
        next();
      }
    });

    // Connection handling
    this.io.on('connection', (socket: SocketWithWorkspace) => {
      this.handleConnection(socket);
    });

    console.log('✅ WebSocket server initialized for real-time metrics');
  }

  /**
   * Handle new WebSocket connection
   */
  private static handleConnection(socket: SocketWithWorkspace): void {
    const { userId, workspaceId } = socket;
    
    if (!userId || !workspaceId) {
      console.error('🚨 WebSocket connection missing user or workspace info');
      socket.disconnect();
      return;
    }

    console.log(`🔗 New WebSocket connection: user=${userId}, workspace=${workspaceId}, socket=${socket.id}`);

    // Join workspace room
    this.joinWorkspaceRoom(socket, workspaceId);

    // Track user socket
    this.userSockets.set(userId, socket.id);

    // Send initial connection confirmation
    socket.emit('connected', {
      message: 'Connected to real-time metrics',
      workspaceId,
      timestamp: new Date()
    });

    // Handle workspace room joining
    socket.on('join-workspace', (data: { workspaceId: string }) => {
      this.handleWorkspaceJoin(socket, data.workspaceId);
    });

    // Handle requesting current metrics
    socket.on('request-metrics', () => {
      this.handleMetricsRequest(socket);
    });

    // Handle metrics refresh request
    socket.on('refresh-metrics', (data: { accountIds?: string[] }) => {
      this.handleMetricsRefresh(socket, data.accountIds);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Handle error
    socket.on('error', (error) => {
      console.error(`🚨 WebSocket error for socket ${socket.id}:`, error);
    });
  }

  /**
   * Join workspace room
   */
  private static joinWorkspaceRoom(socket: SocketWithWorkspace, workspaceId: string): void {
    // Leave previous workspace room if any
    if (socket.workspaceId && socket.workspaceId !== workspaceId) {
      this.leaveWorkspaceRoom(socket, socket.workspaceId);
    }

    // Join new workspace room
    socket.join(`workspace:${workspaceId}`);
    socket.workspaceId = workspaceId;

    // Track in workspace rooms map
    if (!this.workspaceRooms.has(workspaceId)) {
      this.workspaceRooms.set(workspaceId, new Set());
    }
    this.workspaceRooms.get(workspaceId)!.add(socket.id);

    console.log(`👥 Socket ${socket.id} joined workspace room: ${workspaceId}`);
    
    // Notify others in the workspace
    socket.to(`workspace:${workspaceId}`).emit('user-joined', {
      userId: socket.userId,
      timestamp: new Date()
    });
  }

  /**
   * Leave workspace room
   */
  private static leaveWorkspaceRoom(socket: SocketWithWorkspace, workspaceId: string): void {
    socket.leave(`workspace:${workspaceId}`);

    // Remove from workspace rooms map
    const roomSockets = this.workspaceRooms.get(workspaceId);
    if (roomSockets) {
      roomSockets.delete(socket.id);
      if (roomSockets.size === 0) {
        this.workspaceRooms.delete(workspaceId);
      }
    }

    console.log(`👋 Socket ${socket.id} left workspace room: ${workspaceId}`);
    
    // Notify others in the workspace
    socket.to(`workspace:${workspaceId}`).emit('user-left', {
      userId: socket.userId,
      timestamp: new Date()
    });
  }

  /**
   * Handle workspace join request
   */
  private static async handleWorkspaceJoin(socket: SocketWithWorkspace, requestedWorkspaceId: string): Promise<void> {
    try {
      // For now, allow access to any workspace the user is in
      // TODO: Add proper workspace access validation
      if (!requestedWorkspaceId) {
        socket.emit('error', { message: 'Invalid workspace ID' });
        return;
      }

      this.joinWorkspaceRoom(socket, requestedWorkspaceId);
      
      socket.emit('workspace-joined', {
        workspaceId: requestedWorkspaceId,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('🚨 Error handling workspace join:', error);
      socket.emit('error', { message: 'Failed to join workspace' });
    }
  }

  /**
   * Handle metrics request
   */
  private static handleMetricsRequest(socket: SocketWithWorkspace): void {
    socket.emit('metrics-request-received', {
      message: 'Fetching latest metrics...',
      timestamp: new Date()
    });

    // In a real implementation, this would fetch and send current metrics
    // For now, we acknowledge the request
    console.log(`📊 Metrics request from socket ${socket.id} for workspace ${socket.workspaceId}`);
  }

  /**
   * Handle metrics refresh request
   */
  private static handleMetricsRefresh(socket: SocketWithWorkspace, accountIds?: string[]): void {
    console.log(`🔄 Metrics refresh request from socket ${socket.id}`, { accountIds });

    socket.emit('refresh-started', {
      message: 'Metrics refresh initiated',
      accountIds,
      estimatedTime: '30-60 seconds',
      timestamp: new Date()
    });

    // Notify others in the workspace about the refresh
    socket.to(`workspace:${socket.workspaceId}`).emit('refresh-initiated', {
      initiatedBy: socket.userId,
      accountIds,
      timestamp: new Date()
    });
  }

  /**
   * Handle disconnection
   */
  private static handleDisconnection(socket: SocketWithWorkspace): void {
    console.log(`🔌 WebSocket disconnected: socket=${socket.id}, user=${socket.userId}`);

    // Remove from workspace room
    if (socket.workspaceId) {
      this.leaveWorkspaceRoom(socket, socket.workspaceId);
    }

    // Remove from user sockets map
    if (socket.userId) {
      this.userSockets.delete(socket.userId);
    }
  }

  /**
   * Broadcast metrics update to workspace
   */
  static broadcastMetricsUpdate(workspaceId: string, data: any): void {
    if (!this.io) {
      console.warn('⚠️ WebSocket server not initialized');
      return;
    }

    console.log(`📡 Broadcasting metrics update to workspace: ${workspaceId}`);

    this.io.to(`workspace:${workspaceId}`).emit('metrics:update', {
      ...data,
      timestamp: new Date(),
      source: 'background-sync'
    });
  }

  /**
   * Broadcast metrics refresh status
   */
  static broadcastRefreshStatus(workspaceId: string, status: 'started' | 'progress' | 'completed' | 'failed', data?: any): void {
    if (!this.io) return;

    console.log(`📡 Broadcasting refresh status to workspace ${workspaceId}: ${status}`);

    this.io.to(`workspace:${workspaceId}`).emit('metrics:refresh-status', {
      status,
      ...data,
      timestamp: new Date()
    });
  }

  /**
   * Send notification to specific user
   */
  static sendToUser(userId: string, event: string, data: any): void {
    const socketId = this.userSockets.get(userId);
    if (!socketId || !this.io) return;

    console.log(`📤 Sending ${event} to user ${userId}`);

    this.io.to(socketId).emit(event, {
      ...data,
      timestamp: new Date()
    });
  }

  /**
   * Broadcast to all users in workspace
   */
  static broadcastToWorkspace(workspaceId: string, event: string, data: any): void {
    if (!this.io) {
      console.error('❌ REALTIME DEBUG: Socket.IO server not initialized');
      return;
    }

    const roomName = `workspace:${workspaceId}`;
    const roomSockets = this.io.sockets.adapter.rooms.get(roomName);
    const connectedSockets = roomSockets ? roomSockets.size : 0;

    console.log(`📢 REALTIME DEBUG: Broadcasting ${event} to workspace ${workspaceId}`);
    console.log(`📢 REALTIME DEBUG: Room name: ${roomName}`);
    console.log(`📢 REALTIME DEBUG: Connected sockets in room: ${connectedSockets}`);
    console.log(`📢 REALTIME DEBUG: Broadcast data:`, JSON.stringify(data, null, 2));

    this.io.to(roomName).emit(event, {
      ...data,
      workspaceId,
      timestamp: new Date()
    });

    console.log(`✅ REALTIME DEBUG: Event ${event} broadcasted to ${connectedSockets} sockets in workspace ${workspaceId}`);
  }

  /**
   * Get workspace connection stats
   */
  static getWorkspaceStats(workspaceId: string): {
    connectedUsers: number;
    socketIds: string[];
  } {
    const roomSockets = this.workspaceRooms.get(workspaceId);
    return {
      connectedUsers: roomSockets ? roomSockets.size : 0,
      socketIds: roomSockets ? Array.from(roomSockets) : []
    };
  }

  /**
   * Get all workspace stats
   */
  static getAllStats(): {
    totalConnections: number;
    workspaceCount: number;
    workspaces: { [key: string]: any };
  } {
    const workspaces: { [key: string]: any } = {};
    
    for (const [workspaceId, sockets] of this.workspaceRooms) {
      workspaces[workspaceId] = {
        connectedUsers: sockets.size,
        socketIds: Array.from(sockets)
      };
    }

    return {
      totalConnections: this.userSockets.size,
      workspaceCount: this.workspaceRooms.size,
      workspaces
    };
  }

  /**
   * Shutdown WebSocket server
   */
  static shutdown(): void {
    if (this.io) {
      console.log('🛑 Shutting down WebSocket server...');
      this.io.close();
      this.workspaceRooms.clear();
      this.userSockets.clear();
    }
  }
}

export default RealtimeService;
