function runLLMAnalyse() {
    if (!fid) {
        alert('请先上传PDF');
        return;
    }

    const img = document.getElementById('llmImageSelect').value;
    const note = document.getElementById('llmNoteInput').value.trim();
    const custom = document.getElementById('llmCustomPrompt').value.trim();

    if (!img && !note) {
        alert('请至少选择图片或输入表注');
        return;
    }

    const btn = document.getElementById('llmAnalyseBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ 分析中...';

    const output = document.getElementById('llmOutput');
    output.innerHTML = '<div class="text-center text-muted">⏳ 正在分析，请稍候...</div>';

    fetch('/llm/analyse', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            fid: fid,
            img: img,
            note: note,
            custom_prompt: custom
        })
    })
    .then(res => res.json())
    .then(data => {
        output.innerHTML = highlightConditions(data.result);
        renderMathContent(output);
    })
    .catch(err => {
        output.innerHTML = `<div class="text-danger">分析失败：${err.message}</div>`;
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '🔍 开始分析';
    });
}

function runExtractFromNote() {
    if (!fid) {
        alert('请先上传PDF');
        return;
    }

    const note = document.getElementById('llmNoteInput').value.trim();
    const custom = document.getElementById('llmCustomPrompt').value.trim();

    if (!note) {
        alert('请选择或输入表注内容');
        return;
    }

    const btn = document.getElementById('extractNoteBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ 提取中...';

    const output = document.getElementById('llmOutput');
    output.innerHTML = '<div class="text-center text-muted">⏳ 正在从表注提取信息...</div>';

    fetch('/llm/extract_from_note', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            note_text: note,
            custom_prompt: custom
        })
    })
    .then(res => res.json())
    .then(data => {
        output.innerHTML = highlightConditions(data.result);
        renderMathContent(output);
    })
    .catch(err => {
        output.innerHTML = `<div class="text-danger">提取失败：${err.message}</div>`;
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '📄 仅从表注提取';
    });
}

function highlightConditions(text) {
    const templateCols = [
        'Catalyst', 'Ligand', 'Solvent', 'Temperature', 'Time', 'Pressure',
        'Yield', 'ee', 'er', 'de', 'dr', 'Atmosphere', 'Reactant', 'Product',
        'Additive', 'Wavelength', 'LED', 'Molecular Sieve', 'Valence', 'Metal'
    ];

    let result = escapeHtml(text);
    
    templateCols.forEach(col => {
        const regex = new RegExp(`(${col}[^\\s,。,\\n]{0,30})`, 'gi');
        result = result.replace(regex, '<span class="badge bg-primary ms-1 me-1">$1</span>');
    });

    const numUnitRegex = /(\d+\.?\d*)\s*(℃|°C|atm|bar|psi|h|min|mL|mg|mmol|eq|nm|K\b)/gi;
    result = result.replace(numUnitRegex, '<strong class="text-success">$1$2</strong>');

    result = renderMarkdown(result);
    
    return `<div class="markdown-body" style="white-space:pre-wrap;word-break:break-word;">${result}</div>`;
}

function renderMarkdown(text) {
    let result = text;
    
    result = result.replace(/### (.+)/g, '<h3>$1</h3>');
    result = result.replace(/## (.+)/g, '<h2>$1</h2>');
    result = result.replace(/### (.+)/g, '<h3>$1</h3>');
    
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    result = result.replace(/\$([^$]+)\$/g, (match, formula) => {
        try {
            return katex.renderToString(formula.trim(), {
                throwOnError: false,
                displayMode: false
            });
        } catch (e) {
            return `<code class="text-muted">${escapeHtml(formula)}</code>`;
        }
    });
    
    result = result.replace(/\$\$([^$]+)\$\$/g, (match, formula) => {
        try {
            return `<div class="text-center">${katex.renderToString(formula.trim(), {
                throwOnError: false,
                displayMode: true
            })}</div>`;
        } catch (e) {
            return `<div class="text-center"><code class="text-muted">${escapeHtml(formula)}</code></div>`;
        }
    });
    
    result = result.replace(/\n/g, '<br>');
    
    return result;
}

function updateLLMNoteSelect() {
    const select = document.getElementById('llmNoteSelect');
    if (!select || !tables || tables.length === 0) return;

    select.innerHTML = '<option value="">-- 不选择表注 --</option>';
    tables.forEach(t => {
        const label = t.caption ? t.caption.substring(0, 30) : `表格${t.table_id}`;
        const notePreview = t.note && t.note !== '无表注' ? t.note.substring(0, 50) : '无表注';
        select.innerHTML += `<option value="${t.table_id}" data-note="${escapeHtmlAttr(t.note)}">${label} - ${notePreview}...</option>`;
    });
}

function onNoteSelectChange() {
    const select = document.getElementById('llmNoteSelect');
    const textarea = document.getElementById('llmNoteInput');
    if (!select || !textarea) return;

    const option = select.options[select.selectedIndex];
    if (option && option.value) {
        const note = option.getAttribute('data-note') || '';
        textarea.value = decodeHtmlEntities(note);
    }
}

function escapeHtmlAttr(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function decodeHtmlEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

function clearLLMOutput() {
    document.getElementById('llmOutput').innerHTML = '<div class="text-muted text-center">等待分析结果...</div>';
}

function updateLLMImageSelect() {
    const select = document.getElementById('llmImageSelect');
    if (!select || !images || images.length === 0) return;

    select.innerHTML = '<option value="">-- 不选择图片 --</option>';
    images.forEach(img => {
        select.innerHTML += `<option value="${img}">${img.substring(0, 30)}...</option>`;
    });

    select.addEventListener('change', function() {
        const preview = document.getElementById('llmSelectedImgPreview');
        if (this.value) {
            preview.innerHTML = `<img src="/img/${fid}/${this.value}" style="max-width:100%;max-height:150px;" class="img-thumbnail mt-2">`;
        } else {
            preview.innerHTML = '';
        }
    });
}

function addMessage(role, text) {
    const box = document.getElementById('chatBox');
    const div = document.createElement('div');
    div.className = role === 'user' ? 'chat-user' : 'chat-bot';
    const span = document.createElement('span');
    span.innerText = text;
    div.appendChild(span);
    box.appendChild(div);
    renderMathContent(div);
    box.scrollTop = box.scrollHeight;
}

function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    if (!fid) {
        alert('请先上传PDF');
        return;
    }

    input.value = '';
    addMessage('user', msg);

    const img = document.getElementById('llmImageSelect').value;

    fetch('/llm/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            fid: fid,
            img: img,
            prompt: msg
        })
    })
    .then(res => res.json())
    .then(data => {
        addMessage('bot', data.reply);
    })
    .catch(err => {
        addMessage('bot', '请求失败：' + err.message);
    });
}

function exportCSV() {
    if (!fid) {
        alert('请先上传PDF');
        return;
    }

    const btn = document.getElementById('exportBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ 导出中...';

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/export/generate';
    form.innerHTML = `<input type="hidden" name="fid" value="${fid}">`;
    document.body.appendChild(form);
    form.submit();

    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '📥 导出CSV';
    }, 2000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
