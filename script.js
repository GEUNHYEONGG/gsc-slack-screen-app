/* =========================
강의실 예약 시스템 JS
이 파일은 HTML 화면에 기능을 붙이는 역할
- 버튼 클릭 처리
- 구글 캘린더 예약 불러오기
- 예약표 만들기
- 현재 예약 상태 표시
- 예약 상세 팝업 열기/닫기
========================= */

/* --- 설정 영역 --- */

// 구글 캘린더 API를 사용하기 위한 키
// 깃허브에 올릴 때 실제 키를 공개하면 안 됨
const API_KEY = '';

// 구글 캘린더 ID와 강의실 번호를 연결하는 객체
// 예: 첫 번째 캘린더에서 가져온 예약은 301호 예약으로 처리
const CALENDAR_MAP = {
    '434a85c7be660f180486d88d6362ff5468fe73ec5a3da754eff72fa0592506c8@group.calendar.google.com': '301',
    '6be7b63f943dcc68ec839197f0a9b5a4d378637dc5700bd579ec5e03dae2cb9a@group.calendar.google.com': '405'
};

/* --- 전역 변수 --- */

// 예약 데이터를 저장하는 객체
// 구조 예시:
// reservationData["2026-05-06"]["301"] = [예약1, 예약2]
let reservationData = {};

// 현재 화면에서 보고 있는 날짜
let currentDate = new Date();

// 현재 선택된 강의실
// 처음 화면은 301호로 시작
let currentRoom = "301";

// 전체 예약표 보기 상태
// false: 현재 시간부터 3시간만 보기
// true: 09:00~24:00 전체 보기
let isShowAll = false;

/* --- 날짜를 key 형태로 바꾸는 함수 --- */

function getDateKey(date) {
    // Date 객체를 "2026-05-06" 같은 문자열로 바꿈
    // 이 문자열을 reservationData의 key로 사용
    return date.toISOString().slice(0, 10);
}

/* --- 상태 저장 함수 --- */

function saveState() {
    // localStorage는 브라우저에 값을 저장하는 공간
    // 새로고침해도 값이 남아 있음

    // 현재 날짜 저장
    localStorage.setItem("currentDate", currentDate.toISOString());

    // 현재 선택된 강의실 저장
    localStorage.setItem("currentRoom", currentRoom);

    // 전체보기 상태 저장
    localStorage.setItem("isShowAll", isShowAll);
}

/* --- 상태 불러오기 함수 --- */

function loadState() {
    // localStorage에 저장된 값을 꺼냄
    const d = localStorage.getItem("currentDate");
    const r = localStorage.getItem("currentRoom");
    const s = localStorage.getItem("isShowAll");

    // 저장된 날짜가 있으면 currentDate에 다시 넣음
    if (d) currentDate = new Date(d);

    // 저장된 방이 301 또는 405일 때만 currentRoom에 넣음
    // 이상한 값이 들어가는 것을 방지
    if (r === "301" || r === "405") currentRoom = r;

    // localStorage에는 true/false가 문자열로 저장됨
    // 그래서 "true"인지 비교해서 다시 boolean으로 바꿈
    if (s !== null) isShowAll = s === "true";
}

/* --- 구글 API 로드 완료 후 실행되는 함수 --- */

function gapiLoaded() {
    // gapi.load는 구글 API client 기능을 불러오는 코드
    gapi.load('client', async () => {
        // 구글 캘린더 API 사용 준비
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        });

        // 준비가 끝나면 캘린더 예약 데이터를 가져옴
        loadCalendarData();
    });
}

/* --- 구글 캘린더에서 예약 데이터 가져오기 --- */

