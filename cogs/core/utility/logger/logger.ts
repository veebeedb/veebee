import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import * as chalk from "chalk";
import { format } from "util";

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

interface LogMessage {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
  error?: Error;
}

export class Logger {
  private static instance: Logger;
  private readonly logDir: string;
  private readonly logStream: NodeJS.WritableStream;
  private readonly errorStream: NodeJS.WritableStream;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = join(process.cwd(), "logs");
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    const now = new Date();
    const currentDate = now.toISOString().split("T")[0];
    const startupTime = now
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split("Z")[0];

    // Create write streams for regular logs and errors
    this.logStream = createWriteStream(
      join(this.logDir, `${currentDate}.log`),
      { flags: "a" }
    );
    this.errorStream = createWriteStream(
      join(this.logDir, `${currentDate}-errors.log`),
      { flags: "a" }
    );

    // Create and write to bot startup log
    const startupLogPath = join(
      this.logDir,
      "startup",
      `bot-startup-${startupTime}.log`
    );
    mkdirSync(join(this.logDir, "startup"), { recursive: true });
    createWriteStream(startupLogPath, { flags: "w" }).end(
      `Bot Started at ${now.toISOString()}\n` +
        `Process ID: ${process.pid}\n` +
        `Node Version: ${process.version}\n` +
        `Platform: ${process.platform}\n` +
        `Memory: ${Math.round(
          process.memoryUsage().heapUsed / 1024 / 1024
        )}MB / ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB\n`
    );

    // Handle stream errors
    this.logStream.on("error", this.handleStreamError);
    this.errorStream.on("error", this.handleStreamError);

    process.on("uncaughtException", (error) => {
      this.fatal("Uncaught Exception", error);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      this.fatal(
        "Unhandled Rejection",
        reason instanceof Error ? reason : new Error(String(reason))
      );
    });
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private handleStreamError(error: Error): void {
    console.error(chalk.red(`[Logger Stream Error] ${error.message}`));
  }

  private formatMessage(logMessage: LogMessage): string {
    const timestamp = logMessage.timestamp
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    const level = LogLevel[logMessage.level].padEnd(5);
    const context = logMessage.context ? ` [${logMessage.context}]` : "";
    let message = `[${timestamp}] ${level}${context}: ${logMessage.message}`;

    if (logMessage.error) {
      message += `\nStack Trace:\n${logMessage.error.stack}`;
    }

    return message;
  }

  private writeToLog(logMessage: LogMessage): void {
    if (logMessage.level < this.logLevel) return;

    const formattedMessage = this.formatMessage(logMessage);

    // Write to console with colors
    let consoleMessage: string;
    switch (logMessage.level) {
      case LogLevel.DEBUG:
        consoleMessage = chalk.gray(formattedMessage);
        break;
      case LogLevel.INFO:
        consoleMessage = chalk.blue(formattedMessage);
        break;
      case LogLevel.WARN:
        consoleMessage = chalk.yellow(formattedMessage);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        consoleMessage = chalk.red(formattedMessage);
        break;
      default:
        consoleMessage = formattedMessage;
    }
    console.log(consoleMessage);

    // Write to file
    const fileMessage = `${formattedMessage}\n`;
    this.logStream.write(fileMessage);

    // Write errors and fatal messages to error log
    if (logMessage.level >= LogLevel.ERROR) {
      this.errorStream.write(fileMessage);
    }
  }

  public debug(message: string, context?: string): void {
    this.writeToLog({
      timestamp: new Date(),
      level: LogLevel.DEBUG,
      message,
      context,
    });
  }

  public info(message: string, context?: string): void {
    this.writeToLog({
      timestamp: new Date(),
      level: LogLevel.INFO,
      message,
      context,
    });
  }

  public warn(message: string, context?: string): void {
    this.writeToLog({
      timestamp: new Date(),
      level: LogLevel.WARN,
      message,
      context,
    });
  }

  public error(message: string, error?: Error, context?: string): void {
    this.writeToLog({
      timestamp: new Date(),
      level: LogLevel.ERROR,
      message,
      error,
      context,
    });
  }

  public fatal(message: string, error?: Error, context?: string): void {
    this.writeToLog({
      timestamp: new Date(),
      level: LogLevel.FATAL,
      message,
      error,
      context,
    });
  }

  // Utility method for formatting messages with variables
  public format(message: string, ...args: any[]): string {
    return format(message, ...args);
  }
}

// Export a singleton instance
export const logger = Logger.getInstance();
