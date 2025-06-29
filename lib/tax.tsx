/* @/lib/tax.tsx */

/* [수정] 모든 타입을 외부에서 import할 수 있도록 export 키워드를 추가합니다. */
export type Property = {
  type: string;
  acquisitionDate: string;
  purchasePrice: number;
  officialPrice: number;
  lastTransactionPrice: number;
  lastTransactionDate: string;
  notes: string;
  regulatedArea: boolean;
  sigunguCode: string;
  bjdCode: string;
  bonbun: string;
  bubun: string;
  address: string;
};

export type OwnerProperties = Record<string, Property[]>;

export type TaxResult = {
  owner: string;
  taxAmount: number;
  description: string;
  referenceAmount?: number;
};

export type PropertyTaxResult = {
  owner: string;
  taxAmount: number;
  educationTax: number;
  totalPayableAmount: number;
  description: string;
  referenceAmount?: number;
};

const getBuildingName = (address: string): string => {
  const match = address.match(/([가-힣A-Za-z0-9]+(아파트|빌라))/);
  return match ? match[0] : "건물명 미확인";
};

const getPropertyTaxFairMarketRatio = (officialPrice: number, isSingleHomeOwner: boolean): number => {
  if (!isSingleHomeOwner) {
    return 0.6;
  }
  const priceInWon = officialPrice;
  if (priceInWon <= 300_000_000) {
    return 0.43;
  } else if (priceInWon <= 600_000_000) {
    return 0.44;
  } else {
    return 0.45;
  }
};

const calculatePropertyTaxBracket = (officialPrice: number, fairMarketRatio: number, isSpecialRateApplicable: boolean): { taxBase: number; taxAmount: number; rate: number; deduction: number; rateType: string } => {
  const taxBase = officialPrice * fairMarketRatio;
  let rate = 0;
  let deduction = 0;
  let rateType = '일반세율';

  if (isSpecialRateApplicable) {
    rateType = '특례세율';
    if (taxBase <= 60_000_000) { rate = 0.0005; deduction = 0; }
    else if (taxBase <= 150_000_000) { rate = 0.0010; deduction = 30_000; }
    else if (taxBase <= 300_000_000) { rate = 0.0020; deduction = 180_000; }
    else { rate = 0.0035; deduction = 630_000; }
  } else {
    if (taxBase <= 60_000_000) { rate = 0.0010; deduction = 0; }
    else if (taxBase <= 150_000_000) { rate = 0.0015; deduction = 30_000; }
    else if (taxBase <= 300_000_000) { rate = 0.0025; deduction = 180_000; }
    else { rate = 0.0040; deduction = 630_000; }
  }
  const taxAmount = Math.floor(taxBase * rate - deduction);
  return { taxBase, taxAmount: Math.max(0, taxAmount), rate, deduction, rateType };
};

const calculateComprehensiveTaxByBracket = (taxBase: number, houseCount: number): { taxAmount: number; rate: number; deduction: number } => {
  let rate = 0;
  let deduction = 0;
  if (houseCount >= 3) {
    if (taxBase <= 300_000_000) { rate = 0.005; deduction = 0; }
    else if (taxBase <= 600_000_000) { rate = 0.007; deduction = 600_000; }
    else if (taxBase <= 1_200_000_000) { rate = 0.010; deduction = 2_400_000; }
    else if (taxBase <= 2_500_000_000) { rate = 0.020; deduction = 14_400_000; }
    else if (taxBase <= 5_000_000_000) { rate = 0.030; deduction = 39_400_000; }
    else if (taxBase <= 9_400_000_000) { rate = 0.040; deduction = 89_400_000; }
    else { rate = 0.050; deduction = 183_400_000; }
  } else {
    if (taxBase <= 300_000_000) { rate = 0.005; deduction = 0; }
    else if (taxBase <= 600_000_000) { rate = 0.007; deduction = 600_000; }
    else if (taxBase <= 1_200_000_000) { rate = 0.010; deduction = 2_400_000; }
    else if (taxBase <= 2_500_000_000) { rate = 0.013; deduction = 6_000_000; }
    else if (taxBase <= 5_000_000_000) { rate = 0.015; deduction = 11_000_000; }
    else if (taxBase <= 9_400_000_000) { rate = 0.020; deduction = 36_000_000; }
    else { rate = 0.027; deduction = 101_800_000; }
  }
  const taxAmount = Math.floor(taxBase * rate - deduction);
  return { taxAmount: Math.max(0, taxAmount), rate, deduction };
};