async function loadCalendarData() {
    try {
        // 현재 날짜를 "YYYY-MM-DD" 형태로 만듦
        const dateKey = getDateKey(currentDate);

        // 현재 날짜 데이터가 아직 없으면 기본 구조를 만듦
        // 301, 405 배열을 미리 만들어야 push 가능
        if (!reservationData[dateKey]) {
            reservationData[dateKey] = {"301": [], "405": []};
        }

        // 현재 날짜의 시작 시간: 00:00:00
        const startOfDay = new Date(currentDate);
        startOfDay.setHours(0, 0, 0, 0);

        // 현재 날짜의 끝 시간: 23:59:59
        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23, 59, 59, 999);

        // CALENDAR_MAP에 등록된 캘린더를 하나씩 반복
        for (const calId in CALENDAR_MAP) {
            // 해당 캘린더에서 현재 날짜의 이벤트 목록 가져오기
            const response = await gapi.client.calendar.events.list({
                calendarId: calId,
                timeMin: startOfDay.toISOString(),
                timeMax: endOfDay.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            // 구글에서 받아온 예약 목록
            const events = response.result.items;

            // 예약 하나씩 처리
            events.forEach(event => {
                // 예약 시작 시간
                const start = new Date(event.start.dateTime || event.start.date);

                // 예약 종료 시간
                const end = new Date(event.end.dateTime || event.end.date);

                // "18:00" 같은 형태로 변환
                const startStr = start.toTimeString().slice(0, 5);
                let endStr = end.toTimeString().slice(0, 5);

                // 종료 시간이 00:00이면 하루 끝으로 처리
                if (endStr === "00:00") endStr = "23:59";

                // event.description은 구글 캘린더 설명 칸
                // 여기에 예약자 정보가 들어있다고 가정
                const desc = event.description || "";

                // 줄바꿈 기준으로 여러 명 예약자를 나눔
                const lines = desc.split('\n');

                // 설명 줄을 사람 정보 배열로 바꿈
                const people = lines.map(line => {
                    // "|" 기준으로 이름/학번 등을 나눔
                    const parts = line.split('|').map(p => p.trim());

                    // 예: 김근형(2학년) 형태에서 이름과 학년 분리
                    const match = (parts[0] || "").match(/([가-힣a-zA-Z]+)\s*\(([^)]+)\)/);

                    return {
                        // match가 있으면 이름만, 없으면 전체 문자열 사용
                        name: match ? match[1] : parts[0],

                        // match가 있으면 괄호 안 내용 사용
                        grade: match ? match[2] : "-",

                        // | 뒤에 있는 값을 학번으로 사용
                        id: parts[1] || "-"
                    };
                }).filter(p => p.name); // 이름 없는 줄은 제거

                // 현재 캘린더 ID가 몇 호실인지 찾음
                const room = CALENDAR_MAP[calId];

                // 매칭되는 방이 없으면 중단
                if (!room) return;

                // 같은 시작/종료 시간 예약이 이미 저장되어 있는지 확인
                const exists = reservationData[dateKey][room].some(r =>
                    r.start === startStr && r.end === endStr
                );

                // 이미 있으면 중복 저장하지 않음
                if (exists) return;

                // 최종 예약 데이터 저장
                reservationData[dateKey][room].push({
                    start: startStr,
                    end: endStr,
                    title: event.summary || "예약",
                    icon: "💬",
                    people: people
                });
            });
        }

        // 데이터를 다 가져온 뒤 화면 전체 업데이트
        updateAll();
    } catch (err) {
        // 오류가 나면 콘솔에 출력
        console.error("캘린더 오류", err);
    }
}

/* --- 처음 화면 실행 함수 --- */

function init() {
    // 저장된 날짜/방/전체보기 상태 불러오기
    loadState();

    // 현재 선택된 강의실 번호를 상태 박스에 표시
    document.getElementById('room-num-display').innerText = currentRoom;

    // 현재 선택된 강의실 탭에 active 클래스 붙이기
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.room === currentRoom);
    });

    // 강의실 탭 클릭 기능
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            // 모든 탭에서 active 제거
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('active');
            });

            // 클릭한 탭만 active 추가
            tab.classList.add('active');

            // 현재 선택 강의실 변경
            // data-room 값이 "301" 또는 "405"
            currentRoom = tab.dataset.room;

            // 바뀐 상태 저장
            saveState();

            // 방이 바뀌었으니 예약 상태와 시간표 다시 그림
            updateAll();
        };
    });

    // X 버튼 클릭 시 모달 닫기
    document.getElementById('modal-close-x').onclick = closeModal;

    // 확인 버튼 클릭 시 모달 닫기
    document.getElementById('modal-close-btn').onclick = closeModal;

    // 전날 버튼 클릭
    document.getElementById('prev-day').onclick = () => {
        currentDate.setDate(currentDate.getDate() - 1);
        saveState();
        updateAll();
        loadCalendarData();
    };

    // 다음날 버튼 클릭
    document.getElementById('next-day').onclick = () => {
        currentDate.setDate(currentDate.getDate() + 1);
        saveState();
        updateAll();
        loadCalendarData();
    };

    // 금일 버튼 클릭
    document.getElementById('today-btn').onclick = () => {
        currentDate = new Date();
        saveState();
        updateAll();
        loadCalendarData();
    };

    // 전체 예약표 버튼 가져오기
    const toggleBtn = document.getElementById('btn-toggle-all');

    // 전체 예약표 버튼 클릭
    toggleBtn.onclick = () => {
        // true면 false로, false면 true로 바꿈
        isShowAll = !isShowAll;

        // 상태 저장
        saveState();

        // 버튼 글자 변경
        toggleBtn.innerText = isShowAll ? "되돌아가기" : "전체 예약표";

        // 버튼 색 변경
        toggleBtn.style.background = isShowAll ? "#ff6b6b" : "#20c997";

        // 시간표만 다시 그림
        renderTimeline();
    };

    // 처음 시계 표시
    updateClock();

    // 1초마다 시계 갱신
    setInterval(updateClock, 1000);

    // 1분마다 예약 데이터와 화면 상태 갱신
    setInterval(() => {
        updateAll();
        loadCalendarData();
    }, 60000);

    // 처음 화면 그리기
    updateAll();
}

