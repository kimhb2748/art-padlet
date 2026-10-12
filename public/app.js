/**
 * ArtBoard - High School Art Class Padlet & AI Se-teuk Management
 * 고등학교 미술 수업 아트보드 & AI 세특 관리 시스템
 */

// Global State
const state = {
  classes: [],
  currentClassId: '1-1',
  posts: [],
  currentUser: {
    studentId: '',
    studentName: ''
  },
  isAdmin: false,
  isOnline: false,
  serverInfo: null,
  searchQuery: '',
  seTeukStyle: 'balanced', // 'balanced', 'technique', 'creativity', 'message', 'sensitivity'
  geminiApiKey: localStorage.getItem('artboard_gemini_key') || '',
  adminPin: localStorage.getItem('artboard_admin_pin') || '1234'
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  loadSavedUser();
  await checkServerStatus();
  await loadClasses();
  await loadPosts();
  
  initURLParams();
  setupEventListeners();
  render();
});

// Load saved student user from storage
function loadSavedUser() {
  const saved = localStorage.getItem('artboard_student_user');
  if (saved) {
    try {
      state.currentUser = JSON.parse(saved);
    } catch (e) {}
  }
}

// Save student user
function saveStudentUser(studentId, studentName) {
  state.currentUser = { studentId: studentId.trim(), studentName: studentName.trim() };
  localStorage.setItem('artboard_student_user', JSON.stringify(state.currentUser));
}

// Parse URL Parameters (e.g. ?class=1-2 or ?admin=true)
function initURLParams() {
  const params = new URLSearchParams(window.location.search);
  const classParam = params.get('class');
  if (classParam && state.classes.some(c => c.id === classParam)) {
    state.currentClassId = classParam;
  }
  if (params.get('admin') === '1') {
    promptAdminLogin();
  }
}

// Check if running on local server or static/offline
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status', { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      state.isOnline = true;
      state.serverInfo = data;
      console.log('Connected to ArtBoard local server:', data);
      return;
    }
  } catch (e) {
    // Running offline / file protocol / without server
  }
  state.isOnline = false;
  state.serverInfo = {
    ip: window.location.hostname || 'localhost',
    port: window.location.port || '8080'
  };
}

// Load Classes
async function loadClasses() {
  if (state.isOnline) {
    try {
      const res = await fetch('/api/classes');
      if (res.ok) {
        state.classes = await res.json();
        localStorage.setItem('artboard_classes_cache', JSON.stringify(state.classes));
        return;
      }
    } catch (e) {}
  }

  // Fallback to cache or defaults
  const cached = localStorage.getItem('artboard_classes_cache');
  if (cached) {
    try {
      state.classes = JSON.parse(cached);
      return;
    } catch (e) {}
  }

  // Default Classes
  state.classes = [
    { id: '1-1', name: '1학년 1반', description: '2026학년도 1학기 고등 미술 - 회화 및 현대 미술 표현' },
    { id: '1-2', name: '1학년 2반', description: '2026학년도 1학기 고등 미술 - 조형 요소와 시각 문화 탐구' },
    { id: '1-3', name: '1학년 3반', description: '2026학년도 1학기 고등 미술 - 창의적 발상과 현대 미술 창작' },
    { id: '1-4', name: '1학년 4반', description: '2026학년도 1학기 고등 미술 - 자아 탐색 및 사회 비평 미술' }
  ];
  localStorage.setItem('artboard_classes_cache', JSON.stringify(state.classes));
}

// Load Posts
async function loadPosts() {
  if (state.isOnline) {
    try {
      const res = await fetch('/api/posts');
      if (res.ok) {
        state.posts = await res.json();
        localStorage.setItem('artboard_posts_cache', JSON.stringify(state.posts));
        return;
      }
    } catch (e) {}
  }

  // Fallback to cache
  const cached = localStorage.getItem('artboard_posts_cache');
  if (cached) {
    try {
      state.posts = JSON.parse(cached);
      return;
    } catch (e) {}
  }

  // If completely empty, load fallback sample data
  state.posts = [];
}

// Save Posts
async function persistPosts() {
  localStorage.setItem('artboard_posts_cache', JSON.stringify(state.posts));
}

// Create new post
async function createPost(postData) {
  if (state.isOnline) {
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData)
      });
      if (res.ok) {
        const created = await res.json();
        state.posts.unshift(created);
        await persistPosts();
        return created;
      }
    } catch (e) {
      console.warn('Server POST failed, fallback to local', e);
    }
  }

  // Local fallback
  const newPost = {
    ...postData,
    id: 'post-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    createdAt: new Date().toISOString(),
    likes: 0,
    comments: []
  };
  state.posts.unshift(newPost);
  await persistPosts();
  return newPost;
}

// Update post (e.g. evaluation)
async function updatePost(id, updates) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  Object.assign(post, updates);
  await persistPosts();

  if (state.isOnline) {
    try {
      await fetch(`/api/posts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.warn('Server PUT failed', e);
    }
  }
}

// Delete post
async function deletePost(id) {
  if (!confirm('정말 이 작품 게시물을 삭제하시겠습니까?')) return;
  state.posts = state.posts.filter(p => p.id !== id);
  await persistPosts();

  if (state.isOnline) {
    try {
      await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    } catch (e) {}
  }
  render();
}

// Like post
async function toggleLike(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  post.likes = (post.likes || 0) + 1;
  await persistPosts();
  renderWall();

  if (state.isOnline) {
    try {
      await fetch(`/api/posts/${id}/like`, { method: 'POST' });
    } catch (e) {}
  }
}

// Add comment to post
async function addComment(id, text) {
  if (!text || !text.trim()) return;
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  
  const studentName = state.currentUser.studentName || '동료 학생';
  const newComment = {
    id: 'c-' + Date.now().toString(36),
    studentName: studentName,
    content: text.trim(),
    createdAt: new Date().toISOString()
  };

  if (!post.comments) post.comments = [];
  post.comments.push(newComment);
  await persistPosts();

  if (state.isOnline) {
    try {
      await fetch(`/api/posts/${id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newComment)
      });
    } catch (e) {}
  }
  render();
}

