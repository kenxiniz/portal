/* @/components/TaxSimulator.tsx */
"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TaxSimulator() {
  // Constant values based on the specific property
  const BASE_BUY_PRICE = 654000000;
  const BASE_DEDUCTION = 2500000;

  // General state variables
  const [sellPrice, setSellPrice] = useState<number>(3600000000);
  const [deposit, setDeposit] = useState<number>(1400000000);

  // Exemption condition states
  // 'none' = 일반 과세 | 'residency' = 2년 실거주 | 'sangsaeng' = 상생임대주택 특례
  const [exemptionType, setExemptionType] = useState<
    "none" | "residency" | "sangsaeng"
  >("none");

  const [brokerageFee, setBrokerageFee] = useState<number>(20000000);
  const [capitalExpenditure, setCapitalExpenditure] = useState<number>(0);

  // Private Loan (대부 대출) state variables for the deposit return
  const [loanInterestRate, setLoanInterestRate] = useState<number>(10); // 기본 연 10%
  const [loanMonths, setLoanMonths] = useState<number>(5); // 기본 5개월

  // Calculate tax and final cash dynamically based on property division rule
  // Property division unifies the acquired 30% share with the original 70% share
  const simulationResult = useMemo(() => {
    // 1. 대부 대출 이자 비용 계산 (원금: 전세 보증금 기준)
    // 상생임대주택 특례 적용 시 세입자 퇴거가 불필요하므로 대출 이자 비용은 0원 처리
    const isSangsaeng = exemptionType === "sangsaeng";
    const loanInterestCost = isSangsaeng
      ? 0
      : Math.floor(deposit * (loanInterestRate / 100) * (loanMonths / 12));

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
      loanInterestCost,
    };

    if (capitalGains <= 0) {
      // 이자 비용을 최종 회수 현금에서 차감
      return {
        tax: 0,
        finalCash: sellPrice - deposit - loanInterestCost,
        details: emptyDetails,
      };
    }

    let taxableGains = 0;
    let deductionRate = 0;

    if (exemptionType !== "none") {
      // Special exemption for residential house (12억 비과세 한도 적용)
      const nonTaxableLimit = 1200000000;
      if (sellPrice <= nonTaxableLimit) {
        return {
          tax: 0,
          finalCash: sellPrice - deposit - loanInterestCost,
          details: emptyDetails,
        };
      }

      const taxableRatio = (sellPrice - nonTaxableLimit) / sellPrice;
      taxableGains = capitalGains * taxableRatio;

      if (exemptionType === "residency") {
        // 실제 2년 거주: 보유공제 40% + 거주공제 8% (2년 기준) = 총 48%
        deductionRate = 0.48;
      } else if (exemptionType === "sangsaeng") {
        // 상생임대주택 특례: 12억 비과세는 발동하지만, 실제 거주는 안했으므로 거주공제 배제
        // 오직 보유공제(최대 40%)만 적용
        deductionRate = 0.4;
      }
    } else {
      // General taxation (일반 다주택/미거주 과세)
      taxableGains = capitalGains;
      // 장기보유특별공제 표1 적용 (15년 이상 최대 30%)
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

    // 최종 회수 현금 = 매도가 - 총 세금 - 보증금 원금 - 대부 대출 이자
    const finalCash = sellPrice - totalTax - deposit - loanInterestCost;

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
        loanInterestCost,
      },
    };
  }, [
    sellPrice,
    deposit,
    exemptionType,
    brokerageFee,
    capitalExpenditure,
    loanInterestRate,
    loanMonths,
  ]);

  // Utility for formatting currency
  const formatKRW = (num: number) => Math.floor(num).toLocaleString() + " 원";

  const { details } = simulationResult;
  const isSangsaeng = exemptionType === "sangsaeng";

  return (
    <Card className="w-full bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-900 shadow-md">
      <CardHeader className="bg-blue-50 dark:bg-slate-800 rounded-t-lg border-b border-blue-100 dark:border-slate-700">
        <CardTitle className="text-lg md:text-xl font-bold text-blue-800 dark:text-blue-300">
          트라팰리스 매각 시뮬레이터 (상생임대주택 특례 및 융통 이자 반영)
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
              반환할 전세 보증금 (대출 원금 기준)
            </label>
            <input
              type="number"
              step="10000000"
              value={deposit}
              onChange={(e) => setDeposit(Number(e.target.value))}
              className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-sm"
            />
          </div>

          {/* 비과세 및 특례 조건 선택 (라디오 버튼 방식) */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
            <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
              양도소득세 비과세 및 특례 적용 조건
            </label>
            <div className="space-y-2 pt-1">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="exemption"
                  checked={exemptionType === "none"}
                  onChange={() => setExemptionType("none")}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
                    적용 없음 (일반 과세)
                  </span>
                  <span className="text-xs text-slate-500 block">
                    12억 비과세 없음 / 장특공 최대 30% 적용
                  </span>
                </div>
              </label>

              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="exemption"
                  checked={exemptionType === "residency"}
                  onChange={() => setExemptionType("residency")}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-semibold text-blue-700 dark:text-blue-400 block">
                    2년 실거주 요건 충족
                  </span>
                  <span className="text-xs text-slate-500 block">
                    12억 비과세 + 장특공 보유 40% 및 거주공제 합산
                  </span>
                </div>
              </label>

              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="exemption"
                  checked={exemptionType === "sangsaeng"}
                  onChange={() => setExemptionType("sangsaeng")}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-semibold text-teal-700 dark:text-teal-400 block">
                    상생임대주택 특례 적용 (미거주)
                  </span>
                  <span className="text-xs text-slate-500 block break-keep">
                    거주 없이 12억 비과세 발동 / 단, 실거주는 안했으므로 장특공
                    거주공제율은 배제 (보유공제 최대 40%만 적용)
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 대부업체 대출 이자 조건 입력 (상생임대 선택 시 자동 비활성화) */}
          <div
            className={`p-4 rounded-lg border transition-all space-y-4 ${
              isSangsaeng
                ? "bg-slate-100 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800 opacity-60"
                : "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900"
            }`}
          >
            <div className="flex justify-between items-center">
              <h4
                className={`text-sm font-bold ${isSangsaeng ? "text-slate-500" : "text-orange-800 dark:text-orange-300"}`}
              >
                전세금 반환용 대부 대출 조건 (단기 융통)
              </h4>
              {isSangsaeng && (
                <span className="text-[11px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-sans">
                  상생임대 적용 (대출 불필요)
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  className={`text-xs font-semibold block ${isSangsaeng ? "text-slate-400" : "text-slate-700 dark:text-slate-300"}`}
                >
                  대출 연 이자율 (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  disabled={isSangsaeng}
                  value={loanInterestRate}
                  onChange={(e) => setLoanInterestRate(Number(e.target.value))}
                  className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-sm disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label
                  className={`text-xs font-semibold block ${isSangsaeng ? "text-slate-400" : "text-slate-700 dark:text-slate-300"}`}
                >
                  대출 이용 기간 (개월)
                </label>
                <input
                  type="number"
                  step="1"
                  disabled={isSangsaeng}
                  value={loanMonths}
                  onChange={(e) => setLoanMonths(Number(e.target.value))}
                  className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-sm disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-900"
                />
              </div>
            </div>
            <div
              className={`flex justify-between items-center text-xs font-mono pt-1 ${
                isSangsaeng
                  ? "text-slate-400"
                  : "text-orange-700 dark:text-orange-400"
              }`}
            >
              <span>예상 총 이자 비용:</span>
              <span className="font-bold text-sm">
                {formatKRW(details.loanInterestCost)}
              </span>
            </div>
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
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-right">
              * 최종 현금 = 매도가 - 양도세 - 보증금 원금 - 대출 이자
            </p>
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

              {exemptionType !== "none" ? (
                <div className="flex justify-between gap-2 text-blue-600 dark:text-blue-400">
                  <span className="break-keep">
                    * 12억 초과 과세비율 적용 (
                    {exemptionType === "sangsaeng" ? "상생임대" : "실거주"})
                  </span>
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

              <div className="h-2"></div>

              {/* Cash recovery summary output */}
              <div className="bg-slate-100 dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 space-y-1 mt-2 text-xs">
                <div className="text-slate-700 dark:text-slate-300 font-bold pb-1 border-b border-slate-200 dark:border-slate-700">
                  [현금 흐름 정산]
                </div>
                <div className="flex justify-between">
                  <span>매도 예상 금액:</span>
                  <span>{formatKRW(sellPrice)}</span>
                </div>
                <div className="flex justify-between text-red-500 dark:text-red-400">
                  <span>- 총 양도세 납부:</span>
                  <span>{formatKRW(simulationResult.tax)}</span>
                </div>
                <div className="flex justify-between text-red-500 dark:text-red-400">
                  <span>- 보증금 반환 (원금):</span>
                  <span>{formatKRW(deposit)}</span>
                </div>
                <div className="flex justify-between text-orange-600 dark:text-orange-400 font-bold">
                  <span>
                    - 대부 대출 이자 ({isSangsaeng ? 0 : loanMonths}개월):
                  </span>
                  <span>{formatKRW(details.loanInterestCost)}</span>
                </div>
                <div className="flex justify-between text-blue-600 dark:text-blue-400 font-extrabold pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>= 최종 손에 쥐는 현금:</span>
                  <span>{formatKRW(simulationResult.finalCash)}</span>
                </div>
              </div>
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
  );
}
