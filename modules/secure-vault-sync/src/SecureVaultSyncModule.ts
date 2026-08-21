import { NativeModule, requireNativeModule } from "expo";

declare class SecureVaultSyncModule extends NativeModule<{}> {
  setItemAsync(key: string, value: string, service: string): Promise<void>;
  getItemAsync(key: string, service: string): Promise<string | null>;
  deleteItemAsync(key: string, service: string): Promise<void>;
}

export default requireNativeModule<SecureVaultSyncModule>("SecureVaultSync");