// ==========================================
// Korean High School Art 세특 AI Engine
// (과목별 세부능력 및 특기사항 전문 분석 알고리즘)
// ==========================================

/**
 * Calculates NEIS bytes (Korean: 3 bytes, ASCII/space: 1 byte, CRLF: 2 bytes)
 */
function calculateNEISBytes(text) {
  if (!text) return 0;
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x007f) {
      bytes += 1;
    } else if (code <= 0x07ff) {
      bytes += 2;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Intelligent Keyword & Linguistic Analyzer for Art Curriculum
 */
function analyzeArtworkContent(title, description) {
  const text = (title + ' ' + description).toLowerCase();

  // 1. Technique & Formal Elements (조형 요소 및 표현 기법)
  const techniqueKeywords = [
    { match: /수채화|물맛|번짐|투명/, tag: '수채화의 투명한 물맛과 유기적 번짐 기법', cat: '수채' },
    { match: /아크릴|두터운|마티에르|임파스토|덧칠/, tag: '아크릴 물감의 밀도 높은 마티에르와 강렬한 붓터치', cat: '아크릴' },
    { match: /펜|소묘|드로잉|해칭|선묘|선/, tag: '정밀한 펜선과 밀도 높은 해칭(hatching) 선묘 기법', cat: '소묘/선' },
    { match: /콜라주|오브제|한지|종이|붙인|재료/, tag: '이질적 재료의 물성을 융합한 독창적 콜라주(collage) 기법', cat: '혼합재료' },
    { match: /디지털|태블릿|그래픽|벡터/, tag: '디지털 툴을 활용한 정교한 레이어 구성과 시각 효과', cat: '디지털' },
    { match: /명암|빛|그림자|대비|어둠|밝/, tag: '빛과 그림자의 명확한 명암 대비(Chiaroscuro)를 통한 입체감', cat: '명암' },
    { match: /색채|그라데이션|보색|원색|색감|파스텔|한색|난색/, tag: '감정 상태를 시각화한 감각적인 색채 조화와 보색 대비', cat: '색채' },
    { match: /구도|원근|공간|대칭|비대칭|입체|분할/, tag: '시선의 흐름을 유도하는 역동적인 화면 구도와 공간 분할', cat: '구도' },
    { match: /초현실|왜곡|변형|상징|추상/, tag: '사물의 형태 왜곡과 상징적 오브제 배치를 통한 초현실적 조형성', cat: '추상/초현실' }
  ];

  // 2. Theme & Intent (주제 의식 및 발상 동기)
  const themeKeywords = [
    { match: /시간|기억|순간|과거|현재|시계/, theme: '시간의 비가역성과 개인적 기억의 파편화', intent: '흘러가는 시간에 대한 철학적 성찰' },
    { match: /자아|내면|고민|정체성|가면|얼굴|자화상|감정/, theme: '청소년기 내면의 복합적 감정과 정체성 탐구', intent: '사회적 시선 속에서 진정한 자아를 발견하고자 하는 내적 탐색' },
    { match: /도시|빌딩|현대|속도|경쟁|스마트폰|기술/, theme: '현대 문명과 디지털 사회 속 인간 소외 현상', intent: '삭막한 현대 사회에 대한 비판적 통찰과 인간성 회복' },
    { match: /자연|환경|생명|꽃|바다|생태|오염/, theme: '생명력의 경이로움과 자연 생태에 대한 존중', intent: '도시와 자연의 공존을 모색하는 생태학적 감수성' },
    { match: /관계|연결|소통|친구|가족|외로움|고독/, theme: '타인과의 관계 맺기 및 진정한 시각적 소통', intent: '고독 속에서 연대와 따뜻한 공감을 추구하는 의지' },
    { match: /꿈|희망|미래|비상|빛/, theme: '이상향을 향한 열정과 미래에 대한 희망', intent: '어려움을 극복하고 성장하려는 긍정적 에너지' }
  ];

  // Matched elements
  const matchedTechniques = techniqueKeywords.filter(k => k.match.test(text)).map(k => k.tag);
  const matchedTheme = themeKeywords.find(k => k.match.test(text)) || {
    theme: '일상적 경험 속에서 발견한 예술적 영감과 개성적 조형성',
    intent: '자신만의 독창적인 시각 언어로 주제를 형상화하려는 탐구'
  };

  const primaryTech = matchedTechniques.length > 0 ? matchedTechniques[0] : '주제에 부합하는 조형 요소(형, 색, 질감)의 유기적 배치와 기법적 완성도';
  const secondaryTech = matchedTechniques.length > 1 ? matchedTechniques[1] : '화면 전체의 균형과 시각적 조화를 고려한 섬세한 표현력';

  return {
    matchedTheme,
    primaryTech,
    secondaryTech,
    hasMultipleTechs: matchedTechniques.length > 1
  };
}

/**
 * Generate Professional High School Art Record (세특) Text
 */
function generateSeTeukText(post, style = 'balanced') {
  const { title, description } = post;
  const analysis = analyzeArtworkContent(title, description);

  const cleanTitle = (title || '자유 창작 작품').trim();
  const theme = analysis.matchedTheme.theme;
  const intent = analysis.matchedTheme.intent;
  const tech1 = analysis.primaryTech;
  const tech2 = analysis.secondaryTech;

  let sentence1 = ''; // 발상 및 주제
  let sentence2 = ''; // 조형 요소 및 기법
  let sentence3 = ''; // 시각 소통 및 메시지
  let sentence4 = ''; // 태도 및 발전 가능성

  switch (style) {
    case 'technique': // 표현기법 및 조형미 중심
      sentence1 = `‘${cleanTitle}’ 창작 활동에서 ${intent}을 조형적으로 구현하고자 명확한 표현 계획을 수립함.`;
      sentence2 = `${tech1}를 능숙하게 구사하고, ${tech2}를 바탕으로 완성도 높은 화면 밀도를 구축함.`;
      sentence3 = `재료의 물리적 특성을 효과적으로 실험하여 대상의 양감과 시각적 텍스처를 생동감 있게 살려내는 테크닉이 매우 뛰어남.`;
      sentence4 = `작업 과정에서 조형 원리의 균형과 조화를 집요하게 탐구하며 자신의 미적 기준을 확립해 나가는 전문적 실기 역량이 돋보임.`;
      break;

    case 'creativity': // 창의적 발상 및 독창성 중심
      sentence1 = `‘${cleanTitle}’을 주제로 기존의 정형화된 시각틀에서 벗어나 ${theme}을 참신한 시각으로 재해석함.`;
      sentence2 = `${intent}을 상징적 메타포로 치환하고, ${tech1}를 창의적으로 접목하여 독창적인 예술 세계를 구축함.`;
      sentence3 = `다양한 조형적 실험을 두려워하지 않고 관습적인 구도를 탈피하여 관람자에게 신선한 시각적 충격과 흥미를 유발함.`;
      sentence4 = `자신의 고유한 예술적 개성을 당당하게 표현하며 문제해결 과정에서 발휘된 유연한 발상과 남다른 창의 융합 능력이 돋보임.`;
      break;

    case 'message': // 주제의식 및 비평적 시각 중심
      sentence1 = `‘${cleanTitle}’이라는 작품을 통해 ${theme}이라는 동시대적 문제의식을 심도 있게 탐색함.`;
      sentence2 = `${tech1}를 전략적으로 활용하여 전하고자 하는 메시지의 설득력과 사회·문화적 의미를 극대화함.`;
      sentence3 = `작품 속 상징적 이미지들의 조화로운 배치를 통해 관람자와 능동적으로 교감하는 뛰어난 시각 소통 능력을 발휘함.`;
      sentence4 = `예술을 개인적 유희에 국한하지 않고 공동체적 가치와 질문을 던지는 도구로 활용할 줄 아는 비판적 사고력과 지적 성숙도가 돋보임.`;
      break;

    case 'sensitivity': // 미적 감수성 및 내면 성찰 중심
      sentence1 = `‘${cleanTitle}’을 제작하며 ${intent}을 진솔하게 응시하고 자신의 정서를 섬세한 미적 언어로 승화시킴.`;
      sentence2 = `${tech1}와 정제된 색채 운용을 통해 내면의 미묘한 감정 변화를 따뜻하고 감각적인 시각 이미지로 형상화함.`;
      sentence3 = `작품에 담긴 서정적 분위기와 진정성 있는 작가 노트는 보는 이로 하여금 깊은 정서적 공감과 울림을 자아냄.`;
      sentence4 = `자기 성찰적 태도로 창작에 몰입하며 주변 세계와 따뜻하게 호흡하는 순수한 예술적 감수성과 풍부한 공감 능력이 돋보임.`;
      break;

    case 'balanced': // 균형 종합형 (표준형)
    default:
      sentence1 = `‘${cleanTitle}’을 주제로 ${intent}을 형상화하고자 하는 뚜렷한 목적의식을 가지고 창작 활동에 능동적으로 참여함.`;
      sentence2 = `${tech1}를 효과적으로 적용하고, ${tech2}를 조화롭게 구현하여 수준 높은 조형적 완성도를 달성함.`;
      sentence3 = `작품의 창작 의도와 표현 기법을 논리적인 작가 노트로 정리하여 관람자와 적극적으로 교감하는 시각 소통 역량을 보여줌.`;
      sentence4 = `제작 전 과정에서 지속적인 자기 점검과 피드백을 수용하여 작품을 발전시키는 성실함과 우수한 미술과 핵심역량이 돋보임.`;
      break;
  }

  return `${sentence1} ${sentence2} ${sentence3} ${sentence4}`;
}

/**
 * Optional Gemini API Multi-modal Call
 */
async function generateSeTeukWithGemini(post, apiKey) {
  const prompt = `당신은 대한민국 고등학교 미술 교사입니다. 교육부 학교생활기록부 기재요령에 따라 학생의 미술 작품과 설명을 바탕으로 [과목별 세부능력 및 특기사항(세특)]을 작성해야 합니다.

[작품 정보]
- 학생 학번/성명: ${post.studentId} ${post.studentName}
- 작품 제목: ${post.title}
- 학생 작품 설명: ${post.description}

[작성 지침 - 엄격 준수]
1. 분량: 한글 130자 ~ 180자 내외 (3~4개 완성형 문장, 공백 포함 약 400~500바이트 내외)
2. 문체: 개조식이나 명사형 종결(~함으로 끝나는 단어 나열)을 절대 금지하고, 객관적이고 품격 있는 서술형 문장 종결('~함.', '~을 구현함.', '~능력이 뛰어남.', '~역량이 돋보임.')로 완성할 것.
3. 구성:
   - 1문장: 학생의 발상 배경 및 독창적인 주제 의식
   - 2문장: 구체적인 조형 요소와 표현 기법(색채, 구도, 명암, 질감, 재료 등)의 완성도
   - 3문장: 작품에 담긴 시각 소통 및 예술적 메시지 전달력
   - 4문장: 수업 참여 태도, 탐구심 및 미술과 핵심역량 총평
4. 오직 세특 서술문만 출력할 것 (별도의 설명, 따옴표, 마크다운 기호 없이 순수 텍스트만 출력).`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || 'Gemini API 호출 실패');
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidateText) {
      return candidateText.trim().replace(/^["']|["']$/g, '');
    }
  } catch (err) {
    console.warn('Gemini API call error:', err);
    throw err;
  }
}

