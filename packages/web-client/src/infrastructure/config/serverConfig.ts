/**
 * Server Configuration Management
 * サーバーURL設定をlocalStorageで管理
 */

const SERVER_URL_KEY = 'maycast_server_url';
const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export function getServerUrl(): string {
  return localStorage.getItem(SERVER_URL_KEY) ?? DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string): void {
  localStorage.setItem(SERVER_URL_KEY, url);
}

export function getDefaultServerUrl(): string {
  return DEFAULT_SERVER_URL;
}
