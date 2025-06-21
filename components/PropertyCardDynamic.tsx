import KakaoMapButton from "./KakaoMapButton";

type Props = { property: Record<string, unknown> };

const fieldLabels: Record<string, string> = {
  type: "구분",
  acquisitionDate: "소유권 이전일",
  purchasePrice: "매입가 (만원)",
  officialPrice: "공시지가 (만원)",
  lastTransactionPrice: "실거래가 (만원)",
  lastTransactionDate: "최근 거래일",
  notes: "비고",
  regulatedArea: "조정지역",
  extraField: "추가 정보"
};

const hiddenFields = ["sigunguCode", "bjdCode", "bonbun", "bubun", "address"];

const getBuildingName = (address: string): string => {
  const match = address.match(/([가-힣A-Za-z0-9]+(아파트|빌라))/);
  return match ? match[0] : "건물명 미확인";
};

export default function PropertyCardDynamic({ property }: Props) {
  const address = property.address as string;

  return (
    <div className="bg-gray-800 dark:bg-gray-900 shadow-lg rounded-lg p-5 border border-gray-700 text-white min-w-[300px] max-w-[320px] font-['Malgun_Gothic'] text-[9pt]">
      <h2 className="text-lg font-semibold text-indigo-400 mb-4 text-center">
        {getBuildingName(address)}
      </h2>

      <div className="flex justify-center mb-4">
        <KakaoMapButton address={address} />
      </div>

      <table className="text-sm text-left text-gray-300 mx-auto w-full table-fixed">
        <tbody>
          {Object.entries(property).map(([key, value]) => {
            if (hiddenFields.includes(key)) return null;

            const label = fieldLabels[key] || key;

            let displayValue = value as string | number;
            if (typeof value === "boolean") {
              displayValue = value ? '✅ 예' : '❌ 아니오';
            }
            if (typeof value === "number" && key.includes("Price")) {
              displayValue = value.toLocaleString() + " 만원";
            }

            return (
              <tr key={key}>
                <th className="pr-2 py-1 font-medium text-gray-400 text-left align-top w-1/3 whitespace-nowrap">
                  {label}
                </th>
                <td className="py-1 text-left whitespace-nowrap">
                  {displayValue}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

