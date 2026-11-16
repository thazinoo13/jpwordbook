// Custom UI Dialog Alert / Confirm Helper
function showNotification(message) {
    const backdrop = document.getElementById('modal-backdrop');
    document.getElementById('modal-title').textContent = "お知らせ";
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-cancel').style.display = 'none';
    backdrop.classList.remove('hidden');

    document.getElementById('modal-confirm').onclick = () => {
        backdrop.classList.add('hidden');
    };
}

function showConfirm(title, message, onConfirm) {
    const backdrop = document.getElementById('modal-backdrop');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-cancel').style.display = 'inline-block';
    backdrop.classList.remove('hidden');

    const cleanUp = () => backdrop.classList.add('hidden');

    document.getElementById('modal-confirm').onclick = () => {
        cleanUp();
        onConfirm();
    };
    document.getElementById('modal-cancel').onclick = () => {
        cleanUp();
    };
}

let tokenizer = null;
let extractedItems = []; 
let selectedLangCode = "";
const inputText = document.getElementById('input-text');
const analyzeBtn = document.getElementById('analyze-btn');
const languageInput = document.getElementById('languageInput');
const errorMsg = document.getElementById('errorMsg');

// ==========================================
// File Path Managers (Memo & Quiz သီးခြားစီ ခွဲခြားခြင်း)
// ==========================================
const initialConfig = JSON.parse(localStorage.getItem("github_config") || "{}");

// 1. Memo / Wordbook အတွက် Settings ထဲက Path ကို သုံးမည် (Default: wordbook.md)
let memoActiveFile = initialConfig.path || "wordbook.md";

// 2. Quiz အတွက် Dropdown မှ ရွေးချယ်သော Path ကို သီးခြားသုံးမည်
let quizActiveFile = localStorage.getItem("current_quiz_file") || memoActiveFile;

// Sidebar Navigation Tab Switcher
window.switchTab = function(tabName, btnElement) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const activePanel = document.getElementById('tab-' + tabName);
    if (activePanel) activePanel.classList.add('active');
    if (btnElement) btnElement.classList.add('active');

    const titles = {
        'extractor': ' 日本語テキスト抽出・編集',
        'wordbook': '🕮 私の単語帳',
        'quiz': '☑ クイズ学習 (Quiz Game)',
        'settings': '⚙ GitHub & アカウント設定'
    };
    document.getElementById('view-title').textContent = titles[tabName] || '日本語語彙抽出 & 単語帳';

    if (tabName === 'wordbook') {
        renderWordTable();
    } else if (tabName === 'quiz') {
        initFileSelectors().then(() => startQuiz());
    }
};

// Storage keys ခွဲခြားခြင်း
function getMemoStorageKey() {
    return `wordbook_data_${memoActiveFile}`;
}

function getquizStorageKey() {
    return `wordbook_data_${quizActiveFile}`;
}

function updateSidebarPath() {
    const pathLabel = document.getElementById("sidebar-path-label");
    if (pathLabel) pathLabel.textContent = memoActiveFile;
}

// Markdown テーブルから単語データを抽出するヘルパー
function parseMarkdownToWords(mdText) {
    const lines = mdText.split("\n");
    const words = [];
    
    lines.forEach(line => {
        if (line.trim().startsWith("|") && !line.includes("---") && !line.includes("単語")) {
            const cols = line.split("|").map(c => c.trim()).filter(c => c !== "");
            if (cols.length >= 3) {
                words.push({
                    id: Date.now() + Math.random(),
                    word: cols[0],
                    reading: cols[1] !== '-' ? cols[1] : '',
                    meaning: cols[2],
                    addedAt: cols[3] || new Date().toISOString().split("T")[0]
                });
            }
        }
    });
    return words;
}

// GitHub からデータを取得してマージする関数
async function fetchAndMergeGitHubData(filename, storageKey) {
    const config = JSON.parse(localStorage.getItem("github_config") || "{}");
    if (!config.token || !config.repo) return;

    const url = `https://api.github.com/repos/${config.repo}/contents/${filename}`;
    const headers = { 'Authorization': `Bearer ${config.token}` };

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) return;
        const fileData = await response.json();
        
        const binaryString = atob(fileData.content);
        const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
        const decodedContent = new TextDecoder().decode(bytes);

        const githubWords = parseMarkdownToWords(decodedContent);
        if (githubWords.length === 0) return;

        let localData = JSON.parse(localStorage.getItem(storageKey) || "[]");

        let isUpdated = false;
        githubWords.forEach(ghItem => {
            const exists = localData.some(localItem => localItem.word === ghItem.word);
            if (!exists) {
                localData.push(ghItem);
                isUpdated = true;
            }
        });

        if (isUpdated) {
            localStorage.setItem(storageKey, JSON.stringify(localData));
        }
    } catch (err) {
        console.error("Failed to fetch repo files from GitHub:", err);
    }
}

