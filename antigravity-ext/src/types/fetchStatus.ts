/**
 * fetchStatus.ts
 *
 * スナップショット取得状態の型定義。
 * 価格データとは独立して保持し、通知文面と監査ログに利用する。
 */

export type FetchErrorKind =
  | 'network'        // ネットワーク到達不能
  | 'timeout'        // AbortSignal.timeout で中断
  | 'http'           // 4xx / 5xx
  | 'invalid_payload' // JSON パース失敗 / 型不一致
  | 'adapter_error'  // snapshotToQuoteSnapshots が throw
  | 'empty_snapshot'; // fetch 成功だが有効な price が 0 件

export interface SnapshotFetchState {
  /** 最終試行時刻 (ISO string) */
  lastAttemptAt?: string;
  /** 最終成功時刻 (ISO string) */
  lastSuccessAt?: string;
  /** 最終失敗時刻 (ISO string) */
  lastErrorAt?: string;
  /** 現在の取得状態 */
  status: 'idle' | 'success' | 'failed';
  /** 失敗時の原因分類 */
  errorKind?: FetchErrorKind;
  /** 人が読めるエラーメッセージ (ログ用) */
  errorMessage?: string;
  /** 前回成功値を表示に使っているか */
  fallbackUsed: boolean;
}
