/**
 * Storage Repository
 * 
 * Abstracts database interactions for file metadata tracking.
 * Manages file records in MongoDB for audit and management purposes.
 * 
 * Requirements: 4.5
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface FileMetadata {
  id: string;
  key: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  bucket: string;
  folder: string;
  userId?: string;
  workspaceId?: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
    [key: string]: any;
  };
  status: 'uploading' | 'completed' | 'failed' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

export interface IFileMetadataDocument extends FileMetadata, Document {}

const FileMetadataSchema = new Schema<IFileMetadataDocument>(
  {
    key: { type: String, required: true, unique: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    bucket: { type: String, required: true },
    folder: { type: String, required: true },
    userId: { type: String, index: true },
    workspaceId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['uploading', 'completed', 'failed', 'deleted'],
      default: 'completed',
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for common queries
FileMetadataSchema.index({ userId: 1, createdAt: -1 });
FileMetadataSchema.index({ workspaceId: 1, createdAt: -1 });
FileMetadataSchema.index({ status: 1 });
FileMetadataSchema.index({ mimetype: 1 });

const FileMetadataModel = mongoose.model<IFileMetadataDocument>('FileMetadata', FileMetadataSchema);

export interface IStorageRepository {
  createFile(fileData: Partial<FileMetadata>): Promise<FileMetadata>;
  getFile(id: string): Promise<FileMetadata | null>;
  getFileByKey(key: string): Promise<FileMetadata | null>;
  getFilesByUser(userId: string, limit?: number): Promise<FileMetadata[]>;
  getFilesByWorkspace(workspaceId: string, limit?: number): Promise<FileMetadata[]>;
  updateFile(id: string, updates: Partial<FileMetadata>): Promise<FileMetadata | null>;
  deleteFile(id: string): Promise<boolean>;
  markFileDeleted(id: string): Promise<boolean>;
  getFileStats(userId?: string, workspaceId?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    filesByType: Record<string, number>;
  }>;
}

export class StorageRepository implements IStorageRepository {
  /**
   * Create file metadata record
   */
  async createFile(fileData: Partial<FileMetadata>): Promise<FileMetadata> {
    const file = new FileMetadataModel(fileData);
    const saved = await file.save();
    return this.toFileMetadata(saved);
  }

  /**
   * Get file by ID
   */
  async getFile(id: string): Promise<FileMetadata | null> {
    const file = await FileMetadataModel.findById(id);
    return file ? this.toFileMetadata(file) : null;
  }

  /**
   * Get file by storage key
   */
  async getFileByKey(key: string): Promise<FileMetadata | null> {
    const file = await FileMetadataModel.findOne({ key });
    return file ? this.toFileMetadata(file) : null;
  }

  /**
   * Get all files for a user
   */
  async getFilesByUser(userId: string, limit: number = 100): Promise<FileMetadata[]> {
    const files = await FileMetadataModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    
    return files.map(f => this.toFileMetadata(f));
  }

  /**
   * Get all files for a workspace
   */
  async getFilesByWorkspace(workspaceId: string, limit: number = 100): Promise<FileMetadata[]> {
    const files = await FileMetadataModel.find({ workspaceId })
      .sort({ createdAt: -1 })
      .limit(limit);
    
    return files.map(f => this.toFileMetadata(f));
  }

  /**
   * Update file metadata
   */
  async updateFile(id: string, updates: Partial<FileMetadata>): Promise<FileMetadata | null> {
    const file = await FileMetadataModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );
    
    return file ? this.toFileMetadata(file) : null;
  }

  /**
   * Permanently delete file record
   */
  async deleteFile(id: string): Promise<boolean> {
    const result = await FileMetadataModel.findByIdAndDelete(id);
    return !!result;
  }

  /**
   * Mark file as deleted (soft delete)
   */
  async markFileDeleted(id: string): Promise<boolean> {
    const result = await FileMetadataModel.findByIdAndUpdate(
      id,
      { $set: { status: 'deleted' } },
      { new: true }
    );
    
    return !!result;
  }

  /**
   * Get file statistics
   */
  async getFileStats(userId?: string, workspaceId?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    filesByType: Record<string, number>;
  }> {
    const query: any = { status: { $ne: 'deleted' } };
    
    if (userId) {
      query.userId = userId;
    }
    
    if (workspaceId) {
      query.workspaceId = workspaceId;
    }

    // Get total count and size
    const files = await FileMetadataModel.find(query);
    
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    // Group by mimetype
    const filesByType: Record<string, number> = {};
    files.forEach(f => {
      const type = f.mimetype.split('/')[0]; // 'image', 'video', 'application', etc.
      filesByType[type] = (filesByType[type] || 0) + 1;
    });

    return {
      totalFiles,
      totalSize,
      filesByType,
    };
  }

  /**
   * Helper: Convert Mongoose document to plain object
   */
  private toFileMetadata(doc: IFileMetadataDocument): FileMetadata {
    return {
      id: doc._id.toString(),
      key: doc.key,
      originalName: doc.originalName,
      mimetype: doc.mimetype,
      size: doc.size,
      url: doc.url,
      bucket: doc.bucket,
      folder: doc.folder,
      userId: doc.userId,
      workspaceId: doc.workspaceId,
      metadata: doc.metadata,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

// Export singleton instance
export const storageRepository = new StorageRepository();
