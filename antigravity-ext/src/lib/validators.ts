import type { Transaction } from '../types';

export function validateTransactionInput(input: Partial<Transaction>): { valid: boolean, errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!input.assetId) errors.assetId = "資産を選択してください";
  if (!input.type) errors.type = "取引種別を選択してください";
  if (!input.date) errors.date = "日付を入力してください";
  
  if (input.type !== 'adjustment' && input.type !== 'distribution') {
      if (input.quantity === undefined || input.quantity <= 0) {
        errors.quantity = "数量は1以上を入力してください";
      }
      if (input.price === undefined || input.price <= 0) {
          errors.price = "価格は0より大きい値を入力してください";
      }
  }

  if (input.fee && input.fee < 0) errors.fee = "手数料は0以上にしてください";
  if (input.tax && input.tax < 0) errors.tax = "税金は0以上にしてください";

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
