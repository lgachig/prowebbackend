export interface IJsonFileService<T> {
  read(): Promise<T>;
  write(data: T): Promise<void>;
  getFilePath(): string;
}