/* --- 시간을 분으로 바꾸는 함수 --- */

function toMin(t) {
    // "18:30" → ["18", "30"] → [18, 30]
    const [h, m] = t.split(':').map(Number);

    // 시간*60 + 분
    // 예: 18:30 → 1110분
    return h * 60 + m;
}

/* --- 예약 카드 높이 계산 함수 --- */

function calculateHeight(s, e) {
    // 시작 시간과 끝 시간 차이를 분으로 구함
    // 15분마다 40px 높이로 계산
    return ((toMin(e) - toMin(s)) / 15) * 40;
}

/* --- 시간표 그리는 함수 --- */

function renderTimeline() {
    // 예약표가 들어갈 HTML 영역 찾기
    const container = document.getElementById('main-content');

    // 기존 예약표 지우기
    container.innerHTML = '';

    // 현재 날짜 key 생성
    const dateKey = getDateKey(currentDate);

    // 현재 선택된 강의실의 예약 데이터 가져오기
    const data = reservationData[dateKey]?.[currentRoom] || [];

    // 현재 시간
    const now = new Date();

    // 전체보기면 9시부터, 아니면 현재 시각부터
    let startH = isShowAll ? 9 : now.getHours();

    // 전체보기면 24시까지, 아니면 현재 시각 + 3시간까지
    let endH = isShowAll ? 24 : now.getHours() + 3;

    // 시간 단위 반복
    for (let h = startH; h < endH; h++) {
        // 15분 단위 반복
        for (let m of ["00", "15", "30", "45"]) {
            // "09:00" 같은 시간 문자열 생성
            const timeStr = `${String(h).padStart(2, '0')}:${m}`;

            // 이 시간에 시작하는 예약 찾기
            const res = data.find(r => r.start === timeStr);

            // 이 시간이 예약 중간에 포함되는지 확인
            const isInside = data.find(r =>
                toMin(timeStr) > toMin(r.start) &&
                toMin(timeStr) < toMin(r.end)
            );

            // 한 줄 생성
            const row = document.createElement('div');

            // CSS 적용용 클래스
            row.className = 'time-row';

            // 오른쪽 칸에 들어갈 내용
            let content = '';

            // 예약이 이 시간에 시작하면 카드 생성
            if (res) {
                // 예약 길이에 맞게 카드 높이 계산
                const hPx = calculateHeight(res.start, res.end);

                // 첫 번째 사람을 대표자로 표시
                const leader = res.people[0]?.name || "예약자";

                // 대표자 제외 인원 수
                const count = res.people.length - 1;

                // 카드에 표시할 제목 만들기
                const titleText = count > 0
                    ? `${res.title} - ${leader} 외 ${count}명`
                    : `${res.title} - ${leader}`;

                // 예약 카드 HTML 생성
                content = `
                    <div class="card" style="height:${hPx - 4}px;" onclick="openModal('${res.start}')">
                        <span>${titleText}</span>
                        <small>${res.start} - ${res.end}</small>
                    </div>
                `;
            }

            // 예약 중간 시간이 아니면 예약가능 표시
            else if (!isInside) {
                content = `<div class="empty-slot">예약가능</div>`;
            }

            // 왼쪽 시간 + 오른쪽 예약칸을 한 줄로 넣음
            row.innerHTML = `
                <div class="time-label">${timeStr}</div>
                <div class="slot">${content}</div>
            `;

            // 완성된 한 줄을 화면에 추가
            container.appendChild(row);
        }
    }
}

