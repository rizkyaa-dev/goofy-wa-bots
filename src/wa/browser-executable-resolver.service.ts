import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppEnv } from '../config/env.validation';

@Injectable()
export class BrowserExecutableResolverService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  resolve(): string | undefined {
    const configuredPath = this.config.get('WHATSAPP_BROWSER_PATH').trim();

    if (configuredPath) {
      return configuredPath;
    }

    return this.getCommonWindowsPaths().find((candidate) => existsSync(candidate));
  }

  private getCommonWindowsPaths(): string[] {
    const programFiles = process.env.PROGRAMFILES;
    const programFilesX86 = process.env['PROGRAMFILES(X86)'];
    const localAppData = process.env.LOCALAPPDATA;

    return [
      programFiles ? join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      programFilesX86 ? join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      localAppData ? join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      programFiles ? join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
      programFilesX86 ? join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
    ].filter(Boolean);
  }
}
