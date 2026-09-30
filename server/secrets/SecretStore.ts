export type SecretKey = "gmail-refresh-token";

export interface SecretStore {
  isSupported(): boolean;
  get(key: SecretKey): Promise<string | null>;
  set(key: SecretKey, value: string): Promise<void>;
  delete(key: SecretKey): Promise<void>;
}
