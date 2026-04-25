/* @/components/TaxSimulator.tsx */
"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TaxSimulator() {
  // Constant values based on the specific property
  const BASE_BUY_PRICE = 654000000;
  const BASE_DEDUCTION = 2500000;

  // General state variables
  const [sellPrice, setSellPrice] = useState<number>(3500000000);
  const [deposit, setDeposit] = useState<number>(1400000000);
  const [isResidencyMet, setIsResidencyMet] = useState<boolean>(false);
  const [brokerageFee, setBrokerageFee] = useState<number>(20000000);
  const [capitalExpenditure, setCapitalExpenditure] = useState<number>(0);

  // Calculate tax and final cash dynamically based on property division rule
  // Property division unifies the acquired 30% share with the original 70% share
  const simulationResult = useMemo(() => {
    const totalExpenses = brokerageFee + capitalExpenditure;
    // Entire 100% share uses the 2005 acquisition price due to property division
    const capitalGains = Math.max(
      0,
      sellPrice - BASE_BUY_PRICE - totalExpenses,
    );

    const emptyDetails = {
      capitalGains: 0,
      taxableGains: 0,
      deductionRate: 0,
      deduction: 0,
      taxBase: 0,
      taxRate: 0,
      progressiveDeduction: 0,
      baseTax: 0,
      localTax: 0,
    };

    if (capitalGains <= 0) {
      return { tax: 0, finalCash: sellPrice - deposit, details: emptyDetails };
    }

    let taxableGains = 0;
    let deductionRate = 0;

    if (isResidencyMet) {
      // Special exemption for residential house
      const nonTaxableLimit = 1200000000;
      if (sellPrice <= nonTaxableLimit) {
        return {
          tax: 0,
          finalCash: sellPrice - deposit,
          details: emptyDetails,
        };
      }

      const taxableRatio = (sellPrice - nonTaxableLimit) / sellPrice;
      taxableGains = capitalGains * taxableRatio;

      // Deduction rate: 40% holding + 8% residency (assuming exactly 2 years)
      deductionRate = 0.48;
    } else {
      // General taxation
      taxableGains = capitalGains;
      // Deduction rate: 30% holding only
      deductionRate = 0.3;
    }

    const deduction = taxableGains * deductionRate;
    const taxBase = Math.max(0, taxableGains - deduction - BASE_DEDUCTION);

    // Apply progressive tax brackets
    let taxRate = 0;
    let progressiveDeduction = 0;

    if (taxBase <= 14000000) {
      taxRate = 0.06;
      progressiveDeduction = 0;
    } else if (taxBase <= 50000000) {
      taxRate = 0.15;
      progressiveDeduction = 1260000;
    } else if (taxBase <= 88000000) {
      taxRate = 0.24;
      progressiveDeduction = 5760000;
    } else if (taxBase <= 150000000) {
      taxRate = 0.35;
      progressiveDeduction = 15440000;
    } else if (taxBase <= 300000000) {
      taxRate = 0.38;
      progressiveDeduction = 19940000;
    } else if (taxBase <= 500000000) {
      taxRate = 0.4;
      progressiveDeduction = 25940000;
    } else if (taxBase <= 1000000000) {
      taxRate = 0.42;
      progressiveDeduction = 35940000;
    } else {
      taxRate = 0.45;
      progressiveDeduction = 65940000;
    }

    const baseTax = taxBase * taxRate - progressiveDeduction;
    const localTax = baseTax * 0.1;
    const totalTax = baseTax + localTax;
    const finalCash = sellPrice - totalTax - deposit;

    return {
      tax: totalTax,
      finalCash: finalCash,
      details: {
        capitalGains,
        taxableGains,
        deductionRate,
        deduction,
        taxBase,
        taxRate,
        progressiveDeduction,
        baseTax,
        localTax,
      },
    };
  }, [sellPrice, deposit, isResidencyMet, brokerageFee, capitalExpenditure]);

  // Utility for formatting currency
  const formatKRW = (num: number) => Math.floor(num).toLocaleString() + " 원";

  const { details } = simulationResult;

  return (
    <Card className="w-full bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-900 shadow-md">
      <CardHeader className="bg-blue-50 dark:bg-slate-800 rounded-t-lg border-b border-blue-100 dark:border-slate-700">
        <CardTitle className="text-lg md:text-xl font-bold text-blue-800 dark:text-blue-300">
          트라팰리스 매각 시뮬레이터 (30% 재산분할 승계 반영)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Left Panel: Input Section */}
        <div className="space-y-6">
          {/* Informational alert regarding the 30% property division */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">
              어머니 지분 30% 재산분할 이전 완료
            </h4>
            <p className="text-xs text-blue-600 dark:text-blue-400 break-keep">
              등기부등본 확인 결과 &apos;재산분할&apos;로 30% 지분을
              이전받았습니다. 세법에 따라 기존 70% 지분과 동일하게 100% 지분
              전체에 대해 2005년 취득가액(6.54억)과 거주/보유기간이 통산
              적용됩니다.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
              매도 예상 금액
            </label>
            <input
              type="range"
              min="1000000000"
              max="5000000000"
              step="50000000"
              value={sellPrice}
              onChange={(e) => setSellPrice(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
              {formatKRW(sellPrice)}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
              반환할 전세 보증금
            </label>
            <input
              type="number"
              step="10000000"
              value={deposit}
              onChange={(e) => setDeposit(Number(e.target.value))}
              className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
                중개수수료 등
              </label>
              <input
                type="number"
                step="1000000"
                value={brokerageFee}
                onChange={(e) => setBrokerageFee(Number(e.target.value))}
                className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
                기타 필요경비
              </label>
              <input
                type="number"
                step="1000000"
                value={capitalExpenditure}
                onChange={(e) => setCapitalExpenditure(Number(e.target.value))}
                className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-sm"
              />
            </div>
          </div>

          <hr className="border-slate-200 dark:border-slate-700" />

          <div className="flex items-start md:items-center space-x-3">
            <input
              type="checkbox"
              id="residency"
              checked={isResidencyMet}
              onChange={(e) => setIsResidencyMet(e.target.checked)}
              className="w-5 h-5 mt-0.5 md:mt-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
            />
            <label
              htmlFor="residency"
              className="text-sm font-bold text-slate-800 dark:text-slate-200 cursor-pointer break-keep"
            >
              2년 실거주 요건 충족 적용
            </label>
          </div>
        </div>

        {/* Right Panel: Result & Formula Section */}
        <div className="flex flex-col space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800 p-4 md:p-6 rounded-lg space-y-4 border border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap gap-2 justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
              <span className="text-sm md:text-base text-slate-600 dark:text-slate-400 font-medium break-keep">
                예상 양도소득세
              </span>
              <span className="text-red-500 dark:text-red-400 font-bold font-mono text-base md:text-lg">
                {formatKRW(simulationResult.tax)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 justify-between items-center pt-2">
              <span className="text-base md:text-lg text-slate-800 dark:text-slate-200 font-bold break-keep">
                최종 회수 현금
              </span>
              <span className="text-blue-600 dark:text-blue-400 font-extrabold font-mono text-xl md:text-2xl">
                {formatKRW(simulationResult.finalCash)}
              </span>
            </div>
          </div>

          {/* Dynamic Formula Display */}
          <details className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 group overflow-hidden">
            <summary className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer outline-none flex justify-between items-center">
              <span className="break-keep">동적 양도세 계산 공식 보기</span>
              <span className="text-xs font-normal text-blue-500 group-open:hidden shrink-0 ml-2">
                클릭하여 펼치기
              </span>
            </summary>
            <div className="mt-4 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-mono overflow-x-auto">
              <div className="flex justify-between gap-2">
                <span>양도가액</span>
                <span className="text-right">{formatKRW(sellPrice)}</span>
              </div>
              <div className="flex justify-between gap-2 text-red-500 dark:text-red-400">
                <span>- 전체 취득가액 (05년 기준)</span>
                <span className="text-right">{formatKRW(BASE_BUY_PRICE)}</span>
              </div>
              <div className="flex justify-between gap-2 text-red-500 dark:text-red-400">
                <span>- 필요경비 합계</span>
                <span className="text-right">
                  {formatKRW(brokerageFee + capitalExpenditure)}
                </span>
              </div>
              <div className="flex justify-between gap-2 font-bold border-t border-slate-200 dark:border-slate-700 pt-2 text-slate-800 dark:text-slate-200 mt-1">
                <span>= 합산 양도차익</span>
                <span className="text-right">
                  {formatKRW(details.capitalGains)}
                </span>
              </div>

              <div className="h-2"></div>

              {isResidencyMet ? (
                <div className="flex justify-between gap-2 text-blue-600 dark:text-blue-400">
                  <span className="break-keep">* 12억 초과 과세비율 적용</span>
                  <span className="text-right">
                    {formatKRW(details.taxableGains)}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between gap-2 text-slate-400">
                  <span className="break-keep">
                    * 비과세 미충족 (전액 과세)
                  </span>
                  <span className="text-right">
                    {formatKRW(details.taxableGains)}
                  </span>
                </div>
              )}

              <div className="flex justify-between gap-2 text-red-500 dark:text-red-400">
                <span className="break-keep">
                  - 장특공 ({(details.deductionRate * 100).toFixed(0)}%)
                </span>
                <span className="text-right">
                  {formatKRW(details.deduction)}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-red-500 dark:text-red-400">
                <span>- 기본공제</span>
                <span className="text-right">{formatKRW(BASE_DEDUCTION)}</span>
              </div>

              <div className="flex justify-between gap-2 font-bold border-t border-slate-200 dark:border-slate-700 pt-2 text-slate-800 dark:text-slate-200">
                <span>= 과세표준</span>
                <span className="text-right">{formatKRW(details.taxBase)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>* 적용 세율 ({(details.taxRate * 100).toFixed(0)}%)</span>
                <span className="text-right">-</span>
              </div>
              <div className="flex justify-between gap-2 text-red-500 dark:text-red-400">
                <span>- 누진공제</span>
                <span className="text-right">
                  {formatKRW(details.progressiveDeduction)}
                </span>
              </div>

              <div className="flex justify-between gap-2 font-bold border-t border-slate-200 dark:border-slate-700 pt-2 text-slate-800 dark:text-slate-200">
                <span>= 산출세액 (국세)</span>
                <span className="text-right">{formatKRW(details.baseTax)}</span>
              </div>
              <div className="flex justify-between gap-2 text-red-500 dark:text-red-400">
                <span>+ 지방소득세 (10%)</span>
                <span className="text-right">
                  {formatKRW(details.localTax)}
                </span>
              </div>
              <div className="flex justify-between gap-2 font-extrabold border-t-2 border-slate-300 dark:border-slate-600 pt-2 text-slate-900 dark:text-slate-100 text-sm md:text-base">
                <span>= 총 납부 양도세</span>
                <span className="text-right">
                  {formatKRW(simulationResult.tax)}
                </span>
              </div>
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
  );
}
