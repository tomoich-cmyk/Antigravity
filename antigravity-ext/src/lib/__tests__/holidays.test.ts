/**
 * holidays.test.ts
 *
 * japanHolidayProvider の動作確認。
 * marketClock の getMarketSessionTokyo / businessDayDiff との結合も検証。
 *
 * テストグループ:
 *  A. 土日判定 (3)
 *  B. 国民の祝日 (6)
 *  C. 振替休日 (4)
 *  D. 年末年始休業 (4)
 *  E. 祝日前後の平日 (3)
 *  F. marketClock との結合 — getMarketSessionTokyo (2)
 *  G. marketClock との結合 — businessDayDiff (3)
 */

import { describe, it, expect } from 'vitest';
import { japanHolidayProvider } from '../holidays';
import { getMarketSessionTokyo, businessDayDiff } from '../marketClock';

// ─── A. 土日判定 ──────────────────────────────────────────────────────────────

describe('A: 土日判定', () => {

  it('A-1. 2025-04-05 (土) → true', () => {
    expect(japanHolidayProvider('2025-04-05')).toBe(true);
  });

  it('A-2. 2025-04-06 (日) → true', () => {
    expect(japanHolidayProvider('2025-04-06')).toBe(true);
  });

  it('A-3. 2025-04-07 (月) → false (平日)', () => {
    expect(japanHolidayProvider('2025-04-07')).toBe(false);
  });
});

// ─── B. 国民の祝日 ────────────────────────────────────────────────────────────

describe('B: 国民の祝日', () => {

  it('B-1. 2025-01-01 元日 → true', () => {
    expect(japanHolidayProvider('2025-01-01')).toBe(true);
  });

  it('B-2. 2025-03-20 春分の日 → true', () => {
    expect(japanHolidayProvider('2025-03-20')).toBe(true);
  });

  it('B-3. 2025-05-03 憲法記念日 → true', () => {
    expect(japanHolidayProvider('2025-05-03')).toBe(true);
  });

  it('B-4. 2025-08-11 山の日 → true', () => {
    expect(japanHolidayProvider('2025-08-11')).toBe(true);
  });

  it('B-5. 2025-09-23 秋分の日 → true', () => {
    expect(japanHolidayProvider('2025-09-23')).toBe(true);
  });

  it('B-6. 2025-11-23 勤労感謝の日 → true', () => {
    expect(japanHolidayProvider('2025-11-23')).toBe(true);
  });
});

// ─── C. 振替休日 ──────────────────────────────────────────────────────────────

describe('C: 振替休日', () => {

  it('C-1. 2025-02-24 (振替: 天皇誕生日 2/23 が日曜) → true', () => {
    expect(japanHolidayProvider('2025-02-24')).toBe(true);
  });

  it('C-2. 2025-05-06 (振替: みどりの日 5/4 が日曜) → true', () => {
    expect(japanHolidayProvider('2025-05-06')).toBe(true);
  });

  it('C-3. 2025-11-24 (振替: 勤労感謝の日 11/23 が日曜) → true', () => {
    expect(japanHolidayProvider('2025-11-24')).toBe(true);
  });

  it('C-4. 2024-02-12 (振替: 建国記念の日 2/11 が日曜) → true', () => {
    expect(japanHolidayProvider('2024-02-12')).toBe(true);
  });
});

// ─── D. 年末年始休業 ──────────────────────────────────────────────────────────

describe('D: 年末年始休業', () => {

  it('D-1. 2025-01-02 → true (東証休業)', () => {
    expect(japanHolidayProvider('2025-01-02')).toBe(true);
  });

  it('D-2. 2025-01-03 → true (東証休業)', () => {
    expect(japanHolidayProvider('2025-01-03')).toBe(true);
  });

  it('D-3. 2025-12-31 → true (東証休業)', () => {
    expect(japanHolidayProvider('2025-12-31')).toBe(true);
  });

  it('D-4. 2025-01-06 (月) → false (仕事始め・平日)', () => {
    expect(japanHolidayProvider('2025-01-06')).toBe(false);
  });
});

// ─── E. 祝日前後の平日 ────────────────────────────────────────────────────────

describe('E: 祝日前後の平日', () => {

  it('E-1. 2025-03-19 (春分の日の前日・水曜) → false', () => {
    expect(japanHolidayProvider('2025-03-19')).toBe(false);
  });

  it('E-2. 2025-03-21 (春分の日の翌日・金曜) → false', () => {
    expect(japanHolidayProvider('2025-03-21')).toBe(false);
  });

  it('E-3. 2025-08-12 (山の日の翌日・火曜) → false', () => {
    // 2025年は山の日 8/11 (月)、翌 8/12 は平日
    expect(japanHolidayProvider('2025-08-12')).toBe(false);
  });
});

// ─── F. getMarketSessionTokyo との結合 ───────────────────────────────────────

describe('F: getMarketSessionTokyo + japanHolidayProvider', () => {

  it('F-1. 山の日 (2025-08-11) 10:00 JST → holiday', () => {
    const now = new Date('2025-08-11T01:00:00Z'); // 10:00 JST
    const session = getMarketSessionTokyo(now, japanHolidayProvider);
    expect(session).toBe('holiday');
  });

  it('F-2. 翌平日 (2025-08-12) 10:00 JST → morning', () => {
    const now = new Date('2025-08-12T01:00:00Z'); // 10:00 JST
    const session = getMarketSessionTokyo(now, japanHolidayProvider);
    expect(session).toBe('morning');
  });
});

// ─── G. businessDayDiff との結合 ─────────────────────────────────────────────

describe('G: businessDayDiff + japanHolidayProvider', () => {

  it('G-1. GW 跨ぎ: 4/30(水) → 5/8(木) = 2 営業日差', () => {
    // 5/3(土)憲法記念日, 5/4(日)みどりの日, 5/5(月)こどもの日, 5/6(火)振替
    // 4/30(水) → 5/1(木)+1, 5/2(金)+1, 5/7(水)+1, 5/8(木)+1 = 実際は4営業日差
    // 待って、正しく計算: 4/30→5/1(木)=+1, 5/2(金)=+2, 5/3〜5/6休み, 5/7(水)=+3, 5/8(木)=+4
    const diff = businessDayDiff('2025-04-30', '2025-05-08', japanHolidayProvider);
    expect(diff).toBe(4);
  });

  it('G-2. 春分の日 (3/20) 跨ぎ: 3/19(水) → 3/21(金) = 1 営業日差', () => {
    // 3/20 は春分の日 (休場), 3/21 は平日
    const diff = businessDayDiff('2025-03-19', '2025-03-21', japanHolidayProvider);
    expect(diff).toBe(1);
  });

  it('G-3. 年末年始跨ぎ: 12/30(火) → 1/5(月) = 1 営業日差', () => {
    // 12/31 (水): 東証休業, 1/1 (木): 元日, 1/2 (金): 東証休業, 1/3 (土): 土曜
    // 1/4 (日): 日曜, 1/5 (月): 最初の営業日
    // よって 12/30 → 1/5 = 1 営業日差
    const diff = businessDayDiff('2025-12-30', '2026-01-05', japanHolidayProvider);
    expect(diff).toBe(1);
  });
});
