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
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = () => {
    /* [추가] 디버깅을 위해 환경 변수의 실제 값을 콘솔에 출력합니다. */
    console.log("Input Key:", apiKey);
    console.log("Env Key:", process.env.NEXT_PUBLIC_ACCESS_API_KEY);

    if (apiKey === process.env.NEXT_PUBLIC_ACCESS_API_KEY) {
      const expires = new Date(Date.now() + 864e5).toUTCString();
      document.cookie = `${process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME}=true; expires=${expires}; path=/`;

      const callbackUrl = searchParams.get('callbackUrl') || '/';
      router.push(callbackUrl);
    } else {
      setError('API 키가 올바르지 않습니다.');
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
    />
    {error && <p className="text-sm text-red-500">{error}</p>}
    </CardContent>
    <CardFooter>
    <Button className="w-full" onClick={handleLogin}>
    입장
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
