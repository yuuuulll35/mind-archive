/* =========================================================
   MIND ARCHIVE — 데이터 정의
   - SECTIONS : 열람 파일(01~10) 정의
   - blankData() : 빈 파일 템플릿
   - SAMPLE : 첫 방문 시 보여줄 예시 사건 파일
   - buildPrompt() : AI 채팅에 보낼 OOC 요청문 생성
   ========================================================= */

const SECTIONS = [
  { id: 's01', code: '01', title: '한눈에 보는 이 사람', en: 'AT A GLANCE', type: 'glance' },
  { id: 's02', code: '02', title: '사고 · 행동 방식', en: 'COGNITION & CONDUCT', type: 'list' },
  { id: 's03', code: '03', title: '대인관계', en: 'SOCIAL PATTERN', type: 'list' },
  { id: 's04', code: '04', title: '좋아하는 것과 싫어하는 것', en: 'PREFERENCE', type: 'split', pos: '좋아하는 것', neg: '싫어하는 것' },
  { id: 's05', code: '05', title: '연애관', en: 'ROMANCE PROFILE', type: 'list' },
  { id: 's06', code: '06', title: (other) => `${other}에 대한 생각 총정리`, en: 'ON THE OTHER', type: 'list' },
  { id: 's07', code: '07', title: '관계에 대한 희망과 불안', en: 'HOPE / DREAD', type: 'split', pos: '희망', neg: '부정적 생각' },
  { id: 's08', code: '08', title: '앞으로의 계획과 원하는 것', en: 'FUTURE INTENT', type: 'list' },
  { id: 's09', code: '09', title: '숨기고 있는 것', en: 'REDACTED', type: 'redact' },
  { id: 's10', code: '10', title: '쓸데없는 잡생각', en: 'BACKGROUND NOISE', type: 'scribble' },
];

const DEFAULT_READINGS = ['경계', '호감', '불안', '피로'];

function blankSection() {
  return { lead: '', items: [], pos: [], neg: [], quote: '' };
}

function blankSubject(id) {
  const sections = {};
  SECTIONS.forEach((s) => (sections[s.id] = blankSection()));
  return {
    id,
    name: '',
    alias: '',
    age: '',
    mbti: '',
    saju: '',
    occupation: '',
    role: '',
    photo: '',
    photoSrc: '', // 다시 편집할 수 있도록 남겨 두는 원본(축소본)
    photoCrop: null, // { scale, ox, oy }
    tags: [],
    readings: DEFAULT_READINGS.map((label) => ({ label, value: 50 })),
    brain: [
      { label: '', weight: 30, link: 's01' },
      { label: '', weight: 20, link: 's06' },
      { label: '', weight: 15, link: 's02' },
      { label: '', weight: 10, link: 's10' },
    ],
    sections,
  };
}

function blankData() {
  return {
    case: { no: '', title: '', date: '', officer: '', memo: '' },
    subjects: [blankSubject('A'), blankSubject('B')],
    relation: { status: '', a_to_b: '', b_to_a: '', keywords: [], timeline: [] },
  };
}