// Generate Se-teuk for a single post
async function handleGeneratePostSeTeuk(postId, style = state.seTeukStyle) {
  const post = state.posts.find(p => p.id === postId);
  if (!post) return;

  let text = '';
  if (state.geminiApiKey) {
    try {
      showToast('Gemini AI가 작품을 분석하여 세특을 생성 중입니다...', 'info');
      text = await generateSeTeukWithGemini(post, state.geminiApiKey);
    } catch (e) {
      showToast(`Gemini 오류: ${e.message}. 내장 엔진으로 대체합니다.`, 'warning');
      text = generateSeTeukText(post, style);
    }
  } else {
    text = generateSeTeukText(post, style);
  }

  const bytes = calculateNEISBytes(text);
  await updatePost(postId, {
    evaluation: text,
    evaluationBytes: bytes,
    evaluationStyle: style,
    evaluationUpdatedAt: new Date().toISOString()
  });

  showToast(`${post.studentName} 학생의 세특 평가가 생성되었습니다! (${bytes} Bytes)`, 'success');
  render();
}

// Batch Generate Se-teuk for current class
async function handleBatchGenerateSeTeuk() {
  const targetPosts = state.posts.filter(p => state.currentClassId === 'all' || p.classId === state.currentClassId);
  if (targetPosts.length === 0) {
    alert('해당 반에 등록된 작품이 없습니다.');
    return;
  }

  if (!confirm(`총 ${targetPosts.length}개 작품의 세특을 일괄 자동 생성하시겠습니까? (기존 내용이 있는 경우 업데이트됩니다)`)) {
    return;
  }

  let count = 0;
  for (const post of targetPosts) {
    const text = generateSeTeukText(post, state.seTeukStyle);
    const bytes = calculateNEISBytes(text);
    await updatePost(post.id, {
      evaluation: text,
      evaluationBytes: bytes,
      evaluationStyle: state.seTeukStyle,
      evaluationUpdatedAt: new Date().toISOString()
    });
    count++;
  }

  showToast(`${count}명의 세특 평가가 성공적으로 일괄 생성되었습니다!`, 'success');
  render();
}

