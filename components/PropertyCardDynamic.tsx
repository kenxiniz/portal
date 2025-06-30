/* @/components/PropertyCardDynamic.tsx */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import KakaoMapButton from "./KakaoMapButton";
import { Building, MapPin, Landmark, ShieldAlert, Tag, Calendar, Wallet, Info, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Property } from "@/lib/tax"; // lib/tax.tsx에서 타입을 가져옵니다.

type Props = {
  property: Property;
};

const getBuildingName = (address: string): string => {
  const match = address.match(/([가-힣A-Za-z0-9]+(아파트|빌라))/);
  return match ? match[0] : "건물명 미확인";
};

const getStreetAddress = (address: string): string => {
  const match = address.split(/([가-힣A-Za-z0-9]+(아파트|빌라))/);
  return match && match[0] ? match[0].trim() : address;
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
  const streetAddress = getStreetAddress(address);

  const formatPrice = (value: number) => {
    if (!value) return '-';
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}억`;
    }
    return `${value.toLocaleString()}만`;
  };

  return (
    /* [수정] Card 대신 Collapsible을 최상위로 사용합니다. */
    <Collapsible className="w-full max-w-md">
    <Card className="w-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
    {/* 항상 보이는 헤더 부분 */}
    <CollapsibleTrigger className="w-full">
    <CardHeader className="flex flex-row justify-between items-center text-left">
    <div className="flex items-center gap-3">
    <Building className="h-8 w-8 text-blue-500" />
    <div>
    <CardTitle className="text-xl font-bold">{getBuildingName(address)}</CardTitle>
    <CardDescription className="text-xs text-gray-500 dark:text-gray-400 pt-1 flex items-center">
    <MapPin className="h-3 w-3 mr-1" />
    {streetAddress}
    </CardDescription>
    </div>
    </div>
    <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 [&[data-state=open]]:-rotate-180" />
    </CardHeader>
    </CollapsibleTrigger>

    {/* 펼쳤을 때 보이는 상세 정보 */}
    <CollapsibleContent>
    <CardContent className="pt-0">
    {/* 지도 버튼은 상세 정보에 포함 */}
    <div className="flex justify-end mb-2">
    <KakaoMapButton address={address} />
    </div>
    <Table>
    <TableBody>
    {fieldConfig.map(({ key, label, icon: Icon }) => {
      const value = property[key as keyof Property];
      let displayValue: React.ReactNode;

      if (typeof value === 'boolean') {
        displayValue = value ? <Badge variant="destructive">예</Badge> : <Badge variant="secondary">아니오</Badge>;
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
    </CollapsibleContent>
    </Card>
    </Collapsible>
  );
};
