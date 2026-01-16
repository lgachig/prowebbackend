import { Injectable, Inject } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class JsonFileService<T> {
  private readonly filePath: string;

  constructor(filename: string) {
    this.filePath = path.join(process.cwd(), 'data', filename);
  }

  async read(): Promise<T> {
    try {
      const fileContent = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(fileContent) as T;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return {} as T;
      }
      throw error;
    }
  }

  async write(data: T): Promise<void> {
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  getFilePath(): string {
    return this.filePath;
  }
}