// GitHub API မှ Repository ထဲရှိ .md ဖိုင်စာရင်းများကို လှမ်းထုတ်ခြင်း
async function fetchGitHubFilesList() {
    const config = JSON.parse(localStorage.getItem("github_config") || "{}");
    if (!config.repo) return [quizActiveFile];

    const url = `https://api.github.com/repos/${config.repo}/contents/`;
    const headers = {};
    if (config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
    }

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) return [quizActiveFile];
        const data = await response.json();
        
        if (!Array.isArray(data)) return [quizActiveFile];
        
        const mdFiles = data.filter(file => file.type === 'file' && file.name.endsWith('.md')).map(file => file.name);
        return mdFiles.length > 0 ? mdFiles : [quizActiveFile];
    } catch (err) {
        console.error("Failed to fetch file list:", err);
        return [quizActiveFile];
    }
}

// Initialize File Dropdown for Quiz
async function initFileSelectors() {
    const sel = document.getElementById('quiz-file-select');
    if (!sel) return;
    
    let files = await fetchGitHubFilesList();
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("wordbook_data_")) {
            const fname = key.replace("wordbook_data_", "");
            if (!files.includes(fname)) {
                files.push(fname);
            }
        }
    }
    
    if (files.length === 0) files = [quizActiveFile];

    sel.innerHTML = "";
    files.forEach(filename => {
        const opt = document.createElement("option");
        opt.value = filename;
        opt.textContent = filename;
        if (filename === quizActiveFile) opt.selected = true;
        sel.appendChild(opt);
    });
}

// Quiz File Select Change Event (Dropdown ပြောင်းလဲသည့်အခါ)
document.getElementById('quiz-file-select')?.addEventListener('change', (e) => {
    quizActiveFile = e.target.value;
    localStorage.setItem("current_quiz_file", quizActiveFile);
    startQuiz();
});

// Initialize Kuromoji
kuromoji.builder({ dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" }).build((err, _tokenizer) => {
    if (err) {
        console.error(err);
        document.getElementById("status-badge").textContent = "辞書読み込み失敗";
        document.getElementById("status-badge").className = "badge loading";
        return;
    }
    tokenizer = _tokenizer;
    const badge = document.getElementById("status-badge");
    badge.textContent = "辞書準備完了";
    badge.className = "badge ready";
    validateForm();
});

function containsJapanese(text){
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
    return japaneseRegex.test(text);
}

function toHiragana(katakana) {
    if (!katakana) return "";
    return katakana.replace(/[\u30a1-\u30f6]/g, match => 
        String.fromCharCode(match.charCodeAt(0) - 0x60)
    );
}

function validateForm() {
    const text = inputText.value.trim();
    
    if (text.length > 0) {
        if (!containsJapanese(text)) {
            errorMsg.style.display = 'block';
            analyzeBtn.disabled = true;
        } else {
            errorMsg.style.display = 'none';

            if (selectedLangCode && tokenizer != null) {
                analyzeBtn.disabled = false;
            } else {
                analyzeBtn.disabled = true;
            }
        }
    } else {
        errorMsg.style.display = 'none';
        analyzeBtn.disabled = true;
    }
}

async function fetchMeaning(word, lang) {
    if (lang === "en") {
        const workerUrl = `https://test1.thazinoo7632.workers.dev/?word=${encodeURIComponent(word)}`;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(workerUrl);
                if (!response.ok) throw new Error(`Server status: ${response.status}`);

                const result = await response.json();
                if (result.data && result.data.length > 0) {
                    const senses = result.data[0].senses[0].english_definitions;
                    return senses.join(", ");
                } else {
                    return "";
                }
            } catch (error) {
                console.warn(`Attempt ${attempt} failed for word "${word}":`, error);
                if (attempt === 3) return "";
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    } else if (lang === "my") {
        return "Do in future";
    }
    return "";
}

inputText.addEventListener('input', validateForm);

const STOP_WORDS = new Set([
    "もの", "こと", "ため", "よう", "の", "これ", "それ", "あれ", 
    "どこ", "どれ", "何", "やつ", "方", "時", "点", "所", "訳"
]);

let isAnalyzing = false;