const getTaxableProperties = (properties: Property[]) => {
  const log: string[] = [];
  const taxable = properties.filter((p) => {
    if (p.notes.includes("민간임대사업자")) {
      if (!p.regulatedArea) {
        log.push(`${getBuildingName(p.address)} (비규제 민간임대) → 합산배제`);
        return false;
      }
      log.push(`${getBuildingName(p.address)} (규제지역 민간임대) → 과세대상`);
      return true;
    }
    log.push(`${getBuildingName(p.address)} → 과세대상`);
    return true;
  });
  return { taxable, log };
};

export function calculatePropertyTax(allData: OwnerProperties): PropertyTaxResult[] {
  const results: PropertyTaxResult[] = [];
  for (const owner in allData) {
    const properties = allData[owner];
    const { taxable } = getTaxableProperties(properties);
    const isSingleTaxableHomeOwner = taxable.length === 1;
    let totalTaxAmount = 0;
    let totalEducationTax = 0;
    const descParts: string[] = [];
    let referenceAmount: number | undefined = undefined;

    descParts.push(`[${owner}]님은 과세대상 주택 ${taxable.length}채를 보유하여 ${isSingleTaxableHomeOwner ? '1세대 1주택자' : '다주택자'}입니다.`);
    properties.forEach(p => {
      const officialPrice = p.officialPrice * 10000;
      const fairMarketRatio = getPropertyTaxFairMarketRatio(officialPrice, isSingleTaxableHomeOwner);
      const isSpecialRateApplicable = isSingleTaxableHomeOwner && officialPrice <= 900_000_000;
      const { taxBase, taxAmount, rate, deduction, rateType } = calculatePropertyTaxBracket(officialPrice, fairMarketRatio, isSpecialRateApplicable);
      totalTaxAmount += taxAmount;
      const educationTaxPerProperty = Math.floor(taxAmount * 0.2);
      totalEducationTax += educationTaxPerProperty;
      descParts.push(`\n- ${getBuildingName(p.address)} (공시지가: ${officialPrice.toLocaleString()}원)`);
      descParts.push(`  공정시장가액비율: ${fairMarketRatio * 100}%`);
      descParts.push(`  과세표준: ${Math.floor(taxBase).toLocaleString()}원`);
      descParts.push(`  세율(${rateType}): ${(rate * 100).toFixed(2)}%, 누진공제: ${deduction.toLocaleString()}원`);
      descParts.push(`  → 재산세: ${taxAmount.toLocaleString()}원`);
      descParts.push(`  → 지방교육세: ${educationTaxPerProperty.toLocaleString()}원`);
    });

    const totalPayableAmount = totalTaxAmount + totalEducationTax;

    if (properties.length > taxable.length) {
      const isSingleHomeOwnerForAll = properties.length === 1;
      let totalTaxAmountForAll = 0;
      properties.forEach(p => {
        const officialPrice = p.officialPrice * 10000;
        const fairMarketRatio = getPropertyTaxFairMarketRatio(officialPrice, isSingleHomeOwnerForAll);
        const isSpecialRateApplicable = isSingleHomeOwnerForAll && officialPrice <= 900_000_000;
        const { taxAmount } = calculatePropertyTaxBracket(officialPrice, fairMarketRatio, isSpecialRateApplicable);
        totalTaxAmountForAll += taxAmount;
      });
      const educationTaxForAll = Math.floor(totalTaxAmountForAll * 0.2);
      const totalPayableAmountForAll = totalTaxAmountForAll + educationTaxForAll;

      if (totalPayableAmountForAll !== totalPayableAmount) {
        referenceAmount = totalPayableAmountForAll;
      }
    }

    results.push({
      owner,
      taxAmount: totalTaxAmount,
      educationTax: totalEducationTax,
      totalPayableAmount: totalPayableAmount,
      description: descParts.join('\n'),
      referenceAmount,
    });
  }
  return results;
}

