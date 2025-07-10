/* app/get-token/page.tsx */

"use client";

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function GetTokenPage() {
  const KAKAO_CLIENT_ID = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
  const KAKAO_REDIRECT_URI = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;

  if (!KAKAO_CLIENT_ID || !KAKAO_REDIRECT_URI) {
    return (
      <div className="flex items-center justify-center min-h-screen">
      <p className="text-red-500">
      환경 변수(NEXT_PUBLIC_KAKAO_CLIENT_ID, NEXT_PUBLIC_KAKAO_REDIRECT_URI)가 설정되지 않았습니다.
        </p>
      </div>
    );
  }

  /* [수정] scope에 'friends' 권한을 추가합니다. */
  const kakaoLoginUrl = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${KAKAO_CLIENT_ID}&redirect_uri=${KAKAO_REDIRECT_URI}&scope=talk_message,friends`;

    const handleLogin = () => {
    window.location.href = kakaoLoginUrl;
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
    <Card className="w-full max-w-sm">
    <CardHeader>
    <CardTitle className="text-2xl">개발자 토큰 발급</CardTitle>
    <CardDescription>
    {/* [수정] 따옴표를 &apos;로 변경 */}
    스케줄러에서 사용할 카카오톡 &apos;친구에게 보내기&apos; 토큰을 발급받습니다.
      </CardDescription>
    </CardHeader>
    <CardContent>
    <p className="text-sm text-gray-600 dark:text-gray-400">
    {/* [수정] 따옴표를 &apos;로 변경 */}
    새로운 &apos;친구 목록&apos; 권한을 얻기 위해 아래 버튼을 눌러 다시 로그인해주세요.
      </p>
    </CardContent>
    <CardFooter>
    <Button className="w-full" onClick={handleLogin}>
    카카오 로그인하여 토큰 받기
    </Button>
    </CardFooter>
    </Card>
    </div>
  );
}
