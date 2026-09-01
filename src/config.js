export const APP_NAME = 'KeXu';
export const APP_VERSION = '0.9.16';

export function backupFileName(date) {
  return `${APP_NAME}-backup-${date}.json`;
}
