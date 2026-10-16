let tokenizer = null;
let extractedItems =  []; // { word: '言語', meaning: '', selected: true }

//load kuromoji.js
kuromoji.builder({dicPath:"https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/"}).build((err, _tokenizer) => {
    if(err){

        console.error(err);
        document.getElementById("status-badge").textContent = "辭書 Load မအောင်မြင်ပါ";
        return;
    }
    tokenizer = _tokenizer;
    const badge = document.getElementById("status-badge");
    badge.textContent =  "အဆင်သင့်ဖြစ်ပါပြီ";
    badge.className = "badge ready";
    document.getElementById("analyze-btn").disabled = false;

});

//search noun in the paragraph
//when click analyze button
document.getElementById("analyze-btn").addEventListener("click", () => {
  const text = document.getElementById("input-text").value;
  if (!text.trim()) return alert("ကျေးဇူးပြု၍ ဂျပန်စာ စာပိုဒ် ထည့်သွင်းပေးပါ");

  const tokens = tokenizer.tokenize(text);
  
  //extract noun and remove if repeat
  const nouns = [...new Set(tokens.filter(t => t.pos === "名詞").map(t => t.surface_form))];
  extractedItems = nouns.map(word => ({
    word: word,
    meaning: "", // အင်္ဂလိပ် အဓိပ္ပာယ် ဖြည့်သွင်းရန်
    selected: true
  }));

  renderEditorList();
  document.getElementById("extraction-section").style.display = "block";
});

// 3. ခွဲထုတ်ထားသော စကားလုံးများ နှင့် English Meaning Input Box များကို မျက်နှာပြင်ပေါ်တွင် ပြသခြင်း
// show  extract word and english meaning in the screen
function renderEditorList() {
  const container = document.getElementById("word-editor-list");
  container.innerHTML = "";

  extractedItems.forEach((item, index) => {
    // .word-row element ကို စက္ကန့်ပိုင်းအတွင်း dynamic ဖန်တီးခြင်း
    const row = document.createElement("div");
    row.className = "word-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.selected;
    checkbox.onchange = (e) => { 
      item.selected = e.target.checked; 
      updateCount(); 
    };

    const wordSpan = document.createElement("span");
    wordSpan.style.width = "120px";
    wordSpan.style.fontWeight = "bold";
    wordSpan.textContent = item.word;
    //for text box for meaning
    const meaningInput = document.createElement("input");
    meaningInput.type = "text";
    meaningInput.placeholder = "English Meaning...";
    meaningInput.value = item.meaning;
    meaningInput.oninput = (e) => { 
      item.meaning = e.target.value; 
    };

    row.appendChild(checkbox);
    row.appendChild(wordSpan);
    row.appendChild(meaningInput);
    container.appendChild(row);
  });

  updateCount();
}

function updateCount() {
  const selectedCount = extractedItems.filter(i => i.selected).length;
  document.getElementById("count-info").textContent = `ရွေးချယ်ထားသည်: ${selectedCount} / ${extractedItems.length} လုံး`;
}

// Select All / Deselect All
document.getElementById("select-all-btn").onclick = () => { 
  extractedItems.forEach(i => i.selected = true); 
  renderEditorList();
};
document.getElementById("deselect-all-btn").onclick = () => { 
  extractedItems.forEach(i => i.selected = false); 
  renderEditorList(); 
};

//save in browser local storage
document.getElementById("save-btn").addEventListener("click", () => {
  const selectedItems = extractedItems.filter(i => i.selected);
  if (selectedItems.length === 0) return alert("သိမ်းဆည်းလိုသော စကားလုံးများကို ရွေးချယ်ပါ");

  const currentData = JSON.parse(localStorage.getItem("wordbook_data") || "[]");
  const today = new Date().toISOString().split("T")[0];

  selectedItems.forEach(item => {
    //check repeat word
    const exists = currentData.some(d => d.word === item.word);
    if (!exists) {
      currentData.push({
        id: Date.now() + Math.random().toString(),
        word: item.word,
        pos: "名詞",
        meaning: item.meaning || "-",
        addedAt: today
      });
    }
  });

  localStorage.setItem("wordbook_data", JSON.stringify(currentData));
  alert(`${selectedItems.length} လုံးကို 단語帳 ထဲသို့ သိမ်းဆည်းပြီးပါပြီ!`);
  renderWordTable();
});


