/* @/components/InheritanceTaxSimulator.tsx */
"use client";

import { useState } from "react";
import { Calculator, ArrowRightCircle } from "lucide-react";

/* IMPORT JSON DATA */
import propertiesData from "@/lib/properties.json";

interface Property {
  type: string;
  address: string;
  acquisitionDate: string;
  purchasePrice: number;
  officialPrice: number;
  lastTransactionPrice: number;
  lastTransactionDate: string;
  notes: string;
  regulatedArea: boolean;
}

interface PropertiesDataStructure {
  [key: string]: Property[];
}

export default function InheritanceTaxSimulator() {
  // Extract default Yangjae price from JSON with typed structure
  const typedPropertiesData = propertiesData as PropertiesDataStructure;
  const motherProperties: Property[] = typedPropertiesData["엄마"] || [];
  const defaultYangjaeProperty = motherProperties.find((p) =>
    p.address.includes("양재동"),
  );
  const defaultYangjaePrice = defaultYangjaeProperty
    ? defaultYangjaeProperty.lastTransactionPrice
    : 78000;

  // --- Constants from Goyang Contract ---
  const goyangBunyangPrice = 42250; // Total Parcel Price
  const goyangKwonriPrice = 5819; // Rights Value (Appraisal)
  const goyangPaidContract = 1821; // Already paid contract fee

  // Asset States
  const [yangjaePrice, setYangjaePrice] = useState<number>(defaultYangjaePrice);
  const [goyangExpectedTotal, setGoyangExpectedTotal] = useState<number>(50750); // 507,500,000 KRW (Premium 85,000,000 KRW)

  // Debt States
  const [yangjaeDeposit, setYangjaeDeposit] = useState<number>(25000); // 250 million KRW (Yangjae deposit)

  const [goyangExecutedJungdogeum, setGoyangExecutedJungdogeum] =
    useState<number>(12750); // 127.5 million KRW (Executed balance for inheritance tax deduction)
  const [goyangRelocationLoan, setGoyangRelocationLoan] =
    useState<number>(2900); // 29 million KRW (Relocation loan)
  const [cardLoan, setCardLoan] = useState<number>(2800); // 28 million KRW (Card loan)

  const [otherExpenses, setOtherExpenses] = useState<number>(0); // Default: 0 KRW

  // Helper function to format prices
  const formatPrice = (price: number) => {
    if (!price || price === 0) return "0원";
    const uk = Math.floor(price / 10000);
    const man = Math.floor(price % 10000);
    if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}만원`;
    if (uk > 0) return `${uk}억원`;
    return `${man.toLocaleString()}만원`;
  };

  // --- 1. Goyang Ipju-gwon Valuation Math ---
  // Premium = Market Total - Bunyang Price
  const goyangPremium = Math.max(0, goyangExpectedTotal - goyangBunyangPrice);

  // Ipju-gwon value for Tax = Kwonri + Premium + Paid Contract + Executed Jungdogeum
  const goyangIpjugwonValue =
    goyangKwonriPrice +
    goyangPremium +
    goyangPaidContract +
    goyangExecutedJungdogeum;

  // Actual cash wired to seller at closing = Kwonri + Premium + Paid Contract - Relocation Loan
  const actualCashToSeller =
    goyangKwonriPrice +
    goyangPremium +
    goyangPaidContract -
    goyangRelocationLoan;

  // --- 2. Tax Calculation Logic ---
  const totalAssetValue = yangjaePrice + goyangIpjugwonValue;
  // Tax debt includes EXECUTED loans and actual debts as of the date of death
  const taxDebt =
    yangjaeDeposit + goyangExecutedJungdogeum + goyangRelocationLoan + cardLoan;
  const standardDeduction = 50000; // General inheritance deduction: 500,000,000 KRW
  const taxBase = Math.max(0, totalAssetValue - taxDebt - standardDeduction);

  let inheritanceTax = 0;
  let taxRateStr = "0%";
  let progressiveDeduction = 0;

  if (taxBase > 0) {
    if (taxBase <= 10000) {
      inheritanceTax = taxBase * 0.1;
      taxRateStr = "10%";
      progressiveDeduction = 0;
    } else if (taxBase <= 50000) {
      inheritanceTax = taxBase * 0.2 - 1000;
      taxRateStr = "20%";
      progressiveDeduction = 1000;
    } else if (taxBase <= 100000) {
      inheritanceTax = taxBase * 0.3 - 6000;
      taxRateStr = "30%";
      progressiveDeduction = 6000;
    } else if (taxBase <= 300000) {
      inheritanceTax = taxBase * 0.4 - 16000;
      taxRateStr = "40%";
      progressiveDeduction = 16000;
    } else {
      inheritanceTax = taxBase * 0.5 - 46000;
      taxRateStr = "50%";
      progressiveDeduction = 46000;
    }
  }

  // --- 3. Step-by-Step Cash Calculation Logic ---
  // Stage 1: Goyang Sale (Cash in hand minus remaining general debts)
  // Jungdogeum and Relocation loan are already handled via buyer assumption
  const stage1TotalObligations = cardLoan + inheritanceTax + otherExpenses;

  let stage1Distributable = 0;
  let stage2CarryoverDebt = 0;

  if (actualCashToSeller >= stage1TotalObligations) {
    stage1Distributable = actualCashToSeller - stage1TotalObligations;
  } else {
    stage2CarryoverDebt = stage1TotalObligations - actualCashToSeller;
  }

  // Stage 2: Yangjae Sale (Including Yangjae Deposit)
  const stage2Revenue = yangjaePrice;
  const stage2TotalObligations = stage2CarryoverDebt + yangjaeDeposit;
  const stage2Distributable = Math.max(
    0,
    stage2Revenue - stage2TotalObligations,
  );
  const stage2Share = Math.floor(stage2Distributable / 2);

  // Final Summary Shares
  const fatherShare = stage1Distributable;
  const myShare = stage2Share;
  const siblingShare = stage2Share;

  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Calculator className="text-indigo-500" /> 4. 실시간 상속세 및 단계별
        정산 시뮬레이터
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
        매각 시기에 따른 2단계 정산 로직이 적용되었습니다. 1단계 고양시 입주권
        거래 구조(프리미엄 역산 및 채무 승계)를 정확히 반영하여 내 통장에
        입금되는 실투자금 기준으로 정산합니다.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form Area */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
            자산 및 채무 변수 설정 (단위: 만원)
          </h3>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {/* Asset Inputs */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex justify-between">
                <span>양재동 미창빌라 예상 매도가</span>
                <span className="text-blue-500 font-normal">JSON 기본값</span>
              </label>
              <input
                type="number"
                value={yangjaePrice}
                onChange={(e) => setYangjaePrice(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800/50">
              <label className="block text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1 flex justify-between">
                <span>고양시 플러스빌라 총 매매 호가 (분양가 + 프리미엄)</span>
                <span className="text-blue-600 font-normal">부동산 시세</span>
              </label>
              <input
                type="number"
                value={goyangExpectedTotal}
                onChange={(e) => setGoyangExpectedTotal(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-blue-200 dark:border-blue-700 rounded-md text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none mb-2"
              />

              {/* Formula Breakdown UI */}
              <div className="text-[11px] text-blue-800 dark:text-blue-300 space-y-1 mt-2 bg-blue-100/50 dark:bg-blue-900/30 p-3 rounded border border-blue-200 dark:border-blue-800">
                <div className="font-bold border-b border-blue-200 dark:border-blue-800 pb-1 mb-2">
                  실제 수령 현금 계산 공식 (매수자 대출 승계 반영)
                </div>
                <div className="flex justify-between">
                  <span>권리가액:</span>
                  <span>{formatPrice(goyangKwonriPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span>+ 프리미엄:</span>
                  <span>{formatPrice(goyangPremium)}</span>
                </div>
                <div className="flex justify-between">
                  <span>+ 기납부 계약금:</span>
                  <span>{formatPrice(goyangPaidContract)}</span>
                </div>
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>- 이주비 대출 승계:</span>
                  <span>- {formatPrice(goyangRelocationLoan)}</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t border-blue-200 dark:border-blue-800 mt-2 text-sm text-blue-900 dark:text-blue-200">
                  <span>= 최종 수령 현금:</span>
                  <span>{formatPrice(actualCashToSeller)}</span>
                </div>
              </div>
            </div>

            <div className="my-4 border-t border-slate-100 dark:border-slate-800 pt-3">
              <span className="text-xs font-bold text-red-500 mb-2 block">
                부채 항목 (전세금 및 대출)
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex justify-between">
                <span>양재동 미창빌라 반환 전세금</span>
              </label>
              <input
                type="number"
                value={yangjaeDeposit}
                onChange={(e) => setYangjaeDeposit(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  중도금 대출 실행잔액
                </label>
                <input
                  type="number"
                  value={goyangExecutedJungdogeum}
                  onChange={(e) =>
                    setGoyangExecutedJungdogeum(Number(e.target.value))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  이주비 대출
                </label>
                <input
                  type="number"
                  value={goyangRelocationLoan}
                  onChange={(e) =>
                    setGoyangRelocationLoan(Number(e.target.value))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                카드론
              </label>
              <input
                type="number"
                value={cardLoan}
                onChange={(e) => setCardLoan(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex justify-between">
                <span>기타 비용 (취득세, 중개수수료, 법무사비 등)</span>
                <span className="text-amber-500 font-normal">정산 차감액</span>
              </label>
              <input
                type="number"
                value={otherExpenses}
                onChange={(e) => setOtherExpenses(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Results Area */}
        <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 rounded-xl p-6 shadow-sm flex flex-col gap-6">
          {/* Top Section: Tax Summary */}
          <div>
            <h3 className="font-bold text-indigo-900 dark:text-indigo-300 border-b border-indigo-200 dark:border-indigo-800/50 pb-2 mb-3">
              예상 세액 결과 (국세청 신고용)
            </h3>
            <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 mb-4">
              <div
                className="flex justify-between"
                title="Yangjae sale price + Ipju-gwon valuation"
              >
                <span>총 상속 재산가액:</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {formatPrice(totalAssetValue)}
                </span>
              </div>
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span>상속 채무 공제 (실행 대출만 포함):</span>
                <span>- {formatPrice(taxDebt)}</span>
              </div>
              <div className="flex justify-between text-blue-600 dark:text-blue-400 border-b border-indigo-200 dark:border-indigo-800/50 pb-3">
                <span>일괄공제 (배우자 미존재):</span>
                <span>- {formatPrice(standardDeduction)}</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900 mb-2">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  상속세 과세표준
                </span>
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  {formatPrice(taxBase)}
                </span>
              </div>
              <div className="flex justify-between items-center mb-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  예상 상속세
                </span>
                <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {formatPrice(inheritanceTax)}
                </span>
              </div>

              {/* Dynamic Formula Display */}
              {taxBase > 0 ? (
                <div className="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-2 rounded leading-relaxed">
                  <span className="font-semibold text-indigo-500 dark:text-indigo-400 block mb-1">
                    적용 산식 (구간: {taxRateStr})
                  </span>
                  (과세표준 {formatPrice(taxBase)} × {taxRateStr}) - 누진공제액{" "}
                  {formatPrice(progressiveDeduction)} ={" "}
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {formatPrice(inheritanceTax)}
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-2 rounded">
                  과세표준이 0원이므로 상속세가 발생하지 않습니다.
                </div>
              )}
            </div>
          </div>

          {/* Middle Section: Stage 1 */}
          <div>
            <h3 className="font-bold text-indigo-900 dark:text-indigo-300 border-b border-indigo-200 dark:border-indigo-800/50 pb-2 mb-3 flex items-center gap-1">
              <ArrowRightCircle size={16} /> 1단계 정산: 고양시 입주권 매도
            </h3>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900">
              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex justify-between">
                  <span>수령 현금 (대출승계 차감 후):</span>
                  <span className="text-slate-900 dark:text-white font-medium">
                    {formatPrice(actualCashToSeller)}
                  </span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>일반 빚 상환 (카드론):</span>
                  <span>- {formatPrice(cardLoan)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>비용 및 세금 (상속세, 기타비용):</span>
                  <span>- {formatPrice(inheritanceTax + otherExpenses)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  1단계 순수익금
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {formatPrice(stage1Distributable)}
                </span>
              </div>

              <div className="flex gap-2 text-xs">
                <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded text-center border border-indigo-100 dark:border-indigo-800">
                  <span className="block text-slate-500 mb-1">
                    아버지 (100%)
                  </span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {formatPrice(stage1Distributable)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Section: Stage 2 */}
          <div>
            <h3 className="font-bold text-indigo-900 dark:text-indigo-300 border-b border-indigo-200 dark:border-indigo-800/50 pb-2 mb-3 flex items-center gap-1">
              <ArrowRightCircle size={16} /> 2단계 정산: 양재동 미창빌라 매도
            </h3>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900">
              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex justify-between">
                  <span>매도 대금 수익:</span>
                  <span className="text-slate-900 dark:text-white font-medium">
                    {formatPrice(stage2Revenue)}
                  </span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>양재동 전세보증금 반환:</span>
                  <span>- {formatPrice(yangjaeDeposit)}</span>
                </div>
                {stage2CarryoverDebt > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>1단계 미청산 이월 빚 상환:</span>
                    <span>- {formatPrice(stage2CarryoverDebt)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  2단계 순수익금
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {formatPrice(stage2Distributable)}
                </span>
              </div>

              <div className="flex gap-2 text-xs">
                <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded text-center border border-indigo-100 dark:border-indigo-800">
                  <span className="block text-slate-500 mb-1">나 (50%)</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {formatPrice(stage2Share)}
                  </span>
                </div>
                <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded text-center border border-indigo-100 dark:border-indigo-800">
                  <span className="block text-slate-500 mb-1">동생 (50%)</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {formatPrice(stage2Share)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section: Total Summary */}
          <div>
            <div className="bg-indigo-600 dark:bg-indigo-500 rounded-lg p-4 text-white shadow-md space-y-2">
              <h3 className="font-bold border-b border-indigo-400 pb-2 mb-2">
                가족별 최종 정산액 요약
              </h3>
              <div className="flex justify-between items-center text-sm">
                <span>아버지 (1단계 전체)</span>
                <span className="text-lg font-bold">
                  {formatPrice(fatherShare)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>나 (2단계 50%)</span>
                <span className="text-lg font-bold">
                  {formatPrice(myShare)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>동생 (2단계 50%)</span>
                <span className="text-lg font-bold">
                  {formatPrice(siblingShare)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