/* ---------- 샘플 : 허구의 두 인물 (둘 다 성인) ---------- */
const SAMPLE = {
  case: {
    no: '2026-1013',
    title: '비 오는 날의 참고인',
    date: '2026.10.13',
    officer: '분석관 미상',
    memo: '두 사람 모두 상대에게 결정적인 한 가지를 말하지 않고 있음. 진술의 공백이 서로를 향해 있다.',
  },
  subjects: [
    {
      id: 'A',
      name: '서도윤',
      alias: '서 형사',
      age: '만 31세',
      mbti: 'ISTJ',
      saju: '경금(庚金) 일간 · 금 과다, 목 부족 (추정)',
      occupation: '서울 동부서 강력1팀 형사',
      role: '사건 담당 형사',
      photo: '',
      tags: ['원칙주의', '수면부족', '말보다 행동', '뒤끝 있음'],
      readings: [
        { label: '경계', value: 78 },
        { label: '호기심', value: 64 },
        { label: '애정', value: 31 },
        { label: '피로', value: 88 },
      ],
      brain: [
        { label: '사건', weight: 26, link: 's08' },
        { label: '한이서', weight: 18, link: 's06' },
        { label: '수면부족', weight: 12, link: 's10' },
        { label: '원칙', weight: 10, link: 's02' },
        { label: '죄책감', weight: 9, link: 's09' },
        { label: '커피', weight: 7, link: 's04' },
        { label: '엄마 전화', weight: 6, link: 's03' },
        { label: '이사', weight: 5, link: 's10' },
        { label: '고양이', weight: 4, link: 's10' },
      ],
      sections: {
        s01: {
          lead: '감정은 보고서에 쓰지 않는 사람. 다만 보고서에 쓰지 않은 것들을 가장 오래 기억한다.',
          items: ['원칙', '집요함', '무뚝뚝', '책임감 과잉', '의외로 동물에 약함'],
          pos: [], neg: [],
          quote: '확인하고 말하겠습니다. 추측으로 말하는 건 일이 아니라서요.',
        },
        s02: {
          lead: '결론을 먼저 세우지 않는다. 증거가 쌓일 때까지 판단을 미루는 대신, 그동안 잠을 미룬다.',
          items: [
            '모든 일을 시간순으로 재구성해야 마음이 놓인다. 머릿속에 늘 타임라인이 떠 있다.',
            '금(金) 기운이 강한 사주답게 결단은 느리지만 한번 내리면 번복하지 않는다.',
            '불확실한 상황에서는 말수가 줄고 손이 바빠진다. 볼펜을 분해했다 조립하는 버릇.',
            '규칙을 어기는 사람보다 규칙 뒤에 숨는 사람을 더 싫어한다. 본인이 그쪽일까 봐 두려워서.',
          ],
          pos: [], neg: [], quote: '',
        },
        s03: {
          lead: '넓게 사귀지 않는다. 대신 한번 내 사람으로 분류하면 귀찮을 만큼 챙긴다.',
          items: [
            '팀 내에서는 믿을 만하지만 같이 술 마시기엔 재미없는 선배로 통한다.',
            '어머니의 전화는 세 번에 한 번 받는다. 받으면 30분을 들어준다.',
            '호의를 받으면 갚을 방법부터 계산한다. 빚진 상태를 견디지 못한다.',
          ],
          pos: [], neg: [], quote: '',
        },
        s04: {
          lead: '취향이 단순하고 바뀌지 않는다. 싫어하는 것의 목록이 좋아하는 것보다 구체적이다.',
          items: [],
          pos: ['식은 아메리카노', '새벽 4시의 텅 빈 도로', '오래된 지포 라이터 소리', '길고양이와 눈싸움'],
          neg: ['근거 없는 확신', '자기 이름을 함부로 줄여 부르는 것', '비 오는 날의 현장', '“형사님은 감정이 없으세요?”라는 질문'],
          quote: '',
        },
        s05: {
          lead: '연애를 업무처럼 한다는 말을 들은 적이 있다. 본인은 그게 왜 나쁜지 아직 모른다.',
          items: [
            '말로 표현하기보다 상대의 퇴근길을 대신 확인하는 쪽.',
            '상대의 사소한 거짓말을 전부 눈치채지만, 굳이 지적하지 않는다. 대신 기억한다.',
            '이별의 사유는 늘 “바빠서”였지만, 사실은 누군가를 집에 들이는 일이 무서웠다.',
          ],
          pos: [], neg: [], quote: '',
        },
        s06: {
          lead: '참고인. 그 이상도 이하도 아니어야 하는데, 진술서를 읽을 때마다 목소리가 들린다.',
          items: [
            '거짓말을 하고 있다는 건 안다. 왜 하는지는 아직 모른다.',
            '서점 문을 닫는 시간을 외워버렸다. 업무상 필요해서라고 스스로에게 설명했다.',
            '웃을 때 왼쪽 눈이 먼저 감긴다. 이건 조서에 쓸 수 없는 정보다.',
            '이 사건이 끝나면 다시 볼 이유가 없다는 사실이 사건보다 신경 쓰인다.',
          ],
          pos: [], neg: [], quote: '',
        },
        s07: {
          lead: '희망을 말하는 법을 몰라 대부분 걱정의 형태로 나온다.',
          items: [],
          pos: ['사건이 끝나도 커피 한 잔 정도는 마실 수 있는 사이', '이서가 더 이상 누군가를 감싸지 않아도 되는 날'],
          neg: ['그녀가 범인 쪽에 서 있다면, 나는 수갑을 채울 수 있을까', '공과 사를 구분 못 하는 형사가 되는 것', '결국 또 “바빠서”로 끝나는 것'],
          quote: '',
        },
        s08: {
          lead: '단기 목표는 명확하고 장기 목표는 비어 있다. 비어 있는 칸을 보지 않으려고 단기 목표를 늘린다.',
          items: [
            '이번 달 안에 사건 송치. 그 전에 진짜 목격 시각 확인.',
            '6년째 미뤄 온 이사. 창문이 큰 집이면 좋겠다.',
            '언젠가는 고양이를 키울 자격이 있는 사람이 되는 것.',
          ],
          pos: [], neg: [], quote: '',
        },
        s09: {
          lead: '본인도 진술을 거부하는 영역.',
          items: [
            '7년 전 같은 수법의 사건에서 결정적 단서를 놓쳤다. 그때 피해자의 동생이 한이서다.',
            '처음부터 그녀를 알아봤다. 아직 아무에게도 말하지 않았다.',
          ],
          pos: [], neg: [], quote: '',
        },
        s10: {
          lead: '잠복 중 머릿속을 스쳐 간 것들.',
          items: [
            '편의점 삼각김밥 신상 또 나왔던데',
            '저 고양이 어제 그 고양이 맞나',
            '차 기름 넣어야 하는데',
            '서점 간판 글씨체 이름이 뭐지',
            '엄마한테 전화… 내일',
          ],
          pos: [], neg: [], quote: '',
        },
      },
    },
    {
      id: 'B',
      name: '한이서',
      alias: '고서점 주인',
      age: '만 28세',
      mbti: 'INFP',
      saju: '계수(癸水) 일간 · 수 강, 화 약 (추정)',
      occupation: '골목 고서점 「물고기자리」 운영',
      role: '사건 참고인 · 목격자',
      photo: '',
      tags: ['다정한 거짓말', '야행성', '책 냄새', '혼잣말'],
      readings: [
        { label: '경계', value: 55 },
        { label: '호감', value: 70 },
        { label: '불안', value: 81 },
        { label: '죄책감', value: 66 },
      ],
      brain: [
        { label: '거짓말 유지', weight: 22, link: 's09' },
        { label: '서도윤', weight: 20, link: 's06' },
        { label: '월세', weight: 12, link: 's08' },
        { label: '외로움', weight: 11, link: 's07' },
        { label: '동생', weight: 10, link: 's03' },
        { label: '비 오는 날', weight: 8, link: 's04' },
        { label: '도망', weight: 7, link: 's08' },
        { label: '야식', weight: 6, link: 's10' },
      ],
      sections: {
        s01: {
          lead: '모두에게 친절하고 아무에게도 속을 보이지 않는다. 다정함이 가장 오래된 방어막.',
          items: ['다정함', '회피', '관찰력', '책임 떠안기', '밤에 강함'],
          pos: [], neg: [],
          quote: '형사님, 저는 본 걸 말했어요. 못 본 걸 말하라고 하시면 곤란해요.',
        },
        s02: {
          lead: '감정이 먼저 움직이고 논리가 나중에 이유를 만든다. 그 이유가 꽤 그럴듯해서 본인도 속는다.',
          items: [
            '물(水)의 기질처럼 부딪히기보다 돌아간다. 정면 충돌 상황에서 화제를 바꾸는 데 능하다.',
            '결정을 미루다 마감 직전에 한 번에 처리한다.',
            '상대의 표정을 읽고 원하는 답을 먼저 준다. 그래서 진짜 답을 말할 타이밍을 자주 놓친다.',
          ],
          pos: [], neg: [], quote: '',
        },
        s03: {
          lead: '단골은 많고 친구는 적다. 사람을 좋아하지만 가까워지는 순서를 늘 자기가 정하고 싶어 한다.',
          items: [
            '동생 일이라면 이성보다 몸이 먼저 나간다.',
            '부탁은 잘 들어주고 부탁은 못 한다.',
            '서점 단골 할머니와는 매주 목요일 귤을 나눠 먹는다.',
          ],
          pos: [], neg: [], quote: '',
        },
        s04: {
          lead: '좋아하는 것은 대부분 조용하고, 싫어하는 것은 대부분 시끄럽다.',
          items: [],
          pos: ['비 오는 날 서점 유리창', '종이 냄새', '새벽 2시의 라면', '끝이 열린 결말'],
          neg: ['취조실 형광등', '“솔직하게 말해 봐요”', '빈 방에 혼자 있는 일요일', '갑자기 울리는 초인종'],
          quote: '',
        },
        s05: {
          lead: '사랑받는 법보다 떠나는 법을 먼저 배웠다.',
          items: [
            '먼저 좋아하게 되면 먼저 떠날 준비를 한다.',
            '상대가 자신을 “잘 안다”고 말하면 불안해진다.',
            '편지는 잘 쓰지만 부치지 않는다. 서랍에 열한 통쯤 있다.',
          ],
          pos: [], neg: [], quote: '',
        },
        s06: {
          lead: '무서운 사람. 그런데 우산을 두 개 들고 오는 사람.',
          items: [
            '내 거짓말을 알고 있는 것 같다. 모르는 척해 주는 게 더 무섭다.',
            '진술할 때마다 펜을 딸깍거린다. 그 소리가 멈추면 긴장한다.',
            '7년 전 그 형사였다는 걸 알고 있다. 미워해야 하는데 잘 안 된다.',
            '사건이 끝나면 다시 서점에 와 줄까. 그런 생각을 하는 내가 싫다.',
          ],
          pos: [], neg: [], quote: '',
        },
        s07: {
          lead: '희망은 작게, 불안은 크게 말하는 습관.',
          items: [],
          pos: ['언젠가 거짓말 없이 마주 앉는 것', '그 사람이 서점에서 책 한 권 끝까지 읽고 가는 날'],
          neg: ['진실을 말하면 동생도, 이 사람도 잃는다', '그가 나를 “피해자의 가족”으로만 기억하는 것', '결국 내가 또 먼저 도망치는 것'],
          quote: '',
        },
        s08: {
          lead: '계획이라기보다는 피난 경로에 가깝다.',
          items: [
            '이번 겨울까지 서점 월세 버티기.',
            '동생이 무사히 이 일에서 빠져나가게 하기.',
            '언젠가 바다 근처 도시에서 작은 책방을 다시 여는 것.',
          ],
          pos: [], neg: [], quote: '',
        },
        s09: {
          lead: '진술서에 적히지 않은 부분.',
          items: [
            '그날 밤 현장 근처에서 본 사람은 동생이었다.',
            '목격 시각을 40분 앞당겨 진술했다.',
            '서도윤이 7년 전 사건의 담당 형사였다는 걸 첫 만남부터 알고 있었다.',
          ],
          pos: [], neg: [], quote: '',
        },
        s10: {
          lead: '계산대에 앉아 있을 때 떠오르는 것들.',
          items: [
            '저 손님 30분째 같은 페이지야',
            '오늘 저녁 뭐 먹지… 또 라면?',
            '형사님 커피 블랙이었나',
            '고양이 이름 짓는다면 “장마”',
            '책갈피 주문 넣어야 함',
          ],
          pos: [], neg: [], quote: '',
        },
      },
    },
  ],
  relation: {
    status: '형사와 참고인 → 서로를 가장 잘 아는 타인',
    a_to_b: '거짓말하는 걸 안다. 왜 하는지는 모른다. 알고 싶지 않은 척하는 중.',
    b_to_a: '7년 전부터 알던 얼굴. 미워할 이유는 충분한데 미워지지 않는다.',
    keywords: ['쌍방 비밀', '7년 전 사건', '우산 두 개', '진술의 공백'],
    timeline: [
      '7년 전 · 같은 수법의 미제 사건. 서도윤은 담당 형사, 한이서는 피해자의 동생.',
      '사건 당일 · 한이서, 골목에서 누군가를 목격하고 신고.',
      '첫 조사 · 서로를 알아봤지만 둘 다 모르는 척.',
      '3차 조사 · 비가 와서 서도윤이 우산을 하나 더 들고 서점에 들름.',
      '현재 · 목격 시각의 40분 공백을 서도윤이 눈치채기 시작.',
    ],
  },
};

