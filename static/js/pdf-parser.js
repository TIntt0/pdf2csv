async function startParse() {
    const file = document.getElementById('pdfFile').files[0];
    if (!file) { alert('请选择PDF'); return; }
    startTime = Date.now();
    timer = setInterval(() => {
        const sec = Math.floor((Date.now() - startTime)/1000);
        document.getElementById('timeUsed').innerText = `已用时：${sec} 秒`;
    }, 1000);

    const form = new FormData();
    form.append('pdf_file', file);
    document.getElementById('progressText').innerText = '正在解析PDF...';
    document.getElementById('progressBar').style.width = '50%';

    try {
        const res = await fetch('/upload', { method:'POST', body:form });
        data = await res.json();
        clearInterval(timer);
        document.getElementById('progressBar').style.width = '100%';
        document.getElementById('progressText').innerText = '✅ 解析完成！';

        fid = data.fid;
        tables = data.tables;
        images = data.images;
        template_cols = data.template_cols;

        document.getElementById('pdfPreviewArea').innerHTML = `<embed src="/pdf/${fid}" width="100%" height="100%">`;
        renderTableNav();
        switchTable(1);
        renderImages();
        updateLLMNoteSelect();
        renderEditTableNav();
        switchEditTable(1);

        document.getElementById('saveMapBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
    } catch(e) {
        alert('解析失败：'+e.message);
        clearInterval(timer);
    }
}