analyzeBtn.addEventListener('click', async () => {
    if(isAnalyzing) return;

    const text = inputText.value.trim();
    const selectedLang = selectedLangCode;

    if (!text.trim()) return showNotification("日本語のテキストを入力してください。");
    if (!tokenizer) return showNotification("辞書の読み込み中です。しばらくお待ちください。");

    isAnalyzing = true;
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "解析中...";

    const tokens = tokenizer.tokenize(text);
    const validNounsMap = new Map();
    
    tokens.forEach(t => {
        const word = t.surface_form.trim();
        const reading = toHiragana(t.reading || word);

        const isNoun = t.pos === "名詞";
        const isNotStopWord = !STOP_WORDS.has(word);
        const isNotAlphaNum = !/^[a-zA-Z0-9_\-\s]+$/.test(word);
        const isLongEnough = word.length >= 2 || /[\u4E00-\u9FAF]/.test(word);

        if (isNoun && isNotStopWord && isNotAlphaNum && isLongEnough) {
            if (!validNounsMap.has(word)) {
                validNounsMap.set(word, {
                    word: word,
                    reading: reading,
                    meaning: "意味を検索中...",
                    selected: true
                });
            }
        }
    });

    extractedItems = Array.from(validNounsMap.values());
    renderEditorList();

    if (extractedItems.length === 0) {
        isAnalyzing = false;
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = " 形態素解析して名詞を抽出";
        return;
    }

    for (let i = 0; i < extractedItems.length; i++) {
        if (!isAnalyzing) break;

        const meaning = await fetchMeaning(extractedItems[i].word, selectedLang);
        extractedItems[i].meaning = meaning || "-";

        const meaningInputs = document.querySelectorAll(".word-row input[type='text']");
        if (meaningInputs[i]) {
            meaningInputs[i].value = extractedItems[i].meaning;
        }

        await new Promise(resolve => setTimeout(resolve, 800));
    }

    isAnalyzing = false;
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = " 形態素解析して名詞を抽出";
});

languageInput.addEventListener("input", async () => {
    const val = languageInput.value.trim();
    const options = document.querySelectorAll('#languageList option');
    
    selectedLangCode = "";
    options.forEach(opt => {
        if (opt.value === val) {
            selectedLangCode = opt.getAttribute('data-code');
        }
    });

    validateForm();

    if (!selectedLangCode || extractedItems.length === 0) return;

    for (let i = 0; i < extractedItems.length; i++) {
        extractedItems[i].meaning = "意味を検索中...";
        const meaningInputs = document.querySelectorAll(".word-row input[type='text']");
        if (meaningInputs[i]) meaningInputs[i].value = "意味を検索中...";

        const meaning = await fetchMeaning(extractedItems[i].word, selectedLangCode);
        extractedItems[i].meaning = meaning;
        if (meaningInputs[i]) meaningInputs[i].value = meaning;
    }
});

function renderEditorList() {
    const container = document.getElementById("word-editor-list");
    if (!container) return;
    container.innerHTML = "";

    if (extractedItems.length === 0) {
        container.innerHTML = "<div class='text-center py-16 text-slate-400 text-sm'>抽出された名詞がありません。</div>";
        return;
    }

    extractedItems.forEach((item) => {
        const row = document.createElement("div");
        row.className = "word-row";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.selected;
        checkbox.className = "w-4 h-4 text-rose-500 rounded border-slate-300";
        checkbox.onchange = (e) => { 
            item.selected = e.target.checked; 
            updateCount(); 
        };

        const infoDiv = document.createElement("div");
        infoDiv.className = "flex flex-col w-32 shrink-0";
        infoDiv.innerHTML = `<span class="font-bold text-slate-900 text-sm">${item.word}</span><span class="text-xs text-rose-500 font-medium">${item.reading || ''}</span>`;

        const meaningInput = document.createElement("input");
        meaningInput.type = "text";
        meaningInput.placeholder = "意味を入力...";
        meaningInput.value = item.meaning;
        meaningInput.className = "flex-1 p-2 border border-slate-200 rounded-lg text-sm outline-none bg-white";
        meaningInput.oninput = (e) => { 
            item.meaning = e.target.value; 
        };

        row.appendChild(checkbox);
        row.appendChild(infoDiv);
        row.appendChild(meaningInput);
        container.appendChild(row);
    });

    updateCount();
}

function updateCount() {
    const selectedCount = extractedItems.filter(i => i.selected).length;
    document.getElementById("count-info").textContent = `抽出数: ${selectedCount} / ${extractedItems.length} 語`;
}