// ==========================================
// Excel Export (.xlsx)
// ==========================================
function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('엑셀 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    return;
  }

  const targetClass = state.classes.find(c => c.id === state.currentClassId);
  const isAll = state.currentClassId === 'all';
  const targetPosts = state.posts.filter(p => isAll || p.classId === state.currentClassId);

  if (targetPosts.length === 0) {
    alert('내보낼 작품 데이터가 없습니다.');
    return;
  }

  // Sort by class and student ID
  const sorted = [...targetPosts].sort((a, b) => {
    if (a.classId !== b.classId) return a.classId.localeCompare(b.classId);
    return (a.studentId || '').localeCompare(b.studentId || '', undefined, { numeric: true });
  });

  // Prepare Excel Rows
  const excelData = sorted.map((p, idx) => {
    const cls = state.classes.find(c => c.id === p.classId)?.name || p.classId;
    const bytes = calculateNEISBytes(p.evaluation || '');
    return {
      '연번': idx + 1,
      '학년반': cls,
      '학번': p.studentId || '',
      '성명': p.studentName || '',
      '작품 제목': p.title || '',
      '작품 내용 및 작가노트': p.description || '',
      '과목별 세부능력 및 특기사항(세특)': p.evaluation || '(미작성)',
      'NEIS 바이트수': bytes,
      '제출 일시': p.createdAt ? new Date(p.createdAt).toLocaleString('ko-KR') : ''
    };
  });

  const ws = XLSX.utils.json_to_sheet(excelData);

  // Column widths
  ws['!cols'] = [
    { wch: 6 },   // 연번
    { wch: 12 },  // 학년반
    { wch: 10 },  // 학번
    { wch: 10 },  // 성명
    { wch: 25 },  // 작품 제목
    { wch: 45 },  // 작품 내용
    { wch: 60 },  // 세특
    { wch: 12 },  // 바이트수
    { wch: 20 }   // 제출 일시
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = isAll ? '전체반_세특' : (targetClass ? targetClass.name.replace(/\s+/g, '') : '세특');
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const todayStr = new Date().toISOString().slice(0, 10);
  const fileName = `미술_세특_평가결과_${sheetName}_${todayStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
  showToast(`엑셀 파일이 다운로드되었습니다: ${fileName}`, 'success');
}

// ==========================================
// QR Code Generator
// ==========================================
function getConnectURL(classId = state.currentClassId) {
  const host = state.serverInfo?.ip || window.location.hostname || 'localhost';
  const port = state.serverInfo?.port || window.location.port || '8080';
  const protocol = window.location.protocol.startsWith('http') ? window.location.protocol : 'http:';
  const targetClass = classId === 'all' ? '1-1' : classId;
  return `${protocol}//${host}:${port}/?class=${targetClass}`;
}

