import type { SyncCommand } from '@pos/contracts';

export interface LocalScope { tenantId: string; outletId: string; deviceId: string; schemaVersion: number }
export interface LocalTransaction {
  appendCommand(command: SyncCommand): Promise<void>;
  writeAggregate(kind: string, id: string, version: number, value: Readonly<Record<string, unknown>>): Promise<void>;
  nextSequence(): Promise<string>;
}
export interface LocalDatabase {
  readonly scope: LocalScope;
  transaction<T>(work: (tx: LocalTransaction) => Promise<T>): Promise<T>;
  pendingCommands(limit: number): Promise<readonly SyncCommand[]>;
  close(): Promise<void>;
}
export type CommandResult = { operationId: string; status: 'accepted' | 'duplicate' | 'conflict' | 'rejected'; code: string; version: number | null };
export interface SyncTransport { push(commands: readonly SyncCommand[]): Promise<readonly CommandResult[]> }
export interface PrinterAdapter {
  readonly id: string;
  status(): Promise<'connected' | 'disconnected' | 'unknown'>;
  print(jobId: string, bytes: Uint8Array): Promise<'acknowledged' | 'ambiguous'>;
}
export interface NativeCapabilities { platform: 'web' | 'android' | 'ios' | 'windows' | 'macos'; sqlite: boolean; secureStorage: boolean; printerTransports: readonly string[] }
export interface PaymentProvider {
  createIntent(input: { intentId: string; amount: string; currency: string }): Promise<{ providerReference: string; status: 'pending'; paymentUrl: string | null }>;
  queryStatus(providerReference: string): Promise<'pending' | 'succeeded' | 'failed'>;
  verifyWebhook(rawBody: Uint8Array, headers: Readonly<Record<string, string>>): Promise<{ eventId: string; providerReference: string; status: 'pending' | 'succeeded' | 'failed' }>;
  requestRefund(input: { refundId: string; providerReference: string; amount: string }): Promise<{ reference: string; status: 'pending' | 'succeeded' | 'failed' }>;
}
