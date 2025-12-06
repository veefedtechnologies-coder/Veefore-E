import { Model, Document, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';
import { logger } from '../config/logger';
import { NotFoundError, DatabaseError } from '../errors';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export abstract class BaseRepository<T extends Document> {
  protected readonly model: Model<T>;
  protected readonly entityName: string;

  constructor(model: Model<T>, entityName: string) {
    this.model = model;
    this.entityName = entityName;
  }

  async findById(id: string): Promise<T | null> {
    const startTime = Date.now();
    try {
      const result = await this.model.findById(id).exec();
      logger.db.query('findById', this.entityName, Date.now() - startTime, { id });
      return result;
    } catch (error) {
      logger.db.error('findById', error, { entityName: this.entityName, id });
      throw new DatabaseError(`Failed to find ${this.entityName} by id`, error as Error);
    }
  }

  async findByIdOrFail(id: string): Promise<T> {
    const result = await this.findById(id);
    if (!result) {
      throw new NotFoundError(this.entityName, id);
    }
    return result;
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    const startTime = Date.now();
    try {
      const result = await this.model.findOne(filter).exec();
      logger.db.query('findOne', this.entityName, Date.now() - startTime);
      return result;
    } catch (error) {
      logger.db.error('findOne', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to find ${this.entityName}`, error as Error);
    }
  }

  async findMany(
    filter: FilterQuery<T> = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<T>> {
    const startTime = Date.now();
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const skip = (page - 1) * limit;

    try {
      const [data, total] = await Promise.all([
        this.model
          .find(filter)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.model.countDocuments(filter).exec(),
      ]);

      const totalPages = Math.ceil(total / limit);
      logger.db.query('findMany', this.entityName, Date.now() - startTime, { total });

      return {
        data,
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };
    } catch (error) {
      logger.db.error('findMany', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to find ${this.entityName} records`, error as Error);
    }
  }

  async findAll(filter: FilterQuery<T> = {}): Promise<T[]> {
    const startTime = Date.now();
    try {
      const result = await this.model.find(filter).exec();
      logger.db.query('findAll', this.entityName, Date.now() - startTime, { count: result.length });
      return result;
    } catch (error) {
      logger.db.error('findAll', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to find all ${this.entityName} records`, error as Error);
    }
  }

  async create(data: Partial<T>): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await this.model.create(data);
      logger.db.query('create', this.entityName, Date.now() - startTime);
      return result;
    } catch (error) {
      logger.db.error('create', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to create ${this.entityName}`, error as Error);
    }
  }

  async updateById(id: string, data: UpdateQuery<T>): Promise<T | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findByIdAndUpdate(id, data, { new: true, runValidators: true })
        .exec();
      logger.db.query('updateById', this.entityName, Date.now() - startTime, { id });
      return result;
    } catch (error) {
      logger.db.error('updateById', error, { entityName: this.entityName, id });
      throw new DatabaseError(`Failed to update ${this.entityName}`, error as Error);
    }
  }

  async updateByIdOrFail(id: string, data: UpdateQuery<T>): Promise<T> {
    const result = await this.updateById(id, data);
    if (!result) {
      throw new NotFoundError(this.entityName, id);
    }
    return result;
  }

  async updateOne(filter: FilterQuery<T>, data: UpdateQuery<T>): Promise<T | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findOneAndUpdate(filter, data, { new: true, runValidators: true })
        .exec();
      logger.db.query('updateOne', this.entityName, Date.now() - startTime);
      return result;
    } catch (error) {
      logger.db.error('updateOne', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to update ${this.entityName}`, error as Error);
    }
  }

  async updateMany(filter: FilterQuery<T>, data: UpdateQuery<T>): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.updateMany(filter, data).exec();
      logger.db.query('updateMany', this.entityName, Date.now() - startTime, {
        modified: result.modifiedCount,
      });
      return result.modifiedCount;
    } catch (error) {
      logger.db.error('updateMany', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to update ${this.entityName} records`, error as Error);
    }
  }

  async deleteById(id: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const result = await this.model.findByIdAndDelete(id).exec();
      logger.db.query('deleteById', this.entityName, Date.now() - startTime, { id });
      return !!result;
    } catch (error) {
      logger.db.error('deleteById', error, { entityName: this.entityName, id });
      throw new DatabaseError(`Failed to delete ${this.entityName}`, error as Error);
    }
  }

  async deleteOne(filter: FilterQuery<T>): Promise<boolean> {
    const startTime = Date.now();
    try {
      const result = await this.model.deleteOne(filter).exec();
      logger.db.query('deleteOne', this.entityName, Date.now() - startTime);
      return result.deletedCount > 0;
    } catch (error) {
      logger.db.error('deleteOne', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to delete ${this.entityName}`, error as Error);
    }
  }

  async deleteMany(filter: FilterQuery<T>): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.deleteMany(filter).exec();
      logger.db.query('deleteMany', this.entityName, Date.now() - startTime, {
        deleted: result.deletedCount,
      });
      return result.deletedCount;
    } catch (error) {
      logger.db.error('deleteMany', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to delete ${this.entityName} records`, error as Error);
    }
  }

  async count(filter: FilterQuery<T> = {}): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.countDocuments(filter).exec();
      logger.db.query('count', this.entityName, Date.now() - startTime);
      return result;
    } catch (error) {
      logger.db.error('count', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to count ${this.entityName} records`, error as Error);
    }
  }

  async exists(filter: FilterQuery<T>): Promise<boolean> {
    const startTime = Date.now();
    try {
      const result = await this.model.exists(filter);
      logger.db.query('exists', this.entityName, Date.now() - startTime);
      return !!result;
    } catch (error) {
      logger.db.error('exists', error, { entityName: this.entityName });
      throw new DatabaseError(`Failed to check ${this.entityName} existence`, error as Error);
    }
  }
}

export default BaseRepository;
