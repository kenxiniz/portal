/* app/api/start-scheduler/route.ts */

import '@/lib/scheduler'; // 스케줄러를 임포트하여 실행
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'Scheduler started' });
}
