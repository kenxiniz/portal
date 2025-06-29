/* @/components/PropertyCardDynamic.tsx */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import KakaoMapButton from "./KakaoMapButton";
import { Building, MapPin, Landmark, ShieldAlert, Tag, Calendar, Wallet, Info } from 'lucide-react';

/* MyProperty 타입을 직접 정의합니다. (lib/api에서 가져와도 무방) */
type MyProperty = {
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

type Props = {
  property: MyProperty;
};

const getBuildingName = (address: string): string => {
  const match = address.match(/([가-힣A-Za-z0-9]+(아파트|빌라))/);
  return match ? match[0] : "건물명 미확인";
};

const fieldConfig = [
  { key: 'type', label: '구분', icon: Tag },
  { key: 'acquisitionDate', label: '소유권 이전일', icon: Calendar },
  { key: 'purchasePrice', label: '매입가', icon: Wallet },
  { key: 'officialPrice', label: '공시지가', icon: Landmark },
  { key: 'lastTransactionPrice', label: '최근 실거래가', icon: Wallet },
  { key: 'lastTransactionDate', label: '최근 거래일', icon: Calendar },
  { key: 'regulatedArea', label: '조정지역', icon: ShieldAlert },
  { key: 'notes', label: '비고', icon: Info },
] as const;

export default function PropertyCardDynamic({ property }: Props) {
  const address = property.address as string;

  const formatPrice = (value: number) => {
    if (!value) return '-';
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}억`;
    }
    return `${value.toLocaleString()}만`;
  };

  return (
    /* [수정] 카드 배경을 밝게 하고, 다크모드 색상 조정 */
    <Card className="w-full max-w-md transform transition-all duration-300 hover:shadow-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
    <CardHeader>
    <div className="flex justify-between items-start mb-2">
    <div className="flex items-center gap-3">
    <Building className="h-8 w-8 text-blue-500" />
    <div>
    <CardTitle className="text-xl font-bold">{getBuildingName(address)}</CardTitle>
    <CardDescription className="text-xs pt-1 flex items-center">
    <MapPin className="h-3 w-3 mr-1" />
    {address}
    </CardDescription>
    </div>
    </div>
    <KakaoMapButton address={address} />
    </div>
    </CardHeader>
    <CardContent>
    <Table>
    <TableBody>
    {fieldConfig.map(({ key, label, icon: Icon }) => {
      const value = property[key as keyof MyProperty];
      let displayValue: React.ReactNode;

      if (typeof value === 'boolean') {
        displayValue = value ? (
          <Badge variant="destructive">예</Badge>
        ) : (
        <Badge variant="secondary">아니오</Badge>
        );
      } else if (typeof value === 'number' && key.includes('Price')) {
        displayValue = <span className="font-mono">{formatPrice(value)}</span>;
      } else {
        displayValue = value ? String(value) : '-';
      }

      return (
        <TableRow key={key} className="dark:border-slate-700">
        <TableCell className="font-semibold w-1/3 p-2 text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {label}
        </div>
        </TableCell>
        <TableCell className="text-right p-2">{displayValue}</TableCell>
        </TableRow>
      );
    })}
    </TableBody>
    </Table>
    </CardContent>
    </Card>
  );
};
