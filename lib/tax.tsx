type Property = {
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

type OwnerProperties = Record<string, Property[]>;

type TaxResult = {
  owner: string;
  taxAmount: number;
  description: string;
};

const getBuildingName = (address: string): string => {
  const match = address.match(/([가-힣A-Za-z0-9]+(아파트|빌라))/);
  return match ? match[0] : "건물명 미확인";
};

/**
 * 과세표준과 주택 수에 따라 세율과 누진공제액을 결정하고 세액을 계산합니다.
 * @param taxBase - 과세표준 금액
 * @param houseCount - 과세 대상 주택 수
 * @returns { taxAmount: number, rate: number, deduction: number }
 **/
const calculateTaxByBracket = (taxBase: number, houseCount: number): { taxAmount: number; rate: number; deduction: number } => {
  let rate = 0;
  let deduction = 0;

  if (houseCount >= 3) {
    /* 3주택 이상 세율 적용 */
    if (taxBase <= 300_000_000) { rate = 0.005; deduction = 0; }
    else if (taxBase <= 600_000_000) { rate = 0.007; deduction = 600_000; }
    else if (taxBase <= 1_200_000_000) { rate = 0.010; deduction = 2_400_000; }
    else if (taxBase <= 2_500_000_000) { rate = 0.020; deduction = 14_400_000; }
    else if (taxBase <= 5_000_000_000) { rate = 0.030; deduction = 39_400_000; }
    else if (taxBase <= 9_400_000_000) { rate = 0.040; deduction = 89_400_000; }
    else { rate = 0.050; deduction = 183_400_000; }
  } else {
    /* 2주택 이하 세율 적용 */
    if (taxBase <= 300_000_000) { rate = 0.005; deduction = 0; }
    else if (taxBase <= 600_000_000) { rate = 0.007; deduction = 600_000; }
    else if (taxBase <= 1_200_000_000) { rate = 0.010; deduction = 2_400_000; }
    else if (taxBase <= 2_500_000_000) { rate = 0.013; deduction = 6_000_000; }
    else if (taxBase <= 5_000_000_000) { rate = 0.015; deduction = 11_000_000; }
    else if (taxBase <= 9_400_000_000) { rate = 0.020; deduction = 36_000_000; }
    else { rate = 0.027; deduction = 101_800_000; }
  }

  const taxAmount = Math.floor((taxBase * rate) - deduction);
  return { taxAmount: Math.max(0, taxAmount), rate, deduction };
};


export function calculateComprehensiveRealEstateTax(allData: OwnerProperties): TaxResult[] {
  const results: TaxResult[] = [];
  const fairMarketRatio = 0.6; // 공정시장가액비율
  const generalDeduction = 900000000; // 기본 공제 9억원

  for (const owner in allData) {
    const properties = allData[owner];
    const descParts: string[] = [];

    const taxableProperties = properties.filter((p) => {
      if (p.notes.includes("민간임대사업자")) {
        if (!p.regulatedArea) {
          descParts.push(`${getBuildingName(p.address)} (비규제지역 민간임대) → 합산배제`);
          return false;
        }
        descParts.push(`${getBuildingName(p.address)} (규제지역 민간임대) → 과세대상`);
        return true;
      }
      descParts.push(`${getBuildingName(p.address)} → 과세대상`);
      return true;
    });

    const houseCount = taxableProperties.length;
    if (houseCount === 0) {
      results.push({
        owner,
        taxAmount: 0,
        description: "과세 대상 주택이 없습니다."
      });
      continue; // 다음 소유자로 넘어감
    }

    const totalOfficialPrice = taxableProperties.reduce((sum, p) => sum + p.officialPrice * 10000, 0);

    descParts.push("\n[계산 상세]");
    taxableProperties.forEach(p => {
      descParts.push(` - ${getBuildingName(p.address)}: ${p.officialPrice.toLocaleString()}만원`);
    });
    descParts.push(`\n공시지가 합계: ${totalOfficialPrice.toLocaleString()}원`);

    const priceAfterDeduction = Math.max(0, totalOfficialPrice - generalDeduction);
    descParts.push(`기본 공제: ${generalDeduction.toLocaleString()}원`);
    descParts.push(`→ (공시지가 합계 - 기본 공제): ${priceAfterDeduction.toLocaleString()}원`);

    const taxBase = priceAfterDeduction * fairMarketRatio;
    descParts.push(`공정시장가액비율 적용: ${priceAfterDeduction.toLocaleString()}원 × ${fairMarketRatio * 100}%`);
    descParts.push(`→ 과세표준: ${Math.floor(taxBase).toLocaleString()}원`);

    const { taxAmount, rate, deduction } = calculateTaxByBracket(taxBase, houseCount);
    descParts.push(`\n과세대상 ${houseCount}주택, ${houseCount >= 3 ? '3주택 이상' : '2주택 이하'} 세율 적용`);
    descParts.push(`세율: ${parseFloat((rate * 100).toPrecision(15))}%, 누진공제: ${deduction.toLocaleString()}원`);
    descParts.push(`→ 최종 세액: ${taxAmount.toLocaleString()}원`);

    results.push({
      owner,
      taxAmount,
      description: descParts.join('\n')
    });
  }

  return results;
}