function renderQRCode(containerId, url, size = 220) {
  const container = document.getElementById(containerId);
  if (!container || typeof QRCode === 'undefined') return;
  container.innerHTML = '';
  new QRCode(container, {
    text: url,
    width: size,
    height: size,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}

// Open Classroom Presenter QR Modal
function openQRPresenterModal() {
  const modal = document.getElementById('qr-presenter-modal');
  if (!modal) return;
  
  const classObj = state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
  const targetClassId = classObj ? classObj.id : '1-1';
  const targetClassName = classObj ? classObj.name : '1학년 1반';
  const url = getConnectURL(targetClassId);

  document.getElementById('qr-modal-class-title').innerText = `${targetClassName} 접속용 QR코드`;
  document.getElementById('qr-modal-url').innerText = url;
  
  renderQRCode('qr-presenter-code', url, 260);

  modal.classList.remove('hidden');
}

// ==========================================
// Image Compression (Client-side HTML5 Canvas)
// ==========================================
async function compressImageFile(file, maxWidth = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ==========================================
// UI Rendering & Handlers
// ==========================================

function render() {
  renderNavbar();
  renderClassTabs();
  renderStudentBadge();
  renderWall();
  renderAdminView();
  checkStudentEntryGate();
}

function renderNavbar() {
  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const titleEl = document.getElementById('current-class-header-title');
  if (titleEl) {
    titleEl.innerText = state.currentClassId === 'all' ? '전체 반 갤러리' : (currentClass?.name || '미술 수업');
  }

  const adminBadge = document.getElementById('admin-mode-badge');
  const adminToggleBtn = document.getElementById('admin-toggle-btn');
  if (adminBadge && adminToggleBtn) {
    if (state.isAdmin) {
      adminBadge.classList.remove('hidden');
      adminToggleBtn.innerHTML = `<span>교사 모드 종료</span>`;
      adminToggleBtn.classList.replace('bg-indigo-600', 'bg-rose-600');
    } else {
      adminBadge.classList.add('hidden');
      adminToggleBtn.innerHTML = `<span>교사 관리자 모드 🔒</span>`;
      adminToggleBtn.classList.replace('bg-rose-600', 'bg-indigo-600');
    }
  }
}

function renderClassTabs() {
  const container = document.getElementById('class-tabs-container');
  if (!container) return;

  let html = '';
  
  if (state.isAdmin) {
    html += `
      <button onclick="switchClass('all')" 
        class="px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all ${state.currentClassId === 'all' ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}">
        전체 반
      </button>
    `;
  }

  state.classes.forEach(c => {
    const active = state.currentClassId === c.id;
    html += `
      <button onclick="switchClass('${c.id}')" 
        class="px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all ${active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}">
        ${c.name}
      </button>
    `;
  });

  container.innerHTML = html;
}

function renderStudentBadge() {
  const badge = document.getElementById('student-info-badge');
  if (!badge) return;
  if (state.currentUser.studentName) {
    badge.innerHTML = `
      <span class="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer hover:bg-amber-100" onclick="openStudentEntryModal()">
        <span>🎨</span>
        <span>${state.currentUser.studentId ? state.currentUser.studentId + ' ' : ''}${state.currentUser.studentName} 학생</span>
        <span class="text-amber-500 text-[10px] ml-0.5 font-normal">(수정)</span>
      </span>
    `;
  } else {
    badge.innerHTML = `
      <button onclick="openStudentEntryModal()" class="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline">
        학번/이름 등록
      </button>
    `;
  }
}

function switchClass(classId) {
  state.currentClassId = classId;
  const url = new URL(window.location);
  url.searchParams.set('class', classId);
  window.history.pushState({}, '', url);
  render();
}

function renderWall() {
  const container = document.getElementById('artwork-cards-grid');
  const countBadge = document.getElementById('class-artwork-count');
  if (!container) return;

  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const classDescEl = document.getElementById('class-description-text');
  if (classDescEl) {
    classDescEl.innerText = state.currentClassId === 'all' 
      ? '모든 반의 미술 작품이 등록된 통합 보드입니다.' 
      : (currentClass?.description || '학생들의 창의적 미술 작품 갤러리');
  }

  // Filter posts
  let filtered = state.posts.filter(p => state.currentClassId === 'all' || p.classId === state.currentClassId);

  // Search filter
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(p => 
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.studentName && p.studentName.toLowerCase().includes(q)) ||
      (p.studentId && p.studentId.includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }

  if (countBadge) {
    countBadge.innerText = `총 ${filtered.length}개 작품`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-300">
        <div class="text-5xl mb-3">🎨</div>
        <h3 class="text-lg font-bold text-slate-700">아직 등록된 작품이 없습니다</h3>
        <p class="text-sm text-slate-500 mt-1 mb-5">수업 시간에 완성한 멋진 작품을 가장 먼저 업로드해보세요!</p>
        <button onclick="openUploadModal()" class="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-md transition-all">
          <span>+ 내 작품 등록하기</span>
        </button>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(post => {
    const className = state.classes.find(c => c.id === post.classId)?.name || post.classId;
    const hasEval = !!post.evaluation;
    const dateFormatted = post.createdAt ? new Date(post.createdAt).toLocaleDateString('ko-KR') : '';

    html += `
      <div class="art-card bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col group">
        <!-- Artwork Image -->
        <div class="relative aspect-[4/3] bg-slate-100 overflow-hidden cursor-pointer" onclick="openDetailModal('${post.id}')">
          <img src="${post.imageUrl}" alt="${post.title}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
          <div class="absolute top-3 left-3 flex gap-1.5">
            <span class="bg-black/60 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
              ${className}
            </span>
          </div>
          ${state.isAdmin ? `
            <div class="absolute top-3 right-3">
              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${hasEval ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}">
                ${hasEval ? '✓ 세특완료' : '세특미작성'}
              </span>
            </div>
          ` : ''}
        </div>

        <!-- Card Body -->
        <div class="p-4 flex-1 flex flex-col">
          <div class="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <div class="flex items-center gap-1 font-semibold text-slate-800">
              <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold">${post.studentId || '학번미입력'}</span>
              <span>${post.studentName}</span>
            </div>
            <span>${dateFormatted}</span>
          </div>

          <h4 class="font-bold text-slate-900 text-base mb-2 group-hover:text-indigo-600 transition-colors line-clamp-1 cursor-pointer" onclick="openDetailModal('${post.id}')">
            ${post.title}
          </h4>

          <p class="text-xs text-slate-600 line-clamp-3 mb-4 leading-relaxed flex-1 cursor-pointer" onclick="openDetailModal('${post.id}')">
            ${post.description || '(작품 설명 없음)'}
          </p>

          <!-- Footer Actions -->
          <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div class="flex items-center gap-3">
              <button onclick="toggleLike('${post.id}')" class="flex items-center gap-1 text-slate-600 hover:text-rose-500 transition-colors font-medium">
                <span class="text-rose-500">❤️</span>
                <span>${post.likes || 0}</span>
              </button>
              <button onclick="openDetailModal('${post.id}')" class="flex items-center gap-1 text-slate-600 hover:text-indigo-600 transition-colors font-medium">
                <span>💬</span>
                <span>${(post.comments || []).length}</span>
              </button>
            </div>
            
            <div class="flex items-center gap-1">
              ${state.isAdmin ? `
                <button onclick="handleGeneratePostSeTeuk('${post.id}')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-[11px] font-semibold transition-colors">
                  🤖 세특평가
                </button>
                <button onclick="deletePost('${post.id}')" class="text-slate-400 hover:text-rose-500 p-1 transition-colors" title="삭제">
                  🗑️
                </button>
              ` : `
                <button onclick="openDetailModal('${post.id}')" class="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px]">
                  상세보기 &rarr;
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Render Teacher Admin Mode View
function renderAdminView() {
  const adminSection = document.getElementById('admin-dashboard-section');
  if (!adminSection) return;

  if (!state.isAdmin) {
    adminSection.classList.add('hidden');
    return;
  }

  adminSection.classList.remove('hidden');

  // Stats
  const targetPosts = state.posts.filter(p => state.currentClassId === 'all' || p.classId === state.currentClassId);
  const evalDone = targetPosts.filter(p => !!p.evaluation).length;
  const evalPending = targetPosts.length - evalDone;
  const percent = targetPosts.length > 0 ? Math.round((evalDone / targetPosts.length) * 100) : 0;

  document.getElementById('admin-stat-total').innerText = `${targetPosts.length}명`;
  document.getElementById('admin-stat-done').innerText = `${evalDone}명 (${percent}%)`;
  document.getElementById('admin-stat-pending').innerText = `${evalPending}명`;

  // Render Table Rows
  const tbody = document.getElementById('admin-evaluation-tbody');
  if (!tbody) return;

  if (targetPosts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-sm text-slate-400">
          제출된 작품이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  targetPosts.forEach((post, index) => {
    const className = state.classes.find(c => c.id === post.classId)?.name || post.classId;
    const bytes = calculateNEISBytes(post.evaluation || '');
    const charCount = (post.evaluation || '').length;

    html += `
      <tr class="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
        <td class="py-3 px-3 text-center text-xs text-slate-500 font-medium">${index + 1}</td>
        
        <!-- Student Info -->
        <td class="py-3 px-3 whitespace-nowrap">
          <div class="text-xs font-bold text-slate-900">${post.studentName}</div>
          <div class="text-[11px] text-slate-500">${className} &bull; ${post.studentId}</div>
        </td>

        <!-- Artwork Info -->
        <td class="py-3 px-3 max-w-[200px]">
          <div class="flex items-center gap-2.5">
            <img src="${post.imageUrl}" class="w-12 h-12 rounded-lg object-cover cursor-pointer border border-slate-200 shrink-0" onclick="openDetailModal('${post.id}')" />
            <div class="min-w-0">
              <div class="text-xs font-bold text-slate-900 truncate">${post.title}</div>
              <div class="text-[11px] text-slate-500 line-clamp-2 leading-snug">${post.description}</div>
            </div>
          </div>
        </td>

        <!-- AI Se-teuk Evaluation Field -->
        <td class="py-3 px-3 min-w-[320px]">
          <div class="relative">
            <textarea id="eval-input-${post.id}" 
              oninput="onSeTeukInputChange('${post.id}')"
              rows="4" 
              class="w-full text-xs text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none leading-relaxed resize-y font-normal"
              placeholder="‘AI 세특 생성’ 버튼을 누르거나 직접 평가 내용을 입력하세요...">${post.evaluation || ''}</textarea>
            
            <div class="flex items-center justify-between mt-1 text-[11px] text-slate-400">
              <span id="bytes-badge-${post.id}" class="font-medium ${bytes > 1500 ? 'text-rose-500 font-bold' : 'text-indigo-600'}">
                ${bytes} Bytes / ${charCount}자 (NEIS 기준)
              </span>
              <div class="flex gap-1.5">
                <button onclick="copyToClipboard('${post.id}')" class="text-slate-500 hover:text-indigo-600 font-semibold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 transition-colors">
                  📋 복사
                </button>
                <button onclick="handleGeneratePostSeTeuk('${post.id}')" class="text-indigo-600 hover:text-indigo-800 font-semibold px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors">
                  🤖 ${post.evaluation ? '재생성' : 'AI 생성'}
                </button>
              </div>
            </div>
          </div>
        </td>

        <!-- Actions -->
        <td class="py-3 px-3 text-center whitespace-nowrap">
          <button onclick="deletePost('${post.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition-colors" title="삭제">
            🗑️
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// Live edit in admin table
function onSeTeukInputChange(postId) {
  const textarea = document.getElementById(`eval-input-${postId}`);
  const badge = document.getElementById(`bytes-badge-${postId}`);
  if (!textarea || !badge) return;

  const text = textarea.value;
  const bytes = calculateNEISBytes(text);
  const chars = text.length;

  badge.innerText = `${bytes} Bytes / ${chars}자 (NEIS 기준)`;
  if (bytes > 1500) {
    badge.className = 'font-medium text-rose-500 font-bold';
  } else {
    badge.className = 'font-medium text-indigo-600';
  }

  // Debounced auto-save
  clearTimeout(window[`save_timer_${postId}`]);
  window[`save_timer_${postId}`] = setTimeout(() => {
    updatePost(postId, {
      evaluation: text,
      evaluationBytes: bytes,
      evaluationUpdatedAt: new Date().toISOString()
    });
  }, 600);
}

function copyToClipboard(postId) {
  const textarea = document.getElementById(`eval-input-${postId}`);
  if (!textarea || !textarea.value) return;
  navigator.clipboard.writeText(textarea.value).then(() => {
    showToast('세특 평가 내용이 클립보드에 복사되었습니다! (나이스에 붙여넣기 가능)', 'success');
  });
}

// ==========================================
// Student Gate Modal Logic
// ==========================================
function checkStudentEntryGate() {
  if (state.isAdmin) return;
  if (!state.currentUser.studentName) {
    // Show gate modal on first arrival
    openStudentEntryModal();
  }
}

function openStudentEntryModal() {
  const modal = document.getElementById('student-entry-modal');
  if (!modal) return;
  const curClass = state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
  document.getElementById('gate-class-name').innerText = curClass ? curClass.name : '미술 수업';
  document.getElementById('gate-student-id').value = state.currentUser.studentId || '';
  document.getElementById('gate-student-name').value = state.currentUser.studentName || '';
  modal.classList.remove('hidden');
}

function closeStudentEntryModal() {
  document.getElementById('student-entry-modal')?.classList.add('hidden');
}

function handleSaveStudentEntry(e) {
  if (e) e.preventDefault();
  const idVal = document.getElementById('gate-student-id').value.trim();
  const nameVal = document.getElementById('gate-student-name').value.trim();

  if (!idVal || !nameVal) {
    alert('학번과 이름을 모두 입력해주세요.');
    return;
  }

  saveStudentUser(idVal, nameVal);
  closeStudentEntryModal();
  renderStudentBadge();
  showToast(`환영합니다, ${idVal} ${nameVal} 학생! 🎨`, 'success');
}

// ==========================================
// Upload Artwork Modal Logic
// ==========================================
let currentUploadImageData = null;

function openUploadModal() {
  // If student hasn't entered info yet, ask for it first
  if (!state.currentUser.studentName && !state.isAdmin) {
    openStudentEntryModal();
    return;
  }

  const modal = document.getElementById('upload-modal');
  if (!modal) return;

  // Pre-fill student info
  document.getElementById('upload-student-id').value = state.currentUser.studentId || '';
  document.getElementById('upload-student-name').value = state.currentUser.studentName || '';
  
  // Fill class options
  const classSelect = document.getElementById('upload-class-select');
  classSelect.innerHTML = state.classes.map(c => 
    `<option value="${c.id}" ${c.id === state.currentClassId ? 'selected' : ''}>${c.name}</option>`
  ).join('');

  // Reset form
  document.getElementById('upload-title').value = '';
  document.getElementById('upload-desc').value = '';
  document.getElementById('upload-image-input').value = '';
  currentUploadImageData = null;
  document.getElementById('upload-preview-container').classList.add('hidden');
  document.getElementById('upload-dropzone').classList.remove('hidden');

  modal.classList.remove('hidden');
}

function closeUploadModal() {
  document.getElementById('upload-modal')?.classList.add('hidden');
}

async function handleImageFileSelect(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('이미지 파일(jpg, png 등)을 선택해주세요.');
    return;
  }

  try {
    showToast('이미지 최적화 중...', 'info');
    currentUploadImageData = await compressImageFile(file, 1280, 0.85);
    
    const previewImg = document.getElementById('upload-preview-img');
    previewImg.src = currentUploadImageData;
    document.getElementById('upload-dropzone').classList.add('hidden');
    document.getElementById('upload-preview-container').classList.remove('hidden');
  } catch (err) {
    alert('이미지를 불러오는데 실패했습니다: ' + err.message);
  }
}

async function handleSubmitUpload(e) {
  if (e) e.preventDefault();

  const classId = document.getElementById('upload-class-select').value;
  const studentId = document.getElementById('upload-student-id').value.trim();
  const studentName = document.getElementById('upload-student-name').value.trim();
  const title = document.getElementById('upload-title').value.trim();
  const desc = document.getElementById('upload-desc').value.trim();

  if (!currentUploadImageData) {
    alert('작품 사진을 등록해주세요.');
    return;
  }
  if (!studentId || !studentName) {
    alert('학번과 이름을 입력해주세요.');
    return;
  }
  if (!title) {
    alert('작품 제목을 입력해주세요.');
    return;
  }
  if (!desc) {
    alert('작품 내용(창작 의도 및 기법 설명)을 입력해주세요.');
    return;
  }

  // Update current user info
  saveStudentUser(studentId, studentName);

  const postData = {
    classId: classId,
    studentId: studentId,
    studentName: studentName,
    title: title,
    description: desc,
    imageUrl: currentUploadImageData
  };

  const submitBtn = document.getElementById('upload-submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerText = '업로드 중...';

  try {
    await createPost(postData);
    closeUploadModal();
    showToast('작품이 성공적으로 등록되었습니다! 🎉', 'success');
    state.currentClassId = classId;
    render();
  } catch (err) {
    alert('업로드 중 오류가 발생했습니다: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = '작품 등록하기';
  }
}

// ==========================================
// Artwork Detail Modal Logic
// ==========================================
let activeDetailPostId = null;

function openDetailModal(postId) {
  const post = state.posts.find(p => p.id === postId);
  if (!post) return;

  activeDetailPostId = postId;
  const modal = document.getElementById('detail-modal');
  if (!modal) return;

  const className = state.classes.find(c => c.id === post.classId)?.name || post.classId;

  document.getElementById('detail-image').src = post.imageUrl;
  document.getElementById('detail-badge-class').innerText = className;
  document.getElementById('detail-student-info').innerText = `${post.studentId ? post.studentId + ' ' : ''}${post.studentName}`;
  document.getElementById('detail-title').innerText = post.title;
  document.getElementById('detail-desc').innerText = post.description || '(작품 설명 없음)';
  document.getElementById('detail-likes-count').innerText = post.likes || 0;

  renderDetailComments(post);

  modal.classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('detail-modal')?.classList.add('hidden');
  activeDetailPostId = null;
}

function renderDetailComments(post) {
  const listEl = document.getElementById('detail-comments-list');
  if (!listEl) return;

  const comments = post.comments || [];
  if (comments.length === 0) {
    listEl.innerHTML = `<p class="text-xs text-slate-400 py-3">첫 번째 친구 응원 한마디를 남겨보세요!</p>`;
    return;
  }

  listEl.innerHTML = comments.map(c => `
    <div class="bg-slate-50 rounded-xl p-2.5 text-xs border border-slate-100">
      <div class="flex items-center justify-between font-semibold text-slate-800 mb-1">
        <span>${c.studentName || '동료 학생'}</span>
        <span class="text-[10px] text-slate-400 font-normal">${c.createdAt ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
      </div>
      <div class="text-slate-600 leading-relaxed">${c.content}</div>
    </div>
  `).join('');
}

async function handleDetailAddComment() {
  if (!activeDetailPostId) return;
  const input = document.getElementById('detail-comment-input');
  const text = input.value.trim();
  if (!text) return;

  await addComment(activeDetailPostId, text);
  input.value = '';

  const post = state.posts.find(p => p.id === activeDetailPostId);
  if (post) renderDetailComments(post);
}

// ==========================================
// Admin Mode Auth & Settings
// ==========================================
function toggleAdminMode() {
  if (state.isAdmin) {
    state.isAdmin = false;
    showToast('교사 관리자 모드를 종료했습니다.', 'info');
    render();
  } else {
    promptAdminLogin();
  }
}

function promptAdminLogin() {
  const entered = prompt('교사 관리자 비밀번호를 입력하세요 (기본 비밀번호: 1234):');
  if (entered === null) return;
  if (entered === state.adminPin) {
    state.isAdmin = true;
    showToast('교사 관리자 모드로 로그인되었습니다! 👑', 'success');
    render();
  } else {
    alert('비밀번호가 일치하지 않습니다.');
  }
}

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  document.getElementById('settings-gemini-key').value = state.geminiApiKey || '';
  document.getElementById('settings-admin-pin').value = state.adminPin || '1234';
  document.getElementById('settings-style-select').value = state.seTeukStyle || 'balanced';
  modal.classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal')?.classList.add('hidden');
}

function handleSaveSettings(e) {
  if (e) e.preventDefault();
  const keyVal = document.getElementById('settings-gemini-key').value.trim();
  const pinVal = document.getElementById('settings-admin-pin').value.trim();
  const styleVal = document.getElementById('settings-style-select').value;

  state.geminiApiKey = keyVal;
  state.adminPin = pinVal || '1234';
  state.seTeukStyle = styleVal;

  localStorage.setItem('artboard_gemini_key', keyVal);
  localStorage.setItem('artboard_admin_pin', state.adminPin);

  closeSettingsModal();
  showToast('설정이 저장되었습니다!', 'success');
}

// ==========================================
// Toast Notifications
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600' : type === 'warning' ? 'bg-amber-600' : 'bg-slate-800';
  toast.className = `${bg} text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg transition-all transform duration-300 opacity-0 translate-y-2 flex items-center gap-2`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'warning' ? '⚠️' : 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Setup Event Listeners
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('artwork-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderWall();
    });
  }

  // File dropzone
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('upload-image-input');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageFileSelect(e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-indigo-500', 'bg-indigo-50/50');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageFileSelect(e.dataTransfer.files[0]);
      }
    });
  }
}
