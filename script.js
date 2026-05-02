/* --- 설정 영역 --- */
const API_KEY = 'AIzaSyDRQ2xmqs-GaVrAFQmxB1C8rVQowu0h-3U'; 

const CALENDAR_MAP = {
    '434a85c7be660f180486d88d6362ff5468fe73ec5a3da754eff72fa0592506c8@group.calendar.google.com': '301',
    '6be7b63f943dcc68ec839197f0a9b5a4d378637dc5700bd579ec5e03dae2cb9a@group.calendar.google.com': '405'
};

let reservationData = {}; 
let currentDate = new Date();
let currentRoom = "301"; 
let isShowAll = false;

/* --- 날짜 key --- */
function getDateKey(date) {
    return date.toISOString().slice(0,10);
}

/* --- 상태 저장 --- */
function saveState() {
    localStorage.setItem("currentDate", currentDate.toISOString());
    localStorage.setItem("currentRoom", currentRoom);
    localStorage.setItem("isShowAll", isShowAll);
}

/* --- 상태 불러오기 --- */
function loadState() {
    const d = localStorage.getItem("currentDate");
    const r = localStorage.getItem("currentRoom");
    const s = localStorage.getItem("isShowAll");

    if (d) currentDate = new Date(d);
    if (r) currentRoom = r;
    if (s !== null) isShowAll = s === "true";
}

/* --- 구글 API --- */
function gapiLoaded() {
    gapi.load('client', async () => {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        });
        loadCalendarData();
    });
}

/* --- 데이터 불러오기 --- */
async function loadCalendarData() {
    try {
        const dateKey = getDateKey(currentDate);

        if (!reservationData[dateKey]) {
            reservationData[dateKey] = { "301": [], "405": [] };
        }

        const startOfDay = new Date(currentDate);
        startOfDay.setHours(0,0,0,0);

        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23,59,59,999);

        for (const calId in CALENDAR_MAP) {

            const response = await gapi.client.calendar.events.list({
                calendarId: calId,
                timeMin: startOfDay.toISOString(),
                timeMax: endOfDay.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = response.result.items;

            events.forEach(event => {
                const start = new Date(event.start.dateTime || event.start.date);
                const end = new Date(event.end.dateTime || event.end.date);

                const startStr = start.toTimeString().slice(0,5);
                let endStr = end.toTimeString().slice(0,5);

                if (endStr === "00:00") endStr = "23:59";

                // 🔥 여러명 파싱
                const desc = event.description || "";
                const lines = desc.split('\n');

                const people = lines.map(line => {
                    const parts = line.split('|').map(p => p.trim());

                    const match = (parts[0] || "").match(/([가-힣a-zA-Z]+)\s*\(([^)]+)\)/);

                    return {
                        name: match ? match[1] : parts[0],
                        grade: match ? match[2] : "-",
                        id: parts[1] || "-"
                    };
                }).filter(p => p.name);

                const room = CALENDAR_MAP[calId];
                if (!room) return;

                const exists = reservationData[dateKey][room].some(r =>
                    r.start === startStr && r.end === endStr
                );
                if (exists) return;

                reservationData[dateKey][room].push({
                    start: startStr,
                    end: endStr,
                    title: event.summary || "예약",
                    icon: "💬",
                    people: people
                });
            });
        }

        updateAll();

    } catch (err) {
        console.error("캘린더 오류", err);
    }
}

/* --- 초기화 --- */
function init() {

    loadState();

    document.getElementById('room-num-display').innerText = currentRoom;

    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.room === currentRoom);
    });

    document.getElementById('modal-close-x').onclick = closeModal;
    document.getElementById('modal-close-btn').onclick = closeModal;

    document.getElementById('prev-day').onclick = () => {
        currentDate.setDate(currentDate.getDate() - 1);
        saveState();
        updateAll();
        loadCalendarData();
    };

    document.getElementById('next-day').onclick = () => {
        currentDate.setDate(currentDate.getDate() + 1);
        saveState();
        updateAll();
        loadCalendarData();
    };

    document.getElementById('today-btn').onclick = () => {
        currentDate = new Date();
        saveState();
        updateAll();
        loadCalendarData();
    };

    document.getElementById('btn-toggle-all').onclick = () => {
        isShowAll = !isShowAll;
        saveState();
        renderTimeline();
    };

    document.querySelectorAll('.tab').forEach(t => {
        t.onclick = () => {
            document.querySelector('.tab.active')?.classList.remove('active');
            t.classList.add('active');
            currentRoom = t.dataset.room;
            saveState();
            updateAll();
        }
    });

    setInterval(updateClock, 1000);
    setInterval(() => {
        updateAll();
        loadCalendarData();
    }, 60000);
}

