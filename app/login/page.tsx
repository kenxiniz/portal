/* app/login/page.tsx */

"use client";

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

function LoginForm() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false); // 로딩 상태 추가
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      if (response.ok) {
        const callbackUrl = searchParams.get('callbackUrl') || '/';
        router.push(callbackUrl);
      } else {
        const data = await response.json();
        setError(data.error || 'API 키가 올바르지 않습니다.');
      }
    } catch (err) {
      console.error('Login request failed:', err);
      setError('로그인 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
    <CardHeader>
    <CardTitle className="text-2xl">로그인</CardTitle>
    <CardDescription>
    접근을 위해 API 키를 입력해주세요.
      </CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4">
    <Input
    id="apiKey"
    type="password"
    placeholder="API 키"
    value={apiKey}
    onChange={(e) => setApiKey(e.target.value)}
    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
    disabled={isLoading}
    />
    {error && <p className="text-sm text-red-500">{error}</p>}
    </CardContent>
    <CardFooter>
    <Button className="w-full" onClick={handleLogin} disabled={isLoading}>
    {isLoading ? '로그인 중...' : '입장'}
    </Button>
    </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
    <Suspense fallback={<div>Loading...</div>}>
    <LoginForm />
    </Suspense>
    </div>
  );
}
