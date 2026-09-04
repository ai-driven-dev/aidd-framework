export interface FileWriter {
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  deleteEmptyDirectories(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<void>;
  chmodExecutable(path: string): Promise<void>;
}
