export interface BuildConfig {
  readonly Product: string;
  readonly AWSAccountID: string;
  readonly AWSRegion: string;
  readonly Environment: string;
  readonly Team: string;
  readonly Version: string;
  readonly ElbAccountId: string;
  readonly LogRetentionDays: number;
}
