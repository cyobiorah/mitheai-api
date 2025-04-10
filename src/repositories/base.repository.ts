export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findOne(query: any): Promise<T | null>;
  find(query: any, options?: any): Promise<T[]>;
  create(data: Omit<T, "_id">): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}
