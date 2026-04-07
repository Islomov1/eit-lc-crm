// src/lib/paymentUtils.ts
// Обычные утилиты — НЕ server actions

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function calcFinalAmount(base: number, discountPct: number, bonus: number): number {
  const discounted = Math.round(base * (1 - clamp(discountPct, 0, 100) / 100));
  return Math.max(0, discounted + bonus);
}