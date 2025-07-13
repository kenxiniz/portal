/* app/api/friends/route.ts */

import { NextResponse } from 'next/server';
import axios, { AxiosError } from 'axios';

/* 사용자 정보와 친구 정보의 타입을 정의합니다. */
interface UserProfile {
  id: number;
  uuid?: string; /* uuid는 친구 목록에만 존재할 수 있습니다. */
  profile_nickname: string;
  profile_thumbnail_image: string;
  favorite?: boolean;
}

export async function GET() {
  const KAKAO_ACCESS_TOKEN = process.env.KAKAO_ACCESS_TOKEN;

  if (!KAKAO_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: '카카오 Access Token이 설정되지 않았습니다. .env 파일을 확인하세요.' },
      { status: 400 }
    );
  }

  const headers = {
    'Authorization': `Bearer ${KAKAO_ACCESS_TOKEN}`,
  };

  try {
    /* --- 1. 본인 정보 가져오기 --- */
    const meResponse = await axios.get('https://kapi.kakao.com/v2/user/me', { headers });

    /* ✅ [수정] 카카오 API 응답 구조 변경에 따라 올바른 경로에서 프로필 정보를 가져옵니다. */
    /* optional chaining(?.)을 사용하여 profile 객체가 없는 경우에도 오류가 발생하지 않도록 합니다. */
    const me: UserProfile = {
      id: meResponse.data.id,
      profile_nickname: meResponse.data.kakao_account?.profile?.nickname || '이름 없음',
      profile_thumbnail_image: meResponse.data.kakao_account?.profile?.thumbnail_image_url || '',
      favorite: true, /* 본인은 항상 즐겨찾기처럼 최상단에 표시 */
    };

    /* --- 2. 친구 목록 가져오기 --- */
    const friendsResponse = await axios.get('https://kapi.kakao.com/v1/api/talk/friends', { headers });
    const friends: UserProfile[] = friendsResponse.data.elements;

    /* 본인 정보에 친구 목록에만 있는 uuid를 찾아 추가합니다. */
    const myFriendProfile = friends.find(friend => friend.id === me.id);
    if (myFriendProfile) {
      me.uuid = myFriendProfile.uuid;
    }

    /* 최종 목록에 본인 정보를 가장 앞에 추가합니다. */
    const combinedList = [me, ...friends];

    /* 친구 목록이 비어있을 경우 안내 페이지를 보여줍니다. */
    if (combinedList.length === 1 && friends.length === 0) {
      const emptyHtmlResponse = `
      <div style="font-family: sans-serif; padding: 2em;">
      <h1>내 정보만 조회되었습니다.</h1>
      <p>친구에게 알림을 보내려면, 친구가 이 앱에 로그인하여 정보 제공에 동의해야 합니다.</p>
      <pre style="background-color: #f0f0f0; padding: 1em; border-radius: 5px;">${JSON.stringify([me], null, 2)}</pre>
      </div>`;
      return new NextResponse(emptyHtmlResponse, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const htmlResponse = `
    <h1>친구 목록 조회 성공</h1>
    <p>메시지를 보낼 친구의 UUID(uuid) 값을 복사하여 .env 파일의 KAKAO_FRIEND_UUIDS 변수에 추가하세요.</p>
    <pre style="background-color: #f0f0f0; padding: 1em; border-radius: 5px;">${JSON.stringify(combinedList, null, 2)}</pre>
    `;

    return new NextResponse(htmlResponse, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (error) {
    const axiosError = error as AxiosError<{ msg?: string, code?: number }>;
    console.error("친구 목록 조회 실패:", axiosError.response?.data || axiosError.message);
    return NextResponse.json(
      { error: '친구 목록 조회에 실패했습니다.', details: axiosError.response?.data },
      { status: 500 }
    );
  }
}
