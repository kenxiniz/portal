"use client";

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow, TableFooter } from "@/components/ui/table";

interface CostData {
  month: string;
  total: number;
  services: {
    [serviceName: string]: {
      total: number;
      details: {
        usageType: string;
        amount: number;
      }[];
    };
  };
}

interface Props {
  initialData: CostData[];
}

export function AwsCostClientUI({ initialData }: Props) {

  const annualTotal = useMemo(() => {
    return initialData.reduce((acc, month) => acc + month.total, 0);
  }, [initialData]);

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-8">
    AWS 월별 사용 요금
    </h1>

    <Card className="w-full max-w-4xl">
    <CardHeader>
    <CardTitle>상세 비용 내역 (USD)</CardTitle>
    <CardDescription>연초부터 현재까지의 월별, 서비스별 상세 사용 내역입니다.</CardDescription>
    </CardHeader>
    <CardContent>
    <Table>
    <TableHeader>
    <TableRow>
    <TableHead className="w-[120px]">월</TableHead>
    <TableHead>서비스</TableHead>
    <TableHead>세부 항목</TableHead>
    <TableHead className="text-right">비용</TableHead>
    </TableRow>
    </TableHeader>
    <TableBody>
    {initialData.map((monthData) => (
      Object.entries(monthData.services).map(([serviceName, serviceData], serviceIndex) => (
        serviceData.details.map((detail, detailIndex) => (
          <TableRow key={`${monthData.month}-${serviceName}-${detailIndex}`}>
          {serviceIndex === 0 && detailIndex === 0 && (
            <TableCell rowSpan={Object.values(monthData.services).reduce((acc, s) => acc + s.details.length, 0)} className="font-bold align-top">
            {monthData.month}
            </TableCell>
          )}
          {detailIndex === 0 && (
            <TableCell rowSpan={serviceData.details.length} className="font-medium align-top">
            {serviceName}
            </TableCell>
          )}
          <TableCell className="text-muted-foreground">{detail.usageType}</TableCell>
          <TableCell className="text-right">${detail.amount.toFixed(2)}</TableCell>
          </TableRow>
        ))
      ))
    ))}
    </TableBody>
    <TableFooter>
    <TableRow className="bg-slate-100 dark:bg-slate-800 text-lg">
    <TableHead colSpan={3} className="font-bold">연간 총계</TableHead>
    <TableHead className="text-right font-bold">${annualTotal.toFixed(2)}</TableHead>
    </TableRow>
    </TableFooter>
    </Table>
    </CardContent>
    </Card>
    </div>
  );
}
