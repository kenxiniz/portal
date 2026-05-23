/* @/components/SeungsuTaxSimulator.tsx */
"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PropertyConfig {
  id: string;
  name: string;
  type: string;
  acquisitionDate: string;
  purchasePrice: number;
  defaultSellPrice: number;
  minSellPrice: number;
  maxSellPrice: number;
  step: number;
  defaultExemption: boolean;
  defaultDeductionRate: number;
  notes: string;
}

export default function SeungsuTaxSimulator() {
  // Constant base deduction for capital gains tax per year
  const BASE_DEDUCTION = 2500000;

  // Exact Wondang 1st District contract constants based on the attached document
  const WONDANG_MEMBER_PRICE = 422500000;
  const WONDANG_VALUATION = 58198209;
  const WONDANG_CONTRIBUTION = 364301791;

  // List of properties owned by Seungsu
  const properties: PropertyConfig[] = [
    {
      id: "gwangju_apt",
      name: "광주 주월동 제석산호반힐하임 (아파트)",
      type: "아파트",
      acquisitionDate: "2021-04-30",
      purchasePrice: 500000000,
      defaultSellPrice: 450000000,
      minSellPrice: 300000000,
      maxSellPrice: 800000000,
      step: 10000000,
      defaultExemption: true,
      defaultDeductionRate: 0.1,
      notes:
        "1세대 1주택 요건 충족 (임대주택 보유에 따른 거주주택 비과세 특례 적용 가능)",
    },
    {
      id: "goyang_villa1",
      name: "고양 주교동 원앙빌라 (원당1구역 더샵포레나 반영)",
      type: "빌라",
      acquisitionDate: "2020-02-05",
      purchasePrice: 85000000,
      defaultSellPrice: 520000000, // Based on market total price (Member price + Premium)
      minSellPrice: 100000000,
      maxSellPrice: 800000000,
      step: 5000000,
      defaultExemption: false,
      defaultDeductionRate: 0.12,
      notes:
        "계약서 기준 조합원 분양가 4.22억, 권리가액 5,820만 원. 현재 형성된 프리미엄 약 8.5천만~1.1억 선",
    },
    {
      id: "goyang_villa2",
      name: "고양 주교동 금강빌라 (민간임대/재개발 호재)",
      type: "빌라",
      acquisitionDate: "2020-03-10",
      purchasePrice: 90000000,
      defaultSellPrice: 300000000,
      minSellPrice: 80000000,
      maxSellPrice: 800000000,
      step: 5000000,
      defaultExemption: false,
      defaultDeductionRate: 0.12,
      notes:
        "민간임대사업자 등록(2021-12-21). 추가분담금 납부액은 세법상 전액 필요경비 인정",
    },
  ];

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const currentProp = properties[selectedIndex];

  // Dynamic user inputs
  const [customSellPrice, setCustomSellPrice] = useState<number | null>(null);
  const [customPurchasePrice, setCustomPurchasePrice] = useState<number | null>(
    null,
  );
  const [isExemptionMet, setIsExemptionMet] = useState<boolean | null>(null);
  const [customDeductionRate, setCustomDeductionRate] = useState<number | null>(
    null,
  );
  const [brokerageFee, setBrokerageFee] = useState<number>(5000000);
  const [capitalExpenditure, setCapitalExpenditure] = useState<number>(0);

  // State for additional contribution paid by the owner initialize with exact contract value for villa 1
  const [additionalContribution, setAdditionalContribution] =
    useState<number>(0);

  // Reset custom states when switching properties
  const handlePropertyChange = (index: number) => {
    setSelectedIndex(index);
    setCustomSellPrice(null);
    setCustomPurchasePrice(null);
    setIsExemptionMet(null);
    setCustomDeductionRate(null);
    setBrokerageFee(index === 0 ? 5000000 : 3000000);
    setCapitalExpenditure(0);
    // If selecting the first Goyang villa preset the exact contribution from the contract
    if (index === 1) {
      setAdditionalContribution(WONDANG_CONTRIBUTION);
    } else {
      setAdditionalContribution(0);
    }
  };

  const activeSellPrice =
    customSellPrice !== null ? customSellPrice : currentProp.defaultSellPrice;
  const activePurchasePrice =
    customPurchasePrice !== null
      ? customPurchasePrice
      : currentProp.purchasePrice;
  const activeExemption =
    isExemptionMet !== null ? isExemptionMet : currentProp.defaultExemption;
  const activeDeductionRate =
    customDeductionRate !== null
      ? customDeductionRate
      : currentProp.defaultDeductionRate;

  // Calculate tax logic dynamically based on current parameters including additional contribution
  const simulationResult = useMemo(() => {
    const totalExpenses =
      brokerageFee + capitalExpenditure + additionalContribution;
    const capitalGains = Math.max(
      0,
      activeSellPrice - activePurchasePrice - totalExpenses,
    );

    const emptyDetails = {
      capitalGains: 0,
      taxableGains: 0,
      deduction: 0,
      taxBase: 0,
      taxRate: 0,
      progressiveDeduction: 0,
      baseTax: 0,
      localTax: 0,
    };

    if (capitalGains <= 0) {
      return {
        tax: 0,
        finalCash: activeSellPrice - additionalContribution,
        details: emptyDetails,
      };
    }

    let taxableGains = 0;

    if (activeExemption) {
      const nonTaxableLimit = 1200000000;
      if (activeSellPrice <= nonTaxableLimit) {
        return {
          tax: 0,
          finalCash: activeSellPrice - additionalContribution,
          details: { ...emptyDetails, capitalGains },
        };
      }
      const taxableRatio =
        (activeSellPrice - nonTaxableLimit) / activeSellPrice;
      taxableGains = capitalGains * taxableRatio;
    } else {
      taxableGains = capitalGains;
    }

    const deduction = taxableGains * activeDeductionRate;
    const taxBase = Math.max(0, taxableGains - deduction - BASE_DEDUCTION);

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
    const finalCash = activeSellPrice - totalTax - additionalContribution;

    return {
      tax: totalTax,
      finalCash,
      details: {
        capitalGains,
        taxableGains,
        deduction,
        taxBase,
        taxRate,
        progressiveDeduction,
        baseTax,
        localTax,
      },
    };
  }, [
    activeSellPrice,
    activePurchasePrice,
    activeExemption,
    activeDeductionRate,
    brokerageFee,
    capitalExpenditure,
    additionalContribution,
  ]);

  const formatKRW = (num: number) => Math.floor(num).toLocaleString() + " 원";

  const { details } = simulationResult;

  return (
    <Card className="w-full bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-900 shadow-md">
      <CardHeader className="bg-indigo-50 dark:bg-slate-800 rounded-t-lg border-b border-indigo-100 dark:border-slate-700">
        <CardTitle className="text-lg md:text-xl font-bold text-indigo-800 dark:text-indigo-300">
          승수 보유 주택 매각 및 양도소득세 시뮬레이터 (원당1구역 실데이터 반영)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 md:p-6 space-y-6">
        {/* Property Selector Tabs */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700 dark:text-slate-300 block">
            매각 대상 주택 선택
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {properties.map((prop, idx) => (
              <button
                key={prop.id}
                onClick={() => handlePropertyChange(idx)}
                className={`p-3 text-left rounded-lg border text-xs md:text-sm font-medium transition-all ${
                  selectedIndex === idx
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="font-bold truncate">
                  {prop.name.split(" ")[0]} {prop.name.split(" ")[1]}
                </div>
                <div className="text-[11px] opacity-80 truncate">
                  {prop.type} | 매입: {prop.acquisitionDate}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-3 rounded-md border border-indigo-100 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-300 break-keep">
          <span className="font-bold block mb-0.5">
            [자산 특이사항 및 절세 포인트]
          </span>
          {currentProp.notes}
        </div>

        {/* Exact Wondang 1st District Contract Data Display */}
        {selectedIndex > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md border border-amber-200 dark:border-amber-900 space-y-1 text-xs">
            <div className="font-bold text-amber-800 dark:text-amber-400">
              [계약서 정밀 분석 - 원당1구역 59A 조합원 데이터 연동]
            </div>
            <ul className="list-disc list-inside text-amber-700 dark:text-amber-500 space-y-1">
              <li>
                <strong className="text-amber-900 dark:text-amber-300">
                  조합원 분양금액 (A):
                </strong>{" "}
                {formatKRW(WONDANG_MEMBER_PRICE)}
              </li>
              <li>
                <strong className="text-amber-900 dark:text-amber-300">
                  종전자산 권리가액 (B):
                </strong>{" "}
                {formatKRW(WONDANG_VALUATION)}
              </li>
              <li>
                <strong className="text-emerald-700 dark:text-emerald-400 font-bold">
                  확정 추가분담금 (A-B):
                </strong>{" "}
                {formatKRW(WONDANG_CONTRIBUTION)}
              </li>
            </ul>
            <div className="mt-2 p-2 bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-amber-800 text-[11px] text-slate-700 dark:text-slate-300 space-y-0.5">
              <span className="font-bold text-red-600 dark:text-red-400 block">
                [실거래가 대비 프리미엄(P) 역산]
              </span>
              인근 59A 실거래 총매가(약 5.1억~5.3억) - 조합원 분양가(4.22억)
              <br />
              👉{" "}
              <strong className="text-slate-900 dark:text-white">
                실제 시장 프리미엄(P): 약 8,570만 원 ~ 1억 1,048만 원 형성 중
              </strong>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* Interactive Inputs */}
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  매도 예상 금액 (총 매매가 기준)
                </label>
                <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                  {formatKRW(activeSellPrice)}
                </span>
              </div>
              <input
                type="range"
                min={currentProp.minSellPrice}
                max={currentProp.maxSellPrice}
                step={currentProp.step}
                value={activeSellPrice}
                onChange={(e) => setCustomSellPrice(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Reconstruction Additional Contribution */}
            {selectedIndex > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                    재개발 추가분담금 납부액 (필요경비 공제)
                  </label>
                  {selectedIndex === 1 && (
                    <span className="text-[10px] bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 px-1.5 py-0.5 rounded font-mono">
                      계약서 연동됨
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="10000000"
                  value={additionalContribution}
                  onChange={(e) =>
                    setAdditionalContribution(Number(e.target.value))
                  }
                  className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                />
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                  * 납부액은 세법상 전액 자본적 지출로 인정되어 세금을 대폭
                  줄여줍니다.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  초기 매입 가액
                </label>
                <input
                  type="number"
                  step="10000000"
                  value={activePurchasePrice}
                  onChange={(e) =>
                    setCustomPurchasePrice(Number(e.target.value))
                  }
                  className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  장기보유특별공제율 (%)
                </label>
                <input
                  type="number"
                  step="1"
                  value={Math.round(activeDeductionRate * 100)}
                  onChange={(e) =>
                    setCustomDeductionRate(Number(e.target.value) / 100)
                  }
                  className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  중개수수료 등
                </label>
                <input
                  type="number"
                  step="1000000"
                  value={brokerageFee}
                  onChange={(e) => setBrokerageFee(Number(e.target.value))}
                  className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  기타 수리비 등
                </label>
                <input
                  type="number"
                  step="1000000"
                  value={capitalExpenditure}
                  onChange={(e) =>
                    setCapitalExpenditure(Number(e.target.value))
                  }
                  className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="exemptionToggle"
                  checked={activeExemption}
                  onChange={(e) => setIsExemptionMet(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor="exemptionToggle"
                  className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer select-none"
                >
                  1세대 1주택 비과세 적용 (12억 이하 비과세)
                </label>
              </div>
            </div>
          </div>

          {/* Dynamic Formula & Summary */}
          <div className="flex flex-col space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  예상 양도소득세 합계
                </span>
                <span className="text-red-600 dark:text-red-400 font-bold font-mono text-sm md:text-base">
                  {formatKRW(simulationResult.tax)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  최종 회수 순현금
                </span>
                <span className="text-indigo-600 dark:text-indigo-400 font-extrabold font-mono text-base md:text-lg">
                  {formatKRW(simulationResult.finalCash)}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 text-right">
                * 순현금 = 매도가 - 총 양도세 - 추가분담금 원금
              </div>
            </div>

            {/* Formula display panel */}
            <details
              className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-mono text-xs overflow-hidden"
              open
            >
              <summary className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer outline-none flex justify-between items-center mb-2">
                <span>세부 세액 산출 공식</span>
                <span className="text-[10px] text-indigo-500 font-normal">
                  자세히 보기
                </span>
              </summary>
              <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                <div className="flex justify-between">
                  <span>양도가액</span>
                  <span>{formatKRW(activeSellPrice)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>- 취득가액</span>
                  <span>{formatKRW(activePurchasePrice)}</span>
                </div>

                {additionalContribution > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>- 추가분담금 (경비 공제)</span>
                    <span>{formatKRW(additionalContribution)}</span>
                  </div>
                )}

                <div className="flex justify-between text-red-500">
                  <span>- 일반 필요경비 합계</span>
                  <span>{formatKRW(brokerageFee + capitalExpenditure)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>= 양도차익</span>
                  <span>{formatKRW(details.capitalGains)}</span>
                </div>

                {activeExemption ? (
                  <div className="flex justify-between text-indigo-600">
                    <span>* 비과세 초과분 과세대상</span>
                    <span>{formatKRW(details.taxableGains)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-slate-400">
                    <span>* 전액 과세대상</span>
                    <span>{formatKRW(details.taxableGains)}</span>
                  </div>
                )}

                <div className="flex justify-between text-red-500">
                  <span>
                    - 장기보유공제 ({Math.round(activeDeductionRate * 100)}%)
                  </span>
                  <span>{formatKRW(details.deduction)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>- 기본공제 (연간)</span>
                  <span>{formatKRW(BASE_DEDUCTION)}</span>
                </div>

                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>= 과세표준</span>
                  <span>{formatKRW(details.taxBase)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                  <span>= 산출세액 (국세)</span>
                  <span>{formatKRW(details.baseTax)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>+ 지방소득세 (10%)</span>
                  <span>{formatKRW(details.localTax)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-slate-900 dark:text-slate-100 pt-1 border-t-2 border-slate-300 dark:border-slate-600">
                  <span>= 총 납부세액</span>
                  <span>{formatKRW(simulationResult.tax)}</span>
                </div>

                {/* Cash recovery breakdown summary */}
                <div className="bg-slate-100 dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 space-y-1 mt-2 text-[10px]">
                  <div className="font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-0.5">
                    [현금 흐름 정산]
                  </div>
                  <div className="flex justify-between">
                    <span>매도가액:</span>
                    <span>{formatKRW(activeSellPrice)}</span>
                  </div>
                  <div className="flex justify-between text-red-500">
                    <span>- 총 양도세 납부:</span>
                    <span>{formatKRW(simulationResult.tax)}</span>
                  </div>
                  {additionalContribution > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>- 분담금 원금 지출:</span>
                      <span>{formatKRW(additionalContribution)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-indigo-600 font-extrabold pt-1 border-t border-slate-200 dark:border-slate-700 text-[11px]">
                    <span>= 최종 손에 쥐는 현금:</span>
                    <span>{formatKRW(simulationResult.finalCash)}</span>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
