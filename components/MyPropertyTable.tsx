"use client";

import { MyProperty } from "@/lib/api";
import { ColumnDef, useReactTable, getCoreRowModel, flexRender, getSortedRowModel, SortingState } from "@tanstack/react-table";
import { useState } from "react";

type Props = { data: MyProperty[] };

export default function MyPropertyTable({ data }: Props) {
  const [sort, setSort] = useState<SortingState>([]);

  const columns: ColumnDef<MyProperty>[] = [
    { accessorKey: "type", header: "구분" },
    {
      accessorKey: "address",
      header: "주소지 (지도)",
      cell: info => (
        <button
          className="text-blue-500 underline"
          onClick={(e) => {
            e.stopPropagation();
            const address = info.getValue() as string;
            window.open(`https://map.kakao.com/?q=${encodeURIComponent(address)}`, "_blank");
          }}
        >
	  {String(info.getValue())} {/* ✅ 또는 as string */}
        </button>
      )
    },
    { accessorKey: "acquisitionDate", header: "소유권 이전일" },
    { accessorKey: "purchasePrice", header: "매입가 (만원)" },
    { accessorKey: "officialPrice", header: "공시지가 (만원)" },
    { accessorKey: "lastTransactionDate", header: "최근 거래일" },
    { accessorKey: "lastTransactionPrice", header: "실거래가 (만원)" },
    {
      accessorKey: "regulatedArea",
      header: "조정지역",
      cell: info => info.getValue() ? <span className="text-red-500 font-bold">✅</span> : "❌"
    },
    { accessorKey: "notes", header: "비고" }
  ];

  const table = useReactTable({
    data,
    columns,
    state: { sorting: sort },
    onSortingChange: setSort,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="w-full overflow-x-auto shadow-md rounded-lg border border-gray-200">
      <table className="min-w-max text-sm text-gray-800 bg-white rounded-lg mb-6">
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id} className="bg-gray-600 text-white">
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  className="p-3 text-center cursor-pointer select-none"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{
                    asc: " 🔼",
                    desc: " 🔽"
                  }[header.column.getIsSorted() as string] ?? null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr
              key={row.id}
              className="border-b border-gray-200 hover:bg-gray-100 transition-colors duration-150 cursor-pointer"
            >
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="p-3 align-middle text-left">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