/* ---------- OOC 요청 프롬프트 (1500자 이내 유지) ---------- */
const PROMPT_LIMIT = 1500;

const NPC_PROMPT = `*[OOC: 잠시 역할극 중단. 새로운 에피소드. 조건 : NPC/PC 기존설정, 관계성, 성격, 성향, 말투, 서사, 캐릭터정보, 유저노트, 로어북 종합참고

지금까지의 대화를 근거로 NPC(id A) 한 명의 뇌구조와 PC와의 관계를 분석한다. 근거 없는 설정이나 사건은 만들지 않는다. 사주는 생년월일이 없으면 성격으로 추정하고 '(추정)' 표기. 나이는 만 19세 이상. 한국어 건조한 기록체로 작성한다.

유효한 JSON 코드블록 하나만 출력한다. 설명·주석은 금지한다. 정보가 없으면 '정보 부족'으로 표기한다. readings는 지표 4개(value 0~100), brain은 생각 6~10개(weight 합계 100, link는 s01~s10)로 구성한다. 각 lead는 1~2문장, items는 3~5개, s09는 1~3개, s10은 본인 1인칭 혼잣말 5개다.

{
"case":{"no":"01","title":"","date":"YYYY.MM.DD","officer":"분석관","memo":""},
"subject":{"id":"A","name":"","alias":"","age":"","mbti":"","saju":"","occupation":"","role":"","tags":[],
"readings":[{"label":"","value":0}],
"brain":[{"label":"","weight":0,"link":"s01"}],
"sections":{
"s01":{"lead":"","items":[],"keywords":["","","","",""],"quote":""},
"s02":{"lead":"","items":[]},"s03":{"lead":"","items":[]},
"s04":{"lead":"","pos":[],"neg":[]},"s05":{"lead":"","items":[]},
"s06":{"lead":"","items":[]},"s07":{"lead":"","pos":[],"neg":[]},
"s08":{"lead":"","items":[]},"s09":{"lead":"","items":[]},"s10":{"lead":"","items":[]}
}},
"relation":{"status":"","a_to_b":"","b_to_a":"","keywords":[],"timeline":[]}
}

섹션: s01 인물 요약, s02 사고·행동, s03 대인관계, s04 취향, s05 연애관, s06 PC에 대한 생각, s07 관계의 희망과 우려, s08 계획과 욕구, s09 숨기는 생각·감정, s10 잡생각. relation은 NPC 관점에서 PC와의 관계를 기록하며 확인된 사건만 timeline에 작성한다.]`;