/* --- 시간 계산 --- */
function toMin(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function calculateHeight(s, e) {
    return ((toMin(e) - toMin(s)) / 15) * 40;
}

/* --- 타임라인 --- */
function renderTimeline() {

    const container = document.getElementById('main-content');
    container.innerHTML = '';

    const dateKey = getDateKey(currentDate);
    const data = reservationData[dateKey]?.[currentRoom] || [];

    const now = new Date();
    let startH = isShowAll ? 9 : now.getHours();
    let endH = isShowAll ? 24 : now.getHours() + 3;

    for (let h = startH; h < endH; h++) {
        for (let m of ["00", "15", "30", "45"]) {

            const timeStr = `${String(h).padStart(2, '0')}:${m}`;

            const res = data.find(r => r.start === timeStr);
            const isInside = data.find(r =>
                toMin(timeStr) > toMin(r.start) &&
                toMin(timeStr) < toMin(r.end)
            );

            const row = document.createElement('div');
            row.className = 'time-row';

            let content = '';

            if (res) {
                const hPx = calculateHeight(res.start, res.end);

                // 🔥 대표자 + 인원
                const leader = res.people[0]?.name || "예약자";
                const count = res.people.length - 1;

                let titleText = count > 0
                    ? `${res.title} - ${leader} 외 ${count}명`
                    : `${res.title} - ${leader}`;

                content = `
                    <div class="card" style="height:${hPx-4}px;" onclick="openModal('${res.start}')">
                        <span>${titleText}</span>
                        <small>${res.start} - ${res.end}</small>
                    </div>`;
            } 
            else if (!isInside) {
                content = `<div class="empty-slot">예약가능</div>`;
            }

            row.innerHTML = `<div class="time-label">${timeStr}</div><div class="slot">${content}</div>`;
            container.appendChild(row);
        }
    }
}

/* --- 전체 업데이트 --- */
function updateAll() {

    const monthDay = currentDate.toLocaleDateString('ko-KR', {month:'long', day:'numeric'});
    const week = currentDate.toLocaleDateString('ko-KR', {weekday:'short'});
    document.getElementById('current-date-text').innerText = `${monthDay} (${week})`;

    const now = new Date();
    const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const dateKey = getDateKey(currentDate);
    const data = reservationData[dateKey]?.[currentRoom] || [];

    const active = data.find(r => curTime >= r.start && curTime < r.end);

    const bar = document.getElementById('status-bar');

    if(active) {
        bar.classList.add('active');

        const leader = active.people[0]?.name || "예약자";
        const count = active.people.length - 1;

        let text = count > 0
            ? `${active.title} - ${leader} 외 ${count}명`
            : `${active.title} - ${leader}`;

        document.getElementById('current-status').innerHTML =
            `<strong>${text}</strong>`;

        document.getElementById('status-time').innerText =
            `${active.start} - ${active.end}`;

    } else {
        bar.classList.remove('active');
        document.getElementById('current-status').innerHTML = `<strong>이용 가능</strong>`;
        document.getElementById('status-time').innerText = "현재 예약 없음";
    }

    renderTimeline();
}

/* --- 시계 --- */
function updateClock() {
    document.getElementById('live-clock').innerText =
        new Date().toTimeString().split(' ')[0];
}

/* --- 모달 --- */
window.openModal = (start) => {

    const dateKey = getDateKey(currentDate);
    const data = reservationData[dateKey][currentRoom];

    const res = data.find(r => r.start === start);
    if(!res) return;

    const leader = res.people[0]?.name || "예약자";
    const count = res.people.length - 1;

    let titleText = count > 0
        ? `${res.title} - ${leader} 외 ${count}명`
        : `${res.title} - ${leader}`;

    document.getElementById('modal-title').innerText = titleText;

    // 🔥 상세 정보
    document.getElementById('m-name').innerText =
        res.people.map(p => p.name).join(', ');

    document.getElementById('m-grade').innerText =
        res.people.map(p => p.grade).join(', ');

    document.getElementById('m-id').innerText =
        res.people.map(p => p.id).join(', ');

    document.getElementById('m-time').innerText =
        `${res.start} - ${res.end}`;

    document.getElementById('m-room').innerText =
        currentRoom + "호";

    document.getElementById('m-date').innerText =
        `${dateKey}`;

    document.getElementById('detail-modal').style.display = 'flex';
};

function closeModal() {
    document.getElementById('detail-modal').style.display = 'none';
}

/* --- 실행 --- */
window.onload = () => {
    init();
};