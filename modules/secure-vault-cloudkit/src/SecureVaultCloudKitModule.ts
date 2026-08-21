import { NativeModule, requireNativeModule } from "expo";

type VaultMetaPayload = {
  type?: string;
  version?: number;
  email?: string;
  kdfName?: string;
  iterations?: number;
  salt?: string;
  verifier?: string;
};

type CredentialPayload = {
  id: string;
  envelope: string;
  updatedAt?: number;
  tombstone?: boolean;
};

declare class SecureVaultCloudKitModule extends NativeModule<{}> {
  getAccountStatusAsync(): Promise<string>;
  fetchVaultMetaAsync(): Promise<VaultMetaPayload | null>;
  saveVaultMetaAsync(payload: VaultMetaPayload): Promise<void>;
  fetchCredentialsAsync(): Promise<CredentialPayload[]>;
  upsertCredentialsAsync(records: CredentialPayload[]): Promise<void>;
  deleteVaultAsync(): Promise<void>;
}

export default requireNativeModule<SecureVaultCloudKitModule>(
  "SecureVaultCloudKit",
);