//show saved word with table 
function renderWordTable() {
  const tbody = document.getElementById("saved-word-tbody");
  const data = JSON.parse(localStorage.getItem("wordbook_data") || "[]");
  tbody.innerHTML = data.length ? "" : "<tr><td colspan='5' style='text-align:center;'>သိမ်းဆည်းထားသော စကားလုံး မရှိသေးပါ</td></tr>";

  data.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${item.word}</strong></td>
      <td>${item.pos}</td>
      <td>${item.meaning}</td>
      <td>${item.addedAt}</td>
      <td><button onclick="window.deleteWord('${item.id}')" class="btn-small btn-danger">削除</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// insert deleteword into Global (window) scope
window.deleteWord = function(id) {
  let data = JSON.parse(localStorage.getItem("wordbook_data") || "[]");
  // change id to string
  data = data.filter(item => String(item.id) !== String(id));
  localStorage.setItem("wordbook_data", JSON.stringify(data));
  renderWordTable();
};
//delete all data in local storage
document.getElementById("clear-all-btn").onclick = () => {
  if (confirm("Are you sure to delete all of data?")) {
    localStorage.removeItem("wordbook_data");
    renderWordTable();
  }
};




// not check



// 6. GitHub REST API မှတစ်ဆင့် wordbook.md သို့ တိုက်ရိုက် Auto-Commit ပြုလုပ်ခြင်း
document.getElementById("github-sync-btn").addEventListener("click", async () => {
  const config = JSON.parse(localStorage.getItem("github_config") || "{}");
  if (!config.token) return alert("ပထမဦးစွာ 「⚙ GitHub設定」 Button ကိုနှိပ်၍ Personal Access Token ထည့်သွင်းပေးပါ");

  const data = JSON.parse(localStorage.getItem("wordbook_data") || "[]");
  if (data.length === 0) return alert("GitHub သို့ ပို့ရန် စကားလုံးဒေတာ မရှိသေးပါ");

  // GitHub အတွက် Markdown Table Format ဖန်တီးခြင်း
  let mdContent = `# 日本語単語帳 (Japanese Wordbook)\n\n`;
  mdContent += `* Last Updated: ${new Date().toISOString().split("T")[0]}\n\n`;
  mdContent += `| 単語  | 品詞  | 意味  | 登録日  |\n`;
  mdContent += `| :--- | :--- | :--- | :--- |\n`;
  data.forEach(item => {
    mdContent += `| ${item.word} | ${item.pos} | ${item.meaning} | ${item.addedAt} |\n`;
  });

  const url = `https://api.github.com/repos/${config.repo}/contents/${config.path}`;
  
  try {
    // 既存 file ၏ SHA ကို ရယူခြင်း
    let sha = "";
    const getRes = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` } });
    if (getRes.ok) {
      const fileInfo = await getRes.json();
      sha = fileInfo.sha;
    }

    // GitHub API သို့ Direct Push ပြုလုပ်ခြင်း
    const putRes = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "Update wordbook.md via Japanese Vocabulary App",
        content: btoa(unescape(encodeURIComponent(mdContent))), // Base64 Encoding
        sha: sha || undefined
      })
    });

    if (putRes.ok) {
      alert("🎉 GitHub (wordbook.md) ထဲသို့ အလိုအလျောက် သိမ်းဆည်းခြင်း အောင်မြင်ပါသည်!");
    } else {
      const errData = await putRes.json();
      alert(`GitHub သို့ ပို့ရခက်ခဲနေပါသည်။ အကြောင်းရင်း: ${errData.message}`);
    }
  } catch (err) {
    console.error(err);
    alert("Network Error ဖြစ်ပွားနေပါသည်။ Token နှင့် Repo Name တို့ကို ပြန်လည်စစ်ဆေးပါ။");
  }
});

// 7. Modal Configuration Settings
const modal = document.getElementById("config-modal");
document.getElementById("config-btn").onclick = () => {
  const config = JSON.parse(localStorage.getItem("github_config") || "{}");
  if (config.token) document.getElementById("github-token").value = config.token;
  if (config.repo) document.getElementById("github-repo").value = config.repo;
  if (config.path) document.getElementById("github-path").value = config.path;
  modal.style.display = "flex";
};
document.getElementById("close-btn").onclick = () => { modal.style.display = "none"; };
document.getElementById("github-save-btn").onclick = () => {
  const config = {
    token: document.getElementById("github-token").value.trim(),
    repo: document.getElementById("github-repo").value.trim(),
    path: document.getElementById("github-path").value.trim()
  };
  localStorage.setItem("github_config", JSON.stringify(config));
  alert("GitHub Setting များကို သိမ်းဆည်းပြီးပါပြီ!");
  modal.style.display = "none";
};

// Initial Render
renderWordTable();