const PC_PROMPT = `[OOC: 잠시 역할극 중단. 새로운 에피소드.

조건 : NPC/PC 기존설정, 관계성, 성격, 성향, 말투, 서사, 캐릭터정보, 유저노트, 로어북 종합참고

지금까지의 대화를 근거로 PC(id B) 한 명의 뇌구조와 NPC와의 관계를 분석한다. 근거 없는 설정이나 사건은 만들지 않는다. 사주는 생년월일이 없으면 성격으로 추정하고 '(추정)' 표기. 나이는 만 19세 이상. 한국어 건조한 기록체로 작성한다.

유효한 JSON 코드블록 하나만 출력한다. 설명·주석은 금지한다. 정보가 없으면 '정보 부족'으로 표기한다. readings는 지표 4개(value 0~100), brain은 생각 6~10개(weight 합계 100, link는 s01~s10)로 구성한다. 각 lead는 1~2문장, items는 3~5개, s09는 1~3개, s10은 본인 1인칭 혼잣말 5개다.

{
"case":{"no":"01","title":"","date":"YYYY.MM.DD","officer":"분석관","memo":""},
"subject":{"id":"B","name":"","alias":"","age":"","mbti":"","saju":"","occupation":"","role":"","tags":[],
"readings":[{"label":"","value":0}],
"brain":[{"label":"","weight":0,"link":"s01"}],
"sections":{
"s01":{"lead":"","items":[],"keywords":["","","","",""],"quote":""},
"s02":{"lead":"","items":[]},"s03":{"lead":"","items":[]},
"s04":{"lead":"","pos":[],"neg":[]},"s05":{"lead":"","items":[]},
"s06":{"lead":"","items":[]},"s07":{"lead":"","pos":[],"neg":[]},
"s08":{"lead":"","items":[]},"s09":{"lead":"","items":[]},"s10":{"lead":"","items":[]}
}},
"relation":{"status":"","a_to_b":"","b_to_a":"","keywords":[],"timeline":[]}
}

섹션: s01 인물 요약, s02 사고·행동, s03 대인관계, s04 취향, s05 연애관, s06 NPC에 대한 생각, s07 관계의 희망과 우려, s08 계획과 욕구, s09 숨기는 생각·감정, s10 잡생각. relation은 PC 관점에서 NPC와의 관계를 기록하며 확인된 사건만 timeline에 작성한다.]`;

