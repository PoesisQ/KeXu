export const APP_NAME = 'KeXu';
export const APP_VERSION = '0.9.4';

export function backupFileName(date) {
  return `${APP_NAME}-backup-${date}.json`;
}
