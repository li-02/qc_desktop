declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string, options?: Database.Options);
    prepare(source: string): Database.Statement;
    transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
    exec(source: string): this;
    pragma(source: string, options?: { simple?: boolean }): any;
    close(): this;
    name: string;
    open: boolean;
    inTransaction: boolean;
    readonly: boolean;
    memory: boolean;
  }

  namespace Database {
    interface Statement {
      run(...params: any[]): RunResult;
      get(...params: any[]): any;
      all(...params: any[]): any[];
      iterate(...params: any[]): IterableIterator<any>;
      pluck(toggle?: boolean): this;
      expand(toggle?: boolean): this;
      raw(toggle?: boolean): this;
      bind(...params: any[]): this;
      columns(): ColumnDefinition[];
    }

    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }

    interface ColumnDefinition {
      name: string;
      column: string | null;
      table: string | null;
      database: string | null;
      type: string | null;
    }

    interface Options {
      readonly?: boolean;
      fileMustExist?: boolean;
      timeout?: number;
      verbose?: (message?: any, ...additionalArgs: any[]) => void;
      nativeBinding?: string;
    }

    class SqliteError extends Error {
      constructor(message: string, code: string);
    }
  }

  export = Database;
}
