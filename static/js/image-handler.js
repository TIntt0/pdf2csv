function renderImages() {
    const list = document.getElementById('imageList');
    if (!images || images.length === 0) {
        list.innerHTML = '<div class="text-muted">未提取到图片</div>';
        return;
    }
    list.innerHTML = images.map(img => `
        <img src="/img/${fid}/${img}"
             class="img-sm"
             onclick="toggleSelectImage(this)"
             alt="图片">
    `).join('');
    updateLLMImageSelect();
}

function toggleSelectImage(el) {
    if (el.classList.contains('img-sm')) {
        el.classList.toggle('img-selected');
    }
}

function getSelectedImages() {
    const selectedThumbs = document.querySelectorAll('.img-selected');
    return Array.from(selectedThumbs).map(el => el.src.split('/').pop());
}

async function batchAnalyseImages(noteText = "", customPrompt = "") {
    const selectedImgs = getSelectedImages();
    if (selectedImgs.length === 0) {
        alert('请先选择至少一张图片');
        return;
    }

    const output = document.getElementById('llmOutput');
    output.innerHTML = '<div class="text-center text-muted">⏳ 正在批量分析图片...</div>';

    try {
        const resp = await fetch('/llm/batch_analyse', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                fid: fid,
                imgs: selectedImgs,
                note: noteText,
                custom_prompt: customPrompt
            })
        });

        const result = await resp.json();
        output.innerHTML = `<pre class="mb-0" style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(result.result)}</pre>`;
        renderMathContent(output);
        return result.result;
    } catch (e) {
        output.innerHTML = `<div class="text-danger">分析失败：${e.message}</div>`;
    }
}

function showOnlySelected() {
    const selectedThumbs = document.querySelectorAll('.img-selected');
    if (selectedThumbs.length === 0) {
        alert('请先选择图片');
        return;
    }

    const selectedImages = Array.from(selectedThumbs).map(el => el.src.split('/').pop());
    const list = document.getElementById('imageList');
    list.innerHTML = selectedImages.map(img => `
        <img src="/img/${fid}/${img}"
             class="img-large"
             alt="选中的图片">
    `).join('');
}

function showAllImages() {
    renderImages();
}

async function chatWithImage(prompt, imgName) {
    try {
        const resp = await fetch('/llm/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                fid: fid,
                prompt: prompt,
                img: imgName
            })
        });

        const result = await resp.json();
        return result.reply;
    } catch (e) {
        return '对话失败：' + e.message;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