document.getElementById("select-all-btn").onclick = () => { 
    extractedItems.forEach(i => i.selected = true); 
    renderEditorList();
};

document.getElementById("deselect-all-btn").onclick = () => { 
    extractedItems.forEach(i => i.selected = false); 
    renderEditorList(); 
};

// Save Button Click Event ,when we save word in memo
document.getElementById("save-btn").addEventListener("click", () => {
    const selectedItems = extractedItems.filter(i => i.selected);
    if (selectedItems.length === 0) return showNotification("保存する単語を選択してください。");

    //get setting of GitHub Path (memoActiveFile)
    const targetPath = memoActiveFile || "wordbook.md";

    // show message with Cancel and OK (Confirm)
    showConfirm(
        "保存の確認",
        `「${targetPath}」に選択した単語を保存しますか？`,
        () => {
            // it work when click OK
            const storageKey = getMemoStorageKey(); 
            const currentData = JSON.parse(localStorage.getItem(storageKey) || "[]");
            const today = new Date().toISOString().split("T")[0];

            let addedCount = 0;

            selectedItems.forEach(item => {
                const finalMeaning = (item.meaning && item.meaning !== "意味を検索中...") ? item.meaning : "-";
                const existingIndex = currentData.findIndex(d => d.word === item.word);

                if (existingIndex !== -1) {
                    if (finalMeaning !== "-" && currentData[existingIndex].meaning === "-") {
                        currentData[existingIndex].meaning = finalMeaning;
                    }
                    if (item.reading && !currentData[existingIndex].reading) {
                        currentData[existingIndex].reading = item.reading;
                    }
                } else {
                    currentData.push({
                        id: Date.now() + Math.random().toString() + addedCount,
                        word: item.word,
                        reading: item.reading || "",
                        meaning: finalMeaning,
                        addedAt: today
                    });
                    addedCount++;
                }
            });

            localStorage.setItem(storageKey, JSON.stringify(currentData));
            showNotification(`${selectedItems.length}語を単語帳に追加しました！`);
            renderWordTable();
        }
    );
});
// Memo / Wordbook Table (Settings ထဲက memoActiveFile ကို သုံးသည်)
async function renderWordTable() {
    const tbody = document.getElementById("saved-word-tbody");
    if (!tbody) return;
    
    const storageKey = getMemoStorageKey();
    await fetchAndMergeGitHubData(memoActiveFile, storageKey);

    const data = JSON.parse(localStorage.getItem(storageKey) || "[]");
    
    if (data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' class='text-center py-12 text-slate-400'>保存された単語はありません。</td></tr>";
        return;
    }

    tbody.innerHTML = "";
    data.forEach(item => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="py-3 px-4 font-bold text-slate-900">${item.word}</td>
            <td class="py-3 px-4 text-rose-500 font-medium">${item.reading || '-'}</td>
            <td class="py-3 px-4 text-slate-700">${item.meaning}</td>
            <td class="py-3 px-4 text-slate-400 text-xs">${item.addedAt}</td>
            <td class="py-3 px-4 text-right">
                <button onclick="window.deleteWord('${item.id}')" class="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-semibold rounded-lg">削除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteWord = function(id) {
    const storageKey = getMemoStorageKey();
    let data = JSON.parse(localStorage.getItem(storageKey) || "[]");
    data = data.filter(item => String(item.id) !== String(id));
    localStorage.setItem(storageKey, JSON.stringify(data));
    renderWordTable();
};

document.getElementById("clear-all-btn").onclick = () => {
    showConfirm("全削除の確認", "本当にこのファイル用の単語データをすべて削除しますか？", () => {
        const storageKey = getMemoStorageKey();
        localStorage.removeItem(storageKey);
        renderWordTable();
    });
};

// GitHub Sync Button (Memo active file သို့ ပို့မည်)
document.getElementById("github-sync-btn").addEventListener("click", async () => {
    const config = JSON.parse(localStorage.getItem("github_config") || "{}");
    if (!config.token) return showNotification("最初に「⚙ 設定」タブを開いて、Personal Access Tokenを設定してください。");

    const targetPath = memoActiveFile;
    const storageKey = getMemoStorageKey();
    const data = JSON.parse(localStorage.getItem(storageKey) || "[]");
    
    if (data.length === 0) return showNotification(`GitHubに送信する「${targetPath}」の単語データがありません。`);

    let mdContent = `# 日本語単語帳 \n\n`;
    mdContent += `* Target Path: ${targetPath}\n`;
    mdContent += `* Last Updated: ${new Date().toISOString().split("T")[0]}\n\n`;
    mdContent += `| 単語  | 読み方  | 意味  | 登録日  |\n`;
    mdContent += `| :--- | :--- | :--- | :--- |\n`;
    data.forEach(item => {
        mdContent += `| ${item.word} | ${item.reading || '-'} | ${item.meaning} | ${item.addedAt} |\n`;
    });

    const url = `https://api.github.com/repos/${config.repo}/contents/${targetPath}`;
    
    try {
        let sha = "";
        const getRes = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` } });
        if (getRes.ok) {
            const fileInfo = await getRes.json();
            sha = fileInfo.sha;
        }

        const putRes = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${config.token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `Update ${targetPath} via Japanese Vocabulary App`,
                content: btoa(unescape(encodeURIComponent(mdContent))),
                sha: sha || undefined
            })
        });

        if (putRes.ok) {
            showNotification(`GitHub (${targetPath}) への保存が成功しました！`);
        } else {
            const errData = await putRes.json();
            showNotification(`GitHubへの送信に失敗しました。原因: ${errData.message}`);
        }
    } catch (err) {
        console.error(err);
        showNotification("ネットワークエラーが発生しました。トークンとリポジトリ名を確認してください。");
    }
});

const githubConfigSaveBtn = document.getElementById("github-config-save-btn");
if (githubConfigSaveBtn) {
    githubConfigSaveBtn.onclick = () => {
        const newPath = document.getElementById("github-path").value.trim() || "wordbook.md";
        const config = {
            token: document.getElementById("github-token").value.trim(),
            repo: document.getElementById("github-repo").value.trim(),
            path: newPath
        };
        localStorage.setItem("github_config", JSON.stringify(config));
        
        memoActiveFile = newPath;
        showNotification("GitHub設定を保存しました！");
        updateSidebarPath();
        renderWordTable();
    };
}

function loadSettings() {
    const config = JSON.parse(localStorage.getItem("github_config") || "{}");
    if (config.token) document.getElementById("github-token").value = config.token;
    if (config.repo) document.getElementById("github-repo").value = config.repo;
    if (config.path) {
        document.getElementById("github-path").value = config.path;
        memoActiveFile = config.path;
    }
    updateSidebarPath();
}

let quizList = [];
let quizIndex = 0;
let quizScore = 0;

// Quiz Start Function (Quiz ဘက်အတွက် quizActiveFile ကို အသုံးပြုသည်)
async function startQuiz() {
    const storageKey = getquizStorageKey();
    await fetchAndMergeGitHubData(quizActiveFile, storageKey);

    const data = JSON.parse(localStorage.getItem(storageKey) || "[]");

    const emptyView = document.getElementById("quiz-empty-state");
    const playView = document.getElementById("quiz-play-area");

    if (data.length === 0) {
        emptyView.style.display = "block";
        playView.style.display = "none";
        return;
    }

    emptyView.style.display = "none";
    playView.style.display = "flex";

    quizList = [...data].sort(() => 0.5 - Math.random());
    quizIndex = 0;
    quizScore = 0;
    showQuizCard();
}

function showQuizCard() {
    if (quizIndex >= quizList.length) {
        showNotification(`クイズ完了！ スコア: ${quizScore} / ${quizList.length}`);
        startQuiz();
        return;
    }

    const currentWord = quizList[quizIndex];
    document.getElementById("quiz-word").textContent = currentWord.word;
    document.getElementById("quiz-meaning").textContent = `${currentWord.meaning} (${currentWord.reading || ''})`;
    document.getElementById("quiz-meaning").style.display = "none";
    document.getElementById("quiz-hint").style.display = "block";

    document.getElementById("quiz-counter").textContent = `問 ${quizIndex + 1} / ${quizList.length}`;
    document.getElementById("quiz-score").textContent = `覚えた数: ${quizScore}`;

    const progressPercent = ((quizIndex) / quizList.length) * 100;
    document.getElementById("quiz-progress-fill").style.width = `${progressPercent}%`;
}

window.toggleQuizMeaning = function() {
    const meaning = document.getElementById("quiz-meaning");
    const hint = document.getElementById("quiz-hint");
    if (meaning.style.display === "none") {
        meaning.style.display = "block";
        hint.style.display = "none";
    } else {
        meaning.style.display = "none";
        hint.style.display = "block";
    }
};

window.nextQuizCard = function(isKnown) {
    if (isKnown) quizScore++;
    quizIndex++;
    showQuizCard();
};

// Initial Calls
loadSettings();
renderWordTable();