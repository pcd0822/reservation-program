# 행사·청소·당번 예약 프로그램

학교에서 사용할 수 있는 **행사, 청소, 당번 예약** 웹 앱입니다.  
학생들이 날짜/시간을 선택해 신청하고, 관리자는 **구글 스프레드시트**로 신청 내역을 관리할 수 있습니다.

## 기능

1. **관리자 페이지**  
   - 구글 스프레드시트 **공유 링크**로 연결 (시트 공유 링크 붙여넣기)
   - 연결한 시트에 신청 데이터 자동 저장 (연결 시 시트를 서비스 계정 이메일과 **편집자**로 공유 필요)

2. **신청 단위**  
   - **주차(week)** / **날짜(day)** / **시간대(time)** 중 선택  
   - 캘린더처럼 시작일·종료일 또는 날짜·시간대로 일정 생성

3. **일정별 설정**  
   - 일정당 최대 신청 인원  
   - 설문처럼 **입력 항목** 추가 (글자, 숫자, 선택)

4. **같은 일정에 여러 역할/수업**  
   - 같은 날짜·시간에 제목만 다른 일정을 여러 개 생성 가능 (안내 문구 표시)

5. **신청 링크 & QR**  
   - 일정 생성 후 **신청 링크** 생성, **클립보드 복사**  
   - **QR 코드** 이미지 저장

6. **신청내역 관리**  
   - 일정별 신청 인원 표시, 마감 시 색상 구분  
   - 일정 클릭 시 신청자 목록 확인

7. **학생 신청**  
   - 관리자가 만든 입력 항목을 모두 입력한 뒤, 원하는 일정을 눌러 신청

8. **일정 관리 탭**  
   - 만든 일정 목록 관리, 구글 시트에는 일정별 신청 데이터 누적 저장

## 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. 데이터베이스 (PostgreSQL, 필수)

Netlify·로컬 모두 **SQLite는 사용하지 않습니다.** 서버리스에서는 **PostgreSQL** 연결이 필요합니다.

1. **[Neon](https://neon.tech)** (무료) 권장: 회원가입 후 **New Project** → 프로젝트 생성
2. 대시보드에서 **Connection string** 복사 (예: `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`)
3. `.env` 파일에 추가:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
```

4. 테이블 생성:

```bash
npx prisma generate
npx prisma db push
```

### 3. 환경 변수 & 구글 설정 (역할 구분)

**개발자(나)만 하는 일**

- Google Cloud Console에서 **서비스 계정**을 만들고 **JSON 키**를 다운로드합니다.
- 배포 환경(로컬 `.env` 또는 Netlify 환경 변수)에 **GOOGLE_SERVICE_ACCOUNT_KEY** 로 그 JSON 전체를 한 줄로 넣습니다.  
  → 이 작업은 **한 번만** 하면 되고, **개발자만** 하면 됩니다.

**다른 사람(사용자/관리자)이 하는 일**

- **Google Cloud나 JSON은 건드리지 않습니다.**
- 자신의 **구글 계정**으로 스프레드시트를 만든 뒤, 앱의 **시트 연결** 탭에서 그 시트의 **공유 링크**를 붙여넣습니다.
- 앱에 안내된 **서비스 계정 이메일**을 해당 시트의 **편집자**로 추가하면, 그 시트에 신청 데이터가 저장됩니다.

정리하면, JSON 설정은 개발자인 나만 하고, 사용자는 **자기 구글 시트만 만들고 → 편집자 권한에 서비스 계정 이메일만 추가**하면 됩니다.

```env
# 개발자가 .env 또는 Netlify에 한 번만 설정
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account", ...}
```

### 4. 개발 서버

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 으로 접속합니다.

## 사용 흐름

1. **처음 방문** → "새 예약 공간 만들기" → 관리자 링크 / 학생 링크 확인  
2. **관리자 링크**로 접속 → **시트 연결** 탭에서 구글 스프레드시트 **공유 링크** 붙여넣기 → 시트를 안내된 이메일로 **편집자** 공유  
3. **일정 만들기** 탭에서 주차/날짜/시간대 선택, 일정 추가, 입력 항목·최대 인원 설정 → "일정 생성 완료" → 신청 링크 복사 & QR 저장  
4. **학생 링크**를 학생에게 공유 → 학생이 입력 항목 작성 후 원하는 일정 클릭해 신청  
5. **신청내역 관리** / **일정 관리** 탭에서 확인 및 관리

## Netlify 배포 (GitHub 리포지터리 호스팅)

이 프로젝트는 **GitHub 리포지터리**를 **Netlify**에 연결해 호스팅하는 것을 기준으로 설정되어 있습니다.

### 1. GitHub에 코드 푸시

```bash
git remote add origin https://github.com/사용자명/리포지터리명.git
git add .
git commit -m "Initial commit"
git push -u origin main
```

### 2. Netlify에서 사이트 생성

1. [Netlify](https://www.netlify.com/) 로그인 후 **Add new site** → **Import an existing project**
2. **GitHub** 연결 후 위에서 푸시한 **리포지터리** 선택
3. 빌드 설정은 `netlify.toml`이 적용됩니다. 필요 시 다음만 확인:
   - **Build command:** `npm run build`
   - **Node version:** 18 (Netlify 대시보드에서 **Environment variables**에 `NODE_VERSION = 18` 설정 가능)

### 3. 환경 변수 설정 (필수)

Netlify 대시보드 → **Site settings** → **Environment variables** → **Add a variable**:

| 변수명 | 값 | 비고 |
|--------|-----|------|
| `DATABASE_URL` | Neon 등 PostgreSQL 연결 문자열 | **없으면 "DB 연결 확인" 오류 발생** |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | 서비스 계정 JSON 전체 (한 줄) | 구글 시트 연동 시 필수 |

- **DATABASE_URL**: [Neon](https://neon.tech)에서 프로젝트 생성 후 Connection string 복사해 넣기.
- 둘 다 시크릿이므로 **Encrypted**로 저장합니다.

배포 **전**에 로컬에서 한 번 실행해 두세요 (Neon에 테이블 생성):

```bash
# .env에 DATABASE_URL 넣은 뒤
npx prisma db push
```

### 4. 배포 후

- Netlify가 배포할 때마다 **자동 빌드** 후 배포됩니다.
- **관리자/학생 링크**는 `https://사이트주소.netlify.app/`, `https://사이트주소.netlify.app/a/xxx`, `https://사이트주소.netlify.app/s/xxx` 형태로 사용하면 됩니다.

---

## 기술 스택

- Next.js 14 (App Router), React, TypeScript  
- Tailwind CSS (파스텔·둥글고 귀여운 UI, 반응형)  
- Prisma + PostgreSQL (Neon 등, Netlify·로컬 공통)  
- Google Sheets API (서비스 계정)  
- QR 코드 생성 (qrcode)

## 라이선스

MIT