export function calculateComprehensiveRealEstateTax(allData: OwnerProperties): TaxResult[] {
  const results: TaxResult[] = [];
  const comprehensiveFairMarketRatio = 0.6;
  const multiHomeDeduction = 900000000;
  const singleHomeDeduction = 1200000000;
  const ruralSpecialTaxRate = 0.2;

  for (const owner in allData) {
    const properties = allData[owner];
    const { taxable, log } = getTaxableProperties(properties);
    const houseCount = taxable.length;
    const descParts = [...log];
    let referenceAmount: number | undefined = undefined;

    if (houseCount === 0) {
      results.push({ owner, taxAmount: 0, description: "과세 대상 주택이 없습니다." });
      continue;
    }

    const deductionAmount = houseCount === 1 ? singleHomeDeduction : multiHomeDeduction;
    const deductionType = houseCount === 1 ? "1주택자 공제" : "기본 공제";
    const totalOfficialPrice = taxable.reduce((sum, p) => sum + p.officialPrice * 10000, 0);

    descParts.push("\n[계산 상세]");
    taxable.forEach(p => {
      descParts.push(`- ${getBuildingName(p.address)}: ${p.officialPrice.toLocaleString()}만원`);
    });
    descParts.push(`\n공시지가 합계: ${totalOfficialPrice.toLocaleString()}원`);

    const priceAfterDeduction = Math.max(0, totalOfficialPrice - deductionAmount);
    descParts.push(`${deductionType}: ${deductionAmount.toLocaleString()}원`);
    descParts.push(`→ (공시지가 합계 - 공제): ${priceAfterDeduction.toLocaleString()}원`);

    const comprehensiveTaxBase = priceAfterDeduction * comprehensiveFairMarketRatio;
    descParts.push(`공정시장가액비율 적용: ${priceAfterDeduction.toLocaleString()}원 × ${comprehensiveFairMarketRatio * 100}%`);
    descParts.push(`→ 종부세 과세표준: ${Math.floor(comprehensiveTaxBase).toLocaleString()}원`);

    const { taxAmount: initialComprehensiveTax } = calculateComprehensiveTaxByBracket(comprehensiveTaxBase, houseCount);
    descParts.push(`→ 종부세 산출세액: ${initialComprehensiveTax.toLocaleString()}원`);

    const isSingleTaxableHomeOwner = taxable.length === 1;
    const totalOfficialPriceForTaxable = taxable.reduce((sum,p) => sum + p.officialPrice*10000, 0);
    const propertyTaxFairMarketRatioForDeduction = getPropertyTaxFairMarketRatio(totalOfficialPriceForTaxable, isSingleTaxableHomeOwner);
    const propertyTaxRateForDeduction = 0.004;
    const propertyTaxDeduction = Math.floor(comprehensiveTaxBase * propertyTaxFairMarketRatioForDeduction * propertyTaxRateForDeduction);

    descParts.push(`\n공제할 재산세액 (중복분): ${propertyTaxDeduction.toLocaleString()}원`);
    const formulaDesc = [
      `  = (종부세 과세표준) × (재산세 공정시장가액비율) × (재산세율)`,
        `  = ${Math.floor(comprehensiveTaxBase).toLocaleString()}원 × ${propertyTaxFairMarketRatioForDeduction * 100}% × ${propertyTaxRateForDeduction * 100}%`
    ].join('\n');
    descParts.push(formulaDesc);

    const finalComprehensiveTax = Math.max(0, initialComprehensiveTax - propertyTaxDeduction);
    descParts.push(`\n→ 차감 후 종부세: ${finalComprehensiveTax.toLocaleString()}원`);

    const ruralSpecialTax = Math.floor(finalComprehensiveTax * ruralSpecialTaxRate);
    descParts.push(`농어촌특별세 (종부세의 20%): ${ruralSpecialTax.toLocaleString()}원`);

    const totalTaxAmount = finalComprehensiveTax + ruralSpecialTax;

    if (properties.length > taxable.length) {
      const houseCountForAll = properties.length;
      const deductionAmountForAll = houseCountForAll === 1 ? singleHomeDeduction : multiHomeDeduction;
      const totalOfficialPriceForAll = properties.reduce((sum, p) => sum + p.officialPrice * 10000, 0);
      const priceAfterDeductionForAll = Math.max(0, totalOfficialPriceForAll - deductionAmountForAll);
      const comprehensiveTaxBaseForAll = priceAfterDeductionForAll * comprehensiveFairMarketRatio;
      const { taxAmount: initialComprehensiveTaxForAll } = calculateComprehensiveTaxByBracket(comprehensiveTaxBaseForAll, houseCountForAll);

      const isSingleTaxableHomeOwnerForAll = properties.length === 1;
      const totalOfficialPriceForTaxableForAll = properties.reduce((sum,p) => sum + p.officialPrice*10000, 0);
      const propertyTaxFairMarketRatioForDeductionForAll = getPropertyTaxFairMarketRatio(totalOfficialPriceForTaxableForAll, isSingleTaxableHomeOwnerForAll);
      const propertyTaxDeductionForAll = Math.floor(comprehensiveTaxBaseForAll * propertyTaxFairMarketRatioForDeductionForAll * propertyTaxRateForDeduction);
      const finalComprehensiveTaxForAll = Math.max(0, initialComprehensiveTaxForAll - propertyTaxDeductionForAll);
      const ruralSpecialTaxForAll = Math.floor(finalComprehensiveTaxForAll * ruralSpecialTaxRate);
      const totalTaxAmountForAll = finalComprehensiveTaxForAll + ruralSpecialTaxForAll;

      if (totalTaxAmountForAll !== totalTaxAmount) {
        referenceAmount = totalTaxAmountForAll;
      }
    }

    results.push({
      owner,
      taxAmount: totalTaxAmount,
      description: descParts.join('\n'),
      referenceAmount,
    });
  }
  return results;
}