/* --- 화면 전체 업데이트 함수 --- */

function updateAll() {
    // 현재 방 번호 표시
    document.getElementById('room-num-display').innerText = currentRoom;

    // 현재 날짜를 "5월 6일" 형태로 만듦
    const monthDay = currentDate.toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric'
    });

    // 요일을 "수" 형태로 만듦
    const week = currentDate.toLocaleDateString('ko-KR', {
        weekday: 'short'
    });

    // 날짜 표시 영역에 넣기
    document.getElementById('current-date-text').innerText = `${monthDay} (${week})`;

    // 현재 시간 만들기
    const now = new Date();

    // "18:05" 같은 형태
    const curTime =
        `${String(now.getHours()).padStart(2, '0')}:` +
        `${String(now.getMinutes()).padStart(2, '0')}`;

    // 현재 날짜 key
    const dateKey = getDateKey(currentDate);

    // 현재 선택된 강의실 예약 목록
    const data = reservationData[dateKey]?.[currentRoom] || [];

    // 지금 진행 중인 예약 찾기
    const active = data.find(r =>
        curTime >= r.start && curTime < r.end
    );

    // 상태 박스 가져오기
    const bar = document.getElementById('status-bar');

    // 현재 진행 중 예약이 있으면
    if (active) {
        // 상태 박스 색을 예약중 색으로 변경
        bar.classList.add('active');

        // 대표자 이름
        const leader = active.people[0]?.name || "예약자";

        // 대표자 제외 인원 수
        const count = active.people.length - 1;

        // 상태 박스에 표시할 문장
        const text = count > 0
            ? `${active.title} - ${leader} 외 ${count}명`
            : `${active.title} - ${leader}`;

        // 예약 제목 표시
        document.getElementById('current-status').innerHTML = `<strong>${text}</strong>`;

        // 예약 시간 표시
        document.getElementById('status-time').innerText = `${active.start} - ${active.end}`;
    }

    // 현재 진행 중 예약이 없으면
    else {
        // 예약중 색 제거
        bar.classList.remove('active');

        // 이용 가능 표시
        document.getElementById('current-status').innerHTML = `<strong>이용 가능</strong>`;

        // 현재 예약 없음 표시
        document.getElementById('status-time').innerText = "현재 예약 없음";
    }

    // 시간표 다시 그림
    renderTimeline();
}

/* --- 실시간 시계 함수 --- */

function updateClock() {
    // 현재 시간을 HH:MM:SS 형태로 표시
    document.getElementById('live-clock').innerText =
        new Date().toTimeString().split(' ')[0];
}

/* --- 예약 상세 모달 열기 함수 --- */

window.openModal = (start) => {
    // 현재 날짜 key
    const dateKey = getDateKey(currentDate);

    // 현재 강의실 예약 데이터
    const data = reservationData[dateKey]?.[currentRoom] || [];

    // 클릭한 예약 찾기
    const res = data.find(r => r.start === start);

    // 예약이 없으면 중단
    if (!res) return;

    // 대표자
    const leader = res.people[0]?.name || "예약자";

    // 대표자 제외 인원 수
    const count = res.people.length - 1;

    // 팝업 제목
    const titleText = count > 0
        ? `${res.title} - ${leader} 외 ${count}명`
        : `${res.title} - ${leader}`;

    // 제목 넣기
    document.getElementById('modal-title').innerText = titleText;

    // 이름 목록 넣기
    document.getElementById('m-name').innerText =
        res.people.map(p => p.name).join(', ');

    // 학년 목록 넣기
    document.getElementById('m-grade').innerText =
        res.people.map(p => p.grade).join(', ');

    // 학번 목록 넣기
    document.getElementById('m-id').innerText =
        res.people.map(p => p.id).join(', ');

    // 시간 넣기
    document.getElementById('m-time').innerText =
        `${res.start} - ${res.end}`;

    // 강의실 넣기
    document.getElementById('m-room').innerText =
        currentRoom + "호";

    // 날짜 넣기
    document.getElementById('m-date').innerText = dateKey;

    // 모달 보이게 하기
    document.getElementById('detail-modal').style.display = 'flex';
};

/* --- 예약 상세 모달 닫기 함수 --- */

function closeModal() {
    // 모달 숨기기
    document.getElementById('detail-modal').style.display = 'none';
}

/* --- 페이지 시작 지점 --- */

window.onload = () => {
    // HTML이 다 로드되면 init 함수 실행
    init();
};