const NARRATIVE_PROMPT = `*[OOC: 잠시 역할극 중단. 새로운 에피소드.

조건 : NPC/PC 기존설정, 관계성, 성격, 성향, 말투, 서사, 캐릭터정보, 유저노트, 로어북 종합참고

지금까지의 대화를 근거로 NPC(id A)와 PC(id B)의 관계와 서사를 분석한다. 근거 없는 설정이나 사건은 만들지 않는다. 한국어 건조한 기록체로 작성한다.

유효한 JSON 코드블록 하나만 출력한다. 설명·주석은 금지한다. 정보가 없으면 '정보 부족'으로 표기한다.

{
"case":{"no":"01","title":"","date":"YYYY.MM.DD","officer":"분석관","memo":""},
"relation":{"status":"","a_to_b":"","b_to_a":"","keywords":[],"timeline":[]}
}

항목: case.title 두 사람의 관계를 부르는 제목, case.memo 관계 전체에 대한 분석관 메모 1~2문장, relation.status 현재 관계를 한 줄로, relation.a_to_b NPC가 PC를 보는 시선 1~2문장, relation.b_to_a PC가 NPC를 보는 시선 1~2문장, relation.keywords 관계를 나타내는 키워드 3~5개, relation.timeline 지금까지 확인된 핵심 사건 3~6개를 시간순으로 '시점 · 사건' 형식.]`;

function buildPrompt(data, mode) {
  if (mode === 'A') return NPC_PROMPT;
  if (mode === 'B') return PC_PROMPT;
  return NARRATIVE_PROMPT;
}
